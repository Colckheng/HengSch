import { useState } from 'react';
import { WindowControls } from './components/WindowControls';
import { AddTodoModal } from './components/AddTodoModal';
import { EditTodoModal } from './components/EditTodoModal';
import { GroupManagerModal } from './components/GroupManagerModal';
import { TodoDetailModal } from './components/TodoDetailModal';
import { TodoList } from './components/TodoList';
import { GroupProvider, useGroups } from './context/GroupContext';
import { TodoProvider, useTodos } from './context/TodoContext';
import { WindowProvider, useWindow } from './context/WindowContext';
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
  const { state: todoState } = useTodos();
  const { state: groupState } = useGroups();

  const pendingCount = todoState.todos.filter((todo) => todo.status === 'pending').length;
  const completedCount = todoState.todos.filter((todo) => todo.status === 'completed').length;
  const customGroupCount = Math.max(groupState.groups.length - 1, 0);
  const isEmptyState = todoState.todos.length === 0;

  const heroDescription =
    pendingCount > 0
      ? `还有 ${pendingCount} 件事情在排队，先推进最重要的一件。`
      : '今天还没有安排，先从最重要的一件开始。';

  const openAddModal = (): void => {
    setIsAddModalOpen(true);
  };

  const openEditModal = (todo: Todo): void => {
    setEditingTodo(todo);
    setIsEditModalOpen(true);
  };

  const openDetailModal = (todo: Todo): void => {
    setDetailTodo(todo);
    setIsDetailModalOpen(true);
  };

  return (
    <div className={`app-container ${isCompactMode ? 'compact' : ''}`}>
      {!isCompactMode && (
        <header className="window-toolbar">
          <div className="toolbar-brand">
            <div className="toolbar-brand-mark" aria-hidden="true">
              <svg className="toolbar-brand-glyph toolbar-brand-glyph-hst" viewBox="0 0 96 64">
                <path d="M16 18v28" />
                <path d="M32 18v28" />
                <path d="M16 32h16" />
                <path d="M54 21c-6.4 0-10.6 3.1-10.6 7.7 0 9.9 17.4 5.5 17.4 13.3 0 3.8-3.3 6.3-8.1 6.3-4.2 0-7.7-1.7-10-4.6" />
                <path d="M58.2 23.1c-1.8-1.5-4.4-2.1-7.1-2.1" />
                <path d="M67 20h20" />
                <path d="M77 20v27" />
              </svg>
            </div>
            <div className="toolbar-brand-copy">
              <h1>HengSch Todo</h1>
              <p>桌面待办助手</p>
            </div>
          </div>

          <div className="toolbar-primary-actions">
            <button className="toolbar-button toolbar-button-primary" onClick={openAddModal}>
              <span className="toolbar-button-inner">
                <span className="toolbar-button-glyph" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M12 5v14" />
                    <path d="M5 12h14" />
                  </svg>
                </span>
                <span className="toolbar-button-label">新建</span>
              </span>
            </button>
            <button className="toolbar-button toolbar-button-secondary" onClick={() => setIsGroupManagerOpen(true)}>
              <span className="toolbar-button-inner">
                <span className="toolbar-button-glyph" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <rect x="4.5" y="5.5" width="6" height="6" rx="1.6" />
                    <rect x="13.5" y="5.5" width="6" height="6" rx="1.6" />
                    <rect x="9" y="13" width="6" height="6" rx="1.6" />
                  </svg>
                </span>
                <span className="toolbar-button-label">分组</span>
              </span>
            </button>
          </div>

          <div className="window-controls-right">
            <WindowControls />
          </div>
        </header>
      )}

      {isCompactMode && <div className="compact-drag-area" />}

      <main className="content">
        {!isCompactMode && (
          <section className={`workspace-hero ${isEmptyState ? 'is-empty' : ''}`}>
            <div className="workspace-hero-main">
              <div className="workspace-hero-copy-block">
                <h2>今天推进什么？</h2>
                <p className="workspace-hero-copy">
                  <span className="hero-count">{pendingCount} 件</span>
                  <span>{heroDescription}</span>
                </p>
              </div>

              <div className="hero-stats-grid" aria-label="任务概览">
                <article className="hero-stat-card tone-blue">
                  <div className="hero-stat-head">
                    <span className="hero-stat-badge" aria-hidden="true">
                      <svg viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="6.5" />
                      </svg>
                    </span>
                    <span className="hero-stat-kicker">当前任务</span>
                  </div>
                  <div className="hero-stat-content">
                    <strong>{pendingCount}</strong>
                    <span>进行中</span>
                  </div>
                  <p className="hero-stat-note">正在推进的事项</p>
                </article>

                <article className="hero-stat-card tone-green">
                  <div className="hero-stat-head">
                    <span className="hero-stat-badge" aria-hidden="true">
                      <svg viewBox="0 0 24 24">
                        <path d="M6.5 12.5l3.3 3.3 7.7-7.8" />
                      </svg>
                    </span>
                    <span className="hero-stat-kicker">完成记录</span>
                  </div>
                  <div className="hero-stat-content">
                    <strong>{completedCount}</strong>
                    <span>已完成</span>
                  </div>
                  <p className="hero-stat-note">已完成的事项</p>
                </article>

                <article className="hero-stat-card tone-purple">
                  <div className="hero-stat-head">
                    <span className="hero-stat-badge" aria-hidden="true">
                      <svg viewBox="0 0 24 24">
                        <path d="M12 4.8 19 8.3 12 11.8 5 8.3 12 4.8Z" />
                        <path d="M19 11.6 12 15.1 5 11.6" />
                        <path d="M19 14.9 12 18.4 5 14.9" />
                      </svg>
                    </span>
                    <span className="hero-stat-kicker">分类视图</span>
                  </div>
                  <div className="hero-stat-content">
                    <strong>{customGroupCount}</strong>
                    <span>自定义分组</span>
                  </div>
                  <p className="hero-stat-note">当前启用的分组</p>
                </article>
              </div>
            </div>
          </section>
        )}

        <section className="todo-container">
          <TodoList onEdit={openEditModal} onDetail={openDetailModal} />
        </section>
      </main>

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
      />
      <GroupManagerModal isOpen={isGroupManagerOpen} onClose={() => setIsGroupManagerOpen(false)} />
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
