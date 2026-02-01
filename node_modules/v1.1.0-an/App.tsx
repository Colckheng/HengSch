import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { TodoProvider } from './src/context/TodoContext';
import { GroupProvider } from './src/context/GroupContext';
import { TodoList } from './src/components/TodoList';
import { AddTodoModal } from './src/components/AddTodoModal';
import { EditTodoModal } from './src/components/EditTodoModal';
import { TodoDetailModal } from './src/components/TodoDetailModal';
import { GroupManagerModal } from './src/components/GroupManagerModal';
import type { Todo } from '@hengsch/shared-types';

function AppContent(): React.ReactElement {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isGroupOpen, setIsGroupOpen] = useState(false);
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [detailTodo, setDetailTodo] = useState<Todo | null>(null);

  const handleEdit = (todo: Todo) => {
    setEditingTodo(todo);
    setIsEditOpen(true);
  };

  const handleDetail = (todo: Todo) => {
    setDetailTodo(todo);
    setIsDetailOpen(true);
  };

  const handleDetailEdit = (todo: Todo) => {
    setIsDetailOpen(false);
    setDetailTodo(null);
    setEditingTodo(todo);
    setIsEditOpen(true);
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.toolbar}>
        <TouchableOpacity style={styles.toolbarBtn} onPress={() => setIsAddOpen(true)}>
          <Text style={styles.toolbarBtnText}>+</Text>
        </TouchableOpacity>
        <Text style={styles.toolbarTitle}>HengSch Todo</Text>
        <TouchableOpacity style={styles.toolbarBtn} onPress={() => setIsGroupOpen(true)}>
          <Text style={styles.toolbarBtnText}>📁</Text>
        </TouchableOpacity>
      </View>
      <TodoList onEdit={handleEdit} onDetail={handleDetail} />
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
  );
}

export default function App(): React.ReactElement {
  return (
    <GroupProvider>
      <TodoProvider>
        <AppContent />
      </TodoProvider>
    </GroupProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#e8eaed',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  toolbarBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbarBtnText: {
    fontSize: 20,
    fontWeight: '600',
  },
  toolbarTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
});
