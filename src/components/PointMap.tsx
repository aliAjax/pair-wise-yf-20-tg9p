import type { PendingView, ShowView } from "../library";
import { FX_COLOR, FX_LABEL } from "./fx";

interface Props {
  view: ShowView;
  pending?: PendingView | null;
  /** 舞台平面尺寸（米） */
  boundsM?: { w: number; h: number };
}

/**
 * 燃放点位平面图：与时间轴共用同一个 ShowView（同一选定版本）。
 * 点颜色 = 型号类别；圆 = 安全距离圈；红圈 = 安全距离 hazard；
 * 冲突两版以虚线幽灵点显示。
 */
export function PointMap({ view, pending, boundsM }: Props) {
  const all = [
    ...view.timed.map((t) => t.batch),
    ...(pending?.ghostBatches ?? []).map((g) => g.view.batch),
  ];
  const b = boundsM ?? {
    w: Math.max(60, ...all.flatMap((x) => x.positions.map((p) => p.x + 6))),
    h: Math.max(30, ...all.flatMap((x) => x.positions.map((p) => p.y + 6))),
  };

  const hazardIds = new Set(view.safetyHazards.flatMap((h) => [h.a, h.b]));
  const ghostKey = (conflictIndex: number, side: "a" | "b", i: number) =>
    `g-${conflictIndex}-${side}-${i}`;

  return (
    <div className="map-wrap">
      <svg className="point-map" viewBox={`0 0 ${b.w} ${b.h}`} role="img" aria-label="燃放点位平面图">
        <rect x={0} y={0} width={b.w} height={b.h} fill="#0b1220" />
        {/* 网格，每 10m */}
        {Array.from({ length: Math.floor(b.w / 10) + 1 }, (_, i) => (
          <line key={`v${i}`} x1={i * 10} y1={0} x2={i * 10} y2={b.h} stroke="#16233b" />
        ))}
        {Array.from({ length: Math.floor(b.h / 10) + 1 }, (_, i) => (
          <line key={`h${i}`} x1={0} y1={i * 10} x2={b.w} y2={i * 10} stroke="#16233b" />
        ))}
        <rect x={b.w / 2 - 8} y={b.h - 3} width={16} height={3} fill="#334155" />
        <text x={b.w / 2} y={b.h - 5} fill="#64748b" fontSize={1.6} textAnchor="middle">
          观众区（南）
        </text>

        {/* 已选定版本的批次点位 + 安全距离圈 */}
        {view.timed.flatMap((t) =>
          t.batch.positions.map((p, i) => {
            const color = FX_COLOR[t.batch.fxKind];
            const hazard = hazardIds.has(t.batch.id);
            return (
              <g key={`${t.batch.id}-${i}`} opacity={t.dangling ? 0.45 : 1}>
                <circle cx={p.x} cy={p.y} r={t.batch.safeDistanceM} fill={color} opacity={0.05} />
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={t.batch.safeDistanceM}
                  fill="none"
                  stroke={hazard ? "#ef4444" : color}
                  strokeWidth={0.35}
                  strokeDasharray={hazard ? "1.2 0.8" : undefined}
                />
                <circle cx={p.x} cy={p.y} r={0.9} fill={color} stroke="#fff" strokeWidth={0.25} />
              </g>
            );
          }),
        )}

        {/* 冲突 A/B 两版幽灵点（不参与预演） */}
        {pending?.ghostBatches.flatMap((g) =>
          g.view.batch.positions.map((p, i) => (
            <g key={ghostKey(g.conflictIndex, g.side, i)} opacity={0.75}>
              <circle
                cx={p.x}
                cy={p.y}
                r={g.view.batch.safeDistanceM}
                fill="none"
                stroke={g.side === "a" ? "#f59e0b" : "#38bdf8"}
                strokeWidth={0.3}
                strokeDasharray="1.5 1"
              />
              <rect x={p.x - 0.8} y={p.y - 0.8} width={1.6} height={1.6}
                fill="none" stroke={g.side === "a" ? "#f59e0b" : "#38bdf8"} strokeWidth={0.3} />
              <text x={p.x + 1.4} y={p.y + 0.6} fontSize={1.8}
                fill={g.side === "a" ? "#f59e0b" : "#38bdf8"}>
                {g.side.toUpperCase()}
              </text>
            </g>
          )),
        )}
      </svg>

      <div className="map-legend">
        {(Object.keys(FX_LABEL) as (keyof typeof FX_LABEL)[]).map((k) => (
          <span key={k}>
            <i style={{ background: FX_COLOR[k] }} />
            {FX_LABEL[k]}
          </span>
        ))}
        <span>
          <i className="legend-hazard" /> 安全距离冲突
        </span>
        {pending && (
          <span>
            <i className="legend-ghost-a" /> A版 <i className="legend-ghost-b" /> B版（待选定）
          </span>
        )}
      </div>
    </div>
  );
}
