import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import type {
  Batch,
  Conflict,
  FireworkModel,
  ID,
  MusicCue,
  PendingWrite,
  Segment,
  Version,
  ViewKey,
  WindowState,
} from './types';
import { CUES, MODELS, SEGMENTS, initialVersion, makeBatch } from './lib/library';
import { applyResolutions, mergeBatches } from './lib/merge';
import { effectiveTime, newId } from './lib/time';

const STORAGE_KEY = 'firework-choreography-library-v1';

type State = {
  segments: Segment[];
  cues: MusicCue[];
  models: FireworkModel[];
  versions: Version[];
  headVersionId: ID;
  selectedVersionId: ID;
  windows: Record<'A' | 'B', WindowState>;
  pendingWrites: PendingWrite[];
  simulateFail: boolean;
  view: ViewKey;
  selectedBatchId: ID | null;
  hydrated: boolean;
};

function loadPersisted(): Partial<State> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<State>) : null;
  } catch {
    return null;
  }
}

function buildInitialState(): State {
  const v1 = initialVersion();
  const win = (key: 'A' | 'B', parentId: ID, batches: Batch[]): WindowState => ({
    key,
    parentVersionId: parentId,
    batches: batches.map((b) => ({ ...b, position: { ...b.position } })),
    dirty: false,
  });
  const defaults: State = {
    segments: SEGMENTS.map((s) => ({ ...s })),
    cues: CUES.map((c) => ({ ...c })),
    models: MODELS.map((m) => ({ ...m })),
    versions: [v1],
    headVersionId: v1.id,
    selectedVersionId: v1.id,
    windows: { A: win('A', v1.id, v1.batches), B: win('B', v1.id, v1.batches) },
    pendingWrites: [],
    simulateFail: false,
    view: 'timeline',
    selectedBatchId: null,
    hydrated: true,
  };

  // 同步从本地编排库恢复，避免首屏持久化覆盖待提交批次
  const persisted = loadPersisted();
  if (!persisted || !Array.isArray(persisted.versions) || persisted.versions.length === 0) {
    return defaults;
  }
  const versions = persisted.versions;
  const head = versions.find((v) => v.id === persisted.headVersionId) ?? versions[versions.length - 1];
  return {
    ...defaults,
    segments: persisted.segments?.length ? persisted.segments : defaults.segments,
    cues: persisted.cues?.length ? persisted.cues : defaults.cues,
    models: persisted.models?.length ? persisted.models : defaults.models,
    versions,
    headVersionId: head.id,
    selectedVersionId: head.id,
    windows: { A: win('A', head.id, head.batches), B: win('B', head.id, head.batches) },
    pendingWrites: Array.isArray(persisted.pendingWrites) ? persisted.pendingWrites : [],
  };
}

type Action =
  | { type: 'WINDOW_EDIT'; key: 'A' | 'B'; batches: Batch[] }
  | { type: 'WINDOW_SYNC'; key: 'A' | 'B' }
  | { type: 'SAVE_ATTEMPT'; pending: PendingWrite }
  | { type: 'SAVE_COMMITTED'; pending: PendingWrite }
  | { type: 'SAVE_FAILED'; pending: PendingWrite; error: string }
  | { type: 'RECOVERY_START'; id: ID }
  | { type: 'RESOLVE_CONFLICT'; conflictId: ID; resolution: 'A' | 'B' }
  | { type: 'GENERATE_NEXT_VERSION' }
  | { type: 'SELECT_VERSION'; id: ID }
  | { type: 'SET_SIMULATE_FAIL'; value: boolean }
  | { type: 'SET_VIEW'; view: ViewKey }
  | { type: 'SELECT_BATCH'; id: ID | null }
  | { type: 'ADD_CUE'; cue: MusicCue }
  | { type: 'UPDATE_CUE'; id: ID; patch: Partial<MusicCue> }
  | { type: 'DELETE_CUE'; id: ID }
  | { type: 'ADD_SEGMENT'; segment: Segment }
  | { type: 'UPDATE_SEGMENT'; id: ID; patch: Partial<Segment> }
  | { type: 'DELETE_SEGMENT'; id: ID }
  | { type: 'ADD_MODEL'; model: FireworkModel }
  | { type: 'UPDATE_MODEL'; id: ID; patch: Partial<FireworkModel> }
  | { type: 'DELETE_MODEL'; id: ID };

