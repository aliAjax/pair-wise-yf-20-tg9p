import type { Commit } from "../library";

interface Props {
  commits: Commit[];
  headId: string;
  selectedId: string;
  onSelect: (id: string) => void;
}

/** 版本链（新→旧）。时间轴与点位图显示的版本由此选择，二者始终一致。 */
export function VersionBar({ commits, headId, selectedId, onSelect }: Props) {
  const ordered = [...commits].reverse();
  return (
    <section className="panel version-bar">
      <header>
        <div>
          <p className="kicker">版本链 · 时间轴与点位图同源</p>
          <h2>整场版本</h2>
        </div>
        <p className="muted small">
          当前 head：<b>{headId.slice(0, 10)}</b>　选定：<b>{selectedId.slice(0, 10)}</b>
        </p>
      </header>
      <div className="version-track">
        {ordered.map((c, i) => (
          <div className="v-step-wrap" key={c.id}>
            <button
              className={`v-step ${c.id === selectedId ? "selected" : ""} ${c.id === headId ? "head" : ""}`}
              onClick={() => onSelect(c.id)}
              title={c.message}
            >
              <b>{c.id.slice(0, 8)}</b>
              {c.parentIds.length > 1 && <span className="merge-flag">⛙ 合并</span>}
              <em>{c.author}</em>
              <small>{c.message}</small>
            </button>
            {i < ordered.length - 1 && <span className="v-arrow">←</span>}
          </div>
        ))}
      </div>
    </section>
  );
}
