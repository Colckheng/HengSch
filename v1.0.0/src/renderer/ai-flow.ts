import type { AiChatMessage, AiProposal } from '@hengsch/shared-types';

export type CardStatus = 'pending' | 'committed' | 'rejected' | 'stale' | 'error';

export type DeleteProposal = Extract<AiProposal, { kind: 'delete' }>;

/** 删除清单的落定快照：队列消费后仍能区分已删除与保留的条目。 */
export interface DeleteGroupResult {
  id: string;
  title: string;
  deleted: boolean;
}

export type FlowEntry =
  | { id: string; kind: 'text'; role: 'user' | 'assistant'; content: string; /** 气泡展示文案（如 [流程] 脚手架只显原话）；入库/发模型仍用 content */ display?: string; /** 发送时刻（毫秒）；恢复的老数据可空 */ at?: number }
  /** AI 的逐条描述（stage_batch 的 summary）：展示但不回传给模型 */
  | { id: string; kind: 'summary'; content: string }
  | { id: string; kind: 'card'; proposal: AiProposal; status: CardStatus; errorText?: string; groupResults?: DeleteGroupResult[] }
  | { id: string; kind: 'ask'; forEntryId: string }
  | { id: string; kind: 'system'; content: string };

export interface FlowState {
  entries: FlowEntry[];
  /** 尚未放出的提案（总览轮入队，确认一条放出下一条） */
  queue: AiProposal[];
  committed: number;
  skipped: number;
  /** 总览批次未收尾：等最后一条落定后追加系统行 */
  awaitingEndLine: boolean;
}

let seq = 0;
function nextEntryId(): string {
  seq += 1;
  return `e${seq}`;
}

export function emptyFlow(): FlowState {
  return { entries: [], queue: [], committed: 0, skipped: 0, awaitingEndLine: false };
}

function shownEntries(proposal: AiProposal): FlowEntry[] {
  const out: FlowEntry[] = [];
  if (proposal.summary) out.push({ id: nextEntryId(), kind: 'summary', content: proposal.summary });
  out.push({ id: nextEntryId(), kind: 'card', proposal, status: 'pending' });
  return out;
}

function hasPendingCard(state: FlowState): boolean {
  return state.entries.some((entry) => entry.kind === 'card' && entry.status === 'pending');
}

function hasOpenAsk(state: FlowState): boolean {
  return state.entries.some((entry) => entry.kind === 'ask');
}

function showNext(state: FlowState): FlowState {
  if (!state.queue.length) return state;
  const [head, ...rest] = state.queue;
  return { ...state, entries: [...state.entries, ...shownEntries(head)], queue: rest };
}

function finalizeIfDone(state: FlowState): FlowState {
  if (!state.awaitingEndLine || state.queue.length || hasPendingCard(state) || hasOpenAsk(state)) return state;
  return {
    ...state,
    awaitingEndLine: false,
    entries: [...state.entries, { id: nextEntryId(), kind: 'system', content: `完成 ${state.committed} · 跳过 ${state.skipped}` }]
  };
}

export function appendText(state: FlowState, role: 'user' | 'assistant', content: string, display?: string): FlowState {
  return { ...state, entries: [...state.entries, { id: nextEntryId(), kind: 'text', role, content, display, at: Date.now() }] };
}

/**
 * 应答后迟到的流式尾部 chunk：并入本轮 assistant 文本气泡（从末尾回退找最近一条
 * text，可能被后插的暂存卡/描述行隔开）；最近一条 text 是用户消息则丢弃，
 * 避免开出第二个带光标的残留气泡。
 */
export function mergeIntoLastAssistant(state: FlowState, delta: string): FlowState {
  for (let i = state.entries.length - 1; i >= 0; i -= 1) {
    const entry = state.entries[i];
    if (entry.kind !== 'text') continue;
    if (entry.role !== 'assistant') return state;
    const entries = state.entries.slice();
    entries[i] = { ...entry, content: entry.content + delta };
    return { ...state, entries };
  }
  return state;
}

