import { describe, it, expect } from 'vitest';
import {
  MonitorProgress,
  MONITOR_CAP_MS,
  creditPresence,
  backfillFromStart,
  markThresholdReached,
  createDayProgress,
  dayKey,
  dayStartMs,
  pruneProgressEntries
} from './monitor';

const p = (ms: number, checkpointAt: number, notified = false): MonitorProgress => ({
  ms,
  checkpointAt,
  notified
});

describe('creditPresence', () => {
  it('正常累加：present 事件补记事件间隔', () => {
    const r = creditPresence(p(0, 1000), { t: 31000, present: true });
    expect(r).toEqual({ ms: 30000, checkpointAt: 31000, notified: false });
  });

  it('空档不误记：absent tick 也推进 checkpoint，后续只从该点起算', () => {
    // 10:00 在场 5s，10:00:30 进程已关（checkpoint 推进），10:01 进程又开
    let prog = p(5000, 1000);
    prog = creditPresence(prog, { t: 31000, present: false });
    expect(prog).toEqual({ ms: 5000, checkpointAt: 31000, notified: false });
    prog = creditPresence(prog, { t: 61000, present: true });
    // 只记 31000→61000 的 30s，绝不把 0→31000 空档算进去
    expect(prog.ms).toBe(35000);
    expect(prog.checkpointAt).toBe(61000);
  });

  it('单步封顶：休眠/挂起造成的超大间隔只补 180s', () => {
    const r = creditPresence(p(0, 0), { t: 8 * 3600_000, present: true });
    expect(r.ms).toBe(MONITOR_CAP_MS);
    expect(r.checkpointAt).toBe(8 * 3600_000);
  });

  it('absent 超大间隔不补记，只推进 checkpoint', () => {
    const r = creditPresence(p(10000, 0), { t: 8 * 3600_000, present: false });
    expect(r.ms).toBe(10000);
    expect(r.checkpointAt).toBe(8 * 3600_000);
  });

  it('notified 后不再变化', () => {
    const r = creditPresence(p(600000, 1000, true), { t: 999999, present: true });
    expect(r).toEqual({ ms: 600000, checkpointAt: 1000, notified: true });
  });

  it('时钟回拨事件被忽略', () => {
    const r = creditPresence(p(1000, 50000), { t: 40000, present: true });
    expect(r).toEqual({ ms: 1000, checkpointAt: 50000, notified: false });
  });

  it('零间隔事件：ms 不变，checkpoint 持平', () => {
    const r = creditPresence(p(1000, 50000), { t: 50000, present: true });
    expect(r).toEqual({ ms: 1000, checkpointAt: 50000, notified: false });
  });

  it('自定义 capMs 覆盖默认封顶', () => {
    const r = creditPresence(p(0, 0), { t: 30000, present: true }, 10000);
    expect(r.ms).toBe(10000);
  });
});

describe('journal 冷启动序列（2 分钟 tick）', () => {
  it('连续日志行按行间隔累计，空档行不补', () => {
    // 计划任务 24h 运行：00:00→05:00 每 2 分钟一行（游戏未开，absent 只推进 checkpoint）
    let prog = createDayProgress(dayStartMs(Date.parse('2026-10-09T00:00:00')));
    const base = Date.parse('2026-10-09T05:00:00');
    for (let t = prog.checkpointAt + 120_000; t <= base; t += 120_000) {
      prog = creditPresence(prog, { t, present: false });
      expect(prog.ms).toBe(0);
    }
    expect(prog.checkpointAt).toBe(base);
    // 05:02 .. 06:00 游戏在场，30 行 × 2 分钟 = 整 1 小时
    for (let i = 1; i <= 30; i++) {
      prog = creditPresence(prog, { t: base + i * 120_000, present: true });
      expect(prog.checkpointAt).toBe(base + i * 120_000);
    }
    expect(prog.ms).toBe(30 * 120_000);
    // 06:00 之后关掉：absent 行推进但不补
    prog = creditPresence(prog, { t: base + 31 * 120_000, present: false });
    expect(prog.ms).toBe(30 * 120_000);
    // 日志从中间开始（此前无行）：首行只补一个 cap，不会凭空记 5 小时
    const first = creditPresence(createDayProgress(dayStartMs(base)), { t: base, present: true });
    expect(first.ms).toBe(MONITOR_CAP_MS);
  });

  it('日志中断（任务被禁用）后的首行只补一个 cap，方向宁少勿多', () => {
    const dayStart = dayStartMs(Date.parse('2026-10-09T00:00:00'));
    const prog = createDayProgress(dayStart);
    const r = creditPresence(prog, { t: dayStart + 10 * 3600_000, present: true });
    expect(r.ms).toBe(MONITOR_CAP_MS);
    expect(r.ms).toBeLessThan(10 * 3600_000);
  });
});

