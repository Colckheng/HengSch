import { Client, utils } from 'ssh2';
import type { ConnectConfig, SFTPWrapper } from 'ssh2';
import { safeStorage } from 'electron';
import { mergeSyncStates, parseSyncFile, normalizeSynced } from '@hengsch/shared-logic';
import type { SyncConfig, SyncStatus, SyncPayload } from '@hengsch/shared-types';
import type Store from 'electron-store';

type SendFn = (channel: string, payload: unknown) => void;

const BASE_INTERVAL_MS = 60_000;
const FIRST_RUN_DELAY_MS = 5_000;
const OFFLINE_BACKOFF0_MS = 5_000;
const READY_TIMEOUT_MS = 8_000;
const PUT_ATTEMPTS = 3;
const PUT_BACKOFF_MS = 500;

let store: Store;
let send: SendFn;
let timer: NodeJS.Timeout | null = null;
let running = false;
let offlineStreak = 0;
let status: SyncStatus = { state: 'OFF', at: 0 };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 回调风格 SFTP 方法 → Promise（带结果） */
function call<T>(fn: (cb: (err: Error | null | undefined, result: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    fn((err, result) => (err ? reject(err) : resolve(result)));
  });
}

/** 回调风格 SFTP 方法 → Promise（无结果） */
function callVoid(fn: (cb: (err: Error | null | undefined) => void) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    fn((err) => (err ? reject(err) : resolve()));
  });
}

function setStatus(state: SyncStatus['state'], error?: string): void {
  status = { state, at: Date.now(), error };
  send('sync:status', status);
}

function getConfig(): SyncConfig | null {
  const cfg = store.get('syncConfig') as SyncConfig | undefined;
  if (!cfg || typeof cfg !== 'object') return null;
  return cfg;
}

function isConfigured(cfg: SyncConfig | null): cfg is SyncConfig {
  return Boolean(cfg && cfg.enabled && cfg.host && cfg.username && cfg.remotePath);
}

function localState(): SyncPayload {
  const todos = (store.get('todos') ?? []) as SyncPayload['todos'];
  const groups = (store.get('groups') ?? []) as SyncPayload['groups'];
  return { todos: Array.isArray(todos) ? todos : [], groups: Array.isArray(groups) ? groups : [] };
}

function writerId(): string {
  return (store.get('deviceId') as string | undefined) ?? 'unknown';
}

const PRIV_ENC_KEY = 'syncPrivateKeyEnc';   // safeStorage 加密后的私钥
const PRIV_LEGACY_KEY = 'syncPrivateKey';   // 旧版明文键（迁移后删除）

/** 写入私钥：系统支持则用 safeStorage 加密（Windows 走 DPAPI），否则降级 base64 明文 */
function writePrivateKey(pem: string): void {
  if (safeStorage.isEncryptionAvailable()) {
    store.set(PRIV_ENC_KEY, `enc:${safeStorage.encryptString(pem).toString('base64')}`);
  } else {
    store.set(PRIV_ENC_KEY, `plain:${Buffer.from(pem, 'utf8').toString('base64')}`);
  }
}

/** 读取私钥：优先加密存储；发现旧明文键则迁移并删除；损坏/缺失返回空串 */
function readPrivateKey(): string {
  const raw = store.get(PRIV_ENC_KEY) as string | undefined;
  if (typeof raw === 'string' && raw.startsWith('enc:')) {
    try {
      return safeStorage.decryptString(Buffer.from(raw.slice(4), 'base64'));
    } catch {
      return '';
    }
  }
  if (typeof raw === 'string' && raw.startsWith('plain:')) {
    return Buffer.from(raw.slice(6), 'base64').toString('utf8');
  }
  // 迁移：旧版明文私钥 → 加密存储后删除明文键
  const legacy = store.get(PRIV_LEGACY_KEY) as string | undefined;
  if (typeof legacy === 'string' && legacy) {
    writePrivateKey(legacy);
    store.delete(PRIV_LEGACY_KEY);
    return legacy;
  }
  return '';
}

export function ensureKeyPair(): { publicKey: string } {
  const existingPublic = store.get('syncPublicKey') as string | undefined;
  if (existingPublic && readPrivateKey()) return { publicKey: existingPublic };
  const kp = utils.generateKeyPairSync('ed25519');
  writePrivateKey(kp.private);
  store.set('syncPublicKey', kp.public);
  return { publicKey: kp.public };
}

