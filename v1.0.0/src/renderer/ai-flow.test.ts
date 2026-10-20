import { it } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyFlow,
  appendText,
  insertStaged,
  commitCard,
  cancelCard,
  skipCard,
  replaceAfterCancel,
  markCard,
  rebuildQueue,
  toChatMessages,
  type FlowState,
  type FlowEntry
} from './ai-flow';
import type { AiProposal, AiCreateDraft } from '@hengsch/shared-types';

let uid = 0;
function proposal(summary?: string, title = `t${uid}`): AiProposal {
  uid += 1;
  const draft: AiCreateDraft = { title, type: 'once' };
  return { id: `p${uid}`, kind: 'create', createdAt: 1, draft, summary };
}

type CardEntry = Extract<FlowEntry, { kind: 'card' }>;

const cards = (state: FlowState): CardEntry[] => state.entries.filter((entry): entry is CardEntry => entry.kind === 'card');
const asks = (state: FlowState): FlowEntry[] => state.entries.filter((entry) => entry.kind === 'ask');
const last = (state: FlowState): FlowEntry => state.entries[state.entries.length - 1];

it('insertStaged shows first proposal with summary and queues the rest', () => {
  const a = proposal('第一条描述', 'a');
  const b = proposal('第二条描述', 'b');
  const c = proposal('第三条描述', 'c');
  const state = insertStaged(emptyFlow(), [a, b, c]);
  assert.equal(state.entries.filter((e) => e.kind === 'card').length, 1);
  assert.equal(state.queue.length, 2);
  assert.equal(state.awaitingEndLine, true);
  assert.deepEqual(
    state.entries.map((e) => e.kind),
    ['summary', 'card']
  );
});

it('serial commits advance the queue and end with the system line', () => {
  const a = proposal('描述A', 'a');
  const b = proposal('描述B', 'b');
  let state = insertStaged(emptyFlow(), [a, b]);
  const cardA = cards(state)[0];
  state = commitCard(state, cardA.id);
  assert.equal(cards(state)[0].status, 'committed');
  assert.equal(cards(state).length, 2);
  assert.equal(state.committed, 1);
  assert.equal(state.queue.length, 0);
  assert.notEqual(last(state).kind, 'system');

  const cardB = cards(state)[1];
  state = commitCard(state, cardB.id);
  assert.equal(cards(state)[1].status, 'committed');
  assert.equal(last(state).kind, 'system');
  assert.equal((last(state) as Extract<FlowEntry, { kind: 'system' }>).content, '完成 2 · 跳过 0');
});

it('single staged proposal never emits a system line', () => {
  let state = insertStaged(emptyFlow(), [proposal(undefined, 'solo')]);
  const card = cards(state)[0];
  state = commitCard(state, card.id);
  assert.equal(state.entries.some((entry) => entry.kind === 'system'), false);
  assert.equal(state.committed, 1);
});

it('cancel inserts the ask row without leaving the flow; skip resolves it', () => {
  let state = insertStaged(emptyFlow(), [proposal('描述A', 'a'), proposal('描述B', 'b')]);
  const cardA = cards(state)[0];
  state = cancelCard(state, cardA.id);
  assert.equal(cards(state)[0].status, 'rejected');
  assert.equal(asks(state).length, 1);
  assert.equal(state.queue.length, 1);
  assert.equal(state.entries.some((entry) => entry.kind === 'system'), false);

  state = skipCard(state, cardA.id);
  assert.equal(asks(state).length, 0);
  assert.equal(state.skipped, 1);
  assert.equal(cards(state).length, 2);
  assert.equal(cards(state)[1].status, 'pending');
});

it('skip on the last queued card closes the batch with counts', () => {
  let state = insertStaged(emptyFlow(), [proposal('A', 'a'), proposal('B', 'b')]);
  const cardA = cards(state)[0];
  state = commitCard(state, cardA.id);
  const cardB = cards(state)[1];
  state = cancelCard(state, cardB.id);
  state = skipCard(state, cardB.id);
  assert.equal(last(state).kind, 'system');
  assert.equal((last(state) as Extract<FlowEntry, { kind: 'system' }>).content, '完成 1 · 跳过 1');
});

