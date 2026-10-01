/**
 * 编排库主入口
 *
 * 把四件事接在一起：节目段落 / 点火批次 / 音乐时间点 / 整场预览。
 *
 * 写路径（saveDraft）：
 *   enqueue(先落盘 outbox) → applyEntry(纯函数三路合并) → commit(状态落盘、清条目)
 *   - 无冲突：后到窗口的批次自动并入，生成下一版；
 *   - 有冲突：两边版本都保留进 pendingMerge，不生成新版本，整场预览停用；
 *     resolveConflict 逐条选定，全部选定后才 finalize 生成合并版本。
 *
 * 音乐时间点调整：批次只存 cueId + offsetMs，视图每次从音乐时间点派生；
 *   人工偏移 offsetMs 在任何合并/重算中原样保留。
 *
 * 写盘故障：条目留在 outbox，recover() 按顺序继续补写，opId 幂等。
 */
import { allResolved, finalizeMerge, threeWayMerge } from "./merge";
import { DurableStore, loadData, type Storage } from "./storage";
import { clone, emptySnapshot, uid } from "./time";
import type {
  Commit,
  Draft,
  Id,
  OutboxEntry,
  PendingMerge,
  RepoState,
  Snapshot,
} from "./types";

const MAX_APPLIED_OPS = 500;

export function initialState(first: Commit): RepoState {
  return {
    commits: [first],
    headId: first.id,
    selectedVersionId: first.id,
    drafts: {},
    pendingMerge: null,
    appliedOps: [],
  };
}

function findCommit(state: RepoState, id: Id): Commit | undefined {
  return state.commits.find((c) => c.id === id);
}

function rememberOp(state: RepoState, opId: Id): RepoState {
  const appliedOps = [...state.appliedOps.filter((x) => x !== opId), opId].slice(-MAX_APPLIED_OPS);
  return { ...state, appliedOps };
}

/**
 * 纯函数：把一条日志条目应用到状态。无 I/O，恢复重放走同一条路径。
 * 幂等：重复 opId 原样返回当前状态。
 */
export function applyEntry(prev: RepoState, entry: OutboxEntry): RepoState {
  if (prev.appliedOps.includes(entry.opId)) return prev;
  const state = clone(prev);

  if (entry.type === "select") {
    if (entry.versionId && state.commits.some((c) => c.id === entry.versionId)) {
      state.selectedVersionId = entry.versionId;
    }
    return rememberOp(state, entry.opId);
  }

  if (entry.type === "resolve") {
    const pm = state.pendingMerge;
    if (!pm) return rememberOp(state, entry.opId);
    for (const [idxText, side] of Object.entries(entry.picks ?? {})) {
      const idx = Number(idxText);
      if (pm.conflicts[idx]) pm.conflicts[idx].resolved = side;
    }
    if (allResolved(pm.conflicts)) {
      const { snapshot } = finalizeMerge(pm.mergedSoFar, pm.conflicts);
      const version: Commit = {
        id: uid("v"),
        parentIds: [pm.headId, pm.baseId],
        snapshot,
        message: `合并：${pm.aAuthor} 与 ${pm.bAuthor} 的换班保存（仲裁 ${pm.conflicts.length} 处冲突）`,
        author: pm.bAuthor,
        createdAt: entry.createdAt,
        mergedConflictIds: pm.conflicts.map((c) => c.id),
      };
      state.commits.push(version);
      state.headId = version.id;
      state.selectedVersionId = version.id;
      // 合并完成：各窗口工作副本收敛到新版本，本地编辑标记待重新保存
      for (const d of Object.values(state.drafts)) {
        d.baseId = version.id;
        d.dirty = true;
      }
      state.pendingMerge = null;
    }
    return rememberOp(state, entry.opId);
  }

  // ---- save ----
  const incoming = entry.snapshot ?? emptySnapshot();
  const head = findCommit(state, state.headId);
  if (!head) throw new Error("仓库缺少 head 版本");
  const base = entry.baseId ? findCommit(state, entry.baseId) : head;
  const sameContent = (a?: Snapshot, b?: Snapshot): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

  // 无论是否成版，工作副本先落账
  const draft: Draft = {
    clientId: entry.clientId,
    author: entry.author,
    baseId: entry.baseId ?? state.headId,
    snapshot: clone(incoming),
    dirty: false,
  };
  state.drafts[entry.clientId] = draft;

  const isCurrent = !base || base.id === head.id;
  if (isCurrent && sameContent(head.snapshot, incoming)) {
    return rememberOp(state, entry.opId); // 无改动
  }

  const advanceDrafts = (versionId: Id, exceptClient: Id): void => {
    for (const other of Object.values(state.drafts)) {
      if (other.clientId !== exceptClient) other.baseId = versionId;
    }
  };

  if (isCurrent) {
    // 快进：基于当前 head 保存 → 直接下一版
    const version: Commit = {
      id: uid("v"),
      parentIds: [state.headId],
      snapshot: clone(incoming),
      message: entry.message ?? "保存编排",
      author: entry.author,
      createdAt: entry.createdAt,
    };
    state.commits.push(version);
    state.headId = version.id;
    state.selectedVersionId = version.id;
    state.drafts[entry.clientId].baseId = version.id;
    advanceDrafts(version.id, entry.clientId);
    return rememberOp(state, entry.opId);
  }

  // 基线落后 → 三路合并（head = A 先进库，incoming = B 后到）
  const merged = threeWayMerge(base.snapshot, head.snapshot, incoming);
  if (merged.conflicts.length === 0) {
    // 两边未冲突批次自动合并，直接成版
    const version: Commit = {
      id: uid("v"),
      parentIds: [state.headId, base.id],
      snapshot: merged.snapshot,
      message: `自动合并 ${entry.author} 的换班保存（无冲突）`,
      author: entry.author,
      createdAt: entry.createdAt,
    };
    state.commits.push(version);
    state.headId = version.id;
    state.selectedVersionId = version.id;
    state.drafts[entry.clientId].baseId = version.id;
    advanceDrafts(version.id, entry.clientId);
    return rememberOp(state, entry.opId);
  }

  // 有冲突：两版都保留，挂起合并；不生成新版本，停用预演
  const pm: PendingMerge = {
    baseId: base.id,
    headId: state.headId,
    aAuthor: head.author,
    bAuthor: entry.author,
    conflicts: merged.conflicts,
    mergedSoFar: merged.snapshot,
    incoming: clone(incoming),
    message: entry.message ?? "保存编排",
    author: entry.author,
    createdAt: entry.createdAt,
  };
  state.pendingMerge = pm;
  return rememberOp(state, entry.opId);
}