function commitVersion(
  state: State,
  pending: PendingWrite,
): State {
  const parent = state.versions.find((v) => v.id === pending.parentVersionId);
  const head = state.versions.find((v) => v.id === state.headVersionId)!;
  const isRecovery = pending.status === 'committed';
  let batches: Batch[];
  let conflicts: Conflict[];
  if (parent && parent.id === head.id) {
    // 父版本即最新：无并发，直接提交
    batches = pending.batches.map((b) => ({ ...b, position: { ...b.position } }));
    conflicts = [];
  } else if (parent) {
    // 并发保存：三路合并
    const result = mergeBatches(parent.batches, head.batches, pending.batches);
    batches = result.batches;
    conflicts = result.conflicts;
  } else {
    batches = pending.batches;
    conflicts = [];
  }

  const source: Version['source'] = isRecovery
    ? 'recovery'
    : pending.window === 'A'
      ? 'window-A'
      : 'window-B';

  const version: Version = {
    id: newId('v'),
    index: state.versions.length + 1,
    parentId: head.id,
    createdAt: Date.now(),
    source,
    message: isRecovery
      ? `恢复补写：窗口 ${pending.window} 的待提交批次`
      : `窗口 ${pending.window} 保存${conflicts.length ? '（含冲突，待选定）' : ''}`,
    batches,
    conflicts,
  };

  const nextWindows = { ...state.windows };
  // 提交后把来源窗口的草稿同步为合并结果
  nextWindows[pending.window] = {
    ...nextWindows[pending.window],
    parentVersionId: version.id,
    batches: batches.map((b) => ({ ...b, position: { ...b.position } })),
    dirty: false,
  };

  return {
    ...state,
    versions: [...state.versions, version],
    headVersionId: version.id,
    selectedVersionId: version.id,
    windows: nextWindows,
    pendingWrites: state.pendingWrites
      .map((p) => (p.id === pending.id ? { ...p, status: 'committed' as const } : p))
      .filter((p) => p.status !== 'committed'),
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'WINDOW_EDIT':
      return {
        ...state,
        windows: {
          ...state.windows,
          [action.key]: { ...state.windows[action.key], batches: action.batches, dirty: true },
        },
      };
    case 'WINDOW_SYNC': {
      const head = state.versions.find((v) => v.id === state.headVersionId)!;
      return {
        ...state,
        windows: {
          ...state.windows,
          [action.key]: {
            key: action.key,
            parentVersionId: head.id,
            batches: head.batches.map((b) => ({ ...b, position: { ...b.position } })),
            dirty: false,
          },
        },
      };
    }
    case 'SAVE_ATTEMPT':
      return {
        ...state,
        pendingWrites: [...state.pendingWrites, { ...action.pending, status: 'writing' }],
      };
    case 'SAVE_COMMITTED':
      return commitVersion(state, action.pending);
    case 'SAVE_FAILED':
      return {
        ...state,
        pendingWrites: state.pendingWrites.map((p) =>
          p.id === action.pending.id
            ? { ...p, status: 'failed', error: action.error, attempts: p.attempts + 1 }
            : p,
        ),
      };
    case 'RECOVERY_START':
      return {
        ...state,
        pendingWrites: state.pendingWrites.map((p) =>
          p.id === action.id ? { ...p, status: 'writing' } : p,
        ),
      };
    case 'RESOLVE_CONFLICT': {
      const head = state.versions.find((v) => v.id === state.headVersionId)!;
      return {
        ...state,
        versions: state.versions.map((v) =>
          v.id === head.id
            ? {
                ...v,
                conflicts: v.conflicts.map((c) =>
                  c.id === action.conflictId ? { ...c, resolution: action.resolution } : c,
                ),
              }
            : v,
        ),
      };
    }
    case 'GENERATE_NEXT_VERSION': {
      const head = state.versions.find((v) => v.id === state.headVersionId)!;
      if (!head.conflicts.length || head.conflicts.some((c) => !c.resolution)) return state;
      const resolved = applyResolutions(head.batches, head.conflicts);
      const version: Version = {
        id: newId('v'),
        index: state.versions.length + 1,
        parentId: head.id,
        createdAt: Date.now(),
        source: 'merge-resolve',
        message: '冲突选定后生成的下一版',
        batches: resolved,
        conflicts: [],
      };
      return {
        ...state,
        versions: [...state.versions, version],
        headVersionId: version.id,
        selectedVersionId: version.id,
      };
    }
    case 'SELECT_VERSION':
      return { ...state, selectedVersionId: action.id };
    case 'SET_SIMULATE_FAIL':
      return { ...state, simulateFail: action.value };
    case 'SET_VIEW':
      return { ...state, view: action.view };
    case 'SELECT_BATCH':
      return { ...state, selectedBatchId: action.id };
    case 'ADD_CUE':
      return { ...state, cues: [...state.cues, action.cue] };
    case 'UPDATE_CUE':
      return {
        ...state,
        cues: state.cues.map((c) => (c.id === action.id ? { ...c, ...action.patch } : c)),
      };
    case 'DELETE_CUE': {
      const cues = state.cues.filter((c) => c.id !== action.id);
      const deleted = state.cues.find((c) => c.id === action.id);
      const versions = state.versions.map((v) => ({
        ...v,
        batches: v.batches.map((b) =>
          b.cueId === action.id
            ? { ...b, cueId: null, manualTime: deleted ? effectiveTime(b, state.cues) : b.manualTime }
            : b,
        ),
      }));
      const windows = { ...state.windows };
      (['A', 'B'] as const).forEach((k) => {
        windows[k] = {
          ...windows[k],
          batches: windows[k].batches.map((b) =>
            b.cueId === action.id
              ? { ...b, cueId: null, manualTime: deleted ? effectiveTime(b, state.cues) : b.manualTime }
              : b,
          ),
        };
      });
      return { ...state, cues, versions, windows };
    }
    case 'ADD_SEGMENT':
      return { ...state, segments: [...state.segments, action.segment] };
    case 'UPDATE_SEGMENT':
      return {
        ...state,
        segments: state.segments.map((s) => (s.id === action.id ? { ...s, ...action.patch } : s)),
      };
    case 'DELETE_SEGMENT': {
      const segments = state.segments.filter((s) => s.id !== action.id);
      const fallback = segments[0]?.id ?? 'seg-intro';
      const versions = state.versions.map((v) => ({
        ...v,
        batches: v.batches.map((b) => (b.segmentId === action.id ? { ...b, segmentId: fallback } : b)),
      }));
      const windows = { ...state.windows };
      (['A', 'B'] as const).forEach((k) => {
        windows[k] = {
          ...windows[k],
          batches: windows[k].batches.map((b) =>
            b.segmentId === action.id ? { ...b, segmentId: fallback } : b,
          ),
        };
      });
      return { ...state, segments, versions, windows };
    }
    case 'ADD_MODEL':
      return { ...state, models: [...state.models, action.model] };
    case 'UPDATE_MODEL':
      return {
        ...state,
        models: state.models.map((m) => (m.id === action.id ? { ...m, ...action.patch } : m)),
      };
    case 'DELETE_MODEL': {
      const models = state.models.filter((m) => m.id !== action.id);
      const fallback = models[0]?.id ?? 'm-30fan';
      const versions = state.versions.map((v) => ({
        ...v,
        batches: v.batches.map((b) => (b.modelId === action.id ? { ...b, modelId: fallback } : b)),
      }));
      const windows = { ...state.windows };
      (['A', 'B'] as const).forEach((k) => {
        windows[k] = {
          ...windows[k],
          batches: windows[k].batches.map((b) =>
            b.modelId === action.id ? { ...b, modelId: fallback } : b,
          ),
        };
      });
      return { ...state, models, versions, windows };
    }
    default:
      return state;
  }
}

