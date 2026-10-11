import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import { app, Notification, dialog } from 'electron';
import type Store from 'electron-store';
import { presentAskWindow } from './ask-window';
import {
  MonitorProgress,
  creditPresence,
  backfillFromStart,
  markThresholdReached,
  createDayProgress,
  dayKey,
  dayStartMs,
  pruneProgressEntries,
  detectExitEdge,
  shouldAskOnExit,
  resolveAskAction,
  shouldReaskOffline
} from '@hengsch/shared-logic';

const execP = promisify(exec);
const execFileP = promisify(execFile);

export interface MonitorEntry {
  todoId: string;
  title: string;
  exeName: string;
  thresholdMinutes: number;
  /** 达阈值自动完成（缺省 true，旧数据兼容） */
  auto: boolean;
  /** 进程退出沿弹窗询问（缺省 false） */
  askOnExit: boolean;
}

const POLL_MS = 30_000;
const PROGRESS_STORE_KEY = 'monitorProgress';
const JOURNAL_ENABLED_KEY = 'monitorJournalEnabled';
const TASK_NAME = 'HengSchMonitor';
const JOURNAL_KEEP_MS = 7 * 86_400_000;
const EXE_TIMEOUT = { timeout: 15_000, windowsHide: true } as const;

interface JournalLine {
  t: number;
  run: string[];
}

let store: Store;
let send: (channel: string, payload: unknown) => void;
let registry: MonitorEntry[] = [];
let progressStore: Record<string, MonitorProgress> = {};
let journalEnabled = false;
const bootstrappedIds = new Set<string>();
let pollTimer: NodeJS.Timeout | null = null;

/** 每个任务上次观测是否在跑（退出沿检测用） */
const lastRunning = new Map<string, boolean>();
/** 当天已询问过的 todoId（防骚扰；key 带日期跨天重置） */
let askedDay = '';
const askedToday = new Set<string>();
/** 弹窗串行队列 */
const askQueue: MonitorEntry[] = [];
let askBusy = false;

function askKey(todoId: string, now: number): string {
  return `${dayKey(now)}:${todoId}`;
}

function pruneAsked(now: number): void {
  const day = dayKey(now);
  if (askedDay !== day) {
    askedDay = day;
    askedToday.clear();
  }
}

function enqueueAsk(entry: MonitorEntry): void {
  const now = Date.now();
  pruneAsked(now);
  const key = askKey(entry.todoId, now);
  if (askedToday.has(key)) return;
  askedToday.add(key); // 入队即标记，防排队期间重复触发
  askQueue.push(entry);
  void drainAskQueue();
}

async function drainAskQueue(): Promise<void> {
  if (askBusy) return;
  askBusy = true;
  try {
    while (askQueue.length > 0) {
      const entry = askQueue.shift()!;
      try {
        await runAskDialog(entry);
      } catch {
        // 弹窗失败不阻塞队列
      }
    }
  } finally {
    askBusy = false;
  }
}

/** 任务当前状态：pending / completed（自动完成与否由 notified 区分） */
function findTodoStatus(todoId: string): 'pending' | 'completed' | null {
  try {
    const todos = (store.get('todos') ?? []) as Array<{ id: string; status: string; deleted?: boolean }>;
    const todo = todos.find((t) => t && t.id === todoId && !t.deleted);
    if (!todo) return null;
    return todo.status === 'completed' ? 'completed' : 'pending';
  } catch {
    return null;
  }
}

async function runAskDialog(entry: MonitorEntry): Promise<void> {
  const now = Date.now();
  const status = findTodoStatus(entry.todoId);
  if (!status) return;
  const prog = progressStore[progressKey(entry.todoId, now)];
  const autoNotified = prog?.notified ?? false;
  if (!shouldAskOnExit({ status, autoNotified })) return;

  const message = `「${entry.title}」的进程已结束`;
  const detail =
    status === 'completed' && autoNotified
      ? '该任务之前已自动标记完成，它真的完成了吗？'
      : '该任务完成了吗？';

  let answer: 'complete' | 'not-done';
  try {
    // 独立询问小窗（Swiss 风格）；cancel（ESC/关闭）按「还没做」语义
    const result = await presentAskWindow({ todoId: entry.todoId, message, detail });
    answer = result === 'complete' ? 'complete' : 'not-done';
  } catch {
    // 小窗创建失败 → 回退原生弹窗，保证功能不挂
    const result = await dialog.showMessageBox({
      type: 'question',
      title: 'HengSch · 进程结束',
      message,
      detail,
      buttons: ['完成', '还没做'],
      defaultId: 1,
      cancelId: 1,
      noLink: true
    });
    answer = result.response === 0 ? 'complete' : 'not-done';
  }

  const action = resolveAskAction({ answer, status, autoNotified });
  if (action !== 'none') {
    send('monitor:ask-resolved', { todoId: entry.todoId, action });
  }
}