describe('backfillFromStart（语义 A：仍在运行的进程回溯）', () => {
  const midnight = Date.parse('2026-10-09T00:00:00');

  it('进程 07:00 启动，09:00 冷启动 → 补 2 小时（不设封顶）', () => {
    const r = backfillFromStart(createDayProgress(midnight), midnight + 7 * 3600_000, midnight + 9 * 3600_000, midnight);
    expect(r.ms).toBe(2 * 3600_000);
    expect(r.checkpointAt).toBe(midnight + 9 * 3600_000);
  });

  it('与已记进度不重叠：checkpoint 08:30 起算', () => {
    const r = backfillFromStart(p(3600_000, midnight + 8.5 * 3600_000), midnight + 7 * 3600_000, midnight + 9 * 3600_000, midnight);
    expect(r.ms).toBe(3600_000 + 30 * 60_000); // 已有1h + 08:30→09:00 的 30min
  });

  it('进程启动于昨日 → 区间被今日 0 点截断', () => {
    const r = backfillFromStart(createDayProgress(midnight), midnight - 5 * 3600_000, midnight + 2 * 3600_000, midnight);
    expect(r.ms).toBe(2 * 3600_000);
  });

  it('notified 后回溯不生效', () => {
    const r = backfillFromStart(p(600000, midnight, true), midnight + 3600_000, midnight + 7200_000, midnight);
    expect(r).toEqual({ ms: 600000, checkpointAt: midnight, notified: true });
  });

  it('now 早于区间起点（时钟异常）→ 不变', () => {
    const base = p(1000, midnight + 6 * 3600_000);
    const r = backfillFromStart(base, midnight + 7 * 3600_000, midnight + 6 * 3600_000, midnight);
    expect(r).toEqual(base);
  });

  it('回溯与后续轮询无重叠：回溯把 checkpoint 推到 now', () => {
    // 进程 01:00 启动，02:00 冷启动 → 回溯 1 小时（起点 01:00，不含 00:00→01:00）
    const r = backfillFromStart(createDayProgress(midnight), midnight + 3600_000, midnight + 7200_000, midnight);
    expect(r.checkpointAt).toBe(midnight + 7200_000);
    expect(r.ms).toBe(3600_000);
    // 紧接着的 30s tick 只补 30s
    const tick = creditPresence(r, { t: midnight + 7200_000 + 30_000, present: true });
    expect(tick.ms).toBe(3600_000 + 30_000);
  });
});

describe('markThresholdReached', () => {
  it('达到阈值 → notified', () => {
    expect(markThresholdReached(p(600_000, 0), 600_000).notified).toBe(true);
  });
  it('未达阈值不变', () => {
    expect(markThresholdReached(p(599_999, 0), 600_000).notified).toBe(false);
  });
  it('已 notified 幂等', () => {
    expect(markThresholdReached(p(1, 0, true), 600_000)).toEqual({ ms: 1, checkpointAt: 0, notified: true });
  });
});

describe('dayKey / dayStartMs / prune', () => {
  it('dayKey 本地日期', () => {
    const d = new Date(2026, 9, 9, 12, 0, 0); // 本地 2026-10-09
    expect(dayKey(d.getTime())).toBe('2026-10-09');
    expect(dayStartMs(d.getTime())).toBe(new Date(2026, 9, 9, 0, 0, 0, 0).getTime());
  });

  it('prune：保留 7 天内、丢弃更旧与畸形键', () => {
    const now = new Date(2026, 9, 9, 12).getTime();
    const entries = {
      'a:2026-10-09': p(1, 1),
      'a:2026-10-03': p(1, 1), // 6 天前 → 保留
      'a:2026-10-01': p(1, 1), // 8 天前 → 清理
      'b:2026-10-02': p(1, 1), // 7 天前 → 保留（cutoff=10-02）
      malformed: p(1, 1)
    };
    const out = pruneProgressEntries(entries, now, 7);
    expect(Object.keys(out).sort()).toEqual(['a:2026-10-03', 'a:2026-10-09', 'b:2026-10-02']);
  });
});
