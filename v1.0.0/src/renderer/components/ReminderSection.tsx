import { useState, useEffect, useRef } from 'react';
import { SwissSelect } from './SwissSelect';
import { SwissTimePicker } from './SwissTimePicker';
import { LEAD_OPTIONS } from './selectOptions';
import { roundMinutes } from '../../shared-ui/time-picker-core';

export interface ReminderValue {
  /** 实际触发时间（已扣提前量） */
  remindAt: number;
  /** 本条提前量；循环推进重算用 */
  remindLeadMs: number;
}

interface ReminderSectionProps {
  value?: ReminderValue;
  onChange: (value: ReminderValue | undefined) => void;
}

const DEFAULT_LEAD_KEY = 'reminderSettings';
const FALLBACK_LEAD_MS = 10 * 60_000;

async function loadDefaultLeadMs(): Promise<number> {
  try {
    const raw = (await window.electronAPI.store.get(DEFAULT_LEAD_KEY)) as { defaultLeadMs?: unknown } | undefined;
    if (raw && typeof raw.defaultLeadMs === 'number' && raw.defaultLeadMs >= 0) return raw.defaultLeadMs;
  } catch {
    /* 读不到走默认 */
  }
  return FALLBACK_LEAD_MS;
}

function leadKeyOf(leadMs: number): string {
  return LEAD_OPTIONS.some((o) => o.value === String(leadMs)) ? String(leadMs) : 'custom';
}

export function ReminderSection({ value, onChange }: ReminderSectionProps): JSX.Element {
  const enabled = typeof value?.remindAt === 'number';
  const [defaultLeadMs, setDefaultLeadMs] = useState(FALLBACK_LEAD_MS);
  // 自定义提前量草稿：跟随 value / defaultLeadMs 同步，编辑态也能回显
  const [customMinutes, setCustomMinutes] = useState(() => String(roundMinutes(FALLBACK_LEAD_MS)));
  /** 最近一次由本组件 emit 的值——用于区分"外部加载"与"自身回声" */
  const lastEmitted = useRef<ReminderValue | undefined>(undefined);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    let alive = true;
    void loadDefaultLeadMs().then((ms) => {
      if (!alive) return;
      setDefaultLeadMs(ms);
      if (!lastEmitted.current && !valueRef.current) setCustomMinutes(String(roundMinutes(ms)));
    });
    return () => {
      alive = false;
    };
  }, []);

  // 外部 value 变化（编辑弹窗回填 / 父级重置）→ 同步内部草稿
  useEffect(() => {
    if (value === lastEmitted.current) return;
    lastEmitted.current = value;
    if (value) {
      setCustomMinutes(String(roundMinutes(value.remindLeadMs)));
    } else {
      setCustomMinutes(String(roundMinutes(defaultLeadMs)));
    }
    // defaultLeadMs 变化不在这里同步草稿：挂载时已由 loader 处理
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const emit = (next: ReminderValue | undefined): void => {
    lastEmitted.current = next;
    onChange(next);
  };

  const handleToggle = (on: boolean): void => {
    if (!on) {
      emit(undefined);
      return;
    }
    const lead = defaultLeadMs;
    const target = Date.now() + 60 * 60_000;
    setCustomMinutes(String(roundMinutes(lead)));
    emit({ remindAt: target - lead, remindLeadMs: lead });
  };

  const handleLeadChange = (key: string): void => {
    if (!value) return;
    const targetTs = value.remindAt + value.remindLeadMs;
    if (key === 'custom') {
      setCustomMinutes(String(roundMinutes(value.remindLeadMs)));
      emit({ remindAt: targetTs - value.remindLeadMs, remindLeadMs: value.remindLeadMs });
      return;
    }
    const leadMs = parseInt(key, 10);
    emit({ remindAt: targetTs - leadMs, remindLeadMs: leadMs });
  };

  const handleCustomMinutes = (text: string): void => {
    setCustomMinutes(text);
    if (!value) return;
    const minutes = parseFloat(text);
    if (!Number.isFinite(minutes) || minutes < 0) return;
    const leadMs = Math.round(minutes * 60_000);
    const targetTs = value.remindAt + value.remindLeadMs;
    emit({ remindAt: targetTs - leadMs, remindLeadMs: leadMs });
  };

  const handleTimeChange = (targetTs: number): void => {
    if (!value) return;
    emit({ remindAt: targetTs - value.remindLeadMs, remindLeadMs: value.remindLeadMs });
  };

  const leadKey = value ? leadKeyOf(value.remindLeadMs) : leadKeyOf(defaultLeadMs);
  const targetTs = value ? value.remindAt + value.remindLeadMs : Date.now() + 60 * 60_000;

  return (
    <div className="monitor-section">
      <div className="settings-toggle-row">
        <label className="monitor-toggle" htmlFor="reminder-enabled">
          <input
            id="reminder-enabled"
            type="checkbox"
            checked={enabled}
            onChange={(e) => handleToggle(e.target.checked)}
          />
          <span className="monitor-toggle-label">到点提醒</span>
        </label>
      </div>

      {enabled && (
        <>
          <div className="form-group">
            <label id="reminder-time-label">提醒时间</label>
            <SwissTimePicker
              id="reminder-time"
              value={targetTs}
              onChange={handleTimeChange}
              minTs={Date.now()}
            />
          </div>

          <div className="form-group">
            <label htmlFor="reminder-lead">提前量</label>
            <SwissSelect
              id="reminder-lead"
              options={LEAD_OPTIONS}
              value={leadKey}
              onChange={handleLeadChange}
            />
            {leadKey === 'custom' && (
              <input
                type="number"
                min="0"
                step="0.5"
                value={customMinutes}
                onChange={(e) => handleCustomMinutes(e.target.value)}
                placeholder="提前多少分钟…"
                autoComplete="off"
                aria-label="自定义提前量（分钟）"
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
