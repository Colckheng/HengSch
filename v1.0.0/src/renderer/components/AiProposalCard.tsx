import { useEffect, useId, useState } from 'react';
import type { FormEvent } from 'react';
import type { AiProposal, AiCreateDraft, AiUpdateDraft, MonitorConfig, Todo, Group, CycleType } from '@hengsch/shared-types';
import type { DeleteProposal, DeleteGroupResult } from '../ai-flow';
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
  /** B-2 删除合并卡：分组全量（含本卡），≥2 条时渲染清单勾选视图 */
  group?: DeleteProposal[];
  /** B-2 落定快照：折叠摘要与逐条回看均区分已删除/保留 */
  groupResults?: DeleteGroupResult[];
  todos: Todo[];
  groups: Group[];
  onConfirm: (id: string, patch?: unknown) => void;
  /** B-2 合并卡批量落定：checkedIds=确认删除，其余=出队保留；空数组=全部跳过 */
  onConfirmGroup: (checkedIds: string[]) => void;
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

function isTargetStale(proposal: Exclude<AiProposal, { kind: 'create' }>, todos: Todo[]): boolean {
  const current = todos.find((todo) => todo.id === proposal.draft.todoId);
  return !current || current.deleted === true || current.updatedAt !== proposal.before.updatedAt;
}

