import type { CycleType, RecurringTodo, Todo } from '@hengsch/shared-types';

const headerDateFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: 'long',
  day: 'numeric',
  weekday: 'long'
});

const shortDateFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: 'numeric',
  day: 'numeric'
});

const fullDateFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
});

export function formatHeaderDate(date: Date = new Date()): string {
  return headerDateFormatter.format(date);
}

export function formatShortDate(timestamp: number): string {
  return shortDateFormatter.format(new Date(timestamp));
}

export function formatFullDate(timestamp: number): string {
  return fullDateFormatter.format(new Date(timestamp));
}

export function getCycleLabel(cycleType: CycleType, customCycleDays?: number): string {
  switch (cycleType) {
    case 'daily':
      return '每天';
    case 'weekly':
      return '每周';
    case 'monthly':
      return '每月';
    case 'custom':
      return customCycleDays ? `每 ${customCycleDays} 天` : '自定义';
    default:
      return '循环事项';
  }
}

export function getTodoTypeLabel(todo: Todo): string {
  if (todo.type !== 'recurring') {
    return '一次性事项';
  }

  const recurringTodo = todo as RecurringTodo;
  return getCycleLabel(recurringTodo.cycleType, recurringTodo.customCycleDays);
}

export function getTodoStatusLabel(status: Todo['status']): string {
  return status === 'completed' ? '已完成' : '待推进';
}
