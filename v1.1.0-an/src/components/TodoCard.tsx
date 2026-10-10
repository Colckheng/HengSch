import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import type { Todo } from '@hengsch/shared-types';
import { useGroups } from '../context/GroupContext';

interface TodoCardProps {
  todo: Todo;
  index: number;
  onToggle: (id: string) => void;
  onPress: (todo: Todo) => void;
  onEdit: (todo: Todo) => void;
  onDelete: (todo: Todo) => void;
}

export function TodoCard({ todo, index, onToggle, onPress, onEdit, onDelete }: TodoCardProps): React.ReactElement {
  const isCompleted = todo.status === 'completed';
  const { getGroupById } = useGroups();
  const group = todo.groupId ? getGroupById(todo.groupId) : undefined;

  return (
    <TouchableOpacity style={styles.row} onPress={() => onPress(todo)} activeOpacity={0.6}>
      <Text style={[styles.index, isCompleted && styles.indexDone]}>{String(index + 1).padStart(2, '0')}</Text>
      <TouchableOpacity
        style={[styles.checkbox, isCompleted && styles.checkboxChecked]}
        onPress={() => onToggle(todo.id)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        {isCompleted && <Text style={styles.checkmark}>✓</Text>}
      </TouchableOpacity>
      <View style={styles.content}>
        {group && (
          <View style={styles.chip}>
            <View style={[styles.chipDot, { backgroundColor: group.color }]} />
            <Text style={styles.chipText}>{group.name}</Text>
          </View>
        )}
        <Text style={[styles.title, isCompleted && styles.titleCompleted]} numberOfLines={2}>
          {todo.title}
        </Text>
        {todo.description ? (
          <Text style={styles.description} numberOfLines={1}>{todo.description}</Text>
        ) : null}
        {todo.type === 'recurring' && <Text style={styles.recurring}>↻ RECURRING</Text>}
      </View>
      <View style={styles.actions}>
        <TouchableOpacity onPress={() => onEdit(todo)} style={styles.actionBtn}>
          <Text style={styles.actionText}>EDIT</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            Alert.alert('删除待办', '确定要删除这个待办事项吗？', [
              { text: '取消', style: 'cancel' },
              { text: '删除', style: 'destructive', onPress: () => onDelete(todo) },
            ]);
          }}
          style={styles.actionBtn}
        >
          <Text style={[styles.actionText, styles.actionDel]}>DEL</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(17,17,27,0.10)',
    backgroundColor: '#FAFAF7',
  },
  index: {
    width: 30,
    fontFamily: 'monospace',
    fontSize: 13,
    color: '#8A8A85',
    marginTop: 3,
    letterSpacing: 0.5,
  },
  indexDone: {
    color: '#E1352B',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 0,
    borderWidth: 1.5,
    borderColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: '#111111',
  },
  checkmark: {
    color: '#FAFAF7',
    fontSize: 12,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    marginRight: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  chipDot: {
    width: 7,
    height: 7,
    marginRight: 6,
  },
  chipText: {
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 1,
    color: '#8A8A85',
  },
  title: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111111',
    letterSpacing: -0.35,
  },
  titleCompleted: {
    textDecorationLine: 'line-through',
    color: '#8A8A85',
    opacity: 0.55,
  },
  description: {
    fontSize: 12,
    color: '#8A8A85',
    marginTop: 3,
    letterSpacing: -0.1,
  },
  recurring: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: '#E1352B',
    letterSpacing: 1,
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: 14,
    paddingTop: 3,
  },
  actionBtn: {
    paddingVertical: 2,
  },
  actionText: {
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 1,
    color: '#8A8A85',
  },
  actionDel: {
    color: '#E1352B',
  },
});
