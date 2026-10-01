/**
 * 整场视图模型 —— 时间轴与点位图唯一的数据来源。
 * 两个视图必须显示同一选定版本：它们都调用 buildShowView(snapshot)，
 * 不允许各自维护一份时间/点位数据。
 */
import type { Commit, FiringBatch, Id, PendingMerge, Snapshot } from "./types";
import { effectiveMs, mapValues, recomputeBindings, sortedBatches } from "./time";

export interface TimedBatch {
  batch: FiringBatch;
  startMs: number | null;
  cueLabel: string | null;
  dangling: boolean;
}

export interface ShowView {
  /** 来源版本 id（时间轴和点位图一致的保证） */
  versionId: Id;
  durationMs: number;
  segments: Snapshot["segments"];
  cues: Snapshot["cues"];
  timed: TimedBatch[];
  /** 绑定了已缺失音乐时间点的批次 */
  dangling: Id[];
  /** 安全距离重叠：两批次时间重叠且点位距离小于安全距离之和 */
  safetyHazards: { a: Id; b: Id; distanceM: number; requiredM: number }[];
  /** 同一时刻（容差 60ms）多批次点火提示 */
  collisions: Id[][];
}

function minDistance(a: FiringBatch, b: FiringBatch): number {
  let min = Infinity;
  for (const p of a.positions) {
    for (const q of b.positions) {
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d < min) min = d;
    }
  }
  return min;
}

export function buildShowView(snapshot: Snapshot, versionId: Id): ShowView {
  const { dangling } = recomputeBindings(snapshot);
  const timed: TimedBatch[] = sortedBatches(snapshot).map((batch) => {
    const startMs = effectiveMs(batch, snapshot.cues);
    const cue = batch.cueId ? snapshot.cues[batch.cueId] : undefined;
    return {
      batch,
      startMs,
      cueLabel: cue ? cue.label : null,
      dangling: startMs === null,
    };
  });

  const safetyHazards: ShowView["safetyHazards"] = [];
  const collisions: Id[][] = [];
  const live = timed.filter((t) => t.startMs !== null);
  for (let i = 0; i < live.length; i += 1) {
    for (let j = i + 1; j < live.length; j += 1) {
      const x = live[i];
      const y = live[j];
      const sx = x.startMs as number;
      const sy = y.startMs as number;
      const overlap = sx < sy + y.batch.durationMs && sy < sx + x.batch.durationMs;
      if (Math.abs(sx - sy) <= 60) {
        collisions.push([x.batch.id, y.batch.id]);
      }
      if (overlap) {
        const d = minDistance(x.batch, y.batch);
        const required = Math.max(x.batch.safeDistanceM, y.batch.safeDistanceM);
        if (d < required) safetyHazards.push({ a: x.batch.id, b: y.batch.id, distanceM: d, requiredM: required });
      }
    }
  }

  const segmentEnd = Math.max(0, ...mapValues(snapshot.segments).map((s) => s.endMs));
  const batchEnd = Math.max(0, ...live.map((t) => (t.startMs as number) + t.batch.durationMs));
  const cueEnd = Math.max(0, ...mapValues(snapshot.cues).map((c) => c.timeMs));
  return {
    versionId,
    durationMs: Math.max(segmentEnd, batchEnd, cueEnd, 60000),
    segments: snapshot.segments,
    cues: snapshot.cues,
    timed,
    dangling,
    safetyHazards,
    collisions,
  };
}

/** 挂起合并状态下的视图：以「已自动合并部分」为准，冲突两版作为灰显幽灵 */
export interface PendingView {
  partial: ShowView;
  /** 尚未入库的冲突批次（A/B 两版并列展示，但停用预演） */
  ghostBatches: { conflictIndex: number; side: "a" | "b"; view: TimedBatch }[];
  unresolvedCount: number;
}

export function buildPendingView(pm: PendingMerge): PendingView {
  const partial = buildShowView(pm.mergedSoFar, `pending:${pm.headId}`);
  const ghostBatches: PendingView["ghostBatches"] = [];
  let unresolvedCount = 0;
  pm.conflicts.forEach((c, index) => {
    if (c.kind !== "batches") {
      if (!c.resolved) unresolvedCount += 1;
      return;
    }
    if (!c.resolved) unresolvedCount += 1;
    (["a", "b"] as const).forEach((side) => {
      const batch = (side === "a" ? c.a : c.b) as FiringBatch | null;
      if (!batch) return;
      // 未选定前用 incoming 的 cue 兜底计算幽灵批次时间
      const cues = { ...pm.mergedSoFar.cues, ...pm.incoming.cues };
      const startMs = effectiveMs(batch, cues);
      ghostBatches.push({
        conflictIndex: index,
        side,
        view: { batch, startMs, cueLabel: batch.cueId ? cues[batch.cueId]?.label ?? "?" : null, dangling: startMs === null },
      });
    });
  });
  return { partial, ghostBatches, unresolvedCount };
}

/** 版本链（含合并提交），新→旧 */
export function ancestry(commits: Commit[], id: Id): Commit[] {
  const byId = new Map(commits.map((c) => [c.id, c]));
  const out: Commit[] = [];
  const seen = new Set<Id>();
  const walk = (cid: Id): void => {
    const c = byId.get(cid);
    if (!c || seen.has(cid)) return;
    seen.add(cid);
    out.push(c);
    c.parentIds.forEach(walk);
  };
  walk(id);
  return out;
}
