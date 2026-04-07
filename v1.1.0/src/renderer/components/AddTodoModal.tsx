import { useState, useEffect, useCallback } from 'react';
import type { TodoType, CycleType } from '../types';
import { useTodos } from '../context/TodoContext';
import { useGroups } from '../context/GroupContext';

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
  const [status, setStatus] = useState<'pending' | 'completed'>('pending');

  const handleClose = useCallback(() => {
    setTitle('');
    setDescription('');
    setType('once');
    setCycleType('daily');
    setCustomCycleDays('');
    setSelectedGroupId('default');
    setStatus('pending');
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      return;
    }

    const baseTodo = {
      title: title.trim(),
      description: description.trim() || undefined,
      status,
      groupId: selectedGroupId
    };

    if (type === 'recurring') {
      const parsedDays = parseInt(customCycleDays, 10);
      addTodo({
        ...baseTodo,
        type: 'recurring',
        cycleType,
        customCycleDays:
          cycleType === 'custom' && !Number.isNaN(parsedDays) && parsedDays > 0
            ? parsedDays
            : undefined,
        nextDueDate: Date.now()
      });
    } else {
      addTodo({
        ...baseTodo,
        type: 'once'
      });
    }

    handleClose();
  };

  if (!isOpen) {
    return <></>;
  }

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-card tone-yellow" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-group">
            <span className="modal-title-mark" aria-hidden="true">
              +
            </span>
            <h2>新建待办</h2>
          </div>
          <button className="modal-close" onClick={handleClose} aria-label="关闭" />
        </div>

        <form className="modal-body modal-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="add-title">任务标题 *</label>
            <input
              id="add-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="这件事叫什么..."
              autoFocus
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="add-description">描述（可选）</label>
            <textarea
              id="add-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="补充说明、背景、目标..."
              rows={4}
            />
          </div>

          <div className="form-group">
            <label>所属分组</label>
            <div className="choice-row">
              {groupState.groups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  className={`choice-chip ${selectedGroupId === group.id ? 'active' : ''}`}
                  onClick={() => setSelectedGroupId(group.id)}
                >
                  {group.name}
                </button>
              ))}
            </div>
          </div>

          <div className="modal-grid">
            <div className="form-group">
              <label>任务类型</label>
              <div className="choice-row">
                <button
                  type="button"
                  className={`choice-chip ${type === 'once' ? 'active tone-blue' : ''}`}
                  onClick={() => setType('once')}
                >
                  一次性
                </button>
                <button
                  type="button"
                  className={`choice-chip ${type === 'recurring' ? 'active tone-blue' : ''}`}
                  onClick={() => setType('recurring')}
                >
                  循环
                </button>
              </div>
            </div>

            <div className="form-group">
              <label>初始状态</label>
              <div className="choice-row">
                <button
                  type="button"
                  className={`choice-chip ${status === 'pending' ? 'active' : ''}`}
                  onClick={() => setStatus('pending')}
                >
                  待处理
                </button>
                <button
                  type="button"
                  className={`choice-chip ${status === 'completed' ? 'active' : ''}`}
                  onClick={() => setStatus('completed')}
                >
                  已完成
                </button>
              </div>
            </div>
          </div>

          {type === 'recurring' && (
            <div className="form-group">
              <label>循环周期</label>
              <div className="choice-row">
                {(['daily', 'weekly', 'monthly', 'custom'] as CycleType[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`choice-chip ${cycleType === value ? 'active tone-purple' : ''}`}
                    onClick={() => setCycleType(value)}
                  >
                    {value === 'daily' && '每天'}
                    {value === 'weekly' && '每周'}
                    {value === 'monthly' && '每月'}
                    {value === 'custom' && '自定义'}
                  </button>
                ))}
              </div>

              {cycleType === 'custom' && (
                <input
                  className="inline-input"
                  type="number"
                  min="1"
                  value={customCycleDays}
                  onChange={(e) => setCustomCycleDays(e.target.value)}
                  placeholder="输入天数"
                />
              )}
            </div>
          )}

          <div className="modal-footer">
            <button type="button" className="button button-secondary" onClick={handleClose}>
              取消
            </button>
            <button type="submit" className="button button-primary">
              + 贴上去
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
