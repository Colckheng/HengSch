import { storage } from './asyncStorageAdapter';

/** 手机端 HTTP 同步桥配置（区别于桌面 SFTP SyncConfig） */
export interface PhoneSyncConfig {
  enabled: boolean;
  /** 形如 http://<服务器IP>:8642（无路径，桥固定 /sync /health） */
  serverUrl: string;
  token: string;
}

const KEY = 'syncConfig';
const TIMEOUT_MS = 8000;

export async function loadSyncConfig(): Promise<PhoneSyncConfig | null> {
  try {
    const cfg = await storage.get<PhoneSyncConfig>(KEY);
    if (cfg && typeof cfg.serverUrl === 'string' && typeof cfg.token === 'string') {
      return {
        enabled: Boolean(cfg.enabled),
        serverUrl: cfg.serverUrl.trim().replace(/\/+$/, ''),
        token: cfg.token.trim()
      };
    }
  } catch (error) {
    console.error('[syncConfig] load failed:', error);
  }
  return null;
}

export async function saveSyncConfig(cfg: PhoneSyncConfig): Promise<void> {
  await storage.set(KEY, {
    enabled: Boolean(cfg.enabled),
    serverUrl: cfg.serverUrl.trim().replace(/\/+$/, ''),
    token: cfg.token.trim()
  });
}

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/** 连通性测试：/health 通 + /sync 鉴权通过 */
export async function testConnection(
  cfg: Pick<PhoneSyncConfig, 'serverUrl' | 'token'>
): Promise<{ ok: boolean; error?: string }> {
  const base = normalizeUrl(cfg.serverUrl);
  if (!/^https?:\/\/.+/.test(base)) {
    return { ok: false, error: '地址需以 http:// 或 https:// 开头' };
  }
  try {
    const health = await fetchWithTimeout(`${base}/health`);
    if (!health.ok) return { ok: false, error: `/health 返回 ${health.status}` };
    const sync = await fetchWithTimeout(`${base}/sync`, {
      headers: { Authorization: `Bearer ${cfg.token}` }
    });
    if (sync.status === 401) return { ok: false, error: 'Token 不正确（401）' };
    if (!sync.ok) return { ok: false, error: `/sync 返回 ${sync.status}` };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}
