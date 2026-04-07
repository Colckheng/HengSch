import { useEffect } from 'react';
import type { Todo, RecurringTodo } from '../types';
import { useGroups } from '../context/GroupContext';

interface TodoDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  todo: Todo | null;
}

function getTypeLabel(todo: Todo): string {
  if (todo.type !== 'recurring') {
    return '一次性';
  }

  const recurringTodo = todo as RecurringTodo;
  switch (recurringTodo.cycleType) {
    case 'daily':
      return '每天循环';
    case 'weekly':
      return '每周循环';
    case 'monthly':
      return '每月循环';
    case 'custom':
      return recurringTodo.customCycleDays ? `每 ${recurringTodo.customCycleDays} 天` : '自定义循环';
    default:
      return '循环任务';
  }
}

export function TodoDetailModal({ isOpen, onClose, todo }: TodoDetailModalProps): JSX.Element {
  const { getGroupById } = useGroups();

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !todo) {
    return <></>;
  }

  const group = todo.groupId ? getGroupById(todo.groupId) : undefined;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card tone-blue" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-group">
            <span className="modal-title-mark" aria-hidden="true">
              目
            </span>
            <h2>待办详情</h2>
          </div>
          <span className={`modal-status-chip ${todo.status === 'completed' ? 'completed' : 'pending'}`}>
            {todo.status === 'completed' ? '已完成' : '待处理'}
          </span>
          <button className="modal-close" onClick={onClose} aria-label="关闭" />
        </div>

        <div className="modal-body detail-layout">
          <section className="detail-card">
            <span className="detail-label">任务标题</span>
            <h3 className="detail-title">{todo.title}</h3>
          </section>

          <section className="detail-card">
            <span className="detail-label">描述说明</span>
            <p className="detail-paragraph">{todo.description || '这条待办还没有补充说明。'}</p>
          </section>

          <section className="detail-meta-grid">
            <div className="detail-meta-card">
              <span className="detail-label">所属分组</span>
              <strong>{group?.name ?? '未分类'}</strong>
            </div>
            <div className="detail-meta-card">
              <span className="detail-label">任务类型</span>
              <strong>{getTypeLabel(todo)}</strong>
            </div>
            <div className="detail-meta-card">
              <span className="detail-label">创建时间</span>
              <strong>{new Date(todo.createdAt).toLocaleString('zh-CN')}</strong>
            </div>
            <div className="detail-meta-card">
              <span className="detail-label">完成状态</span>
              <strong>{todo.status === 'completed' ? '已完成' : '待处理'}</strong>
            </div>
          </section>
        </div>

        <div className="modal-footer">
          <button type="button" className="button button-secondary" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