/** 系统行（mono 小字）：批次收尾、监测判定理由等 */
export function appendSystem(state: FlowState, content: string): FlowState {
  return { ...state, entries: [...state.entries, { id: nextEntryId(), kind: 'system', content }] };
}

/** 新暂存落地：第一条（连描述）立即显示，其余入队 */
export function insertStaged(state: FlowState, proposals: AiProposal[]): FlowState {
  if (!proposals.length) return state;
  const [first, ...rest] = proposals;
  return {
    ...state,
    entries: [...state.entries, ...shownEntries(first)],
    queue: [...state.queue, ...rest],
    awaitingEndLine: state.awaitingEndLine || rest.length > 0
  };
}

/** 确认：就地转已创建 → 放出下一条 → 收尾时追加系统行 */
export function commitCard(state: FlowState, cardEntryId: string): FlowState {
  let found = false;
  const entries = state.entries.map((entry) => {
    if (entry.kind === 'card' && entry.id === cardEntryId && entry.status === 'pending') {
      found = true;
      return { ...entry, status: 'committed' as const, errorText: undefined };
    }
    return entry;
  });
  const base: FlowState = { ...state, entries, committed: found ? state.committed + 1 : state.committed };
  return finalizeIfDone(showNext(base));
}

/** 取消：就地转已取消 + 插入「这条怎么办？」问句行（不出队、不落盘） */
export function cancelCard(state: FlowState, cardEntryId: string): FlowState {
  const index = state.entries.findIndex((entry) => entry.id === cardEntryId && entry.kind === 'card');
  if (index < 0) return state;
  const entries = state.entries.map((entry) =>
    entry.kind === 'card' && entry.id === cardEntryId && entry.status === 'pending'
      ? { ...entry, status: 'rejected' as const, errorText: undefined }
      : entry
  );
  const ask: FlowEntry = { id: nextEntryId(), kind: 'ask', forEntryId: cardEntryId };
  entries.splice(index + 1, 0, ask);
  return { ...state, entries };
}

/** 跳过：撤问句行 → 计数 → 放出下一条 → 收尾 */
export function skipCard(state: FlowState, cardEntryId: string): FlowState {
  const entries = state.entries.filter((entry) => !(entry.kind === 'ask' && entry.forEntryId === cardEntryId));
  const base: FlowState = { ...state, entries, skipped: state.skipped + 1 };
  return finalizeIfDone(showNext(base));
}

/** 新会话：清空文字/系统行/终态卡，只保留待确认卡与队列（D-B） */
export function resetSession(state: FlowState): FlowState {
  const live = state.entries.filter((entry) => entry.kind === 'card' && entry.status === 'pending');
  const keepBatch = live.length > 0 || state.queue.length > 0;
  return {
    ...state,
    entries: live,
    committed: keepBatch ? state.committed : 0,
    skipped: keepBatch ? state.skipped : 0,
    awaitingEndLine: keepBatch ? state.awaitingEndLine : false
  };
}

/** 回传给模型的卡片状态前缀：防止模型仅凭历史文字臆测待确认卡 */
export function cardStateNote(state: FlowState): string {
  const pending = state.entries.filter(
    (entry): entry is Extract<FlowEntry, { kind: 'card' }> => entry.kind === 'card' && entry.status === 'pending'
  );
  if (!pending.length) {
    return '[卡片状态] 当前没有待确认预览卡；历史里“已生成预览卡”的卡片都已取消、跳过或创建完成，不要再让用户确认旧卡。';
  }
  const titles = pending.map((entry) => (entry.proposal.kind === 'create' ? entry.proposal.draft.title : entry.proposal.before.title));
  return `[卡片状态] 当前有 ${pending.length} 张待确认预览卡（${titles.join('、')}），需要用户在卡片上确认，不要重复生成。`;
}

