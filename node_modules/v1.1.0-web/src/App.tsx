import { useState } from 'react';
import { TodoProvider } from './context/TodoContext';
import { GroupProvider } from './context/GroupContext';
import { TodoList } from './components/TodoList';
import { AddTodoModal } from './components/AddTodoModal';
import { EditTodoModal } from './components/EditTodoModal';
import { TodoDetailModal } from './components/TodoDetailModal';
import { GroupManagerModal } from './components/GroupManagerModal';
import type { Todo } from '@hengsch/shared-types';
import './styles/index.css';

function AppContent() {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isGroupDrawerOpen, setIsGroupDrawerOpen] = useState(false);
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [detailTodo, setDetailTodo] = useState<Todo | null>(null);

  const handleAddTodo = () => setIsAddModalOpen(true);
  const handleEditTodo = (todo: Todo) => {
    setEditingTodo(todo);
    setIsEditModalOpen(true);
  };
  const handleDetailTodo = (todo: Todo) => {
    setDetailTodo(todo);
    setIsDetailModalOpen(true);
  };
  const handleOpenGroupManager = () => setIsGroupDrawerOpen(true);

  return (
    <div className="app-container">
      <header className="toolbar">
        <div className="toolbar-actions">
          <button
            className="toolbar-button add-todo"
            onClick={handleAddTodo}
            aria-label="添加待办事项"
            title="添加待办事项"
          >
            +
          </button>
          <button
            className="toolbar-button group-manager"
            onClick={handleOpenGroupManager}
            aria-label="分组管理"
            title="分组管理"
          >
            📁
          </button>
        </div>
      </header>
      <div className="content">
        <div className="todo-container">
          <TodoList onEdit={handleEditTodo} onDetail={handleDetailTodo} />
        </div>
      </div>
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
      <GroupManagerModal
        isOpen={isGroupDrawerOpen}
        onClose={() => setIsGroupDrawerOpen(false)}
      />
    </div>
  );
}

function App() {
  return (
    <GroupProvider>
      <TodoProvider>
        <AppContent />
      </TodoProvider>
    </GroupProvider>
  );
}

export default App;
