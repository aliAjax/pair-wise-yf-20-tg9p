import { useMemo } from 'react';
import { useStore, useSelectedVersion } from '../store';
import { detectCollisions } from '../lib/collisions';
import { effectiveTime, formatTime } from '../lib/time';
import type { Batch } from '../types';

const PX_PER_SEC = 34;
const LANE_H = 46;
const RULER_H = 28;
const SEG_H = 26;

/** 贪心泳道排布：时间重叠的批次分到不同泳道 */
function assignLanes(batches: Batch[], cues: Map<string, number>): Map<string, number> {
  const sorted = [...batches].sort(
    (a, b) => (cues.get(a.id) ?? 0) - (cues.get(b.id) ?? 0) || a.id.localeCompare(b.id),
  );
  const laneEnd: number[] = [];
  const laneOf = new Map<string, number>();
  for (const b of sorted) {
    const t = cues.get(b.id) ?? 0;
    let lane = laneEnd.findIndex((end) => end <= t + 0.05);
    if (lane === -1) {
      lane = laneEnd.length;
      laneEnd.push(0);
    }
    laneEnd[lane] = t + b.duration;
    laneOf.set(b.id, lane);
  }
  return laneOf;
}

export default function Timeline() {
  const { state, dispatch } = useStore();
  const version = useSelectedVersion();
  const cues = state.cues;
  const models = state.models;
  const segments = state.segments;

  const times = useMemo(() => {
    const m = new Map<string, number>();
    version.batches.forEach((b) => m.set(b.id, effectiveTime(b, cues)));
    return m;
  }, [version.batches, cues]);

  const totalEnd = useMemo(() => {
    let end = 0;
    version.batches.forEach((b) => {
      end = Math.max(end, (times.get(b.id) ?? 0) + b.duration);
    });
    segments.forEach((s) => (end = Math.max(end, s.end)));
    return end + 4;
  }, [version.batches, times, segments]);

  const lanes = useMemo(() => assignLanes(version.batches, times), [version.batches, times]);
  const laneCount = Math.max(1, ...Array.from(lanes.values()).map((l) => l + 1));

  const collisions = useMemo(
    () => detectCollisions(version.batches, cues, models),
    [version.batches, cues, models],
  );
  const conflictIds = useMemo(() => {
    const s = new Set<string>();
    collisions.forEach((c) => {
      s.add(c.batchA);
      s.add(c.batchB);
    });
    return s;
  }, [collisions]);

  const width = totalEnd * PX_PER_SEC;
  const height = RULER_H + SEG_H + laneCount * LANE_H + 16;
  const rulerTicks: number[] = [];
  for (let t = 0; t <= totalEnd; t += 10) rulerTicks.push(t);

  const segColor = (b: Batch) => segments.find((s) => s.id === b.segmentId)?.color ?? '#64748b';
  const segName = (b: Batch) => segments.find((s) => s.id === b.segmentId)?.name ?? '';
  const modelName = (b: Batch) => models.find((m) => m.id === b.modelId)?.name ?? b.modelId;

  return (
    <div className="timeline-wrap">
      <div className="timeline-scroll">
        <div className="timeline" style={{ width, height }}>
          {/* 时间标尺 */}
          <div className="tl-ruler" style={{ height: RULER_H }}>
            {rulerTicks.map((t) => (
              <div key={t} className="tl-tick" style={{ left: t * PX_PER_SEC }}>
                <span>{formatTime(t)}</span>
              </div>
            ))}
          </div>

          {/* 节目段落带 */}
          <div className="tl-segs" style={{ top: RULER_H, height: SEG_H }}>
            {segments.map((s) => (
              <div
                key={s.id}
                className="tl-seg"
                style={{
                  left: s.start * PX_PER_SEC,
                  width: (s.end - s.start) * PX_PER_SEC,
                  background: `${s.color}22`,
                  borderColor: `${s.color}66`,
                  color: s.color,
                }}
              >
                {s.name}
              </div>
            ))}
          </div>

          {/* 批次泳道 */}
          {version.batches.map((b) => {
            const t = times.get(b.id) ?? 0;
            const lane = lanes.get(b.id) ?? 0;
            const isSel = b.id === state.selectedBatchId;
            const isConflict = conflictIds.has(b.id);
            const color = segColor(b);
            return (
              <div
                key={b.id}
                className={`tl-batch${isSel ? ' is-selected' : ''}${isConflict ? ' is-conflict' : ''}`}
                style={{
                  left: t * PX_PER_SEC,
                  width: Math.max(b.duration * PX_PER_SEC, 56),
                  top: RULER_H + SEG_H + lane * LANE_H + 6,
                  borderColor: isConflict ? '#dc2626' : color,
                  background: `${color}30`,
                }}
                onClick={() => dispatch({ type: 'SELECT_BATCH', id: b.id })}
                title={`${b.id} · ${modelName(b)} · ${segName(b)} · ${formatTime(t)}`}
              >
                <span className="tl-batch-label">
                  {isConflict ? '⚠ ' : ''}
                  {modelName(b)}
                </span>
                <span className="tl-batch-time">{formatTime(t)}</span>
              </div>
            );
          })}
        </div>
      </div>
      <p className="timeline-hint">
        时间轴与点位图均显示选定版本 v{version.index}（{version.message}）。
        {collisions.length > 0 && (
          <em className="hint-conflict"> 检测到 {collisions.length} 处时间/点位冲突提示。</em>
        )}
      </p>
    </div>
  );
}
