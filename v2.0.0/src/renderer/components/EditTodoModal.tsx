import { useState, useEffect, useCallback } from 'react';
import type { Todo, TodoType, CycleType, RecurringTodo } from '../types';
import { useTodos } from '../context/TodoContext';
import { useGroups } from '../context/GroupContext';

interface EditTodoModalProps {
  isOpen: boolean;
  onClose: () => void;
  todo: Todo | null;
}

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
  }, [isOpen, handleClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

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

  const handleDelete = () => {
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
      <div className="modal-card tone-blue" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-group">
            <span className="modal-title-mark" aria-hidden="true">
              口
            </span>
            <h2>待办详情</h2>
          </div>
          <span className={`modal-status-chip ${status === 'completed' ? 'completed' : 'pending'}`}>
            {status === 'completed' ? '已完成' : '进行中'}
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
              onChange={(e) => setTitle(e.target.value)}
              placeholder="输入待办标题"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="edit-description">描述说明</label>
            <textarea
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="补充任务背景和目标"
              rows={4}
            />
          </div>

          <div className="form-group">
            <label>任务状态</label>
            <div className="choice-row">
              <button
                type="button"
                className={`choice-chip ${status === 'pending' ? 'active tone-blue' : ''}`}
                onClick={() => setStatus('pending')}
              >
                待处理
              </button>
              <button
                type="button"
                className={`choice-chip ${status === 'completed' ? 'active tone-green' : ''}`}
                onClick={() => setStatus('completed')}
              >
                已完成
              </button>
            </div>
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
                  className={`choice-chip ${type === 'recurring' ? 'active tone-purple' : ''}`}
                  onClick={() => setType('recurring')}
                >
                  循环
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
