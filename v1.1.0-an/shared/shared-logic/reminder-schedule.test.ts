import { describe, it, expect } from 'vitest';
import { buildReminderSchedule } from './reminder-schedule';
import { advanceRecurringRemind, rescheduleRemind } from './reminder';
import type { Todo, RecurringTodo } from '@hengsch/shared-types';

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
    const todos: Todo[] = [daily({ id: 'r', nextDueDate: NOW + DAY, remindAt: NOW + DAY - 600_000, remindLeadMs: 600_000 })];
    const result = buildReminderSchedule(todos, NOW);
    expect(result).toHaveLength(7);
    expect(result[0]).toEqual({ todoId: 'r', title: '每日打卡', at: NOW + DAY - 600_000 });
    for (let i = 1; i < result.length; i += 1) {
      expect(result[i].at - result[i - 1].at).toBe(DAY);
    }
  });

  it('循环 nextDueDate 已过期时推进到下一次，不返回过去时间', () => {
    const todos: Todo[] = [daily({ id: 'r', nextDueDate: NOW - 2 * DAY, remindAt: NOW - 2 * DAY - 600_000, remindLeadMs: 600_000 })];
    const result = buildReminderSchedule(todos, NOW);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((item) => item.at > NOW)).toBe(true);
  });

  it('配置提醒但无 remindLeadMs 时按到点触发', () => {
    const todos: Todo[] = [daily({ id: 'r', nextDueDate: NOW + DAY, remindAt: NOW + DAY })];
    const result = buildReminderSchedule(todos, NOW);
    expect(result[0].at).toBe(NOW + DAY);
  });

  it('自定义周期按天数展开', () => {
    const todos: Todo[] = [daily({ id: 'c', cycleType: 'custom', customCycleDays: 3, nextDueDate: NOW + DAY, remindAt: NOW + DAY })];
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
    const todos: Todo[] = [daily({ id: 'r', nextDueDate: NOW + 30_000, remindAt: NOW - 570_000, remindLeadMs: 600_000 })];
    const result = buildReminderSchedule(todos, NOW);
    expect(result.every((item) => item.at > NOW)).toBe(true);
    expect(result[0].at).toBeGreaterThan(NOW);
  });

  it('有循环锚点但未配置提醒时不排通知', () => {
    expect(buildReminderSchedule([daily({ nextDueDate: NOW + DAY })], NOW)).toEqual([]);
  });

  it('清除提醒后保留循环锚点，续期也不恢复通知', () => {
    const cleared = daily({ nextDueDate: NOW + DAY, remindAt: undefined, remindLeadMs: undefined, remindedAt: undefined }) as RecurringTodo;
    expect(buildReminderSchedule([cleared], NOW)).toEqual([]);
    const advanced = advanceRecurringRemind(cleared, NOW + 2 * DAY);
    expect(buildReminderSchedule([advanced], NOW)).toEqual([]);
  });

  it('稍后一小时只推迟本次提醒，后续仍沿原锚点', () => {
    const todo = daily({ nextDueDate: NOW + 300_000, remindAt: NOW + 300_000, remindLeadMs: 0 });
    const snoozed = rescheduleRemind(todo, NOW + 3_600_000);
    const result = buildReminderSchedule([snoozed], NOW);
    expect(result[0].at).toBe(NOW + 3_600_000);
    expect(result[1].at).toBe(NOW + DAY + 300_000);
    expect((snoozed as RecurringTodo).nextDueDate).toBe(NOW + 300_000);
  });

  it('当前锚点已过期时稍后仍在指定时刻触发', () => {
    const snoozed = daily({ nextDueDate: NOW - DAY, remindAt: NOW + 3_600_000, remindLeadMs: 0 });
    const result = buildReminderSchedule([snoozed], NOW);
    expect(result[0].at).toBe(NOW + 3_600_000);
    expect(result[1].at).toBe(NOW + DAY);
  });

  it.each([DAY + 300_000, 2 * DAY + 3_600_000])('延后跨过后续周期时合并重叠提醒：%i', (delay) => {
    const todo = daily({ nextDueDate: NOW + 300_000, remindAt: NOW + delay, remindLeadMs: 0 });
    const result = buildReminderSchedule([todo], NOW);
    expect(result[0].at).toBe(NOW + delay);
    expect(result.filter(item => item.at === NOW + delay)).toHaveLength(1);
    expect(result.slice(1).every(item => item.at > NOW + delay)).toBe(true);
    expect(result[1].at).toBe(NOW + (delay === DAY + 300_000 ? 2 : 3) * DAY + 300_000);
  });

  it('稍后超过排程视窗时不提前插入原周期通知', () => {
    const todo = daily({ nextDueDate: NOW + 300_000, remindAt: NOW + 8 * DAY, remindLeadMs: 0 });
    expect(buildReminderSchedule([todo], NOW)).toEqual([]);
  });

  it('本次已触发的提醒不重排，后续周期继续排程', () => {
    const todo = daily({ nextDueDate: NOW + 300_000, remindAt: NOW + 300_000, remindLeadMs: 0, remindedAt: NOW + 300_000 });
    const result = buildReminderSchedule([todo], NOW);
    expect(result[0].at).toBe(NOW + DAY + 300_000);
  });
});
