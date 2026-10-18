import React, { createContext, useContext, useReducer, useEffect, useState, useRef, ReactNode } from 'react';
import type { Todo, RecurringTodo } from '../types';
import { toggleTodoStatus, sortTodosByStatus, generateTodoId, pickWinner } from '@hengsch/shared-logic';

interface TodoState {
  /** 原始数组（含墓碑），负责持久化与同步 */
  todos: Todo[];
}

type TodoAction =
  | { type: 'SET_TODOS'; payload: Todo[] }
  | { type: 'MERGE_TODOS'; payload: Todo[] }
  | { type: 'ADD_TODO'; payload: Todo }
  | { type: 'UPDATE_TODO'; payload: { id: string; updates: Partial<Todo> } }
  | { type: 'DELETE_TODO'; payload: { id: string; updatedAt: number; deviceId: string } }
  | { type: 'REORDER_TODOS'; payload: Todo[] }
  | { type: 'TOGGLE_TODO_STATUS'; payload: { id: string; updatedAt: number; deviceId: string } };

interface TodoContextType {
  /** 可见任务（已过滤墓碑），展示用 */
  state: TodoState;
  /** 原始任务（含墓碑），持久化/同步用 */
  allTodos: Todo[];
  /** 初始加载完成（同步首拍需等待，避免被启动加载覆盖） */
  isInitialized: boolean;
  /** 云同步合并结果整体应用（全量覆盖原始数组） */
  applySyncedTodos: (todos: Todo[]) => void;
  /** 今日监测进度（按 todoId），主进程推送 */
  monitorProgress: Record<string, { ms: number; notified: boolean }>;
  setMonitorProgress: (progress: Record<string, { ms: number; notified: boolean }>) => void;
  /** 监测达标：仅 pending 时标记完成（防重复/防过期状态） */
  completeByMonitor: (id: string) => void;
  /** 进程结束询问答「还没做」：仅自动完成时撤销回待办（手动完成不撤） */
  revertByMonitor: (id: string) => void;
  dispatch: React.Dispatch<TodoAction>;
  addTodo: (todo: Omit<Todo, 'id' | 'createdAt' | 'order'> & Partial<Pick<RecurringTodo, 'cycleType' | 'customCycleDays' | 'nextDueDate' | 'monitor'>>) => void;
  updateTodo: (id: string, updates: Partial<Todo>) => void;
  deleteTodo: (id: string) => void;
  toggleTodoStatus: (id: string) => void;
  reorderTodos: (todos: Todo[]) => void;
}

const TodoContext = createContext<TodoContextType | undefined>(undefined);

const isVisible = (todo: Todo): boolean => !todo.deleted;

function fillSyncMeta<T extends Todo>(todo: T): T {
  return {
    ...todo,
    updatedAt:
      typeof todo.updatedAt === 'number'
        ? todo.updatedAt
        : typeof todo.createdAt === 'number'
          ? todo.createdAt
          : Date.now(),
    deviceId: typeof todo.deviceId === 'string' ? todo.deviceId : 'legacy'
  };
}

function todoReducer(state: TodoState, action: TodoAction): TodoState {
  switch (action.type) {
    case 'MERGE_TODOS': {
      const merged = new Map(state.todos.map(todo => [todo.id, todo]));
      for (const todo of action.payload) merged.set(todo.id, pickWinner(merged.get(todo.id), todo)!);
      return { ...state, todos: [...merged.values()].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) };
    }
    case 'SET_TODOS':
      return { ...state, todos: action.payload };
    case 'ADD_TODO':
      return { ...state, todos: [...state.todos, action.payload] };
    case 'UPDATE_TODO':
      return {
        ...state,
        todos: state.todos.map((todo) =>
          todo.id === action.payload.id ? { ...todo, ...action.payload.updates } : todo
        )
      };
    case 'DELETE_TODO': {
      const { id, updatedAt, deviceId } = action.payload;
      return {
        ...state,
        todos: state.todos.map((todo) =>
          todo.id === id && !todo.deleted ? { ...todo, deleted: true, updatedAt, deviceId } : todo
        )
      };
    }
    case 'REORDER_TODOS': {
      const reordered = action.payload.filter(isVisible);
      const tombstones = state.todos.filter((todo) => !isVisible(todo));
      return { ...state, todos: [...reordered, ...tombstones] };
    }
    case 'TOGGLE_TODO_STATUS': {
      const { id, updatedAt, deviceId } = action.payload;
      const visible = state.todos.filter(isVisible);
      const toggled = visible.map((todo) =>
        todo.id === id ? { ...toggleTodoStatus(todo), updatedAt, deviceId } : todo
      );
      const sorted = sortTodosByStatus(toggled);
      // 位置变化的记录也要盖章，否则其他设备拿不到新顺序
      const withOrder = sorted.map((todo, index) =>
        todo.order === index ? todo : { ...todo, order: index, updatedAt, deviceId }
      );
      const tombstones = state.todos.filter((todo) => !isVisible(todo));
      return { ...state, todos: [...withOrder, ...tombstones] };
    }
    default:
      return state;
  }
}

