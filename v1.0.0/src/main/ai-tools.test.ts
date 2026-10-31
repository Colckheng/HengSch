import { it } from 'node:test';
import assert from 'node:assert/strict';
import { stageProposal, stageProposalBatch, applyProposal, type AiDataContext } from './ai-tools';
import type { Todo, Group, MonitorConfig, RecurringTodo } from '@hengsch/shared-types';

const NOW = 1_700_000_000_000;
const monitor: MonitorConfig = { exeName: 'chrome.exe', thresholdMinutes: 30, auto: true, askOnExit: false };
const todo: Todo = { id: 't1', title: '写周报', type: 'once', status: 'pending', createdAt: 1, updatedAt: 1, order: 3, groupId: 'g1', remindAt: NOW + 60_000, remindLeadMs: 0 };
const done: Todo = { id: 't2', title: '归档', type: 'once', status: 'completed', createdAt: 1, updatedAt: 1, order: 1, completedAt: 5 };
const groups: Group[] = [
  { id: 'g1', name: '工作', color: '#000', createdAt: 1, updatedAt: 1 },
  { id: 'default', name: '未分类', color: '#999', createdAt: 1, updatedAt: 1 }
];
function ctx(partial?: Partial<AiDataContext>): AiDataContext {
  return { todos: [todo, done], groups, processNames: ['chrome.exe', 'Code.exe'], now: NOW, deviceId: 'dev', ...partial };
}

it('create normalizes fields, resolves group by name and appends with next order', () => {
  const proposal = stageProposal('create', { title: '  买牛奶 ', groupId: '工作', remindAt: NOW + 3600_000, remindLeadMs: 600_000, monitor: { exeName: 'chrome.exe', thresholdMinutes: 30 } }, ctx());
  const next = applyProposal(proposal, ctx());
  assert.equal(next.length, 3);
  const created = next[2];
  assert.equal(created.title, '买牛奶');
  assert.equal(created.groupId, 'g1');
  assert.equal(created.order, 4);
  assert.equal(created.createdAt, NOW);
  assert.equal(created.updatedAt, NOW);
  assert.equal(created.deviceId, 'dev');
  assert.equal(created.status, 'pending');
  assert.equal(created.remindAt, NOW + 3600_000);
  assert.equal(created.remindLeadMs, 600_000);
  assert.deepEqual(created.monitor, monitor);
  assert.equal(todo.title, '写周报');
});

it('create accepts recurring with cycle and stamps nextDueDate', () => {
  const proposal = stageProposal('create', { title: '打卡', type: 'recurring', cycleType: 'custom', customCycleDays: 3, remindAt: NOW + 86_400_000 }, ctx());
  const next = applyProposal(proposal, ctx());
  const created = next[2] as Todo & { cycleType: string; customCycleDays: number; nextDueDate: number };
  assert.equal(created.type, 'recurring');
  assert.equal(created.cycleType, 'custom');
  assert.equal(created.customCycleDays, 3);
  assert.equal(created.nextDueDate, NOW + 86_400_000);
});

it('create accepts ISO 8601 reminder with offset and keeps numeric compatibility', () => {
  const iso = '2026-11-01T09:00:00+08:00';
  const proposal = stageProposal('create', { title: '报销', remindAt: iso }, ctx());
  assert.equal(proposal.kind === 'create' ? proposal.draft.remindAt : null, Date.parse(iso));
  const numeric = stageProposal('create', { title: '报销', remindAt: String(NOW + 60_000) }, ctx());
  assert.equal(numeric.kind === 'create' ? numeric.draft.remindAt : null, NOW + 60_000);
  assert.throws(() => stageProposal('create', { title: 'x', remindAt: iso }, ctx({ now: Date.parse(iso) + 1 })), /必须晚于当前时间/);
  assert.throws(() => stageProposal('create', { title: 'x', remindAt: '明天九点' }, ctx()), /ISO 8601/);
});

