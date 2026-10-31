import type { Todo, Group, MonitorConfig, CycleType, AiProposal, AiProposalKind, AiCreateDraft, AiUpdateDraft, AiDeleteDraft } from '@hengsch/shared-types';
import { toggleTodoStatus, generateTodoId, nextDueFromReminder } from '@hengsch/shared-logic';
import { randomUUID } from 'crypto';

export interface AiDataContext {
  todos: Todo[];
  groups: Group[];
  /** 当前运行的进程文件名（monitor:listProcesses），用于校验 monitor.exeName */
  processNames: string[];
  now: number;
  deviceId: string;
}

const MAX_TITLE = 200;
const MAX_DESCRIPTION = 1000;
const CYCLES: CycleType[] = ['daily', 'weekly', 'monthly', 'custom'];

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('参数必须是对象');
  return value as Record<string, unknown>;
}

function readTitle(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('标题不能为空');
  const title = value.trim();
  if (title.length > MAX_TITLE) throw new Error(`标题最长 ${MAX_TITLE} 字`);
  return title;
}

function readDescription(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new Error('描述必须是文本');
  const text = value.trim();
  if (text.length > MAX_DESCRIPTION) throw new Error(`描述最长 ${MAX_DESCRIPTION} 字`);
  return text || undefined;
}

function resolveGroup(groups: Group[], value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new Error('分组参数必须是文本');
  const needle = value.trim().toLowerCase();
  const hit = groups.find((group) => !group.deleted && (group.id === needle || group.name.toLowerCase() === needle));
  if (!hit) throw new Error(`分组不存在：${value}（只能用已有分组）`);
  return hit.id;
}

function readMonitor(raw: unknown, processNames: string[]): MonitorConfig | undefined {
  if (raw === undefined || raw === null) return undefined;
  const record = asRecord(raw);
  const exeName = typeof record.exeName === 'string' ? record.exeName.trim() : '';
  if (!exeName) throw new Error('进程监测缺少 exeName');
  if (!processNames.some((name) => name.toLowerCase() === exeName.toLowerCase())) throw new Error(`进程不存在：${exeName}（必须在当前运行进程里选）`);
  const match = processNames.find((name) => name.toLowerCase() === exeName.toLowerCase())!;
  const thresholdRaw = record.thresholdMinutes === undefined ? 10 : record.thresholdMinutes;
  const thresholdMinutes = Number(thresholdRaw);
  if (!Number.isFinite(thresholdMinutes) || thresholdMinutes < 1) throw new Error('监测阈值至少 1 分钟');
  const auto = record.auto === undefined ? record.askOnExit !== true : record.auto === true;
  const askOnExit = record.askOnExit === true;
  if (!auto && !askOnExit) throw new Error('进程监测需要开启达标自动完成或退出询问之一');
  return { exeName: match, thresholdMinutes: Math.round(thresholdMinutes), auto, askOnExit };
}

function readRemindAt(value: unknown, now: number): number | undefined {
  if (value === undefined || value === null) return undefined;
  let remindAt: number;
  if (typeof value === 'number') {
    remindAt = value;
  } else if (typeof value === 'string') {
    const text = value.trim();
    remindAt = /^\d+$/.test(text) ? Number(text) : Date.parse(text);
  } else {
    throw new Error('提醒时间必须是 ISO 8601 时间或时间戳');
  }
  if (!Number.isFinite(remindAt)) throw new Error('提醒时间必须是 ISO 8601 时间（带时区偏移）');
  if (remindAt <= now) throw new Error('提醒时间必须晚于当前时间');
  return remindAt;
}

function readLead(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const lead = Number(value);
  if (!Number.isFinite(lead) || lead < 0) throw new Error('提前量不能为负');
  return Math.round(lead);
}

export function validateCreate(raw: unknown, ctx: AiDataContext): AiCreateDraft {
  const record = asRecord(raw);
  const type = record.type === undefined || record.type === 'once' || record.type === 'recurring' ? (record.type as 'once' | 'recurring' | undefined) ?? 'once' : undefined;
  if (!type) throw new Error('type 只能是 once 或 recurring');
  const draft: AiCreateDraft = {
    title: readTitle(record.title),
    type,
    description: readDescription(record.description),
    groupId: resolveGroup(ctx.groups, record.groupId),
    remindAt: readRemindAt(record.remindAt, ctx.now),
    remindLeadMs: readLead(record.remindLeadMs),
    monitor: readMonitor(record.monitor, ctx.processNames)
  };
  if (type === 'recurring') {
    const cycle = record.cycleType;
    if (typeof cycle !== 'string' || !CYCLES.includes(cycle as CycleType)) throw new Error('循环任务需要 cycleType：daily/weekly/monthly/custom');
    draft.cycleType = cycle as CycleType;
    if (cycle === 'custom') {
      const days = Number(record.customCycleDays);
      if (!Number.isFinite(days) || days < 1 || !Number.isInteger(days)) throw new Error('自定义周期需要 customCycleDays ≥ 1 天');
      draft.customCycleDays = days;
    }
  } else if (record.cycleType !== undefined) {
    throw new Error('一次性任务不能设置循环周期');
  }
  return draft;
}

