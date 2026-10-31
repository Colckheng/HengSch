import React, { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useTodos } from './TodoContext';
import { getReminderSettings } from '../utils/reminderSettings';
import { rescheduleAll } from '../notifications/reminderScheduler';
import type { Todo } from '@hengsch/shared-types';

interface ReminderContextValue {
  enabled: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const ReminderContext = createContext<ReminderContextValue | undefined>(undefined);

/**
 * 提醒生命周期：任务变化 / 回前台 / 初始化完成后重排；
 * 只有开关开启且拿到有效排程时才写通知，失败只记录错误、不清空待办。
 */
export function ReminderProvider({ children }: { children: ReactNode }): React.ReactElement {
  const { allTodos, isInitialized } = useTodos();
  const [enabled, setEnabled] = useState(false);
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

  const refresh = useCallback(async (): Promise<void> => {
    if (!enabledRef.current) return;
    const result = await rescheduleAll(todosRef.current);
    setError(result.ok ? null : result.error ?? '提醒排程失败');
  }, []);

  useEffect(() => {
    getReminderSettings()
      .then((settings) => setEnabled(settings.enabled))
      .catch(() => undefined);
  }, []);

  // 待办变化 → 300ms 防抖重排；重排期间签名不变则不重复写
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

  return (
    <ReminderContext.Provider value={{ enabled, error, refresh }}>
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
