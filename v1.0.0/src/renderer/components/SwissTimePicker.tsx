import { useState, useRef, useEffect } from 'react';
import {
  dayChipOf,
  dayStartOffset,
  formatFull,
  formatHM,
  formatMD,
  startOfLocalDay
} from '../../shared-ui/time-picker-core';
import '../../shared-ui/time-picker.css';

interface SwissTimePickerProps {
  value: number;
  onChange: (ts: number) => void;
  id?: string;
  /** 校验：早于该时间视为非法（如"请选择将来的时间"） */
  minTs?: number;
  /**
   * datetime=选日期+时刻（一次性待办，默认）；time=只选时刻（循环待办——
   * 确认时自动落到"下一次发生的该时刻"：今天已过 → 明天）
   */
  mode?: 'datetime' | 'time';
}

const MIN_QUICK = [0, 15, 30, 45];

/** time 模式：H:M 的下一次发生（今天还早就今天，否则明天） */
function nextOccurrenceOf(h: number, m: number, now: number = Date.now()): number {
  const dayStart = startOfLocalDay(now);
  let candidate = dayStart + h * 3_600_000 + m * 60_000;
  if (candidate <= now) candidate += 24 * 3600_000;
  return candidate;
}

/** Swiss 时间弹层（纯点选）：日期芯片翻天 + 24h 网格 + 分钟步进/快捷 */
export function SwissTimePicker({ value, onChange, id, minTs, mode = 'datetime' }: SwissTimePickerProps): JSX.Element {
  const timeOnly = mode === 'time';
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const [dayStart, setDayStart] = useState(() => startOfLocalDay(value));
  const [h, setH] = useState(() => new Date(value).getHours());
  const [m, setM] = useState(() => new Date(value).getMinutes());
  const [error, setError] = useState('');

  // 外部 value 变化 → 同步草稿
  useEffect(() => {
    setDayStart(startOfLocalDay(value));
    setH(new Date(value).getHours());
    setM(new Date(value).getMinutes());
    setError('');
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent): void => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open]);

  const draftTs = dayStart + h * 3_600_000 + m * 60_000;

  const stepDay = (delta: number): void => {
    const d = new Date(dayStart);
    d.setDate(d.getDate() + delta);
    setDayStart(d.getTime());
  };

  const nudgeMin = (delta: number): void => {
    // 以 5 分钟为粒度步进，跨天时同步移动日期
    let total = h * 60 + m + delta;
    let extraDays = 0;
    while (total < 0) {
      total += 1440;
      extraDays -= 1;
    }
    while (total >= 1440) {
      total -= 1440;
      extraDays += 1;
    }
    if (extraDays !== 0) {
      const d = new Date(dayStart);
      d.setDate(d.getDate() + extraDays);
      setDayStart(d.getTime());
    }
    setH(Math.floor(total / 60));
    setM(total % 60);
  };

  const handleConfirm = (): void => {
    if (timeOnly) {
      onChange(nextOccurrenceOf(h, m));
      setOpen(false);
      setError('');
      return;
    }
    const ts = draftTs;
    if (typeof minTs === 'number' && ts < minTs) {
      setError('请选择将来的时间');
      return;
    }
    onChange(ts);
    setOpen(false);
    setError('');
  };

  const chip = dayChipOf(draftTs);

  return (
    <div className="tp-wrap" ref={wrapRef}>
      <button
        id={id}
        type="button"
        className="tp-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className="tp-trigger-value">{timeOnly ? formatHM(value) : formatFull(value)}</span>
        <svg className="tp-trigger-caret" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
          <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </button>

      {open && (
        <div className="tp-panel" role="dialog" aria-label="选择提醒时间">
          <div className="tp-eyebrow">{timeOnly ? 'TIME' : 'SCHEDULE'}</div>

          {!timeOnly && (
            <div className="tp-day-row">
              <button type="button" className="tp-arrow" onClick={() => stepDay(-1)} aria-label="前一天">
                ◀
              </button>
              <div className="tp-chips">
                {[0, 1, 2].map((i) => (
                  <button
                    key={i}
                    type="button"
                    className={`tp-chip${chip === i ? ' active' : ''}`}
                    onClick={() => setDayStart(dayStartOffset(i))}
                  >
                    {['今天', '明天', '后天'][i]}
                  </button>
                ))}
              </div>
              <button type="button" className="tp-arrow" onClick={() => stepDay(1)} aria-label="后一天">
                ▶
              </button>
            </div>
          )}
          {!timeOnly && <div className="tp-day-label">{formatMD(draftTs)}</div>}

          <div className="tp-hour-grid">
            {Array.from({ length: 24 }, (_, hour) => (
              <button
                key={hour}
                type="button"
                className={`tp-hour${h === hour ? ' active' : ''}`}
                onClick={() => setH(hour)}
              >
                {String(hour).padStart(2, '0')}
              </button>
            ))}
          </div>

          <div className="tp-min-row">
            <button type="button" className="tp-min-step" onClick={() => nudgeMin(-5)} aria-label="减 5 分钟">
              −5
            </button>
            <div className="tp-min-chips">
              {MIN_QUICK.map((minute) => (
                <button
                  key={minute}
                  type="button"
                  className={`tp-min-chip${m === minute ? ' active' : ''}`}
                  onClick={() => setM(minute)}
                >
                  {String(minute).padStart(2, '0')}
                </button>
              ))}
            </div>
            <button type="button" className="tp-min-step" onClick={() => nudgeMin(5)} aria-label="加 5 分钟">
              +5
            </button>
          </div>

          <div className="tp-current">
            <span className="tp-current-label">已选</span>
            <span className="tp-current-value">{formatHM(draftTs)}</span>
          </div>

          {error && <p className="tp-invalid">{error}</p>}
          <div className="tp-foot">
            <button type="button" className="button button-primary" onClick={handleConfirm}>
              确定
            </button>
            <button type="button" className="button" onClick={() => setOpen(false)}>
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