export type SaveKind = "fastforward" | "auto-merged" | "conflict";

export interface SaveOutcome {
  kind: SaveKind;
  conflictCount: number;
  pendingWrites: number;
}

export type Listener = (state: RepoState) => void;

export class ChoreographyLibrary {
  readonly store: DurableStore;
  private listeners = new Set<Listener>();

  constructor(storage: Storage, bootstrap: () => Commit) {
    const loaded = loadData(storage);
    if (loaded.state) {
      this.store = new DurableStore(storage, loaded.state, loaded.outbox);
    } else {
      const store = new DurableStore(storage, initialState(bootstrap()), []);
      store.persistStateExternal(store.state);
      this.store = store;
    }
  }

  get state(): RepoState {
    return this.store.state;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit(): void {
    for (const fn of this.listeners) fn(this.store.state);
  }

  /** 直接更新状态并尽力持久化（工作副本编辑、重置演示等） */
  replaceState(next: RepoState): void {
    this.store.persistStateExternal(next);
    this.emit();
  }

  /**
   * 保存窗口工作副本（两阶段）。
   * enqueue 或状态落盘失败都会抛出，待提交条目保留在 outbox。
   */
  saveDraft(clientId: Id, author: string, snapshot: Snapshot, baseId: Id, message?: string): SaveOutcome {
    const beforeHead = this.store.state.headId;
    const entry: OutboxEntry = {
      opId: uid("op"),
      type: "save",
      clientId,
      author,
      message,
      snapshot: clone(snapshot),
      baseId,
      createdAt: Date.now(),
      attempts: 0,
    };
    this.store.enqueue(entry); // 先落盘；失败直接抛出，状态不动
    const next = applyEntry(this.store.state, entry);
    this.store.commit(entry.opId, next); // 状态落盘失败则抛出，条目保留待补写

    const newHead = next.headId !== beforeHead ? findCommit(next, next.headId) : undefined;
    const kind: SaveKind = next.pendingMerge
      ? "conflict"
      : newHead && newHead.parentIds.length > 1
        ? "auto-merged"
        : "fastforward";
    this.emit();
    return {
      kind,
      conflictCount: next.pendingMerge?.conflicts.filter((c) => !c.resolved).length ?? 0,
      pendingWrites: this.store.pending().length,
    };
  }

  /** 冲突仲裁：选定 A/B 两版之一；最后一处选定后生成合并版本 */
  resolveConflict(index: number, side: "a" | "b"): void {
    const pm = this.store.state.pendingMerge;
    if (!pm) return;
    const entry: OutboxEntry = {
      opId: uid("op"),
      type: "resolve",
      clientId: "orchestrator",
      author: "编排员",
      picks: { [index]: side },
      createdAt: Date.now(),
      attempts: 0,
    };
    this.store.enqueue(entry);
    const next = applyEntry(this.store.state, entry);
    this.store.commit(entry.opId, next);
    this.emit();
  }

  /** 选定全场版本：时间轴与点位图同时切到同一版本 */
  selectVersion(versionId: Id): void {
    const entry: OutboxEntry = {
      opId: uid("op"),
      type: "select",
      clientId: "orchestrator",
      author: "编排员",
      versionId,
      createdAt: Date.now(),
      attempts: 0,
    };
    this.store.enqueue(entry);
    const next = applyEntry(this.store.state, entry);
    this.store.commit(entry.opId, next);
    this.emit();
  }

  /** 恢复：写盘故障 / 重启后继续补写 outbox 里的待提交条目 */
  async recover(): Promise<{ recovered: number; failed: number }> {
    const { recovered, failed } = await this.store.recover((e, prev) => applyEntry(prev, e));
    this.emit();
    return { recovered, failed: failed.length };
  }

  pendingWrites(): OutboxEntry[] {
    return this.store.pending();
  }
}
