import { useHeadVersion, useSelectedVersion, useStore } from '../store';
import type { Version } from '../types';

const SOURCE_LABEL: Record<Version['source'], string> = {
  init: '初始',
  'window-A': '窗口 A',
  'window-B': '窗口 B',
  'merge-resolve': '冲突选定',
  recovery: '恢复补写',
};

export default function TopBar({ onOpenPreview }: { onOpenPreview: () => void }) {
  const { state, dispatch } = useStore();
  const head = useHeadVersion();
  const selected = useSelectedVersion();
  const unresolved = head.conflicts.filter((c) => !c.resolution).length;
  const pendingCount = state.pendingWrites.filter(
    (p) => p.status === 'failed' || p.status === 'pending' || p.status === 'writing',
  ).length;
  const previewDisabled = unresolved > 0;

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <div className="brand-mark">焰</div>
        <div>
          <h1>烟花燃放脚本编排</h1>
          <p>节目段落 · 点火批次 · 音乐时间点 · 整场预览 可恢复编排库</p>
        </div>
      </div>

      <div className="topbar-actions">
        <label className="version-select">
          <span>选定版本</span>
          <select
            value={selected.id}
            onChange={(e) => dispatch({ type: 'SELECT_VERSION', id: e.target.value })}
          >
            {state.versions.map((v) => (
              <option key={v.id} value={v.id}>
                v{v.index} · {SOURCE_LABEL[v.source]}
                {v.id === head.id ? '（最新）' : ''}
              </option>
            ))}
          </select>
        </label>

        {unresolved > 0 && (
          <button
            className="btn btn-danger conflict-badge"
            onClick={() => dispatch({ type: 'SET_VIEW', view: 'conflicts' })}
            title="存在未解决的冲突批次，预览已停用"
          >
            冲突 {unresolved} 项待选定
          </button>
        )}

        {pendingCount > 0 && (
          <span className="pending-chip" title="写盘失败的待提交批次，恢复时继续补写">
            待提交 {pendingCount}
          </span>
        )}

        <button
          className="btn btn-primary"
          disabled={previewDisabled}
          onClick={onOpenPreview}
          title={previewDisabled ? '存在未解决冲突，预览已停用' : '打开整场节目预览'}
        >
          {previewDisabled ? '预览已停用' : '整场预览'}
        </button>
      </div>
    </header>
  );
}
