import { describe, it, expect } from 'vitest';
import { calculateNextDueDate, toggleTodoStatus } from './todo-utils';
import type { Todo, RecurringTodo } from '@hengsch/shared-types';

const at = (iso: string): number => Date.parse(iso);
const HOUR = 3_600_000;

describe('calculateNextDueDate · 保时刻推进', () => {
  it('daily：锚点保 HH:MM，推进到严格晚于 now 的最近一轮', () => {
    const anchor = at('2026-10-14T09:00:00');
    const now = at('2026-10-14T10:30:00');
    expect(calculateNextDueDate('daily', undefined, anchor, now)).toBe(at('2026-10-15T09:00:00'));
  });

  it('daily：逾期多轮 → 逐轮滚到未来（不按 now+24h 漂移）', () => {
    const anchor = at('2026-10-10T09:00:00');
    const now = at('2026-10-14T10:00:00');
    expect(calculateNextDueDate('daily', undefined, anchor, now)).toBe(at('2026-10-15T09:00:00'));
  });

  it('anchor 尚未到期（取消完成）→ 维持本周期不跳轮', () => {
    const anchor = at('2026-10-14T14:00:00');
    const now = at('2026-10-14T10:00:00');
    expect(calculateNextDueDate('daily', undefined, anchor, now)).toBe(anchor);
  });

  it('weekly：保星期与时刻', () => {
    const anchor = at('2026-10-12T09:30:00'); // 周一
    const now = at('2026-10-14T12:00:00');
    const next = calculateNextDueDate('weekly', undefined, anchor, now)!;
    expect(new Date(next).getDay()).toBe(1);
    expect(new Date(next).getHours()).toBe(9);
    expect(new Date(next).getMinutes()).toBe(30);
    expect(next).toBe(at('2026-10-19T09:30:00'));
  });

  it('monthly：同日同时刻 +1 月', () => {
    const anchor = at('2026-01-15T09:00:00');
    const now = at('2026-01-20T00:00:00');
    expect(calculateNextDueDate('monthly', undefined, anchor, now)).toBe(at('2026-02-15T09:00:00'));
  });

  it('monthly 月尾：1/31 → 2/28（收敛月末，不滚到 3/3）', () => {
    const anchor = at('2026-01-31T09:00:00');
    const now = at('2026-02-01T00:00:00');
    expect(calculateNextDueDate('monthly', undefined, anchor, now)).toBe(at('2026-02-28T09:00:00'));
  });

  it('monthly 月尾：1/31 → 2/28 收敛，后续锚为 28 → 3/28；31 日锚 → 4/30', () => {
    expect(calculateNextDueDate('monthly', undefined, at('2026-01-31T09:00:00'), at('2026-02-01T00:00:00')))
      .toBe(at('2026-02-28T09:00:00'));
    expect(calculateNextDueDate('monthly', undefined, at('2026-02-28T09:00:00'), at('2026-03-05T00:00:00')))
      .toBe(at('2026-03-28T09:00:00'));
    expect(calculateNextDueDate('monthly', undefined, at('2026-03-31T09:00:00'), at('2026-04-01T00:00:00')))
      .toBe(at('2026-04-30T09:00:00'));
  });

  it('custom：N 天保时刻，缺天数返回 undefined', () => {
    const anchor = at('2026-10-14T09:00:00');
    const now = at('2026-10-14T12:00:00');
    expect(calculateNextDueDate('custom', 3, anchor, now)).toBe(at('2026-10-17T09:00:00'));
    expect(calculateNextDueDate('custom', undefined, anchor, now)).toBeUndefined();
  });

  it('缺省 anchor/now 走当前时间（向后兼容）', () => {
    const next = calculateNextDueDate('daily', undefined)!;
    expect(next).toBeGreaterThan(Date.now() + 23 * HOUR);
  });

  it('500 轮上限耗尽 → 返回最后一步（可能是过去时刻）', () => {
    const now = at('2026-10-14T10:00:00');
    const anchor = now - 501 * 24 * HOUR;
    const result = calculateNextDueDate('daily', undefined, anchor, now)!;
    // 循环恰好转满 500 步：anchor + 500 天，仍早于 now
    expect(result).toBe(anchor + 500 * 24 * HOUR);
    expect(result).toBeLessThan(now);
  });
});

