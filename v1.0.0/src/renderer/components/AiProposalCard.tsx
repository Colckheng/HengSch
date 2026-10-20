import { useEffect, useId, useState } from 'react';
import type { FormEvent } from 'react';
import type { AiProposal, AiCreateDraft, AiUpdateDraft, MonitorConfig, Todo, Group, CycleType } from '@hengsch/shared-types';
import { GroupSelect } from './GroupSelect';
import { ReminderSection, type ReminderValue } from './ReminderSection';
import { SwissSelect } from './SwissSelect';

export type AiCardStatus = 'pending' | 'committed' | 'rejected' | 'stale' | 'error';

interface MonitorDraft {
  auto: boolean;
  askOnExit: boolean;
  exeName: string;
  threshold: string;
}

interface AiProposalCardProps {
  proposal: AiProposal;
  status: AiCardStatus;
  errorText?: string;
  /** 提交进行中：确认按钮禁用并显示「确认中…」，防双击重复落盘 */
  busy?: boolean;
  todos: Todo[];
  groups: Group[];
  onConfirm: (id: string, patch?: unknown) => void;
  onReject: (id: string) => void;
}

const CYCLE_LABEL: Record<CycleType, string> = { daily: '每天', weekly: '每周', monthly: '每月', custom: '自定义' };

function groupNameOf(groups: Group[], id?: string): string {
  return groups.find((group) => group.id === (id ?? 'default'))?.name ?? '未分类';
}

