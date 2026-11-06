import type { Todo, RecurringTodo } from '@hengsch/shared-types';
import { stepCycleDate } from './todo-utils';

export interface ReminderScheduleItem {
  todoId: string;
  title: string;
  /** 实际触发时间（已扣除提前量） */
  at: number;
}

const DAY = 24 * 60 * 60 * 1000;
const DEFAULT_HORIZON = 7 * DAY;
const DEFAULT_LIMIT = 50;
const MAX_STEPS = 500;

function isRecurring(todo: Todo): todo is RecurringTodo {
  return todo.type === 'recurring' && 'cycleType' in todo;
}

function recurringItems(todo: RecurringTodo, now: number, horizonMs: number, limit: number): ReminderScheduleItem[] {
  const currentAt = todo.remindAt;
  if (typeof currentAt !== 'number' || !Number.isFinite(currentAt)) return [];
  const lead = typeof todo.remindLeadMs === 'number' ? Math.max(0, todo.remindLeadMs) : 0;
  let due = todo.nextDueDate ?? currentAt + lead;
  if (!Number.isFinite(due)) return [];

  const out: ReminderScheduleItem[] = [];
  const horizonEnd = now + horizonMs;
  const remindedAt = todo.remindedAt ?? -Infinity;
  if (currentAt > now && currentAt > remindedAt && currentAt <= horizonEnd) {
    out.push({ todoId: todo.id, title: todo.title, at: currentAt });
  }
  // 稍后只替代本轮，跨过的周期合并到本次提醒，后续仍沿原锚点。
  const resumeAfter = Math.max(now, currentAt, remindedAt);
  for (let i = 0; i < MAX_STEPS && out.length < limit; i += 1) {
    const next = stepCycleDate(todo.cycleType, todo.customCycleDays, due);
    if (typeof next !== 'number' || next <= due) break;
    due = next;
    const at = due - lead;
    if (at <= resumeAfter) continue;
    if (at > horizonEnd) break;
    out.push({ todoId: todo.id, title: todo.title, at });
  }
  return out;
}

/**
 * 生成设备本地通知排程：单次取 remindAt，循环按周期展开未来视窗。
 * 只返回未来条目；同一 todoId 同一时刻只保留一条；按时间升序，最多 limit 条。
 */
export function buildReminderSchedule(
  todos: Todo[],
  now: number,
  horizonMs: number = DEFAULT_HORIZON,
  limit: number = DEFAULT_LIMIT
): ReminderScheduleItem[] {
  const items: ReminderScheduleItem[] = [];
  for (const todo of todos) {
    if (todo.deleted || todo.status !== 'pending') continue;
    if (isRecurring(todo)) {
      items.push(...recurringItems(todo, now, horizonMs, limit));
    } else if (typeof todo.remindAt === 'number' && todo.remindAt > now) {
      items.push({ todoId: todo.id, title: todo.title, at: todo.remindAt });
    }
  }

  const sorted = items.sort((a, b) => a.at - b.at);
  const seen = new Set<string>();
  const deduped: ReminderScheduleItem[] = [];
  for (const item of sorted) {
    const key = `${item.todoId}@${item.at}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
    if (deduped.length >= limit) break;
  }
  return deduped;
}
