import React from 'react';
import { useTodos } from '../context/TodoContext';
import { TodoEditorModal, type TodoEditorValues } from './TodoEditorModal';

interface AddTodoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddTodoModal({ isOpen, onClose }: AddTodoModalProps): React.ReactElement {
  const { addTodo } = useTodos();

  const handleSubmit = (values: TodoEditorValues): void => {
    if (values.type === 'recurring') {
      addTodo({
        title: values.title,
        description: values.description,
        type: 'recurring',
        status: values.status,
        groupId: values.groupId,
        cycleType: values.cycleType,
        customCycleDays: values.customCycleDays,
        nextDueDate: Date.now(),
        completedAt: values.status === 'completed' ? Date.now() : undefined
      });
    } else {
      addTodo({
        title: values.title,
        description: values.description,
        type: 'once',
        status: values.status,
        groupId: values.groupId,
        completedAt: values.status === 'completed' ? Date.now() : undefined
      });
    }

    onClose();
  };

  return (
    <TodoEditorModal
      isOpen={isOpen}
      mode="create"
      onClose={onClose}
      onSubmit={handleSubmit}
    />
  );
}
