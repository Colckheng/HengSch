import { useState, useEffect, useCallback } from 'react';
import type { Todo, TodoType, CycleType, RecurringTodo, MonitorConfig } from '../types';
import { useTodos } from '../context/TodoContext';
import { useGroups } from '../context/GroupContext';
import { IconClose } from './Icons';
import { MonitorSection } from './MonitorSection';

interface EditTodoModalProps {
  isOpen: boolean;
  onClose: () => void;
  todo: Todo | null;
}

export function EditTodoModal({ isOpen, onClose, todo }: EditTodoModalProps): JSX.Element {
  const { updateTodo } = useTodos();
  const { state: groupState } = useGroups();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<TodoType>('once');
  const [cycleType, setCycleType] = useState<CycleType>('daily');
  const [customCycleDays, setCustomCycleDays] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('default');
  const [monitor, setMonitor] = useState<MonitorConfig | undefined>(undefined);
  const [titleError, setTitleError] = useState(false);

  useEffect(() => {
    if (todo) {
      setTitle(todo.title);
      setDescription(todo.description || '');
      setType(todo.type);
      setSelectedGroupId(todo.groupId || 'default');
      setTitleError(false);
      if (todo.type === 'recurring') {
        const recurringTodo = todo as RecurringTodo;
        setCycleType(recurringTodo.cycleType);
        setCustomCycleDays(recurringTodo.customCycleDays?.toString() || '');
        setMonitor(recurringTodo.monitor);
      } else {
        setMonitor(undefined);
      }
    }
  }, [todo]);

  const handleClose = useCallback(() => {
    setTitle('');
    setDescription('');
    setType('once');
    setCycleType('daily');
    setCustomCycleDays('');
    setSelectedGroupId('default');
    setMonitor(undefined);
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

    if (!todo) return;

    if (!title.trim()) {
      setTitleError(true);
      document.getElementById('title')?.focus();
      return;
    }
    setTitleError(false);

    const updateData: Partial<Todo> & { monitor?: MonitorConfig } = {
      title: title.trim(),
      description: description.trim() || undefined,
      type,
      groupId: selectedGroupId,
      // 切换为一次性任务时清空监测配置
      monitor: type === 'recurring' ? monitor : undefined
    };

    if (type === 'recurring') {
      const recurringUpdateData = updateData as Partial<RecurringTodo>;
      recurringUpdateData.cycleType = cycleType;
      const parsedDays = parseInt(customCycleDays);
      recurringUpdateData.customCycleDays = cycleType === 'custom' && !isNaN(parsedDays) && parsedDays > 0 ? parsedDays : undefined;
      updateTodo(todo.id, recurringUpdateData);
    } else {
      updateTodo(todo.id, updateData);
    }

    handleClose();
  };

  if (!isOpen || !todo) return <></>;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>编辑待办事项</h2>
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
              required
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
            <label htmlFor="type">类型</label>
            <select id="type" value={type} onChange={(e) => setType(e.target.value as TodoType)}>
              <option value="once">一次性待办事项</option>
              <option value="recurring">循环待办事项</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="group">分组</label>
            <select id="group" value={selectedGroupId} onChange={(e) => setSelectedGroupId(e.target.value)}>
              {groupState.groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>

          {type === 'recurring' && (
            <>
              <div className="form-group">
                <label htmlFor="cycleType">循环周期</label>
                <select
                  id="cycleType"
                  value={cycleType}
                  onChange={(e) => setCycleType(e.target.value as CycleType)}
                >
                  <option value="daily">每天</option>
                  <option value="weekly">每周</option>
                  <option value="monthly">每月</option>
                  <option value="custom">自定义</option>
                </select>
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

              <MonitorSection monitor={monitor} onChange={setMonitor} />
            </>
          )}

          <div className="modal-footer">
            <button type="button" className="button button-secondary" onClick={handleClose}>
              取消
            </button>
            <button type="submit" className="button button-primary">
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}