import { useState, useEffect } from 'react';
import { IconClose } from './Icons';
import { useSync } from '../context/SyncContext';

interface SyncSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TestResult = { ok: boolean; message: string } | null;

export function SyncSettingsModal({ isOpen, onClose }: SyncSettingsModalProps): JSX.Element {
  const { status, config, configure, testConnection, runNow } = useSync();
  const [enabled, setEnabled] = useState(true);
  const [serverUrl, setServerUrl] = useState('');
  const [token, setToken] = useState('');
  const [testResult, setTestResult] = useState<TestResult>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setEnabled(config ? config.enabled : true);
      setServerUrl(config?.serverUrl ?? '');
      setToken(config?.token ?? '');
      setTestResult(null);
      setBusy(false);
    }
  }, [isOpen, config]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return <></>;

  const canSave = serverUrl.trim().length > 0 && token.trim().length > 0;
  const statusRed = status.state === 'AUTH ERROR' || status.state === 'REMOTE ERROR' || status.state === 'OFFLINE';

  const buildConfig = () => ({
    enabled,
    serverUrl: serverUrl.trim(),
    token: token.trim()
  });

  const handleTest = async () => {
    if (!canSave) return;
    setBusy(true);
    setTestResult(null);
    const cfg = buildConfig();
    const result = await testConnection(cfg);
    if (result.ok) {
      await configure(cfg);
      setTestResult({ ok: true, message: `连接成功，配置已保存${cfg.enabled ? '，同步已启用' : '（同步未启用）'}` });
    } else {
      setTestResult({ ok: false, message: `失败：${result.error ?? '未知错误'}` });
    }
    setBusy(false);
  };

  const handleSave = async () => {
    if (!canSave) return;
    setBusy(true);
    await configure(buildConfig());
    setBusy(false);
    onClose();
  };

  const handleRunNow = async () => {
    setBusy(true);
    if (canSave) {
      // 先持久化当前表单（含启用状态），configure 在 enabled 时会自动触发一轮
      await configure(buildConfig());
    } else {
      runNow();
    }
    setBusy(false);
    onClose();
  };

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
              {status.state !== 'OFF' ? status.state : '未启用'}
            </span>
          </div>

          <label className="sync-enable">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            启用云同步
          </label>

          <div className="sync-grid">
            <label className="sync-wide">
              服务器地址（HTTP 桥）
              <input
                type="text"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="http://39.102.49.72:8642"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <label className="sync-wide">
              TOKEN
              <input
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="同步令牌"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
          </div>

          <div className="sync-actions">
            <button className="button button-secondary" onClick={handleTest} disabled={busy || !canSave}>
              {busy ? '处理中…' : '测试并保存'}
            </button>
            <button className="button button-primary" onClick={handleSave} disabled={busy || !canSave}>
              保存
            </button>
            <button className="button button-secondary" onClick={handleRunNow} disabled={busy}>
              立即同步
            </button>
          </div>

          {testResult && (
            <div className={`sync-test-result ${testResult.ok ? 'ok' : 'err'}`}>{testResult.message}</div>
          )}
          {statusRed && status.error && <div className="sync-test-result err">{status.error}</div>}

          <p className="sync-hint">
            与手机端共用同一个 HTTP 同步桥与 TOKEN，三端数据互通。浏览器标签页回到前台时会自动同步。
          </p>
        </div>
      </div>
    </div>
  );
}
