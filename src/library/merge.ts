/**
 * 三路合并 —— 夜场换班双窗口并发保存的核心。
 *
 * 规则：
 * - 两边都没动的实体：保持不变；
 * - 只有一边动（增/改/删）：自动采纳该边（未冲突批次自动合并）；
 * - 两边都改（相对共同基线）且结果不同：冲突，保留 A/B 两版，交人选；
 *   未全部选定前不生成新版本、停用整场预演。
 */
import type {
  ConflictSides,
  Id,
  MusicCue,
  Segment,
  FiringBatch,
  Snapshot,
} from "./types";
import { emptySnapshot } from "./time";

type EntityKind = "segments" | "cues" | "batches";
type AnyEntity = Segment | MusicCue | FiringBatch;

function get(s: Snapshot, kind: EntityKind, id: Id): AnyEntity | null {
  return (s[kind][id] as AnyEntity | undefined) ?? null;
}

/** 深比较（实体是纯数据） */
function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
}

export interface MergeOutput {
  snapshot: Snapshot;
  conflicts: ConflictSides<AnyEntity>[];
  /** 自动合并进来的实体 id（一边改动、无冲突） */
  autoMerged: Id[];
}

/**
 * 对一类实体做三路合并。
 * @param base 两边开工时的共同快照
 * @param a    已先进库一边（head）
 * @param b    后到一边（incoming）
 */
function mergeKind(
  kind: EntityKind,
  base: Snapshot,
  a: Snapshot,
  b: Snapshot,
  out: MergeOutput,
): void {
  const ids = new Set<Id>([
    ...Object.keys(base[kind]),
    ...Object.keys(a[kind]),
    ...Object.keys(b[kind]),
  ]);
  for (const id of ids) {
    const eBase = get(base, kind, id);
    const eA = get(a, kind, id);
    const eB = get(b, kind, id);
    const changedA = !equal(eBase, eA);
    const changedB = !equal(eBase, eB);

    if (!changedA && !changedB) {
      if (eA) out.snapshot[kind][id] = eA;
      continue;
    }
    if (changedA && !changedB) {
      // A 单边改动（含删除）
      if (eA) {
        out.snapshot[kind][id] = eA;
        out.autoMerged.push(id);
      }
      continue;
    }
    if (changedB && !changedA) {
      // B 单边改动（含删除）：后到窗口的新批次自动并入
      if (eB) {
        out.snapshot[kind][id] = eB;
        out.autoMerged.push(id);
      }
      continue;
    }
    // 两边都改：结果相同也算一致；不同则冲突，两版都保留、先不放入快照
    if (equal(eA, eB)) {
      if (eA) out.snapshot[kind][id] = eA;
    } else {
      out.conflicts.push({ kind, id, base: eBase, a: eA, b: eB });
    }
  }
}

export function threeWayMerge(base: Snapshot, a: Snapshot, b: Snapshot): MergeOutput {
  const out: MergeOutput = { snapshot: emptySnapshot(), conflicts: [], autoMerged: [] };
  mergeKind("segments", base, a, b, out);
  mergeKind("cues", base, a, b, out);
  mergeKind("batches", base, a, b, out);
  return out;
}

/**
 * 全部冲突选定后，按选定结果生成下一版快照。
 * 音乐绑定批次的人工偏移（offsetMs）原样保留；
 * 若选中的音乐时间点时间有变，生效时间由视图层自动重算。
 */
export function finalizeMerge(
  mergedSoFar: Snapshot,
  conflicts: ConflictSides<AnyEntity>[],
): { snapshot: Snapshot; unresolved: number } {
  const snapshot: Snapshot = {
    segments: { ...mergedSoFar.segments },
    cues: { ...mergedSoFar.cues },
    batches: { ...mergedSoFar.batches },
  };
  let unresolved = 0;
  for (const c of conflicts) {
    if (!c.resolved) {
      unresolved += 1;
      continue;
    }
    const chosen = c.resolved === "a" ? c.a : c.b;
    if (chosen) snapshot[c.kind][c.id] = chosen;
  }
  return { snapshot, unresolved };
}

/** 冲突是否已全部选定 */
export function allResolved(conflicts: ConflictSides<AnyEntity>[]): boolean {
  return conflicts.every((c) => c.resolved !== undefined);
}
