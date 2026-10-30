import { it } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyFlow,
  appendText,
  appendSystem,
  insertStaged,
  commitCard,
  cancelCard,
  skipCard,
  replaceAfterCancel,
  markCard,
  rebuildQueue,
  mergeIntoLastAssistant,
  toChatMessages,
  persistableFlow,
  restoreFlow,
  groupedDeletes,
  resolveDeleteGroup,
  type DeleteProposal,
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

function deleteProposal(title: string): DeleteProposal {
  uid += 1;
  const before = { id: `t${uid}`, title, type: 'once' as const, status: 'pending' as const, createdAt: 1, updatedAt: 1, order: uid };
  return { id: `p${uid}`, kind: 'delete', createdAt: 1, before, draft: { todoId: before.id } };
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

it('mergeIntoLastAssistant folds late tail chunk into the assistant bubble', () => {
  let state = appendText(emptyFlow(), 'user', '你是谁');
  state = appendText(state, 'assistant', '小SOU，HengSch Todo 的 AI 助手。');
  state = mergeIntoLastAssistant(state, '办？');
  const entry = last(state);
  assert.equal(entry.kind === 'text' && entry.content, '小SOU，HengSch Todo 的 AI 助手。办？');
  assert.equal(state.entries.length, 2);
});

it('mergeIntoLastAssistant skips over staged summary/card entries after the text', () => {
  let state = appendText(emptyFlow(), 'assistant', '已暂存 1 条');
  state = insertStaged(state, [proposal('描述', 'x')]);
  const length = state.entries.length;
  state = mergeIntoLastAssistant(state, '。');
  const entry = state.entries[length - 3] as { kind: string; role?: string; content: string };
  assert.equal(entry.content, '已暂存 1 条。');
  assert.equal(state.entries.length, length);
});

it('mergeIntoLastAssistant drops the tail when latest text is the user message', () => {
  const state = appendText(emptyFlow(), 'user', 'hi');
  assert.equal(mergeIntoLastAssistant(state, '。'), state);
});

it('persistableFlow keeps text/system/settled cards and drops pending cards and asks', () => {
  let state = appendText(emptyFlow(), 'user', '你好');
  state = insertStaged(state, [proposal('描述', 'a')]);
  state = cancelCard(state, cards(state)[0].id);
  state = appendSystem(state, '完成 0 · 跳过 0');
  const snap = persistableFlow(state);
  assert.deepEqual(
    snap.entries.map((entry) => entry.kind),
    ['text', 'summary', 'card', 'system']
  );
  const card = snap.entries[2] as CardEntry;
  assert.equal(card.status, 'rejected');
  assert.equal(snap.entries.some((entry) => entry.kind === 'ask'), false);
});

it('restoreFlow round-trips a snapshot with renumbered ids and falls back to empty on garbage', () => {
  let state = appendText(emptyFlow(), 'user', 'hi');
  state = insertStaged(state, [proposal('描述', 'a')]);
  state = commitCard(state, cards(state)[0].id);
  const snap = persistableFlow(state);
  const restored = restoreFlow(JSON.stringify(snap));
  assert.equal(restored.entries.length, 3);
  assert.equal(restored.committed, 1);
  assert.equal(restored.queue.length, 0);
  const text = restored.entries[0];
  assert.equal(text.kind === 'text' ? text.content : null, 'hi');
  const card = restored.entries[2] as CardEntry;
  assert.equal(card.status, 'committed');
  const restoredIds = restored.entries.map((entry) => entry.id);
  assert.equal(new Set(restoredIds).size, restoredIds.length);
  // 重编：恢复出的 id 与快照原 id 无交集（模块 seq 已复位/推进，不撞旧 id）
  const snapIds = snap.entries.map((entry) => entry.id);
  assert.equal(restoredIds.some((id) => snapIds.includes(id)), false);
  const next = appendText(restored, 'assistant', 'yo');
  const nextIds = next.entries.map((entry) => entry.id);
  assert.equal(new Set(nextIds).size, nextIds.length);
  assert.deepEqual(restoreFlow(null).entries, []);
  assert.deepEqual(restoreFlow('not-json').entries, []);
  assert.equal(restoreFlow('{"entries":[]}').committed, 0);
});

it('delete groups stop at the first non-delete and leave single cards on the original path', () => {
  const a = deleteProposal('a');
  const b = deleteProposal('b');
  const c = proposal(undefined, 'create');
  const d = deleteProposal('d');
  const state = insertStaged(emptyFlow(), [a, b, c, d]);
  assert.deepEqual(groupedDeletes(state, cards(state)[0].id), [a, b]);
  assert.deepEqual(state.queue, [b, c, d]);
  assert.deepEqual(groupedDeletes(state, 'missing'), []);
  const solo = insertStaged(emptyFlow(), [a, c, d]);
  assert.deepEqual(groupedDeletes(solo, cards(solo)[0].id), []);
  const createFirst = insertStaged(emptyFlow(), [c, a, b]);
  assert.deepEqual(groupedDeletes(createFirst, cards(createFirst)[0].id), []);
});

it('partial delete confirmation records each outcome and resumes a mixed queue exactly once', () => {
  const group = [deleteProposal('保留首条'), deleteProposal('删除第二条'), deleteProposal('删除第三条')];
  const create = proposal(undefined, '接续新建');
  const laterDelete = deleteProposal('后续单条删除');
  let state = insertStaged(emptyFlow(), [...group, create, laterDelete]);
  const id = cards(state)[0].id;
  const options = { group, confirmedIds: [group[1].id, group[2].id], rejectedIds: [group[0].id] };
  state = resolveDeleteGroup(state, id, options);
  assert.equal(cards(state)[0].status, 'committed');
  assert.deepEqual(cards(state)[0].groupResults, group.map((item, index) => ({ id: item.id, title: item.before.title, deleted: index > 0 })));
  assert.equal(state.committed, 2);
  assert.equal(state.skipped, 1);
  assert.equal(cards(state)[1].proposal.id, create.id);
  assert.equal(cards(state)[1].status, 'pending');
  assert.deepEqual(state.queue, [laterDelete]);
  assert.equal(state.awaitingEndLine, true);
  assert.equal(asks(state).length, 0);
  assert.ok(state.entries.some((entry) => entry.kind === 'system' && entry.content === '已删除 2 条：删除第二条、删除第三条 · 保留 1 条'));
  assert.equal(resolveDeleteGroup(state, id, options), state, 'late duplicate completion must not release another card');

  const restored = restoreFlow(JSON.stringify(persistableFlow(state)));
  assert.deepEqual(cards(restored)[0].groupResults, cards(state)[0].groupResults);
  state = commitCard(state, cards(state)[1].id);
  assert.equal(cards(state)[2].proposal.id, laterDelete.id);
  state = commitCard(state, cards(state)[2].id);
  assert.equal((last(state) as Extract<FlowEntry, { kind: 'system' }>).content, '完成 4 · 跳过 1');
});

it('confirming all three deletes closes the batch with one settled card', () => {
  const group = [deleteProposal('a'), deleteProposal('b'), deleteProposal('c')];
  const initial = insertStaged(emptyFlow(), group);
  const state = resolveDeleteGroup(initial, cards(initial)[0].id, { group, confirmedIds: group.map((item) => item.id), rejectedIds: [] });
  assert.equal(cards(state).length, 1);
  assert.equal(cards(state)[0].groupResults?.filter((result) => result.deleted).length, 3);
  assert.equal(state.queue.length, 0);
  assert.equal(state.awaitingEndLine, false);
  assert.equal((last(state) as Extract<FlowEntry, { kind: 'system' }>).content, '完成 3 · 跳过 0');
});

it('failed delete groups can retry; stale groups can skip all and release the following card', () => {
  const group = [deleteProposal('同名待办'), deleteProposal('同名待办')];
  const tail = proposal(undefined, '接续');
  const initial = insertStaged(emptyFlow(), [...group, tail]);
  const id = cards(initial)[0].id;
  const failed = markCard(initial, id, 'error', '写入失败');
  assert.deepEqual(groupedDeletes(failed, id), group);
  assert.equal(failed.committed, 0);
  const retried = resolveDeleteGroup(failed, id, { group, confirmedIds: group.map((item) => item.id), rejectedIds: [] });
  assert.equal(cards(retried)[0].status, 'committed');
  assert.equal(cards(retried)[0].errorText, undefined);
  assert.equal(retried.committed, 2);

  const stale = markCard(failed, id, 'stale', '确认卡已过期');
  assert.deepEqual(groupedDeletes(stale, id), group);
  let skipped = resolveDeleteGroup(stale, id, { group, confirmedIds: [], rejectedIds: group.map((item) => item.id) });
  assert.equal(cards(skipped)[0].status, 'rejected');
  assert.equal(cards(skipped)[0].groupResults?.every((result) => !result.deleted), true);
  assert.equal(new Set(cards(skipped)[0].groupResults?.map((result) => result.id)).size, 2, 'duplicate titles must keep distinct row ids');
  assert.equal(skipped.committed, 0);
  assert.equal(skipped.skipped, 2);
  assert.equal(asks(skipped).length, 0);
  assert.equal(cards(skipped)[1].proposal.id, tail.id);
  skipped = commitCard(skipped, cards(skipped)[1].id);
  assert.equal((last(skipped) as Extract<FlowEntry, { kind: 'system' }>).content, '完成 1 · 跳过 2');
});

it('invalid delete results cannot consume unrelated or unaccounted proposals', () => {
  const group = [deleteProposal('a'), deleteProposal('b')];
  const initial = insertStaged(emptyFlow(), group);
  const id = cards(initial)[0].id;
  for (const result of [
    { confirmedIds: [group[0].id], rejectedIds: [] },
    { confirmedIds: [group[0].id, group[0].id], rejectedIds: [] },
    { confirmedIds: [group[0].id], rejectedIds: [group[0].id] },
    { confirmedIds: ['unrelated'], rejectedIds: [group[1].id] }
  ]) {
    assert.equal(resolveDeleteGroup(initial, id, { group, ...result }), initial);
  }
  assert.equal(resolveDeleteGroup(initial, 'missing', { group, confirmedIds: [], rejectedIds: group.map((item) => item.id) }), initial);
});
