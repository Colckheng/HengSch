export interface MonitorProgress {
  /** 今日已累计毫秒 */
  ms: number;
  /** 上次记账点，每个事件（无论是否在场）都会推进 */
  checkpointAt: number;
  /** 已触发完成通知，当日停止累加 */
  notified: boolean;
}

/** 单个事件最多补记的时间：覆盖 2 分钟日志 tick，同时裁掉休眠/挂起造成的时钟跳变 */
export const MONITOR_CAP_MS = 180_000;

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** 本地日期键（跨 0 点换键 = 当天清零） */
export function dayKey(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 本地今日 0 点 */
export function dayStartMs(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function createDayProgress(dayStart: number): MonitorProgress {
  return { ms: 0, checkpointAt: dayStart, notified: false };
}

/**
 * 消费一个记账事件（轮询 tick / 日志行）。
 * - present=true：补记 min(事件间隔, capMs)
 * - checkpoint 无论 present 与否都推进 → 空档不误记
 * - notified 或时钟回拨事件直接忽略
 */
export function creditPresence(
  progress: MonitorProgress,
  event: { t: number; present: boolean },
  capMs: number = MONITOR_CAP_MS
): MonitorProgress {
  if (progress.notified) return progress;
  if (!Number.isFinite(event.t) || event.t < progress.checkpointAt) return progress;
  const delta = event.t - progress.checkpointAt;
  const ms = progress.ms + (event.present ? Math.min(delta, capMs) : 0);
  return { ms, checkpointAt: event.t, notified: false };
}

/**
 * 冷启动回溯「仍在运行」的进程（语义 A：进程存在即计时，区间不设封顶；
 * 上界由 dayStart 限定为今日，重叠区间由 checkpointAt 保证不重复记账）。
 */
export function backfillFromStart(
  progress: MonitorProgress,
  startTime: number,
  now: number,
  dayStart: number
): MonitorProgress {
  if (progress.notified) return progress;
  const from = Math.max(startTime, dayStart, progress.checkpointAt);
  if (now <= from) return progress;
  return { ms: progress.ms + (now - from), checkpointAt: now, notified: false };
}

/** 达到阈值 → 置 notified（调用方随后触发完成与通知） */
export function markThresholdReached(progress: MonitorProgress, thresholdMs: number): MonitorProgress {
  if (!progress.notified && progress.ms >= thresholdMs) {
    return { ...progress, notified: true };
  }
  return progress;
}

/** 清理过期进度键（键格式 `${todoId}:${YYYY-MM-DD}`） */
export function pruneProgressEntries(
  entries: Record<string, MonitorProgress>,
  now: number,
  keepDays: number = 7
): Record<string, MonitorProgress> {
  const cutoff = dayKey(now - keepDays * 86_400_000);
  const out: Record<string, MonitorProgress> = {};
  for (const [key, value] of Object.entries(entries)) {
    const datePart = key.slice(-10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(datePart) && datePart >= cutoff) {
      out[key] = value;
    }
  }
  return out;
}

/* ---------------- 退出沿询问（askOnExit） ---------------- */

/** 退出沿：上次观测在跑、本次不在 → true。首次观测（prev=undefined）不触发 */
export function detectExitEdge(prevRunning: boolean | undefined, currentlyRunning: boolean): boolean {
  return prevRunning === true && !currentlyRunning;
}

export interface AskGateInput {
  status: 'pending' | 'completed';
  /** 当日 progress.notified——是否走过自动完成链路（用于区分自动完成与手动完成） */
  autoNotified: boolean;
}

/** 弹窗门槛：待办要问；自动完成的要问（允许撤销）；手动完成的不问 */
export function shouldAskOnExit(input: AskGateInput): boolean {
  if (input.status === 'completed' && !input.autoNotified) return false;
  return true;
}

/**
 * 询问裁决（方案 A：询问结果优先）：
 * - 答「完成」+ 待办 → complete；答「完成」+ 已完成 → none（无需动作）
 * - 答「还没做」+ 自动完成 → revert（撤销回待办）；+ 待办 → none
 */
export function resolveAskAction(
  input: { answer: 'complete' | 'not-done' } & AskGateInput
): 'complete' | 'revert' | 'none' {
  if (input.answer === 'complete') {
    return input.status === 'pending' ? 'complete' : 'none';
  }
  return input.status === 'completed' && input.autoNotified ? 'revert' : 'none';
}

/** 离线补问（仅当天）：当天快照出现过、当前不在跑、任务仍待办 */
export function shouldReaskOffline(input: {
  seenPresentToday: boolean;
  currentlyRunning: boolean;
  status: 'pending' | 'completed';
}): boolean {
  return input.seenPresentToday && !input.currentlyRunning && input.status === 'pending';
}
