import type { Batch, Conflict, ConflictReason } from '../types';
import { newId } from './time';

export type MergeResult = {
  batches: Batch[];
  conflicts: Conflict[];
};

/** 批次内容比较（忽略 id，比较全部可编辑字段） */
export function batchEqual(a: Batch, b: Batch): boolean {
  return (
    a.segmentId === b.segmentId &&
    a.modelId === b.modelId &&
    a.angle === b.angle &&
    a.cueId === b.cueId &&
    a.manualOffset === b.manualOffset &&
    a.manualTime === b.manualTime &&
    a.duration === b.duration &&
    a.position.x === b.position.x &&
    a.position.y === b.position.y &&
    a.note === b.note
  );
}

function changed(base: Batch | null, other: Batch | null): boolean {
  if (!base || !other) return base !== other;
  return !batchEqual(base, other);
}

/**
 * 三路合并：base（共同父版本）/ a（窗口 A 已提交）/ b（窗口 B 草稿）
 * - 仅一边改动 -> 自动采用该边
 * - 两边改动相同 -> 保留
 * - 两边改动不同 -> 冲突，保留两版候选，停用预演
 * - 一边删除、一边改动 -> 冲突（delete-modify）
 * - 两边新增同 id 且不同 -> 冲突（both-added）
 */
export function mergeBatches(base: Batch[], a: Batch[], b: Batch[]): MergeResult {
  const baseMap = new Map(base.map((x) => [x.id, x]));
  const aMap = new Map(a.map((x) => [x.id, x]));
  const bMap = new Map(b.map((x) => [x.id, x]));
  const ids = Array.from(new Set([...baseMap.keys(), ...aMap.keys(), ...bMap.keys()]));

  const batches: Batch[] = [];
  const conflicts: Conflict[] = [];

  const pushConflict = (
    batchId: string,
    reason: ConflictReason,
    o: Batch | null,
    x: Batch | null,
    y: Batch | null,
  ) => {
    conflicts.push({
      id: newId('cf'),
      batchId,
      reason,
      base: o,
      sideA: x,
      sideB: y,
      resolution: null,
    });
  };

  for (const id of ids) {
    const o = baseMap.get(id) ?? null;
    const x = aMap.get(id) ?? null;
    const y = bMap.get(id) ?? null;

    if (o && x && y) {
      const xChanged = changed(o, x);
      const yChanged = changed(o, y);
      if (!xChanged && !yChanged) batches.push(o);
      else if (xChanged && !yChanged) batches.push(x);
      else if (!xChanged && yChanged) batches.push(y);
      else if (batchEqual(x, y)) batches.push(x);
      else pushConflict(id, 'both-modified', o, x, y);
    } else if (!o && x && y) {
      if (batchEqual(x, y)) batches.push(x);
      else pushConflict(id, 'both-added', null, x, y);
    } else if (o && !x && y) {
      // A 删除，B 保留
      if (!changed(o, y)) continue; // B 未改动 -> 删除生效
      pushConflict(id, 'delete-modify', o, null, y);
    } else if (o && x && !y) {
      // B 删除，A 保留
      if (!changed(o, x)) continue; // A 未改动 -> 删除生效
      pushConflict(id, 'delete-modify', o, x, null);
    } else if (o && !x && !y) {
      continue; // 两边都删除
    } else if (!o && x && !y) {
      batches.push(x); // 仅 A 新增
    } else if (!o && !x && y) {
      batches.push(y); // 仅 B 新增
    }
  }

  return { batches, conflicts };
}

/** 应用冲突决议：A 版 / B 版；候选为 null 表示删除 */
export function applyResolutions(
  merged: Batch[],
  conflicts: Conflict[],
): Batch[] {
  const byId = new Map(merged.map((b) => [b.id, b]));
  for (const c of conflicts) {
    if (!c.resolution) continue;
    const chosen = c.resolution === 'A' ? c.sideA : c.sideB;
    if (chosen === null) {
      byId.delete(c.batchId);
    } else {
      byId.set(c.batchId, chosen);
    }
  }
  return Array.from(byId.values());
}
