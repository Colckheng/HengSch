import React, { useMemo, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import type { Todo } from '@hengsch/shared-types';
import { AddTodoModal } from './src/components/AddTodoModal';
import { EditTodoModal } from './src/components/EditTodoModal';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { GroupManagerModal } from './src/components/GroupManagerModal';
import { TodoDetailModal } from './src/components/TodoDetailModal';
import { TodoList } from './src/components/TodoList';
import { GroupProvider, useGroups } from './src/context/GroupContext';
import { TodoProvider, useTodos } from './src/context/TodoContext';
import { formatHeaderDate } from './src/utils/todoPresentation';

function StatCard({
  label,
  value
}: {
  label: string;
  value: string | number;
}): React.ReactElement {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function AppContent(): React.ReactElement {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isGroupOpen, setIsGroupOpen] = useState(false);
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [detailTodo, setDetailTodo] = useState<Todo | null>(null);
  const { state: todoState } = useTodos();
  const { state: groupState } = useGroups();

  const pendingTodos = useMemo(
    () => todoState.todos.filter((todo) => todo.status === 'pending'),
    [todoState.todos]
  );
  const completedTodos = useMemo(
    () => todoState.todos.filter((todo) => todo.status === 'completed'),
    [todoState.todos]
  );
  const recurringTodos = useMemo(
    () => todoState.todos.filter((todo) => todo.type === 'recurring'),
    [todoState.todos]
  );

  const totalCount = todoState.todos.length;
  const progressRate =
    totalCount > 0 ? Math.round((completedTodos.length / totalCount) * 100) : 0;
  const customGroupCount = Math.max(groupState.groups.length - 1, 0);
  const focusTodo = pendingTodos[0] ?? null;
  const todayLabel = formatHeaderDate();
  const heroDescription = focusTodo
    ? `现在最适合推进的是“${focusTodo.title}”。把版面收紧一点，事情会更快动起来。`
    : '先写下一件你真的准备动手的事，页面就会从空白变成今天的工作台。';
  const heroSupportText =
    totalCount === 0
      ? '右下角的新增按钮会一直留在手边，先把第一件任务贴上来。'
      : `当前共 ${totalCount} 件事项，已完成 ${completedTodos.length} 件，今天的完成率是 ${progressRate}%。`;

  const handleOpenEdit = (todo: Todo): void => {
    setEditingTodo(todo);
    setIsEditOpen(true);
  };

  const handleOpenDetail = (todo: Todo): void => {
    setDetailTodo(todo);
    setIsDetailOpen(true);
  };

  const handleDetailEdit = (todo: Todo): void => {
    setIsDetailOpen(false);
    setDetailTodo(null);
    setEditingTodo(todo);
    setIsEditOpen(true);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.shell}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={styles.brandBlock}>
              <View style={styles.brandMark}>
                <Text style={styles.brandMarkText}>HS</Text>
              </View>
              <View style={styles.brandCopy}>
                <Text style={styles.brandKicker}>HengSch Todo</Text>
                <Text style={styles.brandTitle}>移动工作台</Text>
                <Text style={styles.brandSubtitle}>尽量对齐桌面端气质，但优先保证触屏节奏。</Text>
              </View>
            </View>

            <Pressable style={styles.headerButton} onPress={() => setIsGroupOpen(true)}>
              <Text style={styles.headerButtonText}>分组管理</Text>
            </Pressable>
          </View>

          <View style={styles.hero}>
            <View style={styles.heroCard}>
              <Text style={styles.heroDate}>{todayLabel}</Text>
              <Text style={styles.heroTitle}>把今天最重要的一件事，摆到桌面中央。</Text>
              <Text style={styles.heroDescription}>{heroDescription}</Text>
              <Text style={styles.heroSupport}>{heroSupportText}</Text>

              <View style={styles.heroActions}>
                <Pressable style={styles.heroPrimaryAction} onPress={() => setIsAddOpen(true)}>
                  <Text style={styles.heroPrimaryActionText}>新建待办</Text>
                </Pressable>
                <Pressable style={styles.heroSecondaryAction} onPress={() => setIsGroupOpen(true)}>
                  <Text style={styles.heroSecondaryActionText}>整理分组</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.focusCard}>
              <Text style={styles.focusKicker}>{focusTodo ? '当前焦点' : '准备开始'}</Text>
              <Text style={styles.focusTitle}>
                {focusTodo?.title ?? '让版面先出现第一张任务卡片'}
              </Text>
              <Text style={styles.focusDescription}>
                {focusTodo?.description ??
                  '把标题写得更具体一点，例如“整理发布页文案”或“补全接口错误提示”，会更容易开始。'}
              </Text>

              <View style={styles.focusFooter}>
                <Text style={styles.focusFooterLabel}>完成率</Text>
                <Text style={styles.focusFooterValue}>{progressRate}%</Text>
              </View>
            </View>
          </View>

          <View style={styles.statsRow}>
            <StatCard label="待推进" value={pendingTodos.length} />
            <StatCard label="已完成" value={completedTodos.length} />
            <StatCard label="循环事项" value={recurringTodos.length} />
            <StatCard label="自定义分组" value={customGroupCount} />
          </View>

          <View style={styles.workspacePanel}>
            <TodoList onEdit={handleOpenEdit} onDetail={handleOpenDetail} />
          </View>
        </ScrollView>

        <Pressable style={styles.floatingButton} onPress={() => setIsAddOpen(true)}>
          <Text style={styles.floatingButtonText}>+ 新建待办</Text>
        </Pressable>

        <AddTodoModal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} />
        <EditTodoModal
          isOpen={isEditOpen}
          onClose={() => {
            setIsEditOpen(false);
            setEditingTodo(null);
          }}
          todo={editingTodo}
        />
        <TodoDetailModal
          isOpen={isDetailOpen}
          onClose={() => {
            setIsDetailOpen(false);
            setDetailTodo(null);
          }}
          todo={detailTodo}
          onEdit={handleDetailEdit}
        />
        <GroupManagerModal isOpen={isGroupOpen} onClose={() => setIsGroupOpen(false)} />
      </View>
    </SafeAreaView>
  );
}