const exeLower = (name: string): string => name.trim().toLowerCase();
const progressKey = (todoId: string, now: number): string => `${todoId}:${dayKey(now)}`;

function journalDir(): string {
  return app.getPath('userData');
}

function specsPath(): string {
  return path.join(journalDir(), 'monitor-specs.json');
}

function journalPath(): string {
  return path.join(journalDir(), 'monitor-journal.jsonl');
}

function journalScriptPath(): string {
  return path.join(journalDir(), 'monitor-journal.ps1');
}

// 计划任务脚本：每 2 分钟对绑定 exe 做一次快照，追加 JSONL 行
const JOURNAL_SCRIPT = [
  "$ErrorActionPreference = 'SilentlyContinue'",
  "$specsPath = Join-Path $PSScriptRoot 'monitor-specs.json'",
  "if (-not (Test-Path $specsPath)) { exit 0 }",
  "$specs = Get-Content $specsPath -Raw -Encoding UTF8 | ConvertFrom-Json",
  '$names = @()',
  'if ($specs.exeNames) { $names = @($specs.exeNames | ForEach-Object { "$_".ToLowerInvariant() }) }',
  '$hit = @()',
  'try {',
  '  $rows = tasklist /fo csv /nh',
  '  foreach ($row in $rows) {',
  '    if ($row -match \'^"([^"]*)"\' ) {',
  '      $n = $Matches[1].ToLowerInvariant()',
  '      if ($names -contains $n) { $hit += $n }',
  '    }',
  '  }',
  '} catch {}',
  '$ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()',
  '$json = \'{"t":\' + $ts + \',"run":[\' + (($hit | ForEach-Object { \'"\' + $_ + \'"\'} ) -join \',\') + \']}\'',
  "Add-Content -Path (Join-Path $PSScriptRoot 'monitor-journal.jsonl') -Value $json -Encoding UTF8",
  ''
].join('\r\n');

async function listProcessNames(): Promise<Set<string> | null> {
  try {
    const { stdout } = await execP('cmd /c chcp 65001>nul & tasklist /fo csv /nh', {
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
      timeout: 15_000
    });
    const names = new Set<string>();
    for (const line of stdout.split(/\r?\n/)) {
      const m = line.match(/^"([^"]*)"/);
      if (m && m[1]) names.add(m[1].toLowerCase());
    }
    return names;
  } catch {
    return null;
  }
}

export async function listProcessDisplayNames(): Promise<string[]> {
  try {
    const { stdout } = await execP('cmd /c chcp 65001>nul & tasklist /fo csv /nh', {
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
      timeout: 15_000
    });
    const byLower = new Map<string, string>();
    for (const line of stdout.split(/\r?\n/)) {
      const m = line.match(/^"([^"]*)"/);
      if (m && m[1] && !byLower.has(m[1].toLowerCase())) byLower.set(m[1].toLowerCase(), m[1]);
    }
    return [...byLower.values()].sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

/** 当前运行进程的启动时刻（epoch ms）；键为不带扩展名的小写进程名 */
async function getProcessStartTimes(): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const script =
    'Get-Process -ErrorAction SilentlyContinue | ' +
    'ForEach-Object { try { $_.Name + \'|\' + $_.StartTime.ToUniversalTime().ToString(\'o\') } catch {} }';
  try {
    const { stdout } = await execFileP('powershell.exe', ['-NoProfile', '-Command', script], EXE_TIMEOUT);
    for (const line of stdout.split(/\r?\n/)) {
      const idx = line.lastIndexOf('|');
      if (idx <= 0) continue;
      const name = line.slice(0, idx).trim().toLowerCase();
      const ts = Date.parse(line.slice(idx + 1).trim());
      if (name && Number.isFinite(ts)) {
        const prev = out.get(name);
        if (prev === undefined || ts < prev) out.set(name, ts);
      }
    }
  } catch {
    // 拿不到就不回溯，降级为仅轮询
  }
  return out;
}