/** 模拟写盘：异步，可被 simulateFail 开关控制失败 */
async function writeToDisk(pending: PendingWrite, simulateFail: boolean): Promise<void> {
  await new Promise((r) => setTimeout(r, 420 + Math.random() * 320));
  if (simulateFail) {
    throw new Error(`写盘失败：编排库无法写入（窗口 ${pending.window}，批次 ${pending.batches.length} 项）`);
  }
}

type Store = {
  state: State;
  dispatch: React.Dispatch<Action>;
  saveWindow: (key: 'A' | 'B') => Promise<void>;
  recoverAll: () => Promise<void>;
  addBatchToWindow: (key: 'A' | 'B', partial?: Partial<Batch>) => string;
  updateBatchInWindow: (key: 'A' | 'B', id: ID, patch: Partial<Batch>) => void;
  removeBatchFromWindow: (key: 'A' | 'B', id: ID) => void;
};

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, buildInitialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  // 持久化（草稿不持久化）
  useEffect(() => {
    try {
      const toSave = {
        segments: state.segments,
        cues: state.cues,
        models: state.models,
        versions: state.versions,
        headVersionId: state.headVersionId,
        selectedVersionId: state.selectedVersionId,
        pendingWrites: state.pendingWrites,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch {
      /* 存储不可用时忽略 */
    }
  }, [
    state.segments,
    state.cues,
    state.models,
    state.versions,
    state.headVersionId,
    state.selectedVersionId,
    state.pendingWrites,
  ]);

  // 启动时若存在写盘失败的待提交批次，自动继续补写（水合已在初始化器中同步完成）
  const didAutoRecover = useRef(false);
  useEffect(() => {
    if (!didAutoRecover.current && state.pendingWrites.some((p) => p.status === 'failed')) {
      didAutoRecover.current = true;
      void recoverAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.hydrated]);

  const saveWindow = useCallback(async (key: 'A' | 'B') => {
    const s = stateRef.current;
    const win = s.windows[key];
    const pending: PendingWrite = {
      id: newId('pw'),
      window: key,
      parentVersionId: win.parentVersionId,
      batches: win.batches.map((b) => ({ ...b, position: { ...b.position } })),
      createdAt: Date.now(),
      status: 'writing',
      attempts: 1,
    };
    dispatch({ type: 'SAVE_ATTEMPT', pending });
    try {
      await writeToDisk(pending, s.simulateFail);
      dispatch({ type: 'SAVE_COMMITTED', pending });
    } catch (e) {
      dispatch({ type: 'SAVE_FAILED', pending, error: (e as Error).message });
    }
  }, []);

  const recoverAll = useCallback(async () => {
    const s = stateRef.current;
    const queued = s.pendingWrites.filter((p) => p.status === 'failed' || p.status === 'pending');
    for (const p of queued) {
      dispatch({ type: 'RECOVERY_START', id: p.id });
      try {
        await writeToDisk(p, stateRef.current.simulateFail);
        dispatch({ type: 'SAVE_COMMITTED', pending: { ...p, status: 'committed', attempts: p.attempts + 1 } });
      } catch (e) {
        dispatch({
          type: 'SAVE_FAILED',
          pending: { ...p, attempts: p.attempts + 1 },
          error: (e as Error).message,
        });
      }
    }
  }, []);

  const addBatchToWindow = useCallback((key: 'A' | 'B', partial: Partial<Batch> = {}): string => {
    const s = stateRef.current;
    const win = s.windows[key];
    const batch = makeBatch(partial);
    dispatch({ type: 'WINDOW_EDIT', key, batches: [...win.batches, batch] });
    return batch.id;
  }, []);

  const updateBatchInWindow = useCallback((key: 'A' | 'B', id: ID, patch: Partial<Batch>) => {
    const s = stateRef.current;
    const win = s.windows[key];
    dispatch({
      type: 'WINDOW_EDIT',
      key,
      batches: win.batches.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    });
  }, []);

  const removeBatchFromWindow = useCallback((key: 'A' | 'B', id: ID) => {
    const s = stateRef.current;
    const win = s.windows[key];
    dispatch({ type: 'WINDOW_EDIT', key, batches: win.batches.filter((b) => b.id !== id) });
  }, []);

  const value = useMemo<Store>(
    () => ({
      state,
      dispatch,
      saveWindow,
      recoverAll,
      addBatchToWindow,
      updateBatchInWindow,
      removeBatchFromWindow,
    }),
    [state, saveWindow, recoverAll, addBatchToWindow, updateBatchInWindow, removeBatchFromWindow],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}

/** 当前选中版本（时间轴与点位图共用同一版本） */
export function useSelectedVersion(): Version {
  const { state } = useStore();
  return (
    state.versions.find((v) => v.id === state.selectedVersionId) ??
    state.versions[state.versions.length - 1]
  );
}

/** 最新工作版本 */
export function useHeadVersion(): Version {
  const { state } = useStore();
  return state.versions.find((v) => v.id === state.headVersionId)!;
}