export default function App(): React.ReactElement {
  return (
    <ErrorBoundary>
      <GroupProvider>
        <TodoProvider>
          <AppContent />
        </TodoProvider>
      </GroupProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#efe6d6'
  },
  shell: {
    flex: 1
  },
  scrollView: {
    flex: 1
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 188,
    gap: 18
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 14
  },
  brandBlock: {
    flexDirection: 'row',
    gap: 12,
    flex: 1
  },
  brandMark: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2f2419'
  },
  brandMarkText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fffaf0'
  },
  brandCopy: {
    flex: 1,
    gap: 2
  },
  brandKicker: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9d6d2f',
    letterSpacing: 1
  },
  brandTitle: {
    fontSize: 30,
    fontWeight: '700',
    color: '#2f2419'
  },
  brandSubtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: '#6f6456'
  },
  headerButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#e9deca'
  },
  headerButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#3d3226'
  },
  hero: {
    gap: 14
  },
  heroCard: {
    borderRadius: 30,
    padding: 24,
    backgroundColor: '#fffaf0',
    borderWidth: 1,
    borderColor: '#e2d6c3',
    gap: 10
  },
  heroDate: {
    fontSize: 13,
    fontWeight: '700',
    color: '#7d7467'
  },
  heroTitle: {
    fontSize: 30,
    fontWeight: '700',
    lineHeight: 38,
    color: '#2f2419'
  },
  heroDescription: {
    fontSize: 16,
    lineHeight: 24,
    color: '#3f3428'
  },
  heroSupport: {
    fontSize: 14,
    lineHeight: 22,
    color: '#6f6456'
  },
  heroActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6
  },
  heroPrimaryAction: {
    flex: 1,
    minHeight: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2f2419'
  },
  heroPrimaryActionText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fffaf0'
  },
  heroSecondaryAction: {
    flex: 1,
    minHeight: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e9deca'
  },
  heroSecondaryActionText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#3d3226'
  },
  focusCard: {
    borderRadius: 28,
    padding: 20,
    backgroundColor: '#2f2419',
    gap: 10
  },
  focusKicker: {
    fontSize: 12,
    fontWeight: '700',
    color: '#e8c56a',
    letterSpacing: 1
  },
  focusTitle: {
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 32,
    color: '#fffaf0'
  },
  focusDescription: {
    fontSize: 15,
    lineHeight: 22,
    color: '#e9deca'
  },
  focusFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6
  },
  focusFooterLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#d8ccb7'
  },
  focusFooterValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fffaf0'
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  statCard: {
    width: '47%',
    minWidth: 150,
    borderRadius: 22,
    padding: 16,
    backgroundColor: '#fffaf0',
    borderWidth: 1,
    borderColor: '#e2d6c3',
    gap: 6
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#7d7467'
  },
  statValue: {
    fontSize: 26,
    fontWeight: '700',
    color: '#2f2419'
  },
  workspacePanel: {
    gap: 12
  },
  floatingButton: {
    position: 'absolute',
    right: 18,
    bottom: 26,
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#2f2419',
    shadowColor: '#2f2419',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
    elevation: 8
  },
  floatingButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fffaf0'
  }
});
