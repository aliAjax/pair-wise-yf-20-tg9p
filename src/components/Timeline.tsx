import { formatMs } from "../library";
import type { PendingView, ShowView, TimedBatch } from "../library";
import { FX_COLOR, FX_LABEL } from "./fx";

interface Props {
  view: ShowView;
  pending?: PendingView | null;
  playheadMs?: number;
  height?: number;
}

const ROW_H = 30;
const LABEL_W = 132;

function BatchBar({ t, leftPct, widthPct, ghost, dimmed }: {
  t: TimedBatch;
  leftPct: number;
  widthPct: number;
  ghost?: "a" | "b";
  dimmed?: boolean;
}) {
  const color = FX_COLOR[t.batch.fxKind];
  return (
    <div
      className={ghost ? `tl-bar ghost ghost-${ghost}` : "tl-bar"}
      title={`${t.batch.name} · ${FX_LABEL[t.batch.fxKind]} · ${
        t.startMs === null ? "时间点缺失" : formatMs(t.startMs)
      }（人工偏移 ${formatMs(t.batch.offsetMs)}）`}
      style={{
        left: `${leftPct}%`,
        width: `${Math.max(widthPct, 0.6)}%`,
        background: ghost ? "repeating-linear-gradient(45deg, #cbd5e1, #cbd5e1 5px, #e2e8f0 5px, #e2e8f0 10px)" : color,
        opacity: dimmed ? 0.35 : 1,
        outline: t.dangling ? "2px dashed #dc2626" : undefined,
      }}
    >
      {ghost ? `${ghost.toUpperCase()} ${t.batch.name}` : t.batch.name}
    </div>
  );
}

/**
 * 时间轴：只接收 buildShowView 的结果，和点位图是同一份派生数据。
 * 有 pending 时追加两版幽灵批次（虚线灰块），但明确标识「预演停用」。
 */
export function Timeline({ view, pending, playheadMs, height = 240 }: Props) {
  const dur = view.durationMs;
  const pct = (ms: number) => (ms / dur) * 100;

  const segments = Object.values(view.segments).sort((a, b) => a.startMs - b.startMs);
  const cueList = Object.values(view.cues).sort((a, b) => a.timeMs - b.timeMs);
  const rows = view.timed;
  const ghostRows = pending?.ghostBatches.filter((g) => g.view.startMs !== null).length ?? 0;
  const playheadH = 52 + (rows.length + ghostRows) * (ROW_H + 3);

  return (
    <div className="timeline" style={{ minHeight: height }}>
      <div className="tl-ruler">
        {Array.from({ length: Math.floor(dur / 30000) + 1 }, (_, i) => (
          <span key={i} style={{ left: `${pct(i * 30000)}%` }}>
            {formatMs(i * 30000)}
          </span>
        ))}
      </div>

      <div className="tl-body">
        <div className="tl-label" style={{ width: LABEL_W }}>
          节目段落
        </div>
        <div className="tl-track">
          {segments.map((s) => (
            <div
              key={s.id}
              className="tl-seg"
              style={{ left: `${pct(s.startMs)}%`, width: `${pct(s.endMs - s.startMs)}%` }}
            >
              {s.name}
            </div>
          ))}
        </div>

        <div className="tl-label" style={{ width: LABEL_W }}>
          音乐时间点
        </div>
        <div className="tl-track tl-cues">
          {cueList.map((c) => (
            <div key={c.id} className="tl-cue" style={{ left: `${pct(c.timeMs)}%` }}>
              <b>♪</b>
              <span>
                {c.label}
                <em>{formatMs(c.timeMs)}</em>
              </span>
            </div>
          ))}
        </div>

        {rows.map((t) => (
          <div className="tl-row" key={t.batch.id}>
            <div className="tl-label" style={{ width: LABEL_W }} title={t.batch.spec}>
              <i style={{ background: FX_COLOR[t.batch.fxKind] }} />
              {t.batch.name}
            </div>
            <div className="tl-track" style={{ height: ROW_H - 6 }}>
              {t.startMs !== null && (
                <BatchBar
                  t={t}
                  leftPct={pct(t.startMs)}
                  widthPct={pct(t.batch.durationMs)}
                  dimmed={t.dangling}
                />
              )}
              {t.dangling && <span className="tl-dangling">绑定时间点缺失</span>}
            </div>
          </div>
        ))}

        {pending?.ghostBatches.map((g) =>
          g.view.startMs === null ? null : (
            <div className="tl-row ghost-row" key={`${g.conflictIndex}-${g.side}`}>
              <div className="tl-label" style={{ width: LABEL_W }}>
                <i className="ghost-i" />
                冲突 {g.conflictIndex + 1} · {g.side.toUpperCase()} 版
              </div>
              <div className="tl-track" style={{ height: ROW_H - 6 }}>
                <BatchBar t={g.view} leftPct={pct(g.view.startMs)} widthPct={pct(g.view.batch.durationMs)} ghost={g.side} />
              </div>
            </div>
          ),
        )}

        {playheadMs !== undefined && (
          <div className="tl-row">
            <div style={{ width: LABEL_W, flex: `0 0 ${LABEL_W}px` }} />
            <div className="tl-track" style={{ background: "none", height: 0 }}>
              <div className="tl-playhead" style={{ left: `${pct(playheadMs)}%`, height: playheadH, bottom: 0 }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
