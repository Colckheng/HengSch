import { useLayoutEffect, useRef, useState } from 'react';
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
  const listRef = useRef<HTMLDivElement>(null);
  const positionsRef = useRef<Map<string, number>>(new Map());
  const reduceMotionRef = useRef(window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const nodes = Array.from(list.querySelectorAll<HTMLElement>('[data-flip-id]'));
    const next = new Map<string, number>();

    nodes.forEach((node) => {
      const id = node.dataset.flipId;
      if (!id) return;
      const lastTop = node.getBoundingClientRect().top;
      next.set(id, lastTop);

      if (!reduceMotionRef.current) {
        const firstTop = positionsRef.current.get(id);
        if (firstTop !== undefined && Math.abs(firstTop - lastTop) > 0.5) {
          node.style.transition = 'none';
          node.style.transform = `translateY(${firstTop - lastTop}px)`;
          requestAnimationFrame(() => {
            node.style.transition = 'transform 180ms ease-out';
            node.style.transform = '';
          });
        }
      }
    });

    positionsRef.current = next;
  });

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

  const pendingCount = state.todos.filter((t) => t.status === 'pending').length;
  const pendingByGroup = (groupId: string) =>
    state.todos.filter((t) => t.status === 'pending' && t.groupId === groupId).length;

  const filteredTodos =
    selectedGroupId === 'all'
      ? state.todos
      : state.todos.filter((todo) => todo.groupId === selectedGroupId);

  const showTabs = !isCompactMode;

  if (state.todos.length === 0) {
    return (
      <>
        {showTabs && (
          <div className="group-filter">
            <button className="group-filter-item active" onClick={() => setSelectedGroupId('all')}>
              <span className="tab-no">00</span> All
              <span className="tab-cn">全部</span>
              <span className="tab-count">00</span>
            </button>
          </div>
        )}
        <div className="todo-list-empty">
          <p>Nothing here yet</p>
          <p>{isCompactMode ? '在底部输入框快速添加' : '点击右下 ADD TASK 添加待办'}</p>
        </div>
      </>
    );
  }

  return (
    <>
      {showTabs && (
        <div className="group-filter">
          <button
            className={`group-filter-item ${selectedGroupId === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedGroupId('all')}
          >
            <span className="tab-no">00</span> All
            <span className="tab-cn">全部</span>
            <span className="tab-count">{String(pendingCount).padStart(2, '0')}</span>
          </button>
          {groupState.groups.map((group, index) => (
            <button
              key={group.id}
              className={`group-filter-item ${selectedGroupId === group.id ? 'active' : ''}`}
              onClick={() => setSelectedGroupId(group.id)}
            >
              <span className="tab-no">{String(index + 1).padStart(2, '0')}</span>
              {group.name}
              <span className="tab-dot" style={{ backgroundColor: group.color }} />
              <span className="tab-count">
                {String(pendingByGroup(group.id)).padStart(2, '0')}
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="todo-list" ref={listRef}>
        {filteredTodos.map((todo) => (
          <div
            key={todo.id}
            data-flip-id={todo.id}
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