export function validateUpdate(raw: unknown, ctx: AiDataContext): AiUpdateDraft {
  const record = asRecord(raw);
  const todoId = typeof record.todoId === 'string' ? record.todoId : '';
  const before = ctx.todos.find((todo) => todo.id === todoId && !todo.deleted);
  if (!todoId || !before) throw new Error('待办不存在或已删除');
  const draft: AiUpdateDraft = { todoId };
  if (record.title !== undefined) draft.title = readTitle(record.title);
  if ('description' in record) draft.description = record.description === 'clear' ? 'clear' : readDescription(record.description);
  if (record.groupId !== undefined) draft.groupId = resolveGroup(ctx.groups, record.groupId);
  if (record.remindAt === 'clear') draft.remindAt = 'clear';
  else if (record.remindAt !== undefined) {
    const at = readRemindAt(record.remindAt, ctx.now);
    if (at !== undefined) draft.remindAt = at;
  }
  if (record.remindLeadMs === 'clear') draft.remindLeadMs = 'clear';
  else if (record.remindLeadMs !== undefined) {
    const lead = readLead(record.remindLeadMs);
    if (lead !== undefined) draft.remindLeadMs = lead;
  }
  if ('monitor' in record) draft.monitor = record.monitor === null ? null : readMonitor(record.monitor, ctx.processNames);
  if (record.toggleStatus === true) draft.toggleStatus = true;
  if (draft.title === undefined && draft.description === undefined && draft.groupId === undefined && draft.remindAt === undefined
    && draft.remindLeadMs === undefined && draft.monitor === undefined && !draft.toggleStatus) throw new Error('没有要修改的内容');
  return draft;
}

export function validateDelete(raw: unknown, ctx: AiDataContext): AiDeleteDraft {
  const record = asRecord(raw);
  const todoId = typeof record.todoId === 'string' ? record.todoId : '';
  const before = ctx.todos.find((todo) => todo.id === todoId && !todo.deleted);
  if (!todoId || !before) throw new Error('待办不存在或已删除');
  return { todoId };
}

export function stageProposal(kind: AiProposalKind, raw: unknown, ctx: AiDataContext): AiProposal {
  if (kind === 'create') return { id: randomUUID(), kind, createdAt: ctx.now, draft: validateCreate(raw, ctx) };
  if (kind === 'update') {
    const draft = validateUpdate(raw, ctx);
    const before = ctx.todos.find((todo) => todo.id === draft.todoId)!;
    return { id: randomUUID(), kind, createdAt: ctx.now, before, draft };
  }
  const draft = validateDelete(raw, ctx);
  const before = ctx.todos.find((todo) => todo.id === draft.todoId)!;
  return { id: randomUUID(), kind, createdAt: ctx.now, before, draft };
}

export const STAGE_BATCH_MAX = 10;

export interface StagedBatchEntry {
  summary: string;
  proposal: AiProposal;
}

/** 总览轮批量暂存：任一条校验失败整批抛错（调用方在全部通过前不入队，原子） */
export function stageProposalBatch(entries: unknown, ctx: AiDataContext): StagedBatchEntry[] {
  if (!Array.isArray(entries) || entries.length === 0) throw new Error('entries 必须是非空数组');
  if (entries.length > STAGE_BATCH_MAX) throw new Error(`一次最多暂存 ${STAGE_BATCH_MAX} 条`);
  const parsed = entries.map((entry) => {
    const record = asRecord(entry);
    const summary = typeof record.summary === 'string' ? record.summary.trim() : '';
    if (!summary) throw new Error('每条缺少 summary（面向用户的一句话描述）');
    if (record.action !== 'create' && record.action !== 'update' && record.action !== 'delete') {
      throw new Error('action 只能是 create/update/delete');
    }
    return { summary, action: record.action as AiProposalKind, raw: record.draft };
  });
  return parsed.map((item) => ({ summary: item.summary, proposal: stageProposal(item.action, item.raw, ctx) }));
}