/** 改要求的结果：撤问句行，新提案（连描述）插在被取消卡之后 */
export function replaceAfterCancel(state: FlowState, anchorCardId: string, proposals: AiProposal[]): FlowState {
  if (!proposals.length) return state;
  const entries = state.entries.filter((entry) => !(entry.kind === 'ask' && entry.forEntryId === anchorCardId));
  const index = entries.findIndex((entry) => entry.id === anchorCardId);
  const shown = proposals.flatMap(shownEntries);
  const next = [...entries];
  if (index >= 0) next.splice(index + 1, 0, ...shown);
  else next.push(...shown);
  return { ...state, entries: next };
}

/** 仅 pending/error 可被标注；committed/rejected 终态不覆写（防双击/竞态误翻） */
export function markCard(state: FlowState, cardEntryId: string, status: CardStatus, errorText?: string): FlowState {
  return {
    ...state,
    entries: state.entries.map((entry) => {
      if (entry.kind !== 'card' || entry.id !== cardEntryId) return entry;
      if (entry.status === 'committed' || entry.status === 'rejected') return entry;
      return { ...entry, status, errorText };
    })
  };
}

/** 重启/挂载恢复：从主进程未决队列重建（首条显示、其余入队） */
export function rebuildQueue(proposals: AiProposal[]): FlowState {
  return insertStaged(emptyFlow(), proposals);
}

/** D-4 恢复合并：本地已有同 id 卡则跳过，缺的补到队尾；无本地卡时等价 rebuild */
export function mergeRestoredQueue(state: FlowState, proposals: AiProposal[]): FlowState {
  if (!proposals.length) return state;
  const known = new Set([
    ...state.entries.flatMap((entry) => (entry.kind === 'card' ? [entry.proposal.id] : [])),
    ...state.queue.map((proposal) => proposal.id)
  ]);
  const missing = proposals.filter((proposal) => !known.has(proposal.id));
  if (!missing.length) return state;
  if (!state.entries.some((entry) => entry.kind === 'card') && !state.queue.length) {
    return insertStaged(state, missing);
  }
  const hasPending = state.entries.some((entry) => entry.kind === 'card' && entry.status === 'pending');
  const next: FlowState = {
    ...state,
    queue: [...state.queue, ...missing],
    awaitingEndLine: state.awaitingEndLine || missing.length > 0
  };
  return hasPending ? next : showNext(next);
}

/**
 * B-2 删除合并卡：未决删除卡 + 队列里连续的删除提案（前缀规则，遇到非删除即停）。
 * 失败/过期后保留整组，供重试或跳过，不能退回单卡而丢失余下条目。
 * 总数 <2 返回 []——单条走原卡片路径（保留取消/改要求）。
 */
export function groupedDeletes(state: FlowState, cardEntryId: string): DeleteProposal[] {
  const entry = state.entries.find((item) => item.id === cardEntryId);
  if (!entry || entry.kind !== 'card' || entry.proposal.kind !== 'delete') return [];
  if (entry.status === 'committed' || entry.status === 'rejected') return [];
  const out: DeleteProposal[] = [entry.proposal];
  for (const proposal of state.queue) {
    if (proposal.kind !== 'delete') break;
    out.push(proposal);
  }
  return out.length >= 2 ? out : [];
}

/**
 * B-2 合并卡落定：批量提交成功后调用——消费全部分组 id、按结果计数、
 * 追加系统行并释放队列下一张（收尾行走 finalizeIfDone）。
 */
