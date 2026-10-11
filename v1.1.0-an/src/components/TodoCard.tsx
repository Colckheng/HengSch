import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { Todo } from '@hengsch/shared-types';
import { useGroups } from '../context/GroupContext';

interface TodoCardProps {
  todo: Todo;
  index: number;
  onToggle: (id: string) => void;
  onPress: (todo: Todo) => void;
}

export function TodoCard({ todo, index, onToggle, onPress }: TodoCardProps): React.ReactElement {
  const isCompleted = todo.status === 'completed';
  const { getGroupById } = useGroups();
  const group = todo.groupId ? getGroupById(todo.groupId) : undefined;

  const hasMeta = !!group || todo.type === 'recurring';

  return (
    <TouchableOpacity style={styles.row} onPress={() => onPress(todo)} activeOpacity={0.6}>
      <Text style={[styles.index, isCompleted && styles.indexDone]}>{String(index + 1).padStart(2, '0')}</Text>
      <TouchableOpacity
        style={[styles.checkbox, isCompleted && styles.checkboxChecked]}
        onPress={() => onToggle(todo.id)}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        {isCompleted && (
          <Text style={styles.checkmark} allowFontScaling={false}>
            ✓
          </Text>
        )}
      </TouchableOpacity>
      <View style={styles.content}>
        <Text style={[styles.title, isCompleted && styles.titleCompleted]} numberOfLines={2}>
          {todo.title}
        </Text>
        {hasMeta && (
          <View style={styles.metaRow}>
            {group && (
              <View style={styles.chip}>
                <View style={[styles.chipDot, { backgroundColor: group.color }]} />
                <Text style={[styles.chipText, isCompleted && styles.chipTextDone]}>{group.name}</Text>
              </View>
            )}
            {todo.type === 'recurring' && <Text style={styles.recurring}>↻ RECURRING</Text>}
          </View>
        )}
        {todo.description ? (
          <Text style={styles.description} numberOfLines={1}>{todo.description}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(17,17,27,0.10)',
    backgroundColor: '#FAFAF7',
  },
  index: {
    width: 30,
    fontFamily: 'monospace',
    fontSize: 13,
    color: '#8A8A85',
    marginTop: 3,
    letterSpacing: 0.5,
  },
  indexDone: {
    color: '#C4C4BE',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 0,
    borderWidth: 1.5,
    borderColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    marginTop: 1,
  },
  checkboxChecked: {
    borderColor: '#C4C4BE',
    backgroundColor: 'transparent',
  },
  checkmark: {
    color: '#8A8A85',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 15,
    textAlign: 'center',
    includeFontPadding: false,
  },
  content: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111111',
    letterSpacing: -0.35,
  },
  titleCompleted: {
    textDecorationLine: 'line-through',
    color: '#8A8A85',
    opacity: 0.55,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
    gap: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chipDot: {
    width: 7,
    height: 7,
    marginRight: 6,
    borderWidth: 1,
    borderColor: 'rgba(17,17,17,0.25)',
  },
  chipText: {
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 1,
    color: '#8A8A85',
  },
  chipTextDone: {
    color: '#C4C4BE',
  },
  description: {
    fontSize: 12,
    color: '#8A8A85',
    marginTop: 3,
    letterSpacing: -0.1,
  },
  recurring: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: '#8A8A85',
    letterSpacing: 1,
  },
});
