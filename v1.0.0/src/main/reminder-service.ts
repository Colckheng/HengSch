import type Store from 'electron-store';
import type { Todo, Group } from '@hengsch/shared-types';
import { shouldRemind } from '@hengsch/shared-logic';
import { presentPaper, removePaper, paperCapacity, onPaperAction, onPaperResolved, stopPaperWindow, type PaperAction } from './paper-window';
import { applyReminderCommand } from './reminder-command';
import { randomUUID } from 'crypto';

export interface ReminderSettings {
  /** 全局默认提前量（ms，0=到点）；仅新建待办时作为默认值，不追溯已建 */
  defaultLeadMs: number;
  /** 启动补弹是否包含今天的错过项之外的历史（默认 false 只补今天） */
  catchupAllMissed: boolean;
}

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  defaultLeadMs: 10 * 60_000,
  catchupAllMissed: false
};

export function getReminderSettings(store: Store): ReminderSettings {
  const raw = store.get('reminderSettings') as Partial<ReminderSettings> | undefined;
  return {
    defaultLeadMs:
      typeof raw?.defaultLeadMs === 'number' && raw.defaultLeadMs >= 0
        ? raw.defaultLeadMs
        : DEFAULT_REMINDER_SETTINGS.defaultLeadMs,
    catchupAllMissed: raw?.catchupAllMissed === true
  };
}

type PushToRenderer = (channel: string, payload: unknown) => void;
let storeRef: Store | null = null;
let push: PushToRenderer = () => undefined;
let timer: ReturnType<typeof setInterval> | undefined;
const active = new Map<string, number>();
const finishing = new Set<string>();
type OpenReminder = { todoId: string; remindAt: number };
function openReminders(): OpenReminder[] {
  const value = storeRef?.get('openPaperReminders'); return Array.isArray(value) ? value : [];
}
export function scanReminders(): void {
  if (!storeRef) return;
  const todos = (storeRef.get('todos') ?? []) as Todo[];
  const groups = (storeRef.get('groups') ?? []) as Group[];
  const now = Date.now(); const day = new Date(now); day.setHours(0,0,0,0);
  const settings = getReminderSettings(storeRef);
  const open = openReminders().filter(p => todos.some(t => t.id === p.todoId && t.remindAt === p.remindAt && shouldRemind(t, now)));
  for (const [id, at] of active) {
    if (!finishing.has(id) && !todos.some(t => t.id === id && t.remindAt === at && shouldRemind(t, now))) removePaper(id);
  }
  const due = todos.filter(t => shouldRemind(t, now) && (settings.catchupAllMissed || t.remindAt! >= day.getTime() || open.some(p => p.todoId === t.id && p.remindAt === t.remindAt)))
    .sort((a,b) => a.remindAt! - b.remindAt! || a.id.localeCompare(b.id));
  for (const todo of due) {
    if (!open.some(p => p.todoId === todo.id && p.remindAt === todo.remindAt)) open.push({ todoId: todo.id, remindAt: todo.remindAt! });
  }
  // Persist queued as well as visible reminders, including across midnight.
  if (JSON.stringify(open) !== JSON.stringify(openReminders())) storeRef.set('openPaperReminders', open);
  for (const todo of due) {
    if (active.size >= paperCapacity()) break;
    if (active.has(todo.id)) continue;
    const group = groups.find(g => g.id === todo.groupId && !g.deleted);
    active.set(todo.id, todo.remindAt!);
    if (!presentPaper({ todoId: todo.id, title: todo.title, description: todo.description, remindAt: todo.remindAt!, color: group?.color, group: group?.name })) active.delete(todo.id);
  }
}
function handleAction(command: PaperAction): void {
  if (!storeRef) throw new Error('Reminder service stopped');
  const queued = openReminders().some(p => p.todoId === command.todoId && p.remindAt === command.remindAt);
  if (active.get(command.todoId) !== command.remindAt && !queued) throw new Error('Stale reminder');
  const todos = (storeRef.get('todos') ?? []) as Todo[];
  let deviceId = storeRef.get('deviceId') as string | undefined;
  if (!deviceId) { deviceId = randomUUID(); storeRef.set('deviceId', deviceId); }
  const next = applyReminderCommand(todos, command, Date.now(), deviceId);
  storeRef.set({ todos: next, openPaperReminders: openReminders().filter(p => p.todoId !== command.todoId || p.remindAt !== command.remindAt) });
  finishing.add(command.todoId);
  push('sync:merged', { todos: next, groups: storeRef.get('groups') ?? [] });
}

export interface OpenReminderItem {
  todoId: string;
  remindAt: number;
  title: string;
  description?: string;
  group?: string;
  color?: string;
}

/** 主界面面板用：列出仍然有效的待处理提醒（含排队中尚未展示的） */
export function listOpenReminders(): OpenReminderItem[] {
  if (!storeRef) return [];
  const todos = (storeRef.get('todos') ?? []) as Todo[];
  const groups = (storeRef.get('groups') ?? []) as Group[];
  const now = Date.now();
  const items: OpenReminderItem[] = [];
  for (const queued of openReminders()) {
    const todo = todos.find(t => t.id === queued.todoId);
    if (!todo || todo.deleted || todo.status !== 'pending' || todo.remindAt !== queued.remindAt) continue;
    if (!shouldRemind(todo, now)) continue;
    const group = groups.find(g => g.id === todo.groupId && !g.deleted);
    items.push({ todoId: todo.id, remindAt: queued.remindAt, title: todo.title, description: todo.description, group: group?.name, color: group?.color });
  }
  return items.sort((a, b) => a.remindAt - b.remindAt || a.todoId.localeCompare(b.todoId));
}

/** 主界面面板用：与桌面纸片走同一条命令入口；成功后立即撤掉对应纸片 */
export function runReminderAction(command: PaperAction): { ok: boolean; error?: string } {
  try {
    handleAction(command);
    removePaper(command.todoId);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '操作未保存，请重试' };
  }
}
export function initReminderService(store: Store, pushToRenderer: PushToRenderer): void {
  storeRef = store; push = pushToRenderer;
  onPaperAction(handleAction);
  onPaperResolved(id => { active.delete(id); finishing.delete(id); });
  const safeScan = (): void => { try { scanReminders(); } catch (error) { console.error('Reminder scan failed', error); } };
  safeScan(); timer = setInterval(safeScan, 1000);
}
export function stopReminderService(): void {
  clearInterval(timer); timer = undefined; stopPaperWindow(); active.clear(); finishing.clear(); storeRef = null; push = () => undefined;
}
