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

/**
 * 循环待办展开：从 nextDueDate 起按周期逐轮推进，只收「触发时间晚于 now 且在视窗内」的条目。
 * 窗口按触发时间（due - lead）判断，避免提前量把边界条目挤出去。
 */
function recurringItems(todo: RecurringTodo, now: number, horizonMs: number, limit: number): ReminderScheduleItem[] {
  const lead = typeof todo.remindLeadMs === 'number' ? Math.max(0, todo.remindLeadMs) : 0;
  let due = todo.nextDueDate
    ?? (typeof todo.remindAt === 'number' ? todo.remindAt + lead : undefined);
  if (typeof due !== 'number' || !Number.isFinite(due)) return [];

  const out: ReminderScheduleItem[] = [];
  const horizonEnd = now + horizonMs;
  for (let i = 0; i < MAX_STEPS && out.length < limit; i += 1) {
    const at = due - lead;
    if (at <= now) {
      const next = stepCycleDate(todo.cycleType, todo.customCycleDays, due);
      if (typeof next !== 'number' || next <= due) break;
      due = next;
      continue;
    }
    if (at > horizonEnd) break;
    out.push({ todoId: todo.id, title: todo.title, at });
    const next = stepCycleDate(todo.cycleType, todo.customCycleDays, due);
    if (typeof next !== 'number' || next <= due) break;
    due = next;
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
