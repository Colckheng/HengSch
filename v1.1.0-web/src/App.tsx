import { useMemo, useState } from 'react';
import type { Todo } from '@hengsch/shared-types';
import { AddTodoModal } from './components/AddTodoModal';
import { EditTodoModal } from './components/EditTodoModal';
import { GroupManagerModal } from './components/GroupManagerModal';
import { TodoDetailModal } from './components/TodoDetailModal';
import { TodoList } from './components/TodoList';
import { GroupProvider, useGroups } from './context/GroupContext';
import { TodoProvider, useTodos } from './context/TodoContext';

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: 'long',
  day: 'numeric',
  weekday: 'long'
});

function AppContent(): JSX.Element {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isGroupManagerOpen, setIsGroupManagerOpen] = useState(false);
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [detailTodo, setDetailTodo] = useState<Todo | null>(null);
  const { state: todoState } = useTodos();
  const { state: groupState } = useGroups();

  const pendingTodos = useMemo(
    () => todoState.todos.filter((todo) => todo.status === 'pending'),
    [todoState.todos]
  );
  const completedTodos = useMemo(
    () => todoState.todos.filter((todo) => todo.status === 'completed'),
    [todoState.todos]
  );
  const recurringTodos = useMemo(
    () => todoState.todos.filter((todo) => todo.type === 'recurring'),
    [todoState.todos]
  );

  const pendingCount = pendingTodos.length;
  const completedCount = completedTodos.length;
  const recurringCount = recurringTodos.length;
  const totalCount = todoState.todos.length;
  const customGroupCount = Math.max(groupState.groups.length - 1, 0);
  const progressRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const isEmptyState = totalCount === 0;
  const focusTodo = pendingTodos[0] ?? null;
  const todayLabel = dateFormatter.format(new Date());

  const heroDescription = focusTodo
    ? `现在最适合推进的是“${focusTodo.title}”。把版面收紧一点，事情会更快动起来。`
    : '先写下一件你真的准备动手的事，页面就会从“空白”变成“工作台”。';

  const heroSupportText = isEmptyState
    ? '右侧会显示一张今日海报，先把第一件任务贴上去。'
    : `当前共 ${totalCount} 件事项，已完成 ${completedCount} 件，今天的完成进度是 ${progressRate}%。`;

  const openEditModal = (todo: Todo): void => {
    setEditingTodo(todo);
    setIsEditModalOpen(true);
  };

  const openDetailModal = (todo: Todo): void => {
    setDetailTodo(todo);
    setIsDetailModalOpen(true);
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand">
          <div className="app-brand-mark" aria-hidden="true">
            <svg className="app-brand-glyph" viewBox="0 0 96 64">
              <path d="M16 18v28" />
              <path d="M32 18v28" />
              <path d="M16 32h16" />
              <path d="M54 21c-6.4 0-10.6 3.1-10.6 7.7 0 9.9 17.4 5.5 17.4 13.3 0 3.8-3.3 6.3-8.1 6.3-4.2 0-7.7-1.7-10-4.6" />
              <path d="M58.2 23.1c-1.8-1.5-4.4-2.1-7.1-2.1" />
              <path d="M67 20h20" />
              <path d="M77 20v27" />
            </svg>
          </div>

          <div className="app-brand-copy">
            <span className="app-brand-kicker">HengSch Todo</span>
            <h1>网页工作台</h1>
            <p>只保留网页端的任务整理与推进体验。</p>
          </div>
        </div>

        <div className="app-header-actions">
          <span className="app-header-date">{todayLabel}</span>
          <button className="header-action header-action-secondary" onClick={() => setIsGroupManagerOpen(true)}>
            分组管理
          </button>
        </div>
      </header>

      <main className="app-main">
        <section className={`poster-hero ${isEmptyState ? 'is-empty' : ''}`}>
          <div className="poster-copy">
            <span className="section-kicker">今日版面</span>
            <h2>把今天最重要的一件事，摆到桌面中央。</h2>
            <p className="poster-description">{heroDescription}</p>
            <p className="poster-support">{heroSupportText}</p>

            <div className="poster-actions">
              <button className="hero-action hero-action-primary" onClick={() => setIsAddModalOpen(true)}>
                新建待办
              </button>
              <button className="hero-action hero-action-secondary" onClick={() => setIsGroupManagerOpen(true)}>
                整理分组
              </button>
            </div>

            <dl className="poster-metrics" aria-label="任务概览">
              <div>
                <dt>待推进</dt>
                <dd>{pendingCount}</dd>
              </div>
              <div>
                <dt>已完成</dt>
                <dd>{completedCount}</dd>
              </div>
              <div>
                <dt>循环事项</dt>
                <dd>{recurringCount}</dd>
              </div>
              <div>
                <dt>自定义分组</dt>
                <dd>{customGroupCount}</dd>
              </div>
            </dl>
          </div>

          <aside className="poster-sheet" aria-label="今日焦点海报">
            <div className="poster-sheet-top">
              <span className="poster-sheet-label">{todayLabel}</span>
              <span className="poster-sheet-chip">{focusTodo ? '当前焦点' : '准备开始'}</span>
            </div>

            <div className="poster-sheet-body">
              <span className="poster-sheet-kicker">{focusTodo ? '先推进这件事' : '先贴第一件事'}</span>
              <h3>{focusTodo?.title ?? '让版面先出现第一张任务卡片'}</h3>
              <p>
                {focusTodo?.description ??
                  '把标题写得更具体一点，例如“整理发布页文案”或“补全接口错误提示”，会更容易开始。'}
              </p>
            </div>

            <div className="poster-sheet-footer">
              <div>
                <span>完成率</span>
                <strong>{progressRate}%</strong>
              </div>
              <div>
                <span>工作区</span>
                <strong>{isEmptyState ? '等待第一件任务' : `${pendingCount} 件待推进`}</strong>
              </div>
            </div>
          </aside>
        </section>

        <section className="workspace-panel">
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
    <GroupProvider>
      <TodoProvider>
        <AppContent />
      </TodoProvider>
    </GroupProvider>
  );
}

export default App;
