import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, Text, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import * as Notifications from 'expo-notifications';
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

// P0 spike：前台也展示通知，验证渠道与权限链路
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false })
});

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function AppContent(): React.ReactElement {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isGroupOpen, setIsGroupOpen] = useState(false);
  const [isSyncOpen, setIsSyncOpen] = useState(false);
  const { state, deleteTodo } = useTodos();
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [detailTodo, setDetailTodo] = useState<Todo | null>(null);

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

  const handleDetailDelete = (todo: Todo) => {
    Alert.alert('删除待办', '确定要删除这个待办事项吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          deleteTodo(todo.id);
          setIsDetailOpen(false);
          setDetailTodo(null);
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.toolbar}>
        <TouchableOpacity style={styles.toolbarBtn} onPress={() => setIsAddOpen(true)}>
          <Text style={styles.toolbarBtnText}>＋</Text>
        </TouchableOpacity>
        <Text style={styles.toolbarTitle}>HENGSCH TODO</Text>
        <TouchableOpacity style={styles.toolbarBtn} onPress={() => setIsGroupOpen(true)}>
          <Text style={styles.toolbarBtnTextSm}>GRP</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.statsStrip}>
        <View style={styles.statsLeft}>
          <Text style={styles.statsNumber}>{pad(state.todos.filter((t) => t.status === 'pending').length)}</Text>
          <Text style={styles.statsUnit}>PEND</Text>
        </View>
        <Text style={styles.statsMeta}>
          {pad(state.todos.filter((t) => t.status === 'completed').length)} DONE · {pad(state.todos.length)} TOTAL
        </Text>
      </View>
      {/* P0 spike：临时入口，A3 前替换为提醒设置里的「发送测试提醒」 */}
      <TouchableOpacity
        style={styles.spikeBtn}
        onPress={async () => {
          try {
            const granted = await Notifications.requestPermissionsAsync();
            if (!granted.granted) {
              Alert.alert('通知权限被拒绝', '请在系统设置里允许 HengSch 通知');
              return;
            }
            await Notifications.setNotificationChannelAsync('reminders', {
              name: '待办提醒',
              importance: Notifications.AndroidImportance.MAX,
              vibrationPattern: [0, 250, 250, 250]
            });
            await Notifications.scheduleNotificationAsync({
              content: { title: '待办提醒', body: '原生通知 spike（10 秒）' },
              trigger: { seconds: 10, channelId: 'reminders' }
            });
            Alert.alert('已排程', '10 秒后应收到通知；请分别在前台/后台/杀进程后验证');
          } catch (error) {
            Alert.alert('排程失败', error instanceof Error ? error.message : '未知错误');
          }
        }}
      >
        <Text style={styles.spikeBtnText}>10s 测试通知</Text>
      </TouchableOpacity>
      <TodoList onDetail={handleDetail} />
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
        onDelete={handleDetailDelete}
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
    paddingTop: 44,
    paddingBottom: 10,
    backgroundColor: '#FAFAF7',
  },
  toolbarBtn: {
    width: 44,
    height: 44,
    borderRadius: 0,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbarBtnText: {
    fontSize: 20,
    fontWeight: '400',
    color: '#111111',
  },
  toolbarBtnTextSm: {
    fontFamily: 'monospace',
    fontSize: 12,
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
  statsStrip: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 10,
    borderBottomWidth: 1.5,
    borderBottomColor: '#111111',
  },
  statsLeft: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  statsNumber: {
    fontSize: 36,
    fontWeight: '700',
    color: '#111111',
    letterSpacing: -1,
    lineHeight: 40,
  },
  statsUnit: {
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 1.5,
    color: '#8A8A85',
    marginLeft: 8,
    marginBottom: 5,
  },
  statsMeta: {
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 1,
    color: '#8A8A85',
    marginBottom: 5,
  },
  spikeBtn: {
    marginHorizontal: 24,
    marginTop: 8,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#111111',
    backgroundColor: '#FAFAF7',
  },
  spikeBtnText: {
    fontFamily: 'monospace',
    fontSize: 11,
    letterSpacing: 1,
    color: '#111111',
  },
});
