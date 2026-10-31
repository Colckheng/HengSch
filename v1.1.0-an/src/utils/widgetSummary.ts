import { NativeModules } from 'react-native';
import type { Todo } from '@hengsch/shared-types';

interface WidgetBridge {
  setSummary: (json: string) => void;
}

const bridge = NativeModules.WidgetBridge as WidgetBridge | undefined;

/**
 * 小组件只读摘要：待办数 + 前 3 条标题 + 更新时间。
 * 原生模块缺失（如开发环境未重新构建）时静默跳过，不影响主流程。
 */
export function syncWidgetSummary(todos: Todo[]): void {
  if (!bridge?.setSummary) return;
  const pending = todos.filter((todo) => !todo.deleted && todo.status === 'pending');
  const summary = {
    pendingCount: pending.length,
    topTitles: pending.slice(0, 3).map((todo) => todo.title),
    updatedAt: Date.now()
  };
  try {
    bridge.setSummary(JSON.stringify(summary));
  } catch {
    /* 小组件不可用时不影响应用 */
  }
}
