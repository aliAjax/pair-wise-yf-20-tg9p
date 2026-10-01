/** 演示数据：一场夜场烟花秀的初始版本 */
import type { Commit, Snapshot } from "./types";

export function seedSnapshot(): Snapshot {
  return {
    segments: {
      seg_intro: { id: "seg_intro", name: "Intro 序幕", startMs: 0, endMs: 75000, note: "观众入场后静场" },
      seg_chorus: { id: "seg_chorus", name: "Chorus A 主歌", startMs: 75000, endMs: 210000 },
      seg_finale: { id: "seg_finale", name: "Finale 终场", startMs: 210000, endMs: 260000, note: "近景区待确认" },
    },
    cues: {
      cue_downbeat_1: { id: "cue_downbeat_1", label: "第1重拍", timeMs: 12500 },
      cue_drop: { id: "cue_drop", label: "Drop 落点", timeMs: 68200 },
      cue_chorus: { id: "cue_chorus", label: "副歌起", timeMs: 78000 },
      cue_finale: { id: "cue_finale", label: "终场齐鸣", timeMs: 222000 },
    },
    batches: {
      batch_fan: {
        id: "batch_fan",
        name: "扇形架开场",
        segmentId: "seg_intro",
        timingMode: "cue",
        cueId: "cue_downbeat_1",
        offsetMs: 0,
        fixedMs: 0,
        durationMs: 6000,
        fxKind: "fan",
        spec: "30mm 扇形架 ×12",
        safeDistanceM: 35,
        angleDeg: 75,
        positions: [
          { x: 10, y: 8 },
          { x: 16, y: 8 },
          { x: 22, y: 8 },
        ],
        note: "跟着重拍扇形展开",
      },
      batch_shell: {
        id: "batch_shell",
        name: "B点 75mm 礼花弹",
        segmentId: "seg_chorus",
        timingMode: "cue",
        cueId: "cue_drop",
        offsetMs: 0,
        fixedMs: 0,
        durationMs: 8000,
        fxKind: "shell",
        spec: "75mm 礼花弹",
        safeDistanceM: 60,
        angleDeg: 90,
        positions: [
          { x: 42, y: 20 },
          { x: 48, y: 22 },
        ],
        note: "与B点位间隔正常",
      },
      batch_cold: {
        id: "batch_cold",
        name: "近景冷焰火",
        segmentId: "seg_finale",
        timingMode: "cue",
        cueId: "cue_finale",
        offsetMs: 0,
        fixedMs: 0,
        durationMs: 12000,
        fxKind: "cold",
        spec: "冷焰火 3m",
        safeDistanceM: 8,
        angleDeg: 60,
        positions: [
          { x: 30, y: 4 },
          { x: 34, y: 4 },
        ],
        note: "近景区待确认",
      },
    },
  };
}

export function seedCommit(): Commit {
  return {
    id: "v1",
    parentIds: [],
    snapshot: seedSnapshot(),
    message: "v1 夜场脚本基线（Intro / Chorus / Finale）",
    author: "白班编排员",
    createdAt: Date.now() - 3600_000,
  };
}
