import type { Batch, Collision, FireworkModel, MusicCue } from '../types';
import { effectiveTime } from './time';

/**
 * 冲突提示：
 * - time ：两个批次有效点火时间相差 <= 1.0s，且点位距离过近（< 12 图上单位）
 * - position ：点位几乎重合（< 4 图上单位），任何时间都提示
 */
export function detectCollisions(
  batches: Batch[],
  cues: MusicCue[],
  models: FireworkModel[],
): Collision[] {
  const out: Collision[] = [];
  for (let i = 0; i < batches.length; i++) {
    for (let j = i + 1; j < batches.length; j++) {
      const a = batches[i];
      const b = batches[j];
      const dx = a.position.x - b.position.x;
      const dy = a.position.y - b.position.y;
      const dist = Math.hypot(dx, dy);
      const ta = effectiveTime(a, cues);
      const tb = effectiveTime(b, cues);
      const dt = Math.abs(ta - tb);

      const ma = models.find((m) => m.id === a.modelId);
      const mb = models.find((m) => m.id === b.modelId);
      const safe = Math.max(ma?.safetyDistance ?? 30, mb?.safetyDistance ?? 30);
      // 图上距离按安全距离归一：安全距离越大，允许的图上间隔阈值越高
      const posThreshold = Math.min(14, 4 + safe / 20);

      if (dist < 4) {
        out.push({ id: `col-${a.id}-${b.id}-p`, batchA: a.id, batchB: b.id, kind: 'position', dt, dist });
      } else if (dt <= 1.0 && dist < posThreshold) {
        out.push({ id: `col-${a.id}-${b.id}-t`, batchA: a.id, batchB: b.id, kind: 'time', dt, dist });
      }
    }
  }
  return out;
}
