import { useStore } from '../store';

export default function PendingBanner() {
  const { state, recoverAll } = useStore();
  const failed = state.pendingWrites.filter((p) => p.status === 'failed');
  const writing = state.pendingWrites.filter((p) => p.status === 'writing');

  if (failed.length === 0 && writing.length === 0) return null;

  return (
    <div className="pending-banner">
      <div className="pending-icon">!</div>
      <div className="pending-body">
        {writing.length > 0 ? (
          <>
            <strong>正在补写 {writing.length} 项待提交批次…</strong>
            <span>写盘队列恢复中，完成后将并入编排库并生成新版本。</span>
          </>
        ) : (
          <>
            <strong>写盘失败：{failed.length} 项批次已保留在待提交队列</strong>
            <span>
              批次未丢失。恢复写盘后将继续补写；若两窗口并发保存，未冲突批次自动合并，冲突批次保留两版待选定。
            </span>
          </>
        )}
      </div>
      {failed.length > 0 && writing.length === 0 && (
        <button className="btn btn-primary" onClick={() => void(recoverAll())}>
          恢复补写
        </button>
      )}
    </div>
  );
}
