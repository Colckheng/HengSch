import { useState } from 'react';
import type { Todo } from '../types';
import { useTodos } from '../context/TodoContext';
import { useGroups } from '../context/GroupContext';
import { useWindow } from '../context/WindowContext';
import { TodoCard } from './TodoCard';

interface TodoListProps {
  onEdit: (todo: Todo) => void;
  onDetail: (todo: Todo) => void;
}

export function TodoList({ onEdit, onDetail }: TodoListProps): JSX.Element {
  const { state, reorderTodos, toggleTodoStatus, deleteTodo } = useTodos();
  const { state: groupState } = useGroups();
  const { isCompactMode } = useWindow();
  const [selectedGroupId, setSelectedGroupId] = useState<string>('all');

  const handleDragStart = (e: React.DragEvent, draggedId: string) => {
    e.dataTransfer.setData('text/plain', draggedId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('text/plain');
    
    if (draggedId && targetId && draggedId !== targetId) {
      const oldIndex = state.todos.findIndex((todo) => todo.id === draggedId);
      const newIndex = state.todos.findIndex((todo) => todo.id === targetId);
      
      if (oldIndex !== -1 && newIndex !== -1) {
        const newTodos = [...state.todos];
        const [removed] = newTodos.splice(oldIndex, 1);
        newTodos.splice(newIndex, 0, removed);
        reorderTodos(newTodos);
      }
    }
  };

  if (state.todos.length === 0) {
    return (
      <div className="todo-list-empty">
        <p>暂无待办事项</p>
        <p>点击上方 + 按钮添加新的待办事项</p>
      </div>
    );
  }

  const filteredTodos = selectedGroupId === 'all' 
    ? state.todos 
    : state.todos.filter((todo) => todo.groupId === selectedGroupId);

  return (
    <>
      {!isCompactMode && (
        <div className="group-filter">
          <button
            className={`group-filter-item ${selectedGroupId === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedGroupId('all')}
          >
            全部
          </button>
          {groupState.groups.map((group) => (
            <button
              key={group.id}
              className={`group-filter-item ${selectedGroupId === group.id ? 'active' : ''}`}
              onClick={() => setSelectedGroupId(group.id)}
              style={{ backgroundColor: selectedGroupId === group.id ? group.color : 'transparent' }}
            >
              {group.name}
            </button>
          ))}
        </div>
      )}
      <div className="todo-list">
        {(isCompactMode ? filteredTodos.slice(0, 6) : filteredTodos).map((todo) => (
          <div
            key={todo.id}
            onDragStart={(e) => handleDragStart(e, todo.id)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, todo.id)}
          >
            <TodoCard
              todo={todo}
              onToggle={toggleTodoStatus}
              onDelete={deleteTodo}
              onEdit={onEdit}
              onDetail={onDetail}
            />
          </div>
        ))}
      </div>
    </>
  );
}