import { useEffect, useState } from 'react';
import type { Group } from '@hengsch/shared-types';
import { DEFAULT_GROUP_COLORS, useGroups } from '../context/GroupContext';
import { useTodos } from '../context/TodoContext';
import { ColorPicker } from './ColorPicker';

interface GroupManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GroupManagerModal({ isOpen, onClose }: GroupManagerModalProps): JSX.Element {
  const { state, addGroup, updateGroup, deleteGroup } = useGroups();
  const { state: todoState, updateTodo } = useTodos();
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedColor, setSelectedColor] = useState(DEFAULT_GROUP_COLORS[0]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const resetForm = (): void => {
    setEditingGroup(null);
    setNewGroupName('');
    setSelectedColor(DEFAULT_GROUP_COLORS[0]);
  };

  const handleDeleteGroup = (groupId: string): void => {
    if (groupId === 'default') {
      return;
    }

    if (confirm('确定要删除这个分组吗？该分组下的待办会移动到“未分类”。')) {
      deleteGroup(groupId);
      todoState.todos.forEach((todo) => {
        if (todo.groupId === groupId) {
          updateTodo(todo.id, { groupId: 'default' });
        }
      });
      resetForm();
    }
  };

  const handleSaveGroup = (): void => {
    if (!newGroupName.trim()) {
      return;
    }

    if (editingGroup) {
      updateGroup(editingGroup.id, {
        name: newGroupName.trim(),
        color: selectedColor
      });
    } else {
      addGroup({
        name: newGroupName.trim(),
        color: selectedColor
      });
    }

    resetForm();
  };

  if (!isOpen) {
    return <></>;
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card tone-coral" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-copy">
            <span className="modal-kicker">分组管理</span>
            <h2>给任务分区，但别把版面切得太碎</h2>
            <p>分组适合用来整理长期主题，临时小事仍然可以留在未分类里。</p>
          </div>
          <span className="modal-status-chip neutral">{Math.max(state.groups.length - 1, 0)} 个自定义分组</span>
          <button className="modal-close" onClick={onClose} aria-label="关闭" />
        </div>

        <div className="modal-body group-manager-layout">
          <div className="group-list">
            {state.groups
              .filter((group) => group.id !== 'default')
              .map((group) => (
                <div key={group.id} className="group-item">
                  <span className="group-swatch" style={{ backgroundColor: group.color }} aria-hidden="true" />
                  <div className="group-copy">
                    <strong className="group-name">{group.name}</strong>
                    <span className="group-meta">用于整理相近事项</span>
                  </div>
                  <div className="group-actions">
                    <button
                      className="group-action-button edit"
                      onClick={() => {
                        setEditingGroup(group);
                        setNewGroupName(group.name);
                        setSelectedColor(group.color);
                      }}
                      aria-label="编辑分组"
                    >
                      改
                    </button>
                    <button
                      className="group-action-button delete"
                      onClick={() => handleDeleteGroup(group.id)}
                      aria-label="删除分组"
                    >
                      删
                    </button>
                  </div>
                </div>
              ))}

            {state.groups.filter((group) => group.id !== 'default').length === 0 && (
              <div className="group-empty-state">
                <strong>还没有自定义分组</strong>
                <p>先按主题建 1 到 3 个分组就够了，太多反而会打散注意力。</p>
              </div>
            )}
          </div>

          <div className="group-creator">
            <div className="group-creator-copy">
              <span className="modal-kicker">{editingGroup ? '编辑分组' : '新建分组'}</span>
              <h3>{editingGroup ? '调整名称和颜色' : '给一组任务一个清楚的标签'}</h3>
            </div>

            <ColorPicker selectedColor={selectedColor} onColorSelect={setSelectedColor} />

            <div className="group-create-row">
              <input
                type="text"
                value={newGroupName}
                onChange={(event) => setNewGroupName(event.target.value)}
                placeholder="例如：内容发布 / 产品优化"
                className="group-name-input"
              />
              <button className="button button-primary" onClick={handleSaveGroup} disabled={!newGroupName.trim()}>
                {editingGroup ? '保存分组' : '添加分组'}
              </button>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="button button-secondary" onClick={onClose}>
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