// D-3 DST：daily/weekly 为绝对毫秒步进（跨切换日本地 HH:MM 漂移 ±1h），
// monthly 走日历步进保时刻。TZ 在文件顶层设置，覆盖后续 Date 行为。
process.env.TZ = 'America/New_York';

describe('calculateNextDueDate · DST（America/New_York）', () => {
  const ny = (iso: string): number => Date.parse(iso);

  it('daily 跨春令时（2026-03-08 2:00→3:00）：绝对 +24h，本地时刻 +1h', () => {
    // 2026-03-07 09:00 EST，+24h 后为 2026-03-08 10:00 EDT
    const anchor = ny('2026-03-07T09:00:00');
    const now = ny('2026-03-07T10:00:00');
    const next = calculateNextDueDate('daily', undefined, anchor, now)!;
    expect(next).toBe(anchor + 24 * HOUR);
    expect(new Date(next).getHours()).toBe(10);
    expect(new Date(next).getDate()).toBe(8);
  });

  it('daily 跨冬令时（2026-11-01 2:00→1:00）：绝对 +24h，本地时刻 -1h', () => {
    // 2026-10-31 09:00 EDT，+24h 后为 2026-11-01 08:00 EST
    const anchor = ny('2026-10-31T09:00:00');
    const now = ny('2026-10-31T12:00:00');
    const next = calculateNextDueDate('daily', undefined, anchor, now)!;
    expect(next).toBe(anchor + 24 * HOUR);
    expect(new Date(next).getHours()).toBe(8);
    expect(new Date(next).getDate()).toBe(1);
  });

  it('monthly 跨 DST：日历步进保本地 HH:MM', () => {
    // 2026-03-01 09:00 EST → 2026-04-01 09:00 EDT（时刻不变）
    const anchor = ny('2026-03-01T09:00:00');
    const now = ny('2026-03-15T00:00:00');
    const next = calculateNextDueDate('monthly', undefined, anchor, now)!;
    const d = new Date(next);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(3);
    expect(d.getDate()).toBe(1);
    expect(d.getHours()).toBe(9);
  });

  it('weekly 跨冬令时：绝对 7×24h，本地时刻 -1h', () => {
    const anchor = ny('2026-10-25T09:00:00'); // 周日 EDT
    const now = ny('2026-10-26T00:00:00');
    const next = calculateNextDueDate('weekly', undefined, anchor, now)!;
    expect(next).toBe(anchor + 7 * 24 * HOUR);
    expect(new Date(next).getHours()).toBe(8);
  });
});

describe('toggleTodoStatus · 锚定 nextDueDate', () => {
  const recurring = (over: Partial<RecurringTodo> & { id: string }): RecurringTodo => ({
    title: 'task',
    type: 'recurring',
    cycleType: 'daily',
    status: 'completed',
    createdAt: Date.now() - HOUR,
    order: 0,
    ...over
  });

  it('用存储的 nextDueDate 作锚：过去 09:00 的循环重开后仍是 09:00', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(9, 0, 0, 0);
    const todo = recurring({ id: 'a', nextDueDate: yesterday.getTime() }) as Todo;
    const reopened = toggleTodoStatus(todo) as RecurringTodo;
    expect(reopened.status).toBe('pending');
    const d = new Date(reopened.nextDueDate!);
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(0);
    expect(reopened.nextDueDate).toBeGreaterThan(Date.now());
  });

  it('nextDueDate 未到（提前完成后取消完成）→ 不跳轮', () => {
    const soon = Date.now() + 2 * HOUR;
    const todo = recurring({ id: 'b', nextDueDate: soon }) as Todo;
    const reopened = toggleTodoStatus(todo) as RecurringTodo;
    expect(reopened.nextDueDate).toBe(soon);
  });

  it('缺 nextDueDate → 以当前时间为锚推进一轮', () => {
    const todo = recurring({ id: 'c' }) as Todo;
    const reopened = toggleTodoStatus(todo) as RecurringTodo;
    expect(reopened.nextDueDate).toBeGreaterThan(Date.now() + 23 * HOUR);
  });
});
