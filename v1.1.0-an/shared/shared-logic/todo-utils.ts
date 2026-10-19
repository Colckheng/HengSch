import type { Todo, RecurringTodo, CycleType } from '../shared-types';
import { advanceRecurringRemind } from './reminder';

/** monthly +1 月：保留时刻，日期超目标月天数时收敛到月末（1/31 → 2/28） */
function addOneMonth(from: number): number {
  const d = new Date(from);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d.getTime();
}

function stepCycle(cycleType: CycleType, customCycleDays: number | undefined, from: number): number | undefined {
  switch (cycleType) {
    case 'daily':
      return from + 24 * 60 * 60 * 1000;
    case 'weekly':
      return from + 7 * 24 * 60 * 60 * 1000;
    case 'monthly':
      return addOneMonth(from);
    case 'custom':
      if (customCycleDays && customCycleDays > 0) return from + customCycleDays * 24 * 60 * 60 * 1000;
      return undefined;
    default:
      return undefined;
  }
}

/**
 * 计算循环任务的下次到期时间（保时刻推进）
 * @param anchor 上一轮 nextDueDate（保 HH:MM 不漂移）；缺省视为"当前时刻"
 * - anchor 尚未到期（提前完成后又取消完成）→ 维持本周期，不跳轮
 * - anchor 已过期 → 按周期逐轮推进到严格晚于 now 的最近一轮
 */
export function calculateNextDueDate(
  cycleType: CycleType,
  customCycleDays?: number,
  anchor: number = Date.now(),
  now: number = Date.now()
): number | undefined {
  if (anchor > now) return anchor;
  let base = anchor;
  for (let i = 0; i < 500; i++) {
    const next = stepCycle(cycleType, customCycleDays, base);
    if (next === undefined) return undefined;
    if (next > now) return next;
    base = next;
  }
  return base;
}

/**
 * 切换待办事项状态，如果是循环任务且从完成变为待办，计算下次到期时间
 */
export function toggleTodoStatus(todo: Todo): Todo {
  const newStatus = todo.status === 'completed' ? 'pending' : 'completed';
  const completedAt = newStatus === 'completed' ? Date.now() : undefined;

  if (todo.type === 'recurring' && newStatus === 'pending') {
    const recurringTodo = todo as RecurringTodo;
    const nextDueDate = calculateNextDueDate(
      recurringTodo.cycleType,
      recurringTodo.customCycleDays,
      recurringTodo.nextDueDate ?? Date.now()
    );
    // 推进下一周期时同步重算提醒（配置过提醒的才生成新 remindAt）
    return {
      ...advanceRecurringRemind(recurringTodo, nextDueDate),
      status: 'pending',
      completedAt: undefined
    };
  }

  return {
    ...todo,
    status: newStatus,
    completedAt
  };
}

/**
 * 按状态排序待办事项：待办在前，已完成在后
 */
export function sortTodosByStatus(todos: Todo[]): Todo[] {
  return [
    ...todos.filter((todo) => todo.status === 'pending'),
    ...todos.filter((todo) => todo.status === 'completed')
  ];
}

/**
 * 按分组筛选待办事项
 */
export function filterTodosByGroup(todos: Todo[], groupId?: string): Todo[] {
  if (!groupId) {
    return todos.filter((todo) => !todo.groupId || todo.groupId === 'default');
  }
  return todos.filter((todo) => todo.groupId === groupId);
}

/**
 * 生成新的待办事项ID
 */
export function generateTodoId(): string {
  return Date.now().toString();
}

/**
 * 生成新的分组ID
 */
export function generateGroupId(): string {
  return Date.now().toString();
}
