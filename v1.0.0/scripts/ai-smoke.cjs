const { buildSync } = require('esbuild');
const { mkdtempSync, unlinkSync, rmdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

const live = process.argv.includes('--live');
const temporary = mkdtempSync(path.join(tmpdir(), 'hengsch-ai-smoke-'));
const outfile = path.join(temporary, 'ai-service.cjs');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sse(object) {
  return `data: ${JSON.stringify(object)}\n`;
}

function fakeResponse(chunks) {
  let index = 0;
  return {
    ok: true,
    status: 200,
    text: async () => '',
    body: {
      getReader() {
        return {
          async read() {
            if (index >= chunks.length) return { done: true, value: undefined };
            return { done: false, value: Buffer.from(chunks[index++]) };
          }
        };
      }
    }
  };
}

function toolRound(title) {
  const joined = [
    sse({ choices: [{ delta: { content: '好的，' } }] }),
    sse({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'create_todo', arguments: '{"title":' } }] } }] }),
    sse({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: JSON.stringify(title) + '}' } }] } }] }),
    'data: [DONE]\n'
  ].join('');
  return [joined.slice(0, 61), joined.slice(61, 140), joined.slice(140)];
}

const finalRound = [sse({ choices: [{ delta: { content: '已生成预览卡，去列表里确认。' } }] }) + 'data: [DONE]\n'];

async function main() {
  buildSync({ stdin: { contents: `export * from './src/main/ai-service';`, resolveDir: path.join(__dirname, '..') }, outfile, bundle: true, platform: 'node' });
  const ai = require(outfile);
  const data = {
    todos: [],
    groups: [{ id: 'default', name: '未分类', color: '#999', createdAt: 1, updatedAt: 1 }],
    deviceId: 'smoke-dev'
  };
  const store = { get: (key) => data[key], set: (key, value) => { data[key] = value; } };
  const pushed = [];
  ai.initAiService(store, (channel, payload) => pushed.push({ channel, payload }));

  if (live) {
    const key = process.env.DEEPSEEK_API_KEY;
    if (!key) throw new Error('--live 需要设置 DEEPSEEK_API_KEY');
    ai.writeAiSettings(store, { apiKey: key });
    const result = await ai.runAiChat({ messages: [{ role: 'user', content: '只回复“连通”两个字，不要调用任何工具' }], processNames: ['chrome.exe'] });
    console.log('LIVE error=', result.error ?? 'none', 'proposals=', result.proposals.length);
    assert(!result.error, `live 调用失败：${result.error}`);
    return;
  }

  const queue = [toolRound('买牛奶'), finalRound, toolRound('买面包'), finalRound, { ok: false, status: 401, text: async () => 'invalid api key' }];
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls += 1;
    assert(String(url).includes('api.deepseek.com'), `unexpected url ${url}`);
    assert(init && init.headers.Authorization === 'Bearer sk-test', 'missing auth header');
    const next = queue.shift();
    assert(next, `unexpected fetch call ${calls}`);
    if (Array.isArray(next)) return fakeResponse(next);
    return next;
  };

  ai.writeAiSettings(store, { apiKey: 'sk-test' });
  const first = await ai.runAiChat({ messages: [{ role: 'user', content: '加个待办：买牛奶' }], processNames: ['chrome.exe'] });
  assert(!first.error, `first run failed: ${first.error}`);
  assert(calls === 2, `expected 2 rounds, got ${calls}`);
  assert(first.proposals.length === 1 && first.proposals[0].kind === 'create', 'expected one staged create');
  assert(first.proposals[0].draft.title === '买牛奶', 'draft title mismatch');
  assert(data.todos.length === 0, 'stage must not write todos');
  const chunks = pushed.filter((item) => item.channel === 'ai:chunk').map((item) => item.payload.delta).join('');
  assert(chunks.includes('预览卡'), `streamed chunks missing reply: ${chunks}`);

  ai.commitProposal(first.proposals[0].id);
  assert(data.todos.length === 1 && data.todos[0].title === '买牛奶', 'commit must append todo');
  assert(data.todos[0].deviceId === 'smoke-dev', 'deviceId must come from store');
  assert(pushed.some((item) => item.channel === 'sync:merged'), 'commit must push sync:merged');
  let doubleCommit = false;
  try { ai.commitProposal(first.proposals[0].id); } catch (error) { doubleCommit = /过期/.test(error.message); }
  assert(doubleCommit, 'double commit must be rejected');

  const second = await ai.runAiChat({ messages: [{ role: 'user', content: '再加个待办：买面包' }], processNames: ['chrome.exe'] });
  assert(!second.error, `second run failed: ${second.error}`);
  assert(second.proposals.length === 1, 'second run must stage one proposal');
  assert(ai.rejectProposal(second.proposals[0].id) === true, 'reject must return true');
  assert(data.todos.length === 1, 'reject must not write');
  let commitAfterReject = false;
  try { ai.commitProposal(second.proposals[0].id); } catch (error) { commitAfterReject = /过期/.test(error.message); }
  assert(commitAfterReject, 'commit after reject must be rejected');

  ai.writeAiSettings(store, { apiKey: '' });
  const noKey = await ai.runAiChat({ messages: [{ role: 'user', content: 'hi' }], processNames: ['chrome.exe'] });
  assert(noKey.error && noKey.error.includes('未配置 AI'), 'missing key must surface as error value');
  assert(calls === 4, `no-key run must not fetch, calls=${calls}`);

  ai.writeAiSettings(store, { apiKey: 'sk-test' });
  const unauthorized = await ai.runAiChat({ messages: [{ role: 'user', content: 'hi' }], processNames: ['chrome.exe'] });
  assert(unauthorized.error && unauthorized.error.includes('API key 无效'), `401 must map to friendly error, got ${unauthorized.error}`);
  console.log('ai-smoke ok');
}

main()
  .catch((error) => {
    console.error(`ai-smoke FAILED: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => {
    try { unlinkSync(outfile); } catch { /* build may have failed */ }
    rmdirSync(temporary);
  });
