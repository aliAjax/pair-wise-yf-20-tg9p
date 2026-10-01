/**
 * 烟花燃放编排库 —— 领域类型
 *
 * 设计约定：
 * - Snapshot 是不可变的整场快照（节目段落 / 音乐时间点 / 点火批次）。
 * - 批次的「点火时刻」不直接写死：绑定音乐时间点时记 cueId + offsetMs（人工偏移），
 *   实际生效时间由时间点时间 + 偏移派生，音乐时间点调整时自动重算。
 */

export type Id = string;

/** 燃放点位（平面图坐标，单位：米；舞台朝向：上北下南） */
export interface Position {
  x: number;
  y: number;
}

/** 节目段落（Intro / Chorus A / Finale ……） */
export interface Segment {
  id: Id;
  name: string;
  startMs: number;
  endMs: number;
  note?: string;
}

/** 音乐时间点（重拍、唱词、高潮标记……） */
export interface MusicCue {
  id: Id;
  label: string;
  /** 音乐上的绝对时间（毫秒） */
  timeMs: number;
  note?: string;
}

/** 烟花型号类别（用于点位图图例/筛选） */
export type FxKind = "shell" | "roman" | "fan" | "cold" | "cake";

/**
 * 点火批次。一个批次是同一排期命令下一起点火的若干点位。
 * timingMode = 'cue'  时：effectiveMs = cue.timeMs + offsetMs（自动重算，offsetMs 为人工偏移，保留）
 * timingMode = 'fixed' 时：effectiveMs = fixedMs（绝对时间，不随音乐变化）
 */
export interface FiringBatch {
  id: Id;
  name: string;
  segmentId?: Id;
  timingMode: "cue" | "fixed";
  cueId?: Id;
  /** 相对音乐时间点的人工偏移（毫秒，可负） */
  offsetMs: number;
  fixedMs: number;
  /** 燃烧持续时长（毫秒），用于时间轴块宽与预览 */
  durationMs: number;
  fxKind: FxKind;
  /** 型号/口径/角度/安全距离等编排信息 */
  spec: string;
  safeDistanceM: number;
  angleDeg: number;
  positions: Position[];
  note?: string;
}

/** 整场不可变快照：版本 v 的内容 */
export interface Snapshot {
  segments: Record<Id, Segment>;
  cues: Record<Id, MusicCue>;
  batches: Record<Id, FiringBatch>;
}

/** 已提交版本 */
export interface Commit {
  id: Id;
  /** 普通提交一个父版本；合并提交两个父版本，保留双窗口血统 */
  parentIds: Id[];
  snapshot: Snapshot;
  message: string;
  author: string;
  createdAt: number;
  /** 合并提交里被仲裁的批次/实体 id */
  mergedConflictIds?: Id[];
}

/** 合并中某个实体的两边取值 */
export interface ConflictSides<T> {
  kind: "segments" | "cues" | "batches";
  id: Id;
  base: T | null;
  a: T | null;
  b: T | null;
  /** 已选定的一方；未选定为 undefined（全场预览因此停用） */
  resolved?: "a" | "b";
}

/** 挂起的合并（后到窗口保存、且与已提交内容冲突时产生） */
export interface PendingMerge {
  /** 三路合并的共同基版本（后到窗口开工时的 head） */
  baseId: Id;
  /** 已先进库的版本 */
  headId: Id;
  aAuthor: string;
  bAuthor: string;
  conflicts: ConflictSides<Segment | MusicCue | FiringBatch>[];
  /** 无冲突自动合并后的快照（冲突项暂缺，等选定后补入） */
  mergedSoFar: Snapshot;
  incoming: Snapshot;
  message: string;
  author: string;
  createdAt: number;
}

/** 未提交工作副本（一个编排窗口一份） */
export interface Draft {
  clientId: Id;
  author: string;
  /** 副本所依据的已提交版本；落后于 head 时保存会触发合并 */
  baseId: Id;
  snapshot: Snapshot;
  dirty: boolean;
}

/** 待提交日志条目（WAL / outbox）：先落盘再应用，写盘失败可补写 */
export interface OutboxEntry {
  /** 幂等键，恢复重放时同一 op 绝不重复应用 */
  opId: Id;
  type: "save" | "resolve" | "select";
  /** 发起操作的编排窗口 */
  clientId: Id;
  author: string;
  message?: string;
  snapshot?: Snapshot;
  /** save：窗口开工时依据的版本（三路合并共同基线） */
  baseId?: Id;
  /** resolve：冲突索引 → 选定方；select：选定的版本 id */
  picks?: Record<number, "a" | "b">;
  versionId?: Id;
  createdAt: number;
  attempts: number;
  lastError?: string;
}

export interface RepoState {
  commits: Commit[];
  headId: Id;
  /** 全场当前选定版本（时间轴与点位图必须显示同一版本） */
  selectedVersionId: Id;
  drafts: Record<Id, Draft>;
  pendingMerge: PendingMerge | null;
  /** 已应用操作的幂等键（随状态一起落盘，保证重放不重复） */
  appliedOps: Id[];
}
