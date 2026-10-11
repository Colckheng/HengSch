import { storage } from './localStorageAdapter';

function generateUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

let cached: string | null = null;

/** 本设备稳定标识：首启生成 uuid 存 localStorage，之后走内存缓存 */
export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  try {
    const existing = await storage.get<string>('deviceId');
    if (existing && typeof existing === 'string' && existing) {
      cached = existing;
      return cached;
    }
  } catch (error) {
    console.error('[device] Failed to read deviceId:', error);
  }
  const id = generateUuid();
  try {
    await storage.set('deviceId', id);
  } catch (error) {
    console.error('[device] Failed to persist deviceId:', error);
  }
  cached = id;
  return cached;
}
