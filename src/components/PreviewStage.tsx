import { useEffect, useRef, useState } from "react";
import type { PendingView, ShowView } from "../library";
import { formatMs } from "../library";
import { Timeline } from "./Timeline";
import { PointMap } from "./PointMap";

interface Props {
  view: ShowView;
  pending: PendingView | null;
}

/**
 * 整场预览：时间轴 + 点位图并排，消费同一个 ShowView（同一选定版本）。
 * 存在未解决冲突时，预演停用（播放按钮禁用），下方仍用幽灵数据展示两边候选。
 */
export function PreviewStage({ view, pending }: Props) {
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const raf = useRef<number | null>(null);
  const startRef = useRef(0);

  const disabled = pending !== null && pending.unresolvedCount > 0;

  useEffect(() => {
    if (!playing) return;
    startRef.current = performance.now() - t;
    const tick = (now: number): void => {
      const nt = now - startRef.current;
      if (nt >= view.durationMs) {
        setT(0);
        setPlaying(false);
        return;
      }
      setT(nt);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  // 高亮播放头处正在燃烧的批次点位
  const liveIds = new Set(
    view.timed.filter((x) => x.startMs !== null && t >= x.startMs && t <= x.startMs + x.batch.durationMs).map((x) => x.batch.id),
  );

  return (
    <section className={`panel preview ${disabled ? "preview-disabled" : ""}`}>
      <header className="preview-head">
        <div>
          <p className="kicker">整场预览 · 时间轴与点位图同一版本</p>
          <h2>
            选定版本 <code>{view.versionId.slice(0, 10)}</code>
          </h2>
        </div>
        <div className="preview-ctrl">
          <span className="clock">{formatMs(t)}</span>
          <button
            className="primary"
            disabled={disabled}
            onClick={() => {
              if (t >= view.durationMs) setT(0);
              setPlaying((p) => !p);
            }}
          >
            {playing ? "⏸ 暂停" : "▶ 预演"}
          </button>
          <button className="secondary" disabled={disabled} onClick={() => { setPlaying(false); setT(0); }}>
            ⏹ 复位
          </button>
        </div>
      </header>

      {disabled && (
        <div className="disabled-banner">
          ⛔ 预演停用：有 {pending!.unresolvedCount} 处冲突批次尚未选定（两版都已保留）。
          全部仲裁生成下一版后才能预演；时间轴/点位图中虚线 A/B 为候选批次，不参与点火。
        </div>
      )}

      {view.safetyHazards.length > 0 && (
        <div className="warn-banner">
          ⚠ 安全距离冲突 {view.safetyHazards.length} 处：
          {view.safetyHazards.slice(0, 3).map((h, i) => (
            <span key={i}>
              {" "}
              {h.a}↔{h.b}（{h.distanceM.toFixed(1)}m &lt; {h.requiredM}m）
            </span>
          ))}
        </div>
      )}
      {view.dangling.length > 0 && (
        <div className="warn-banner amber">
          ⚑ 绑定缺失：{view.dangling.join("、")} 的音乐时间点不存在，点火时刻待修复。
        </div>
      )}

      <Timeline view={view} pending={pending} playheadMs={playing || t > 0 ? t : undefined} />

      <div className={liveIds.size ? "map-stage live" : "map-stage"} data-live={liveIds.size}>
        <PointMap view={view} pending={pending} />
        {liveIds.size > 0 && <p className="live-note">● 正在点火：{liveIds.size} 个批次</p>}
      </div>
    </section>
  );
}