function timeLabel(ts?: number): string {
  if (!ts) return '无提醒';
  return new Date(ts).toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function monitorFromConfig(config?: MonitorConfig): MonitorDraft {
  return {
    auto: config ? config.auto !== false : false,
    askOnExit: config?.askOnExit === true,
    exeName: config?.exeName ?? '',
    threshold: String(config?.thresholdMinutes ?? 10)
  };
}

function monitorToConfig(draft: MonitorDraft): MonitorConfig | undefined {
  if (!draft.auto && !draft.askOnExit) return undefined;
  if (!draft.exeName.trim()) return undefined;
  const minutes = parseInt(draft.threshold, 10);
  if (draft.auto && (!Number.isFinite(minutes) || minutes < 1)) return undefined;
  return {
    exeName: draft.exeName.trim(),
    thresholdMinutes: Number.isFinite(minutes) && minutes >= 1 ? minutes : 10,
    auto: draft.auto,
    askOnExit: draft.askOnExit
  };
}

export function AiProposalCard({ proposal, status, errorText, busy = false, todos, groups, onConfirm, onReject }: AiProposalCardProps): JSX.Element {
  const uid = useId();
  const isCreate = proposal.kind === 'create';

  const [title, setTitle] = useState(() =>
    proposal.kind === 'create' ? proposal.draft.title : proposal.kind === 'update' ? proposal.draft.title ?? proposal.before.title : ''
  );
  const [description, setDescription] = useState(() => {
    if (proposal.kind === 'create') return proposal.draft.description ?? '';
    if (proposal.kind === 'update') {
      if (proposal.draft.description === 'clear') return '';
      return proposal.draft.description ?? proposal.before.description ?? '';
    }
    return '';
  });
  const [groupId, setGroupId] = useState(() =>
    proposal.kind === 'create'
      ? proposal.draft.groupId ?? 'default'
      : proposal.kind === 'update'
        ? proposal.draft.groupId ?? proposal.before.groupId ?? 'default'
        : 'default'
  );
  const [reminder, setReminder] = useState<ReminderValue | undefined>(() => {
    if (proposal.kind === 'create') {
      return proposal.draft.remindAt ? { remindAt: proposal.draft.remindAt, remindLeadMs: proposal.draft.remindLeadMs ?? 0 } : undefined;
    }
    if (proposal.kind === 'update') {
      const draftAt = proposal.draft.remindAt;
      if (draftAt === 'clear') return undefined;
      if (typeof draftAt === 'number') {
        const lead = typeof proposal.draft.remindLeadMs === 'number' ? proposal.draft.remindLeadMs : proposal.before.remindLeadMs ?? 0;
        return { remindAt: draftAt, remindLeadMs: lead };
      }
      return proposal.before.remindAt ? { remindAt: proposal.before.remindAt, remindLeadMs: proposal.before.remindLeadMs ?? 0 } : undefined;
    }
    return undefined;
  });
  const monitorVisible = proposal.kind === 'create' ? Boolean(proposal.draft.monitor) : proposal.kind === 'update' ? proposal.draft.monitor !== undefined : false;
  const [monitor, setMonitor] = useState<MonitorDraft | null>(() => {
    if (proposal.kind === 'create') return proposal.draft.monitor ? monitorFromConfig(proposal.draft.monitor) : null;
    if (proposal.kind === 'update') {
      if (proposal.draft.monitor === null) return monitorFromConfig(undefined);
      if (proposal.draft.monitor) return monitorFromConfig(proposal.draft.monitor);
      return null;
    }
    return null;
  });
  const [processes, setProcesses] = useState<string[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!monitorVisible) return;
    let alive = true;
    window.electronAPI.monitor
      .listProcesses()
      .then((list) => {
        if (alive) setProcesses(list);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [monitorVisible]);

  const currentTarget = proposal.kind === 'create' ? null : todos.find((todo) => todo.id === proposal.draft.todoId);
  const staleByData = proposal.kind !== 'create' && (!currentTarget || currentTarget.deleted === true || currentTarget.updatedAt !== proposal.before.updatedAt);
  const isStale = status === 'stale' || staleByData;
  const settled = status === 'committed' || status === 'rejected';
  const shownError = localError ?? (status === 'error' ? errorText : undefined);
  const committedLabel = proposal.kind === 'create' ? '✓ 已创建' : proposal.kind === 'update' ? '✓ 已更新' : '✓ 已删除';
  const statusLabel =
    status === 'committed'
      ? committedLabel
      : status === 'rejected'
        ? '✕ 已取消'
        : status === 'error'
          ? '确认失败'
          : isStale
            ? '数据已变化'
            : '待确认';
  const statusClass = status === 'committed' ? 'ok' : status === 'rejected' ? 'muted' : status === 'error' || isStale ? 'bad' : '';
  /** 终态/过期/提交中：所有可点控件一并锁死 */
  const locked = settled || isStale || busy;
  const isRecurring =
    proposal.kind === 'create'
      ? proposal.draft.type === 'recurring'
      : proposal.kind === 'update'
        ? proposal.before.type === 'recurring'
        : false;

  const handleReject = () => {
    if (settled) return;
    onReject(proposal.id);
  };

  const buildPatch = (): { patch?: unknown; errors: string[] } => {
    const errors: string[] = [];
    const trimmedTitle = title.trim();
    if (!trimmedTitle) errors.push('标题不能为空（不能只有空格）');
    let monitorConfig: MonitorConfig | undefined;
    if (monitor !== null) {
      monitorConfig = monitorToConfig(monitor);
      const anyOn = monitor.auto || monitor.askOnExit;
      if (anyOn && !monitor.exeName.trim()) errors.push('监测需要选择进程或关闭监测');
      else if (monitor.auto && !monitorConfig) errors.push('阈值至少 1 分钟');
    }
    if (errors.length) return { errors };
    if (isCreate) {
      const patch: Partial<AiCreateDraft> = {
        title: trimmedTitle,
        description: description.trim() || undefined,
        groupId,
        remindAt: reminder?.remindAt,
        remindLeadMs: reminder?.remindLeadMs,
        monitor: monitorConfig
      };
      return { patch, errors };
    }
    const patch: AiUpdateDraft = {
      todoId: proposal.kind === 'update' ? proposal.draft.todoId : '',
      title: trimmedTitle,
      description: description.trim() || 'clear',
      groupId,
      remindAt: reminder ? reminder.remindAt : 'clear',
      remindLeadMs: reminder ? reminder.remindLeadMs : 'clear'
    };
    if (monitor !== null) patch.monitor = monitorConfig ?? null;
    return { patch, errors };
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (settled || isStale) return;
    setLocalError(null);
    const { patch, errors } = buildPatch();
    if (errors.length) {
      setLocalError(errors.join('；'));
      return;
    }
    onConfirm(proposal.id, patch);
  };

  const monitorEnabled = monitor !== null && (monitor.auto || monitor.askOnExit);
  const exeOptions = (() => {
    if (monitor === null) return [];
    const lower = new Set(processes.map((name) => name.toLowerCase()));
    return monitor.exeName && !lower.has(monitor.exeName.toLowerCase()) ? [monitor.exeName, ...processes] : processes;
  })();

  if (proposal.kind === 'delete') {
    return (
      <section className={`ai-card ai-card-delete ${statusClass}`} aria-label="删除确认卡">
        <div className="ai-card-line">
          <span className="ai-card-kind danger">删除</span>
          <span className={`ai-card-status ${statusClass}`}>{statusLabel}</span>
        </div>
        <div className="ai-delete-target">
          <div className="ai-delete-title">{proposal.before.title}</div>
          <div className="ai-delete-meta">
            {groupNameOf(groups, proposal.before.groupId)} · {timeLabel(proposal.before.remindAt)}
          </div>
        </div>
        {shownError && status === 'error' && (
          <div className="ai-card-error" role="alert">
            {shownError}
          </div>
        )}
        <div className="modal-footer ai-card-footer">
          <button type="button" className="button button-secondary" onClick={handleReject} disabled={locked}>
            取消
          </button>
          {armed ? (
            <button type="button" className="button ai-card-danger" onClick={() => onConfirm(proposal.id)} disabled={locked}>
              {busy ? '确认中…' : '确认删除'}
            </button>
          ) : (
            <button type="button" className="button button-primary" onClick={() => setArmed(true)} disabled={locked}>
              删除
            </button>
          )}
        </div>
      </section>
    );
  }

  const chip = (() => {
    if (proposal.kind === 'create') {
      if (proposal.draft.type !== 'recurring') return '一次性';
      const cycle = proposal.draft.cycleType ?? 'daily';
      return `循环 · ${cycle === 'custom' ? `每 ${proposal.draft.customCycleDays ?? 1} 天` : CYCLE_LABEL[cycle]}`;
    }
    if (proposal.draft.toggleStatus) return proposal.before.status === 'pending' ? '标记完成' : '恢复待办';
    return '修改字段';
  })();

  const beforeChip = proposal.kind === 'update' ? proposal.before : null;

  return (
    <form className={`ai-card ${statusClass}`} onSubmit={handleSubmit} aria-label={isCreate ? '新建确认卡' : '修改确认卡'}>
      <div className="ai-card-line">
        <span className="ai-card-kind">{isCreate ? '新建' : '修改'}</span>
        <span className="ai-card-chip">{chip}</span>
        <span className={`ai-card-status ${statusClass}`}>{statusLabel}</span>
      </div>
      {beforeChip && (
        <div className="ai-diff">
          <div className="ai-diff-col">
            <span className="ai-diff-head">BEFORE</span>
            <div className="ai-diff-title">{beforeChip.title}</div>
            <div className="ai-diff-meta">
              {groupNameOf(groups, beforeChip.groupId)} · {timeLabel(beforeChip.remindAt)}
            </div>
          </div>
          <div className="ai-diff-col">
            <span className="ai-diff-head">AFTER</span>
            <div className="ai-diff-title">{title || '—'}</div>
            <div className="ai-diff-meta">
              {groupNameOf(groups, groupId)} · {timeLabel(reminder?.remindAt)}
            </div>
          </div>
        </div>
      )}
      <div className="form-group">
        <label htmlFor={`${uid}-title`}>标题</label>
        <input
          id={`${uid}-title`}
          type="text"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setLocalError(null);
          }}
          placeholder="待办标题"
          autoComplete="off"
          disabled={locked}
          aria-invalid={Boolean(shownError && !title.trim())}
        />
      </div>
      <div className="form-group">
        <label htmlFor={`${uid}-desc`}>描述</label>
        <textarea
          id={`${uid}-desc`}
          value={description}
          onChange={(event) => {
            setDescription(event.target.value);
            setLocalError(null);
          }}
          placeholder="留空即不写描述"
          rows={2}
          autoComplete="off"
          disabled={locked}
        />
      </div>
      <div className="form-group">
        <label htmlFor={`${uid}-group`}>分组</label>
        <GroupSelect id={`${uid}-group`} groups={groups} value={groupId} onChange={setGroupId} disabled={locked} />
      </div>
      <ReminderSection
        value={reminder}
        recurring={isRecurring}
        disabled={locked}
        onChange={(value) => {
          setReminder(value);
          setLocalError(null);
        }}
      />
      {monitor !== null && (
        <div className="monitor-section">
          <label className="monitor-toggle" htmlFor={`${uid}-auto`}>
            <input
              id={`${uid}-auto`}
              type="checkbox"
              checked={monitor.auto}
              onChange={(event) => {
                setLocalError(null);
                setMonitor({ ...monitor, auto: event.target.checked });
              }}
              disabled={locked}
            />
            <span className="monitor-toggle-label">自动监测</span>
          </label>
          <label className="monitor-toggle" htmlFor={`${uid}-ask`}>
            <input
              id={`${uid}-ask`}
              type="checkbox"
              checked={monitor.askOnExit}
              onChange={(event) => {
                setLocalError(null);
                setMonitor({ ...monitor, askOnExit: event.target.checked });
              }}
              disabled={locked}
            />
            <span className="monitor-toggle-label">进程结束询问</span>
          </label>
          {monitorEnabled && (
            <>
              <div className="form-group">
                <label htmlFor={`${uid}-exe`}>运行进程</label>
                <SwissSelect
                  id={`${uid}-exe`}
                  options={[{ value: '', label: '选择正在运行的进程…' }, ...exeOptions.map((name) => ({ value: name, label: name }))]}
                  value={monitor.exeName}
                  onChange={(value) => {
                    setLocalError(null);
                    setMonitor({ ...monitor, exeName: value });
                  }}
                  placeholder="选择正在运行的进程…"
                  disabled={locked}
                />
                <input
                  type="text"
                  className="monitor-exe-manual"
                  value={monitor.exeName}
                  onChange={(event) => {
                    setLocalError(null);
                    setMonitor({ ...monitor, exeName: event.target.value });
                  }}
                  placeholder="或手动输入 exe 名，例：game.exe"
                  autoComplete="off"
                  aria-label="手动输入进程名"
                  disabled={locked}
                />
              </div>
              {monitor.auto && (
                <div className="form-group">
                  <label htmlFor={`${uid}-threshold`}>阈值（分钟）</label>
                  <input
                    id={`${uid}-threshold`}
                    type="number"
                    min="1"
                    value={monitor.threshold}
                    onChange={(event) => {
                      setLocalError(null);
                      setMonitor({ ...monitor, threshold: event.target.value });
                    }}
                    placeholder="10"
                    autoComplete="off"
                    disabled={locked}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
      {shownError && (
        <div className="ai-card-error" role="alert">
          {shownError}
        </div>
      )}
      <div className="modal-footer ai-card-footer">
        <button type="button" className="button button-secondary" onClick={handleReject} disabled={locked}>
          取消
        </button>
        <button type="submit" className="button button-primary" disabled={locked}>
          {busy ? '确认中…' : isCreate ? '创建' : '确认'}
        </button>
      </div>
    </form>
  );
}
