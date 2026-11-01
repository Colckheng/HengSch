import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, PanResponder, StyleSheet, Text, TouchableOpacity, View, Alert } from 'react-native';
import type { Todo } from '@hengsch/shared-types';
import { TodoCard } from './TodoCard';

const ACTION_WIDTH = 74;
const OPEN_X = -ACTION_WIDTH * 3;
const HOUR = 60 * 60 * 1000;

interface SwipeableTodoRowProps {
  todo: Todo;
  index: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggle: (id: string) => void;
  onPress: (todo: Todo) => void;
  onSnooze: (id: string, remindAt: number) => void;
  onDelete: (id: string) => void;
}

/** 左滑露出「完成 / 稍后 1h / 删除」；纵向滚动与点击详情保持原行为 */
export function SwipeableTodoRow({
  todo,
  index,
  open,
  onOpenChange,
  onToggle,
  onPress,
  onSnooze,
  onDelete
}: SwipeableTodoRowProps): React.ReactElement {
  const translateX = useRef(new Animated.Value(0)).current;
  const openRef = useRef(open);
  const onOpenChangeRef = useRef(onOpenChange);
  openRef.current = open;
  onOpenChangeRef.current = onOpenChange;
  const isCompleted = todo.status === 'completed';

  const animateTo = (to: number) => {
    Animated.timing(translateX, { toValue: to, duration: 160, useNativeDriver: true }).start();
  };

  useEffect(() => {
    animateTo(open ? OPEN_X : 0);
  }, [open]);

  const panResponder = useMemo(
    () => PanResponder.create({
      // 只接管明显的横向手势，纵向滚动交给 FlatList
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 16 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_, g) => {
        const base = openRef.current ? OPEN_X : 0;
        const next = Math.min(0, Math.max(OPEN_X, base + g.dx));
        translateX.setValue(next);
      },
      onPanResponderRelease: (_, g) => {
        const base = openRef.current ? OPEN_X : 0;
        const next = base + g.dx;
        const shouldOpen = next < OPEN_X / 2;
        onOpenChangeRef.current(shouldOpen);
        animateTo(shouldOpen ? OPEN_X : 0);
      },
      onPanResponderTerminate: () => {
        animateTo(openRef.current ? OPEN_X : 0);
      }
    }),
    [translateX]
  );

  const handleSnooze = () => {
    if (isCompleted) return;
    onOpenChange(false);
    onSnooze(todo.id, Date.now() + HOUR);
  };

  const handleDelete = () => {
    onOpenChange(false);
    Alert.alert('删除待办', `确定删除「${todo.title}」吗？`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => onDelete(todo.id) }
    ]);
  };

  const handleToggle = () => {
    onOpenChange(false);
    onToggle(todo.id);
  };

  const handleCardPress = (item: Todo) => {
    if (openRef.current) {
      onOpenChange(false);
      animateTo(0);
      return;
    }
    onPress(item);
  };

  return (
    <View style={styles.container}>
      <View style={styles.actions} pointerEvents={open ? 'auto' : 'none'}>
        <TouchableOpacity
          style={styles.action}
          onPress={handleToggle}
          accessibilityLabel={isCompleted ? '恢复待办' : '完成待办'}
        >
          <Text style={styles.actionText}>{isCompleted ? '恢复' : '完成'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.action, isCompleted && styles.actionDisabled]}
          onPress={handleSnooze}
          disabled={isCompleted}
          accessibilityLabel="稍后一小时"
        >
          <Text style={styles.actionText}>稍后1h</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.action, styles.actionDanger]} onPress={handleDelete} accessibilityLabel="删除待办">
          <Text style={[styles.actionText, styles.actionTextDanger]}>删除</Text>
        </TouchableOpacity>
      </View>
      <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
        <TodoCard todo={todo} index={index} onToggle={onToggle} onPress={handleCardPress} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#FAFAF7' },
  actions: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row'
  },
  action: {
    width: ACTION_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2F2EF',
    borderLeftWidth: 1,
    borderLeftColor: '#E5E5E3'
  },
  actionDanger: { backgroundColor: '#E1352B' },
  actionDisabled: { opacity: 0.35 },
  actionText: {
    fontFamily: 'monospace',
    fontSize: 11,
    letterSpacing: 1,
    fontWeight: '700',
    color: '#111111'
  },
  actionTextDanger: { color: '#FAFAF7' }
});
