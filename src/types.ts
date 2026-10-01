// 烟花燃放脚本编排 —— 核心数据模型

export type ID = string;

/** 节目段落（Intro / Verse / Chorus ...），构成时间轴的结构带 */
export type Segment = {
  id: ID;
  name: string;
  color: string;
  start: number; // 秒
  end: number;   // 秒
};

/** 音乐时间点：绑定批次的点火时间 = 时间点时刻 + 人工偏移 */
export type MusicCue = {
  id: ID;
  name: string;
  time: number; // 秒
};

/** 烟花型号清单 */
export type FireworkModel = {
  id: ID;
  name: string;
  category: string;   // 礼花弹 / 罗马烛光 / 扇形架 / 冷焰火
  caliber: number;    // mm
  safetyDistance: number; // m
};

/** 点火批次（版本化合并的最小单元） */
export type Batch = {
  id: ID;
  segmentId: ID;
  modelId: ID;
  angle: number;          // 发射角度 °
  cueId: ID | null;       // 绑定的音乐时间点
  manualOffset: number;   // 人工偏移（秒），相对时间点
  manualTime: number;     // 未绑定时的手动点火时间（秒）
  duration: number;       // 持续时间（秒）
  position: { x: number; y: number }; // 点位坐标 0~100
  note: string;
};

export type ConflictReason =
  | 'both-modified'   // 两边都改了同一批次
  | 'both-added'      // 两边新增了同一 id
  | 'delete-modify';  // 一边删除、一边修改

export type Conflict = {
  id: ID;
  batchId: ID;
  reason: ConflictReason;
  base: Batch | null;
  sideA: Batch | null; // 窗口 A 的候选（null 表示删除）
  sideB: Batch | null; // 窗口 B 的候选（null 表示删除）
  resolution: 'A' | 'B' | null;
};

export type VersionSource =
  | 'init'
  | 'window-A'
  | 'window-B'
  | 'merge-resolve'
  | 'recovery';

export type Version = {
  id: ID;
  index: number;
  parentId: ID | null;
  createdAt: number;
  source: VersionSource;
  message: string;
  batches: Batch[];
  conflicts: Conflict[];
};

export type PendingStatus = 'pending' | 'writing' | 'committed' | 'failed';

/** 待提交批次：写盘失败后保留，恢复时继续补写 */
export type PendingWrite = {
  id: ID;
  window: 'A' | 'B';
  parentVersionId: ID;
  batches: Batch[];
  createdAt: number;
  status: PendingStatus;
  attempts: number;
  error?: string;
};

export type WindowState = {
  key: 'A' | 'B';
  parentVersionId: ID;
  batches: Batch[];
  dirty: boolean;
};

export type ViewKey =
  | 'timeline'
  | 'map'
  | 'cues'
  | 'models'
  | 'conflicts';

export type Collision = {
  id: ID;
  batchA: ID;
  batchB: ID;
  kind: 'time' | 'position';
  dt: number;   // 时间差（秒）
  dist: number; // 点位距离（0~100）
};
