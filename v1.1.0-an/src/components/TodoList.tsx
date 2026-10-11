import React, { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import type { Todo } from '@hengsch/shared-types';
import { useTodos } from '../context/TodoContext';
import { useGroups } from '../context/GroupContext';
import { TodoCard } from './TodoCard';

interface TodoListProps {
  onDetail: (todo: Todo) => void;
}

export function TodoList({ onDetail }: TodoListProps): React.ReactElement {
  const { state, toggleTodoStatus } = useTodos();
  const { state: groupState } = useGroups();
  const [selectedGroupId, setSelectedGroupId] = useState<string>('all');

  const filteredTodos =
    selectedGroupId === 'all'
      ? state.todos
      : state.todos.filter((todo) => todo.groupId === selectedGroupId);

  const renderItem = ({ item, index }: { item: Todo; index: number }) => (
    <TodoCard
      todo={item}
      index={index}
      onToggle={toggleTodoStatus}
      onPress={onDetail}
    />
  );

  if (state.todos.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>NO TASKS</Text>
        <Text style={styles.emptySub}>点击左上角 ＋ 添加第一条待办</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.filterWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filter}>
          <TouchableOpacity
            style={[styles.filterItem, selectedGroupId === 'all' && styles.filterItemActive]}
            onPress={() => setSelectedGroupId('all')}
          >
            <Text style={[styles.filterText, selectedGroupId === 'all' && styles.filterTextActive]}>ALL</Text>
          </TouchableOpacity>
          {groupState.groups.map((group) => (
            <TouchableOpacity
              key={group.id}
              style={[styles.filterItem, selectedGroupId === group.id && styles.filterItemActive]}
              onPress={() => setSelectedGroupId(group.id)}
            >
              <View style={[styles.filterDot, { backgroundColor: group.color }]} />
              <Text style={[styles.filterText, selectedGroupId === group.id && styles.filterTextActive]}>
                {group.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      <FlatList
        data={filteredTodos}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF7' },
  filterWrap: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(17,17,27,0.10)',
  },
  filter: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingVertical: 10,
    gap: 8,
  },
  filterItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 0,
    borderWidth: 1.5,
    borderColor: '#111111',
    backgroundColor: '#FAFAF7',
  },
  filterItemActive: {
    backgroundColor: '#111111',
  },
  filterDot: {
    width: 7,
    height: 7,
    marginRight: 6,
    borderWidth: 1,
    borderColor: 'rgba(17,17,17,0.25)',
  },
  filterText: {
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 1.5,
    color: '#111111',
    fontWeight: '700',
  },
  filterTextActive: {
    color: '#FAFAF7',
  },
  list: {
    paddingBottom: 24,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#FAFAF7',
  },
  emptyText: {
    fontFamily: 'monospace',
    fontSize: 16,
    letterSpacing: 3,
    color: '#111111',
    marginBottom: 10,
  },
  emptySub: {
    fontSize: 12,
    color: '#8A8A85',
  },
});
