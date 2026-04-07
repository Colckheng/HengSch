import { useMemo, useState, type CSSProperties } from 'react';
import type { Todo } from '@hengsch/shared-types';
import { useGroups } from '../context/GroupContext';
import { useTodos } from '../context/TodoContext';
import { TodoCard } from './TodoCard';

interface TodoListProps {
  onEdit: (todo: Todo) => void;
  onDetail: (todo: Todo) => void;
}

function SectionEmpty({ title, description }: { title: string; description: string }): JSX.Element {
  return (
    <div className="todo-section-empty">
      <span className="todo-section-empty-tag">{title}</span>
      <p>{description}</p>
    </div>
  );
}

export function TodoList({ onEdit, onDetail }: TodoListProps): JSX.Element {
  const { state, reorderTodos, toggleTodoStatus, deleteTodo } = useTodos();
  const { state: groupState } = useGroups();
  const [selectedGroupId, setSelectedGroupId] = useState<string>('all');

  const handleDragStart = (event: React.DragEvent, draggedId: string): void => {
    event.dataTransfer.setData('text/plain', draggedId);
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (event: React.DragEvent): void => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (event: React.DragEvent, targetId: string): void => {
    event.preventDefault();
    const draggedId = event.dataTransfer.getData('text/plain');

    if (!draggedId || !targetId || draggedId === targetId) {
      return;
    }

    const oldIndex = state.todos.findIndex((todo) => todo.id === draggedId);
    const newIndex = state.todos.findIndex((todo) => todo.id === targetId);

    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    const reorderedTodos = [...state.todos];
    const [removedTodo] = reorderedTodos.splice(oldIndex, 1);
    reorderedTodos.splice(newIndex, 0, removedTodo);
    reorderTodos(reorderedTodos);
  };

  const filteredTodos = useMemo(() => {
    if (selectedGroupId === 'all') {
      return state.todos;
    }

    return state.todos.filter((todo) => todo.groupId === selectedGroupId);
  }, [selectedGroupId, state.todos]);

  const pendingTodos = filteredTodos.filter((todo) => todo.status !== 'completed');
  const completedTodos = filteredTodos.filter((todo) => todo.status === 'completed');
  const progressRate = filteredTodos.length > 0 ? Math.round((completedTodos.length / filteredTodos.length) * 100) : 0;
  const selectedGroupName =
    selectedGroupId === 'all'
      ? '全部事项'
      : groupState.groups.find((group) => group.id === selectedGroupId)?.name ?? '当前分组';

  if (state.todos.length === 0) {
    return (
      <div className="board-shell board-shell-empty">
        <div className="board-intro">
          <span className="section-kicker">工作版</span>
          <h3>版面已经准备好了，就差第一件真正要推进的事。</h3>
          <p>先从一条短标题开始，然后再补描述、分类和循环规则，页面会自然变成你自己的工作桌面。</p>
        </div>

        <div className="board-empty-stage">
          <div className="board-empty-note">
            <span>01</span>
            <strong>先用“新建待办”贴上第一件事</strong>
            <p>标题越具体，执行阻力越小。</p>
          </div>
          <div className="board-empty-note">
            <span>02</span>
            <strong>再决定要不要分组</strong>
            <p>网页端只保留任务整理，不放桌面窗口控制。</p>
          </div>
          <div className="board-empty-note">
            <span>03</span>
            <strong>需要反复做的事再设为循环</strong>
            <p>把例行工作和一次性事项分开，版面会更清楚。</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="board-shell">
      <div className="board-intro">
        <div>
          <span className="section-kicker">工作版</span>
          <h3>{selectedGroupName}</h3>
          <p>拖动卡片调整顺序，点击卡片查看详情，保持版面只围绕正在推进的事。</p>
        </div>

        <dl className="board-summary" aria-label="当前工作版统计">
          <div>
            <dt>待推进</dt>
            <dd>{pendingTodos.length}</dd>
          </div>
          <div>
            <dt>已完成</dt>
            <dd>{completedTodos.length}</dd>
          </div>
          <div>
            <dt>完成率</dt>
            <dd>{progressRate}%</dd>
          </div>
        </dl>
      </div>

      <div className="group-filter" aria-label="分组筛选">
        <button
          className={`group-filter-item ${selectedGroupId === 'all' ? 'active' : ''}`}
          onClick={() => setSelectedGroupId('all')}
        >
          全部
        </button>

        {groupState.groups.map((group) => (
          <button
            key={group.id}
            className={`group-filter-item ${selectedGroupId === group.id ? 'active' : ''}`}
            onClick={() => setSelectedGroupId(group.id)}
            style={
              {
                '--group-chip-color': group.color,
                '--group-chip-active': group.color
              } as CSSProperties
            }
          >
            {group.name}
          </button>
        ))}
      </div>

      <div className="todo-columns">
        <section className="todo-section todo-section-primary">
          <header className="todo-section-header">
            <div className="todo-section-title">
              <span className="todo-section-dot pending" />
              <div>
                <h4>进行中 / 待开始</h4>
                <p>保留正在推进或准备推进的事项。</p>
              </div>
            </div>
            <span className="todo-section-count">{pendingTodos.length}</span>
          </header>

          <div className="todo-stack">
            {pendingTodos.length === 0 ? (
              <SectionEmpty title="待推进" description="当前筛选条件下还没有待推进的任务。" />
            ) : (
              pendingTodos.map((todo) => (
                <div
                  key={todo.id}
                  onDragStart={(event) => handleDragStart(event, todo.id)}
                  onDragOver={handleDragOver}
                  onDrop={(event) => handleDrop(event, todo.id)}
                >
                  <TodoCard
                    todo={todo}
                    onToggle={toggleTodoStatus}
                    onDelete={deleteTodo}
                    onEdit={onEdit}
                    onDetail={onDetail}
                  />
                </div>
              ))
            )}
          </div>
        </section>

        <section className="todo-section todo-section-secondary">
          <header className="todo-section-header">
            <div className="todo-section-title">
              <span className="todo-section-dot completed" />
              <div>
                <h4>已完成</h4>
                <p>已结束的事项收在这里，方便快速回看。</p>
              </div>
            </div>
            <span className="todo-section-count">{completedTodos.length}</span>
          </header>

          <div className="todo-stack">
            {completedTodos.length === 0 ? (
              <SectionEmpty title="已完成" description="完成过的事项会收进这里，方便回顾进度。" />
            ) : (
              completedTodos.map((todo) => (
                <div
                  key={todo.id}
                  onDragStart={(event) => handleDragStart(event, todo.id)}
                  onDragOver={handleDragOver}
                  onDrop={(event) => handleDrop(event, todo.id)}
                >
                  <TodoCard
                    todo={todo}
                    onToggle={toggleTodoStatus}
                    onDelete={deleteTodo}
                    onEdit={onEdit}
                    onDetail={onDetail}
                  />
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
