const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { checkAuth } = require('./auth');

const MAX_BODY = 8 * 1024 * 1024;

/** 从 .env 与 process.env 读配置（process.env 优先） */
function loadEnv(dir) {
  const env = {};
  const file = path.join(dir, '.env');
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && m[2] && !m[2].startsWith('#')) {
        env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    /* .env 可选 */
  }
  return { ...env, ...process.env };
}

function etagOf(buf) {
  return crypto.createHash('sha1').update(buf).digest('hex').slice(0, 12);
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function createBridge({ file, token, maxBody = MAX_BODY }) {
  // 写串行化：check+write 必须原子成对，防止并发 PUT 双双通过 etag 检查
  let writeChain = Promise.resolve();
  let tmpSeq = 0;

  function readState() {
    return fs.promises.readFile(file).then(
      (buf) => ({ etag: etagOf(buf), state: buf.toString('utf8') }),
      (err) => {
        if (err.code === 'ENOENT') return { etag: null, state: null };
        throw err;
      }
    );
  }

  function atomicWrite(content) {
    const tmp = `${file}.tmp.${process.pid}.${tmpSeq++}`;
    return fs.promises
      .writeFile(tmp, content, { mode: 0o600, flag: 'wx' })
      .then(() => fs.promises.rename(tmp, file))
      .catch(async (err) => {
        await fs.promises.unlink(tmp).catch(() => {});
        throw err;
      });
  }

  function putSync(req, res, url) {
    const chunks = [];
    let size = 0;
    let aborted = false;

    req.on('data', (chunk) => {
      if (aborted) return;
      size += chunk.length;
      if (size > maxBody) {
        aborted = true;
        sendJson(res, 413, { error: 'body too large' });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (aborted) return;
      const body = Buffer.concat(chunks);
      const expected = url.searchParams.get('etag'); // null = 客户端侧无文件

      const task = writeChain.then(async () => {
        const current = await readState();
        if (current.etag !== null && current.etag !== expected) {
          return { status: 409, payload: { etag: current.etag } };
        }
        await atomicWrite(body);
        return { status: 200, payload: { etag: etagOf(body) } };
      });
      writeChain = task.catch(() => {});

      task.then(
        ({ status, payload }) => sendJson(res, status, payload),
        (err) => {
          console.error('[bridge] write failed:', err);
          sendJson(res, 500, { error: 'write failed' });
        }
      );
    });

    req.on('error', () => {});
  }

  const server = http.createServer((req, res) => {
    const started = Date.now();
    const url = new URL(req.url, 'http://bridge');
    const finish = (status) => {
      console.log(`${req.method} ${url.pathname} ${status} ${Date.now() - started}ms`);
    };
    res.on('finish', () => finish(res.statusCode));

    if (url.pathname === '/health' && req.method === 'GET') {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (url.pathname !== '/sync') {
      sendJson(res, 404, { error: 'not found' });
      return;
    }

    if (!checkAuth(req, token)) {
      sendJson(res, 401, { error: 'unauthorized' });
      return;
    }

    if (req.method === 'GET') {
      readState().then(
        (state) => sendJson(res, 200, state),
        (err) => {
          console.error('[bridge] read failed:', err);
          sendJson(res, 500, { error: 'read failed' });
        }
      );
      return;
    }

    if (req.method === 'PUT') {
      putSync(req, res, url);
      return;
    }

    sendJson(res, 405, { error: 'method not allowed' });
  });

  return server;
}

if (require.main === module) {
  const env = loadEnv(__dirname + '/..');
  const file = env.SYNC_FILE;
  const token = env.SYNC_TOKEN;
  const port = parseInt(env.SYNC_PORT || '8642', 10);

  if (!file || !token || token.length < 8) {
    console.error('[bridge] SYNC_FILE and SYNC_TOKEN (>=8 chars) are required; refusing to start');
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(file), { recursive: true });
  const server = createBridge({ file, token });
  server.listen(port, '0.0.0.0', () => {
    console.log(`[bridge] listening on 0.0.0.0:${port} file=${file}`);
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 3000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

module.exports = { createBridge };
