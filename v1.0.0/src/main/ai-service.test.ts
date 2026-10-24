import { it } from 'node:test';
import assert from 'node:assert/strict';
import { createSseFeed, accumulateToolCalls, compactTodoLines, buildSystemPrompt, writeAiSettings, initAiService, runAiChat, cancelAiChat, parseMonitorVerdict, requestMonitorVerdict } from './ai-service';
import type { Todo, Group } from '@hengsch/shared-types';
import type Store from 'electron-store';

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

it('system prompt carries serial flow rules for stage_batch overview', () => {
  const prompt = buildSystemPrompt([], [], [], Date.now(), 1);
  assert.ok(prompt.includes('stage_batch'));
  assert.ok(prompt.includes('清单总览'));
  assert.ok(prompt.includes('[流程]'));
  assert.ok(prompt.includes('一次至多 10 条'));
  assert.ok(prompt.includes('循环待办只关心“时刻”'));
});

it('promptLevel picks exactly one detail rule', () => {
  const level1 = buildSystemPrompt([], [], [], Date.now(), 1);
  assert.ok(level1.includes('详细程度档1'));
  assert.ok(level1.includes('禁止向用户追问'));
  assert.equal(level1.includes('详细程度档2'), false);

  const level2 = buildSystemPrompt([], [], [], Date.now(), 2);
  assert.ok(level2.includes('详细程度档2'));
  assert.ok(level2.includes('编号列表集中提问'));
  assert.equal(level2.includes('详细程度档1'), false);
});

it('writeAiSettings rejects invalid promptLevel and keeps current when omitted', () => {
  const data: Record<string, unknown> = {};
  const fake = {
    get: (key: string) => data[key],
    set: (key: string, value: unknown) => {
      data[key] = value;
    }
  } as unknown as Store;
  const saved = writeAiSettings(fake, { promptLevel: 2 });
  assert.equal(saved.promptLevel, 2);
  assert.throws(() => writeAiSettings(fake, { promptLevel: 3 as unknown as 1 }), /详细程度只能是 1 或 2/);
  assert.throws(() => writeAiSettings(fake, { promptLevel: '2' as unknown as 1 }), /详细程度只能是 1 或 2/);
  const kept = writeAiSettings(fake, { monitorVerdictEnabled: true });
  assert.equal(kept.promptLevel, 2);
  assert.equal(kept.monitorVerdictEnabled, true);
});

it('runAiChat concurrency gate rejects second call while first is active', async () => {
  const data: Record<string, unknown> = {
    aiSettings: { apiKey: 'sk-test', model: 'deepseek-flash', monitorVerdictEnabled: false, promptLevel: 1 },
    todos: [],
    groups: []
  };
  const fake = {
    get: (key: string) => data[key],
    set: (key: string, value: unknown) => {
      data[key] = value;
    }
  } as unknown as Store;
  initAiService(fake, () => undefined);
  const originalFetch = globalThis.fetch;
  const gate: { release?: () => void } = {};
  globalThis.fetch = (() =>
    new Promise<Response>((resolve) => {
      gate.release = () => resolve(new Response('data: [DONE]\n', { status: 200 }));
    })) as typeof fetch;
  try {
    const first = runAiChat({ messages: [{ role: 'user', content: 'hi' }], processNames: [] });
    // 让第一轮进入 fetch 挂起后再发第二轮
    await new Promise((resolve) => setTimeout(resolve, 20));
    const second = await runAiChat({ messages: [{ role: 'user', content: 'again' }], processNames: [] });
    assert.equal(second.proposals.length, 0);
    assert.equal(second.error, 'AI 正在生成中，请先停止或等待完成');
    gate.release?.();
    await first;
  } finally {
    cancelAiChat();
    globalThis.fetch = originalFetch;
  }
});

it('parseMonitorVerdict tolerates junk/code fences, slices reason, rejects invalid verdicts', () => {
  assert.deepEqual(parseMonitorVerdict('{"verdict":"complete","reason":"运行足够久"}'), { verdict: 'complete', reason: '运行足够久' });
  assert.deepEqual(parseMonitorVerdict('好的。\n```json\n{"verdict":"keep","reason":"与任务无关"}\n```'), { verdict: 'keep', reason: '与任务无关' });
  assert.deepEqual(parseMonitorVerdict('{"verdict":"ask","reason":""}'), { verdict: 'ask', reason: '' });
  assert.equal(parseMonitorVerdict('{"verdict":"done","reason":"x"}'), null);
  assert.equal(parseMonitorVerdict('没有 JSON'), null);
  assert.equal(parseMonitorVerdict('{"verdict":'), null);
  const long = parseMonitorVerdict(`{"verdict":"keep","reason":"${'啊'.repeat(300)}"}`);
  assert.equal(long?.reason.length, 120);
});

it('requestMonitorVerdict: 开关关/无 key → null；200 解析；HTTP 错 → null', async () => {
  const data: Record<string, unknown> = {
    aiSettings: { apiKey: 'sk-test', model: 'deepseek-flash', monitorVerdictEnabled: true, promptLevel: 1 },
    todos: [],
    groups: []
  };
  const fake = {
    get: (key: string) => data[key],
    set: (key: string, value: unknown) => {
      data[key] = value;
    }
  } as unknown as Store;
  initAiService(fake, () => undefined);
  const input = { title: '写周报', exeName: 'chrome.exe', runtimeMinutes: 45, status: 'pending' as const };
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: '{"verdict":"complete","reason":"已写完"}' } }] })
    })) as unknown as typeof fetch;
    assert.deepEqual(await requestMonitorVerdict(input), { verdict: 'complete', reason: '已写完' });
    globalThis.fetch = (async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch;
    assert.equal(await requestMonitorVerdict(input), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
  writeAiSettings(fake, { monitorVerdictEnabled: false });
  assert.equal(await requestMonitorVerdict(input), null);
  writeAiSettings(fake, { monitorVerdictEnabled: true, apiKey: '' });
  assert.equal(await requestMonitorVerdict(input), null);
});
