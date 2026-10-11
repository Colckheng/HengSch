import { useState, useEffect } from 'react';
import { useGroups, DEFAULT_GROUP_COLORS } from '../context/GroupContext';
import { useTodos } from '../context/TodoContext';
import { ColorPicker } from './ColorPicker';
import { ConfirmDialog } from './ConfirmDialog';
import { IconClose, IconEdit, IconTrash } from './Icons';
import type { Group } from '../types';

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
  const [isAdding, setIsAdding] = useState(false);
  const [deletingGroup, setDeletingGroup] = useState<Group | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        if (deletingGroup) {
          setDeletingGroup(null);
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, deletingGroup]);

  const handleAddGroup = () => {
    if (!newGroupName.trim()) return;

    addGroup({
      name: newGroupName.trim(),
      color: selectedColor
    });

    setNewGroupName('');
    setSelectedColor(DEFAULT_GROUP_COLORS[0]);
    setIsAdding(false);
  };

  const handleEditGroup = (group: Group) => {
    setEditingGroup(group);
    setNewGroupName(group.name);
    setSelectedColor(group.color);
  };

  const handleUpdateGroup = () => {
    if (!editingGroup || !newGroupName.trim()) return;

    updateGroup(editingGroup.id, {
      name: newGroupName.trim(),
      color: selectedColor
    });

    setEditingGroup(null);
    setNewGroupName('');
    setSelectedColor(DEFAULT_GROUP_COLORS[0]);
  };

  const handleDeleteGroup = (group: Group) => {
    if (group.id === 'default') return;
    setDeletingGroup(group);
  };

  const confirmDeleteGroup = () => {
    if (!deletingGroup) return;
    deleteGroup(deletingGroup.id);
    todoState.todos.forEach((todo) => {
      if (todo.groupId === deletingGroup.id) {
        updateTodo(todo.id, { groupId: 'default' });
      }
    });
    setDeletingGroup(null);
  };

  const handleCancelEdit = () => {
    setEditingGroup(null);
    setNewGroupName('');
    setSelectedColor(DEFAULT_GROUP_COLORS[0]);
  };

  const handleCancelAdd = () => {
    setNewGroupName('');
    setSelectedColor(DEFAULT_GROUP_COLORS[0]);
    setIsAdding(false);
  };

  if (!isOpen) return <></>;

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>分组管理</h2>
          <button className="modal-close" onClick={onClose} aria-label="关闭">
            <IconClose />
          </button>
        </div>
        <div className="modal-body">
          <div className="group-list">
            {state.groups.map((group) => (
              <div key={group.id} className="group-item">
                {editingGroup?.id === group.id ? (
                  <div className="group-edit-form">
                    <input
                      type="text"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      placeholder="分组名称"
                      className="group-name-input"
                      autoFocus
                    />
                    <div className="form-actions">
                      <button
                        className="button button-secondary"
                        onClick={handleCancelEdit}
                      >
                        取消
                      </button>
                      <button
                        className="button button-primary"
                        onClick={handleUpdateGroup}
                        disabled={!newGroupName.trim()}
                      >
                        保存
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="group-info">
                      <span className="group-dot" style={{ backgroundColor: group.color }} />
                      <span className="group-name">{group.name}</span>
                      <div className="group-actions">
                        {group.id !== 'default' && (
                          <>
                            <button
                              className="group-action-button edit"
                              onClick={() => handleEditGroup(group)}
                              aria-label="编辑分组"
                            >
                              <IconEdit />
                            </button>
                            <button
                              className="group-action-button delete"
                              onClick={() => handleDeleteGroup(group)}
                              aria-label="删除分组"
                            >
                              <IconTrash />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          {isAdding && (
            <div className="add-group-form">
              <h3>新建分组</h3>
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="分组名称"
                className="group-name-input"
                autoFocus
              />
              <ColorPicker
                selectedColor={selectedColor}
                onColorSelect={setSelectedColor}
              />
              <div className="form-actions">
                <button
                  className="button button-secondary"
                  onClick={handleCancelAdd}
                >
                  取消
                </button>
                <button
                  className="button button-primary"
                  onClick={handleAddGroup}
                  disabled={!newGroupName.trim()}
                >
                  添加
                </button>
              </div>
            </div>
          )}

          {!isAdding && (
            <button
              className="button button-primary add-group-button"
              onClick={() => setIsAdding(true)}
            >
              + 新建分组
            </button>
          )}
        </div>
      </div>
      </div>
      <ConfirmDialog
        isOpen={deletingGroup !== null}
        title="删除分组"
        message={`确定要删除「${deletingGroup?.name ?? ''}」吗？该分组下的所有待办事项将变为未分类。`}
        confirmText="删除"
        onConfirm={confirmDeleteGroup}
        onCancel={() => setDeletingGroup(null)}
      />
    </>
  );
}