import { useMemo } from 'react';
import { useStore, useSelectedVersion } from '../store';
import { detectCollisions } from '../lib/collisions';
import { effectiveTime, formatTime } from '../lib/time';
import MapCanvas from './MapCanvas';

export default function PointMap() {
  const { state, dispatch } = useStore();
  const version = useSelectedVersion();

  const collisions = useMemo(
    () => detectCollisions(version.batches, state.cues, state.models),
    [version.batches, state.cues, state.models],
  );
  const conflictIds = useMemo(() => {
    const s = new Set<string>();
    collisions.forEach((c) => {
      s.add(c.batchA);
      s.add(c.batchB);
    });
    return s;
  }, [collisions]);

  const selected = version.batches.find((b) => b.id === state.selectedBatchId) ?? null;
  const selectedModel = selected
    ? state.models.find((m) => m.id === selected.modelId)
    : null;
  const selectedSeg = selected
    ? state.segments.find((s) => s.id === selected.segmentId)
    : null;

  return (
    <div className="pointmap-wrap">
      <div className="pointmap-stage">
        <MapCanvas
          batches={version.batches}
          cues={state.cues}
          models={state.models}
          segments={state.segments}
          selectedId={state.selectedBatchId}
          onSelect={(id) => dispatch({ type: 'SELECT_BATCH', id })}
          conflictIds={conflictIds}
          height={380}
        />
      </div>

      <aside className="pointmap-side">
        <h3>点位图例</h3>
        <ul className="legend">
          {state.segments.map((s) => (
            <li key={s.id}>
              <span className="legend-swatch" style={{ background: s.color }} />
              {s.name}
            </li>
          ))}
        </ul>

        {selected ? (
          <div className="selected-info">
            <h4>选中批次 {selected.id}</h4>
            <dl>
              <div><dt>型号</dt><dd>{selectedModel?.name ?? selected.modelId}</dd></div>
              <div><dt>段落</dt><dd style={{ color: selectedSeg?.color }}>{selectedSeg?.name}</dd></div>
              <div><dt>点火时间</dt><dd>{formatTime(effectiveTime(selected, state.cues))}</dd></div>
              <div><dt>发射角度</dt><dd>{selected.angle}°</dd></div>
              <div><dt>安全距离</dt><dd>{selectedModel?.safetyDistance ?? '-'} m</dd></div>
              <div><dt>点位</dt><dd>({selected.position.x.toFixed(1)}, {selected.position.y.toFixed(1)})</dd></div>
            </dl>
          </div>
        ) : (
          <p className="empty-hint">点击点位查看批次详情。</p>
        )}

        {collisions.length > 0 && (
          <div className="collision-list">
            <h4>冲突提示（{collisions.length}）</h4>
            {collisions.map((c) => {
              const a = version.batches.find((b) => b.id === c.batchA);
              const b = version.batches.find((b) => b.id === c.batchB);
              return (
                <button
                  key={c.id}
                  className="collision-item"
                  onClick={() => dispatch({ type: 'SELECT_BATCH', id: c.batchA })}
                >
                  <span className="collision-kind">{c.kind === 'time' ? '时间过近' : '点位重合'}</span>
                  <span>
                    {a?.id} 与 {b?.id}
                    {c.kind === 'time' ? ` 相差 ${c.dt.toFixed(2)}s` : ` 距离 ${c.dist.toFixed(1)}`}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </aside>
    </div>
  );
}
