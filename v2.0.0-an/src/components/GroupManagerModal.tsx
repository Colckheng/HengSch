import React, { useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import type { Group } from '@hengsch/shared-types';
import { DEFAULT_GROUP_COLORS, useGroups } from '../context/GroupContext';
import { useTodos } from '../context/TodoContext';
import { ColorPicker } from './ColorPicker';

interface GroupManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GroupManagerModal({
  isOpen,
  onClose
}: GroupManagerModalProps): React.ReactElement {
  const { state, addGroup, updateGroup, deleteGroup } = useGroups();
  const { state: todoState, updateTodo } = useTodos();
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [name, setName] = useState('');
  const [selectedColor, setSelectedColor] = useState(DEFAULT_GROUP_COLORS[0]);

  const customGroups = useMemo(
    () => state.groups.filter((group) => group.id !== 'default'),
    [state.groups]
  );

  const resetForm = (): void => {
    setEditingGroup(null);
    setName('');
    setSelectedColor(DEFAULT_GROUP_COLORS[0]);
  };

  const handleClose = (): void => {
    resetForm();
    onClose();
  };

  const handleSave = (): void => {
    if (!name.trim()) {
      return;
    }

    if (editingGroup) {
      updateGroup(editingGroup.id, { name: name.trim(), color: selectedColor });
    } else {
      addGroup({ name: name.trim(), color: selectedColor });
    }

    resetForm();
  };

  const handleStartEdit = (group: Group): void => {
    setEditingGroup(group);
    setName(group.name);
    setSelectedColor(group.color);
  };

  const handleDelete = (group: Group): void => {
    if (group.id === 'default') {
      return;
    }

    Alert.alert('删除分组', '确定要删除这个分组吗？该分组下的待办会回到“未分类”。', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          deleteGroup(group.id);
          todoState.todos.forEach((todo) => {
            if (todo.groupId === group.id) {
              updateTodo(todo.id, { groupId: 'default' });
            }
          });

          if (editingGroup?.id === group.id) {
            resetForm();
          }
        }
      }
    ]);
  };

  if (!isOpen) {
    return <></>;
  }

  return (
    <Modal visible={isOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.headerKicker}>分组管理</Text>
            <Text style={styles.headerTitle}>给任务分区，但别把版面切得太碎</Text>
            <Text style={styles.headerDescription}>
              视觉语言向桌面端靠拢，但保持移动端更直接的上下结构。
            </Text>
          </View>
          <View style={styles.headerMeta}>
            <Text style={styles.headerMetaText}>{customGroups.length} 个自定义分组</Text>
            <Pressable style={styles.headerAction} onPress={handleClose}>
              <Text style={styles.headerActionText}>完成</Text>
            </Pressable>
          </View>
        </View>

        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>已有分组</Text>
            <View style={styles.groupCard}>
              <View style={styles.groupCopy}>
                <View style={[styles.groupSwatch, { backgroundColor: '#f4f0e7' }]} />
                <View style={styles.groupMeta}>
                  <Text style={styles.groupName}>未分类</Text>
                  <Text style={styles.groupHint}>系统默认分组，删除其他分组时会回收到这里。</Text>
                </View>
              </View>
            </View>

            {customGroups.length > 0 ? (
              customGroups.map((group) => (
                <View key={group.id} style={styles.groupCard}>
                  <View style={styles.groupCopy}>
                    <View style={[styles.groupSwatch, { backgroundColor: group.color }]} />
                    <View style={styles.groupMeta}>
                      <Text style={styles.groupName}>{group.name}</Text>
                      <Text style={styles.groupHint}>用于整理相近事项</Text>
                    </View>
                  </View>

                  <View style={styles.groupActions}>
                    <Pressable style={styles.groupActionButton} onPress={() => handleStartEdit(group)}>
                      <Text style={styles.groupActionText}>编辑</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.groupActionButton, styles.groupDeleteButton]}
                      onPress={() => handleDelete(group)}
                    >
                      <Text style={[styles.groupActionText, styles.groupDeleteText]}>删除</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateTitle}>还没有自定义分组</Text>
                <Text style={styles.emptyStateDescription}>
                  先按主题建立 1 到 3 个分组就够了，太多会把注意力切碎。
                </Text>
              </View>
            )}
          </View>

          <View style={styles.panel}>
            <Text style={styles.panelTitle}>{editingGroup ? '编辑分组' : '新建分组'}</Text>
            <Text style={styles.panelDescription}>
              {editingGroup ? '调整名称和颜色，让它继续适合当前任务。' : '给一组任务一个清楚、稳定的主题名称。'}
            </Text>

            <Text style={styles.label}>分组名称</Text>
            <TextInput
              style={styles.textInput}
              value={name}
              onChangeText={setName}
              placeholder="例如：内容发布 / 产品优化"
              placeholderTextColor="#8f8779"
            />

            <ColorPicker selectedColor={selectedColor} onColorSelect={setSelectedColor} />

            <View style={styles.footerActions}>
              {editingGroup ? (
                <Pressable style={[styles.actionButton, styles.secondaryButton]} onPress={resetForm}>
                  <Text style={styles.actionButtonText}>取消编辑</Text>
                </Pressable>
              ) : null}
              <Pressable
                style={[styles.actionButton, styles.primaryButton, !name.trim() && styles.disabledButton]}
                onPress={handleSave}
                disabled={!name.trim()}
              >
                <Text style={[styles.actionButtonText, styles.primaryButtonText]}>
                  {editingGroup ? '保存分组' : '添加分组'}
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </View>
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
    color: '#c36e52',
    letterSpacing: 1
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '700',
    lineHeight: 34,
    color: '#2f2419'
  },
  headerDescription: {
    fontSize: 14,
    lineHeight: 21,
    color: '#6f6456'
  },
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  headerMetaText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#7d7467'
  },
  headerAction: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#e9deca'
  },
  headerActionText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#3d3226'
  },
  body: {
    flex: 1
  },
  bodyContent: {
    padding: 20,
    gap: 16
  },
  panel: {
    borderRadius: 26,
    padding: 18,
    backgroundColor: '#fffaf0',
    borderWidth: 1,
    borderColor: '#e2d6c3',
    gap: 14
  },
  panelTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2f2419'
  },
  panelDescription: {
    fontSize: 14,
    lineHeight: 21,
    color: '#6f6456'
  },
  groupCard: {
    borderRadius: 20,
    padding: 16,
    backgroundColor: '#f7f1e6',
    gap: 14
  },
  groupCopy: {
    flexDirection: 'row',
    gap: 12
  },
  groupSwatch: {
    width: 18,
    height: 18,
    borderRadius: 9,
    marginTop: 3
  },
  groupMeta: {
    flex: 1,
    gap: 4
  },
  groupName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2f2419'
  },
  groupHint: {
    fontSize: 13,
    lineHeight: 19,
    color: '#6f6456'
  },
  groupActions: {
    flexDirection: 'row',
    gap: 8
  },
  groupActionButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#efe5d1'
  },
  groupDeleteButton: {
    backgroundColor: '#f4ddd2'
  },
  groupActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3d3226'
  },
  groupDeleteText: {
    color: '#8c3b2c'
  },
  emptyState: {
    borderRadius: 18,
    padding: 16,
    backgroundColor: '#f7f1e6',
    gap: 6
  },
  emptyStateTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#3d3226'
  },
  emptyStateDescription: {
    fontSize: 14,
    lineHeight: 21,
    color: '#6f6456'
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
  footerActions: {
    flexDirection: 'row',
    gap: 10
  },
  actionButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18
  },
  secondaryButton: {
    backgroundColor: '#e9deca'
  },
  primaryButton: {
    backgroundColor: '#2f2419'
  },
  disabledButton: {
    opacity: 0.5
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#3d3226'
  },
  primaryButtonText: {
    color: '#fffaf0'
  }
});
