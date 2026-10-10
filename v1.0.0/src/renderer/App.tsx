import { useState, useEffect, useRef } from 'react';
import { TodoProvider, useTodos } from './context/TodoContext';
import { WindowProvider, useWindow } from './context/WindowContext';
import { GroupProvider, useGroups } from './context/GroupContext';
import { WindowControls } from './components/WindowControls';
import { TodoList } from './components/TodoList';
import { Odometer } from './components/Odometer';
import { IconPlus, IconGroups } from './components/Icons';
import { AddTodoModal } from './components/AddTodoModal';
import { EditTodoModal } from './components/EditTodoModal';
import { TodoDetailModal } from './components/TodoDetailModal';
import { GroupManagerModal } from './components/GroupManagerModal';
import { SyncSettingsModal } from './components/SyncSettingsModal';
import type { Todo, RecurringTodo } from './types';
import type { SyncStatus } from '@hengsch/shared-types';
import './styles/index.css';

function syncLabel(status: SyncStatus): string {
  if (status.state === 'SYNCED') {
    const d = new Date(status.at);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `SYNCED ${hh}:${mm}`;
  }
  if (status.state === 'SYNCING') return 'SYNCING…';
  if (status.state === 'OFF') return '同步 OFF';
  return status.state;
}

function AppContent(): JSX.Element {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isGroupManagerOpen, setIsGroupManagerOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [detailTodo, setDetailTodo] = useState<Todo | null>(null);
  const { isCompactMode } = useWindow();
  const { state, completeByMonitor, setMonitorProgress, allTodos, isInitialized: todosReady, applySyncedTodos } = useTodos();
  const { allGroups, isInitialized: groupsReady, applySyncedGroups } = useGroups();
  const bootSyncedRef = useRef(false);

  // 监测配置随任务变化推送给主进程
  useEffect(() => {
    const entries = state.todos
      .filter((t): t is RecurringTodo => t.type === 'recurring' && Boolean((t as RecurringTodo).monitor))
      .map((t) => ({
        todoId: t.id,
        title: t.title,
        exeName: t.monitor!.exeName,
        thresholdMinutes: t.monitor!.thresholdMinutes
      }));
    window.electronAPI.monitor.configure(entries).catch(() => undefined);
  }, [state.todos]);

  // 进度推送与达标完成订阅
  useEffect(() => {
    const api = window.electronAPI.monitor;
    let alive = true;
    api
      .getProgress()
      .then((p) => {
        if (alive && p) setMonitorProgress(p.progress);
      })
      .catch(() => undefined);
    const offProgress = api.onProgress((p) => setMonitorProgress(p.progress));
    const offCompleted = api.onCompleted(({ todoId }) => completeByMonitor(todoId));
    return () => {
      alive = false;
      offProgress();
      offCompleted();
    };
  }, [setMonitorProgress, completeByMonitor]);

  // 云同步：状态与合并结果订阅
  useEffect(() => {
    const api = window.electronAPI.sync;
    let alive = true;
    api
      .getStatus()
      .then((s) => {
        if (alive && s) setSyncStatus(s);
      })
      .catch(() => undefined);
    const offStatus = api.onStatus((s) => setSyncStatus(s));
    const offMerged = api.onMerged((payload) => {
      if (payload?.todos && payload?.groups) {
        applySyncedTodos(payload.todos);
        applySyncedGroups(payload.groups);
      }
    });
    return () => {
      alive = false;
      offStatus();
      offMerged();
    };
  }, [applySyncedTodos, applySyncedGroups]);

  // 启动后首次同步（上下文加载完成后触发；1.5s 内的新编辑由 store 并集兜底）
  useEffect(() => {
    if (!todosReady || !groupsReady || bootSyncedRef.current) return;
    bootSyncedRef.current = true;
    const timer = setTimeout(() => {
      window.electronAPI.sync
        .run({ todos: allTodos, groups: allGroups })
        .catch(() => undefined);
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todosReady, groupsReady]);

  // 网络恢复 → 立即重试
  useEffect(() => {
    const handleOnline = () => {
      window.electronAPI.sync
        .run({ todos: allTodos, groups: allGroups })
        .catch(() => undefined);
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [allTodos, allGroups]);

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
          {syncStatus && (
            <button
              className={`foot-sync ${syncStatus.state === 'AUTH ERROR' || syncStatus.state === 'REMOTE ERROR' ? 'error' : ''} ${syncStatus.state === 'SYNCING' ? 'busy' : ''}`}
              onClick={() => setIsSyncModalOpen(true)}
              title="同步设置"
            >
              {syncLabel(syncStatus)}
            </button>
          )}
          <button className="footer-add" onClick={handleAddTodo}>
            + Add Task
          </button>
        </footer>
      )}
      <AddTodoModal isOpen={isAddModalOpen} onClose={handleCloseAddModal} />
      <EditTodoModal isOpen={isEditModalOpen} onClose={handleCloseEditModal} todo={editingTodo} />
      <TodoDetailModal isOpen={isDetailModalOpen} onClose={handleCloseDetailModal} todo={detailTodo} />
      <GroupManagerModal isOpen={isGroupManagerOpen} onClose={handleCloseGroupManager} />
      <SyncSettingsModal isOpen={isSyncModalOpen} onClose={() => setIsSyncModalOpen(false)} status={syncStatus} />
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