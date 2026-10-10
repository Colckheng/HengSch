import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { TodoProvider, useTodos } from './src/context/TodoContext';
import { GroupProvider } from './src/context/GroupContext';
import { SyncProvider } from './src/context/SyncContext';
import { TodoList } from './src/components/TodoList';
import { AddTodoModal } from './src/components/AddTodoModal';
import { EditTodoModal } from './src/components/EditTodoModal';
import { TodoDetailModal } from './src/components/TodoDetailModal';
import { GroupManagerModal } from './src/components/GroupManagerModal';
import { SyncStatusFooter } from './src/components/SyncStatusFooter';
import { SyncSettingsModal } from './src/components/SyncSettingsModal';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import type { Todo } from '@hengsch/shared-types';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function AppContent(): React.ReactElement {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isGroupOpen, setIsGroupOpen] = useState(false);
  const [isSyncOpen, setIsSyncOpen] = useState(false);
  const { state } = useTodos();
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
          <Text style={styles.toolbarBtnText}>＋</Text>
        </TouchableOpacity>
        <Text style={styles.toolbarTitle}>
          HENG SCH <Text style={styles.toolbarSlash}>/</Text> TODO
        </Text>
        <TouchableOpacity style={styles.toolbarBtn} onPress={() => setIsGroupOpen(true)}>
          <Text style={styles.toolbarBtnText}>GRP</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.statsRow}>
        <Text style={styles.statsKicker}>TASKS REMAINING</Text>
        <View style={styles.statsLine}>
          <Text style={styles.statsNumber}>{pad(state.todos.filter((t) => t.status === 'pending').length)}</Text>
          <Text style={styles.statsSlash}>/</Text>
          <Text style={styles.statsMeta}>
            {pad(state.todos.filter((t) => t.status === 'completed').length)} DONE · {pad(state.todos.length)} TOTAL
          </Text>
        </View>
      </View>
      <TodoList onEdit={handleEdit} onDetail={handleDetail} />
      <SyncStatusFooter onPress={() => setIsSyncOpen(true)} />
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
      <SyncSettingsModal isOpen={isSyncOpen} onClose={() => setIsSyncOpen(false)} />
    </View>
  );
}

export default function App(): React.ReactElement {
  return (
    <ErrorBoundary>
      <GroupProvider>
        <TodoProvider>
          <SyncProvider>
            <AppContent />
          </SyncProvider>
        </TodoProvider>
      </GroupProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAF7',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 14,
    backgroundColor: '#FAFAF7',
  },
  toolbarBtn: {
    width: 44,
    height: 44,
    borderRadius: 0,
    borderWidth: 1.5,
    borderColor: '#111111',
    backgroundColor: '#FAFAF7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbarBtnText: {
    fontFamily: 'monospace',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    color: '#111111',
  },
  toolbarTitle: {
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 3,
    color: '#111111',
  },
  toolbarSlash: {
    color: '#E1352B',
  },
  statsRow: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    borderBottomWidth: 1.5,
    borderBottomColor: '#111111',
  },
  statsKicker: {
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 2,
    color: '#8A8A85',
    marginBottom: 4,
  },
  statsLine: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  statsNumber: {
    fontSize: 64,
    fontWeight: '700',
    color: '#111111',
    letterSpacing: -2,
    lineHeight: 70,
  },
  statsSlash: {
    fontSize: 56,
    fontWeight: '700',
    color: '#E1352B',
    marginHorizontal: 8,
    lineHeight: 66,
  },
  statsMeta: {
    fontFamily: 'monospace',
    fontSize: 11,
    letterSpacing: 1,
    color: '#8A8A85',
    marginBottom: 12,
  },
});
