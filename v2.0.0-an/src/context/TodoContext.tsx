import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  type ReactNode
} from 'react';
import {
  generateTodoId,
  sortTodosByStatus,
  toggleTodoStatus as toggleTodoStatusLogic
} from '@hengsch/shared-logic';
import type { RecurringTodo, Todo } from '@hengsch/shared-types';
import { storage } from '../utils/asyncStorageAdapter';

interface TodoState {
  todos: Todo[];
}

type TodoAction =
  | { type: 'SET_TODOS'; payload: Todo[] }
  | { type: 'ADD_TODO'; payload: Todo }
  | { type: 'UPDATE_TODO'; payload: { id: string; updates: Partial<Todo> } }
  | { type: 'DELETE_TODO'; payload: string }
  | { type: 'REORDER_TODOS'; payload: Todo[] }
  | { type: 'TOGGLE_TODO_STATUS'; payload: string };

interface TodoContextType {
  state: TodoState;
  addTodo: (
    todo: Omit<Todo, 'id' | 'createdAt' | 'order'> &
      Partial<Pick<RecurringTodo, 'cycleType' | 'customCycleDays' | 'nextDueDate'>>
  ) => void;
  updateTodo: (id: string, updates: Partial<Todo>) => void;
  deleteTodo: (id: string) => void;
  toggleTodoStatus: (id: string) => void;
  reorderTodos: (todos: Todo[]) => void;
}

const TodoContext = createContext<TodoContextType | undefined>(undefined);

function todoReducer(state: TodoState, action: TodoAction): TodoState {
  switch (action.type) {
    case 'SET_TODOS':
      return { ...state, todos: action.payload };
    case 'ADD_TODO':
      return { ...state, todos: [...state.todos, action.payload] };
    case 'UPDATE_TODO':
      return {
        ...state,
        todos: state.todos.map((todo) => {
          if (todo.id !== action.payload.id) {
            return todo;
          }

          const nextTodo = { ...todo, ...action.payload.updates } as Todo & Partial<RecurringTodo>;

          if (action.payload.updates.type === 'once') {
            delete nextTodo.cycleType;
            delete nextTodo.customCycleDays;
            delete nextTodo.nextDueDate;
          }

          return nextTodo as Todo;
        })
      };
    case 'DELETE_TODO':
      return { ...state, todos: state.todos.filter((todo) => todo.id !== action.payload) };
    case 'REORDER_TODOS':
      return { ...state, todos: action.payload };
    case 'TOGGLE_TODO_STATUS': {
      const updatedTodos = state.todos.map((todo) =>
        todo.id === action.payload ? toggleTodoStatusLogic(todo) : todo
      );
      return { ...state, todos: sortTodosByStatus(updatedTodos) };
    }
    default:
      return state;
  }
}

export function TodoProvider({ children }: { children: ReactNode }): React.ReactElement {
  const [state, dispatch] = useReducer(todoReducer, { todos: [] });
  const isLoadedRef = useRef(false);

  const loadTodos = useCallback(async () => {
    try {
      const savedTodos = await storage.get<Todo[]>('todos');
      if (savedTodos && Array.isArray(savedTodos)) {
        dispatch({ type: 'SET_TODOS', payload: savedTodos });
      }
    } catch (error) {
      console.error('Failed to load todos:', error);
    } finally {
      isLoadedRef.current = true;
    }
  }, []);

  const saveTodos = useCallback(async () => {
    try {
      await storage.set('todos', state.todos);
    } catch (error) {
      console.error('Failed to save todos:', error);
    }
  }, [state.todos]);

  useEffect(() => {
    void loadTodos();
  }, [loadTodos]);

  useEffect(() => {
    if (isLoadedRef.current) {
      void saveTodos();
    }
  }, [saveTodos]);

  const addTodo = (
    todoData: Omit<Todo, 'id' | 'createdAt' | 'order'> &
      Partial<Pick<RecurringTodo, 'cycleType' | 'customCycleDays' | 'nextDueDate'>>
  ): void => {
    const newTodo: Todo = {
      ...todoData,
      id: generateTodoId(),
      createdAt: Date.now(),
      order: state.todos.length,
      type: todoData.type || 'once'
    } as Todo;

    if (todoData.type === 'recurring' && 'cycleType' in todoData) {
      (newTodo as RecurringTodo).cycleType = todoData.cycleType || 'daily';
      (newTodo as RecurringTodo).customCycleDays = todoData.customCycleDays;
      (newTodo as RecurringTodo).nextDueDate = todoData.nextDueDate;
    }

    dispatch({ type: 'ADD_TODO', payload: newTodo });
  };

  const updateTodo = (id: string, updates: Partial<Todo>): void => {
    dispatch({ type: 'UPDATE_TODO', payload: { id, updates } });
  };

  const deleteTodo = (id: string): void => {
    dispatch({ type: 'DELETE_TODO', payload: id });
  };

  const toggleTodoStatus = (id: string): void => {
    dispatch({ type: 'TOGGLE_TODO_STATUS', payload: id });
  };

  const reorderTodos = (todos: Todo[]): void => {
    dispatch({ type: 'REORDER_TODOS', payload: todos });
  };

  return (
    <TodoContext.Provider
      value={{ state, addTodo, updateTodo, deleteTodo, toggleTodoStatus, reorderTodos }}
    >
      {children}
    </TodoContext.Provider>
  );
}

export function useTodos(): TodoContextType {
  const context = useContext(TodoContext);

  if (!context) {
    throw new Error('useTodos must be used within a TodoProvider');
  }

  return context;
}