function classifyError(error: unknown): SyncStatus['state'] {
  const err = error as { message?: string; level?: string; code?: string } | undefined;
  const message = String(err?.message ?? error ?? '');
  if (err?.level === 'client-authentication' || /authentication|publickey/i.test(message)) {
    return 'AUTH ERROR';
  }
  if (err?.code === 'ENOENT') return 'OFFLINE';
  return 'OFFLINE';
}

function connectClient(cfg: SyncConfig): Promise<Client> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      try {
        conn.end();
      } catch {
        // 忽略
      }
      reject(error);
    };
    conn.once('ready', () => {
      if (settled) return;
      settled = true;
      resolve(conn);
    });
    conn.on('error', fail);
    const connectConfig: ConnectConfig = {
      host: cfg.host,
      port: cfg.port || 22,
      username: cfg.username,
      privateKey: readPrivateKey(),
      readyTimeout: READY_TIMEOUT_MS,
      keepaliveInterval: 15_000
    };
    conn.connect(connectConfig);
  });
}

/** `~` 路径展开（OpenSSH 扩展；不支持时报错提示用绝对路径） */
async function expandRemotePath(sftp: SFTPWrapper, remotePath: string): Promise<string> {
  if (!remotePath.startsWith('~')) return remotePath;
  try {
    return await call<string>((cb) => sftp.ext_openssh_expandPath(remotePath, cb));
  } catch {
    throw new Error('远端路径不支持 ~ 展开，请改用绝对路径（如 /home/你/hengsch/sync.json）');
  }
}

function posixDirname(p: string): string {
  const idx = p.lastIndexOf('/');
  if (idx <= 0) return '/';
  return p.slice(0, idx);
}

async function readRemoteFile(sftp: SFTPWrapper, path: string): Promise<string | null> {
  try {
    const buf = await call<Buffer>((cb) => sftp.readFile(path, cb));
    return buf.toString('utf8');
  } catch (error) {
    // ssh2 SFTP 状态错误用数字码：2 = NO_SUCH_FILE（不是 Node 风格的 'ENOENT' 字符串）
    const code = (error as { code?: number | string }).code;
    if (code === 2 || code === 'ENOENT') return null;
    throw error;
  }
}

async function putAtomic(sftp: SFTPWrapper, remotePath: string, data: string): Promise<void> {
  const tmpPath = `${remotePath}.tmp`;
  await callVoid((cb) => sftp.writeFile(tmpPath, data, cb));
  try {
    await callVoid((cb) => sftp.ext_openssh_rename(tmpPath, remotePath, cb));
  } catch {
    // 服务器不支持 posix-rename@openssh.com → 降级普通 rename（非原子但可用）
    await callVoid((cb) => sftp.rename(tmpPath, remotePath, cb));
  }
}

async function putWithRetry(sftp: SFTPWrapper, remotePath: string, data: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < PUT_ATTEMPTS; attempt++) {
    try {
      await putAtomic(sftp, remotePath, data);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < PUT_ATTEMPTS - 1) await sleep(PUT_BACKOFF_MS * 2 ** attempt);
    }
  }
  throw lastError;
}

function buildFile(payload: SyncPayload): string {
  return JSON.stringify(
    {
      version: 1,
      todos: payload.todos,
      groups: payload.groups,
      writer: { deviceId: writerId(), at: Date.now() }
    },
    null,
    2
  );
}

function persistMerged(payload: SyncPayload): void {
  store.set('todos', payload.todos);
  store.set('groups', payload.groups);
}

