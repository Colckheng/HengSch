import { useRef, useState, type CSSProperties } from 'react';
import { useGroups } from '../context/GroupContext';
import type { Todo } from '../types';

interface TodoCardProps {
  todo: Todo;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (todo: Todo) => void;
  onDetail: (todo: Todo) => void;
}

function EditIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 20h4.2L19 9.2a2 2 0 0 0 0-2.8l-1.4-1.4a2 2 0 0 0-2.8 0L4 15.8V20Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M12.8 7.2l4 4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function DeleteIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5 7h14"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M9 7V5.6A1.6 1.6 0 0 1 10.6 4h2.8A1.6 1.6 0 0 1 15 5.6V7"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M8.2 9.4v8.2A1.4 1.4 0 0 0 9.6 19h4.8a1.4 1.4 0 0 0 1.4-1.4V9.4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M10.5 11.5v5M13.5 11.5v5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export function TodoCard({ todo, onToggle, onDelete, onEdit, onDetail }: TodoCardProps): JSX.Element {
  const isCompleted = todo.status === 'completed';
  const [isDragging, setIsDragging] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const { getGroupById } = useGroups();
  const group = todo.groupId ? getGroupById(todo.groupId) : undefined;

  const handleCardClick = (): void => {
    if (!isDragging) {
      onDetail(todo);
    }
  };

  const handleToggle = (e: React.MouseEvent): void => {
    e.stopPropagation();
    onToggle(todo.id);
  };

  const handleEdit = (e: React.MouseEvent): void => {
    e.stopPropagation();
    onEdit(todo);
  };

  const handleDelete = (e: React.MouseEvent): void => {
    e.stopPropagation();
    if (confirm('确定要删除这条待办事项吗？')) {
      onDelete(todo.id);
    }
  };

  const handleDragStart = (e: React.DragEvent): void => {
    setIsDragging(true);
    e.dataTransfer.setData('text/plain', todo.id);
    e.dataTransfer.effectAllowed = 'move';

    if (cardRef.current) {
      e.dataTransfer.setDragImage(cardRef.current, 0, 0);
    }
  };

  const handleDragEnd = (): void => {
    setIsDragging(false);
  };

  return (
    <article
      ref={cardRef}
      className={`todo-card ${isCompleted ? 'completed' : ''} ${isDragging ? 'dragging' : ''}`}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleCardClick}
      style={{ '--group-color': group?.color ?? '#f6e29f' } as CSSProperties}
    >
      <div className="todo-card-handle" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <button
        className={`todo-checkbox ${isCompleted ? 'checked' : ''}`}
        onClick={handleToggle}
        aria-label={isCompleted ? '标记为未完成' : '标记为已完成'}
      >
        {isCompleted ? '✓' : ''}
      </button>

      <div className="todo-card-body">
        <div className="todo-card-top">
          <div className="todo-card-heading">
            <h4 className="todo-title">{todo.title}</h4>
          </div>

          <div className="todo-card-tools">
            {todo.type === 'recurring' && <span className="todo-badge recurring">循环</span>}

            <div className="todo-actions">
              <button className="todo-action-button edit" onClick={handleEdit} aria-label="编辑">
                <EditIcon />
              </button>
              <button className="todo-action-button delete" onClick={handleDelete} aria-label="删除">
                <DeleteIcon />
              </button>
            </div>
          </div>
        </div>

        {todo.description && <p className="todo-description">{todo.description}</p>}

        <div className="todo-meta">
          <span className="todo-badge group">{group?.name ?? '未分类'}</span>
          <span className={`todo-badge status ${isCompleted ? 'completed' : 'pending'}`}>
            {isCompleted ? '已完成' : '待开始'}
          </span>
        </div>
      </div>
    </article>
  );
}
