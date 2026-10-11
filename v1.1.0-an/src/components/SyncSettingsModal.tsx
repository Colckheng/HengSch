import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { useSync } from '../context/SyncContext';
import { PhoneSyncConfig } from '../utils/syncConfig';

interface SyncSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TestResult = { ok: boolean; text: string } | null;

export function SyncSettingsModal({ isOpen, onClose }: SyncSettingsModalProps): React.ReactElement {
  const { status, config, configure, testConnection, runNow } = useSync();
  const [serverUrl, setServerUrl] = useState('');
  const [token, setToken] = useState('');
  const [testResult, setTestResult] = useState<TestResult>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setServerUrl(config?.serverUrl ?? '');
      setToken(config?.token ?? '');
      setTestResult(null);
      setBusy(false);
    }
  }, [isOpen, config]);

  if (!isOpen) return <></>;

  const canSave = serverUrl.trim().length > 0 && token.trim().length > 0;

  const handleTest = async () => {
    if (!canSave) return;
    setBusy(true);
    setTestResult(null);
    const cfg = { enabled: true, serverUrl: serverUrl.trim(), token: token.trim() };
    const result = await testConnection(cfg);
    if (result.ok) {
      await configure(cfg);
      setTestResult({ ok: true, text: '连接成功，鉴权通过，配置已保存' });
    } else {
      setTestResult({ ok: false, text: `失败：${result.error ?? '未知错误'}` });
    }
    setBusy(false);
  };

  const handleSave = async () => {
    if (!canSave) return;
    setBusy(true);
    await configure({
      enabled: true,
      serverUrl: serverUrl.trim(),
      token: token.trim()
    });
    setBusy(false);
    onClose();
  };

  const handleRunNow = async () => {
    setBusy(true);
    if (canSave) {
      await configure({
        enabled: true,
        serverUrl: serverUrl.trim(),
        token: token.trim()
      });
    } else {
      runNow();
    }
    setBusy(false);
    onClose();
  };

  return (
    <Modal visible={isOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>取消</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>同步设置</Text>
          <TouchableOpacity onPress={handleSave} style={styles.headerBtn} disabled={!canSave || busy}>
            <Text style={[styles.headerBtnText, styles.headerBtnPrimary, (!canSave || busy) && styles.disabled]}>
              保存
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.statusBlock}>
            <Text style={styles.kicker}>CURRENT STATUS</Text>
            <Text style={[styles.statusText, status.state.includes('ERROR') || status.state === 'OFFLINE' ? styles.statusTextError : undefined]}>
              {status.state}
            </Text>
            {status.error ? <Text style={styles.statusError}>{status.error}</Text> : null}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>服务器地址</Text>
            <TextInput
              style={styles.input}
              value={serverUrl}
              onChangeText={setServerUrl}
              placeholder="http://<服务器IP>:8642"
              placeholderTextColor="#B5B5B0"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>TOKEN</Text>
            <TextInput
              style={styles.input}
              value={token}
              onChangeText={setToken}
              placeholder="粘贴同步桥 token"
              placeholderTextColor="#B5B5B0"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
            <Text style={styles.hint}>与桌面端读取同一 sync.json；token 见服务器 /opt/hengsch/sync-bridge/.env</Text>
          </View>

          {testResult ? (
            <View style={[styles.testBox, testResult.ok ? styles.testBoxOk : styles.testBoxFail]}>
              <Text style={[styles.testText, testResult.ok ? styles.testTextOk : styles.testTextFail]}>
                {testResult.text}
              </Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            <TouchableOpacity style={styles.actionBtn} onPress={handleTest} disabled={busy || !canSave}>
              <Text style={[styles.actionBtnText, (busy || !canSave) && styles.disabled]}>测试连接</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={handleRunNow} disabled={busy}>
              <Text style={[styles.actionBtnText, busy && styles.disabled]}>立即同步</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.footnote}>
            同步范围：待办 + 分组。每 60 秒自动同步，回前台立即同步。合并策略为按更新时间的 LWW，删除不会复活。
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAF7'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 2,
    borderBottomColor: '#111111'
  },
  headerBtn: {
    minWidth: 56
  },
  headerBtnText: {
    fontSize: 14,
    color: '#111111',
    fontFamily: 'monospace'
  },
  headerBtnPrimary: {
    color: '#E1352B',
    textAlign: 'right',
    fontWeight: '700'
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 2,
    fontFamily: 'monospace'
  },
  disabled: {
    opacity: 0.35
  },
  body: {
    flex: 1,
    paddingHorizontal: 20
  },
  statusBlock: {
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(17,17,27,0.1)'
  },
  kicker: {
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 2,
    color: '#8A8A85'
  },
  statusText: {
    fontFamily: 'monospace',
    fontSize: 22,
    fontWeight: '700',
    color: '#111111',
    marginTop: 6,
    letterSpacing: 1
  },
  statusTextError: {
    color: '#E1352B'
  },
  statusError: {
    fontSize: 12,
    color: '#8A8A85',
    marginTop: 4
  },
  field: {
    marginTop: 22
  },
  label: {
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 2,
    color: '#8A8A85',
    marginBottom: 8
  },
  input: {
    fontSize: 17,
    color: '#111111',
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: '#111111',
    letterSpacing: -0.2
  },
  hint: {
    fontSize: 11,
    color: '#8A8A85',
    marginTop: 8,
    lineHeight: 16
  },
  testBox: {
    marginTop: 18,
    borderWidth: 1.5,
    padding: 12
  },
  testBoxOk: {
    borderColor: '#111111',
    backgroundColor: '#FFFFFF'
  },
  testBoxFail: {
    borderColor: '#E1352B',
    backgroundColor: '#FFF5F4'
  },
  testText: {
    fontFamily: 'monospace',
    fontSize: 12
  },
  testTextOk: {
    color: '#111111'
  },
  testTextFail: {
    color: '#E1352B'
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 26
  },
  actionBtn: {
    flex: 1,
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
  footnote: {
    fontSize: 11,
    color: '#8A8A85',
    lineHeight: 17,
    marginTop: 26,
    marginBottom: 40
  }
});
