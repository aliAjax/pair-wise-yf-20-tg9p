# hxyfront-62008 烟花燃放脚本 · 可恢复编排库

面向夜场换班双窗口并发编排的燃放脚本工具。把**节目段落 / 点火批次 / 音乐时间点 / 整场预览**
接成一个可恢复的编排库（`src/library/`，纯 TypeScript，不依赖 React）。

## 核心机制

### 1. 双窗口保存：三路合并，而不是后到覆盖先到

- 每个编排窗口持有工作副本并记录开工基线 `baseId`。
- 保存时走三路合并（共同基线 base / 先进库 head=A / 后到 incoming=B）：
  - 只有一边动的批次（增/改/删）→ **自动合并**，生成双父合并版本；
  - 两边都改且结果不同 → **冲突**：A/B 两版都保留进挂起合并（`PendingMerge`），
    不生成新版本，**整场预演停用**；时间轴和点位图里以虚线 A/B 幽灵块展示候选批次；
  - 逐处选定，**全部选定后才生成下一版**（缺一处都不出版）。
- 实体粒度：节目段落、音乐时间点、点火批次三类都参与合并。

### 2. 音乐时间点 ↔ 点火批次

- 批次不写死点火时刻，只存 `cueId + offsetMs`；生效时间 `cue.timeMs + offsetMs` 由视图派生。
- 音乐时间点一改，绑定批次在时间轴/点位图/预览中**自动重算**。
- **人工偏移 `offsetMs` 在任何合并与重算中原样保留**。
- 绑定的时间点被删：批次标记「悬空」，时间轴虚线告警、不参与点火与安全距离计算。

### 3. 可恢复写盘（outbox / WAL）

- 每次保存/仲裁/选版本：操作带 `opId` 幂等键**先写 outbox 日志**，再应用到状态，成功后清条目。
- 状态写盘**先落盘后改内存**，失败时内存与磁盘一致地停在旧版本，条目留在 outbox 并记录 `attempts/lastError`。
- 重启或点「继续补写」→ `recover()` 按入队顺序重放；`opId` 保证同一操作绝不重复应用。

### 4. 时间轴与点位图同一选定版本

- 两个视图都从 `buildShowView(snapshot, versionId)` 派生同一份 `ShowView`，没有第二份时间/点位状态。
- `selectVersion` 走同一套 outbox 通道，切换版本时时间轴和点位图同时切换。
- 额外派生：同时刻点火碰撞提示、时间重叠且点位间距不足的安全距离 hazard。

## 目录

```
src/library/
  types.ts    领域类型（Snapshot/Commit/Draft/PendingMerge/OutboxEntry）
  time.ts     时间解析/格式化、effectiveMs 派生、排序
  merge.ts    三路合并、冲突保留、选定后 finalize 出版
  view.ts     buildShowView / buildPendingView（时间轴+点位图唯一数据源）
  storage.ts  DurableStore：outbox 两阶段写盘、recover 补写、幂等
  library.ts  ChoreographyLibrary：保存/仲裁/选版本 + applyEntry 纯函数
  seed.ts     夜场演示基线
src/components/  Timeline / PointMap / PreviewStage / ConflictCenter / WindowPanel / VersionBar
tests/library.test.ts  12 个场景测试
```

## 演练路径

1. `npm run dev`（端口 62008）；
2. 点「🎬 一键铺演练局面」：A 改礼花弹型号 + 加罗马烛光；B 改同批次角度 + 加盆花 + 挪 Drop 时间点（带 −250ms 人工偏移）；
3. 先在窗口 A 保存（快进），再在窗口 B 保存 → 两个不同新批次自动合并、同批次改动进入冲突仲裁、预演停用；
4. 逐处选 A/B 两版 → 最后一处选定后生成合并版本，预演恢复，Drop 重算后礼花弹为 `70.000 − 0.250 = 01:09.750`；
5. 「⚙ 模拟写盘失败」后再保存 → 待提交条目挂起；恢复磁盘后「↺ 继续补写」。

## 命令

```bash
npm run dev        # 开发服务器
npm test           # node:test（esbuild 打包，12 个场景）
npm run typecheck  # tsc --noEmit
npm run build      # 类型检查 + vite 生产构建
```

## 技术栈

React 19 + Vite 7 + TypeScript（strict），存储默认 localStorage（`fwx.state.v1` / `fwx.outbox.v1`），
`Storage` 接口可注入，测试用带故障注入的内存实现。
