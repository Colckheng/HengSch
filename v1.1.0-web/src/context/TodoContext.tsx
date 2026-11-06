import React, { createContext, useContext, useReducer, useEffect, useState, useRef, ReactNode } from 'react';
import type { Todo, RecurringTodo } from '../types';
import { toggleTodoStatus, sortTodosByStatus, generateTodoId, reorderTodosByIds } from '@hengsch/shared-logic';
import { storage } from '../utils/localStorageAdapter';
import { getDeviceId } from '../utils/device';

interface TodoState {
  /** 原始数组（含墓碑），负责持久化与同步 */
  todos: Todo[];
}

type TodoAction =
  | { type: 'SET_TODOS'; payload: Todo[] }
  | { type: 'ADD_TODO'; payload: Todo }
  | { type: 'UPDATE_TODO'; payload: { id: string; updates: Partial<Todo> } }
  | { type: 'DELETE_TODO'; payload: { id: string; updatedAt: number; deviceId: string } }
  | { type: 'REORDER_TODOS'; payload: { ids: string[]; updatedAt: number; deviceId: string } }
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
  dispatch: React.Dispatch<TodoAction>;
  addTodo: (todo: Omit<Todo, 'id' | 'createdAt' | 'order'> & Partial<Pick<RecurringTodo, 'cycleType' | 'customCycleDays' | 'nextDueDate'>>) => void;
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
      const { ids, updatedAt, deviceId } = action.payload;
      const reordered = reorderTodosByIds(state.todos, ids);
      if (reordered === state.todos) return state;
      const visible = state.todos.filter(isVisible);
      const normalizeOrder = visible.some((todo, index) => index > 0 && todo.order <= visible[index - 1].order);
      let rank = 0;
      // 重复或倒序键必须重编号，否则同步会撤销拖动；正常键沿用原槽位。
      const todos = reordered.map((todo, index) => {
        if (todo.deleted) return todo;
        const order = normalizeOrder ? rank++ : state.todos[index].order;
        return todo.order !== order ? { ...todo, order, updatedAt, deviceId } : todo;
      });
      return { ...state, todos };
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
  const deviceIdRef = useRef<string>('local');

  useEffect(() => {
    (async () => {
      try {
        deviceIdRef.current = await getDeviceId();
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
      const savedTodos = await storage.get<Todo[]>('todos');
      if (savedTodos && Array.isArray(savedTodos)) {
        const filled = savedTodos.map(fillSyncMeta);
        // 一次性把 order 与数组位置对齐（存量数据的 order 是创建序，与展示序不一致）
        const orderMigrated = await storage.get<boolean>('syncOrderMigrated');
        const migrated = orderMigrated ? filled : filled.map((todo, index) => ({ ...todo, order: index }));
        if (!orderMigrated) await storage.set('syncOrderMigrated', true);
        dispatch({ type: 'SET_TODOS', payload: migrated });
      }
    } catch (error) {
      console.error('Failed to load todos:', error);
    }
  };

  const saveTodos = async () => {
    try {
      await storage.set('todos', state.todos);
    } catch (error) {
      console.error('Failed to save todos:', error);
    }
  };

  const addTodo = (todoData: Omit<Todo, 'id' | 'createdAt' | 'order'> & Partial<Pick<RecurringTodo, 'cycleType' | 'customCycleDays' | 'nextDueDate'>>) => {
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
    dispatch({
      type: 'REORDER_TODOS',
      payload: { ids: todos.map(todo => todo.id), updatedAt: Date.now(), deviceId: deviceIdRef.current }
    });
  };

  const visibleTodos = state.todos.filter(isVisible);

  const applySyncedTodos = (todos: Todo[]) => {
    dispatch({ type: 'SET_TODOS', payload: todos });
  };

  return (
    <TodoContext.Provider
      value={{
        state: { todos: visibleTodos },
        allTodos: state.todos,
        isInitialized,
        applySyncedTodos,
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
