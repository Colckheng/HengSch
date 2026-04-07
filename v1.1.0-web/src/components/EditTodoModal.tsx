import { useCallback, useEffect, useState } from 'react';
import type { CycleType, RecurringTodo, Todo, TodoType } from '@hengsch/shared-types';
import { useGroups } from '../context/GroupContext';
import { useTodos } from '../context/TodoContext';

interface EditTodoModalProps {
  isOpen: boolean;
  onClose: () => void;
  todo: Todo | null;
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

export function EditTodoModal({ isOpen, onClose, todo }: EditTodoModalProps): JSX.Element {
  const { updateTodo, deleteTodo } = useTodos();
  const { state: groupState } = useGroups();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<TodoType>('once');
  const [cycleType, setCycleType] = useState<CycleType>('daily');
  const [customCycleDays, setCustomCycleDays] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('default');
  const [status, setStatus] = useState<'pending' | 'completed'>('pending');

  useEffect(() => {
    if (!todo) {
      return;
    }

    setTitle(todo.title);
    setDescription(todo.description || '');
    setType(todo.type);
    setSelectedGroupId(todo.groupId || 'default');
    setStatus(todo.status);

    if (todo.type === 'recurring') {
      const recurringTodo = todo as RecurringTodo;
      setCycleType(recurringTodo.cycleType);
      setCustomCycleDays(recurringTodo.customCycleDays?.toString() || '');
    } else {
      setCycleType('daily');
      setCustomCycleDays('');
    }
  }, [todo]);

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

    if (!todo || !title.trim()) {
      return;
    }

    const updates: Partial<Todo> = {
      title: title.trim(),
      description: description.trim() || undefined,
      type,
      status,
      groupId: selectedGroupId
    };

    if (type === 'recurring') {
      const parsedDays = parseInt(customCycleDays, 10);
      const recurringUpdate = updates as Partial<RecurringTodo>;
      recurringUpdate.cycleType = cycleType;
      recurringUpdate.customCycleDays =
        cycleType === 'custom' && !Number.isNaN(parsedDays) && parsedDays > 0
          ? parsedDays
          : undefined;
    }

    updateTodo(todo.id, updates);
    handleClose();
  };

  const handleDelete = (): void => {
    if (!todo) {
      return;
    }

    if (confirm('确定要删除这条待办事项吗？')) {
      deleteTodo(todo.id);
      handleClose();
    }
  };

  if (!isOpen || !todo) {
    return <></>;
  }

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-card modal-card-form tone-blue" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-copy">
            <span className="modal-kicker">编辑待办</span>
            <h2>{todo.title}</h2>
            <p>调整标题、状态、分组或循环方式，让它继续留在正确的位置。</p>
          </div>
          <span className={`modal-status-chip ${status === 'completed' ? 'completed' : 'pending'}`}>
            {status === 'completed' ? '已完成' : '待推进'}
          </span>
          <button className="modal-close" onClick={handleClose} aria-label="关闭" />
        </div>

        <form className="modal-body modal-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="edit-title">任务标题</label>
            <input
              id="edit-title"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="输入待办标题"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="edit-description">描述说明</label>
            <textarea
              id="edit-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="补充任务背景、边界或完成标准"
              rows={4}
            />
          </div>

          <div className="modal-grid">
            <div className="form-group">
              <label>任务状态</label>
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

          <div className="modal-footer modal-footer-split">
            <button type="button" className="button button-danger" onClick={handleDelete}>
              删除待办
            </button>
            <div className="modal-footer-actions">
              <button type="button" className="button button-secondary" onClick={handleClose}>
                取消
              </button>
              <button type="submit" className="button button-primary">
                保存修改
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
