import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { effectiveTime, formatTime, newId } from '../lib/time';

export default function CuePanel() {
  const { state, dispatch } = useStore();
  const [name, setName] = useState('');
  const [time, setTime] = useState('00:00.000');

  const head = state.versions.find((v) => v.id === state.headVersionId)!;

  const boundCount = useMemo(() => {
    const m = new Map<string, number>();
    head.batches.forEach((b) => {
      if (b.cueId) m.set(b.cueId, (m.get(b.cueId) ?? 0) + 1);
    });
    return m;
  }, [head.batches]);

  const addCue = () => {
    if (!name.trim()) return;
    dispatch({
      type: 'ADD_CUE',
      cue: { id: newId('cue'), name: name.trim(), time: parseTimeLocal(time) },
    });
    setName('');
  };

  return (
    <div className="cue-panel">
      <p className="panel-note">
        音乐时间点为全库共享。修改时间点时刻后，所有绑定批次的点火时间自动重算（时刻 + 人工偏移），人工偏移保持不变。
      </p>

      <div className="cue-list">
        {state.cues.map((c) => {
          const bound = head.batches.filter((b) => b.cueId === c.id);
          return (
            <div key={c.id} className="cue-row">
              <div className="cue-main">
                <input
                  className="cue-name"
                  value={c.name}
                  onChange={(e) =>
                    dispatch({ type: 'UPDATE_CUE', id: c.id, patch: { name: e.target.value } })
                  }
                />
                <input
                  className="cue-time"
                  value={formatTime(c.time)}
                  onChange={(e) =>
                    dispatch({
                      type: 'UPDATE_CUE',
                      id: c.id,
                      patch: { time: parseTimeLocal(e.target.value) },
                    })
                  }
                />
                <span className="cue-bound">绑定 {boundCount.get(c.id) ?? 0} 批</span>
              </div>
              <div className="cue-bound-times">
                {bound.map((b) => (
                  <span key={b.id} className="cue-chip">
                    {b.id} · {formatTime(effectiveTime(b, state.cues))}
                  </span>
                ))}
              </div>
              <button
                className="btn btn-ghost btn-danger-text cue-del"
                onClick={() => dispatch({ type: 'DELETE_CUE', id: c.id })}
              >
                删除
              </button>
            </div>
          );
        })}
      </div>

      <div className="cue-add">
        <input placeholder="新时间点名称（如：鼓点 4）" value={name} onChange={(e) => setName(e.target.value)} />
        <input value={time} onChange={(e) => setTime(e.target.value)} />
        <button className="btn btn-primary" onClick={addCue}>
          添加时间点
        </button>
      </div>
    </div>
  );
}

function parseTimeLocal(raw: string): number {
  const parts = raw.split(':');
  if (parts.length === 2) {
    const v = Number(parts[0]) * 60 + Number(parts[1]);
    return Number.isFinite(v) && v >= 0 ? v : 0;
  }
  const v = Number(raw);
  return Number.isFinite(v) && v >= 0 ? v : 0;
}
