// 从共享包导入类型
export type {
  TodoType,
  CycleType,
  Group,
  TodoItem,
  RecurringTodo,
  Todo
} from '@hengsch/shared-types';

// 窗口状态类型（仅桌面端使用，不共享）
export interface WindowState {
  isAlwaysOnTop: boolean;
  isMinimized: boolean;
  isCompactMode: boolean;
  width: number;
  height: number;
  x?: number;
  y?: number;
}