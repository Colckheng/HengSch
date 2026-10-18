import { it } from 'node:test';
import assert from 'node:assert/strict';
import { applyReminderCommand } from './reminder-command';
import type { Todo } from '@hengsch/shared-types';
const todo: Todo = { id: 'one', title: '提醒', type: 'once', status: 'pending', createdAt: 1, updatedAt: 10, order: 0, remindAt: 100 };
it('dismiss stamps only this reminder and does not mutate the original', () => {
  const [next] = applyReminderCommand([todo], { todoId: 'one', remindAt: 100, action: 'dismiss' }, 200, 'local');
  assert.equal(next.status, 'pending'); assert.equal(next.remindedAt, 200); assert.equal(next.deleted, undefined); assert.equal(todo.remindedAt, undefined);
});
it('snooze clears the stamp and preserves the target due date', () => {
  const [next] = applyReminderCommand([{ ...todo, remindedAt: 110 }], { todoId: 'one', remindAt: 100, action: 'snooze', snoozeAt: 400 }, 200, 'local');
  assert.equal(next.remindAt, 400); assert.equal(next.remindedAt, undefined);
});
it('rejects stale, deleted, completed and invalid snooze commands', () => {
  for (const t of [{ ...todo, remindAt: 101 }, { ...todo, deleted: true }, { ...todo, status: 'completed' as const }]) assert.throws(() => applyReminderCommand([t], { todoId: 'one', remindAt: 100, action: 'dismiss' }, 200, 'local'));
  for (const snoozeAt of [undefined, NaN, Infinity, 199, 200]) assert.throws(() => applyReminderCommand([todo], { todoId: 'one', remindAt: 100, action: 'snooze', snoozeAt }, 200, 'local'));
});
it('completes recurring task without advancing its cycle and advances revision monotonically', () => {
  const [next] = applyReminderCommand([{ ...todo, type: 'recurring', cycleType: 'daily', nextDueDate: 1000, updatedAt: 500 }], { todoId: 'one', remindAt: 100, action: 'complete' }, 200, 'local');
  assert.equal(next.status, 'completed'); assert.equal(next.completedAt, 200); assert.equal(next.updatedAt, 501);
  assert.equal(next.type === 'recurring' && 'nextDueDate' in next ? next.nextDueDate : undefined, 1000);
});
