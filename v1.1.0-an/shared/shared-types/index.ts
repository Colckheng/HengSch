export type TodoType = 'once' | 'recurring';

export type CycleType = 'daily' | 'weekly' | 'monthly' | 'custom';

export interface Group {
  id: string;
  name: string;
  color: string;
  createdAt: number;
}

export interface TodoItem {
  id: string;
  title: string;
  description?: string;
  type: TodoType;
  status: 'completed' | 'pending';
  createdAt: number;
  completedAt?: number;
  order: number;
  groupId?: string;
}

export interface RecurringTodo extends TodoItem {
  type: 'recurring';
  cycleType: CycleType;
  customCycleDays?: number;
  nextDueDate?: number;
}

export type Todo = TodoItem | RecurringTodo;
