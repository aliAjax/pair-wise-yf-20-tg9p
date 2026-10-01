/**
 * 编排库测试（node:test，esbuild 打包后运行）
 * 覆盖：双窗口三路合并 / 冲突两版保留与选定出版 / 音乐时间点重算与人工偏移保留 /
 *       写盘故障 outbox 补写与幂等 / 时间轴与点位图同一选定版本。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyEntry,
  buildPendingView,
  buildShowView,
  ChoreographyLibrary,
  clone,
  effectiveMs,
  MemoryStorage,
  seedCommit,
  threeWayMerge,
  type FiringBatch,
  type Snapshot,
} from "../src/library/index.js";

function libWith(storage = new MemoryStorage()): ChoreographyLibrary {
  return new ChoreographyLibrary(storage, seedCommit);
}

function draftFromHead(lib: ChoreographyLibrary): Snapshot {
  const head = lib.state.commits.find((c) => c.id === lib.state.headId)!;
  return clone(head.snapshot);
}

function addBatch(s: Snapshot, batch: Partial<FiringBatch> & { id: string; name: string }): Snapshot {
  s.batches[batch.id] = {
    segmentId: undefined,
    timingMode: "fixed",
    offsetMs: 0,
    fixedMs: 100000,
    durationMs: 5000,
    fxKind: "roman",
    spec: "测试型号",
    safeDistanceM: 25,
    angleDeg: 90,
    positions: [{ x: 5, y: 5 }],
    ...batch,
  } as FiringBatch;
  return s;
}

// ---------------------------------------------------------------------------
test("三路合并：两边新增不同批次 → 自动合并，不产生冲突", () => {
  const base = { segments: {}, cues: {}, batches: {} } as Snapshot;
  const a = addBatch(clone(base), { id: "bA", name: "A批次", fixedMs: 1000 });
  const b = addBatch(clone(base), { id: "bB", name: "B批次", fixedMs: 2000 });
  const out = threeWayMerge(base, a, b);
  assert.equal(out.conflicts.length, 0);
  assert.deepEqual(out.autoMerged.sort(), ["bA", "bB"]);
  assert.ok(out.snapshot.batches.bA);
  assert.ok(out.snapshot.batches.bB);
});

test("三路合并：同一批次两边各改 → 冲突两版保留，未选定不进快照", () => {
  const base = addBatch({ segments: {}, cues: {}, batches: {} }, { id: "b1", name: "原名", fixedMs: 1000 });
  const a = addBatch(clone(base), { id: "b1", name: "A改", fixedMs: 1000 });
  const b = addBatch(clone(base), { id: "b1", name: "B改", fixedMs: 1000 });
  const out = threeWayMerge(base, a, b);
  assert.equal(out.conflicts.length, 1);
  assert.equal((out.conflicts[0].a as FiringBatch).name, "A改");
  assert.equal((out.conflicts[0].b as FiringBatch).name, "B改");
  assert.ok(!out.snapshot.batches.b1, "冲突实体在选定前不进入合并快照");

  // 单边删除也应自动并入
  const aDeleted = clone(base);
  delete aDeleted.batches.b1;
  const out2 = threeWayMerge(base, aDeleted, addBatch(clone(base), { id: "b1", name: "B改", fixedMs: 1000 }));
  assert.equal(out2.conflicts.length, 1, "一边删一边改也是冲突，不能静默丢数据");
});

// ---------------------------------------------------------------------------
test("夜场换班：先到窗口先存，后到窗口的不同批次自动合并", () => {
  const lib = libWith();
  // 两个窗口都从 v1 拉副本
  const snapA = draftFromHead(lib);
  const snapB = draftFromHead(lib);

  addBatch(snapA, { id: "batch_roman_A", name: "夜班A新增罗马烛光", fixedMs: 95000, fxKind: "roman" });
  const r1 = lib.saveDraft("clientA", "夜班编排员A", snapA, "v1", "A 加罗马烛光");
  assert.equal(r1.kind, "fastforward");
  const vA = lib.state.headId;

  addBatch(snapB, { id: "batch_cake_B", name: "夜班B新增连发盆花", fixedMs: 130000, fxKind: "cake" });
  const r2 = lib.saveDraft("clientB", "夜班编排员B", snapB, "v1", "B 加盆花");
  assert.equal(r2.kind, "auto-merged");

  const head = lib.state.commits.find((c) => c.id === lib.state.headId)!;
  assert.ok(head.snapshot.batches.batch_roman_A, "先到批次保留");
  assert.ok(head.snapshot.batches.batch_cake_B, "后到批次自动并入，没有覆盖先到的");
  assert.equal(head.parentIds.length, 2, "自动合并版本是双父合并提交");
  assert.deepEqual(head.parentIds.slice().sort(), ["v1", vA].sort());
});

test("冲突：同一批次两边都改 → 保留两版、停用预演；全部选定后才生成下一版", () => {
  const lib = libWith();
  const snapA = draftFromHead(lib);
  const snapB = draftFromHead(lib);

  // A 改 B点礼花弹型号；B 改同一批次的角度
  snapA.batches.batch_shell.spec = "A：100mm 礼花弹";
  snapB.batches.batch_shell.angleDeg = 105;

  lib.saveDraft("clientA", "夜班A", snapA, "v1");
  const vA = lib.state.headId;
  const r = lib.saveDraft("clientB", "夜班B", snapB, "v1");
  assert.equal(r.kind, "conflict");
  assert.equal(r.conflictCount, 1);

  const headAfter = lib.state.commits.find((c) => c.id === lib.state.headId)!;
  assert.equal(headAfter.id, vA, "冲突未解决，head 不前进、不生成新版本");

  const pv = buildPendingView(lib.state.pendingMerge!);
  assert.equal(pv.unresolvedCount, 1);
  const ghostNames = pv.ghostBatches.filter((g) => g.conflictIndex === 0).map((g) => g.view.batch.spec);
  assert.ok(ghostNames.some((n) => n.includes("100mm")));
  assert.ok(ghostNames.some((n) => n.includes("75mm")), "两版都在冲突面板中保留可见");

  // 选定 B 版后才出版
  lib.resolveConflict(0, "b");
  const merged = lib.state.commits.find((c) => c.id === lib.state.headId)!;
  assert.notEqual(merged.id, vA);
  assert.equal(merged.snapshot.batches.batch_shell.angleDeg, 105);
  assert.equal(merged.snapshot.batches.batch_shell.spec, "75mm 礼花弹");
  assert.ok(lib.state.pendingMerge === null);
  assert.deepEqual(merged.parentIds.length, 2);
});

test("多处冲突必须全部选定，缺一个就不出版、预览继续停用", () => {
  const lib = libWith();
  const a = draftFromHead(lib);
  const b = draftFromHead(lib);
  a.batches.batch_shell.spec = "A改型号";
  b.batches.batch_shell.spec = "B改型号";
  a.batches.batch_fan.angleDeg = 70;
  b.batches.batch_fan.angleDeg = 80;

  lib.saveDraft("clientA", "A", a, "v1");
  const r = lib.saveDraft("clientB", "B", b, "v1");
  assert.equal(r.conflictCount, 2);

  lib.resolveConflict(0, "a");
  assert.ok(lib.state.pendingMerge, "只选了一处，仍挂起");
  lib.resolveConflict(1, "b");
  assert.ok(!lib.state.pendingMerge, "全部选定后生成下一版");
});

// ---------------------------------------------------------------------------
test("音乐时间点变化：绑定批次自动重算，人工偏移保留", () => {
  const lib = libWith();
  const s = draftFromHead(lib);

  // 给 B 点礼花弹加 -300ms 人工偏移
  s.batches.batch_shell.offsetMs = -300;
  const before = effectiveMs(s.batches.batch_shell, s.cues);
  assert.equal(before, 68200 - 300);

  // 音乐重做：Drop 从 68.2s 挪到 70.0s
  s.cues.cue_drop.timeMs = 70000;
  const after = effectiveMs(s.batches.batch_shell, s.cues);
  assert.equal(after, 70000 - 300, "时间点重算，-300ms 人工偏移保留");
  assert.equal(s.batches.batch_shell.offsetMs, -300, "偏移字段不被重算覆盖");

  lib.saveDraft("clientA", "音编", s, "v1", "音乐时间点调整");
  const head = lib.state.commits.find((c) => c.id === lib.state.headId)!;
  assert.equal(head.snapshot.batches.batch_shell.offsetMs, -300);
  const view = buildShowView(head.snapshot, head.id);
  const tb = view.timed.find((t) => t.batch.id === "batch_shell")!;
  assert.equal(tb.startMs, 69700);
});

test("绑定的音乐时间点被删 → 悬空告警且不参与时间轴，fixed 批次不受影响", () => {
  const s = seedCommit().snapshot;
  const fixed: FiringBatch = {
    id: "b_fixed", name: "固定时刻", segmentId: undefined, timingMode: "fixed",
    offsetMs: 0, fixedMs: 5000, durationMs: 1000, fxKind: "roman", spec: "x",
    safeDistanceM: 10, angleDeg: 90, positions: [{ x: 1, y: 1 }],
  };
  s.batches[fixed.id] = fixed;
  delete s.cues.cue_drop;
  const view = buildShowView(s, "v1");
  assert.deepEqual(view.dangling, ["batch_shell"]);
  const shell = view.timed.find((t) => t.batch.id === "batch_shell")!;
  assert.equal(shell.startMs, null);
  const fx = view.timed.find((t) => t.batch.id === "b_fixed")!;
  assert.equal(fx.startMs, 5000);
});

// ---------------------------------------------------------------------------
test("写盘失败：待提交批次保留；恢复后继续补写，且不重复应用", async () => {
  const storage = new MemoryStorage();
  const lib = libWith(storage);

  // 第一次保存成功
  const s1 = draftFromHead(lib);
  addBatch(s1, { id: "b_ok", name: "成功批次", fixedMs: 9000 });
  lib.saveDraft("clientA", "A", s1, "v1");

  // 制造写盘故障：save 路径为 outbox→state→outbox 三次写。
  // 放行第1次（待提交先落盘），拦截第2次（状态写盘失败）→ 条目必须保留。
  let writes = 0;
  storage.fail = () => {
    writes += 1;
    return writes === 2;
  };
  const s2 = draftFromHead(lib);
  addBatch(s2, { id: "b_pending", name: "待提交批次", fixedMs: 12000 });
  assert.throws(() => lib.saveDraft("clientB", "B", s2, lib.state.headId), /EIO/);

  const pending = lib.pendingWrites();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].type, "save");
  assert.ok(pending[0].lastError, "state 写盘失败已留痕");
  // 内存状态也未前进（state 写盘在内存赋值之前）
  assert.ok(!lib.state.commits.some((c) => c.snapshot.batches.b_pending));

  // 磁盘恢复：故障解除后继续补写
  storage.fail = () => false;
  writes = 0;
  // 模拟重启：从磁盘重新装载（state 是旧的、outbox 里有待提交条目）
  const lib2 = new ChoreographyLibrary(storage, seedCommit);
  assert.equal(lib2.pendingWrites().length, 1, "重启后仍有待提交条目");
  const result = await lib2.recover();
  assert.equal(result.recovered, 1);
  const head = lib2.state.commits.find((c) => c.id === lib2.state.headId)!;
  assert.ok(head.snapshot.batches.b_ok);
  assert.ok(head.snapshot.batches.b_pending, "恢复补写成功，待提交批次入库");
  assert.equal(lib2.pendingWrites().length, 0);

  // 再次恢复（幂等：opId 已记录在 appliedOps）不应产生重复版本
  await lib2.recover();
  const count = lib2.state.commits.filter((c) => c.snapshot.batches.b_pending).length;
  assert.equal(count, 1);
});

test("enqueue 阶段就写盘失败：状态完全不变，可直接重试保存", () => {
  const storage = new MemoryStorage();
  const lib = libWith(storage);
  // 仅在保存开始后拦截第1次写（即 outbox 待提交落盘）
  let armed = false;
  storage.fail = () => armed;
  const s = draftFromHead(lib);
  addBatch(s, { id: "b_x", name: "X", fixedMs: 1000 });
  armed = true;
  assert.throws(() => lib.saveDraft("clientA", "A", s, "v1"));
  assert.equal(lib.state.commits.length, 1);
  assert.equal(lib.pendingWrites().length, 0, "待提交条目自身都没写进去，无残留");
  armed = false;
  const r = lib.saveDraft("clientA", "A", s, "v1");
  assert.equal(r.kind, "fastforward");
  assert.equal(lib.pendingWrites().length, 0);
});

// ---------------------------------------------------------------------------
test("时间轴与点位图来自同一选定版本；切换版本两边同时切换", () => {
  const lib = libWith();
  const s = draftFromHead(lib);
  addBatch(s, { id: "b_new", name: "盆花", fixedMs: 5000 });
  lib.saveDraft("clientA", "A", s, "v1");
  const v2 = lib.state.headId;

  lib.selectVersion("v1");
  const sel = lib.state.commits.find((c) => c.id === lib.state.selectedVersionId)!;
  const view = buildShowView(sel.snapshot, sel.id);
  assert.equal(view.versionId, "v1");
  assert.ok(!view.timed.some((t) => t.batch.id === "b_new"));

  lib.selectVersion(v2);
  const view2 = buildShowView(lib.state.commits.find((c) => c.id === lib.state.selectedVersionId)!.snapshot, v2);
  assert.equal(view2.versionId, v2);
  assert.ok(view2.timed.some((t) => t.batch.id === "b_new"));

  // select 走 outbox，重放幂等
  const entry = JSON.parse(JSON.stringify(lib.pendingWrites())) as never[];
  assert.equal(entry.length, 0);
});

test("安全距离：时间重叠且点位过近时给出 hazard 提示", () => {
  const s: Snapshot = { segments: {}, cues: {}, batches: {} };
  addBatch(s, { id: "p1", name: "P1", fixedMs: 10000, durationMs: 5000, safeDistanceM: 30, positions: [{ x: 0, y: 0 }] });
  addBatch(s, { id: "p2", name: "P2", fixedMs: 11000, durationMs: 5000, safeDistanceM: 30, positions: [{ x: 10, y: 0 }] });
  const view = buildShowView(s, "v1");
  assert.equal(view.safetyHazards.length, 1);
  assert.equal(view.safetyHazards[0].distanceM, 10);
});

test("applyEntry 直接重放纯函数幂等", () => {
  const lib = libWith();
  const s = draftFromHead(lib);
  const state1 = applyEntry(lib.state, {
    opId: "op-fixed", type: "select", clientId: "x", author: "x", versionId: "v1",
    createdAt: 1, attempts: 0,
  });
  const state2 = applyEntry(state1, {
    opId: "op-fixed", type: "select", clientId: "x", author: "x", versionId: "v1",
    createdAt: 1, attempts: 0,
  });
  assert.equal(state1.appliedOps.length, 1);
  assert.equal(state2.appliedOps.length, 1);
});
