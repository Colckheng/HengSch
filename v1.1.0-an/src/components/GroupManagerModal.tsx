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
                <View style={styles.groupInfo}>
                  <View style={styles.groupNameRow}>
                    <View style={[styles.groupDot, { backgroundColor: group.color }]} />
                    <Text style={styles.groupName}>{group.name}</Text>
                  </View>
                  {group.id !== 'default' && (
                    <View style={styles.groupActions}>
                      <TouchableOpacity onPress={() => handleEditGroup(group)} style={styles.actionBtn}>
                        <Text style={styles.actionText}>EDIT</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDeleteGroup(group.id)} style={styles.actionBtn}>
                        <Text style={[styles.actionText, styles.actionTextDel]}>DEL</Text>
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
  container: { flex: 1, backgroundColor: '#FAFAF7' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 2,
    borderBottomColor: '#111111',
  },
  headerBtn: { padding: 4, minWidth: 56 },
  headerBtnText: { fontFamily: 'monospace', fontSize: 13, color: '#111111', letterSpacing: 1 },
  headerTitle: { fontFamily: 'monospace', fontSize: 12, fontWeight: '700', letterSpacing: 2, color: '#111111' },
  body: { flex: 1, paddingHorizontal: 20 },
  groupItem: { marginBottom: 4 },
  groupInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(17,17,27,0.10)',
  },
  groupNameRow: { flexDirection: 'row', alignItems: 'center' },
  groupDot: { width: 7, height: 7, marginRight: 10 },
  groupName: { fontSize: 16, fontWeight: '500', color: '#111111', letterSpacing: -0.3 },
  groupActions: { flexDirection: 'row', gap: 16 },
  actionBtn: { padding: 4 },
  actionText: { fontFamily: 'monospace', fontSize: 10, letterSpacing: 1, color: '#8A8A85' },
  actionTextDel: { color: '#E1352B' },
  editForm: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#111111',
    marginBottom: 8,
  },
  addForm: {
    marginTop: 20,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#111111',
  },
  sectionTitle: {
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 2,
    color: '#8A8A85',
    marginBottom: 12,
  },
  input: {
    borderBottomWidth: 2,
    borderBottomColor: '#111111',
    paddingVertical: 8,
    fontSize: 16,
    color: '#111111',
  },
  row: { flexDirection: 'row', gap: 12, marginTop: 16 },
  btnSecondary: {
    flex: 1,
    padding: 12,
    borderRadius: 0,
    borderWidth: 1.5,
    borderColor: '#111111',
    backgroundColor: '#FAFAF7',
    alignItems: 'center',
  },
  btnPrimary: {
    flex: 1,
    padding: 12,
    borderRadius: 0,
    backgroundColor: '#111111',
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.35 },
  btnPrimaryText: { color: '#FAFAF7', fontWeight: '700', fontFamily: 'monospace', letterSpacing: 1, fontSize: 12 },
  addBtn: {
    marginTop: 24,
    padding: 16,
    borderRadius: 0,
    borderWidth: 2,
    borderColor: '#111111',
    backgroundColor: '#FAFAF7',
    alignItems: 'center',
  },
  addBtnText: { color: '#111111', fontFamily: 'monospace', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
});