async function runRemoteCycle(cfg: SyncConfig, local: SyncPayload): Promise<SyncPayload | null> {
  const conn = await connectClient(cfg);
  try {
    const sftp = await call<SFTPWrapper>((cb) => conn.sftp(cb));
    const remotePath = await expandRemotePath(sftp, cfg.remotePath);
    const now = Date.now();

    const remoteText = await readRemoteFile(sftp, remotePath);
    if (remoteText === null) {
      // 首次：直接上传本地全量
      const merged: SyncPayload = {
        todos: local.todos.map(normalizeSynced),
        groups: local.groups.map(normalizeSynced)
      };
      await putWithRetry(sftp, remotePath, buildFile(merged));
      return merged;
    }

    const remoteFile = parseSyncFile(remoteText);
    if (!remoteFile) {
      // 远端损坏：不写回（不洗对方数据）
      return null;
    }

    let merged = mergeSyncStates(local, { todos: remoteFile.todos, groups: remoteFile.groups }, now);
    await putWithRetry(sftp, remotePath, buildFile(merged));

    // 写后回读校验：不一致（写入窗口内被对方改写）→ 立即再合并一轮
    const verifyText = await readRemoteFile(sftp, remotePath);
    const verifyFile = verifyText === null ? null : parseSyncFile(verifyText);
    if (
      verifyFile &&
      (JSON.stringify(verifyFile.todos) !== JSON.stringify(merged.todos) ||
        JSON.stringify(verifyFile.groups) !== JSON.stringify(merged.groups))
    ) {
      const secondLocal = localState();
      merged = mergeSyncStates(secondLocal, { todos: verifyFile.todos, groups: verifyFile.groups }, now);
      await putWithRetry(sftp, remotePath, buildFile(merged));
    }
    return merged;
  } finally {
    conn.end();
  }
}

/** 单次同步周期：成功返回 merged；REMOTE ERROR / 各类错误返回 null（status 已设置） */
export async function runCycle(localArg?: SyncPayload): Promise<{ status: SyncStatus; merged?: SyncPayload }> {
  if (running) return { status };
  const cfg = getConfig();
  if (!isConfigured(cfg)) {
    setStatus('OFF');
    return { status };
  }

  running = true;
  setStatus('SYNCING');
  try {
    // store 与渲染层快照取并集（LWW），防止启动窗口/时序导致快照过期丢编辑
    const base = localState();
    const local = localArg ? mergeSyncStates(base, localArg, Date.now()) : base;
    const merged = await runRemoteCycle(cfg, local);
    if (merged === null) {
      setStatus('REMOTE ERROR', '远端 sync.json 损坏，本次不写回');
      return { status };
    }
    persistMerged(merged);
    offlineStreak = 0;
    setStatus('SYNCED');
    send('sync:merged', merged);
    return { status, merged };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(classifyError(error), message);
    return { status };
  } finally {
    running = false;
    scheduleNext();
  }
}

function scheduleNext(): void {
  if (timer) clearTimeout(timer);
  let delay = BASE_INTERVAL_MS;
  if (status.state === 'OFFLINE') {
    delay = Math.min(OFFLINE_BACKOFF0_MS * 2 ** offlineStreak, BASE_INTERVAL_MS);
    offlineStreak = Math.min(offlineStreak + 1, 6);
  }
  timer = setTimeout(() => {
    void runCycle();
  }, delay);
}

export function testConnection(cfg: SyncConfig): Promise<{ ok: boolean; error?: string }> {
  return (async () => {
    const conn = await connectClient(cfg);
    try {
      const sftp = await call<SFTPWrapper>((cb) => conn.sftp(cb));
      const remotePath = await expandRemotePath(sftp, cfg.remotePath);
      await callVoid((cb) => sftp.readdir(posixDirname(remotePath), cb));
      return { ok: true };
    } finally {
      conn.end();
    }
  })().then(
    (result) => result,
    (error: unknown) => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    })
  );
}

export function getSyncStatus(): SyncStatus {
  return status;
}

export function getSyncConfig(): { config: SyncConfig | null; publicKey: string | null } {
  const key = ensureKeyPair();
  return { config: getConfig(), publicKey: key.publicKey };
}

export function configureSync(cfg: SyncConfig): { ok: boolean; error?: string } {
  if (!cfg || !cfg.host || !cfg.username || !cfg.remotePath) {
    return { ok: false, error: 'host / username / remotePath 不能为空' };
  }
  const port = Number(cfg.port) > 0 ? Number(cfg.port) : 22;
  store.set('syncConfig', {
    enabled: Boolean(cfg.enabled),
    host: String(cfg.host).trim(),
    port,
    username: String(cfg.username).trim(),
    remotePath: String(cfg.remotePath).trim()
  } satisfies SyncConfig);
  offlineStreak = 0;
  setStatus('OFF');
  return { ok: true };
}

export function initSyncService(electronStore: Store, sendFn: SendFn): void {
  store = electronStore;
  send = sendFn;
  setStatus('OFF');
  timer = setTimeout(() => {
    void runCycle();
  }, FIRST_RUN_DELAY_MS);
}

export function stopSyncService(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}