it('create rejects invalid payloads with Chinese errors', () => {
  const bad: unknown[] = [
    42, {}, { title: ' ' }, { title: 'x', remindAt: NOW - 1 }, { title: 'x', remindAt: '明天' },
    { title: 'x', groupId: '不存在' }, { title: 'x', monitor: { exeName: 'notepad.exe', thresholdMinutes: 5 } },
    { title: 'x', monitor: { exeName: 'chrome.exe', thresholdMinutes: 0 } }, { title: 'x', type: 'recurring' },
    { title: 'x', type: 'recurring', cycleType: 'custom', customCycleDays: 0 }, { title: 'x', cycleType: 'daily' },
    { title: 'x'.repeat(300) }
  ];
  for (const raw of bad) assert.throws(() => stageProposal('create', raw, ctx()), Error, JSON.stringify(raw));
  assert.throws(() => stageProposal('create', { title: 'x', groupId: '不存在' }, ctx()), /分组不存在/);
  assert.throws(() => stageProposal('create', { title: 'x', monitor: { exeName: 'notepad.exe' } }, ctx()), /进程不存在/);
  assert.throws(() => stageProposal('create', { title: 'x', remindAt: NOW - 1 }, ctx()), /必须晚于当前时间/);
});

it('update patches title, toggles status and bumps revision monotonically', () => {
  const c = ctx({ todos: [{ ...todo, updatedAt: NOW + 5 }] });
  const proposal = stageProposal('update', { todoId: 't1', title: '写月报', toggleStatus: true }, c);
  const next = applyProposal(proposal, c);
  const target = next.find((item) => item.id === 't1')!;
  assert.equal(target.title, '写月报');
  assert.equal(target.status, 'completed');
  assert.equal(target.updatedAt, NOW + 6);
  assert.equal(target.deviceId, 'dev');
  assert.equal(next.length, 1);
});

it('update clears remind stamp and removes monitor with null', () => {
  const c = ctx({ todos: [{ ...todo, monitor, remindedAt: NOW - 5 }] });
  const proposal = stageProposal('update', { todoId: 't1', remindAt: 'clear', monitor: null }, c);
  const next = applyProposal(proposal, c);
  const target = next.find((item) => item.id === 't1')!;
  assert.equal(target.remindAt, undefined);
  assert.equal(target.remindLeadMs, undefined);
  assert.equal(target.remindedAt, undefined);
  assert.equal(target.monitor, undefined);
});

it('update rejects unknown id, empty patch and future violations', () => {
  assert.throws(() => stageProposal('update', { todoId: 'zz', title: 'x' }, ctx()), /不存在/);
  assert.throws(() => stageProposal('update', { todoId: 't1' }, ctx()), /没有要修改的内容/);
  assert.throws(() => stageProposal('update', { todoId: 't1', remindAt: NOW - 1 }, ctx()), /必须晚于当前时间/);
});

it('update clears description with the clear sentinel and keeps non-string rejection', () => {
  const c = ctx({ todos: [{ ...todo, description: '旧描述' }] });
  const cleared = applyProposal(stageProposal('update', { todoId: 't1', description: 'clear' }, c), c);
  assert.equal(cleared.find((item) => item.id === 't1')!.description, undefined);
  const replaced = applyProposal(stageProposal('update', { todoId: 't1', description: '新描述' }, c), c);
  assert.equal(replaced.find((item) => item.id === 't1')!.description, '新描述');
  assert.throws(() => stageProposal('update', { todoId: 't1', description: 42 }, c), /描述必须是文本/);
});

it('delete tombstones instead of physically removing', () => {
  const proposal = stageProposal('delete', { todoId: 't2' }, ctx());
  const next = applyProposal(proposal, ctx());
  assert.equal(next.length, 2);
  const target = next.find((item) => item.id === 't2')!;
  assert.equal(target.deleted, true);
  assert.equal(target.updatedAt, NOW);
  assert.equal(target.deviceId, 'dev');
});

it('commit-time patch revalidates against the same rules', () => {
  const proposal = stageProposal('create', { title: 'A' }, ctx());
  const patched = applyProposal(proposal, ctx(), { title: 'B', remindAt: NOW + 1000 });
  assert.equal(patched[2].title, 'B');
  assert.equal(patched[2].remindAt, NOW + 1000);
  assert.throws(() => applyProposal(stageProposal('create', { title: 'A' }, ctx()), ctx(), { title: '   ' }), /标题不能为空/);
  assert.throws(() => applyProposal(stageProposal('create', { title: 'A' }, ctx()), ctx(), { monitor: { exeName: 'ghost.exe' } }), /进程不存在/);
  assert.throws(() => applyProposal(stageProposal('delete', { todoId: 't1' }, ctx()), { ...ctx(), todos: [done] }), /已被删除/);
});

