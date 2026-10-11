import { useState } from 'react';
import { TodoProvider, useTodos } from './context/TodoContext';
import { GroupProvider } from './context/GroupContext';
import { SyncProvider, useSync } from './context/SyncContext';
import { TodoList } from './components/TodoList';
import { Odometer } from './components/Odometer';
import { IconGroups } from './components/Icons';
import { AddTodoModal } from './components/AddTodoModal';
import { EditTodoModal } from './components/EditTodoModal';
import { TodoDetailModal } from './components/TodoDetailModal';
import { GroupManagerModal } from './components/GroupManagerModal';
import { SyncSettingsModal } from './components/SyncSettingsModal';
import type { Todo } from './types';
import './styles/index.css';

function syncLabel(state: string, at: number): string {
  if (state === 'SYNCED') {
    const d = new Date(at);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `SYNCED ${hh}:${mm}`;
  }
  if (state === 'SYNCING') return 'SYNCING…';
  if (state === 'OFF') return '同步 OFF';
  return state;
}

function AppContent(): JSX.Element {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isGroupManagerOpen, setIsGroupManagerOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [detailTodo, setDetailTodo] = useState<Todo | null>(null);
  const { state, deleteTodo } = useTodos();
  const { status } = useSync();

  const pendingCount = state.todos.filter((t) => t.status === 'pending').length;
  const completedCount = state.todos.length - pendingCount;
  const pad = (n: number) => String(n).padStart(2, '0');

  const handleAddTodo = () => setIsAddModalOpen(true);

  const handleEditTodo = (todo: Todo) => {
    setEditingTodo(todo);
    setIsEditModalOpen(true);
  };

  const handleDetailTodo = (todo: Todo) => {
    setDetailTodo(todo);
    setIsDetailModalOpen(true);
  };

  const handleDetailEdit = (todo: Todo) => {
    setIsDetailModalOpen(false);
    setDetailTodo(null);
    setEditingTodo(todo);
    setIsEditModalOpen(true);
  };

  const handleDetailDelete = (id: string) => {
    deleteTodo(id);
    setIsDetailModalOpen(false);
    setDetailTodo(null);
  };

  return (
    <div className="app-container">
      <div className="window-controls">
        <div className="main-actions">
          <button className="window-button group-manager-nav" onClick={() => setIsGroupManagerOpen(true)} aria-label="分组管理" title="分组管理">
            <IconGroups />
          </button>
        </div>
        <span className="title-brand">HengSch Todo</span>
        <div className="window-controls-right" />
      </div>
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
      <footer className="page-footer">
        <span className="foot-count">
          <b>{pad(pendingCount)}</b> Pending · <b>{pad(completedCount)}</b> Completed ·{' '}
          <b>{pad(state.todos.length)}</b> Total
        </span>
        <button
          className={`foot-sync ${status.state === 'AUTH ERROR' || status.state === 'REMOTE ERROR' || status.state === 'OFFLINE' ? 'error' : ''} ${status.state === 'SYNCING' ? 'busy' : ''}`}
          onClick={() => setIsSyncModalOpen(true)}
          title="同步设置"
        >
          {syncLabel(status.state, status.at)}
        </button>
        <button className="footer-add" onClick={handleAddTodo}>
          + Add Task
        </button>
      </footer>
      <AddTodoModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />
      <EditTodoModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingTodo(null);
        }}
        todo={editingTodo}
      />
      <TodoDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setDetailTodo(null);
        }}
        todo={detailTodo}
        onEdit={handleDetailEdit}
        onDelete={handleDetailDelete}
      />
      <GroupManagerModal isOpen={isGroupManagerOpen} onClose={() => setIsGroupManagerOpen(false)} />
      <SyncSettingsModal isOpen={isSyncModalOpen} onClose={() => setIsSyncModalOpen(false)} />
    </div>
  );
}

function App(): JSX.Element {
  return (
    <GroupProvider>
      <TodoProvider>
        <SyncProvider>
          <AppContent />
        </SyncProvider>
      </TodoProvider>
    </GroupProvider>
  );
}

export default App;
