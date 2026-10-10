import React, { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import type { Todo } from '@hengsch/shared-types';
import { useTodos } from '../context/TodoContext';
import { useGroups } from '../context/GroupContext';
import { TodoCard } from './TodoCard';

interface TodoListProps {
  onEdit: (todo: Todo) => void;
  onDetail: (todo: Todo) => void;
}

export function TodoList({ onEdit, onDetail }: TodoListProps): React.ReactElement {
  const { state, toggleTodoStatus, deleteTodo } = useTodos();
  const { state: groupState } = useGroups();
  const [selectedGroupId, setSelectedGroupId] = useState<string>('all');

  const filteredTodos =
    selectedGroupId === 'all'
      ? state.todos
      : state.todos.filter((todo) => todo.groupId === selectedGroupId);

  const handleDelete = (todo: Todo) => {
    deleteTodo(todo.id);
  };

  const renderItem = ({ item, index }: { item: Todo; index: number }) => (
    <TodoCard
      todo={item}
      index={index}
      onToggle={toggleTodoStatus}
      onPress={onDetail}
      onEdit={onEdit}
      onDelete={handleDelete}
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
      <View style={styles.filter}>
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
  filter: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 12,
    gap: 8,
    flexWrap: 'wrap',
  },
  filterItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
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
