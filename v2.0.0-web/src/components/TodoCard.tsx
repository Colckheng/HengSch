import { useRef, useState, type CSSProperties } from 'react';
import type { Todo } from '@hengsch/shared-types';
import { useGroups } from '../context/GroupContext';

interface TodoCardProps {
  todo: Todo;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (todo: Todo) => void;
  onDetail: (todo: Todo) => void;
}

const cardDateFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: 'numeric',
  day: 'numeric'
});

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
  const createdAtLabel = cardDateFormatter.format(new Date(todo.createdAt));

  const handleCardClick = (): void => {
    if (!isDragging) {
      onDetail(todo);
    }
  };

  const handleToggle = (event: React.MouseEvent): void => {
    event.stopPropagation();
    onToggle(todo.id);
  };

  const handleEdit = (event: React.MouseEvent): void => {
    event.stopPropagation();
    onEdit(todo);
  };

  const handleDelete = (event: React.MouseEvent): void => {
    event.stopPropagation();
    if (confirm('确定要删除这条待办事项吗？')) {
      onDelete(todo.id);
    }
  };

  const handleDragStart = (event: React.DragEvent): void => {
    setIsDragging(true);
    event.dataTransfer.setData('text/plain', todo.id);
    event.dataTransfer.effectAllowed = 'move';

    if (cardRef.current) {
      event.dataTransfer.setDragImage(cardRef.current, 24, 24);
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
      style={{ '--group-color': group?.color ?? '#f5d77d' } as CSSProperties}
    >
      <button
        className={`todo-checkbox ${isCompleted ? 'checked' : ''}`}
        onClick={handleToggle}
        aria-label={isCompleted ? '标记为未完成' : '标记为已完成'}
      >
        {isCompleted ? '✓' : ''}
      </button>

      <div className="todo-card-body">
        <div className="todo-card-topline">
          <div className="todo-card-tags">
            <span className="todo-badge group">{group?.name ?? '未分类'}</span>
            {todo.type === 'recurring' && <span className="todo-badge recurring">循环</span>}
          </div>
          <span className="todo-card-date">{createdAtLabel}</span>
        </div>

        <div className="todo-card-main">
          <div className="todo-card-copy">
            <h4 className="todo-title">{todo.title}</h4>
            <p className="todo-description">{todo.description || '点击展开详情，补充说明、目标或执行边界。'}</p>
          </div>

          <div className="todo-actions">
            <button className="todo-action-button edit" onClick={handleEdit} aria-label="编辑">
              <EditIcon />
            </button>
            <button className="todo-action-button delete" onClick={handleDelete} aria-label="删除">
              <DeleteIcon />
            </button>
          </div>
        </div>

        <div className="todo-card-footer">
          <span className={`todo-badge status ${isCompleted ? 'completed' : 'pending'}`}>
            {isCompleted ? '已完成' : '待推进'}
          </span>
          <span className="todo-card-hint">点击查看详情</span>
        </div>
      </div>
    </article>
  );
}