export function resolveDeleteGroup(
  state: FlowState,
  cardEntryId: string,
  options: { confirmedIds: string[]; rejectedIds: string[]; group: DeleteProposal[] }
): FlowState {
  const { confirmedIds, rejectedIds, group } = options;
  const currentGroup = groupedDeletes(state, cardEntryId);
  if (group.length < 2 || group.some((proposal, index) => currentGroup[index]?.id !== proposal.id)) return state;
  const consumed = new Set(group.map((proposal) => proposal.id));
  const confirmed = new Set(confirmedIds);
  const rejected = new Set(rejectedIds);
  // IPC 成功结果必须完整划分本组；重复/迟到的回调不能重复计数或放出下一张。
  if (consumed.size !== group.length || confirmed.size !== confirmedIds.length || rejected.size !== rejectedIds.length
    || confirmed.size + rejected.size !== group.length
    || group.some((proposal) => confirmed.has(proposal.id) === rejected.has(proposal.id))) return state;
  const status: CardStatus = confirmed.size ? 'committed' : 'rejected';
  const groupResults = group.map((proposal) => ({
    id: proposal.id,
    title: proposal.before.title,
    deleted: confirmed.has(proposal.id)
  }));
  const entries = state.entries.map((entry) => {
    if (entry.kind !== 'card' || entry.id !== cardEntryId) return entry;
    return {
      ...entry,
      status,
      errorText: undefined,
      groupResults
    };
  });
  const lines: string[] = [];
  if (confirmed.size) {
    lines.push(`已删除 ${confirmed.size} 条：${groupResults.filter((result) => result.deleted).map((result) => result.title).join('、')}`);
    if (rejected.size) lines.push(`保留 ${rejected.size} 条`);
  } else {
    lines.push(`跳过 ${rejected.size} 条删除`);
  }
  const base: FlowState = {
    ...state,
    entries: [...entries, { id: nextEntryId(), kind: 'system', content: lines.join(' · ') }],
    queue: state.queue.filter((proposal) => !consumed.has(proposal.id)),
    committed: state.committed + confirmed.size,
    skipped: state.skipped + rejected.size
  };
  return finalizeIfDone(showNext(base));
}

/** 回传给模型的历史：只含真实对话文本（summary/system/ask 不回传） */
export function toChatMessages(entries: FlowEntry[]): AiChatMessage[] {
  return entries
    .filter((entry): entry is Extract<FlowEntry, { kind: 'text' }> => entry.kind === 'text')
    .map((entry) => ({ role: entry.role, content: entry.content }));
}

/** B-1a 持久化快照：文字/描述/系统行 + 终态卡；pending/stale/error 卡不存（主进程队列是真相源），问句行随卡消亡 */
export interface PersistedFlow {
  entries: FlowEntry[];
  committed: number;
  skipped: number;
  awaitingEndLine: boolean;
}

export function persistableFlow(state: FlowState): PersistedFlow {
  return {
    entries: state.entries.filter((entry) =>
      entry.kind === 'text' ||
      entry.kind === 'summary' ||
      entry.kind === 'system' ||
      (entry.kind === 'card' && (entry.status === 'committed' || entry.status === 'rejected'))
    ),
    committed: state.committed,
    skipped: state.skipped,
    awaitingEndLine: state.awaitingEndLine
  };
}

/** 挂载恢复：坏数据回空流；条目 id 全部重编（模块 seq 已复位，避免与新条目撞 id） */
export function restoreFlow(raw: string | null): FlowState {
  if (!raw) return emptyFlow();
  try {
    const data = JSON.parse(raw) as Partial<PersistedFlow>;
    if (!data || !Array.isArray(data.entries)) return emptyFlow();
    const entries: FlowEntry[] = [];
    for (const entry of data.entries) {
      if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string') continue;
      if (entry.kind === 'text' && (entry.role === 'user' || entry.role === 'assistant') && typeof entry.content === 'string') {
        entries.push({ ...entry, id: nextEntryId() });
      } else if (entry.kind === 'summary' && typeof entry.content === 'string') {
        entries.push({ ...entry, id: nextEntryId() });
      } else if (entry.kind === 'system' && typeof entry.content === 'string') {
        entries.push({ ...entry, id: nextEntryId() });
      } else if (
        entry.kind === 'card' &&
        (entry.status === 'committed' || entry.status === 'rejected') &&
        typeof entry.proposal === 'object' &&
        entry.proposal !== null &&
        typeof entry.proposal.kind === 'string'
      ) {
        entries.push({ ...entry, id: nextEntryId() });
      }
    }
    return {
      entries,
      queue: [],
      committed: typeof data.committed === 'number' && data.committed >= 0 ? data.committed : 0,
      skipped: typeof data.skipped === 'number' && data.skipped >= 0 ? data.skipped : 0,
      awaitingEndLine: data.awaitingEndLine === true
    };
  } catch {
    return emptyFlow();
  }
}
