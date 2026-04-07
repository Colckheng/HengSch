import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import type { CycleType, RecurringTodo, Todo, TodoType } from '@hengsch/shared-types';
import { useGroups } from '../context/GroupContext';

type TodoEditorStatus = Todo['status'];

export interface TodoEditorValues {
  title: string;
  description?: string;
  type: TodoType;
  status: TodoEditorStatus;
  groupId: string;
  cycleType: CycleType;
  customCycleDays?: number;
}

interface TodoEditorModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  todo?: Todo | null;
  onClose: () => void;
  onSubmit: (values: TodoEditorValues) => void;
  onDelete?: () => void;
}

const TODO_TYPE_OPTIONS: Array<{ value: TodoType; label: string; tone: 'blue' | 'neutral' }> = [
  { value: 'once', label: '一次性', tone: 'neutral' },
  { value: 'recurring', label: '循环事项', tone: 'blue' }
];

const STATUS_OPTIONS: Array<{ value: TodoEditorStatus; label: string; tone: 'green' | 'neutral' }> = [
  { value: 'pending', label: '待推进', tone: 'neutral' },
  { value: 'completed', label: '已完成', tone: 'green' }
];

const CYCLE_OPTIONS: Array<{ value: CycleType; label: string; tone: 'coral' | 'neutral' }> = [
  { value: 'daily', label: '每天', tone: 'neutral' },
  { value: 'weekly', label: '每周', tone: 'neutral' },
  { value: 'monthly', label: '每月', tone: 'neutral' },
  { value: 'custom', label: '自定义', tone: 'coral' }
];

