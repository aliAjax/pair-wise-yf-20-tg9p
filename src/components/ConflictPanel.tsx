import { useMemo } from 'react';
import { useStore, useHeadVersion } from '../store';
import type { Batch, Conflict } from '../types';
import { effectiveTime, formatTime } from '../lib/time';

const REASON_LABEL: Record<Conflict['reason'], string> = {
  'both-modified': '两边都修改了同一批次',
  'both-added': '两边新增了同一批次',
  'delete-modify': '一边删除、一边修改',
};

function CandidateCard({
  title,
  batch,
  conflict,
  side,
  onSelect,
}: {
  title: string;
  batch: Batch | null;
  conflict: Conflict;
  side: 'A' | 'B';
  onSelect: () => void;
}) {
  const { state } = useStore();
  const chosen = conflict.resolution === side;
  const other = side === 'A' ? conflict.sideB : conflict.sideA;

  const model = batch ? state.models.find((m) => m.id === batch.modelId) : null;
  const seg = batch ? state.segments.find((s) => s.id === batch.segmentId) : null;
  const t = batch ? effectiveTime(batch, state.cues) : 0;

  const diff = (field: keyof Batch, label: string, render: (b: Batch) => string) => {
    if (!batch) return null;
    const otherVal = other ? render(other) : null;
    const val = render(batch);
    const changed = otherVal !== null && otherVal !== val;
    return (
      <div className={`diff-row${changed ? ' is-changed' : ''}`}>
        <dt>{label}</dt>
        <dd>
          {val}
          {changed && <em className="diff-flag">异于对方</em>}
        </dd>
      </div>
    );
  };

  return (
    <div className={`candidate-card${chosen ? ' is-chosen' : ''}`}>
      <div className="candidate-head">
        <strong>{title}</strong>
        {chosen && <span className="chosen-tag">已选定</span>}
      </div>
      {batch === null ? (
        <p className="candidate-deleted">删除该批次</p>
      ) : (
        <dl className="candidate-dl">
          {diff('modelId', '型号', () => model?.name ?? batch.modelId)}
          {diff('segmentId', '段落', () => seg?.name ?? batch.segmentId)}
          {diff('manualTime', '点火时间', () => formatTime(t))}
          {diff('angle', '发射角度', () => `${batch.angle}°`)}
          {diff('position', '点位', () => `(${batch.position.x.toFixed(0)}, ${batch.position.y.toFixed(0)})`)}
          {diff('duration', '持续时间', () => `${batch.duration}s`)}
          {batch.note && (
            <div className="diff-row">
              <dt>备注</dt>
              <dd>{batch.note}</dd>
            </div>
          )}
        </dl>
      )}
      <button
        className={`btn ${chosen ? 'btn-primary' : 'btn-ghost'}`}
        onClick={onSelect}
        disabled={chosen}
      >
        {chosen ? `保留${title}` : `保留${title}`}
      </button>
    </div>
  );
}

export default function ConflictPanel() {
  const { state, dispatch } = useStore();
  const head = useHeadVersion();

  const conflicts = head.conflicts;
  const resolvedCount = conflicts.filter((c) => c.resolution).length;
  const allResolved = conflicts.length > 0 && resolvedCount === conflicts.length;

  const batchLabel = useMemo(() => {
    const m = new Map<string, Batch>();
    head.batches.forEach((b) => m.set(b.id, b));
    conflicts.forEach((c) => {
      if (c.sideA) m.set(c.sideA.id, c.sideA);
      if (c.sideB) m.set(c.sideB.id, c.sideB);
    });
    return m;
  }, [head.batches, conflicts]);

  if (conflicts.length === 0) {
    return (
      <div className="conflict-empty">
        <h3>当前版本无冲突批次</h3>
        <p>
          两个窗口并行保存时，未冲突的批次会自动合并；只有两边改动同一批次（或一边删除一边修改）才会进入冲突待选定。
        </p>
        <p className="conflict-flow">
          流程：窗口 A / B 各自保存 → 三路合并 → 冲突保留两版并停用预演 → 全部选定后「生成下一版」→ 预演恢复。
        </p>
      </div>
    );
  }

  return (
    <div className="conflict-panel">
      <div className="conflict-summary">
        <p>
          版本 v{head.index} 合并后存在 <strong>{conflicts.length}</strong> 项冲突批次，已保留两版候选，
          <strong>整场预览已停用</strong>。请逐项选定保留版本，全部选定后生成下一版。
        </p>
        <div className="conflict-progress">
          已选定 {resolvedCount} / {conflicts.length}
        </div>
      </div>

      {conflicts.map((c) => {
        const label = batchLabel.get(c.batchId);
        const model = label ? state.models.find((m) => m.id === label.modelId) : null;
        return (
          <div key={c.id} className="conflict-item">
            <div className="conflict-item-head">
              <span className="conflict-reason">{REASON_LABEL[c.reason]}</span>
              <span className="conflict-batch-id">
                批次 {c.batchId}
                {model ? ` · ${model.name}` : ''}
              </span>
            </div>
            <div className="candidate-grid">
              <CandidateCard
                title="A 版（窗口 A）"
                batch={c.sideA}
                conflict={c}
                side="A"
                onSelect={() =>
                  dispatch({ type: 'RESOLVE_CONFLICT', conflictId: c.id, resolution: 'A' })
                }
              />
              <CandidateCard
                title="B 版（窗口 B）"
                batch={c.sideB}
                conflict={c}
                side="B"
                onSelect={() =>
                  dispatch({ type: 'RESOLVE_CONFLICT', conflictId: c.id, resolution: 'B' })
                }
              />
            </div>
          </div>
        );
      })}

      <div className="conflict-generate">
        <button
          className="btn btn-primary btn-lg"
          disabled={!allResolved}
          onClick={() => dispatch({ type: 'GENERATE_NEXT_VERSION' })}
          title={allResolved ? '按选定版本生成下一版，恢复预演' : '请先逐项选定保留版本'}
        >
          {allResolved ? '生成下一版（恢复预演）' : `还有 ${conflicts.length - resolvedCount} 项未选定`}
        </button>
      </div>
    </div>
  );
}
