import { useEffect, useMemo, useRef, useState } from 'react';
import { useSelectedVersion, useStore } from '../store';
import { effectiveTime, formatTime } from '../lib/time';
import MapCanvas from './MapCanvas';

export default function PreviewOverlay({ onClose }: { onClose: () => void }) {
  const { state } = useStore();
  const version = useSelectedVersion();
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(0);

  const schedule = useMemo(
    () =>
      [...version.batches].sort(
        (a, b) => effectiveTime(a, state.cues) - effectiveTime(b, state.cues),
      ),
    [version.batches, state.cues],
  );
  const total = useMemo(() => {
    let end = 0;
    schedule.forEach((b) => {
      end = Math.max(end, effectiveTime(b, state.cues) + b.duration);
    });
    return end + 2;
  }, [schedule, state.cues]);

  useEffect(() => {
    if (!playing) return;
    const tick = () => {
      const t = (performance.now() - startRef.current) / 1000;
      if (t >= total) {
        setCurrent(total);
        setPlaying(false);
        return;
      }
      setCurrent(t);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, total]);

  const play = () => {
    if (current >= total) setCurrent(0);
    startRef.current = performance.now() - (current >= total ? 0 : current * 1000);
    setPlaying(true);
  };
  const pause = () => setPlaying(false);
  const stop = () => {
    setPlaying(false);
    setCurrent(0);
  };

  const fired = useMemo(() => {
    const s = new Set<string>();
    schedule.forEach((b) => {
      if (effectiveTime(b, state.cues) <= current) s.add(b.id);
    });
    return s;
  }, [schedule, current, state.cues]);

  const progressPct = total > 0 ? (current / total) * 100 : 0;

  return (
    <div className="preview-overlay" role="dialog" aria-modal="true">
      <div className="preview-card">
        <header className="preview-head">
          <div>
            <h2>整场节目预览</h2>
            <p>
              选定版本 v{version.index} · {version.batches.length} 个点火批次 · 时间轴与点位图同步
            </p>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>
            关闭
          </button>
        </header>

        <div className="preview-stage">
          <MapCanvas
            batches={version.batches}
            cues={state.cues}
            models={state.models}
            segments={state.segments}
            selectedId={null}
            firedIds={fired}
            height={300}
          />
        </div>

        <div className="preview-clock">{formatTime(current)}</div>

        <div className="preview-scrub">
          <div className="preview-scrub-track">
            <div className="preview-scrub-fill" style={{ width: `${progressPct}%` }} />
            {schedule.map((b) => {
              const t = effectiveTime(b, state.cues);
              return (
                <span
                  key={b.id}
                  className={`preview-cue-dot${fired.has(b.id) ? ' is-fired' : ''}`}
                  style={{ left: `${(t / total) * 100}%` }}
                  title={`${b.id} · ${formatTime(t)}`}
                />
              );
            })}
          </div>
        </div>

        <div className="preview-controls">
          {!playing ? (
            <button className="btn btn-primary" onClick={play}>
              {current >= total ? '重新播放' : '播放'}
            </button>
          ) : (
            <button className="btn btn-ghost" onClick={pause}>
              暂停
            </button>
          )}
          <button className="btn btn-ghost" onClick={stop}>
            停止
          </button>
          <input
            type="range"
            min={0}
            max={total}
            step={0.1}
            value={current}
            onChange={(e) => {
              setPlaying(false);
              setCurrent(Number(e.target.value));
            }}
            className="preview-range"
          />
        </div>

        <div className="preview-schedule">
          {schedule.map((b) => {
            const t = effectiveTime(b, state.cues);
            const model = state.models.find((m) => m.id === b.modelId);
            const seg = state.segments.find((s) => s.id === b.segmentId);
            const isFired = fired.has(b.id);
            const isNext = !isFired && t > current && t - current < 3;
            return (
              <div
                key={b.id}
                className={`preview-row${isFired ? ' is-fired' : ''}${isNext ? ' is-next' : ''}`}
              >
                <span className="preview-row-time">{formatTime(t)}</span>
                <span className="preview-row-id">{b.id}</span>
                <span className="preview-row-model">{model?.name ?? b.modelId}</span>
                <span className="preview-row-seg" style={{ color: seg?.color }}>
                  {seg?.name}
                </span>
                <span className="preview-row-status">
                  {isFired ? '已点火' : isNext ? '准备' : '等待'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
