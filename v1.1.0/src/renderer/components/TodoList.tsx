import { useState, type CSSProperties } from 'react';
import { useGroups } from '../context/GroupContext';
import { useTodos } from '../context/TodoContext';
import { useWindow } from '../context/WindowContext';
import type { Todo } from '../types';
import { TodoCard } from './TodoCard';

interface TodoListProps {
  onEdit: (todo: Todo) => void;
  onDetail: (todo: Todo) => void;
}

function SectionEmpty({ title, description }: { title: string; description: string }): JSX.Element {
  return (
    <div className="todo-section-empty">
      <span className="todo-section-empty-tag">{title}</span>
      <p>{description}</p>
    </div>
  );
}

export function TodoList({ onEdit, onDetail }: TodoListProps): JSX.Element {
  const { state, reorderTodos, toggleTodoStatus, deleteTodo } = useTodos();
  const { state: groupState } = useGroups();
  const { isCompactMode } = useWindow();
  const [selectedGroupId, setSelectedGroupId] = useState<string>('all');

  const handleDragStart = (e: React.DragEvent, draggedId: string): void => {
    e.dataTransfer.setData('text/plain', draggedId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent): void => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetId: string): void => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('text/plain');

    if (draggedId && targetId && draggedId !== targetId) {
      const oldIndex = state.todos.findIndex((todo) => todo.id === draggedId);
      const newIndex = state.todos.findIndex((todo) => todo.id === targetId);

      if (oldIndex !== -1 && newIndex !== -1) {
        const reorderedTodos = [...state.todos];
        const [removed] = reorderedTodos.splice(oldIndex, 1);
        reorderedTodos.splice(newIndex, 0, removed);
        reorderTodos(reorderedTodos);
      }
    }
  };

  if (state.todos.length === 0) {
    return (
      <div className="todo-list-empty">
        <div className="todo-list-empty-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <span className="todo-list-empty-badge">TO DO</span>
        <h3>今天的板子还是空的</h3>
        <p className="todo-list-empty-note">先点上方“新建”，把第一件想推进的事贴上来。</p>
        <div className="todo-list-empty-hints">
          <span className="todo-list-empty-hint">从 1 件最重要的事开始</span>
          <span className="todo-list-empty-hint muted">分组可以稍后再整理</span>
        </div>
      </div>
    );
  }

  const filteredTodos =
    selectedGroupId === 'all'
      ? state.todos
      : state.todos.filter((todo) => todo.groupId === selectedGroupId);

  const pendingTodos = filteredTodos.filter((todo) => todo.status !== 'completed');
  const completedTodos = filteredTodos.filter((todo) => todo.status === 'completed');

  if (isCompactMode) {
    return (
      <div className="compact-todo-list">
        {filteredTodos.slice(0, 6).map((todo) => (
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
    );
  }

  return (
    <div className="todo-board">
      <div className="group-filter">
        <span className="group-filter-label">筛选：</span>
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
            style={
              {
                '--group-chip-color': group.color,
                '--group-chip-active': group.color
              } as CSSProperties
            }
          >
            {group.name}
          </button>
        ))}
      </div>

      <div className="todo-columns">
        <section className="todo-section todo-section-primary">
          <header className="todo-section-header">
            <div className="todo-section-title">
              <span className="todo-section-dot pending" />
              <h3>进行中 / 待开始</h3>
            </div>
            <span className="todo-section-count">{pendingTodos.length}</span>
          </header>

          <div className="todo-stack">
            {pendingTodos.length === 0 ? (
              <SectionEmpty title="待处理" description="当前筛选条件下还没有待处理任务。" />
            ) : (
              pendingTodos.map((todo) => (
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
              ))
            )}
          </div>
        </section>

        <section className="todo-section todo-section-secondary completed">
          <header className="todo-section-header">
            <div className="todo-section-title">
              <span className="todo-section-dot completed" />
              <h3>已完成</h3>
            </div>
            <span className="todo-section-count">{completedTodos.length}</span>
          </header>

          <div className="todo-stack">
            {completedTodos.length === 0 ? (
              <SectionEmpty title="已完成" description="完成过的事项会收进这里，方便回顾。" />
            ) : (
              completedTodos.map((todo) => (
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
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
