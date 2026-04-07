import { useCallback, useEffect, useState } from 'react';
import type { CycleType, TodoType } from '@hengsch/shared-types';
import { useGroups } from '../context/GroupContext';
import { useTodos } from '../context/TodoContext';

interface AddTodoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const todoTypeOptions: Array<{ value: TodoType; label: string }> = [
  { value: 'once', label: '一次性' },
  { value: 'recurring', label: '循环事项' }
];

const statusOptions: Array<{ value: 'pending' | 'completed'; label: string }> = [
  { value: 'pending', label: '待推进' },
  { value: 'completed', label: '已完成' }
];

const cycleOptions: Array<{ value: CycleType; label: string }> = [
  { value: 'daily', label: '每天' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
  { value: 'custom', label: '自定义' }
];

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
  }, [handleClose, isOpen]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

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
      <div className="modal-card modal-card-form tone-yellow" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-copy">
            <span className="modal-kicker">新建待办</span>
            <h2>把事情写成一句可执行的话</h2>
            <p>先写标题，再决定分组、循环方式和初始状态。</p>
          </div>
          <button className="modal-close" onClick={handleClose} aria-label="关闭" />
        </div>

        <form className="modal-body modal-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="add-title">任务标题</label>
            <input
              id="add-title"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="例如：整理发布页文案"
              autoFocus
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="add-description">描述说明</label>
            <textarea
              id="add-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="补充背景、目标，或写下完成这件事的标准。"
              rows={4}
            />
          </div>

          <div className="modal-grid">
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

            <div className="form-group">
              <label>初始状态</label>
              <div className="choice-row">
                {statusOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`choice-chip ${status === option.value ? 'active tone-green' : ''}`}
                    onClick={() => setStatus(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="form-group">
            <label>任务类型</label>
            <div className="choice-row">
              {todoTypeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`choice-chip ${type === option.value ? 'active tone-blue' : ''}`}
                  onClick={() => setType(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {type === 'recurring' && (
            <div className="form-group">
              <label>循环频率</label>
              <div className="choice-row">
                {cycleOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`choice-chip ${cycleType === option.value ? 'active tone-coral' : ''}`}
                    onClick={() => setCycleType(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              {cycleType === 'custom' && (
                <input
                  className="inline-input"
                  type="number"
                  min="1"
                  value={customCycleDays}
                  onChange={(event) => setCustomCycleDays(event.target.value)}
                  placeholder="输入循环天数"
                />
              )}
            </div>
          )}

          <div className="modal-footer">
            <button type="button" className="button button-secondary" onClick={handleClose}>
              取消
            </button>
            <button type="submit" className="button button-primary">
              创建待办
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
