import { describe, it, expect } from 'vitest';
import { buildReminderSchedule } from './reminder-schedule';
import type { Todo } from '@hengsch/shared-types';

const NOW = Date.parse('2026-10-31T08:00:00+08:00');
const DAY = 24 * 60 * 60 * 1000;

const once = (overrides: Partial<Todo> = {}): Todo => ({
  id: 'a',
  title: '报销',
  type: 'once',
  status: 'pending',
  createdAt: 1,
  updatedAt: 1,
  order: 0,
  ...overrides
} as Todo);

const daily = (overrides: Record<string, unknown> = {}): Todo => ({
  id: 'r',
  title: '每日打卡',
  type: 'recurring',
  cycleType: 'daily',
  status: 'pending',
  createdAt: 1,
  updatedAt: 1,
  order: 0,
  ...overrides
} as Todo);

describe('buildReminderSchedule', () => {
  it('单次只保留未来 remindAt，跳过墓碑/已完成/无提醒', () => {
    const todos: Todo[] = [
      once({ id: 'a', remindAt: NOW + 60_000 }),
      once({ id: 'b', remindAt: NOW - 60_000 }),
      once({ id: 'c', status: 'completed', remindAt: NOW + 60_000 }),
      once({ id: 'd', deleted: true, remindAt: NOW + 60_000 }),
      once({ id: 'e' })
    ];
    expect(buildReminderSchedule(todos, NOW)).toEqual([
      { todoId: 'a', title: '报销', at: NOW + 60_000 }
    ]);
  });

  it('循环按 nextDueDate - lead 展开 7 天并保持升序', () => {
    const todos: Todo[] = [daily({ id: 'r', nextDueDate: NOW + DAY, remindLeadMs: 600_000 })];
    const result = buildReminderSchedule(todos, NOW);
    expect(result).toHaveLength(7);
    expect(result[0]).toEqual({ todoId: 'r', title: '每日打卡', at: NOW + DAY - 600_000 });
    for (let i = 1; i < result.length; i += 1) {
      expect(result[i].at - result[i - 1].at).toBe(DAY);
    }
  });

  it('循环 nextDueDate 已过期时推进到下一次，不返回过去时间', () => {
    const todos: Todo[] = [daily({ id: 'r', nextDueDate: NOW - 2 * DAY, remindLeadMs: 600_000 })];
    const result = buildReminderSchedule(todos, NOW);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((item) => item.at > NOW)).toBe(true);
  });

  it('循环无 remindLeadMs 时按到点触发', () => {
    const todos: Todo[] = [daily({ id: 'r', nextDueDate: NOW + DAY })];
    const result = buildReminderSchedule(todos, NOW);
    expect(result[0].at).toBe(NOW + DAY);
  });

  it('自定义周期按天数展开', () => {
    const todos: Todo[] = [daily({ id: 'c', cycleType: 'custom', customCycleDays: 3, nextDueDate: NOW + DAY })];
    const result = buildReminderSchedule(todos, NOW);
    expect(result.length).toBe(3);
    expect(result[1].at - result[0].at).toBe(3 * DAY);
  });

  it('同一 todoId 同一时刻只保留一条', () => {
    const todos: Todo[] = [
      once({ id: 'dup', remindAt: NOW + 60_000 }),
      once({ id: 'dup', remindAt: NOW + 60_000 })
    ];
    expect(buildReminderSchedule(todos, NOW)).toHaveLength(1);
  });

  it('总数受 limit 限制且保持全局升序', () => {
    const todos: Todo[] = Array.from({ length: 60 }, (_, i) =>
      once({ id: `t${i}`, remindAt: NOW + (i + 1) * 60_000 })
    );
    const result = buildReminderSchedule(todos, NOW, undefined, 10);
    expect(result).toHaveLength(10);
    expect(result[0].at).toBe(NOW + 60_000);
    expect(result[9].at).toBe(NOW + 10 * 60_000);
  });

  it('无提醒或无有效循环锚点时返回空', () => {
    expect(buildReminderSchedule([], NOW)).toEqual([]);
    expect(buildReminderSchedule([daily({ id: 'x', nextDueDate: undefined, remindAt: undefined })], NOW)).toEqual([]);
  });

  it('视窗按触发时间判断：提前量把触发点推进 now 之前则不排', () => {
    const todos: Todo[] = [daily({ id: 'r', nextDueDate: NOW + 30_000, remindLeadMs: 600_000 })];
    const result = buildReminderSchedule(todos, NOW);
    expect(result.every((item) => item.at > NOW)).toBe(true);
    expect(result[0].at).toBeGreaterThan(NOW);
  });
});
