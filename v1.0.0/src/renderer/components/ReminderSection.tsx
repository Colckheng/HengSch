import { useState, useEffect, useRef, useId } from 'react';
import { SwissSelect } from './SwissSelect';
import { SwissTimePicker } from './SwissTimePicker';
import { LEAD_OPTIONS } from './selectOptions';
import { roundMinutes, formatHM } from '../../shared-ui/time-picker-core';

export interface ReminderValue {
  /** 实际触发时间（已扣提前量） */
  remindAt: number;
  /** 本条提前量；循环推进重算用 */
  remindLeadMs: number;
}

interface ReminderSectionProps {
  value?: ReminderValue;
  onChange: (value: ReminderValue | undefined) => void;
  /** 循环待办：只选时刻（确认时落到下一次发生的该时刻），不再选日期 */
  recurring?: boolean;
  /** 终态卡等场景：整段禁用 */
  disabled?: boolean;
  /** 时间面板开合上提（弹窗 Esc/遮罩一级级退用） */
  onOpenChange?: (open: boolean) => void;
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

export function ReminderSection({ value, onChange, recurring = false, disabled = false, onOpenChange }: ReminderSectionProps): JSX.Element {
  const uid = useId();
  const enabled = typeof value?.remindAt === 'number';
  const [defaultLeadMs, setDefaultLeadMs] = useState(FALLBACK_LEAD_MS);
  // 自定义提前量草稿：跟随 value / defaultLeadMs 同步，编辑态也能回显
  const [customMinutes, setCustomMinutes] = useState(() => String(roundMinutes(FALLBACK_LEAD_MS)));
  const [customError, setCustomError] = useState('');
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
    setCustomError('');
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

  /** 失焦/Enter 才提交（键入过程不落半截值）；非法输入内联提示不提交 */
  const commitCustomMinutes = (): void => {
    if (!value) return;
    const minutes = parseFloat(customMinutes);
    if (!Number.isFinite(minutes) || minutes < 0) {
      setCustomError('请输入不小于 0 的分钟数');
      return;
    }
    setCustomError('');
    const leadMs = Math.round(minutes * 60_000);
    if (leadMs === value.remindLeadMs) return;
    const targetTs = value.remindAt + value.remindLeadMs;
    emit({ remindAt: targetTs - leadMs, remindLeadMs: leadMs });
  };

  const handleTimeChange = (targetTs: number): void => {
    if (!value) return;
    emit({ remindAt: targetTs - value.remindLeadMs, remindLeadMs: value.remindLeadMs });
  };

  const leadKey = value ? leadKeyOf(value.remindLeadMs) : leadKeyOf(defaultLeadMs);
  const targetTs = value ? value.remindAt + value.remindLeadMs : Date.now() + 60 * 60_000;
  // 循环：跨天提示（time 模式下 targetTs 已是"下一次发生"）
  const nextDay = recurring && enabled && new Date(targetTs).toDateString() !== new Date().toDateString();

  return (
    <div className="monitor-section">
      <div className="settings-toggle-row">
        <label className="monitor-toggle" htmlFor={`${uid}-enabled`}>
          <input
            id={`${uid}-enabled`}
            type="checkbox"
            checked={enabled}
            disabled={disabled}
            onChange={(e) => handleToggle(e.target.checked)}
          />
          <span className="monitor-toggle-label">到点提醒</span>
        </label>
      </div>

      {enabled && (
        <>
          <div className="form-group">
            <label id={`${uid}-time-label`}>提醒时间</label>
            <SwissTimePicker
              id={`${uid}-time`}
              value={targetTs}
              onChange={handleTimeChange}
              mode={recurring ? 'time' : 'datetime'}
              minTs={recurring ? undefined : Date.now()}
              disabled={disabled}
              onOpenChange={onOpenChange}
            />
            {recurring && (
              <p className="reminder-next">{nextDay ? '明天' : '今天'} {formatHM(targetTs)} 再次提醒</p>
            )}
          </div>

          <div className="form-group">
            <label htmlFor={`${uid}-lead`}>提前量</label>
            <SwissSelect
              id={`${uid}-lead`}
              options={LEAD_OPTIONS}
              value={leadKey}
              onChange={handleLeadChange}
              disabled={disabled}
            />
            {leadKey === 'custom' && (
              <>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={customMinutes}
                  onChange={(e) => {
                    setCustomMinutes(e.target.value);
                    setCustomError('');
                  }}
                  onBlur={commitCustomMinutes}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitCustomMinutes();
                    }
                  }}
                  placeholder="提前多少分钟…"
                  autoComplete="off"
                  aria-label="自定义提前量（分钟）"
                  disabled={disabled}
                />
                {customError && <p className="reminder-next reminder-next-error">{customError}</p>}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
