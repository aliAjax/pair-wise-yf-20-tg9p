import { useState } from 'react';
import { useStore } from '../store';
import { newId } from '../lib/time';

const CATEGORIES = ['礼花弹', '罗马烛光', '扇形架', '冷焰火'];

export default function ModelPanel() {
  const { state, dispatch } = useStore();
  const [name, setName] = useState('');
  const [caliber, setCaliber] = useState(50);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [safety, setSafety] = useState(40);

  const add = () => {
    if (!name.trim()) return;
    dispatch({
      type: 'ADD_MODEL',
      model: { id: newId('m'), name: name.trim(), caliber: Number(caliber), category, safetyDistance: Number(safety) },
    });
    setName('');
  };

  return (
    <div className="model-panel">
      <p className="panel-note">型号清单为全库共享，批次按型号记录口径与安全距离，用于点位冲突提示。</p>
      <table className="model-table">
        <thead>
          <tr>
            <th>型号</th>
            <th>类别</th>
            <th>口径 mm</th>
            <th>安全距离 m</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {state.models.map((m) => (
            <tr key={m.id}>
              <td>
                <input
                  value={m.name}
                  onChange={(e) =>
                    dispatch({ type: 'UPDATE_MODEL', id: m.id, patch: { name: e.target.value } })
                  }
                />
              </td>
              <td>
                <select
                  value={m.category}
                  onChange={(e) =>
                    dispatch({ type: 'UPDATE_MODEL', id: m.id, patch: { category: e.target.value } })
                  }
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <input
                  type="number"
                  value={m.caliber}
                  onChange={(e) =>
                    dispatch({ type: 'UPDATE_MODEL', id: m.id, patch: { caliber: Number(e.target.value) } })
                  }
                />
              </td>
              <td>
                <input
                  type="number"
                  value={m.safetyDistance}
                  onChange={(e) =>
                    dispatch({
                      type: 'UPDATE_MODEL',
                      id: m.id,
                      patch: { safetyDistance: Number(e.target.value) },
                    })
                  }
                />
              </td>
              <td>
                <button
                  className="btn btn-ghost btn-danger-text"
                  onClick={() => dispatch({ type: 'DELETE_MODEL', id: m.id })}
                >
                  删除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="model-add">
        <input placeholder="新型号名称" value={name} onChange={(e) => setName(e.target.value)} />
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <label className="inline-field">
          <span>口径</span>
          <input type="number" value={caliber} onChange={(e) => setCaliber(Number(e.target.value))} />
        </label>
        <label className="inline-field">
          <span>安全距离</span>
          <input type="number" value={safety} onChange={(e) => setSafety(Number(e.target.value))} />
        </label>
        <button className="btn btn-primary" onClick={add}>
          添加型号
        </button>
      </div>
    </div>
  );
}
