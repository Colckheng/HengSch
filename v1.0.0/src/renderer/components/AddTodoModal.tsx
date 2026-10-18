import { useState, useEffect, useCallback } from 'react';
import type { TodoType, CycleType, MonitorConfig } from '../types';
import { useTodos } from '../context/TodoContext';
import { useGroups } from '../context/GroupContext';
import { IconClose } from './Icons';
import { GroupSelect } from './GroupSelect';
import { SwissSelect } from './SwissSelect';
import { MonitorSection } from './MonitorSection';
import { ReminderSection, type ReminderValue } from './ReminderSection';
import { TYPE_OPTIONS, CYCLE_OPTIONS } from './selectOptions';

interface AddTodoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddTodoModal({ isOpen, onClose }: AddTodoModalProps): JSX.Element {
  const { addTodo } = useTodos();
  const { state: groupState } = useGroups();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<TodoType>('once');
  const [cycleType, setCycleType] = useState<CycleType>('daily');
  const [customCycleDays, setCustomCycleDays] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('default');
  const [monitor, setMonitor] = useState<MonitorConfig | undefined>(undefined);
  const [reminder, setReminder] = useState<ReminderValue | undefined>(undefined);
  const [titleError, setTitleError] = useState(false);

  const handleClose = useCallback(() => {
    setTitle('');
    setDescription('');
    setType('once');
    setCycleType('daily');
    setCustomCycleDays('');
    setSelectedGroupId('default');
    setMonitor(undefined);
    setReminder(undefined);
    setTitleError(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      setTitleError(true);
      document.getElementById('title')?.focus();
      return;
    }
    setTitleError(false);

    if (type === 'recurring') {
      const parsedDays = parseInt(customCycleDays);
      addTodo({
        title: title.trim(),
        description: description.trim() || undefined,
        type: 'recurring',
        status: 'pending',
        cycleType,
        customCycleDays: cycleType === 'custom' && !isNaN(parsedDays) && parsedDays > 0 ? parsedDays : undefined,
        nextDueDate: Date.now(),
        groupId: selectedGroupId,
        monitor,
        remindAt: reminder?.remindAt,
        remindLeadMs: reminder?.remindLeadMs
      });
    } else {
      addTodo({
        title: title.trim(),
        description: description.trim() || undefined,
        type: 'once',
        status: 'pending',
        groupId: selectedGroupId,
        monitor,
        remindAt: reminder?.remindAt,
        remindLeadMs: reminder?.remindLeadMs
      });
    }

    handleClose();
  };

  if (!isOpen) return <></>;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>添加待办事项</h2>
          <button className="modal-close" onClick={handleClose} aria-label="关闭">
            <IconClose />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-group">
            <label htmlFor="title">标题 *</label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (titleError) setTitleError(false);
              }}
              placeholder="例：回复客户邮件…"
              autoComplete="off"
              autoFocus
              aria-invalid={titleError}
              aria-describedby={titleError ? 'title-error' : undefined}
            />
            {titleError && (
              <span className="form-error" id="title-error" role="alert">
                请输入标题（不能只有空格）
              </span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="description">描述</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="补充背景、链接或截止时间…"
              autoComplete="off"
              rows={3}
            />
          </div>

          <div className="form-group">
            <label htmlFor="type-select">类型</label>
            <SwissSelect
              id="type-select"
              options={TYPE_OPTIONS}
              value={type}
              onChange={(v) => setType(v as TodoType)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="group-select">分组</label>
            <GroupSelect
              id="group-select"
              groups={groupState.groups}
              value={selectedGroupId}
              onChange={setSelectedGroupId}
            />
          </div>

          {type === 'recurring' && (
            <>
              <div className="form-group">
                <label htmlFor="cycle-select">循环周期</label>
                <SwissSelect
                  id="cycle-select"
                  options={CYCLE_OPTIONS}
                  value={cycleType}
                  onChange={(v) => setCycleType(v as CycleType)}
                />
              </div>

              {cycleType === 'custom' && (
                <div className="form-group">
                  <label htmlFor="customCycleDays">自定义周期（天）</label>
                  <input
                    id="customCycleDays"
                    type="number"
                    min="1"
                    value={customCycleDays}
                    onChange={(e) => setCustomCycleDays(e.target.value)}
                    placeholder="输入天数…"
                    autoComplete="off"
                    required
                  />
                </div>
              )}
            </>
          )}

          <ReminderSection value={reminder} onChange={setReminder} />

          <MonitorSection monitor={monitor} onChange={setMonitor} />

          <div className="modal-footer">
            <button type="button" className="button button-secondary" onClick={handleClose}>
              取消
            </button>
            <button type="submit" className="button button-primary">
              添加
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}