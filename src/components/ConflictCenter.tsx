import { formatMs } from "../library";
import type { ConflictSides, FiringBatch, MusicCue, PendingMerge, Segment } from "../library";
import { FX_COLOR, FX_LABEL } from "./fx";

interface Props {
  pm: PendingMerge;
  onResolve: (index: number, side: "a" | "b") => void;
}

const KIND_LABEL = { segments: "节目段落", cues: "音乐时间点", batches: "点火批次" } as const;

function describe(kind: ConflictSides<Segment | MusicCue | FiringBatch>["kind"], e: unknown): string {
  if (!e) return "∅ 删除";
  if (kind === "batches") {
    const b = e as FiringBatch;
    const when = b.timingMode === "fixed" ? formatMs(b.fixedMs) : `偏移 ${formatMs(b.offsetMs)}`;
    return `${b.name} · ${FX_LABEL[b.fxKind]} · ${b.spec} · ${when} · 角度${b.angleDeg}° · 安全${b.safeDistanceM}m · ${b.positions.length}点位`;
  }
  if (kind === "cues") {
    const c = e as MusicCue;
    return `${c.label} @ ${formatMs(c.timeMs)}`;
  }
  const s = e as Segment;
  return `${s.name} ${formatMs(s.startMs)}–${formatMs(s.endMs)}`;
}

export function ConflictCenter({ pm, onResolve }: Props) {
  const resolvedCount = pm.conflicts.filter((c) => c.resolved).length;
  return (
    <section className="panel conflict-panel">
      <header>
        <div>
          <p className="kicker">并发保存冲突 · 预演已停用</p>
          <h2>
            冲突仲裁：{pm.aAuthor}（先到 · A版） vs {pm.bAuthor}（后到 · B版）
          </h2>
          <p className="muted">
            两边未冲突的批次已自动合并；以下 {pm.conflicts.length} 处两版都已保留。
            全部选定（{resolvedCount}/{pm.conflicts.length}）后才会生成下一版。
          </p>
        </div>
        <span className={`conflict-count ${resolvedCount === pm.conflicts.length ? "done" : ""}`}>
          {resolvedCount}/{pm.conflicts.length}
        </span>
      </header>

      <div className="conflict-list">
        {pm.conflicts.map((c, i) => (
          <article key={`${c.kind}-${c.id}`} className={`conflict-row ${c.resolved ? `pick-${c.resolved}` : ""}`}>
            <div className="cr-meta">
              <span className="tag">{KIND_LABEL[c.kind]}</span>
              <b>{c.id}</b>
              {c.resolved && <span className="picked">已选 {c.resolved.toUpperCase()} 版</span>}
            </div>
            <button
              className={`side side-a ${c.resolved === "a" ? "chosen" : ""}`}
              onClick={() => onResolve(i, "a")}
            >
              <h4>A 版 · {pm.aAuthor}</h4>
              <p>{describe(c.kind, c.a)}</p>
              <span>{c.resolved === "a" ? "✓ 采用此版" : "采用 A 版"}</span>
              {c.kind === "batches" && c.a && (
                <i className="swatch" style={{ background: FX_COLOR[(c.a as FiringBatch).fxKind] }} />
              )}
            </button>
            <button
              className={`side side-b ${c.resolved === "b" ? "chosen" : ""}`}
              onClick={() => onResolve(i, "b")}
            >
              <h4>B 版 · {pm.bAuthor}</h4>
              <p>{describe(c.kind, c.b)}</p>
              <span>{c.resolved === "b" ? "✓ 采用此版" : "采用 B 版"}</span>
              {c.kind === "batches" && c.b && (
                <i className="swatch" style={{ background: FX_COLOR[(c.b as FiringBatch).fxKind] }} />
              )}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