it('replaceAfterCancel splices the new proposal right after the canceled card', () => {
  let state = insertStaged(emptyFlow(), [proposal('描述A', 'a'), proposal('描述B', 'b')]);
  const cardA = cards(state)[0];
  state = cancelCard(state, cardA.id);
  const revised = proposal('改后的A', 'a2');
  state = replaceAfterCancel(state, cardA.id, [revised]);
  assert.equal(asks(state).length, 0);
  const order = state.entries.filter((e) => e.kind === 'summary' || e.kind === 'card').map((e) => e.kind);
  assert.deepEqual(order, ['summary', 'card', 'summary', 'card']);
  const cardsNow = cards(state);
  assert.equal(cardsNow.length, 2);
  assert.equal(cardsNow[1].proposal.id, revised.id);
  assert.equal(state.queue.length, 1);
  assert.equal(state.skipped, 0);
});

it('replacing on the last card keeps the end line waiting for the new card', () => {
  let state = insertStaged(emptyFlow(), [proposal('A', 'a'), proposal('B', 'b')]);
  const cardA = cards(state)[0];
  state = commitCard(state, cardA.id);
  const cardB = cards(state)[1];
  state = cancelCard(state, cardB.id);
  state = replaceAfterCancel(state, cardB.id, [proposal('B2', 'b2')]);
  assert.equal(state.entries.some((entry) => entry.kind === 'system'), false);
  const fresh = cards(state)[2];
  state = commitCard(state, fresh.id);
  assert.equal(last(state).kind, 'system');
  assert.equal((last(state) as Extract<FlowEntry, { kind: 'system' }>).content, '完成 2 · 跳过 0');
});

it('markCard sets stale/error without touching counters', () => {
  const state = insertStaged(emptyFlow(), [proposal(undefined, 'x')]);
  const card = cards(state)[0];
  const stale = markCard(state, card.id, 'stale', '确认卡已过期');
  assert.equal(cards(stale)[0].status, 'stale');
  assert.equal(cards(stale)[0].errorText, '确认卡已过期');
  assert.equal(stale.committed, 0);
});

it('markCard cannot overwrite committed terminal state but can move pending → error → stale', () => {
  const state = insertStaged(emptyFlow(), [proposal(undefined, 'x')]);
  const card = cards(state)[0];
  const errored = markCard(state, card.id, 'error', '确认失败');
  assert.equal(cards(errored)[0].status, 'error');
  const stale = markCard(errored, card.id, 'stale', '确认卡已过期');
  assert.equal(cards(stale)[0].status, 'stale');

  const committedState = commitCard(state, card.id);
  const frozen = markCard(committedState, card.id, 'error', '并发失败');
  assert.equal(cards(frozen)[0].status, 'committed');
  assert.equal(cards(frozen)[0].errorText, undefined);
});

it('rebuildQueue restores pending cards from proposals', () => {
  const state = rebuildQueue([proposal('r1', 'x'), proposal('r2', 'y')]);
  assert.equal(cards(state).length, 1);
  assert.equal(state.queue.length, 1);
  assert.equal(state.awaitingEndLine, true);
});

it('toChatMessages keeps only real conversation text', () => {
  let state = insertStaged(emptyFlow(), [proposal('描述', 'x')]);
  state = appendText(state, 'user', '加一条待办');
  state = appendText(state, 'assistant', '好的');
  const chat = toChatMessages(state.entries);
  assert.deepEqual(chat, [
    { role: 'user', content: '加一条待办' },
    { role: 'assistant', content: '好的' }
  ]);
});

it('appendText stamps at and keeps display out of model messages', () => {
  const before = Date.now();
  let state = appendText(emptyFlow(), 'user', '流程原文', '[流程] 流程原文');
  const entry = state.entries[0] as { kind: string; content: string; display?: string; at?: number };
  assert.equal(entry.kind, 'text');
  assert.equal(entry.content, '流程原文');
  assert.equal(entry.display, '[流程] 流程原文');
  assert.ok(typeof entry.at === 'number' && entry.at >= before);
  const chat = toChatMessages(state.entries);
  assert.deepEqual(chat, [{ role: 'user', content: '流程原文' }]);
  state = appendText(state, 'assistant', '已处理');
  const plain = state.entries[1] as { display?: string; at?: number };
  assert.equal(plain.display, undefined);
  assert.ok(typeof plain.at === 'number');
});