it('stageProposalBatch keeps order, summaries and kinds; caps at 10', () => {
  const batch = stageProposalBatch([
    { summary: '绝区零日常（每日，游戏）', action: 'create', draft: { title: '绝区零日常', type: 'recurring', cycleType: 'daily', groupId: 'g1' } },
    { summary: '原神周常', action: 'create', draft: { title: '原神周常', type: 'recurring', cycleType: 'weekly' } },
    { summary: '删掉写周报', action: 'delete', draft: { todoId: 't1' } }
  ], ctx());
  assert.equal(batch.length, 3);
  assert.deepEqual(batch.map((entry) => entry.summary), ['绝区零日常（每日，游戏）', '原神周常', '删掉写周报']);
  assert.deepEqual(batch.map((entry) => entry.proposal.kind), ['create', 'create', 'delete']);
  const tooMany = Array.from({ length: 11 }, (_, i) => ({ summary: `s${i}`, action: 'create', draft: { title: `t${i}` } }));
  assert.throws(() => stageProposalBatch(tooMany, ctx()), /最多暂存 10 条/);
});

it('stageProposalBatch is atomic: any invalid entry rejects the whole batch', () => {
  assert.throws(() => stageProposalBatch([
    { summary: '合法', action: 'create', draft: { title: 'ok' } },
    { summary: '非法', action: 'create', draft: { title: 'ok', groupId: '不存在' } }
  ], ctx()), /分组不存在/);
  assert.throws(() => stageProposalBatch([
    { summary: '合法', action: 'create', draft: { title: 'ok' } },
    { action: 'create', draft: { title: '缺 summary' } }
  ], ctx()), /缺少 summary/);
  assert.throws(() => stageProposalBatch([], ctx()), /非空数组/);
  assert.throws(() => stageProposalBatch([{ summary: 'x', action: 'upsert', draft: {} }], ctx()), /action 只能是/);
});

it('recurring create aligns nextDueDate to target time (remindAt + lead)', () => {
  const lead = 600_000;
  const trigger = NOW + 3_600_000;
  const proposal = stageProposal('create', { title: '打卡', type: 'recurring', cycleType: 'daily', remindAt: trigger, remindLeadMs: lead }, ctx());
  const created = applyProposal(proposal, ctx())[2] as RecurringTodo;
  assert.equal(created.remindAt, trigger);
  assert.equal(created.nextDueDate, trigger + lead);
});

it('recurring update to remindAt realigns nextDueDate to the new target', () => {
  const recurring: RecurringTodo = {
    id: 'r1', title: '每日打卡', type: 'recurring', cycleType: 'daily', status: 'pending',
    createdAt: 1, updatedAt: 1, order: 0, nextDueDate: NOW + 86_400_000,
    remindAt: NOW + 86_400_000 - 600_000, remindLeadMs: 600_000
  };
  const c = ctx({ todos: [recurring] });
  const newTarget = NOW + 2 * 86_400_000;
  const proposal = stageProposal('update', { todoId: 'r1', remindAt: newTarget - 600_000, remindLeadMs: 600_000 }, c);
  const target = applyProposal(proposal, c).find((item) => item.id === 'r1') as RecurringTodo;
  assert.equal(target.remindAt, newTarget - 600_000);
  assert.equal(target.nextDueDate, newTarget);
});

it('recurring update clearing remind keeps nextDueDate anchor', () => {
  const recurring: RecurringTodo = {
    id: 'r2', title: '每日打卡', type: 'recurring', cycleType: 'daily', status: 'pending',
    createdAt: 1, updatedAt: 1, order: 0, nextDueDate: NOW + 86_400_000,
    remindAt: NOW + 86_400_000 - 600_000, remindLeadMs: 600_000
  };
  const c = ctx({ todos: [recurring] });
  const target = applyProposal(stageProposal('update', { todoId: 'r2', remindAt: 'clear' }, c), c).find((item) => item.id === 'r2') as RecurringTodo;
  assert.equal(target.remindAt, undefined);
  assert.equal(target.nextDueDate, NOW + 86_400_000);
});
