import React from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import type { Todo, RecurringTodo } from '@hengsch/shared-types';
import { useGroups } from '../context/GroupContext';

interface TodoDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  todo: Todo | null;
  onEdit?: (todo: Todo) => void;
  onDelete?: (todo: Todo) => void;
}

const CYCLE_LABELS: Record<string, string> = {
  daily: '每天',
  weekly: '每周',
  monthly: '每月',
  custom: '自定义',
};

export function TodoDetailModal({ isOpen, onClose, todo, onEdit, onDelete }: TodoDetailModalProps): React.ReactElement {
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
          <View style={styles.headerRight}>
            {onEdit && (
              <TouchableOpacity onPress={() => onEdit(todo)} style={styles.headerBtn}>
                <Text style={[styles.headerBtnText, styles.headerBtnPrimary]}>编辑</Text>
              </TouchableOpacity>
            )}
            {onDelete && (
              <TouchableOpacity onPress={() => onDelete(todo)} style={styles.headerBtn}>
                <Text style={[styles.headerBtnText, styles.headerBtnDanger]}>删除</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        <ScrollView style={styles.body}>
          <View style={[styles.statusBadge, isCompleted ? styles.statusCompleted : styles.statusPending]}>
            <Text style={[styles.statusText, isCompleted && styles.statusTextDone]}>{isCompleted ? '✓ DONE' : '○ PENDING'}</Text>
          </View>
          <Text style={styles.title}>{todo.title}</Text>
          {group && (
            <View style={styles.badge}>
              <View style={[styles.badgeDot, { backgroundColor: group.color }]} />
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
  headerBtn: { padding: 4, minWidth: 44 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerBtnText: { fontFamily: 'monospace', fontSize: 13, color: '#111111', letterSpacing: 1 },
  headerBtnPrimary: { color: '#111111', fontWeight: '700', textAlign: 'right' },
  headerBtnDanger: { color: '#E1352B', fontWeight: '700', textAlign: 'right' },
  headerTitle: { fontFamily: 'monospace', fontSize: 12, fontWeight: '700', letterSpacing: 2, color: '#111111' },
  body: { flex: 1, paddingHorizontal: 20 },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 0,
    borderWidth: 1.5,
    marginBottom: 16,
    marginTop: 18,
  },
  statusCompleted: { backgroundColor: '#111111', borderColor: '#111111' },
  statusPending: { backgroundColor: '#FAFAF7', borderColor: '#E1352B' },
  statusText: { fontFamily: 'monospace', fontSize: 11, fontWeight: '700', letterSpacing: 1, color: '#111111' },
  statusTextDone: { color: '#FAFAF7' },
  title: { fontSize: 24, fontWeight: '700', color: '#111111', letterSpacing: -0.6, marginBottom: 14 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 0,
    borderWidth: 1.5,
    borderColor: '#111111',
    marginBottom: 16,
  },
  badgeDot: { width: 7, height: 7, marginRight: 8 },
  badgeText: { fontFamily: 'monospace', fontSize: 10, letterSpacing: 1, color: '#111111' },
  section: {
    marginBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(17,17,27,0.10)',
    paddingBottom: 14,
  },
  sectionTitle: { fontFamily: 'monospace', fontSize: 10, letterSpacing: 2, color: '#8A8A85', marginBottom: 6 },
  sectionContent: { fontSize: 15, color: '#111111', lineHeight: 22 },
});
