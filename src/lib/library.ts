import type { Batch, FireworkModel, MusicCue, Segment, Version } from '../types';
import { newId } from './time';

export const SEGMENTS: Segment[] = [
  { id: 'seg-intro', name: 'Intro', color: '#38bdf8', start: 0, end: 30 },
  { id: 'seg-verse', name: 'Verse', color: '#818cf8', start: 30, end: 70 },
  { id: 'seg-chorus', name: 'Chorus', color: '#f472b6', start: 70, end: 130 },
  { id: 'seg-bridge', name: 'Bridge', color: '#fbbf24', start: 130, end: 175 },
  { id: 'seg-finale', name: 'Finale', color: '#f87171', start: 175, end: 230 },
];

export const CUES: MusicCue[] = [
  { id: 'cue-downbeat', name: '鼓声起', time: 0 },
  { id: 'cue-vocal', name: '主唱进', time: 12.5 },
  { id: 'cue-chorus', name: '副歌起', time: 68.2 },
  { id: 'cue-bridge', name: '桥段', time: 130 },
  { id: 'cue-finale', name: '终场齐发', time: 200 },
];

export const MODELS: FireworkModel[] = [
  { id: 'm-30fan', name: '30mm扇形架', category: '扇形架', caliber: 30, safetyDistance: 35 },
  { id: 'm-75shell', name: '75mm礼花弹', category: '礼花弹', caliber: 75, safetyDistance: 80 },
  { id: 'm-roman', name: '罗马烛光', category: '罗马烛光', caliber: 50, safetyDistance: 40 },
  { id: 'm-cold', name: '冷焰火', category: '冷焰火', caliber: 20, safetyDistance: 15 },
  { id: 'm-100shell', name: '100mm礼花弹', category: '礼花弹', caliber: 100, safetyDistance: 120 },
];

const b = (
  id: string,
  segmentId: string,
  modelId: string,
  cueId: string | null,
  manualOffset: number,
  manualTime: number,
  duration: number,
  x: number,
  y: number,
  angle: number,
  note = '',
): Batch => ({
  id,
  segmentId,
  modelId,
  angle,
  cueId,
  manualOffset,
  manualTime,
  duration,
  position: { x, y },
  note,
});

export function initialBatches(): Batch[] {
  return [
    b('b01', 'seg-intro', 'm-30fan', 'cue-downbeat', 0, 0, 6, 18, 62, 90, '开场扇形架'),
    b('b02', 'seg-intro', 'm-cold', 'cue-vocal', 0, 0, 8, 30, 78, 60, '主唱进冷焰火'),
    b('b03', 'seg-verse', 'm-roman', null, 0, 42, 5, 45, 55, 75, ''),
    b('b04', 'seg-chorus', 'm-75shell', 'cue-chorus', 0, 0, 4, 52, 40, 85, '副歌礼花弹'),
    b('b05', 'seg-chorus', 'm-roman', 'cue-chorus', 1.5, 0, 4, 60, 58, 70, '副歌烛光'),
    b('b06', 'seg-bridge', 'm-cold', 'cue-bridge', 0, 0, 10, 38, 80, 55, '桥段冷焰'),
    b('b07', 'seg-finale', 'm-100shell', 'cue-finale', 0, 0, 3, 50, 35, 90, '终场大礼花'),
    b('b08', 'seg-finale', 'm-75shell', 'cue-finale', 0.8, 0, 3, 66, 48, 80, '终场礼花齐发'),
  ];
}

export function initialVersion(): Version {
  return {
    id: 'v1',
    index: 1,
    parentId: null,
    createdAt: Date.now(),
    source: 'init',
    message: '初始编排版本',
    batches: initialBatches(),
    conflicts: [],
  };
}

export function makeBatch(partial: Partial<Batch> = {}): Batch {
  return {
    id: newId('b'),
    segmentId: SEGMENTS[0].id,
    modelId: MODELS[0].id,
    angle: 90,
    cueId: null,
    manualOffset: 0,
    manualTime: 0,
    duration: 4,
    position: { x: 50, y: 50 },
    note: '',
    ...partial,
  };
}