function readJournalLines(): JournalLine[] {
  try {
    if (!fs.existsSync(journalPath())) return [];
    const text = fs.readFileSync(journalPath(), 'utf8').replace(/^\uFEFF/, '');
    const out: JournalLine[] = [];
    for (const raw of text.split(/\r?\n/)) {
      if (!raw.trim()) continue;
      try {
        const parsed = JSON.parse(raw) as JournalLine;
        if (typeof parsed.t === 'number' && Array.isArray(parsed.run)) {
          out.push({ t: parsed.t, run: parsed.run.map((r) => String(r).toLowerCase()) });
        }
      } catch {
        // 跳过损坏行
      }
    }
    return out;
  } catch {
    return [];
  }
}

function pruneJournal(now: number): void {
  try {
    if (!fs.existsSync(journalPath())) return;
    const lines = readJournalLines().filter((l) => l.t >= now - JOURNAL_KEEP_MS);
    const text = lines.map((l) => JSON.stringify({ t: l.t, run: l.run })).join('\n');
    fs.writeFileSync(journalPath(), text ? text + '\n' : '', 'utf8');
  } catch {
    // 裁剪失败无碍
  }
}

function writeJournalSpecs(): void {
  try {
    const exes = [...new Set(registry.map((e) => exeLower(e.exeName)).filter(Boolean))];
    fs.mkdirSync(journalDir(), { recursive: true });
    fs.writeFileSync(specsPath(), JSON.stringify({ exeNames: exes }, null, 2), 'utf8');
  } catch {
    // 写失败 → 任务侧读不到 specs 会空转，静默降级
  }
}

async function createScheduledTask(): Promise<boolean> {
  try {
    fs.writeFileSync(journalScriptPath(), JOURNAL_SCRIPT, 'utf8');
    await execFileP(
      'schtasks',
      [
        '/create',
        '/tn',
        TASK_NAME,
        '/sc',
        'minute',
        '/mo',
        '2',
        '/f',
        '/tr',
        `powershell -NoProfile -ExecutionPolicy Bypass -File "${journalScriptPath()}"`
      ],
      EXE_TIMEOUT
    );
    return true;
  } catch {
    return false;
  }
}

async function deleteScheduledTask(): Promise<void> {
  try {
    await execFileP('schtasks', ['/delete', '/tn', TASK_NAME, '/f'], EXE_TIMEOUT);
  } catch {
    // 任务不存在等失败忽略
  }
}

function persistProgress(): void {
  try {
    store.set(PROGRESS_STORE_KEY, progressStore);
  } catch {
    // 存储失败下个周期重试
  }
}

function pushProgress(now: number = Date.now()): void {
  send('monitor:progress', getTodayProgress(now));
}

export function getTodayProgress(now: number = Date.now()): {
  day: string;
  progress: Record<string, { ms: number; notified: boolean }>;
} {
  const day = dayKey(now);
  const suffix = `:${day}`;
  const out: Record<string, { ms: number; notified: boolean }> = {};
  for (const [key, value] of Object.entries(progressStore)) {
    if (key.endsWith(suffix)) {
      out[key.slice(0, -suffix.length)] = { ms: value.ms, notified: value.notified };
    }
  }
  return { day, progress: out };
}

function notifyCompleted(entry: MonitorEntry): void {
  send('monitor:completed', { todoId: entry.todoId });
  try {
    new Notification({
      title: 'HengSch · 监测达标',
      body: `「${entry.title}」已运行 ${entry.thresholdMinutes} 分钟，任务标记为完成`
    }).show();
  } catch {
    // 通知失败不阻塞
  }
}

function checkThreshold(entry: MonitorEntry, prog: MonitorProgress): MonitorProgress {
  if (!entry.auto) return prog; // ask-only：只记进度不自动完成
  const after = markThresholdReached(prog, entry.thresholdMinutes * 60_000);
  if (after.notified !== prog.notified) {
    notifyCompleted(entry);
    return after;
  }
  return prog;
}

