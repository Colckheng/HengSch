import { useState, useEffect, useCallback, useRef } from 'react';
import type { OpenReminderItem } from '../types/electron';
import { SwissSelect } from './SwissSelect';
import { IconClose } from './Icons';
import { LEAD_OPTIONS } from './selectOptions';

interface ReminderSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ReminderSettings {
  defaultLeadMs: number;
  catchupAllMissed: boolean;
}

const DEFAULTS: ReminderSettings = { defaultLeadMs: 10 * 60_000, catchupAllMissed: false };

/** 全局默认设置不含「自定义…」入口（自定义是单条待办的能力） */
const LEAD_PRESETS = LEAD_OPTIONS.filter((o) => o.value !== 'custom');

export function ReminderSettingsModal({ isOpen, onClose }: ReminderSettingsModalProps): JSX.Element {
  const [settings, setSettings] = useState<ReminderSettings>(DEFAULTS);
  const [items, setItems] = useState<OpenReminderItem[]>([]);
  const [panelError, setPanelError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [snoozeOpen, setSnoozeOpen] = useState('');
  const busy = useRef(false);

  const refresh = useCallback(() => {
    window.electronAPI.reminder
      .list()
      .then((next) => setItems(Array.isArray(next) ? next : []))
      .catch(() => setItems([]));
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [isOpen, refresh]);

  const act = (item: OpenReminderItem, action: 'complete' | 'dismiss' | 'snooze', snoozeAt?: number): void => {
    if (busy.current) return;
    busy.current = true;
    setBusyId(item.todoId);
    setPanelError('');
    setSnoozeOpen('');
    window.electronAPI.reminder
      .act({ todoId: item.todoId, remindAt: item.remindAt, action, snoozeAt })
      .then((result) => { if (!result?.ok) setPanelError(result?.error || '操作未保存，请重试。'); })
      .catch(() => setPanelError('操作未保存，请重试。'))
      .finally(() => {
        busy.current = false;
        setBusyId('');
        refresh();
      });
  };

  const snoozeAtFor = (kind: '10m' | '1h' | 'tomorrow'): number => {
    if (kind === '10m') return Date.now() + 10 * 60_000;
    if (kind === '1h') return Date.now() + 60 * 60_000;
    const next = new Date();
    next.setDate(next.getDate() + 1);
    next.setHours(9, 0, 0, 0);
    return next.getTime();
  };

  const formatTime = (value: number): string =>
    new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(value);

  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    window.electronAPI.store
      .get('reminderSettings')
      .then((raw) => {
        if (!alive || !raw || typeof raw !== 'object') return;
        const r = raw as Partial<ReminderSettings>;
        setSettings({
          defaultLeadMs: typeof r.defaultLeadMs === 'number' && r.defaultLeadMs >= 0 ? r.defaultLeadMs : DEFAULTS.defaultLeadMs,
          catchupAllMissed: r.catchupAllMissed === true
        });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [isOpen]);

  const save = (next: ReminderSettings): void => {
    setSettings(next);
    window.electronAPI.store.set('reminderSettings', next).catch(() => undefined);
  };

  if (!isOpen) return <></>;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>提醒设置</h2>
          <button className="modal-close" onClick={onClose} aria-label="关闭">
            <IconClose />
          </button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label htmlFor="reminder-default-lead">默认提前量</label>
            <SwissSelect
              id="reminder-default-lead"
              options={LEAD_PRESETS}
              value={String(settings.defaultLeadMs)}
              onChange={(v) => save({ ...settings, defaultLeadMs: parseInt(v, 10) })}
            />
          </div>

          <div className="settings-toggle-row">
            <label className="monitor-toggle" htmlFor="reminder-catchup-all">
              <input
                id="reminder-catchup-all"
                type="checkbox"
                checked={settings.catchupAllMissed}
                onChange={(e) => save({ ...settings, catchupAllMissed: e.target.checked })}
              />
              <span className="monitor-toggle-label">补弹全部历史</span>
            </label>
          </div>

          <div className="reminder-queue">
            <div className="reminder-queue-head">
              <span>当前提醒</span>
              <span className="reminder-queue-count">{items.length}</span>
            </div>
            {items.length === 0 && <p className="monitor-note">当前没有待处理的提醒。</p>}
            {items.length > 0 && (
              <ul className="reminder-queue-list">
                {items.map((item) => (
                  <li key={`${item.todoId}:${item.remindAt}`} className="reminder-queue-row">
                    <div className="reminder-queue-text">
                      <span className="reminder-queue-title" title={item.description || item.title}>{item.title}</span>
                      <span className="reminder-queue-meta">
                        {formatTime(item.remindAt)}
                        {item.group ? ` · ${item.group}` : ''}
                      </span>
                    </div>
                    <div className="reminder-queue-actions">
                      <button
                        className="reminder-queue-btn"
                        disabled={busyId === item.todoId}
                        onClick={() => act(item, 'complete')}
                      >
                        完成
                      </button>
                      <button
                        className="reminder-queue-btn"
                        disabled={busyId === item.todoId}
                        onClick={() => setSnoozeOpen(snoozeOpen === item.todoId ? '' : item.todoId)}
                      >
                        稍后
                      </button>
                      <button
                        className="reminder-queue-btn reminder-queue-btn--quiet"
                        disabled={busyId === item.todoId}
                        onClick={() => act(item, 'dismiss')}
                      >
                        关闭
                      </button>
                    </div>
                    {snoozeOpen === item.todoId && (
                      <div className="reminder-queue-snooze">
                        <button className="reminder-queue-btn" disabled={busyId === item.todoId} onClick={() => act(item, 'snooze', snoozeAtFor('10m'))}>
                          10 分钟后
                        </button>
                        <button className="reminder-queue-btn" disabled={busyId === item.todoId} onClick={() => act(item, 'snooze', snoozeAtFor('1h'))}>
                          1 小时后
                        </button>
                        <button className="reminder-queue-btn" disabled={busyId === item.todoId} onClick={() => act(item, 'snooze', snoozeAtFor('tomorrow'))}>
                          明天 9:00
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {panelError && (
              <p role="status" className="reminder-queue-error">
                {panelError}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
