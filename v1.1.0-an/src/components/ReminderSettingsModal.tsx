import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Switch,
  Platform
} from 'react-native';
import type { PermissionState } from '../notifications/reminderScheduler';
import { useReminder } from '../context/ReminderContext';

interface ReminderSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PERMISSION_LABEL: Record<PermissionState, string> = {
  granted: '已授权',
  denied: '已拒绝',
  undetermined: '未请求'
};

/** 提醒设置：与 SyncSettingsModal 同构的 Swiss 排版（纸底、发丝线、mono 标签） */
export function ReminderSettingsModal({ isOpen, onClose }: ReminderSettingsModalProps): React.ReactElement {
  const { enabled, permission, scheduled, error, setEnabled, refreshCount, testNotification } = useReminder();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setMessage(null);
    void refreshCount();
  }, [isOpen, refreshCount]);

  if (!isOpen) return <></>;

  const handleToggle = async (next: boolean) => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await setEnabled(next);
      setMessage({ ok: result.ok, text: result.message });
      await refreshCount();
    } finally {
      setBusy(false);
    }
  };

  const handleTest = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await testNotification();
      setMessage({ ok: result.ok, text: result.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={isOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>关闭</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>提醒设置</Text>
          <View style={styles.headerBtn} />
        </View>

        <ScrollView style={styles.body}>
          <View style={styles.statusBlock}>
            <Text style={styles.kicker}>LOCAL NOTIFICATIONS</Text>
            <Text style={[styles.statusText, enabled ? styles.statusOn : styles.statusOff]}>
              {enabled ? 'ON' : 'OFF'}
            </Text>
            <Text style={styles.statusError}>
              权限 {PERMISSION_LABEL[permission]} · 已排 {scheduled} 条
            </Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.rowLabel}>到期提醒</Text>
            <Switch
              value={enabled}
              onValueChange={(next) => { void handleToggle(next); }}
              disabled={busy}
              trackColor={{ false: '#D8D8D5', true: '#111111' }}
              thumbColor={Platform.OS === 'android' ? '#FAFAF7' : undefined}
            />
          </View>

          {enabled ? (
            <TouchableOpacity style={styles.actionBtn} onPress={handleTest} disabled={busy}>
              <Text style={[styles.actionBtnText, busy && styles.disabled]}>发送测试提醒（5 秒后）</Text>
            </TouchableOpacity>
          ) : null}

          {message ? (
            <View style={[styles.testBox, message.ok ? styles.testBoxOk : styles.testBoxFail]}>
              <Text style={[styles.testText, message.ok ? styles.testTextOk : styles.testTextFail]}>
                {message.text}
              </Text>
            </View>
          ) : null}

          {error ? (
            <View style={[styles.testBox, styles.testBoxFail]}>
              <Text style={[styles.testText, styles.testTextFail]}>{error}</Text>
            </View>
          ) : null}

          <Text style={styles.footnote}>
            仅本机生效，不写云同步。单次按提醒时间，循环按下一周期提前量排未来 7 天；应用被杀时由系统投递。
            精确时间由系统闹钟权限决定，未授权时为近似时间。
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF7' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 2,
    borderBottomColor: '#111111'
  },
  headerBtn: { minWidth: 56 },
  headerBtnText: { fontSize: 14, color: '#111111', fontFamily: 'monospace' },
  headerTitle: { fontSize: 14, fontWeight: '700', letterSpacing: 2, fontFamily: 'monospace' },
  body: { flex: 1, paddingHorizontal: 20 },
  statusBlock: {
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(17,17,27,0.1)'
  },
  kicker: { fontFamily: 'monospace', fontSize: 10, letterSpacing: 2, color: '#8A8A85' },
  statusText: {
    fontFamily: 'monospace',
    fontSize: 22,
    fontWeight: '700',
    marginTop: 6,
    letterSpacing: 1
  },
  statusOn: { color: '#111111' },
  statusOff: { color: '#8A8A85' },
  statusError: { fontSize: 12, color: '#8A8A85', marginTop: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(17,17,27,0.1)'
  },
  rowLabel: {
    fontSize: 16,
    color: '#111111',
    letterSpacing: -0.2
  },
  actionBtn: {
    marginTop: 22,
    borderWidth: 2,
    borderColor: '#111111',
    backgroundColor: '#FAFAF7',
    paddingVertical: 13,
    alignItems: 'center'
  },
  actionBtnText: {
    fontFamily: 'monospace',
    fontSize: 12,
    letterSpacing: 2,
    color: '#111111',
    fontWeight: '700'
  },
  disabled: { opacity: 0.35 },
  testBox: { marginTop: 18, borderWidth: 1.5, padding: 12 },
  testBoxOk: { borderColor: '#111111', backgroundColor: '#FFFFFF' },
  testBoxFail: { borderColor: '#E1352B', backgroundColor: '#FFF5F4' },
  testText: { fontFamily: 'monospace', fontSize: 12 },
  testTextOk: { color: '#111111' },
  testTextFail: { color: '#E1352B' },
  footnote: { fontSize: 11, color: '#8A8A85', lineHeight: 17, marginTop: 26, marginBottom: 40 }
});