function touch(todo: Todo, now: number, deviceId: string): Todo {
  return { ...todo, updatedAt: Math.max(now, (todo.updatedAt ?? todo.createdAt ?? 0) + 1), deviceId };
}

function applyCreate(draft: AiCreateDraft, ctx: AiDataContext): Todo {
  const base: Todo = {
    id: generateTodoId(),
    title: draft.title,
    status: 'pending',
    type: draft.type,
    createdAt: ctx.now,
    updatedAt: ctx.now,
    deviceId: ctx.deviceId,
    order: ctx.todos.filter((todo) => !todo.deleted).reduce((max, todo) => Math.max(max, todo.order), -1) + 1
  };
  if (draft.description) base.description = draft.description;
  if (draft.groupId) base.groupId = draft.groupId;
  if (draft.remindAt !== undefined) {
    base.remindAt = draft.remindAt;
    base.remindLeadMs = draft.remindLeadMs ?? 0;
  } else if (draft.remindLeadMs !== undefined) base.remindLeadMs = draft.remindLeadMs;
  if (draft.monitor) base.monitor = draft.monitor;
  if (draft.type === 'recurring') {
    const recurring = base as Todo & { cycleType: CycleType; customCycleDays?: number; nextDueDate: number };
    recurring.cycleType = draft.cycleType!;
    if (draft.customCycleDays !== undefined) recurring.customCycleDays = draft.customCycleDays;
    // 到期锚定目标时刻（remindAt 已扣提前量，加回 = 用户选的 HH:MM），推进时才保时刻
    recurring.nextDueDate = nextDueFromReminder(draft.remindAt, draft.remindLeadMs, ctx.now);
  }
  return base;
}

/** 提交时以提案为基线二次校验；patch 为用户在卡片上改过的字段 */
export function applyProposal(proposal: AiProposal, ctx: AiDataContext, patch?: unknown): Todo[] {
  if (proposal.kind === 'create') {
    const merged = { ...(proposal.draft as AiCreateDraft), ...(patch && typeof patch === 'object' ? patch : {}) } as AiCreateDraft;
    if (merged.type !== 'recurring') {
      delete merged.cycleType;
      delete merged.customCycleDays;
    }
    return [...ctx.todos, applyProposalDraft(merged, ctx)];
  }
  const current = ctx.todos.find((todo) => todo.id === proposal.draft.todoId && !todo.deleted);
  if (!current) throw new Error('待办已被删除或改过，请重新发起');
  if (proposal.kind === 'delete') return ctx.todos.map((todo) => (todo.id === current.id ? { ...touch(current, ctx.now, ctx.deviceId), deleted: true } : todo));
  const raw = { ...proposal.draft, ...(patch && typeof patch === 'object' ? patch : {}) } as AiUpdateDraft;
  const draft = validateUpdate(raw, ctx);
  let next = touch(current, ctx.now, ctx.deviceId);
  if (draft.title !== undefined) next.title = draft.title;
  if (draft.description !== undefined) {
    if (draft.description === 'clear' || !draft.description) delete next.description;
    else next.description = draft.description;
  }
  if (draft.groupId !== undefined) next.groupId = draft.groupId;
  if (draft.remindAt === 'clear') {
    delete next.remindAt;
    delete next.remindedAt;
    delete next.remindLeadMs;
  } else if (draft.remindAt !== undefined) {
    next.remindAt = draft.remindAt;
    if (draft.remindLeadMs === 'clear' || draft.remindLeadMs === undefined) next.remindLeadMs = 0;
  }
  if (draft.remindLeadMs !== undefined && draft.remindLeadMs !== 'clear') next.remindLeadMs = draft.remindLeadMs;
  if (draft.monitor === null) delete next.monitor;
  else if (draft.monitor !== undefined) next.monitor = draft.monitor;
  if (next.type === 'recurring' && (draft.remindAt !== undefined || draft.remindLeadMs !== undefined)) {
    const target = next.remindAt;
    if (target !== undefined) {
      (next as Todo & { nextDueDate?: number }).nextDueDate = nextDueFromReminder(target, next.remindLeadMs, ctx.now);
    }
  }
  if (draft.toggleStatus) next = toggleTodoStatus(next);
  return ctx.todos.map((todo) => (todo.id === next.id ? next : todo));
}

function applyProposalDraft(draft: AiCreateDraft, ctx: AiDataContext): Todo {
  const clean = validateCreate(draft, ctx);
  return applyCreate(clean, ctx);
}
