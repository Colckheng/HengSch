import { useLayoutEffect, useRef, useState, useEffect } from 'react';
import type { Todo } from '../types';
import { useTodos } from '../context/TodoContext';
import { useGroups } from '../context/GroupContext';
import { TodoCard } from './TodoCard';

interface TodoListProps {
  onEdit: (todo: Todo) => void;
  onDetail: (todo: Todo) => void;
}

const LONG_PRESS_MS = 300;
const MOVE_CANCEL_PX = 10;
const SUPPRESS_CLICK_MS = 700;

export function TodoList({ onEdit, onDetail }: TodoListProps): JSX.Element {
  const { state, reorderTodos, toggleTodoStatus, deleteTodo } = useTodos();
  const { state: groupState } = useGroups();
  const [selectedGroupId, setSelectedGroupId] = useState<string>('all');
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropBeforeId, setDropBeforeId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const positionsRef = useRef<Map<string, number>>(new Map());
  const reduceMotionRef = useRef(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const suppressClickRef = useRef(false);

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

  // 触屏拖拽的落点应用需读取最新 state.todos：每轮渲染刷新 ref
  const touchDropRef = useRef<(draggedId: string, insertBeforeId: string | null) => void>(() => undefined);
  useEffect(() => {
    touchDropRef.current = (draggedId, insertBeforeId) => {
      const arr = state.todos;
      const dragged = arr.find((t) => t.id === draggedId);
      if (!dragged) return;
      const next = arr.filter((t) => t.id !== draggedId);
      if (insertBeforeId && insertBeforeId !== draggedId) {
        const idx = next.findIndex((t) => t.id === insertBeforeId);
        if (idx !== -1) next.splice(idx, 0, dragged);
      }
      if (next.every((t, i) => t.id === arr[i]?.id)) return;
      reorderTodos(next);
    };
  });

  const consumeSuppress = (): boolean => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return true;
    }
    return false;
  };

  // 触屏长按拖拽（HTML5 DnD 不支持触屏）
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const touch = {
      timer: null as ReturnType<typeof setTimeout> | null,
      startX: 0,
      startY: 0,
      id: null as string | null,
      active: false,
      insertBefore: null as string | null
    };

    const clearTimer = () => {
      if (touch.timer) {
        clearTimeout(touch.timer);
        touch.timer = null;
      }
    };

    const boundaryAt = (y: number): string | null => {
      const rows = Array.from(list.querySelectorAll<HTMLElement>('[data-flip-id]'));
      for (const r of rows) {
        const rect = r.getBoundingClientRect();
        if (y < rect.top + rect.height / 2) return r.dataset.flipId ?? null;
      }
      return null; // 落到列表末尾
    };

    const clearVisual = () => {
      if (touch.id) {
        const src = list.querySelector<HTMLElement>(`[data-flip-id="${CSS.escape(touch.id)}"]`);
        if (src) src.style.transform = '';
      }
      touch.active = false;
      touch.id = null;
      touch.insertBefore = null;
      setDragId(null);
      setDropBeforeId(null);
    };

    const onTouchStart = (e: TouchEvent) => {
      suppressClickRef.current = false;
      clearTimer();
      if (e.touches.length !== 1) {
        if (touch.active) clearVisual();
        else touch.id = null;
        return;
      }
      const row = (e.target as Element | null)?.closest<HTMLElement>('[data-flip-id]') ?? null;
      if (!row || !list.contains(row)) {
        touch.id = null;
        return;
      }
      touch.startX = e.touches[0].clientX;
      touch.startY = e.touches[0].clientY;
      touch.id = row.dataset.flipId ?? null;
      touch.active = false;
      touch.insertBefore = touch.id;
      if (!touch.id) return;
      touch.timer = setTimeout(() => {
        touch.timer = null;
        if (!touch.id) return;
        touch.active = true;
        touch.insertBefore = boundaryAt(touch.startY);
        setDragId(touch.id);
        setDropBeforeId(touch.insertBefore);
        if (typeof navigator.vibrate === 'function') navigator.vibrate(10);
      }, LONG_PRESS_MS);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!touch.id || e.touches.length === 0) return;
      const { clientX, clientY } = e.touches[0];
      if (!touch.active) {
        if (Math.abs(clientX - touch.startX) > MOVE_CANCEL_PX || Math.abs(clientY - touch.startY) > MOVE_CANCEL_PX) {
          clearTimer();
        }
        return;
      }
      e.preventDefault();
      const src = list.querySelector<HTMLElement>(`[data-flip-id="${CSS.escape(touch.id)}"]`);
      if (src) src.style.transform = `translateY(${clientY - touch.startY}px)`;
      const nextBoundary = boundaryAt(clientY);
      if (nextBoundary !== touch.insertBefore) {
        touch.insertBefore = nextBoundary;
        setDropBeforeId(nextBoundary);
      }
    };

    const finish = (commit: boolean) => {
      clearTimer();
      if (!touch.active) {
        touch.id = null;
        return;
      }
      const draggedId = touch.id;
      const insertBefore = touch.insertBefore;
      if (draggedId) {
        const src = list.querySelector<HTMLElement>(`[data-flip-id="${CSS.escape(draggedId)}"]`);
        if (src) src.style.transform = '';
      }
      touch.active = false;
      touch.id = null;
      touch.insertBefore = null;
      setDragId(null);
      setDropBeforeId(null);
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, SUPPRESS_CLICK_MS);
      if (commit && draggedId && draggedId !== insertBefore) {
        touchDropRef.current(draggedId, insertBefore);
      }
    };

    const onTouchEnd = () => finish(true);
    const onTouchCancel = () => finish(false);

    list.addEventListener('touchstart', onTouchStart, { passive: true });
    list.addEventListener('touchmove', onTouchMove, { passive: false });
    list.addEventListener('touchend', onTouchEnd);
    list.addEventListener('touchcancel', onTouchCancel);
    return () => {
      clearTimer();
      list.removeEventListener('touchstart', onTouchStart);
      list.removeEventListener('touchmove', onTouchMove);
      list.removeEventListener('touchend', onTouchEnd);
      list.removeEventListener('touchcancel', onTouchCancel);
    };
    // state.todos.length 变化会重建 .todo-list（空态时该节点不存在），需重挂监听
  }, [state.todos.length]);

  const wrappedToggle = (id: string) => {
    if (!consumeSuppress()) toggleTodoStatus(id);
  };

  const wrappedDelete = (id: string) => {
    if (!consumeSuppress()) deleteTodo(id);
  };

  const wrappedEdit = (todo: Todo) => {
    if (!consumeSuppress()) onEdit(todo);
  };

  const wrappedDetail = (todo: Todo) => {
    if (!consumeSuppress()) onDetail(todo);
  };

  const pendingCount = state.todos.filter((t) => t.status === 'pending').length;
  const pendingByGroup = (groupId: string) =>
    state.todos.filter((t) => t.status === 'pending' && t.groupId === groupId).length;

  const filteredTodos =
    selectedGroupId === 'all'
      ? state.todos
      : state.todos.filter((todo) => todo.groupId === selectedGroupId);

  if (state.todos.length === 0) {
    return (
      <>
        <div className="group-filter">
          <button className="group-filter-item active" onClick={() => setSelectedGroupId('all')}>
            <span className="tab-no">00</span> All
            <span className="tab-cn">全部</span>
            <span className="tab-count">00</span>
          </button>
        </div>
        <div className="todo-list-empty">
          <p>Nothing here yet</p>
          <p>点击右下 ADD TASK 添加待办</p>
        </div>
      </>
    );
  }

  return (
    <>
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
      <div className="todo-list" ref={listRef}>
        {filteredTodos.map((todo, index) => (
          <div
            key={todo.id}
            className={`todo-wrap ${dragId === todo.id ? 'drag-src' : ''} ${
              dropBeforeId === todo.id && dragId !== todo.id ? 'drop-before' : ''
            } ${
              dropBeforeId === null && dragId !== null && dragId !== todo.id && index === filteredTodos.length - 1
                ? 'drop-after'
                : ''
            }`}
            data-flip-id={todo.id}
            onDragStart={(e) => handleDragStart(e, todo.id)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, todo.id)}
          >
            <TodoCard
              todo={todo}
              onToggle={wrappedToggle}
              onDelete={wrappedDelete}
              onEdit={wrappedEdit}
              onDetail={wrappedDetail}
            />
          </div>
        ))}
      </div>
    </>
  );
}
