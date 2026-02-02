import type { Todo, RecurringTodo, CycleType } from '../shared-types';

/**
 * 计算循环任务的下次到期时间
 */
export function calculateNextDueDate(
  cycleType: CycleType,
  customCycleDays?: number,
  currentTime: number = Date.now()
): number | undefined {
  switch (cycleType) {
    case 'daily':
      return currentTime + 24 * 60 * 60 * 1000;
    case 'weekly':
      return currentTime + 7 * 24 * 60 * 60 * 1000;
    case 'monthly': {
      const nextMonth = new Date(currentTime);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      return nextMonth.getTime();
    }
    case 'custom':
      if (customCycleDays && customCycleDays > 0) {
        return currentTime + customCycleDays * 24 * 60 * 60 * 1000;
      }
      return undefined;
    default:
      return undefined;
  }
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
      recurringTodo.customCycleDays
    );
    return {
      ...recurringTodo,
      status: newStatus,
      completedAt,
      nextDueDate
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
