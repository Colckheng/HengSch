export type ReminderPreset = 'keep' | 'none' | '5m' | '30m' | '1h' | 'tomorrow9';

export interface ReminderPresetOption {
  key: Exclude<ReminderPreset, 'keep'>;
  label: string;
}

export const REMINDER_PRESETS: ReminderPresetOption[] = [
  { key: '5m', label: '5 分钟后' },
  { key: '30m', label: '30 分钟后' },
  { key: '1h', label: '1 小时后' },
  { key: 'tomorrow9', label: '明天 9:00' }
];

/** 预设 → 绝对提醒时间；none/keep 返回 undefined */
export function resolveReminderPreset(preset: ReminderPreset, now: number = Date.now()): number | undefined {
  switch (preset) {
    case '5m':
      return now + 5 * 60 * 1000;
    case '30m':
      return now + 30 * 60 * 1000;
    case '1h':
      return now + 60 * 60 * 1000;
    case 'tomorrow9': {
      const date = new Date(now);
      date.setDate(date.getDate() + 1);
      date.setHours(9, 0, 0, 0);
      return date.getTime();
    }
    default:
      return undefined;
  }
}

/** 已有提醒时间 → 最接近的预设，便于编辑时回显 */
export function matchReminderPreset(at: number | undefined, now: number = Date.now()): ReminderPreset {
  if (typeof at !== 'number') return 'none';
  for (const option of REMINDER_PRESETS) {
    const candidate = resolveReminderPreset(option.key, now);
    if (typeof candidate === 'number' && Math.abs(candidate - at) < 60 * 1000) return option.key;
  }
  return 'keep';
}

export function formatReminderAt(at: number): string {
  const date = new Date(at);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