export function TodoProvider({ children }: { children: ReactNode }): JSX.Element {
  const [state, dispatch] = useReducer(todoReducer, { todos: [] });
  const [isInitialized, setIsInitialized] = useState(false);
  const [monitorProgress, setMonitorProgress] = useState<Record<string, { ms: number; notified: boolean }>>({});
  const deviceIdRef = useRef<string>('local');
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    (async () => {
      try {
        const info = await window.electronAPI.sync?.deviceInfo?.();
        if (info?.deviceId) deviceIdRef.current = info.deviceId;
      } catch (error) {
        console.error('Failed to get deviceId:', error);
      }
      await loadTodos();
      setIsInitialized(true);
    })();
  }, []);

  useEffect(() => {
    if (isInitialized) saveTodos();
  }, [state.todos, isInitialized]); // eslint-disable-line react-hooks/exhaustive-deps -- saveTodos 每次渲染重建，加入会导致重复写盘

  const loadTodos = async () => {
    try {
      const savedTodos = await window.electronAPI.store.get('todos');
      if (savedTodos && Array.isArray(savedTodos)) {
        const filled = (savedTodos as Todo[]).map(fillSyncMeta);
        // 一次性把 order 与数组位置对齐（存量数据的 order 是创建序，与展示序不一致）
        const orderMigrated = await window.electronAPI.store.get('syncOrderMigrated');
        const migrated = orderMigrated ? filled : filled.map((todo, index) => ({ ...todo, order: index }));
        if (!orderMigrated) await window.electronAPI.store.set('syncOrderMigrated', true);
        dispatch({ type: 'SET_TODOS', payload: migrated });
      }
    } catch (error) {
      console.error('Failed to load todos:', error);
    }
  };

  const saveTodos = async () => {
    try {
      await window.electronAPI.store.set('todos', state.todos);
    } catch (error) {
      console.error('Failed to save todos:', error);
    }
  };

  const addTodo = (todoData: Omit<Todo, 'id' | 'createdAt' | 'order'> & Partial<Pick<RecurringTodo, 'cycleType' | 'customCycleDays' | 'nextDueDate' | 'monitor'>>) => {
    const visibleTodos = state.todos.filter(isVisible);
    const maxOrder = visibleTodos.reduce((max, todo) => Math.max(max, todo.order), -1);
    const newTodo: Todo = {
      ...todoData,
      id: generateTodoId(),
      createdAt: Date.now(),
      order: maxOrder + 1,
      updatedAt: Date.now(),
      deviceId: deviceIdRef.current
    };
    dispatch({ type: 'ADD_TODO', payload: newTodo });
  };

  const updateTodo = (id: string, updates: Partial<Todo>) => {
    dispatch({
      type: 'UPDATE_TODO',
      payload: {
        id,
        updates: { ...updates, updatedAt: Date.now(), deviceId: deviceIdRef.current }
      }
    });
  };

  const deleteTodo = (id: string) => {
    dispatch({
      type: 'DELETE_TODO',
      payload: { id, updatedAt: Date.now(), deviceId: deviceIdRef.current }
    });
  };

  const toggleTodoStatus = (id: string) => {
    dispatch({
      type: 'TOGGLE_TODO_STATUS',
      payload: { id, updatedAt: Date.now(), deviceId: deviceIdRef.current }
    });
  };

  const reorderTodos = (todos: Todo[]) => {
    const updatedAt = Date.now();
    const deviceId = deviceIdRef.current;
    // 只有顺序真正变化的记录才盖章，避免拖拽把无关任务的版本顶掉
    const stamped = todos
      .filter(isVisible)
      .map((todo, index) =>
        todo.order === index ? todo : { ...todo, order: index, updatedAt, deviceId }
      );
    dispatch({ type: 'REORDER_TODOS', payload: stamped });
  };

  const completeByMonitor = (id: string) => {
    const todo = stateRef.current.todos.find((t) => t.id === id);
    if (!todo || todo.status !== 'pending') return;
    dispatch({
      type: 'TOGGLE_TODO_STATUS',
      payload: { id, updatedAt: Date.now(), deviceId: deviceIdRef.current }
    });
  };

  const revertByMonitor = (id: string) => {
    const todo = stateRef.current.todos.find((t) => t.id === id);
    if (!todo || todo.status !== 'completed') return;
    dispatch({
      type: 'TOGGLE_TODO_STATUS',
      payload: { id, updatedAt: Date.now(), deviceId: deviceIdRef.current }
    });
  };

  const visibleTodos = state.todos.filter(isVisible);

  const applySyncedTodos = (todos: Todo[]) => {
    dispatch({ type: 'MERGE_TODOS', payload: todos });
  };

  return (
    <TodoContext.Provider
      value={{
        state: { todos: visibleTodos },
        allTodos: state.todos,
        isInitialized,
        applySyncedTodos,
        monitorProgress,
        setMonitorProgress,
        completeByMonitor,
        revertByMonitor,
        dispatch,
        addTodo,
        updateTodo,
        deleteTodo,
        toggleTodoStatus,
        reorderTodos
      }}
    >
      {children}
    </TodoContext.Provider>
  );
}

export function useTodos(): TodoContextType { // eslint-disable-line react-refresh/only-export-components -- Provider+Hook 同文件是 React 标准模式
  const context = useContext(TodoContext);
  if (context === undefined) {
    throw new Error('useTodos must be used within a TodoProvider');
  }
  return context;
}
