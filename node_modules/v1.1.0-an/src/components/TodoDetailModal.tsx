import React from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import type { Todo, RecurringTodo } from '@hengsch/shared-types';
import { useGroups } from '../context/GroupContext';

interface TodoDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  todo: Todo | null;
  onEdit?: (todo: Todo) => void;
}

const CYCLE_LABELS: Record<string, string> = {
  daily: '每天',
  weekly: '每周',
  monthly: '每月',
  custom: '自定义',
};

export function TodoDetailModal({ isOpen, onClose, todo, onEdit }: TodoDetailModalProps): React.ReactElement {
  const { getGroupById } = useGroups();

  if (!isOpen || !todo) return <></>;

  const isCompleted = todo.status === 'completed';
  const isRecurring = todo.type === 'recurring';
  const recurringTodo = isRecurring ? (todo as RecurringTodo) : null;
  const group = todo.groupId ? getGroupById(todo.groupId) : null;

  return (
    <Modal visible={isOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>关闭</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>待办详情</Text>
          {onEdit && (
            <TouchableOpacity onPress={() => onEdit(todo)} style={styles.headerBtn}>
              <Text style={[styles.headerBtnText, styles.headerBtnPrimary]}>编辑</Text>
            </TouchableOpacity>
          )}
        </View>
        <ScrollView style={styles.body}>
          <View style={[styles.statusBadge, isCompleted ? styles.statusCompleted : styles.statusPending]}>
            <Text style={styles.statusText}>{isCompleted ? '✓ 已完成' : '○ 待完成'}</Text>
          </View>
          <Text style={styles.title}>{todo.title}</Text>
          {group && (
            <View style={[styles.badge, { backgroundColor: group.color }]}>
              <Text style={styles.badgeText}>{group.name}</Text>
            </View>
          )}
          {todo.description && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>描述</Text>
              <Text style={styles.sectionContent}>{todo.description}</Text>
            </View>
          )}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>类型</Text>
            <Text style={styles.sectionContent}>
              {isRecurring ? '循环待办事项' : '一次性待办事项'}
            </Text>
          </View>
          {isRecurring && recurringTodo && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>循环周期</Text>
              <Text style={styles.sectionContent}>
                {recurringTodo.cycleType === 'custom' && recurringTodo.customCycleDays
                  ? `每 ${recurringTodo.customCycleDays} 天`
                  : CYCLE_LABELS[recurringTodo.cycleType] || recurringTodo.cycleType}
              </Text>
            </View>
          )}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>创建时间</Text>
            <Text style={styles.sectionContent}>
              {new Date(todo.createdAt).toLocaleString('zh-CN')}
            </Text>
          </View>
          {isCompleted && todo.completedAt && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>完成时间</Text>
              <Text style={styles.sectionContent}>
                {new Date(todo.completedAt).toLocaleString('zh-CN')}
              </Text>
            </View>
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
  headerBtn: { padding: 8 },
  headerBtnText: { fontSize: 16, color: '#666' },
  headerBtnPrimary: { color: '#2196F3', fontWeight: '600' },
  headerTitle: { fontSize: 18, fontWeight: '600' },
  body: { flex: 1, padding: 16 },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 16,
  },
  statusCompleted: { backgroundColor: '#E8F5E9' },
  statusPending: { backgroundColor: '#FFF3E0' },
  statusText: { fontSize: 14, fontWeight: '500' },
  title: { fontSize: 22, fontWeight: '600', marginBottom: 12 },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 16,
  },
  badgeText: { fontSize: 12, color: '#666' },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 12, color: '#999', marginBottom: 4 },
  sectionContent: { fontSize: 16, color: '#333' },
});
