import React from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent
} from 'react-native';
import type { Todo } from '@hengsch/shared-types';
import { useGroups } from '../context/GroupContext';
import {
  formatShortDate,
  getTodoStatusLabel,
  getTodoTypeLabel
} from '../utils/todoPresentation';

interface TodoCardProps {
  todo: Todo;
  onToggle: (id: string) => void;
  onPress: (todo: Todo) => void;
  onEdit: (todo: Todo) => void;
  onDelete: (todo: Todo) => void;
}

export function TodoCard({
  todo,
  onToggle,
  onPress,
  onEdit,
  onDelete
}: TodoCardProps): React.ReactElement {
  const isCompleted = todo.status === 'completed';
  const { getGroupById } = useGroups();
  const group = todo.groupId ? getGroupById(todo.groupId) : undefined;

  const handleToggle = (event: GestureResponderEvent): void => {
    event.stopPropagation();
    onToggle(todo.id);
  };

  const handleEdit = (event: GestureResponderEvent): void => {
    event.stopPropagation();
    onEdit(todo);
  };

  const handleDelete = (event: GestureResponderEvent): void => {
    event.stopPropagation();
    Alert.alert('删除待办', '确定要删除这条待办事项吗？', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => onDelete(todo) }
    ]);
  };

  return (
    <Pressable
      style={[styles.card, isCompleted && styles.cardCompleted]}
      onPress={() => onPress(todo)}
    >
      <View style={styles.cardHeader}>
        <View style={styles.headerTags}>
          <View style={[styles.groupBadge, { backgroundColor: group?.color ?? '#f4f0e7' }]}>
            <Text style={styles.groupBadgeText}>{group?.name ?? '未分类'}</Text>
          </View>
          {todo.type === 'recurring' ? (
            <View style={styles.metaBadge}>
              <Text style={styles.metaBadgeText}>{getTodoTypeLabel(todo)}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.dateLabel}>{formatShortDate(todo.createdAt)}</Text>
      </View>

      <View style={styles.cardMain}>
        <Pressable
          style={[styles.checkbox, isCompleted && styles.checkboxChecked]}
          onPress={handleToggle}
        >
          <Text style={[styles.checkboxText, isCompleted && styles.checkboxTextChecked]}>
            {isCompleted ? '✓' : ''}
          </Text>
        </Pressable>

        <View style={styles.copy}>
          <Text style={[styles.title, isCompleted && styles.titleCompleted]} numberOfLines={2}>
            {todo.title}
          </Text>
          <Text style={styles.description} numberOfLines={2}>
            {todo.description || '点击展开详情，补充背景、目标或完成边界。'}
          </Text>
        </View>
      </View>

      <View style={styles.cardFooter}>
        <View
          style={[
            styles.statusBadge,
            isCompleted ? styles.statusBadgeCompleted : styles.statusBadgePending
          ]}
        >
          <Text style={styles.statusBadgeText}>{getTodoStatusLabel(todo.status)}</Text>
        </View>

        <View style={styles.actions}>
          <Pressable style={styles.actionButton} onPress={handleEdit}>
            <Text style={styles.actionButtonText}>编辑</Text>
          </Pressable>
          <Pressable style={[styles.actionButton, styles.actionButtonDelete]} onPress={handleDelete}>
            <Text style={[styles.actionButtonText, styles.actionButtonDeleteText]}>删除</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 26,
    padding: 18,
    backgroundColor: '#fffaf0',
    borderWidth: 1,
    borderColor: '#e2d6c3',
    gap: 16,
    shadowColor: '#2f2419',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 2
  },
  cardCompleted: {
    opacity: 0.88
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12
  },
  headerTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    flex: 1
  },
  groupBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  groupBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3c3125'
  },
  metaBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f1e7d0'
  },
  metaBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#7a6045'
  },
  dateLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8a7f72'
  },
  cardMain: {
    flexDirection: 'row',
    gap: 14
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#c9baa6',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2
  },
  checkboxChecked: {
    backgroundColor: '#2f2419',
    borderColor: '#2f2419'
  },
  checkboxText: {
    fontSize: 14,
    fontWeight: '700',
    color: 'transparent'
  },
  checkboxTextChecked: {
    color: '#fffaf0'
  },
  copy: {
    flex: 1,
    gap: 6
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2f2419',
    lineHeight: 25
  },
  titleCompleted: {
    textDecorationLine: 'line-through',
    color: '#7d7467'
  },
  description: {
    fontSize: 14,
    lineHeight: 21,
    color: '#73685a'
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999
  },
  statusBadgePending: {
    backgroundColor: '#f0e3b5'
  },
  statusBadgeCompleted: {
    backgroundColor: '#c6d9cf'
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3d3226'
  },
  actions: {
    flexDirection: 'row',
    gap: 8
  },
  actionButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#efe5d1'
  },
  actionButtonDelete: {
    backgroundColor: '#f4ddd2'
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3c3125'
  },
  actionButtonDeleteText: {
    color: '#8c3b2c'
  }
});
