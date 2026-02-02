import { useState } from 'react';
import { TodoProvider } from './context/TodoContext';
import { WindowProvider, useWindow } from './context/WindowContext';
import { GroupProvider } from './context/GroupContext';
import { WindowControls } from './components/WindowControls';
import { TodoList } from './components/TodoList';
import { AddTodoModal } from './components/AddTodoModal';
import { EditTodoModal } from './components/EditTodoModal';
import { TodoDetailModal } from './components/TodoDetailModal';
import { GroupManagerModal } from './components/GroupManagerModal';
import type { Todo } from './types';
import './styles/index.css';

function AppContent(): JSX.Element {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isGroupManagerOpen, setIsGroupManagerOpen] = useState(false);
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [detailTodo, setDetailTodo] = useState<Todo | null>(null);
  const { isCompactMode } = useWindow();

  const handleAddTodo = () => {
    setIsAddModalOpen(true);
  };

  const handleEditTodo = (todo: Todo) => {
    setEditingTodo(todo);
    setIsEditModalOpen(true);
  };

  const handleDetailTodo = (todo: Todo) => {
    setDetailTodo(todo);
    setIsDetailModalOpen(true);
  };

  const handleCloseAddModal = () => {
    setIsAddModalOpen(false);
  };

  const handleCloseEditModal = () => {
    setIsEditModalOpen(false);
    setEditingTodo(null);
  };

  const handleCloseDetailModal = () => {
    setIsDetailModalOpen(false);
    setDetailTodo(null);
  };

  const handleOpenGroupManager = () => {
    setIsGroupManagerOpen(true);
  };

  const handleCloseGroupManager = () => {
    setIsGroupManagerOpen(false);
  };

  return (
    <div className={`app-container ${isCompactMode ? 'compact' : ''}`}>
      {!isCompactMode && (
        <div className="window-controls">
          <div className="main-actions">
            <button className="window-button add-todo-nav" onClick={handleAddTodo} aria-label="添加待办事项" title="添加待办事项">
              +
            </button>
            <button className="window-button group-manager-nav" onClick={handleOpenGroupManager} aria-label="分组管理" title="分组管理">
              📁
            </button>
          </div>
          <div className="window-controls-right">
            <WindowControls />
          </div>
        </div>
      )}
      {isCompactMode && (
        <div className="compact-drag-area"></div>
      )}
      <div className="content">
        <div className="todo-container">
          <TodoList onEdit={handleEditTodo} onDetail={handleDetailTodo} />
        </div>
      </div>
      <AddTodoModal isOpen={isAddModalOpen} onClose={handleCloseAddModal} />
      <EditTodoModal isOpen={isEditModalOpen} onClose={handleCloseEditModal} todo={editingTodo} />
      <TodoDetailModal isOpen={isDetailModalOpen} onClose={handleCloseDetailModal} todo={detailTodo} />
      <GroupManagerModal isOpen={isGroupManagerOpen} onClose={handleCloseGroupManager} />
    </div>
  );
}

function App(): JSX.Element {
  return (
    <WindowProvider>
      <GroupProvider>
        <TodoProvider>
          <AppContent />
        </TodoProvider>
      </GroupProvider>
    </WindowProvider>
  );
}

export default App;