import { useEffect, useState } from 'react';
import type { Todo, RecurringTodo } from '../types';
import { IconClose } from './Icons';
import { ConfirmDialog } from './ConfirmDialog';

interface TodoDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  todo: Todo | null;
  onEdit: (todo: Todo) => void;
  onDelete: (id: string) => void;
}

export function TodoDetailModal({ isOpen, onClose, todo, onEdit, onDelete }: TodoDetailModalProps): JSX.Element {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (!isOpen) setConfirmingDelete(false);
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !todo) return <></>;

  const isCompleted = todo.status === 'completed';
  const isRecurring = todo.type === 'recurring';
  const recurringTodo = isRecurring ? (todo as RecurringTodo) : null;

  const handleEdit = () => {
    onEdit(todo);
  };

  const handleConfirmDelete = () => {
    onDelete(todo.id);
    setConfirmingDelete(false);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content todo-detail" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>待办事项详情</h2>
          <button className="modal-close" onClick={onClose} aria-label="关闭">
            <IconClose />
          </button>
        </div>
        <div className="modal-body">
          <div className="todo-detail-info">
            <div className={`todo-detail-status ${isCompleted ? 'completed' : 'pending'}`}>
              {isCompleted ? '✓ 已完成' : '○ 待完成'}
            </div>

            <h3 className="todo-detail-title">{todo.title}</h3>

            {todo.description && (
              <div className="todo-detail-description">
                <h4>描述</h4>
                <p>{todo.description}</p>
              </div>
            )}

            <div className="todo-detail-meta">
              <div className="meta-item">
                <span className="meta-label">类型：</span>
                <span className="meta-value">
                  {isRecurring ? '循环待办事项' : '一次性待办事项'}
                </span>
              </div>

              {isRecurring && recurringTodo && (
                <div className="meta-item">
                  <span className="meta-label">循环周期：</span>
                  <span className="meta-value">
                    {recurringTodo.cycleType === 'daily' && '每天'}
                    {recurringTodo.cycleType === 'weekly' && '每周'}
                    {recurringTodo.cycleType === 'monthly' && '每月'}
                    {recurringTodo.cycleType === 'custom' && `每 ${recurringTodo.customCycleDays} 天`}
                  </span>
                </div>
              )}

              <div className="meta-item">
                <span className="meta-label">创建时间：</span>
                <span className="meta-value">
                  {new Date(todo.createdAt).toLocaleString('zh-CN')}
                </span>
              </div>

              {isCompleted && todo.completedAt && (
                <div className="meta-item">
                  <span className="meta-label">完成时间：</span>
                  <span className="meta-value">
                    {new Date(todo.completedAt).toLocaleString('zh-CN')}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="button button-danger" onClick={() => setConfirmingDelete(true)}>
            删除
          </button>
          <button type="button" className="button button-secondary" onClick={handleEdit}>
            编辑
          </button>
          <button type="button" className="button button-secondary" onClick={onClose}>
            关闭
          </button>
        </div>
        <ConfirmDialog
          isOpen={confirmingDelete}
          title="删除待办"
          message={`确定要删除「${todo.title}」吗？此操作无法撤销。`}
          confirmText="删除"
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      </div>
    </div>
  );
}
