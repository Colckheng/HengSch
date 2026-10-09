import { useState, useEffect } from 'react';
import { IconClose } from './Icons';
import { useTodos } from '../context/TodoContext';
import { useGroups } from '../context/GroupContext';
import type { SyncConfig, SyncStatus } from '@hengsch/shared-types';

interface SyncSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: SyncStatus | null;
}

const EMPTY_FORM: SyncConfig = {
  enabled: false,
  host: '',
  port: 22,
  username: '',
  remotePath: ''
};

export function SyncSettingsModal({ isOpen, onClose, status }: SyncSettingsModalProps): JSX.Element {
  const { allTodos, applySyncedTodos } = useTodos();
  const { allGroups, applySyncedGroups } = useGroups();
  const [form, setForm] = useState<SyncConfig>(EMPTY_FORM);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<'test' | 'save' | 'run' | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    window.electronAPI.sync
      .getConfig()
      .then((data) => {
        if (!alive) return;
        if (data.config) setForm(data.config);
        setPublicKey(data.publicKey);
      })
      .catch(() => undefined);
    setTestResult(null);
    setNotice(null);
    return () => {
      alive = false;
    };
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const update = <K extends keyof SyncConfig>(key: K, value: SyncConfig[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleTest = async () => {
    setBusy('test');
    setTestResult(null);
    try {
      const result = await window.electronAPI.sync.test(form);
      setTestResult({
        ok: result.ok,
        message: result.ok ? '连接成功，远端目录可写' : result.error ?? '连接失败'
      });
    } catch (error) {
      setTestResult({ ok: false, message: error instanceof Error ? error.message : '连接失败' });
    } finally {
      setBusy(null);
    }
  };

  const handleSave = async () => {
    setBusy('save');
    setNotice(null);
    try {
      const result = await window.electronAPI.sync.configure(form);
      if (!result.ok) {
        setNotice(result.error ?? '保存失败');
        return;
      }
      setNotice('已保存');
      if (form.enabled) {
        const run = await window.electronAPI.sync.run({ todos: allTodos, groups: allGroups });
        if (run.merged) {
          applySyncedTodos(run.merged.todos);
          applySyncedGroups(run.merged.groups);
        }
      }
    } finally {
      setBusy(null);
    }
  };

  const handleRunNow = async () => {
    setBusy('run');
    setNotice(null);
    try {
      const run = await window.electronAPI.sync.run({ todos: allTodos, groups: allGroups });
      if (run.merged) {
        applySyncedTodos(run.merged.todos);
        applySyncedGroups(run.merged.groups);
        setNotice('同步完成');
      } else {
        setNotice(run.status.error ?? `同步未完成：${run.status.state}`);
      }
    } finally {
      setBusy(null);
    }
  };

  const handleCopyKey = async () => {
    if (!publicKey) return;
    try {
      await navigator.clipboard.writeText(publicKey);
      setNotice('公钥已复制');
    } catch {
      setNotice('复制失败，请手动选择文本');
    }
  };

  if (!isOpen) return <></>;

  const statusRed = status?.state === 'AUTH ERROR' || status?.state === 'REMOTE ERROR';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content sync-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>同步设置</h2>
          <button className="modal-close" onClick={onClose} aria-label="关闭">
            <IconClose />
          </button>
        </div>
        <div className="modal-body">
          <div className="sync-status-row">
            <span className={`sync-status-chip ${statusRed ? 'error' : ''}`}>
              {status && status.state !== 'OFF' ? status.state : '未启用'}
            </span>
            {notice && <span className="sync-notice">{notice}</span>}
          </div>

          <label className="sync-enable">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => update('enabled', e.target.checked)}
            />
            启用云同步（SFTP）
          </label>

          <div className="sync-grid">
            <label>
              主机 Host
              <input
                type="text"
                value={form.host}
                onChange={(e) => update('host', e.target.value)}
                placeholder="server.example.com"
              />
            </label>
            <label>
              端口
              <input
                type="number"
                value={form.port}
                onChange={(e) => update('port', Number(e.target.value) || 22)}
                placeholder="22"
              />
            </label>
            <label>
              用户名
              <input
                type="text"
                value={form.username}
                onChange={(e) => update('username', e.target.value)}
                placeholder="root"
              />
            </label>
            <label className="sync-wide">
              远端文件路径（sync.json）
              <input
                type="text"
                value={form.remotePath}
                onChange={(e) => update('remotePath', e.target.value)}
                placeholder="/home/you/hengsch/sync.json"
              />
            </label>
          </div>

          <div className="sync-actions">
            <button
              className="button button-secondary"
              onClick={handleTest}
              disabled={busy !== null}
            >
              {busy === 'test' ? '测试中…' : '测试连接'}
            </button>
            <button
              className="button button-primary"
              onClick={handleSave}
              disabled={busy !== null}
            >
              {busy === 'save' ? '保存中…' : '保存并同步'}
            </button>
            <button
              className="button button-secondary"
              onClick={handleRunNow}
              disabled={busy !== null}
            >
              {busy === 'run' ? '同步中…' : '立即同步'}
            </button>
          </div>
          {testResult && (
            <div className={`sync-test-result ${testResult.ok ? 'ok' : 'err'}`}>
              {testResult.message}
            </div>
          )}
          {statusRed && status?.error && <div className="sync-test-result err">{status.error}</div>}

          <div className="sync-key-block">
            <h3>本机公钥（首次配对）</h3>
            <textarea className="sync-key-text" readOnly value={publicKey ?? ''} rows={3} />
            <div className="sync-actions">
              <button className="button button-secondary" onClick={handleCopyKey} disabled={!publicKey}>
                复制公钥
              </button>
            </div>
            <p className="sync-hint">
              在服务器执行一次：
              <code> echo '公钥' &gt;&gt; ~/.ssh/authorized_keys</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
