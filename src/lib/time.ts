import type { Batch, MusicCue } from '../types';

/** 秒 -> mm:ss.mmm */
export function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec - Math.floor(sec)) * 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

/** mm:ss.mmm / ss.mmm / mm:ss -> 秒 */
export function parseTime(raw: string): number {
  const str = raw.trim();
  if (!str) return 0;
  const parts = str.split(':');
  let sec = 0;
  if (parts.length === 2) {
    sec = Number(parts[0]) * 60 + Number(parts[1]);
  } else if (parts.length === 1) {
    sec = Number(parts[0]);
  }
  return Number.isFinite(sec) && sec >= 0 ? sec : 0;
}

/** 批次有效点火时间：绑定时间点 = 时间点时刻 + 人工偏移；否则取手动时间 */
export function effectiveTime(batch: Batch, cues: MusicCue[]): number {
  if (batch.cueId) {
    const cue = cues.find((c) => c.id === batch.cueId);
    if (cue) return cue.time + batch.manualOffset;
  }
  return batch.manualTime;
}

export function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
