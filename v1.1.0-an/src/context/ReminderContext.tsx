import React, { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useTodos } from './TodoContext';
import { getReminderSettings, setReminderEnabled } from '../utils/reminderSettings';
import {
  rescheduleAll,
  cancelAll,
  scheduleTestNotification,
  scheduledCount,
  getPermissionState,
  requestPermission,
  type PermissionState
} from '../notifications/reminderScheduler';
import type { Todo } from '@hengsch/shared-types';

interface ReminderActionResult {
  ok: boolean;
  message: string;
}

interface ReminderContextValue {
  enabled: boolean;
  permission: PermissionState;
  scheduled: number;
  error: string | null;
  setEnabled: (next: boolean) => Promise<ReminderActionResult>;
  refresh: () => Promise<void>;
  refreshCount: () => Promise<void>;
  testNotification: () => Promise<ReminderActionResult>;
}

const ReminderContext = createContext<ReminderContextValue | undefined>(undefined);

/** 提醒生命周期：开关状态、权限、排程与点击定位都由 Provider 持有 */
export function ReminderProvider({ children }: { children: ReactNode }): React.ReactElement {
  const { allTodos, isInitialized } = useTodos();
  const [enabled, setEnabledState] = useState(false);
  const [permission, setPermission] = useState<PermissionState>('undetermined');
  const [scheduled, setScheduled] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enabledRef = useRef(false);
  const todosRef = useRef<Todo[]>(allTodos);
  const lastSignatureRef = useRef('');

  todosRef.current = allTodos;
  enabledRef.current = enabled;

  const signature = allTodos
    .map((todo) => {
      const due = todo.type === 'recurring' && 'nextDueDate' in todo ? todo.nextDueDate ?? '' : '';
      return `${todo.id}:${todo.status}:${todo.remindAt ?? ''}:${due}:${todo.updatedAt}`;
    })
    .join('|');

  const syncCount = useCallback(async (): Promise<void> => {
    setScheduled(await scheduledCount().catch(() => 0));
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    if (!enabledRef.current) return;
    const result = await rescheduleAll(todosRef.current);
    setError(result.ok ? null : result.error ?? '提醒排程失败');
    if (result.ok) setScheduled(result.scheduled);
  }, []);

  const refreshCount = useCallback(async (): Promise<void> => {
    await syncCount();
  }, [syncCount]);

  useEffect(() => {
    let alive = true;
    Promise.all([getReminderSettings(), getPermissionState(), scheduledCount()])
      .then(([settings, perm, count]) => {
        if (!alive) return;
        setEnabledState(settings.enabled);
        setPermission(perm);
        setScheduled(count);
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);

  // 待办变化 → 300ms 防抖重排；相同签名不重复写
  useEffect(() => {
    if (!enabled || !isInitialized) return;
    if (signature === lastSignatureRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      lastSignatureRef.current = signature;
      void refresh();
    }, 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, isInitialized, signature, refresh]);

  // 回前台重排：覆盖系统清理、时区/时间变化与通知被系统丢弃
  useEffect(() => {
    if (!enabled) return;
    const onChange = (next: AppStateStatus) => {
      if (next === 'active') void refresh();
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [enabled, refresh]);

  const setEnabled = useCallback(async (next: boolean): Promise<ReminderActionResult> => {
    try {
      if (!next) {
        await cancelAll();
        await setReminderEnabled(false);
        lastSignatureRef.current = '';
        setEnabledState(false);
        setScheduled(0);
        setError(null);
        return { ok: true, message: '已关闭，已排提醒已清空' };
      }

      const perm = await requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        return { ok: false, message: '未获得通知权限，请到系统设置中允许 HengSch 通知' };
      }

      const result = await rescheduleAll(todosRef.current);
      if (!result.ok) {
        setError(result.error ?? '排程失败');
        return { ok: false, message: result.error ?? '排程失败' };
      }

      await setReminderEnabled(true);
      // 强制下一次签名 effect 重新排一次，避免“关闭再开启”复用旧签名
      lastSignatureRef.current = '';
      setEnabledState(true);
      setScheduled(result.scheduled);
      setError(null);
      return { ok: true, message: `已开启，排入 ${result.scheduled} 条提醒` };
    } catch (err) {
      const message = err instanceof Error ? err.message : '提醒设置失败';
      setError(message);
      return { ok: false, message };
    }
  }, []);

  const testNotification = useCallback(async (): Promise<ReminderActionResult> => {
    try {
      const perm = await requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        return { ok: false, message: '未获得通知权限，无法发送测试提醒' };
      }
      await scheduleTestNotification();
      await syncCount();
      return { ok: true, message: '已排程：5 秒后应收到测试通知' };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : '测试提醒失败' };
    }
  }, [syncCount]);

  return (
    <ReminderContext.Provider
      value={{ enabled, permission, scheduled, error, setEnabled, refresh, refreshCount, testNotification }}
    >
      {children}
    </ReminderContext.Provider>
  );
}

export function useReminder(): ReminderContextValue {
  const ctx = useContext(ReminderContext);
  if (!ctx) throw new Error('useReminder must be used within ReminderProvider');
  return ctx;
}

/** 解析通知点击的 todoId；供 App 在初始化后定位详情 */
export function readNotificationTodoId(response: Notifications.NotificationResponse | null): string | null {
  const data = response?.notification.request.content.data;
  const id = data?.todoId;
  return typeof id === 'string' ? id : null;
}
