import { useMemo, useState } from "react";
import "./styles.css";
import {
  buildPendingView,
  buildShowView,
  clone,
  type RepoState,
  type Snapshot,
} from "./library";
import { useChoreographyLibrary } from "./useLibrary";
import { WindowPanel } from "./components/WindowPanel";
import { ConflictCenter } from "./components/ConflictCenter";
import { VersionBar } from "./components/VersionBar";
import { PreviewStage } from "./components/PreviewStage";

const CLIENT_A = "window-night-A";
const CLIENT_B = "window-night-B";

export default function App() {
  const { lib, state, storage, bootNotice, recover, resetDemo } = useChoreographyLibrary();
  const [toast, setToast] = useState<string | null>(null);
  const [diskFailing, setDiskFailing] = useState(false);
  const [savingClient, setSavingClient] = useState<string | null>(null);

  const selectedCommit = state.commits.find((c) => c.id === state.selectedVersionId) ?? state.commits[0];
  const view = useMemo(
    () => buildShowView(selectedCommit.snapshot, selectedCommit.id),
    [selectedCommit],
  );
  const pendingView = state.pendingMerge ? buildPendingView(state.pendingMerge) : null;
  const pendingWrites = lib.pendingWrites();

  const flash = (msg: string): void => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 4200);
  };

  const checkout = (clientId: string, author: string): void => {
    const head = state.commits.find((c) => c.id === state.headId)!;
    const next: RepoState = clone(state);
    next.drafts[clientId] = {
      clientId,
      author,
      baseId: head.id,
      snapshot: clone(head.snapshot),
      dirty: false,
    };
    lib.replaceState(next);
    flash(`${author} 已接班，副本基线 ${head.id.slice(0, 8)}`);
  };

  const editDraft = (clientId: string, snap: Snapshot): void => {
    const next = clone(state);
    const d = next.drafts[clientId];
    if (!d) return;
    d.snapshot = snap;
    d.dirty = true;
    lib.replaceState(next);
  };

  const save = (clientId: string): void => {
    const d = state.drafts[clientId];
    if (!d) return;
    setSavingClient(clientId);
    try {
      const r = lib.saveDraft(clientId, d.author, d.snapshot, d.baseId, `${d.author} 夜场保存`);
      if (r.kind === "conflict") {
        flash(`⚠ 与先到版本有 ${r.conflictCount} 处冲突：两版均保留，预演已停用，待仲裁`);
      } else if (r.kind === "auto-merged") {
        flash("✓ 无冲突批次已自动合并，生成新版本（两边批次都在）");
      } else {
        flash("✓ 已保存为下一版");
      }
    } catch (err) {
      const left = lib.pendingWrites().length;
      flash(
        left > 0
          ? `⛔ 写盘失败：待提交批次已保留（${left} 条），磁盘恢复后点「继续补写」`
          : "⛔ 待提交日志写盘失败，状态未改变，请恢复磁盘后重试",
      );
      void err;
    } finally {
      setSavingClient(null);
    }
  };

  const toggleDisk = (): void => {
    const next = !diskFailing;
    storage.failing = next;
    setDiskFailing(next);
    flash(next ? "已模拟磁盘故障：保存会写盘失败" : "磁盘已恢复，可继续补写");
  };

  const doRecover = async (): Promise<void> => {
    const r = await recover();
    flash(
      r.recovered > 0
        ? `恢复完成：补写 ${r.recovered} 个待提交批次，时间轴/点位图已切到新版本`
        : r.failed > 0
          ? `仍有 ${r.failed} 条写盘失败`
          : "没有待补写条目",
    );
  };

  // ---- 一键演练：自动造出「自动合并 + 冲突 + 音乐重算」的夜场换班局面 ----
  const demoScenario = (): void => {
    const next: RepoState = clone(state);
    const head = next.commits.find((c) => c.id === next.headId)!;
    const mk = (clientId: string, author: string, mutate: (s: Snapshot) => void): void => {
      const snap = clone(head.snapshot);
      mutate(snap);
      next.drafts[clientId] = { clientId, author, baseId: head.id, snapshot: snap, dirty: true };
    };
    mk(CLIENT_A, "夜班编排员A", (s) => {
      // A：新增一个罗马烛光批次（与 B 不冲突，应自动合并）；并改 B 点礼花弹型号（冲突项）
      s.batches.batch_demo_roman = {
        id: "batch_demo_roman",
        name: "A新增·舞台左罗马烛光",
        timingMode: "fixed",
        cueId: undefined,
        offsetMs: 0,
        fixedMs: 96000,
        durationMs: 6000,
        fxKind: "roman",
        spec: "25mm 罗马烛光 ×8",
        safeDistanceM: 25,
        angleDeg: 80,
        positions: [
          { x: 6, y: 14 },
          { x: 9, y: 14 },
        ],
      };
      s.batches.batch_shell.spec = "A改：100mm 礼花弹（更大口径）";
    });
    mk(CLIENT_B, "夜班编排员B", (s) => {
      // B：新增盆花批次（不冲突）；改同一礼花弹的角度（冲突项）；调整 Drop 时间点
      s.batches.batch_demo_cake = {
        id: "batch_demo_cake",
        name: "B新增·台口连发盆花",
        timingMode: "fixed",
        cueId: undefined,
        offsetMs: 0,
        fixedMs: 140000,
        durationMs: 5000,
        fxKind: "cake",
        spec: "30发连发盆花",
        safeDistanceM: 20,
        angleDeg: 85,
        positions: [
          { x: 26, y: 6 },
          { x: 30, y: 6 },
        ],
      };
      s.batches.batch_shell.angleDeg = 105;
      s.batches.batch_shell.offsetMs = -250; // 人工提前 250ms
      s.cues.cue_drop.timeMs = 70000; // 音乐 Drop 从 68.2s 挪到 70s → 绑定批次自动重算
    });
    next.pendingMerge = null;
    lib.replaceState(next);
    flash(
      "演练局面已铺好：先点 A 窗口「保存」，再点 B 窗口「保存」——观察自动合并、冲突两版与音乐重算",
    );
  };

  return (
    <main className="app">
      <header className="topbar">
        <div>
          <p className="kicker">hxyfront-62008 · 可恢复编排库（节目段落 / 点火批次 / 音乐时间点 / 整场预览）</p>
          <h1>烟花燃放脚本 · 夜场换班工作台</h1>
          <p className="muted">
            两个窗口同时保存：无冲突批次自动合并；冲突批次保留 A/B 两版、停用预演，全部选定后才出下一版。
            音乐时间点调整时绑定批次自动重算、人工偏移保留；写盘失败保留待提交，恢复继续补写。
          </p>
        </div>
        <div className="top-actions">
          <button className="secondary" onClick={demoScenario}>
            🎬 一键铺演练局面
          </button>
          <button className={diskFailing ? "danger-btn on" : "danger-btn"} onClick={toggleDisk}>
            {diskFailing ? "🔴 模拟磁盘故障中（点我恢复）" : "⚙ 模拟写盘失败"}
          </button>
          <button className="secondary" disabled={pendingWrites.length === 0} onClick={doRecover}>
            ↺ 继续补写{pendingWrites.length > 0 ? `（${pendingWrites.length}）` : ""}
          </button>
          <button className="link" onClick={resetDemo}>
            重置演示
          </button>
        </div>
      </header>

      {bootNotice && <div className="boot-banner">{bootNotice}</div>}
      {pendingWrites.length > 0 && (
        <div className="pending-banner">
          📝 待提交 {pendingWrites.length} 条：
          {pendingWrites.map((e) => (
            <span key={e.opId} className="pending-chip">
              {e.type === "save" ? `保存(${e.author})` : e.type === "resolve" ? "冲突选定" : "版本选择"}
              {e.lastError ? ` · ${e.lastError}` : " · 等待补写"}
            </span>
          ))}
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}

      <section className="windows">
        <WindowPanel
          clientId={CLIENT_A}
          title="窗口 A · 北侧控台"
          accent="#f59e0b"
          draft={state.drafts[CLIENT_A]}
          headId={state.headId}
          onCheckout={checkout}
          onChange={editDraft}
          onSave={save}
          saving={savingClient === CLIENT_A}
        />
        <WindowPanel
          clientId={CLIENT_B}
          title="窗口 B · 南侧控台"
          accent="#38bdf8"
          draft={state.drafts[CLIENT_B]}
          headId={state.headId}
          onCheckout={checkout}
          onChange={editDraft}
          onSave={save}
          saving={savingClient === CLIENT_B}
        />
      </section>

      {state.pendingMerge && (
        <ConflictCenter pm={state.pendingMerge} onResolve={(i, side) => lib.resolveConflict(i, side)} />
      )}

      <PreviewStage view={view} pending={pendingView} />

      <VersionBar
        commits={state.commits}
        headId={state.headId}
        selectedId={state.selectedVersionId}
        onSelect={(id) => lib.selectVersion(id)}
      />

      <footer className="footnote">
        所有保存先写 outbox 日志（opId 幂等）再应用状态；时间轴与点位图均由 <code>buildShowView(snapshot)</code>{" "}
        从同一选定版本派生。存储键：fwx.state.v1 / fwx.outbox.v1（localStorage）。
      </footer>
    </main>
  );
}
