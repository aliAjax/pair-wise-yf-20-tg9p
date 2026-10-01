import { useState } from "react";
import {
  clone,
  effectiveMs,
  formatMs,
  parseMs,
  uid,
  type Draft,
  type FiringBatch,
  type MusicCue,
  type Snapshot,
} from "../library";
import { FX_COLOR, FX_KINDS, FX_LABEL, formatPositions, parsePositions } from "./fx";

interface Props {
  clientId: string;
  title: string;
  accent: string;
  draft?: Draft;
  headId: string;
  /** 从 head 拉一份工作副本 */
  onCheckout: (clientId: string, author: string) => void;
  onChange: (clientId: string, snap: Snapshot) => void;
  onSave: (clientId: string) => void;
  saving: boolean;
}

export function WindowPanel({ clientId, title, accent, draft, headId, onCheckout, onChange, onSave, saving }: Props) {
  const [author, setAuthor] = useState(draft?.author ?? title);
  const [tab, setTab] = useState<"batches" | "cues">("batches");
  const [error, setError] = useState<string | null>(null);

  const snap = draft?.snapshot;
  const behind = draft ? draft.baseId !== headId : false;

  const update = (fn: (s: Snapshot) => void): void => {
    if (!snap) return;
    const next = clone(snap);
    fn(next);
    onChange(clientId, next);
  };

  const updateBatch = (id: string, patch: Partial<FiringBatch>): void =>
    update((s) => Object.assign(s.batches[id], patch));

  const updateCue = (id: string, patch: Partial<MusicCue>): void =>
    update((s) => Object.assign(s.cues[id], patch));

  const addBatch = (): void =>
    update((s) => {
      const id = uid("batch");
      s.batches[id] = {
        id,
        name: "新批次",
        timingMode: "cue",
        cueId: Object.keys(s.cues)[0],
        offsetMs: 0,
        fixedMs: 0,
        durationMs: 4000,
        fxKind: "roman",
        spec: "罗马烛光",
        safeDistanceM: 25,
        angleDeg: 90,
        positions: [{ x: 20, y: 12 }],
      };
    });

  const addCue = (): void =>
    update((s) => {
      const id = uid("cue");
      s.cues[id] = { id, label: "新时间点", timeMs: 0 };
    });

  const del = (kind: "batches" | "cues", id: string): void => update((s) => void delete s[kind][id]);

  return (
    <section className="panel window-panel" style={{ borderTopColor: accent }}>
      <header className="wp-head">
        <div>
          <h2 style={{ color: accent }}>{title}</h2>
          {!draft ? (
            <p className="muted">未开工</p>
          ) : (
            <p className="muted">
              编辑人：
              <input value={author} onChange={(e) => setAuthor(e.target.value)} className="author-input" />
              {" · "}基线 {draft.baseId.slice(0, 8)}
              {behind && <b className="behind"> · 基线已落后（保存将合并）</b>}
            </p>
          )}
        </div>
        <div className="wp-actions">
          {!draft && (
            <button className="secondary" onClick={() => onCheckout(clientId, author || title)}>
              接班·拉取当前版本
            </button>
          )}
          {draft && (
            <button className="primary" disabled={saving || !!error} onClick={() => onSave(clientId)}>
              {saving ? "保存中…" : "保存到编排库"}
            </button>
          )}
        </div>
      </header>

      {error && (
        <p className="error-bar" onClick={() => setError(null)}>
          {error}（点击关闭，可重试保存）
        </p>
      )}

      {draft && snap && (
        <>
          <div className="tabs">
            <button className={tab === "batches" ? "on" : ""} onClick={() => setTab("batches")}>
              点火批次（{Object.keys(snap.batches).length}）
            </button>
            <button className={tab === "cues" ? "on" : ""} onClick={() => setTab("cues")}>
              音乐时间点（{Object.keys(snap.cues).length}）
            </button>
          </div>

          {tab === "batches" && (
            <div className="batch-list">
              {Object.values(snap.batches).map((b) => {
                const eff = effectiveMs(b, snap.cues);
                return (
                  <div className="batch-card" key={b.id}>
                    <div className="bc-row">
                      <input
                        className="bc-name"
                        value={b.name}
                        onChange={(e) => updateBatch(b.id, { name: e.target.value })}
                      />
                      <i style={{ background: FX_COLOR[b.fxKind] }} />
                      <select
                        value={b.fxKind}
                        onChange={(e) => updateBatch(b.id, { fxKind: e.target.value as FiringBatch["fxKind"] })}
                      >
                        {FX_KINDS.map((k) => (
                          <option key={k} value={k}>
                            {FX_LABEL[k]}
                          </option>
                        ))}
                      </select>
                      <button className="link danger" onClick={() => del("batches", b.id)}>
                        删除
                      </button>
                    </div>
                    <div className="bc-grid">
                      <label>
                        型号/口径
                        <input value={b.spec} onChange={(e) => updateBatch(b.id, { spec: e.target.value })} />
                      </label>
                      <label>
                        安全距离(m)
                        <input
                          type="number"
                          value={b.safeDistanceM}
                          onChange={(e) => updateBatch(b.id, { safeDistanceM: Number(e.target.value) })}
                        />
                      </label>
                      <label>
                        角度(°)
                        <input
                          type="number"
                          value={b.angleDeg}
                          onChange={(e) => updateBatch(b.id, { angleDeg: Number(e.target.value) })}
                        />
                      </label>
                      <label>
                        时长
                        <input value={formatMs(b.durationMs)} readOnly className="readonly" />
                      </label>
                      <label>
                        点位 x,y; …(米)
                        <input
                          value={formatPositions(b.positions)}
                          onChange={(e) => updateBatch(b.id, { positions: parsePositions(e.target.value) })}
                        />
                      </label>
                      <label className="timing-mode">
                        点火时刻
                        <select
                          value={b.timingMode}
                          onChange={(e) =>
                            updateBatch(b.id, { timingMode: e.target.value as FiringBatch["timingMode"] })
                          }
                        >
                          <option value="cue">绑定音乐时间点</option>
                          <option value="fixed">固定时刻</option>
                        </select>
                        {b.timingMode === "cue" ? (
                          <span>
                            <select
                              value={b.cueId ?? ""}
                              onChange={(e) => updateBatch(b.id, { cueId: e.target.value })}
                            >
                              {Object.values(snap.cues).map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.label}
                                </option>
                              ))}
                            </select>
                            <TimeInput
                              label="人工偏移"
                              value={b.offsetMs}
                              onChange={(ms) => updateBatch(b.id, { offsetMs: ms })}
                            />
                          </span>
                        ) : (
                          <TimeInput
                            label="固定时间"
                            value={b.fixedMs}
                            onChange={(ms) => updateBatch(b.id, { fixedMs: ms })}
                          />
                        )}
                      </label>
                    </div>
                    <p className="eff-line">
                      {eff === null ? (
                        <span className="danger">绑定时间点缺失，无法计算点火时刻</span>
                      ) : (
                        <>
                          生效点火：<b>{formatMs(eff)}</b>
                          {b.timingMode === "cue" && <span className="muted">（音乐一变自动重算，偏移保留）</span>}
                        </>
                      )}
                    </p>
                  </div>
                );
              })}
              <button className="secondary wide" onClick={addBatch}>
                ＋ 新增点火批次
              </button>
            </div>
          )}

          {tab === "cues" && (
            <div className="cue-list">
              <p className="muted small">
                修改时间点时间后，所有绑定批次的点火时刻自动重算；批次上的人工偏移不会被覆盖。
              </p>
              {Object.values(snap.cues)
                .sort((a, b2) => a.timeMs - b2.timeMs)
                .map((c) => (
                  <div className="cue-row" key={c.id}>
                    <input
                      className="cue-label"
                      value={c.label}
                      onChange={(e) => updateCue(c.id, { label: e.target.value })}
                    />
                    <TimeInput label="时间" value={c.timeMs} onChange={(ms) => updateCue(c.id, { timeMs: ms })} />
                    <button className="link danger" onClick={() => del("cues", c.id)}>
                      删除
                    </button>
                  </div>
                ))}
              <button className="secondary wide" onClick={addCue}>
                ＋ 新增音乐时间点
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function TimeInput({ label, value, onChange }: { label: string; value: number; onChange: (ms: number) => void }) {
  const external = formatMs(value);
  const [text, setText] = useState(external);
  const [bad, setBad] = useState(false);
  const [focused, setFocused] = useState(false);
  if (!focused && !bad && text !== external) setText(external);
  return (
    <span className={`time-input ${bad ? "bad" : ""}`}>
      <em>{label}</em>
      <input
        value={text}
        size={9}
        onFocus={() => {
          setFocused(true);
          setText(external);
        }}
        onChange={(e) => {
          setText(e.target.value);
          const ms = parseMs(e.target.value);
          if (ms === null) setBad(true);
          else {
            setBad(false);
            onChange(ms);
          }
        }}
        onBlur={() => {
          setFocused(false);
          setText(external);
          setBad(false);
        }}
      />
    </span>
  );
}
