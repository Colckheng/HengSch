import { useState } from 'react';
import { useGroups, DEFAULT_GROUP_COLORS } from '../context/GroupContext';
import { useTodos } from '../context/TodoContext';
import { ColorPicker } from './ColorPicker';
import { ConfirmDialog, ModalFrame } from './ConfirmDialog';
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
  const isFormActive = isAdding || editingGroup !== null;

  const resetForm = () => {
    setEditingGroup(null);
    setIsAdding(false);
    setNewGroupName('');
    setSelectedColor(DEFAULT_GROUP_COLORS[0]);
  };

  const handleStartAdd = () => {
    if (isFormActive) return;
    resetForm();
    setIsAdding(true);
  };

  const handleAddGroup = () => {
    if (!newGroupName.trim()) return;

    addGroup({
      name: newGroupName.trim(),
      color: selectedColor
    });

    resetForm();
  };

  const handleEditGroup = (group: Group) => {
    if (isFormActive) return;
    setIsAdding(false);
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

    resetForm();
  };

  const handleDeleteGroup = (group: Group) => {
    if (group.id === 'default' || isFormActive) return;
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
    if (editingGroup?.id === deletingGroup.id) resetForm();
    setDeletingGroup(null);
  };

  if (!isOpen) return <></>;

  return (
    <>
      <ModalFrame label="分组管理" onClose={onClose}>
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
                        onClick={resetForm}
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
                              disabled={isFormActive}
                            >
                              <IconEdit />
                            </button>
                            <button
                              className="group-action-button delete"
                              onClick={() => handleDeleteGroup(group)}
                              aria-label="删除分组"
                              disabled={isFormActive}
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
                  onClick={resetForm}
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
              onClick={handleStartAdd}
              disabled={isFormActive}
            >
              + 新建分组
            </button>
          )}
        </div>
      </ModalFrame>
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