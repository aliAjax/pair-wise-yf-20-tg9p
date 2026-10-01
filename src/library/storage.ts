/**
 * 可恢复存储层
 *
 * 两阶段：
 * 1. enqueue：操作（保存/选定/版本选择）连同幂等键先写进 outbox（持久化）；
 * 2. apply：纯领域逻辑应用到内存状态，成功后标记该条已提交，再异步清出 outbox。
 *
 * 写盘失败时条目留在 outbox（attempts/lastError 留痕），
 * 下次打开 / recover() 时按顺序补写重放；opId 保证同一操作绝不重复应用。
 *
 * Storage 接口可注入：浏览器用 localStorage，测试用内存/故障注入实现。
 */
import type { OutboxEntry, RepoState } from "./types";
import { clone } from "./time";

export interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** 测试用：可随时制造写盘失败 */
export class MemoryStorage implements Storage {
  map = new Map<string, string>();
  /** 返回 true 时本次写入抛错（写盘故障） */
  fail: () => boolean = () => false;

  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    if (this.fail()) throw new Error("EIO: simulated disk write failure");
    this.map.set(key, value);
  }
}

const K_STATE = "fwx.state.v1";
const K_OUTBOX = "fwx.outbox.v1";

export interface LoadedData {
  state: RepoState | null;
  outbox: OutboxEntry[];
}

export function loadData(storage: Storage): LoadedData {
  let state: RepoState | null = null;
  let outbox: OutboxEntry[] = [];
  try {
    const raw = storage.getItem(K_STATE);
    if (raw) state = JSON.parse(raw) as RepoState;
  } catch {
    state = null;
  }
  try {
    const raw = storage.getItem(K_OUTBOX);
    if (raw) outbox = JSON.parse(raw) as OutboxEntry[];
  } catch {
    outbox = [];
  }
  return { state, outbox };
}

export class DurableStore {
  private storage: Storage;
  state: RepoState;
  outbox: OutboxEntry[] = [];
  /** 已经应用过的幂等键（进程内 + 持久化条目双重保险） */
  private applied = new Set<string>();

  constructor(storage: Storage, initial: RepoState, persisted: OutboxEntry[] = []) {
    this.storage = storage;
    this.state = initial;
    this.outbox = persisted.map((e) => clone(e));
    // 仍留在 outbox 的条目意味着此前没有走完「已提交」阶段
  }

  /** 直接持久化一份新状态（工作副本编辑等非日志操作，调用方负责异常处理） */
  persistStateExternal(next: RepoState): void {
    this.state = next;
    this.persistState();
  }

  /** 条目是否已应用（供领域层判断幂等） */
  isApplied(opId: string): boolean {
    return this.applied.has(opId);
  }

  hasPending(): boolean {
    return this.outbox.length > 0;
  }

  pending(): OutboxEntry[] {
    return clone(this.outbox);
  }

  /**
   * 第一步：把操作写进 outbox 并持久化（原子）。
   * 持久化失败则回滚内存数组并抛出——此时待提交并未保住，调用方可直接重试。
   */
  enqueue(entry: OutboxEntry): void {
    const snapshot = this.outbox;
    this.outbox = [...this.outbox, clone(entry)];
    try {
      this.persistOutbox(); // 先保证待提交落盘
    } catch (err) {
      this.outbox = snapshot; // 没写进去就不留内存残影
      throw err;
    }
  }

  /**
   * 第二步：领域层应用成功后调用。把新状态与「该条已完成」一起持久化；
   * 状态写盘失败时保留 outbox 条目，下次 recover 继续补写。
   */
  commit(opId: string, next: RepoState): void {
    try {
      // 先写盘，成功后才替换内存状态：失败时内存与磁盘一致地停在旧版本
      this.storage.setItem(K_STATE, JSON.stringify(next));
    } catch (err) {
      this.markFailure(opId, err as Error);
      throw err;
    }
    this.state = next;
    this.applied.add(opId);
    this.outbox = this.outbox.filter((e) => e.opId !== opId);
    this.persistOutbox();
  }

  /** 仅记录一次失败尝试（条目保留） */
  markFailure(opId: string, err: Error): void {
    const e = this.outbox.find((x) => x.opId === opId);
    if (e) {
      e.attempts += 1;
      e.lastError = err.message;
      try {
        this.persistOutbox();
      } catch {
        /* 连失败记录都写不进去：内存中条目仍在，本次会话可继续补写 */
      }
    }
  }

  /** 移除一条（重放时发现已经应用过） */
  discard(opId: string): void {
    this.applied.add(opId);
    this.outbox = this.outbox.filter((e) => e.opId !== opId);
    this.persistOutbox();
  }

  /**
   * 恢复：启动时或手动点击「继续补写」时调用。
   * @returns 成功补写的条目数
   */
  async recover(apply: (e: OutboxEntry, prev: RepoState) => RepoState): Promise<{ recovered: number; failed: OutboxEntry[] }> {
    let recovered = 0;
    const failed: OutboxEntry[] = [];
    // 按入队顺序逐条补写
    for (const entry of [...this.outbox]) {
      if (this.applied.has(entry.opId)) {
        this.discard(entry.opId);
        continue;
      }
      try {
        const next = apply(clone(entry), this.state);
        this.commit(entry.opId, next);
        recovered += 1;
      } catch (err) {
        this.markFailure(entry.opId, err as Error);
        failed.push(entry);
      }
    }
    return { recovered, failed };
  }

  private persistState(): void {
    this.storage.setItem(K_STATE, JSON.stringify(this.state));
  }

  private persistOutbox(): void {
    this.storage.setItem(K_OUTBOX, JSON.stringify(this.outbox));
  }
}
