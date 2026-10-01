import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ChoreographyLibrary, seedCommit, type Storage } from "./library";

/** localStorage 适配（写入可被故障开关拦截，演示写盘失败） */
class BrowserStorage implements Storage {
  failing = false;
  getItem(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  setItem(key: string, value: string): void {
    if (this.failing) throw new Error("EIO: 磁盘写盘失败（模拟）");
    window.localStorage.setItem(key, value);
  }
}

export interface LibraryApi {
  lib: ChoreographyLibrary;
  state: ChoreographyLibrary["state"];
  storage: BrowserStorage;
  recover: () => Promise<{ recovered: number; failed: number }>;
  resetDemo: () => void;
}

export function useChoreographyLibrary(): LibraryApi & { bootNotice: string | null } {
  const { lib, storage } = useMemo(() => {
    const storage = new BrowserStorage();
    return { lib: new ChoreographyLibrary(storage, seedCommit), storage };
  }, []);

  const state = useSyncExternalStore(
    (cb) => lib.subscribe(cb),
    () => lib.state,
    () => lib.state,
  );

  const [bootNotice, setBootNotice] = useState<string | null>(null);
  const recoveredRef = useRef(false);

  // 启动恢复：outbox 里若有写盘失败留下的待提交条目，继续补写
  useEffect(() => {
    if (recoveredRef.current) return;
    recoveredRef.current = true;
    if (lib.pendingWrites().length > 0) {
      void lib.recover().then((r) => {
        if (r.recovered > 0) setBootNotice(`恢复完成：已继续补写 ${r.recovered} 个待提交批次`);
        else if (r.failed > 0) setBootNotice(`仍有 ${r.failed} 个批次写盘失败，请检查磁盘后重试`);
      });
    }
  }, [lib]);

  return {
    lib,
    state,
    storage,
    bootNotice,
    recover: () => lib.recover(),
    resetDemo: () => {
      window.localStorage.removeItem("fwx.state.v1");
      window.localStorage.removeItem("fwx.outbox.v1");
      window.location.reload();
    },
  };
}