/** 首次 configure：③ journal 冷启动补空档 + ② 仍在运行进程回溯 + 离线退出补问 */
async function bootstrap(entries: MonitorEntry[]): Promise<void> {
  const now = Date.now();
  const dayStart = dayStartMs(now);
  pruneJournal(now);

  const journalLines = readJournalLines().filter((l) => l.t >= dayStart && l.t <= now);
  const starts = await getProcessStartTimes();

  let changed = false;
  for (const entry of entries) {
    const key = progressKey(entry.todoId, now);
    let prog = progressStore[key] ?? createDayProgress(dayStart);
    const exe = exeLower(entry.exeName);

    // ③ 逐行喂事件（行间隔 2min，creditPresence 天然按行补记）
    for (const line of journalLines) {
      prog = creditPresence(prog, { t: line.t, present: line.run.includes(exe) });
    }
    // ② 仍在运行：从 max(StartTime, 今日0点, checkpoint) 补到现在
    // Windows 进程名不带扩展名，查询键去掉 .exe
    const startMs = starts.get(exe.replace(/\.exe$/, ''));
    const currentlyRunning = Boolean(startMs);
    if (startMs) {
      prog = backfillFromStart(prog, startMs, now, dayStart);
    }
    // 初始化退出沿基线：冷启动时"在跑"记 true，后续 tick 观察到不在跑即退出沿
    if (entry.askOnExit) {
      lastRunning.set(entry.todoId, currentlyRunning);
    }

    // 离线补问：当天快照出现过、当前不在跑、任务仍待办 → 排队询问（仅当天日志）
    if (entry.askOnExit) {
      const seenPresentToday = journalLines.some((l) => l.run.includes(exe));
      const status = findTodoStatus(entry.todoId);
      if (status && shouldReaskOffline({ seenPresentToday, currentlyRunning, status })) {
        enqueueAsk(entry);
      }
    }

    prog = checkThreshold(entry, prog);
    progressStore[key] = prog;
    changed = true;
  }

  if (changed) {
    persistProgress();
    pushProgress(now);
  }
}

async function tick(): Promise<void> {
  if (registry.length === 0) return;
  const now = Date.now();
  const running = await listProcessNames();
  if (!running) return; // 拿不到进程列表：不推进 checkpoint，下个周期重试

  let changed = false;
  for (const entry of registry) {
    const key = progressKey(entry.todoId, now);
    const before = progressStore[key];
    let prog = before ?? createDayProgress(dayStartMs(now));
    const present = running.has(exeLower(entry.exeName));
    prog = creditPresence(prog, { t: now, present });
    prog = checkThreshold(entry, prog);
    if (!before || before.ms !== prog.ms || before.checkpointAt !== prog.checkpointAt || before.notified !== prog.notified) {
      progressStore[key] = prog;
      changed = true;
    }

    // 退出沿：上次在跑、这次不在 → 排队询问（防骚扰由 enqueueAsk 的当天 Set 保证）
    if (entry.askOnExit) {
      const prev = lastRunning.get(entry.todoId);
      if (detectExitEdge(prev, present)) {
        enqueueAsk(entry);
      }
      lastRunning.set(entry.todoId, present);
    }
  }

  if (changed) {
    progressStore = pruneProgressEntries(progressStore, now, 7);
    persistProgress();
    pushProgress(now);
  }
}

export function initMonitorService(
  electronStore: Store,
  sendFn: (channel: string, payload: unknown) => void
): void {
  store = electronStore;
  send = sendFn;
  progressStore = (store.get(PROGRESS_STORE_KEY, {}) as Record<string, MonitorProgress>) ?? {};
  journalEnabled = store.get(JOURNAL_ENABLED_KEY, false) as boolean;

  // journal 开启时确保计划任务存在（/create 幂等，可修复被外部删除的任务）
  if (journalEnabled) {
    writeJournalSpecs();
    void createScheduledTask();
  }

  pollTimer = setInterval(() => {
    void tick();
  }, POLL_MS);
}

export function stopMonitorService(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

export function configureMonitor(entries: MonitorEntry[]): void {
  // 归一化：auto 缺省 true（旧数据），askOnExit 缺省 false；至少启用一种模式才有效
  const valid = entries
    .map((e) => ({
      ...e,
      auto: e.auto !== false,
      askOnExit: e.askOnExit === true
    }))
    .filter(
      (e) =>
        e &&
        e.todoId &&
        e.exeName &&
        (e.auto || e.askOnExit) &&
        // 阈值只对 auto 有意义：auto 任务必须 ≥1 分钟
        (!e.auto || e.thresholdMinutes >= 1)
    );
  registry = valid;
  // 每个监测任务首次出现时回溯一次（journal 补空档 + 仍在运行进程），与冷启动语义一致
  const fresh = valid.filter((e) => !bootstrappedIds.has(e.todoId));
  for (const entry of fresh) bootstrappedIds.add(entry.todoId);
  if (fresh.length > 0) void bootstrap(fresh);
  if (journalEnabled) writeJournalSpecs();
}

export async function setJournalEnabled(enabled: boolean): Promise<boolean> {
  journalEnabled = enabled;
  store.set(JOURNAL_ENABLED_KEY, enabled);
  if (enabled) {
    writeJournalSpecs();
    await createScheduledTask(); // 失败也保持开启：静默降级，specs 与读取侧兼容
  } else {
    await deleteScheduledTask();
  }
  return enabled;
}

export function getJournalEnabled(): boolean {
  return journalEnabled;
}
