import React, { createContext, useContext, useEffect, useRef, useState, ReactNode, useCallback } from 'react';
import type { SyncStatus, SyncState, SyncPayload } from '@hengsch/shared-types';
import { mergeSyncStates, parseSyncFile, normalizeSynced } from '@hengsch/shared-logic';
import { useTodos } from './TodoContext';
import { useGroups } from './GroupContext';
import { getDeviceId } from '../utils/device';
import {
  loadSyncConfig,
  saveSyncConfig,
  testConnection,
  fetchWithTimeout,
  WebSyncConfig
} from '../utils/syncConfig';

const FIRST_RUN_DELAY_MS = 5_000;
const BASE_INTERVAL_MS = 60_000;
const OFFLINE_BACKOFF0_MS = 5_000;
const PUT_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class AuthError extends Error {}
class ConflictExhausted extends Error {}

interface SyncContextType {
  status: SyncStatus;
  config: WebSyncConfig | null;
  /** 手动立即同步 */
  runNow: () => void;
  /** 保存配置（enabled 后立即触发一轮） */
  configure: (cfg: WebSyncConfig) => Promise<void>;
  /** 连通性测试（供设置页复用） */
  testConnection: typeof testConnection;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

function classify(error: unknown): { state: SyncState; message: string } {
  if (error instanceof AuthError) return { state: 'AUTH ERROR', message: error.message };
  if (error instanceof ConflictExhausted) return { state: 'REMOTE ERROR', message: error.message };
  const message = error instanceof Error ? error.message : String(error);
  return { state: 'OFFLINE', message };
}

export function SyncProvider({ children }: { children: ReactNode }): React.ReactElement {
  const todos = useTodos();
  const groups = useGroups();

  const [status, setStatusState] = useState<SyncStatus>({ state: 'OFF', at: 0 });
  const [config, setConfig] = useState<WebSyncConfig | null>(null);

  const configRef = useRef<WebSyncConfig | null>(null);
  const statusRef = useRef<SyncStatus>({ state: 'OFF', at: 0 });
  const runningRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offlineStreakRef = useRef(0);
  const initializedRef = useRef(false);

  // 每次渲染刷新最新原始数据：异步周期结束时回填，避免覆盖飞行中的本地编辑
  const latestRef = useRef<SyncPayload>({ todos: [], groups: [] });
  latestRef.current = { todos: todos.allTodos, groups: groups.allGroups };

  const setStatus = useCallback((state: SyncState, error?: string) => {
    const next: SyncStatus = { state, at: Date.now(), error };
    statusRef.current = next;
    setStatusState(next);
  }, []);

  // ── HTTP 原语 ─────────────────────────────────────────
  async function httpGet(cfg: WebSyncConfig): Promise<{ etag: string | null; state: string | null }> {
    let res: Response;
    try {
      res = await fetchWithTimeout(`${cfg.serverUrl}/sync`, {
        headers: { Authorization: `Bearer ${cfg.token}` }
      });
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : String(error));
    }
    if (res.status === 401) throw new AuthError('Token 不正确（401）');
    if (!res.ok) throw new Error(`/sync GET 返回 ${res.status}`);
    const body = (await res.json()) as { etag: string | null; state: string | null };
    return { etag: body.etag ?? null, state: body.state ?? null };
  }