export function AiProposalCard({ proposal, status, errorText, busy = false, group, groupResults, todos, groups, onConfirm, onConfirmGroup, onReject }: AiProposalCardProps): JSX.Element {
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
  // B-1.2 终态卡折叠成一行：确认/取消即收起，点开可回看（再次点状态行之外无入口，收起按钮复原）
  const [expanded, setExpanded] = useState(() => status !== 'committed' && status !== 'rejected');
  useEffect(() => {
    if (status === 'committed' || status === 'rejected') setExpanded(false);
  }, [status]);

  // B-2 默认全选，仅记录用户取消勾选的 id，失败重试/父级刷新不会重置选择。
  const [uncheckedIds, setUncheckedIds] = useState<ReadonlySet<string>>(() => new Set());
  const checkedIds = (group ?? []).filter((member) => !uncheckedIds.has(member.id)).map((member) => member.id);
  const isGroup = (group?.length ?? 0) >= 2;

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

  const staleGroupIds = new Set((group ?? []).filter((member) => isTargetStale(member, todos)).map((member) => member.id));
  const staleByData = isGroup
    ? checkedIds.some((id) => staleGroupIds.has(id))
    : proposal.kind !== 'create' && isTargetStale(proposal, todos);
  const isStale = status === 'stale' || staleByData;
  const settled = status === 'committed' || status === 'rejected';
  const shownError = localError ?? (status === 'error' || (isGroup && status === 'stale') ? errorText : undefined);
  const committedLabel = proposal.kind === 'create' ? '✓ 已创建' : proposal.kind === 'update' ? '✓ 已更新' : '✓ 已删除';
  const deletedCount = groupResults?.filter((result) => result.deleted).length ?? 0;
  const statusLabel =
    status === 'committed'
      ? committedLabel + (groupResults?.length ? ` ×${deletedCount}` : '')
      : status === 'rejected'
        ? groupResults?.length
          ? '✕ 已跳过'
          : '✕ 已取消'
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

  // B-1.2 终态折叠行：整行可点重新展开
  if (settled && !expanded) {
    const miniKind = proposal.kind === 'delete' ? '删除' : isCreate ? '新建' : '修改';
    const resultTitles = groupResults?.filter((result) => status === 'rejected' || result.deleted).map((result) => result.title);
    const miniTitle = resultTitles?.length ? resultTitles.join('、') : proposal.kind === 'delete' ? proposal.before.title : title;
    return (
      <section className={`ai-card ai-card-mini ${statusClass}`} aria-label="已定稿卡片">
        <button type="button" className="ai-card-mini-line" onClick={() => setExpanded(true)} aria-expanded={false}>
          <span className={`ai-card-kind${proposal.kind === 'delete' ? ' danger' : ''}`}>{miniKind}</span>
          <span className="ai-card-mini-title" title={miniTitle}>{miniTitle || '（无标题）'}</span>
          <span className={`ai-card-status ${statusClass}`}>{statusLabel}</span>
        </button>
      </section>
    );
  }

  if (proposal.kind === 'delete') {
    const toggleRow = (id: string) => {
      setUncheckedIds((previous) => {
        const next = new Set(previous);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      setArmed(false);
      setLocalError(null);
    };
    return (
      <section className={`ai-card ai-card-delete ${statusClass}${busy ? ' is-busy' : ''}`} aria-label="删除确认卡">
        <div className="ai-card-line">
          <span className="ai-card-kind danger">删除</span>
          {isGroup && <span className="ai-card-chip">{group?.length} 条</span>}
          <span className={`ai-card-status ${statusClass}`}>{statusLabel}</span>
          {settled && (
            <button type="button" className="ai-card-fold" onClick={() => setExpanded(false)}>
              收起
            </button>
          )}
        </div>
        {isGroup ? (
          <div className="ai-group-list" role="group" aria-label="批量删除清单">
            {group?.map((member) => {
              const id = member.id;
              const memberTitle = member.before.title;
              return (
                <label key={id} className="ai-group-row">
                  <input
                    type="checkbox"
                    checked={!uncheckedIds.has(id)}
                    onChange={() => toggleRow(id)}
                    disabled={settled || busy}
                    aria-label={`删除 ${memberTitle}`}
                  />
                  <span className="ai-group-title">{memberTitle}</span>
                  <span className="ai-group-meta" title={groupNameOf(groups, member.before.groupId)}>
                    {staleGroupIds.has(id) ? '已变化' : groupNameOf(groups, member.before.groupId)}
                  </span>
                </label>
              );
            })}
          </div>
        ) : groupResults?.length ? (
          <div className="ai-group-list readonly" aria-label="批量删除回看">
            {groupResults.map((result) => (
              <div key={result.id} className="ai-group-row">
                <span className="ai-group-title">{result.title}</span>
                <span className="ai-group-meta">{result.deleted ? '已删除' : '保留'}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="ai-delete-target">
            <div className="ai-delete-title">{proposal.before.title}</div>
            <div className="ai-delete-meta">
              {groupNameOf(groups, proposal.before.groupId)} · {timeLabel(proposal.before.remindAt)}
            </div>
          </div>
        )}
        {shownError && (
          <div className="ai-card-error" role="alert">
            {shownError}
          </div>
        )}
        {isGroup ? (
          <div className="modal-footer ai-card-footer">
            <button
              type="button"
              className="button button-secondary"
              onClick={() => onConfirmGroup([])}
              disabled={settled || busy}
            >
              跳过全部
            </button>
            {armed ? (
              <button
                type="button"
                className="button ai-card-danger"
                onClick={() => onConfirmGroup(checkedIds)}
                disabled={locked || checkedIds.length === 0}
              >
                {busy ? '确认中…' : `确认删除 ${checkedIds.length} 条`}
              </button>
            ) : (
              <button
                type="button"
                className="button button-primary"
                onClick={() => setArmed(true)}
                disabled={locked || checkedIds.length === 0}
              >
                {checkedIds.length ? `删除 ${checkedIds.length} 条` : '删除'}
              </button>
            )}
          </div>
        ) : !groupResults && (
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
        )}
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
    <form className={`ai-card ${statusClass}${busy ? ' is-busy' : ''}`} onSubmit={handleSubmit} aria-label={isCreate ? '新建确认卡' : '修改确认卡'}>
      <div className="ai-card-line">
        <span className="ai-card-kind">{isCreate ? '新建' : '修改'}</span>
        <span className="ai-card-chip">{chip}</span>
        <span className={`ai-card-status ${statusClass}`}>{statusLabel}</span>
        {settled && (
          <button type="button" className="ai-card-fold" onClick={() => setExpanded(false)}>
            收起
          </button>
        )}
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
