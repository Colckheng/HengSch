import { useState } from 'react';
import { TodoProvider, useTodos } from './context/TodoContext';
import { WindowProvider, useWindow } from './context/WindowContext';
import { GroupProvider } from './context/GroupContext';
import { WindowControls } from './components/WindowControls';
import { TodoList } from './components/TodoList';
import { Odometer } from './components/Odometer';
import { IconPlus, IconGroups } from './components/Icons';
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
  const { state } = useTodos();

  const pendingCount = state.todos.filter((t) => t.status === 'pending').length;
  const completedCount = state.todos.length - pendingCount;
  const pad = (n: number) => String(n).padStart(2, '0');

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
              <IconPlus size={16} />
            </button>
            <button className="window-button group-manager-nav" onClick={handleOpenGroupManager} aria-label="分组管理" title="分组管理">
              <IconGroups />
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
        <header className="swiss-head">
          <Odometer value={pendingCount} />
          <div className="head-right">
            <span className="head-label">Tasks Remaining</span>
            <span className="head-sub">
              <i className="sq" />
              {pad(pendingCount)} pending · {pad(completedCount)} done
            </span>
          </div>
        </header>
        <div className="todo-container">
          <TodoList onEdit={handleEditTodo} onDetail={handleDetailTodo} />
        </div>
      </div>
      {!isCompactMode && (
        <footer className="page-footer">
          <span className="foot-count">
            <b>{pad(pendingCount)}</b> Pending · <b>{pad(completedCount)}</b> Completed ·{' '}
            <b>{pad(state.todos.length)}</b> Total
          </span>
          <button className="footer-add" onClick={handleAddTodo}>
            + Add Task
          </button>
        </footer>
      )}
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