  async function httpPut(
    cfg: WebSyncConfig,
    etag: string | null,
    fileText: string
  ): Promise<{ ok: boolean; etag?: string | null; conflict?: boolean }> {
    let res: Response;
    try {
      res = await fetchWithTimeout(`${cfg.serverUrl}/sync?etag=${etag ?? ''}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          'Content-Type': 'application/json; charset=utf-8'
        },
        body: fileText
      });
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : String(error));
    }
    if (res.status === 401) throw new AuthError('Token 不正确（401）');
    if (res.status === 409) {
      const body = (await res.json()) as { etag?: string };
      return { ok: false, conflict: true, etag: body.etag ?? null };
    }
    if (!res.ok) throw new Error(`/sync PUT 返回 ${res.status}`);
    return { ok: true };
  }

  function buildFile(payload: SyncPayload, deviceId: string): string {
    return JSON.stringify(
      { version: 1, todos: payload.todos, groups: payload.groups, writer: { deviceId, at: Date.now() } },
      null,
      2
    );
  }

  // ── 单周期 ───────────────────────────────────────────
  const runCycle = useCallback(async (): Promise<void> => {
    const cfg = configRef.current;
    if (runningRef.current) return;
    if (!cfg || !cfg.enabled || !cfg.serverUrl || !cfg.token) {
      setStatus('OFF');
      return;
    }
    runningRef.current = true;
    setStatus('SYNCING');
    try {
      const deviceId = await getDeviceId();
      let remote = await httpGet(cfg);
      let merged: SyncPayload;

      if (remote.state === null) {
        // 远端无档：本地全量建档
        merged = {
          todos: latestRef.current.todos.map(normalizeSynced),
          groups: latestRef.current.groups.map(normalizeSynced)
        };
        await httpPut(cfg, null, buildFile(merged, deviceId));
      } else {
        let remoteFile = parseSyncFile(remote.state);
        if (!remoteFile) {
          setStatus('REMOTE ERROR', '远端 sync.json 损坏，本次不写回');
          return;
        }
        // PUT 带 etag；409 → 重读重合，最多 3 次
        for (let attempt = 0; ; attempt++) {
          merged = mergeSyncStates(
            latestRef.current,
            { todos: remoteFile!.todos, groups: remoteFile!.groups },
            Date.now()
          );
          const put = await httpPut(cfg, remote.etag, buildFile(merged, deviceId));
          if (put.ok) break;
          if (attempt >= PUT_ATTEMPTS - 1) throw new ConflictExhausted('写入冲突重试耗尽');
          await sleep(500 * (attempt + 1));
          remote = await httpGet(cfg);
          // 对端可能已改写或删档：重读后以最新远端为准（删档视为空档重合）
          remoteFile =
            remote.state === null
              ? { version: 1, todos: [], groups: [] }
              : parseSyncFile(remote.state);
          if (!remoteFile) {
            setStatus('REMOTE ERROR', '远端 sync.json 损坏，本次不写回');
            return;
          }
        }
      }

      // 回填飞行中本地编辑（LWW 保底），再整体应用
      const final = mergeSyncStates(merged!, latestRef.current, Date.now());
      todos.applySyncedTodos(final.todos);
      groups.applySyncedGroups(final.groups);
      offlineStreakRef.current = 0;
      setStatus('SYNCED');
    } catch (error) {
      const { state, message } = classify(error);
      setStatus(state, message);
      if (state === 'OFFLINE') {
        offlineStreakRef.current = Math.min(offlineStreakRef.current + 1, 6);
      }
    } finally {
      runningRef.current = false;
      scheduleNext();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scheduleNext = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    let delay = BASE_INTERVAL_MS;
    if (statusRef.current.state === 'OFFLINE') {
      delay = Math.min(OFFLINE_BACKOFF0_MS * 2 ** offlineStreakRef.current, BASE_INTERVAL_MS);
    }
    timerRef.current = setTimeout(() => {
      void runCycle();
    }, delay);
  }, [runCycle]);

  // ── 初始化：加载配置 → 首拍 → 链式调度 ────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cfg = await loadSyncConfig();
      if (cancelled) return;
      configRef.current = cfg;
      setConfig(cfg);
      setStatus('OFF');
    })();
    return () => {
      cancelled = true;
    };
  }, [setStatus]);

  useEffect(() => {
    if (!todos.isInitialized || !groups.isInitialized) return;
    initializedRef.current = true;
    // StrictMode 下 effect 会执行-清理-再执行：cleanup 置空 timerRef 后这里要能重新武装，
    // 若链式调度已有 pending 定时器（timerRef 非空）则跳过，避免双链
    if (timerRef.current) return;
    const t = setTimeout(() => void runCycle(), FIRST_RUN_DELAY_MS);
    timerRef.current = t;
    return () => {
      if (timerRef.current === t) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [todos.isInitialized, groups.isInitialized, runCycle]);

  // 标签页重新可见 / 网络恢复 → 立即同步（节流：SYNCING 中由 runCycle 自守）
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && initializedRef.current) void runCycle();
    };
    const onOnline = () => {
      if (initializedRef.current) void runCycle();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [runCycle]);

  // 卸载清理
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const runNow = useCallback(() => {
    void runCycle();
  }, [runCycle]);

  const configure = useCallback(
    async (cfg: WebSyncConfig) => {
      await saveSyncConfig(cfg);
      configRef.current = cfg;
      setConfig(cfg);
      offlineStreakRef.current = 0;
      setStatus('OFF');
      if (cfg.enabled) void runCycle();
    },
    [runCycle, setStatus]
  );

  return (
    <SyncContext.Provider
      value={{ status, config, runNow, configure, testConnection }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSync(): SyncContextType {
  const context = useContext(SyncContext);
  if (context === undefined) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
}
