import type { Todo } from '@hengsch/shared-types';
import type { ReminderCommand } from '../paper-reminder/protocol';

/** Pure validation and mutation; callers persist before acknowledging the UI. */
export function applyReminderCommand(todos: Todo[], command: ReminderCommand, now: number, deviceId: string): Todo[] {
  const todo = todos.find((item) => item.id === command.todoId);
  if (!todo || todo.deleted || todo.status !== 'pending' || todo.remindAt !== command.remindAt) throw new Error('提醒已失效，请查看最新待办');
  if (!['complete', 'snooze', 'dismiss'].includes(command.action)) throw new Error('无效操作');
  if (command.action === 'snooze' && (!Number.isFinite(command.snoozeAt) || command.snoozeAt! <= now)) throw new Error('请选择将来的时间');
  const next: Todo = { ...todo, updatedAt: Math.max(now, (todo.updatedAt ?? 0) + 1), deviceId };
  if (command.action === 'complete') { next.status = 'completed'; next.completedAt = now; next.remindedAt = now; }
  else if (command.action === 'snooze') { next.remindAt = command.snoozeAt; delete next.remindedAt; }
  else next.remindedAt = Math.max(now, command.remindAt);
  return todos.map((item) => item.id === todo.id ? next : item);
}
