const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createBridge } = require('../src/server');

const TOKEN = 'test-token-0123456789abcdef';
const BAD_TOKEN = 'wrong-token-0123456789ab';
let dir;
let file;
let server;
let base;

function req(method, pathname, { token = TOKEN, body, headers = {} } = {}) {
  const opts = {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Length': Buffer.byteLength(body) } : {}),
      ...headers
    },
    ...(body !== undefined ? { body } : {})
  };
  return fetch(`${base}${pathname}`, opts);
}

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-test-'));
  file = path.join(dir, 'sync.json');
  server = createBridge({ file, token: TOKEN, maxBody: 1024 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('health 无鉴权可达', async () => {
  const res = await fetch(`${base}/health`);
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(await res.json(), { ok: true });
});

test('缺 token / 错 token → 401', async () => {
  assert.strictEqual((await req('GET', '/sync', { token: null })).status, 401);
  assert.strictEqual((await req('GET', '/sync', { token: BAD_TOKEN })).status, 401);
  assert.strictEqual((await req('PUT', '/sync', { token: BAD_TOKEN, body: 'x' })).status, 401);
});

test('无文件 GET → etag null, state null', async () => {
  const res = await req('GET', '/sync');
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(await res.json(), { etag: null, state: null });
});

test('建档 PUT（etag null）→ 200；中文 roundtrip', async () => {
  const state = JSON.stringify({ version: 1, todos: [{ id: '测试' }], groups: [] });
  const res = await req('PUT', '/sync?etag=', { body: state });
  // query 无值 → null
  assert.strictEqual(res.status, 200);
  const { etag } = await res.json();
  assert.match(etag, /^[0-9a-f]{12}$/);

  const back = await (await req('GET', '/sync')).json();
  assert.strictEqual(back.etag, etag);
  assert.strictEqual(back.state, state);
});

test('PUT etag 不匹配 → 409 + 当前 etag；文件不被改动', async () => {
  const current = await (await req('GET', '/sync')).json();
  const body = JSON.stringify({ version: 1, todos: [], groups: [], note: 'tampered' });
  const res = await req('PUT', '/sync?etag=deadbeef0000', { body });
  assert.strictEqual(res.status, 409);
  assert.strictEqual((await res.json()).etag, current.etag);
  const after = await (await req('GET', '/sync')).json();
  assert.strictEqual(after.state, current.state);
});

test('PUT etag 匹配 → 200 新 etag', async () => {
  const current = await (await req('GET', '/sync')).json();
  const next = JSON.stringify({ version: 1, todos: [], groups: [], note: '第二版' });
  const res = await req('PUT', `/sync?etag=${current.etag}`, { body: next });
  assert.strictEqual(res.status, 200);
  const { etag } = await res.json();
  assert.notStrictEqual(etag, current.etag);
  const after = await (await req('GET', '/sync')).json();
  assert.strictEqual(after.state, next);
});

test('并发 PUT 同一 etag → 恰好一个 200 一个 409', async () => {
  const current = await (await req('GET', '/sync')).json();
  const url = `/sync?etag=${current.etag}`;
  const bodyA = JSON.stringify({ version: 1, todos: [{ id: 'writer-A' }], groups: [] });
  const bodyB = JSON.stringify({ version: 1, todos: [{ id: 'writer-B' }], groups: [] });
  const [a, b] = await Promise.all([
    req('PUT', url, { body: bodyA }),
    req('PUT', url, { body: bodyB })
  ]);
  const statuses = [a.status, b.status].sort();
  assert.deepStrictEqual(statuses, [200, 409]);
  // 胜者内容完整（原子写，无撕裂）
  const state = (await (await req('GET', '/sync')).json()).state;
  assert.ok(state === bodyA || state === bodyB, `got: ${state}`);
});

test('非法 JSON body → 400，且文件不被改动', async () => {
  const current = await (await req('GET', '/sync')).json();
  const res = await req('PUT', `/sync?etag=${current.etag}`, { body: 'not-json' });
  assert.strictEqual(res.status, 400);
  const after = await (await req('GET', '/sync')).json();
  assert.strictEqual(after.state, current.state);
});

test('合法 JSON 但缺 todos/groups → 400', async () => {
  const current = await (await req('GET', '/sync')).json();
  const res = await req('PUT', `/sync?etag=${current.etag}`, { body: JSON.stringify({ foo: 1 }) });
  assert.strictEqual(res.status, 400);
});

test('超限 body → 413', async () => {
  const current = await (await req('GET', '/sync')).json();
  const res = await req('PUT', `/sync?etag=${current.etag}`, { body: 'x'.repeat(2048) });
  assert.strictEqual(res.status, 413);
});

test('未知路径 → 404；错误方法 → 405', async () => {
  assert.strictEqual((await req('GET', '/nope')).status, 404);
  assert.strictEqual((await req('DELETE', '/sync')).status, 405);
});

test('OPTIONS 预检 → 204 + CORS 头', async () => {
  const res = await fetch(`${base}/sync`, { method: 'OPTIONS' });
  assert.strictEqual(res.status, 204);
  assert.strictEqual(res.headers.get('access-control-allow-origin'), '*');
  assert.match(res.headers.get('access-control-allow-methods') || '', /PUT/);
  assert.match(res.headers.get('access-control-allow-headers') || '', /Authorization/i);
});

test('普通请求带 CORS 头', async () => {
  const res = await fetch(`${base}/health`);
  assert.strictEqual(res.headers.get('access-control-allow-origin'), '*');
});
