import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Todo } from '@hengsch/shared-types';
import { useGroups } from '../context/GroupContext';
import {
  formatFullDate,
  getTodoStatusLabel,
  getTodoTypeLabel
} from '../utils/todoPresentation';

interface TodoDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  todo: Todo | null;
  onEdit?: (todo: Todo) => void;
}

function MetaCard({
  label,
  value
}: {
  label: string;
  value: string;
}): React.ReactElement {
  return (
    <View style={styles.metaCard}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

export function TodoDetailModal({
  isOpen,
  onClose,
  todo,
  onEdit
}: TodoDetailModalProps): React.ReactElement {
  const { getGroupById } = useGroups();

  if (!isOpen || !todo) {
    return <></>;
  }

  const group = todo.groupId ? getGroupById(todo.groupId) : undefined;
  const isCompleted = todo.status === 'completed';

  return (
    <Modal visible={isOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.headerKicker}>待办详情</Text>
            <Text style={styles.headerTitle}>{todo.title}</Text>
            <Text style={styles.headerDescription}>
              把背景、状态和归属收在一起，方便你在手机上快速判断下一步。
            </Text>
          </View>
          <View style={styles.headerActions}>
            {onEdit ? (
              <Pressable style={styles.headerAction} onPress={() => onEdit(todo)}>
                <Text style={styles.headerActionText}>编辑</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.headerAction} onPress={onClose}>
              <Text style={styles.headerActionText}>关闭</Text>
            </Pressable>
          </View>
        </View>

        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          <View style={styles.heroCard}>
            <View
              style={[
                styles.statusBadge,
                isCompleted ? styles.statusBadgeCompleted : styles.statusBadgePending
              ]}
            >
              <Text style={styles.statusBadgeText}>{getTodoStatusLabel(todo.status)}</Text>
            </View>
            <Text style={styles.heroTitle}>{todo.title}</Text>
            <Text style={styles.heroDescription}>
              {todo.description || '这条待办还没有补充描述，你可以在编辑里添加背景说明。'}
            </Text>
          </View>

          <View style={styles.metaGrid}>
            <MetaCard label="所属分组" value={group?.name ?? '未分类'} />
            <MetaCard label="任务类型" value={getTodoTypeLabel(todo)} />
            <MetaCard label="创建时间" value={formatFullDate(todo.createdAt)} />
            <MetaCard label="当前状态" value={getTodoStatusLabel(todo.status)} />
            {todo.completedAt ? (
              <MetaCard label="完成时间" value={formatFullDate(todo.completedAt)} />
            ) : null}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f5efe2'
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0d4c0',
    gap: 16
  },
  headerCopy: {
    gap: 6
  },
  headerKicker: {
    fontSize: 12,
    fontWeight: '700',
    color: '#7c936a',
    letterSpacing: 1
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#2f2419'
  },
  headerDescription: {
    fontSize: 14,
    lineHeight: 21,
    color: '#6f6456'
  },
  headerActions: {
    flexDirection: 'row',
    gap: 10
  },
  headerAction: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#e9deca'
  },
  headerActionText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#3d3226'
  },
  body: {
    flex: 1
  },
  bodyContent: {
    padding: 20,
    gap: 16
  },
  heroCard: {
    borderRadius: 28,
    padding: 22,
    backgroundColor: '#fffaf0',
    borderWidth: 1,
    borderColor: '#e2d6c3',
    gap: 12
  },
  statusBadge: {
    alignSelf: 'flex-start',
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
  heroTitle: {
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 32,
    color: '#2f2419'
  },
  heroDescription: {
    fontSize: 15,
    lineHeight: 24,
    color: '#6f6456'
  },
  metaGrid: {
    gap: 12
  },
  metaCard: {
    borderRadius: 22,
    padding: 18,
    backgroundColor: '#fffaf0',
    borderWidth: 1,
    borderColor: '#e2d6c3',
    gap: 6
  },
  metaLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8b7f72'
  },
  metaValue: {
    fontSize: 16,
    lineHeight: 24,
    color: '#2f2419'
  }
});
