import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import type { Todo, TodoType, CycleType, RecurringTodo } from '@hengsch/shared-types';
import { useTodos } from '../context/TodoContext';
import { useGroups } from '../context/GroupContext';

interface EditTodoModalProps {
  isOpen: boolean;
  onClose: () => void;
  todo: Todo | null;
}

const CYCLE_LABELS: Record<CycleType, string> = {
  daily: '每天',
  weekly: '每周',
  monthly: '每月',
  custom: '自定义',
};

export function EditTodoModal({ isOpen, onClose, todo }: EditTodoModalProps): React.ReactElement {
  const { updateTodo } = useTodos();
  const { state: groupState } = useGroups();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<TodoType>('once');
  const [cycleType, setCycleType] = useState<CycleType>('daily');
  const [customCycleDays, setCustomCycleDays] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('default');

  useEffect(() => {
    if (todo) {
      setTitle(todo.title);
      setDescription(todo.description || '');
      setType(todo.type);
      setSelectedGroupId(todo.groupId || 'default');
      if (todo.type === 'recurring') {
        const recurringTodo = todo as RecurringTodo;
        setCycleType(recurringTodo.cycleType);
        setCustomCycleDays(recurringTodo.customCycleDays?.toString() || '');
      }
    }
  }, [todo]);

  const handleClose = () => {
    onClose();
  };

  const handleSubmit = () => {
    if (!todo || !title.trim()) return;

    const updateData: Partial<Todo> = {
      title: title.trim(),
      description: description.trim() || undefined,
      type,
      groupId: selectedGroupId,
    };

    if (type === 'recurring') {
      const recurringUpdateData = updateData as Partial<RecurringTodo>;
      recurringUpdateData.cycleType = cycleType;
      const parsedDays = parseInt(customCycleDays, 10);
      recurringUpdateData.customCycleDays =
        cycleType === 'custom' && !isNaN(parsedDays) && parsedDays > 0 ? parsedDays : undefined;
      updateTodo(todo.id, recurringUpdateData);
    } else {
      updateTodo(todo.id, updateData);
    }
    handleClose();
  };

  if (!isOpen || !todo) return <></>;

  return (
    <Modal visible={isOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>取消</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>编辑待办</Text>
          <TouchableOpacity onPress={handleSubmit} style={styles.headerBtn} disabled={!title.trim()}>
            <Text style={[styles.headerBtnText, styles.headerBtnPrimary, !title.trim() && styles.disabled]}>
              保存
            </Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.field}>
            <Text style={styles.label}>标题 *</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="输入待办事项标题"
              placeholderTextColor="#999"
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>描述</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="输入描述（可选）"
              placeholderTextColor="#999"
              multiline
              numberOfLines={3}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>类型</Text>
            <View style={styles.row}>
              <TouchableOpacity
                style={[styles.option, type === 'once' && styles.optionActive]}
                onPress={() => setType('once')}
              >
                <Text style={[styles.optionText, type === 'once' && styles.optionTextActive]}>一次性</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.option, type === 'recurring' && styles.optionActive]}
                onPress={() => setType('recurring')}
              >
                <Text style={[styles.optionText, type === 'recurring' && styles.optionTextActive]}>循环</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>分组</Text>
            <View style={styles.row}>
              {groupState.groups.map((group) => (
                <TouchableOpacity
                  key={group.id}
                  style={[
                    styles.option,
                    selectedGroupId === group.id && styles.optionActive,
                    selectedGroupId === group.id && { backgroundColor: group.color },
                  ]}
                  onPress={() => setSelectedGroupId(group.id)}
                >
                  <Text style={[styles.optionText, selectedGroupId === group.id && styles.optionTextActive]}>
                    {group.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          {type === 'recurring' && (
            <>
              <View style={styles.field}>
                <Text style={styles.label}>循环周期</Text>
                <View style={styles.row}>
                  {(['daily', 'weekly', 'monthly', 'custom'] as const).map((ct) => (
                    <TouchableOpacity
                      key={ct}
                      style={[styles.option, cycleType === ct && styles.optionActive]}
                      onPress={() => setCycleType(ct)}
                    >
                      <Text style={[styles.optionText, cycleType === ct && styles.optionTextActive]}>
                        {CYCLE_LABELS[ct]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              {cycleType === 'custom' && (
                <View style={styles.field}>
                  <Text style={styles.label}>自定义周期（天）</Text>
                  <TextInput
                    style={styles.input}
                    value={customCycleDays}
                    onChangeText={setCustomCycleDays}
                    placeholder="输入天数"
                    placeholderTextColor="#999"
                    keyboardType="number-pad"
                  />
                </View>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerBtn: { padding: 8 },
  headerBtnText: { fontSize: 16, color: '#666' },
  headerBtnPrimary: { color: '#2196F3', fontWeight: '600' },
  headerTitle: { fontSize: 18, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  body: { flex: 1, padding: 16 },
  field: { marginBottom: 20 },
  label: { fontSize: 14, color: '#666', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  optionActive: { backgroundColor: '#e0e0e0' },
  optionText: { fontSize: 14, color: '#666' },
  optionTextActive: { color: '#333', fontWeight: '600' },
});
