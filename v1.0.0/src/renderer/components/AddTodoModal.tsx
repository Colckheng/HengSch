import { useState, useEffect, useCallback } from 'react';
import type { TodoType, CycleType } from '../types';
import { useTodos } from '../context/TodoContext';
import { useGroups } from '../context/GroupContext';
import { IconClose } from './Icons';

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
  const [titleError, setTitleError] = useState(false);

  const handleClose = useCallback(() => {
    setTitle('');
    setDescription('');
    setType('once');
    setCycleType('daily');
    setCustomCycleDays('');
    setSelectedGroupId('default');
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
        groupId: selectedGroupId
      });
    } else {
      addTodo({
        title: title.trim(),
        description: description.trim() || undefined,
        type: 'once',
        status: 'pending',
        groupId: selectedGroupId
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
            </>
          )}

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