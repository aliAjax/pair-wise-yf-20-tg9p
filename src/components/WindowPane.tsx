import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import type { Batch } from '../types';
import { effectiveTime, formatTime, parseTime } from '../lib/time';
import MapCanvas from './MapCanvas';

type Props = {
  windowKey: 'A' | 'B';
  title: string;
};

export default function WindowPane({ windowKey, title }: Props) {
  const { state, saveWindow, addBatchToWindow, updateBatchInWindow, removeBatchFromWindow } = useStore();
  const win = state.windows[windowKey];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(true);

  // 保持选中批次有效（同步/重置后回退到首个批次）
  useEffect(() => {
    if (!selectedId || !win.batches.some((b) => b.id === selectedId)) {
      setSelectedId(win.batches[0]?.id ?? null);
    }
  }, [win.batches, selectedId]);

  const head = state.versions.find((v) => v.id === state.headVersionId)!;
  const isStale = win.parentVersionId !== head.id;
  const saving = state.pendingWrites.some(
    (p) => p.window === windowKey && (p.status === 'writing' || p.status === 'pending'),
  );
  const lastFailed = state.pendingWrites
    .filter((p) => p.window === windowKey && p.status === 'failed')
    .pop();

  const selected = win.batches.find((b) => b.id === selectedId) ?? null;

  const sorted = useMemo(
    () =>
      [...win.batches].sort(
        (a, b) => effectiveTime(a, state.cues) - effectiveTime(b, state.cues),
      ),
    [win.batches, state.cues],
  );

  const patch = (id: string, p: Partial<Batch>) => updateBatchInWindow(windowKey, id, p);

  return (
    <section className={`window-pane window-${windowKey.toLowerCase()}`}>
      <header className="window-head">
        <div className="window-title">
          <span className={`window-dot dot-${windowKey.toLowerCase()}`} />
          <h2>{title}</h2>
          <span className="window-parent">
            基于 v{state.versions.find((v) => v.id === win.parentVersionId)?.index ?? '?'}
            {isStale && <em className="stale-tag">父版本已落后 · 保存时自动合并</em>}
          </span>
        </div>
        <div className="window-status">
          {saving ? (
            <span className="status-saving">写盘中…</span>
          ) : lastFailed ? (
            <span className="status-failed" title={lastFailed.error}>
              写盘失败 · 已保留 {lastFailed.batches.length} 项
            </span>
          ) : win.dirty ? (
            <span className="status-dirty">有改动未保存</span>
          ) : (
            <span className="status-saved">已保存</span>
          )}
        </div>
      </header>

      <div className="window-body">
        <div className="batch-list">
          {sorted.length === 0 && <p className="empty-hint">暂无批次，点击下方按钮新增。</p>}
          {sorted.map((b) => {
            const model = state.models.find((m) => m.id === b.modelId);
            const seg = state.segments.find((s) => s.id === b.segmentId);
            const t = effectiveTime(b, state.cues);
            return (
              <button
                key={b.id}
                className={`batch-row${b.id === selectedId ? ' is-selected' : ''}`}
                onClick={() => setSelectedId(b.id)}
              >
                <span className="batch-time">{formatTime(t)}</span>
                <span className="batch-model">{model?.name ?? b.modelId}</span>
                <span className="batch-seg" style={{ color: seg?.color }}>
                  {seg?.name}
                </span>
                <span className="batch-pos">
                  ({b.position.x.toFixed(0)},{b.position.y.toFixed(0)})
                </span>
              </button>
            );
          })}
        </div>

        {selected && (
          <div className="batch-editor">
            <div className="editor-head">
              <strong>批次 {selected.id}</strong>
              <button
                className="btn btn-ghost btn-danger-text"
                onClick={() => {
                  removeBatchFromWindow(windowKey, selected.id);
                  setSelectedId(null);
                }}
              >
                删除批次
              </button>
            </div>
            <div className="editor-grid">
              <label>
                <span>节目段落</span>
                <select
                  value={selected.segmentId}
                  onChange={(e) => patch(selected.id, { segmentId: e.target.value })}
                >
                  {state.segments.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>烟花型号</span>
                <select
                  value={selected.modelId}
                  onChange={(e) => patch(selected.id, { modelId: e.target.value })}
                >
                  {state.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}（{m.caliber}mm）
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>发射角度 °</span>
                <input
                  type="number"
                  min={0}
                  max={180}
                  value={selected.angle}
                  onChange={(e) => patch(selected.id, { angle: Number(e.target.value) })}
                />
              </label>
              <label>
                <span>绑定音乐时间点</span>
                <select
                  value={selected.cueId ?? ''}
                  onChange={(e) =>
                    patch(selected.id, { cueId: e.target.value || null })
                  }
                >
                  <option value="">未绑定（手动时间）</option>
                  {state.cues.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {formatTime(c.time)}
                    </option>
                  ))}
                </select>
              </label>

              {selected.cueId ? (
                <label>
                  <span>人工偏移（秒，可负）</span>
                  <input
                    type="number"
                    step={0.1}
                    value={selected.manualOffset}
                    onChange={(e) => patch(selected.id, { manualOffset: Number(e.target.value) })}
                  />
                </label>
              ) : (
                <label>
                  <span>手动点火时间 mm:ss.mmm</span>
                  <input
                    value={formatTime(selected.manualTime)}
                    onChange={(e) =>
                      patch(selected.id, { manualTime: parseTime(e.target.value) })
                    }
                  />
                </label>
              )}

              <label>
                <span>持续时间（秒）</span>
                <input
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={selected.duration}
                  onChange={(e) => patch(selected.id, { duration: Number(e.target.value) })}
                />
              </label>
              <label>
                <span>点位 X（0~100）</span>
                <input
                  type="number"
                  min={2}
                  max={98}
                  value={selected.position.x.toFixed(0)}
                  onChange={(e) =>
                    patch(selected.id, {
                      position: { ...selected.position, x: Number(e.target.value) },
                    })
                  }
                />
              </label>
              <label>
                <span>点位 Y（0~100）</span>
                <input
                  type="number"
                  min={2}
                  max={98}
                  value={selected.position.y.toFixed(0)}
                  onChange={(e) =>
                    patch(selected.id, {
                      position: { ...selected.position, y: Number(e.target.value) },
                    })
                  }
                />
              </label>
              <label className="editor-note">
                <span>备注</span>
                <input
                  value={selected.note}
                  placeholder="可选"
                  onChange={(e) => patch(selected.id, { note: e.target.value })}
                />
              </label>
            </div>
            <p className="effective-time">
              有效点火时间：
              <strong>{formatTime(effectiveTime(selected, state.cues))}</strong>
              {selected.cueId && (
                <em>
                  （时间点 {formatTime(state.cues.find((c) => c.id === selected.cueId)?.time ?? 0)} + 偏移{' '}
                  {selected.manualOffset > 0 ? '+' : ''}
                  {selected.manualOffset}s）
                </em>
              )}
            </p>
          </div>
        )}

        <div className="window-actions">
          <button
            className="btn btn-ghost"
            onClick={() => setSelectedId(addBatchToWindow(windowKey))}
          >
            + 新增批次
          </button>
          <button className="btn btn-ghost" onClick={() => setShowMap((v) => !v)}>
            {showMap ? '收起点位图' : '展开点位图'}
          </button>
          <button
            className="btn btn-primary"
            disabled={saving}
            onClick={() => void saveWindow(windowKey)}
          >
            {saving ? '保存中…' : '保存窗口'}
          </button>
        </div>

        {showMap && (
          <div className="window-map">
            <MapCanvas
              batches={win.batches}
              cues={state.cues}
              models={state.models}
              segments={state.segments}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onMove={(id, x, y) => {
                if (id === selectedId) patch(id, { position: { x, y } });
              }}
              height={220}
            />
            <p className="map-hint">可直接拖动圆点调整点位（仅影响本窗口草稿）。</p>
          </div>
        )}
      </div>
    </section>
  );
}
