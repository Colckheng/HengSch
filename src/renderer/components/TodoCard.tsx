import { useState, useRef } from 'react';
import type { Todo } from '../types';
import { useGroups } from '../context/GroupContext';

interface TodoCardProps {
  todo: Todo;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (todo: Todo) => void;
  onDetail: (todo: Todo) => void;
}

export function TodoCard({ todo, onToggle, onDelete, onEdit, onDetail }: TodoCardProps): JSX.Element {
  const isCompleted = todo.status === 'completed';
  const [isDragging, setIsDragging] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const { getGroupById } = useGroups();
  const group = todo.groupId ? getGroupById(todo.groupId) : undefined;

  const handleCardClick = () => {
    if (!isDragging) {
      onDetail(todo);
    }
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle(todo.id);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit(todo);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('确定要删除这个待办事项吗？')) {
      onDelete(todo.id);
    }
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
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleCardClick}
      style={group ? {
        backgroundColor: group.color,
        borderColor: isCompleted ? 'rgba(0, 0, 0, 0.2)' : `rgba(0, 0, 0, 0.15)`,
        border: `1px solid ${isCompleted ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.15)'}`
      } : {}}
    >
      <button
        className={`todo-checkbox ${isCompleted ? 'checked' : ''}`}
        onClick={handleToggle}
        aria-label={isCompleted ? '标记为未完成' : '标记为完成'}
      >
        {isCompleted && <span className="checkmark">✓</span>}
      </button>
      <div className="todo-content">
        {group && (
          <span className="todo-badge group-badge" style={{ backgroundColor: group.color }}>
            {group.name}
          </span>
        )}
        <h3 className="todo-title">{todo.title}</h3>
        {todo.description && <p className="todo-description">{todo.description}</p>}
        {todo.type === 'recurring' && (
          <span className="todo-badge recurring">循环</span>
        )}
      </div>
      <div className="todo-actions">
        <button className="todo-action-button edit" onClick={handleEdit} aria-label="编辑">
          ✏
        </button>
        <button className="todo-action-button delete" onClick={handleDelete} aria-label="删除">
          🗑
        </button>
      </div>
    </div>
  );
}