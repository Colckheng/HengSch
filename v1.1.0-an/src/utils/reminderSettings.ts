import { storage } from './asyncStorageAdapter';

const KEY = 'reminders:v1';

export interface ReminderSettings {
  enabled: boolean;
}

/** 提醒总开关：仅本机生效，不参与云同步 */
export async function getReminderSettings(): Promise<ReminderSettings> {
  const saved = await storage.get<ReminderSettings>(KEY);
  return { enabled: saved?.enabled === true };
}

export async function setReminderEnabled(enabled: boolean): Promise<void> {
  await storage.set<ReminderSettings>(KEY, { enabled });
}