function ChoiceChip({
  label,
  active,
  onPress,
  tone = 'neutral',
  activeColor
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  tone?: 'neutral' | 'blue' | 'green' | 'coral';
  activeColor?: string;
}): React.ReactElement {
  return (
    <Pressable
      style={[
        styles.choiceChip,
        active && styles.choiceChipActive,
        active && tone === 'blue' && styles.choiceChipBlue,
        active && tone === 'green' && styles.choiceChipGreen,
        active && tone === 'coral' && styles.choiceChipCoral,
        active && activeColor ? { backgroundColor: activeColor, borderColor: activeColor } : null
      ]}
      onPress={onPress}
    >
      <Text style={[styles.choiceChipText, active && styles.choiceChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function TodoEditorModal({
  isOpen,
  mode,
  todo,
  onClose,
  onSubmit,
  onDelete
}: TodoEditorModalProps): React.ReactElement {
  const { state: groupState } = useGroups();
  const defaultGroupId = useMemo(() => groupState.groups[0]?.id ?? 'default', [groupState.groups]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<TodoType>('once');
  const [status, setStatus] = useState<TodoEditorStatus>('pending');
  const [groupId, setGroupId] = useState(defaultGroupId);
  const [cycleType, setCycleType] = useState<CycleType>('daily');
  const [customCycleDays, setCustomCycleDays] = useState('');

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (mode === 'edit' && todo) {
      setTitle(todo.title);
      setDescription(todo.description ?? '');
      setType(todo.type);
      setStatus(todo.status);
      setGroupId(todo.groupId ?? defaultGroupId);

      if (todo.type === 'recurring') {
        const recurringTodo = todo as RecurringTodo;
        setCycleType(recurringTodo.cycleType);
        setCustomCycleDays(recurringTodo.customCycleDays?.toString() ?? '');
      } else {
        setCycleType('daily');
        setCustomCycleDays('');
      }

      return;
    }

    setTitle('');
    setDescription('');
    setType('once');
    setStatus('pending');
    setGroupId(defaultGroupId);
    setCycleType('daily');
    setCustomCycleDays('');
  }, [defaultGroupId, isOpen, mode, todo]);

  const handleSubmit = (): void => {
    if (!title.trim()) {
      return;
    }

    const parsedDays = parseInt(customCycleDays, 10);

    onSubmit({
      title: title.trim(),
      description: description.trim() || undefined,
      type,
      status,
      groupId,
      cycleType,
      customCycleDays:
        type === 'recurring' && cycleType === 'custom' && !Number.isNaN(parsedDays) && parsedDays > 0
          ? parsedDays
          : undefined
    });
  };

  if (!isOpen) {
    return <></>;
  }

  return (
    <Modal visible={isOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.headerKicker}>{mode === 'create' ? '新建待办' : '编辑待办'}</Text>
            <Text style={styles.headerTitle}>
              {mode === 'create' ? '把事情写成一句可执行的话' : '调整这件事的位置和状态'}
            </Text>
            <Text style={styles.headerDescription}>
              保留 Web 的信息结构，但把操作改成更适合触屏的表单节奏。
            </Text>
          </View>
          <Pressable style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>关闭</Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.panel}>
            <Text style={styles.label}>任务标题</Text>
            <TextInput
              style={styles.textInput}
              value={title}
              onChangeText={setTitle}
              placeholder="例如：整理发布页文案"
              placeholderTextColor="#8f8779"
              autoFocus={mode === 'create'}
            />

            <Text style={styles.label}>描述说明</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="补充背景、目标，或写下完成标准。"
              placeholderTextColor="#8f8779"
              multiline
              numberOfLines={5}
            />
          </View>

          <View style={styles.panel}>
            <Text style={styles.label}>任务状态</Text>
            <View style={styles.choiceRow}>
              {STATUS_OPTIONS.map((option) => (
                <ChoiceChip
                  key={option.value}
                  label={option.label}
                  active={status === option.value}
                  onPress={() => setStatus(option.value)}
                  tone={option.tone}
                />
              ))}
            </View>

            <Text style={styles.label}>任务类型</Text>
            <View style={styles.choiceRow}>
              {TODO_TYPE_OPTIONS.map((option) => (
                <ChoiceChip
                  key={option.value}
                  label={option.label}
                  active={type === option.value}
                  onPress={() => setType(option.value)}
                  tone={option.tone}
                />
              ))}
            </View>
          </View>

          <View style={styles.panel}>
            <Text style={styles.label}>所属分组</Text>
            <View style={styles.choiceRow}>
              {groupState.groups.map((group) => (
                <ChoiceChip
                  key={group.id}
                  label={group.name}
                  active={groupId === group.id}
                  onPress={() => setGroupId(group.id)}
                  activeColor={group.color}
                />
              ))}
            </View>
          </View>

          {type === 'recurring' ? (
            <View style={styles.panel}>
              <Text style={styles.label}>循环频率</Text>
              <View style={styles.choiceRow}>
                {CYCLE_OPTIONS.map((option) => (
                  <ChoiceChip
                    key={option.value}
                    label={option.label}
                    active={cycleType === option.value}
                    onPress={() => setCycleType(option.value)}
                    tone={option.tone}
                  />
                ))}
              </View>

              {cycleType === 'custom' ? (
                <>
                  <Text style={styles.label}>循环天数</Text>
                  <TextInput
                    style={styles.textInput}
                    value={customCycleDays}
                    onChangeText={setCustomCycleDays}
                    placeholder="输入循环天数"
                    placeholderTextColor="#8f8779"
                    keyboardType="number-pad"
                  />
                </>
              ) : null}
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          {mode === 'edit' && onDelete ? (
            <Pressable style={[styles.footerButton, styles.footerDangerButton]} onPress={onDelete}>
              <Text style={[styles.footerButtonText, styles.footerDangerButtonText]}>删除待办</Text>
            </Pressable>
          ) : null}
          <View style={styles.footerActions}>
            <Pressable style={[styles.footerButton, styles.footerSecondaryButton]} onPress={onClose}>
              <Text style={styles.footerButtonText}>取消</Text>
            </Pressable>
            <Pressable style={[styles.footerButton, styles.footerPrimaryButton]} onPress={handleSubmit}>
              <Text style={[styles.footerButtonText, styles.footerPrimaryButtonText]}>
                {mode === 'create' ? '创建待办' : '保存修改'}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f5efe2'
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0d4c0',
    gap: 14
  },
  headerCopy: {
    gap: 6
  },
  headerKicker: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9d6d2f',
    letterSpacing: 1
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#2f2419'
  },
  headerDescription: {
    fontSize: 14,
    lineHeight: 21,
    color: '#6b6255'
  },
  closeButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#efe5d1'
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4d4133'
  },
  body: {
    flex: 1
  },
  bodyContent: {
    padding: 20,
    gap: 16
  },
  panel: {
    padding: 18,
    borderRadius: 24,
    backgroundColor: '#fffaf0',
    borderWidth: 1,
    borderColor: '#e7dcc8',
    gap: 12
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#7d7467'
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#ddd1bd',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#2f2419',
    backgroundColor: '#f7f1e6'
  },
  textArea: {
    minHeight: 124,
    textAlignVertical: 'top'
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  choiceChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#ddd1bd',
    backgroundColor: '#f7f1e6'
  },
  choiceChipActive: {
    borderColor: '#c7a66a'
  },
  choiceChipBlue: {
    backgroundColor: '#b8d5f2'
  },
  choiceChipGreen: {
    backgroundColor: '#b9d8c0'
  },
  choiceChipCoral: {
    backgroundColor: '#efc3ae'
  },
  choiceChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#5f564a'
  },
  choiceChipTextActive: {
    color: '#2f2419'
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: '#e0d4c0',
    backgroundColor: '#f5efe2',
    gap: 12
  },
  footerActions: {
    flexDirection: 'row',
    gap: 10
  },
  footerButton: {
    minHeight: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18
  },
  footerSecondaryButton: {
    flex: 1,
    backgroundColor: '#e9deca'
  },
  footerPrimaryButton: {
    flex: 1,
    backgroundColor: '#2f2419'
  },
  footerDangerButton: {
    backgroundColor: '#f4ddd2'
  },
  footerButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#3e3428'
  },
  footerPrimaryButtonText: {
    color: '#fffaf0'
  },
  footerDangerButtonText: {
    color: '#8c3b2c'
  }
});
