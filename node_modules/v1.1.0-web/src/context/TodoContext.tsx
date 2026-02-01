import React, { createContext, useContext, useReducer, useEffect, useState, ReactNode } from 'react';
import type { Todo, RecurringTodo } from '@hengsch/shared-types';
import { toggleTodoStatus, sortTodosByStatus, generateTodoId } from '@hengsch/shared-logic';
import { storage } from '../utils/localStorageAdapter';

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
  dispatch: React.Dispatch<TodoAction>;
  addTodo: (todo: Omit<Todo, 'id' | 'createdAt' | 'order'> & Partial<Pick<RecurringTodo, 'cycleType' | 'customCycleDays' | 'nextDueDate'>>) => void;
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
        todos: state.todos.map((todo) =>
          todo.id === action.payload.id ? { ...todo, ...action.payload.updates } : todo
        )
      };
    case 'DELETE_TODO':
      return {
        ...state,
        todos: state.todos.filter((todo) => todo.id !== action.payload)
      };
    case 'REORDER_TODOS':
      return { ...state, todos: action.payload };
    case 'TOGGLE_TODO_STATUS':
      const updatedTodos = state.todos.map((todo) =>
        todo.id === action.payload ? toggleTodoStatus(todo) : todo
      );
      const sortedTodos = sortTodosByStatus(updatedTodos);
      return { ...state, todos: sortedTodos };
    default:
      return state;
  }
}

export function TodoProvider({ children }: { children: ReactNode }): JSX.Element {
  const [state, dispatch] = useReducer(todoReducer, { todos: [] });
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    loadTodos().then(() => setIsInitialized(true));
  }, []);

  useEffect(() => {
    if (isInitialized) saveTodos();
  }, [state.todos, isInitialized]);

  const loadTodos = async () => {
    try {
      const savedTodos = await storage.get<Todo[]>('todos');
      if (savedTodos && Array.isArray(savedTodos)) {
        dispatch({ type: 'SET_TODOS', payload: savedTodos });
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

  const addTodo = (todoData: Omit<Todo, 'id' | 'createdAt' | 'order'>) => {
    const newTodo: Todo = {
      ...todoData,
      id: generateTodoId(),
      createdAt: Date.now(),
      order: state.todos.length
    };
    dispatch({ type: 'ADD_TODO', payload: newTodo });
  };

  const updateTodo = (id: string, updates: Partial<Todo>) => {
    dispatch({ type: 'UPDATE_TODO', payload: { id, updates } });
  };

  const deleteTodo = (id: string) => {
    dispatch({ type: 'DELETE_TODO', payload: id });
  };

  const toggleTodoStatus = (id: string) => {
    dispatch({ type: 'TOGGLE_TODO_STATUS', payload: id });
  };

  const reorderTodos = (todos: Todo[]) => {
    dispatch({ type: 'REORDER_TODOS', payload: todos });
  };

  return (
    <TodoContext.Provider
      value={{
        state,
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

export function useTodos(): TodoContextType {
  const context = useContext(TodoContext);
  if (context === undefined) {
    throw new Error('useTodos must be used within a TodoProvider');
  }
  return context;
}
