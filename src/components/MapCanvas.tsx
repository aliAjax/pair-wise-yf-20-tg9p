import { useRef } from 'react';
import type { Batch, FireworkModel, ID, MusicCue, Segment } from '../types';
import { effectiveTime } from '../lib/time';

type Props = {
  batches: Batch[];
  cues: MusicCue[];
  models: FireworkModel[];
  segments: Segment[];
  selectedId: ID | null;
  onSelect?: (id: ID) => void;
  onMove?: (id: ID, x: number, y: number) => void;
  height?: number;
  dimmed?: boolean;
  conflictIds?: Set<ID>;
  firedIds?: Set<ID>;
};

/** 点位平面图：可编辑（传 onMove）或只读；时间轴与点位图共用同一批次版本 */
export default function MapCanvas({
  batches,
  cues,
  models,
  segments,
  selectedId,
  onSelect,
  onMove,
  height = 260,
  dimmed = false,
  conflictIds,
  firedIds,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragId = useRef<ID | null>(null);

  const toSvg = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    return { x: Math.min(98, Math.max(2, x)), y: Math.min(98, Math.max(2, y)) };
  };

  const handleDown = (e: React.PointerEvent, id: ID) => {
    if (!onMove) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragId.current = id;
    onSelect?.(id);
  };
  const handleMove = (e: React.PointerEvent) => {
    if (!dragId.current || !onMove) return;
    const { x, y } = toSvg(e.clientX, e.clientY);
    onMove(dragId.current, x, y);
  };
  const handleUp = () => {
    dragId.current = null;
  };

  const segColor = (b: Batch) => segments.find((s) => s.id === b.segmentId)?.color ?? '#64748b';

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 100 100"
      className={`map-canvas${dimmed ? ' is-dimmed' : ''}`}
      style={{ width: '100%', height, touchAction: 'none' }}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerLeave={handleUp}
    >
      <defs>
        <pattern id="mapGrid" width="10" height="10" patternUnits="userSpaceOnUse">
          <path d="M 10 0 L 0 0 0 10" fill="none" stroke="rgba(148,163,184,0.14)" strokeWidth="0.4" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="100" height="100" fill="url(#mapGrid)" />
      <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(148,163,184,0.25)" strokeWidth="0.5" strokeDasharray="2 2" />
      <text x="2" y="6" fontSize="3.4" fill="#64748b">远景区 / 上风向</text>
      <text x="2" y="97" fontSize="3.4" fill="#64748b">近景区 / 观众侧</text>

      {batches.map((b) => {
        const model = models.find((m) => m.id === b.modelId);
        const color = segColor(b);
        const r = 2.2 + (model?.caliber ?? 30) / 40;
        const isSel = b.id === selectedId;
        const isConflict = conflictIds?.has(b.id);
        const isFired = firedIds?.has(b.id);
        return (
          <g
            key={b.id}
            transform={`translate(${b.position.x}, ${b.position.y})`}
            onPointerDown={(e) => handleDown(e, b.id)}
            onClick={() => onSelect?.(b.id)}
            style={{ cursor: onMove ? 'grab' : 'pointer' }}
          >
            {isFired && (
              <circle r={r} fill="none" stroke="#fbbf24" strokeWidth="0.8">
                <animate attributeName="r" values={`${r};${r + 5};${r}`} dur="0.9s" repeatCount="indefinite" />
                <animate attributeName="stroke-opacity" values="0.9;0;0.9" dur="0.9s" repeatCount="indefinite" />
              </circle>
            )}
            {isConflict && (
              <circle r={r + 2.2} fill="none" stroke="#dc2626" strokeWidth="0.7" strokeDasharray="1.4 1.2">
                <animate attributeName="r" values={`${r + 1.6};${r + 3};${r + 1.6}`} dur="1.4s" repeatCount="indefinite" />
              </circle>
            )}
            <circle
              r={r}
              fill={isFired ? '#fde68a' : color}
              fillOpacity={isFired ? 1 : 0.85}
              stroke={isSel ? '#ffffff' : 'rgba(15,23,42,0.6)'}
              strokeWidth={isSel ? 1.1 : 0.5}
            />
            <text
              y={r + 3.4}
              fontSize="3.2"
              textAnchor="middle"
              fill="#cbd5e1"
              style={{ pointerEvents: 'none', fontWeight: 600 }}
            >
              {b.id}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function batchTimeLabel(b: Batch, cues: MusicCue[]): string {
  return effectiveTime(b, cues).toFixed(1);
}
