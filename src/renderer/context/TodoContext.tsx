import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import type { Todo, RecurringTodo } from '../types';

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
        todo.id === action.payload
          ? {
              ...todo,
              status: todo.status === 'completed' ? 'pending' : 'completed',
              completedAt: todo.status === 'completed' ? undefined : Date.now()
            }
          : todo
      );
      
      const toggledTodo = updatedTodos.find((t) => t.id === action.payload);
      if (toggledTodo && toggledTodo.type === 'recurring') {
        const recurringTodo = toggledTodo as RecurringTodo;
        if (toggledTodo.status === 'pending') {
          const now = Date.now();
          let nextDueDate: number | undefined;
          
          switch (recurringTodo.cycleType) {
            case 'daily':
              nextDueDate = now + 24 * 60 * 60 * 1000;
              break;
            case 'weekly':
              nextDueDate = now + 7 * 24 * 60 * 60 * 1000;
              break;
            case 'monthly':
              const nextMonth = new Date(now);
              nextMonth.setMonth(nextMonth.getMonth() + 1);
              nextDueDate = nextMonth.getTime();
              break;
            case 'custom':
              if (recurringTodo.customCycleDays) {
                nextDueDate = now + recurringTodo.customCycleDays * 24 * 60 * 60 * 1000;
              }
              break;
          }
          
          const todoIndex = updatedTodos.findIndex(t => t.id === toggledTodo.id);
          if (todoIndex !== -1) {
            updatedTodos[todoIndex] = { ...updatedTodos[todoIndex], nextDueDate };
          }
        }
      }
      
      const sortedTodos = [
        ...updatedTodos.filter((todo) => todo.status === 'pending'),
        ...updatedTodos.filter((todo) => todo.status === 'completed')
      ] as Todo[];
      return { ...state, todos: sortedTodos };
    default:
      return state;
  }
}

export function TodoProvider({ children }: { children: ReactNode }): JSX.Element {
  const [state, dispatch] = useReducer(todoReducer, { todos: [] });

  useEffect(() => {
    loadTodos();
  }, []);

  useEffect(() => {
    if (state.todos.length > 0) {
      saveTodos();
    }
  }, [state.todos]);

  const loadTodos = async () => {
    try {
      const savedTodos = await window.electronAPI.store.get('todos');
      if (savedTodos && Array.isArray(savedTodos)) {
        dispatch({ type: 'SET_TODOS', payload: savedTodos });
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

  const addTodo = (todoData: Omit<Todo, 'id' | 'createdAt' | 'order'>) => {
    const newTodo: Todo = {
      ...todoData,
      id: Date.now().toString(),
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