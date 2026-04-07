import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Todo } from '@hengsch/shared-types';
import { useGroups } from '../context/GroupContext';
import { useTodos } from '../context/TodoContext';
import { TodoCard } from './TodoCard';

interface TodoListProps {
  onEdit: (todo: Todo) => void;
  onDetail: (todo: Todo) => void;
}

function SectionEmpty({
  title,
  description
}: {
  title: string;
  description: string;
}): React.ReactElement {
  return (
    <View style={styles.sectionEmpty}>
      <Text style={styles.sectionEmptyTitle}>{title}</Text>
      <Text style={styles.sectionEmptyDescription}>{description}</Text>
    </View>
  );
}

export function TodoList({ onEdit, onDetail }: TodoListProps): React.ReactElement {
  const { state, toggleTodoStatus, deleteTodo } = useTodos();
  const { state: groupState } = useGroups();
  const [selectedGroupId, setSelectedGroupId] = useState<string>('all');

  const filteredTodos = useMemo(() => {
    if (selectedGroupId === 'all') {
      return state.todos;
    }

    return state.todos.filter((todo) => todo.groupId === selectedGroupId);
  }, [selectedGroupId, state.todos]);

  const pendingTodos = useMemo(
    () => filteredTodos.filter((todo) => todo.status !== 'completed'),
    [filteredTodos]
  );
  const completedTodos = useMemo(
    () => filteredTodos.filter((todo) => todo.status === 'completed'),
    [filteredTodos]
  );
  const progressRate =
    filteredTodos.length > 0 ? Math.round((completedTodos.length / filteredTodos.length) * 100) : 0;
  const selectedGroupName =
    selectedGroupId === 'all'
      ? '全部事项'
      : groupState.groups.find((group) => group.id === selectedGroupId)?.name ?? '当前分组';

  if (state.todos.length === 0) {
    return (
      <View style={styles.emptyBoard}>
        <Text style={styles.boardKicker}>工作版</Text>
        <Text style={styles.emptyBoardTitle}>版面已经准备好了，就差第一件真正要推进的事。</Text>
        <Text style={styles.emptyBoardDescription}>
          先写一条短标题，再决定分组或循环方式，页面就会从空白变成今天的工作台。
        </Text>
        <View style={styles.emptyChecklist}>
          <View style={styles.emptyNote}>
            <Text style={styles.emptyNoteIndex}>01</Text>
            <Text style={styles.emptyNoteTitle}>先把第一件事贴上来</Text>
          </View>
          <View style={styles.emptyNote}>
            <Text style={styles.emptyNoteIndex}>02</Text>
            <Text style={styles.emptyNoteTitle}>再决定是否需要分组</Text>
          </View>
          <View style={styles.emptyNote}>
            <Text style={styles.emptyNoteIndex}>03</Text>
            <Text style={styles.emptyNoteTitle}>循环任务留给重复工作</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.boardHeader}>
        <View style={styles.boardHeaderCopy}>
          <Text style={styles.boardKicker}>工作版</Text>
          <Text style={styles.boardTitle}>{selectedGroupName}</Text>
          <Text style={styles.boardDescription}>
            保留桌面端的任务分区逻辑，把操作节奏改成更适合手机的一屏一段。
          </Text>
        </View>
        <View style={styles.boardSummary}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>待推进</Text>
            <Text style={styles.summaryValue}>{pendingTodos.length}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>已完成</Text>
            <Text style={styles.summaryValue}>{completedTodos.length}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>完成率</Text>
            <Text style={styles.summaryValue}>{progressRate}%</Text>
          </View>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        <Pressable
          style={[styles.filterChip, selectedGroupId === 'all' && styles.filterChipActive]}
          onPress={() => setSelectedGroupId('all')}
        >
          <Text style={[styles.filterChipText, selectedGroupId === 'all' && styles.filterChipTextActive]}>
            全部
          </Text>
        </Pressable>
        {groupState.groups.map((group) => (
          <Pressable
            key={group.id}
            style={[
              styles.filterChip,
              selectedGroupId === group.id && styles.filterChipActive,
              selectedGroupId === group.id ? { backgroundColor: group.color, borderColor: group.color } : null
            ]}
            onPress={() => setSelectedGroupId(group.id)}
          >
            <Text
              style={[
                styles.filterChipText,
                selectedGroupId === group.id && styles.filterChipTextActive
              ]}
            >
              {group.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.sections}>
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <View style={[styles.sectionDot, styles.sectionDotPending]} />
              <View style={styles.sectionTitleCopy}>
                <Text style={styles.sectionTitle}>进行中 / 待开始</Text>
                <Text style={styles.sectionDescription}>把今天真正需要推进的事项集中在这里。</Text>
              </View>
            </View>
            <Text style={styles.sectionCount}>{pendingTodos.length}</Text>
          </View>

          <View style={styles.stack}>
            {pendingTodos.length > 0 ? (
              pendingTodos.map((todo) => (
                <TodoCard
                  key={todo.id}
                  todo={todo}
                  onToggle={toggleTodoStatus}
                  onPress={onDetail}
                  onEdit={onEdit}
                  onDelete={(targetTodo) => deleteTodo(targetTodo.id)}
                />
              ))
            ) : (
              <SectionEmpty
                title="待推进"
                description="当前筛选条件下还没有待推进的任务。"
              />
            )}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <View style={[styles.sectionDot, styles.sectionDotCompleted]} />
              <View style={styles.sectionTitleCopy}>
                <Text style={styles.sectionTitle}>已完成</Text>
                <Text style={styles.sectionDescription}>收起已经结束的事项，方便回看节奏。</Text>
              </View>
            </View>
            <Text style={styles.sectionCount}>{completedTodos.length}</Text>
          </View>

          <View style={styles.stack}>
            {completedTodos.length > 0 ? (
              completedTodos.map((todo) => (
                <TodoCard
                  key={todo.id}
                  todo={todo}
                  onToggle={toggleTodoStatus}
                  onPress={onDetail}
                  onEdit={onEdit}
                  onDelete={(targetTodo) => deleteTodo(targetTodo.id)}
                />
              ))
            ) : (
              <SectionEmpty
                title="已完成"
                description="完成过的事项会被收进这里，方便回顾进度。"
              />
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 18
  },
  emptyBoard: {
    borderRadius: 30,
    padding: 24,
    backgroundColor: '#fffaf0',
    borderWidth: 1,
    borderColor: '#e2d6c3',
    gap: 14
  },
  boardKicker: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9d6d2f',
    letterSpacing: 1
  },
  emptyBoardTitle: {
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 32,
    color: '#2f2419'
  },
  emptyBoardDescription: {
    fontSize: 15,
    lineHeight: 23,
    color: '#6f6456'
  },
  emptyChecklist: {
    gap: 10
  },
  emptyNote: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#f7f1e6',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  emptyNoteIndex: {
    fontSize: 13,
    fontWeight: '700',
    color: '#9d6d2f'
  },
  emptyNoteTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#3e3428'
  },
  boardHeader: {
    gap: 14
  },
  boardHeaderCopy: {
    gap: 6
  },
  boardTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#2f2419'
  },
  boardDescription: {
    fontSize: 14,
    lineHeight: 21,
    color: '#6f6456'
  },
  boardSummary: {
    flexDirection: 'row',
    gap: 10
  },
  summaryCard: {
    flex: 1,
    borderRadius: 20,
    padding: 14,
    backgroundColor: '#fffaf0',
    borderWidth: 1,
    borderColor: '#e2d6c3',
    gap: 6
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#7d7467'
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2f2419'
  },
  filterRow: {
    gap: 10,
    paddingRight: 12
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#ded2bf',
    backgroundColor: '#f7f1e6'
  },
  filterChipActive: {
    backgroundColor: '#e8c56a',
    borderColor: '#e8c56a'
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#5b5145'
  },
  filterChipTextActive: {
    color: '#2f2419'
  },
  sections: {
    gap: 16
  },
  section: {
    gap: 12
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12
  },
  sectionTitleRow: {
    flexDirection: 'row',
    gap: 10,
    flex: 1
  },
  sectionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 6
  },
  sectionDotPending: {
    backgroundColor: '#e0b24d'
  },
  sectionDotCompleted: {
    backgroundColor: '#7cad8d'
  },
  sectionTitleCopy: {
    flex: 1,
    gap: 4
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2f2419'
  },
  sectionDescription: {
    fontSize: 13,
    lineHeight: 19,
    color: '#766b5d'
  },
  sectionCount: {
    minWidth: 34,
    textAlign: 'right',
    fontSize: 22,
    fontWeight: '700',
    color: '#2f2419'
  },
  stack: {
    gap: 12
  },
  sectionEmpty: {
    borderRadius: 22,
    padding: 18,
    backgroundColor: '#fffaf0',
    borderWidth: 1,
    borderColor: '#e2d6c3',
    gap: 6
  },
  sectionEmptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#7d7467'
  },
  sectionEmptyDescription: {
    fontSize: 14,
    lineHeight: 21,
    color: '#6f6456'
  }
});
