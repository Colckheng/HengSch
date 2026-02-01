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

  const renderItem = ({ item }: { item: Todo }) => (
    <TodoCard
      todo={item}
      onToggle={toggleTodoStatus}
      onPress={onDetail}
      onEdit={onEdit}
      onDelete={handleDelete}
    />
  );

  if (state.todos.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>暂无待办事项</Text>
        <Text style={styles.emptySub}>点击上方 + 按钮添加</Text>
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
          <Text style={[styles.filterText, selectedGroupId === 'all' && styles.filterTextActive]}>
            全部
          </Text>
        </TouchableOpacity>
        {groupState.groups.map((group) => (
          <TouchableOpacity
            key={group.id}
            style={[
              styles.filterItem,
              selectedGroupId === group.id && styles.filterItemActive,
              selectedGroupId === group.id && { backgroundColor: group.color },
            ]}
            onPress={() => setSelectedGroupId(group.id)}
          >
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
  container: { flex: 1 },
  filter: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    flexWrap: 'wrap',
  },
  filterItem: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
  },
  filterItemActive: {
    backgroundColor: '#e0e0e0',
  },
  filterText: {
    fontSize: 14,
    color: '#666',
  },
  filterTextActive: {
    color: '#333',
    fontWeight: '600',
  },
  list: {
    paddingBottom: 24,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 18,
    color: '#999',
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 14,
    color: '#bbb',
  },
});
