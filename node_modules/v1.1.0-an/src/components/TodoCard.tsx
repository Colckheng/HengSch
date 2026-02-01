import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import type { Todo } from '@hengsch/shared-types';
import { useGroups } from '../context/GroupContext';

interface TodoCardProps {
  todo: Todo;
  onToggle: (id: string) => void;
  onPress: (todo: Todo) => void;
  onEdit: (todo: Todo) => void;
  onDelete: (todo: Todo) => void;
}

export function TodoCard({ todo, onToggle, onPress, onEdit, onDelete }: TodoCardProps): React.ReactElement {
  const isCompleted = todo.status === 'completed';
  const { getGroupById } = useGroups();
  const group = todo.groupId ? getGroupById(todo.groupId) : undefined;

  return (
    <TouchableOpacity
      style={[styles.card, group && { backgroundColor: group.color }]}
      onPress={() => onPress(todo)}
      activeOpacity={0.7}
    >
      <TouchableOpacity
        style={[styles.checkbox, isCompleted && styles.checkboxChecked]}
        onPress={() => onToggle(todo.id)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {isCompleted && <Text style={styles.checkmark}>✓</Text>}
      </TouchableOpacity>
      <View style={styles.content}>
        {group && (
          <View style={[styles.badge, { backgroundColor: group.color }]}>
            <Text style={styles.badgeText}>{group.name}</Text>
          </View>
        )}
        <Text style={[styles.title, isCompleted && styles.titleCompleted]} numberOfLines={2}>
          {todo.title}
        </Text>
        {todo.description ? (
          <Text style={styles.description} numberOfLines={1}>{todo.description}</Text>
        ) : null}
        {todo.type === 'recurring' && (
          <Text style={styles.recurringBadge}>循环</Text>
        )}
      </View>
      <View style={styles.actions}>
        <TouchableOpacity onPress={() => onEdit(todo)} style={styles.actionBtn}>
          <Text>✏️</Text>
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
          <Text>🗑️</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginHorizontal: 16,
    marginVertical: 6,
    borderRadius: 12,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#bbb',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxChecked: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  checkmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 4,
  },
  badgeText: {
    fontSize: 10,
    color: '#666',
  },
  title: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  titleCompleted: {
    textDecorationLine: 'line-through',
    color: '#999',
  },
  description: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  recurringBadge: {
    fontSize: 10,
    color: '#2196F3',
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    padding: 8,
  },
});
