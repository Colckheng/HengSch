import React from 'react';
import { Alert } from 'react-native';
import type { RecurringTodo, Todo } from '@hengsch/shared-types';
import { useTodos } from '../context/TodoContext';
import { TodoEditorModal, type TodoEditorValues } from './TodoEditorModal';

interface EditTodoModalProps {
  isOpen: boolean;
  onClose: () => void;
  todo: Todo | null;
}

export function EditTodoModal({ isOpen, onClose, todo }: EditTodoModalProps): React.ReactElement {
  const { deleteTodo, updateTodo } = useTodos();

  const handleSubmit = (values: TodoEditorValues): void => {
    if (!todo) {
      return;
    }

    const completedAt =
      values.status === 'completed' ? todo.completedAt ?? Date.now() : undefined;

    const updates: Partial<Todo> & {
      cycleType?: RecurringTodo['cycleType'];
      customCycleDays?: number;
      nextDueDate?: number;
    } = {
      title: values.title,
      description: values.description,
      type: values.type,
      status: values.status,
      groupId: values.groupId,
      completedAt
    };

    if (values.type === 'recurring') {
      updates.cycleType = values.cycleType;
      updates.customCycleDays = values.customCycleDays;
      updates.nextDueDate =
        todo.type === 'recurring' ? (todo as RecurringTodo).nextDueDate : Date.now();
    } else {
      updates.cycleType = undefined;
      updates.customCycleDays = undefined;
      updates.nextDueDate = undefined;
    }

    updateTodo(todo.id, updates);
    onClose();
  };

  const handleDelete = (): void => {
    if (!todo) {
      return;
    }

    Alert.alert('删除待办', '确定要删除这条待办事项吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          deleteTodo(todo.id);
          onClose();
        }
      }
    ]);
  };

  return (
    <TodoEditorModal
      isOpen={isOpen}
      mode="edit"
      todo={todo}
      onClose={onClose}
      onSubmit={handleSubmit}
      onDelete={handleDelete}
    />
  );
}
