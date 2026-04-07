import { useState, useEffect } from 'react';
import { useGroups, DEFAULT_GROUP_COLORS } from '../context/GroupContext';
import { useTodos } from '../context/TodoContext';
import { ColorPicker } from './ColorPicker';
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

  const resetForm = () => {
    setEditingGroup(null);
    setNewGroupName('');
    setSelectedColor(DEFAULT_GROUP_COLORS[0]);
  };

  const handleDeleteGroup = (groupId: string) => {
    if (groupId === 'default') {
      return;
    }

    if (confirm('确定要删除这个分组吗？该分组下的待办会被移动到“未分类”。')) {
      deleteGroup(groupId);
      todoState.todos.forEach((todo) => {
        if (todo.groupId === groupId) {
          updateTodo(todo.id, { groupId: 'default' });
        }
      });
      resetForm();
    }
  };

  const handleSaveGroup = () => {
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
      <div className="modal-card tone-green" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-group">
            <span className="modal-title-mark" aria-hidden="true">
              组
            </span>
            <h2>分组管理</h2>
          </div>
          <span className="modal-status-chip neutral">{Math.max(state.groups.length - 1, 0)} 个分组</span>
          <button className="modal-close" onClick={onClose} aria-label="关闭" />
        </div>

        <div className="modal-body">
          <div className="group-list">
            {state.groups
              .filter((group) => group.id !== 'default')
              .map((group) => (
                <div key={group.id} className="group-item" style={{ backgroundColor: group.color }}>
                  <div className="group-item-handle" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                  <span className="group-name">{group.name}</span>
                  <div className="group-actions">
                    <button
                      className="group-action-button edit"
                      onClick={() => {
                        setEditingGroup(group);
                        setNewGroupName(group.name);
                        setSelectedColor(group.color);
                      }}
                      aria-label="编辑分组"
                    />
                    <button
                      className="group-action-button delete"
                      onClick={() => handleDeleteGroup(group.id)}
                      aria-label="删除分组"
                    />
                  </div>
                </div>
              ))}
          </div>

          <div className="group-creator">
            <h3>{editingGroup ? '编辑分组' : '新建分组'}</h3>
            <ColorPicker selectedColor={selectedColor} onColorSelect={setSelectedColor} />
            <div className="group-create-row">
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="分组名称..."
                className="group-name-input"
              />
              <button className="button button-secondary" onClick={handleSaveGroup} disabled={!newGroupName.trim()}>
                {editingGroup ? '保存' : '+ 添加'}
              </button>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="button button-primary" onClick={onClose}>
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
