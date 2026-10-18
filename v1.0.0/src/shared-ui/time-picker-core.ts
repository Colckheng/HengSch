export interface Hm {
  h: number;
  m: number;
}

export function startOfLocalDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function dayStartOffset(offset: number, now: number = Date.now()): number {
  const d = new Date(startOfLocalDay(now));
  d.setDate(d.getDate() + offset);
  return d.getTime();
}

export function withTime(dayStart: number, h: number, m: number): number {
  const d = new Date(dayStart);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

export function formatHM(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatMD(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function formatFull(ts: number): string {
  return `${formatMD(ts)} ${formatHM(ts)}`;
}

export function parseHm(hText: string, mText: string): Hm | null {
  if (!/^\d{1,2}$/.test(hText.trim()) || !/^\d{1,2}$/.test(mText.trim())) return null;
  const h = Number(hText);
  const m = Number(mText);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h, m };
}

/** "M-D" / "M/D" → 当年该日零点；若已过去则推到下一年；非法返回 null */
export function parseMD(text: string, now: number = Date.now()): number | null {
  const match = text.trim().match(/^(\d{1,2})[-/](\d{1,2})$/);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const year = new Date(now).getFullYear();
  const candidate = new Date(year, month - 1, day);
  if (candidate.getMonth() !== month - 1 || candidate.getDate() !== day) return null;
  const start = candidate.getTime();
  return start < startOfLocalDay(now) ? start + 365 * 86_400_000 : start;
}

/** ts 属于今天/明天/后天时返回 0/1/2，否则 -1 */
export function dayChipOf(ts: number, now: number = Date.now()): 0 | 1 | 2 | -1 {
  const target = startOfLocalDay(ts);
  for (let i = 0; i <= 2; i += 1) {
    if (target === dayStartOffset(i, now)) return i as 0 | 1 | 2;
  }
  return -1;
}

export function roundMinutes(ms: number): number {
  return Math.round((ms / 60_000) * 10) / 10;
}
