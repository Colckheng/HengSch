import { useState, useRef } from 'react';
import type { Todo } from '../types';
import { useGroups } from '../context/GroupContext';
import { ConfirmDialog } from './ConfirmDialog';
import { IconEdit, IconTrash } from './Icons';

interface TodoCardProps {
  todo: Todo;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (todo: Todo) => void;
  onDetail: (todo: Todo) => void;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: '2-digit' })
    .format(d)
    .replace(/\//g, '.');
}

export function TodoCard({ todo, onToggle, onDelete, onEdit, onDetail }: TodoCardProps): JSX.Element {
  const isCompleted = todo.status === 'completed';
  const [isDragging, setIsDragging] = useState(false);
  const [popKey, setPopKey] = useState(0);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const { getGroupById } = useGroups();
  const group = todo.groupId ? getGroupById(todo.groupId) : undefined;

  const handleCardClick = () => {
    if (!isDragging) {
      onDetail(todo);
    }
  };

  const handleCardKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (e.target !== e.currentTarget) return;
    e.preventDefault();
    if (!isDragging) {
      onDetail(todo);
    }
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPopKey((k) => k + 1);
    onToggle(todo.id);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit(todo);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmingDelete(true);
  };

  const confirmDelete = () => {
    onDelete(todo.id);
    setConfirmingDelete(false);
  };

  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true);
    e.dataTransfer.setData('text/plain', todo.id);
    e.dataTransfer.effectAllowed = 'move';
    if (cardRef.current) {
      e.dataTransfer.setDragImage(cardRef.current, 0, 0);
    }
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  return (
    <div
      ref={cardRef}
      className={`todo-card ${isCompleted ? 'completed' : ''} ${isDragging ? 'dragging' : ''} ${group ? 'group-colored' : ''}`}
      draggable
      tabIndex={0}
      role="button"
      onKeyDown={handleCardKeyDown}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleCardClick}
    >
      <button
        key={popKey}
        className={`todo-checkbox ${isCompleted ? 'checked' : ''} ${popKey > 0 ? 'pop' : ''}`}
        onClick={handleToggle}
        aria-label={isCompleted ? '标记为未完成' : '标记为完成'}
      >
        {isCompleted && <span className="checkmark">✓</span>}
      </button>
      <div className="todo-content">
        <h3 className="todo-title">
          {todo.title}
          {todo.type === 'recurring' && <span className="recur-mark">↻</span>}
        </h3>
        {todo.description && <p className="todo-description">{todo.description}</p>}
      </div>
      <div className="todo-right">
        <span className="todo-meta">
          {group && <span className="group-dot" style={{ backgroundColor: group.color }} />}
          {group && <span>{group.name}</span>}
          <span>{formatDate(todo.createdAt)}</span>
        </span>
        <div className="todo-actions">
          <button className="todo-action-button edit" onClick={handleEdit} aria-label="编辑">
            <IconEdit />
          </button>
          <button className="todo-action-button delete" onClick={handleDelete} aria-label="删除">
            <IconTrash />
          </button>
        </div>
      </div>
      <ConfirmDialog
        isOpen={confirmingDelete}
        title="删除待办"
        message={`确定要删除「${todo.title}」吗？此操作无法撤销。`}
        confirmText="删除"
        onConfirm={confirmDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}
