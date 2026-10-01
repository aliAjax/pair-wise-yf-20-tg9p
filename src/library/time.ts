/** 时间与快照工具 */
import type { FiringBatch, MusicCue, Snapshot } from "./types";

/** 毫秒 → "mm:ss.mmm"，例如 68200 → "01:08.200" */
export function formatMs(ms: number): string {
  const sign = ms < 0 ? "-" : "";
  const v = Math.abs(Math.round(ms));
  const m = Math.floor(v / 60000);
  const s = Math.floor((v % 60000) / 1000);
  const milli = v % 1000;
  return `${sign}${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(milli).padStart(3, "0")}`;
}

/** "01:08.200" / "68.2" / 68200 → 毫秒；无法解析返回 null */
export function parseMs(text: string): number | null {
  const t = text.trim();
  if (/^-?\d+(\.\d+)?$/.test(t)) return Math.round(Number(t) * 1000);
  const m = /^(-)?(?:(\d+):)?(\d{1,2})(?:[.:](\d{1,3}))?$/.exec(t);
  if (!m) return null;
  const sign = m[1] ? -1 : 1;
  const minutes = m[2] ? Number(m[2]) : 0;
  const seconds = Number(m[3]);
  const frac = m[4] ? Number(m[4].padEnd(3, "0")) : 0;
  return sign * (minutes * 60000 + seconds * 1000 + frac);
}

/** 批次在某一组音乐时间点下的生效点火时刻 */
export function effectiveMs(batch: FiringBatch, cues: Record<string, MusicCue>): number | null {
  if (batch.timingMode === "fixed") return batch.fixedMs;
  const cue = batch.cueId ? cues[batch.cueId] : undefined;
  if (!cue) return null; // 绑定的时间点被删/未合入：无法计算
  return cue.timeMs + batch.offsetMs;
}

/**
 * 音乐时间点时间变化后重算绑定批次。
 * 关键：只改派生结果，offsetMs（人工偏移）原样保留——
 * 由于生效时间本就是 cue.timeMs + offsetMs 派生的，这里只需保证快照一致并返回重算后的视图数据。
 */
export function recomputeBindings(snapshot: Snapshot): {
  snapshot: Snapshot;
  dangling: Id[];
} {
  const dangling: Id[] = [];
  for (const b of Object.values(snapshot.batches)) {
    if (b.timingMode === "cue" && !(b.cueId && snapshot.cues[b.cueId])) dangling.push(b.id);
  }
  return { snapshot, dangling };
}

type Id = string;

export function clone<T>(v: T): T {
  return structuredClone(v);
}

let seq = 0;
export function uid(prefix = "id"): Id {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq.toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function emptySnapshot(): Snapshot {
  return { segments: {}, cues: {}, batches: {} };
}

export function mapValues<T>(m: Record<string, T>): T[] {
  return Object.values(m);
}

/** 按开始/时间排序的稳定顺序 */
export function sortedBatches(s: Snapshot, cues = s.cues): FiringBatch[] {
  return mapValues(s.batches).sort((x, y) => {
    const tx = effectiveMs(x, cues) ?? Number.POSITIVE_INFINITY;
    const ty = effectiveMs(y, cues) ?? Number.POSITIVE_INFINITY;
    return tx - ty || x.id.localeCompare(y.id);
  });
}
