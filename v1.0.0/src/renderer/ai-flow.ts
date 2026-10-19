import type { AiChatMessage, AiProposal } from '@hengsch/shared-types';

export type CardStatus = 'pending' | 'committed' | 'rejected' | 'stale' | 'error';

export type FlowEntry =
  | { id: string; kind: 'text'; role: 'user' | 'assistant'; content: string }
  /** AI 的逐条描述（stage_batch 的 summary）：展示但不回传给模型 */
  | { id: string; kind: 'summary'; content: string }
  | { id: string; kind: 'card'; proposal: AiProposal; status: CardStatus; errorText?: string }
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

export function appendText(state: FlowState, role: 'user' | 'assistant', content: string): FlowState {
  return { ...state, entries: [...state.entries, { id: nextEntryId(), kind: 'text', role, content }] };
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

export function markCard(state: FlowState, cardEntryId: string, status: CardStatus, errorText?: string): FlowState {
  return {
    ...state,
    entries: state.entries.map((entry) =>
      entry.kind === 'card' && entry.id === cardEntryId ? { ...entry, status, errorText } : entry
    )
  };
}

/** 重启/挂载恢复：从主进程未决队列重建（首条显示、其余入队） */
export function rebuildQueue(proposals: AiProposal[]): FlowState {
  return insertStaged(emptyFlow(), proposals);
}

/** 回传给模型的历史：只含真实对话文本（summary/system/ask 不回传） */
export function toChatMessages(entries: FlowEntry[]): AiChatMessage[] {
  return entries
    .filter((entry): entry is Extract<FlowEntry, { kind: 'text' }> => entry.kind === 'text')
    .map((entry) => ({ role: entry.role, content: entry.content }));
}
