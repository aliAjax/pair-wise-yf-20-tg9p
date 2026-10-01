import { useMemo, useState } from 'react';
import { StoreProvider, useHeadVersion, useSelectedVersion, useStore } from './store';
import { detectCollisions } from './lib/collisions';
import TopBar from './components/TopBar';
import PendingBanner from './components/PendingBanner';
import WindowPane from './components/WindowPane';
import Timeline from './components/Timeline';
import PointMap from './components/PointMap';
import CuePanel from './components/CuePanel';
import ModelPanel from './components/ModelPanel';
import ConflictPanel from './components/ConflictPanel';
import PreviewOverlay from './components/PreviewOverlay';
import type { ViewKey } from './types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const TABS: { key: ViewKey; label: string }[] = [
  { key: 'timeline', label: '时间轴编排' },
  { key: 'map', label: '点位平面图' },
  { key: 'cues', label: '音乐时间点' },
  { key: 'models', label: '型号清单' },
  { key: 'conflicts', label: '冲突批次' },
];

function Workspace() {
  const { state, dispatch, saveWindow, addBatchToWindow, updateBatchInWindow } = useStore();
  const head = useHeadVersion();
  const selected = useSelectedVersion();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [scenarioMsg, setScenarioMsg] = useState<string | null>(null);

  const collisions = useMemo(
    () => detectCollisions(selected.batches, state.cues, state.models),
    [selected.batches, state.cues, state.models],
  );
  const unresolved = head.conflicts.filter((c) => !c.resolution).length;
  const failedCount = state.pendingWrites.filter((p) => p.status === 'failed').length;

  const flash = (msg: string) => {
    setScenarioMsg(msg);
    window.setTimeout(() => setScenarioMsg(null), 4200);
  };

  /** 场景一：两窗口并行保存，批次未冲突 → 自动合并 */
  const scenarioNoConflict = async () => {
    dispatch({ type: 'WINDOW_SYNC', key: 'A' });
    dispatch({ type: 'WINDOW_SYNC', key: 'B' });
    await sleep(60);
    addBatchToWindow('A', {
      segmentId: 'seg-verse',
      modelId: 'm-roman',
      manualTime: 56,
      position: { x: 28, y: 44 },
      cueId: null,
    });
    await sleep(60);
    addBatchToWindow('B', {
      segmentId: 'seg-bridge',
      modelId: 'm-cold',
      manualTime: 142,
      position: { x: 72, y: 62 },
      cueId: null,
    });
    await sleep(60);
    await saveWindow('A');
    await sleep(80);
    await saveWindow('B');
    dispatch({ type: 'SET_VIEW', view: 'timeline' });
    flash('场景一：窗口 A、B 并行保存，新增批次互不冲突，已自动合并为新版本。');
  };

  /** 场景二：两窗口修改同一批次 → 冲突保留两版，停用预演 */
  const scenarioConflict = async () => {
    dispatch({ type: 'WINDOW_SYNC', key: 'A' });
    dispatch({ type: 'WINDOW_SYNC', key: 'B' });
    await sleep(60);
    updateBatchInWindow('A', 'b04', { modelId: 'm-100shell', angle: 78 });
    await sleep(60);
    updateBatchInWindow('B', 'b04', { position: { x: 30, y: 30 }, duration: 6 });
    await sleep(60);
    await saveWindow('A');
    await sleep(80);
    await saveWindow('B');
    dispatch({ type: 'SET_VIEW', view: 'conflicts' });
    flash('场景二：两边都修改了批次 b04，冲突已保留 A/B 两版，整场预览停用；选定后才生成下一版。');
  };

  /** 场景三：音乐时间点变更 → 绑定批次自动重算，人工偏移保留 */
  const scenarioCue = async () => {
    const cue = state.cues.find((c) => c.id === 'cue-chorus');
    const next = cue ? Math.round((cue.time + 2) * 10) / 10 : 70;
    dispatch({ type: 'UPDATE_CUE', id: 'cue-chorus', patch: { time: next } });
    dispatch({ type: 'SET_VIEW', view: 'cues' });
    flash(`场景三：音乐时间点「副歌起」改为 ${next.toFixed(1)}s，绑定批次 b04/b05 点火时间自动重算，人工偏移保留。`);
  };

  /** 场景四：写盘失败 → 保留待提交批次，恢复时继续补写 */
  const scenarioWriteFail = async () => {
    dispatch({ type: 'SET_SIMULATE_FAIL', value: true });
    await sleep(60);
    dispatch({ type: 'WINDOW_SYNC', key: 'A' });
    await sleep(60);
    addBatchToWindow('A', {
      segmentId: 'seg-finale',
      modelId: 'm-100shell',
      manualTime: 212,
      position: { x: 56, y: 28 },
      cueId: null,
    });
    await sleep(60);
    await saveWindow('A');
    await sleep(80);
    dispatch({ type: 'SET_SIMULATE_FAIL', value: false });
    flash('场景四：写盘失败，批次已保留在待提交队列（未丢失）。点击「恢复补写」继续写入。');
  };

  return (
    <main className="app">
      <TopBar onOpenPreview={() => setPreviewOpen(true)} />
      <PendingBanner />

      <section className="metrics">
        <article>
          <small>节目段落</small>
          <strong>{state.segments.length}</strong>
        </article>
        <article>
          <small>点火批次（v{selected.index}）</small>
          <strong>{selected.batches.length}</strong>
        </article>
        <article>
          <small>冲突提示</small>
          <strong className={collisions.length ? 'num-warn' : ''}>{collisions.length}</strong>
        </article>
        <article>
          <small>待提交批次</small>
          <strong className={failedCount ? 'num-warn' : ''}>{failedCount}</strong>
        </article>
      </section>

      <section className="scenario-bar panel">
        <div className="scenario-head">
          <h2>编排演示</h2>
          <p>模拟夜场换班时两个窗口同时保存燃放脚本的完整流程。</p>
        </div>
        <div className="scenario-actions">
          <button className="btn btn-ghost" onClick={() => void scenarioNoConflict()}>
            ① 并行保存·无冲突自动合并
          </button>
          <button className="btn btn-ghost" onClick={() => void scenarioConflict()}>
            ② 并行保存·冲突保留两版
          </button>
          <button className="btn btn-ghost" onClick={() => void scenarioCue()}>
            ③ 音乐时间点变更·批次重算
          </button>
          <button className="btn btn-ghost" onClick={() => void scenarioWriteFail()}>
            ④ 写盘失败·待提交与恢复
          </button>
          <label className="sim-toggle">
            <input
              type="checkbox"
              checked={state.simulateFail}
              onChange={(e) => dispatch({ type: 'SET_SIMULATE_FAIL', value: e.target.checked })}
            />
            模拟写盘失败（手动）
          </label>
        </div>
        {scenarioMsg && <div className="scenario-msg">{scenarioMsg}</div>}
      </section>

      <section className="windows">
        <WindowPane windowKey="A" title="编排窗口 A" />
        <WindowPane windowKey="B" title="编排窗口 B" />
      </section>

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab${state.view === t.key ? ' is-active' : ''}${
              t.key === 'conflicts' && unresolved > 0 ? ' has-badge' : ''
            }`}
            onClick={() => dispatch({ type: 'SET_VIEW', view: t.key })}
          >
            {t.label}
            {t.key === 'conflicts' && unresolved > 0 && (
              <span className="tab-badge">{unresolved}</span>
            )}
          </button>
        ))}
      </nav>

      <section className="view panel">
        {state.view === 'timeline' && <Timeline />}
        {state.view === 'map' && <PointMap />}
        {state.view === 'cues' && <CuePanel />}
        {state.view === 'models' && <ModelPanel />}
        {state.view === 'conflicts' && <ConflictPanel />}
      </section>

      <footer className="footnote">
        <span>
          选定版本 v{selected.index} · 时间轴与点位图显示同一版本 · 编排库已持久化到本地，写盘失败可恢复补写
        </span>
      </footer>

      {previewOpen && <PreviewOverlay onClose={() => setPreviewOpen(false)} />}
    </main>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Workspace />
    </StoreProvider>
  );
}
