import { describe, it, expect } from 'vitest';
import {
  shouldRemind,
  computeRemindAt,
  stampReminded,
  rescheduleRemind,
  advanceRecurringRemind
} from './reminder';
import { toggleTodoStatus } from './todo-utils';
import type { Todo, RecurringTodo } from '@hengsch/shared-types';

const NOW = Date.parse('2026-10-14T12:00:00');
const HOUR = 3_600_000;

const base = (over: Partial<RecurringTodo> & { id: string }): RecurringTodo => ({
  title: 'task',
  type: 'recurring',
  cycleType: 'daily',
  status: 'pending',
  createdAt: NOW - HOUR,
  order: 0,
  ...over
});

describe('shouldRemind', () => {
  it('无 remindAt → 不弹', () => {
    expect(shouldRemind(base({ id: 'a' }) as Todo, NOW)).toBe(false);
  });

  it('remindAt 未到 → 不弹', () => {
    expect(shouldRemind(base({ id: 'a', remindAt: NOW + 1 }) as Todo, NOW)).toBe(false);
  });

  it('remindAt 已到且未弹过 → 弹', () => {
    expect(shouldRemind(base({ id: 'a', remindAt: NOW - 1 }) as Todo, NOW)).toBe(true);
  });

  it('本次已弹过（remindedAt >= remindAt）→ 不弹', () => {
    expect(
      shouldRemind(base({ id: 'a', remindAt: NOW - HOUR, remindedAt: NOW - 60_000 }) as Todo, NOW)
    ).toBe(false);
  });

  it('snooze 后（remindedAt < 新 remindAt 但新时间未到）→ 不弹', () => {
    expect(
      shouldRemind(
        base({ id: 'a', remindAt: NOW + HOUR, remindedAt: NOW - 60_000 }) as Todo,
        NOW
      )
    ).toBe(false);
  });

  it('已完成 / 墓碑 → 不弹', () => {
    expect(
      shouldRemind(base({ id: 'a', remindAt: NOW - 1, status: 'completed' }) as Todo, NOW)
    ).toBe(false);
    expect(shouldRemind(base({ id: 'a', remindAt: NOW - 1, deleted: true }) as Todo, NOW)).toBe(
      false
    );
  });
});

describe('computeRemindAt', () => {
  it('目标时间减提前量', () => {
    expect(computeRemindAt(NOW, 10 * 60_000)).toBe(NOW - 600_000);
  });

  it('提前量为 0 → 到点即弹', () => {
    expect(computeRemindAt(NOW, 0)).toBe(NOW);
  });

  it('负提前量按 0 处理', () => {
    expect(computeRemindAt(NOW, -5)).toBe(NOW);
  });
});

describe('stampReminded / rescheduleRemind', () => {
  it('盖章后本次不再弹', () => {
    const t = stampReminded(base({ id: 'a', remindAt: NOW - 1 }) as Todo, NOW);
    expect(t.remindedAt).toBe(NOW);
    expect(shouldRemind(t, NOW + 1)).toBe(false);
  });

  it('reschedule 清 remindedAt 允许再弹', () => {
    const t = rescheduleRemind(
      base({ id: 'a', remindAt: NOW - 1, remindedAt: NOW }) as Todo,
      NOW + HOUR
    );
    expect(t.remindAt).toBe(NOW + HOUR);
    expect(t.remindedAt).toBeUndefined();
    expect(shouldRemind(t, NOW + HOUR)).toBe(true);
  });
});

describe('advanceRecurringRemind', () => {
  it('配置过提前量 → 重算到下一周期并清章', () => {
    const t = advanceRecurringRemind(
      base({ id: 'a', remindAt: NOW - 1, remindedAt: NOW, remindLeadMs: 600_000 }),
      NOW + HOUR
    );
    expect(t.remindAt).toBe(NOW + HOUR - 600_000);
    expect(t.remindedAt).toBeUndefined();
    expect((t as RecurringTodo).nextDueDate).toBe(NOW + HOUR);
  });

  it('未配置提醒 → 清残留 remindAt/remindedAt', () => {
    const t = advanceRecurringRemind(base({ id: 'a', remindAt: NOW - 1, remindedAt: NOW }), NOW + HOUR);
    expect(t.remindAt).toBeUndefined();
    expect(t.remindedAt).toBeUndefined();
  });

  it('nextDueDate 无效 → 清残留提醒不生成新提醒', () => {
    const t = advanceRecurringRemind(
      base({ id: 'a', remindAt: NOW - 1, remindLeadMs: 600_000 }),
      undefined
    );
    expect(t.remindAt).toBeUndefined();
  });
});

describe('toggleTodoStatus · 循环提醒联动', () => {
  it('完成再打开 → remindAt 推到下一周期', () => {
    const once = base({ id: 'a', remindLeadMs: 600_000, remindAt: NOW - 1, remindedAt: NOW });
    const completed = toggleTodoStatus(once as Todo);
    expect(completed.status).toBe('completed');
    const reopened = toggleTodoStatus(completed);
    const r = reopened as RecurringTodo;
    expect(r.status).toBe('pending');
    expect(r.nextDueDate).toBeGreaterThan(NOW);
    expect(r.remindAt).toBe((r.nextDueDate ?? 0) - 600_000);
    expect(r.remindedAt).toBeUndefined();
  });

  it('未配置提醒的循环待办打开后仍无 remindAt', () => {
    const completed = toggleTodoStatus(base({ id: 'b' }) as Todo);
    const reopened = toggleTodoStatus(completed) as RecurringTodo;
    expect(reopened.remindAt).toBeUndefined();
  });
});
