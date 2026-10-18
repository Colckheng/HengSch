import { it } from 'node:test';
import assert from 'node:assert/strict';
import { createSseFeed, accumulateToolCalls, compactTodoLines, buildSystemPrompt } from './ai-service';
import type { Todo, Group } from '@hengsch/shared-types';

it('SSE feed survives arbitrary chunk boundaries and keeps partial lines buffered', () => {
  const feed = createSseFeed();
  assert.deepEqual(feed.push('data: {"a":1}\n'), ['{"a":1}']);
  assert.deepEqual(feed.push('data: {"b"'), []);
  assert.deepEqual(feed.push(':2}\n\n: keep-alive\ndata: [DONE]\r\n'), ['{"b":2}', '[DONE]']);
  assert.deepEqual(feed.push('data: x\n'), ['x']);
});

it('tool call deltas merge by index with chunked arguments', () => {
  const acc = new Map<number, { id: string; name: string; args: string }>();
  accumulateToolCalls(acc, [{ index: 0, id: 'call_1', function: { name: 'create_todo', arguments: '{"title":' } }]);
  accumulateToolCalls(acc, [{ index: 0, function: { arguments: '"买菜"}' } }]);
  accumulateToolCalls(acc, [{ index: 1, id: 'call_2', function: { name: 'list_todos', arguments: '' } }]);
  assert.equal(acc.get(0)!.name, 'create_todo');
  assert.equal(acc.get(0)!.args, '{"title":"买菜"}');
  assert.equal(acc.get(1)!.name, 'list_todos');
  accumulateToolCalls(acc, undefined);
  assert.equal(acc.size, 2);
});

it('todo context caps to 100 pending-first lines with group and monitor annotations', () => {
  const groups: Group[] = [{ id: 'g1', name: '工作', color: '#000', createdAt: 1, updatedAt: 1 }];
  const many: Todo[] = Array.from({ length: 120 }, (_, index) => ({
    id: `t${index}`, title: `任务${index}`, type: 'once', status: index % 2 ? 'completed' : 'pending', createdAt: 1, updatedAt: 1, order: index
  }));
  const line = compactTodoLines(many, groups);
  assert.equal(many.length, 120);
  assert.ok(line.split('\n').length <= 100);
  assert.ok(line.startsWith('#t0 [待办] 任务0 | 分组:未分类'));
  const annotated = compactTodoLines([{ ...many[0], groupId: 'g1', monitor: { exeName: 'chrome.exe', thresholdMinutes: 10 } }], groups);
  assert.ok(annotated.includes('分组:工作'));
  assert.ok(annotated.includes('监测:chrome.exe'));
  assert.equal(compactTodoLines([], groups), '（暂无待办）');
});

it('system prompt carries clock, groups, processes and rules', () => {
  const prompt = buildSystemPrompt(
    [{ id: 't1', title: '写周报', type: 'once', status: 'pending', createdAt: 1, updatedAt: 1, order: 0 }],
    [{ id: 'g1', name: '工作', color: '#000', createdAt: 1, updatedAt: 1 }],
    ['chrome.exe', 'Code.exe'],
    1_700_000_000_000
  );
  assert.ok(prompt.includes('当前时间：') && prompt.includes('（ISO 2023-11-14T22:13:20.000Z）'));
  assert.ok(prompt.includes('分组列表：g1=工作'));
  assert.ok(prompt.includes('当前运行进程：chrome.exe, Code.exe'));
  assert.ok(prompt.includes('#t1 [待办] 写周报'));
  assert.ok(prompt.includes('toggleStatus'));
  assert.equal(buildSystemPrompt([], [], [], Date.now()).includes('当前待办：\n（暂无待办）'), true);
});
