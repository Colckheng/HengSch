import type { Todo, RecurringTodo } from '@hengsch/shared-types';

/** 提醒判定：pending 且 remindAt 已到，且本次提醒尚未弹过 */
export function shouldRemind(todo: Todo, now: number): boolean {
  if (todo.deleted || todo.status !== 'pending') return false;
  if (typeof todo.remindAt !== 'number') return false;
  if (now < todo.remindAt) return false;
  if (typeof todo.remindedAt === 'number' && todo.remindedAt >= todo.remindAt) return false;
  return true;
}

/** 由用户选定的"目标时间"与提前量算出实际触发时间 */
export function computeRemindAt(targetTime: number, leadMs: number): number {
  return targetTime - Math.max(0, leadMs);
}

/** 盖章：本次提醒已弹出 */
export function stampReminded(todo: Todo, now: number): Todo {
  return { ...todo, remindedAt: now };
}

/** snooze / 改期：允许重新触发 */
export function rescheduleRemind(todo: Todo, remindAt: number): Todo {
  return { ...todo, remindAt, remindedAt: undefined };
}

/**
 * 循环待办推进到下一轮时重算提醒：
 * 仅当该待办配置过提醒（remindLeadMs 存在）且下一轮到期时间有效才生成新的 remindAt，
 * 否则清掉残留的 remindAt/remindedAt（避免旧周期的提醒跟到新周期）。
 */
export function advanceRecurringRemind(
  todo: RecurringTodo,
  nextDueDate: number | undefined
): Todo {
  const { remindAt: _ra, remindedAt: _rd, ...rest } = todo;
  if (typeof todo.remindLeadMs !== 'number' || typeof nextDueDate !== 'number') {
    return { ...rest, nextDueDate };
  }
  return {
    ...rest,
    nextDueDate,
    remindAt: computeRemindAt(nextDueDate, todo.remindLeadMs),
    remindedAt: undefined
  };
}
