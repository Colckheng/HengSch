import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { useGroups, DEFAULT_GROUP_COLORS } from '../context/GroupContext';
import { useTodos } from '../context/TodoContext';
import { ColorPicker } from './ColorPicker';
import type { Group } from '@hengsch/shared-types';

interface GroupManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GroupManagerModal({ isOpen, onClose }: GroupManagerModalProps): React.ReactElement {
  const { state, addGroup, updateGroup, deleteGroup } = useGroups();
  const { state: todoState, updateTodo } = useTodos();
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedColor, setSelectedColor] = useState(DEFAULT_GROUP_COLORS[0]);
  const [isAdding, setIsAdding] = useState(false);

  const handleAddGroup = () => {
    if (!newGroupName.trim()) return;
    addGroup({ name: newGroupName.trim(), color: selectedColor });
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
    updateGroup(editingGroup.id, { name: newGroupName.trim(), color: selectedColor });
    setEditingGroup(null);
    setNewGroupName('');
    setSelectedColor(DEFAULT_GROUP_COLORS[0]);
  };

  const handleDeleteGroup = (groupId: string) => {
    if (groupId === 'default') return;
    Alert.alert(
      '删除分组',
      '确定要删除这个分组吗？该分组下的所有待办事项将变为未分类。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确定',
          style: 'destructive',
          onPress: () => {
            deleteGroup(groupId);
            todoState.todos.forEach((todo) => {
              if (todo.groupId === groupId) {
                updateTodo(todo.id, { groupId: 'default' });
              }
            });
          },
        },
      ]
    );
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
    <Modal visible={isOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>关闭</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>分组管理</Text>
          <View style={styles.headerBtn} />
        </View>
        <ScrollView style={styles.body}>
          {state.groups.map((group) => (
            <View key={group.id} style={styles.groupItem}>
              {editingGroup?.id === group.id ? (
                <View style={styles.editForm}>
                  <TextInput
                    style={styles.input}
                    value={newGroupName}
                    onChangeText={setNewGroupName}
                    placeholder="分组名称"
                    placeholderTextColor="#999"
                  />
                  <ColorPicker selectedColor={selectedColor} onColorSelect={setSelectedColor} />
                  <View style={styles.row}>
                    <TouchableOpacity onPress={handleCancelEdit} style={styles.btnSecondary}>
                      <Text>取消</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleUpdateGroup}
                      disabled={!newGroupName.trim()}
                      style={[styles.btnPrimary, !newGroupName.trim() && styles.btnDisabled]}
                    >
                      <Text style={styles.btnPrimaryText}>保存</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={[styles.groupInfo, { backgroundColor: group.color }]}>
                  <Text style={styles.groupName}>{group.name}</Text>
                  {group.id !== 'default' && (
                    <View style={styles.groupActions}>
                      <TouchableOpacity onPress={() => handleEditGroup(group)} style={styles.actionBtn}>
                        <Text>✏️</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDeleteGroup(group.id)} style={styles.actionBtn}>
                        <Text>🗑️</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            </View>
          ))}
          {isAdding && (
            <View style={styles.addForm}>
              <Text style={styles.sectionTitle}>新建分组</Text>
              <TextInput
                style={styles.input}
                value={newGroupName}
                onChangeText={setNewGroupName}
                placeholder="分组名称"
                placeholderTextColor="#999"
              />
              <ColorPicker selectedColor={selectedColor} onColorSelect={setSelectedColor} />
              <View style={styles.row}>
                <TouchableOpacity onPress={handleCancelAdd} style={styles.btnSecondary}>
                  <Text>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleAddGroup}
                  disabled={!newGroupName.trim()}
                  style={[styles.btnPrimary, !newGroupName.trim() && styles.btnDisabled]}
                >
                  <Text style={styles.btnPrimaryText}>添加</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          {!isAdding && (
            <TouchableOpacity style={styles.addBtn} onPress={() => setIsAdding(true)}>
              <Text style={styles.addBtnText}>+ 新建分组</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerBtn: { padding: 8, minWidth: 60 },
  headerBtnText: { fontSize: 16, color: '#666' },
  headerTitle: { fontSize: 18, fontWeight: '600' },
  body: { flex: 1, padding: 16 },
  groupItem: { marginBottom: 12 },
  groupInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
  },
  groupName: { fontSize: 16, fontWeight: '500' },
  groupActions: { flexDirection: 'row', gap: 8 },
  actionBtn: { padding: 8 },
  editForm: { padding: 16, backgroundColor: '#f9f9f9', borderRadius: 12 },
  addForm: { marginTop: 16, padding: 16, backgroundColor: '#f9f9f9', borderRadius: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  row: { flexDirection: 'row', gap: 12, marginTop: 16 },
  btnSecondary: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#e0e0e0',
    alignItems: 'center',
  },
  btnPrimary: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#2196F3',
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  btnPrimaryText: { color: '#fff', fontWeight: '600' },
  addBtn: {
    marginTop: 24,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#2196F3',
    alignItems: 'center',
  },
  addBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
