import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { IconClose } from './Icons';
import { SwissSelect } from './SwissSelect';
import type { AiMaskedSettings } from '../types/electron';

interface AISettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function AISettingsModal({ isOpen, onClose, onSaved }: AISettingsModalProps): JSX.Element {
  const [settings, setSettings] = useState<AiMaskedSettings | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [model, setModel] = useState<'deepseek-flash' | 'deepseek-v4-pro'>('deepseek-flash');
  const [verdict, setVerdict] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState<'test' | 'save' | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    setKeyInput('');
    setNotice(null);
    setTestResult(null);
    window.electronAPI.ai
      .settingsGet()
      .then((next) => {
        if (!alive) return;
        setSettings(next);
        setModel(next.model);
        setVerdict(next.monitorVerdictEnabled);
      })
      .catch(() => undefined);
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

  if (!isOpen) return <></>;

  const handleSaveKey = async (event: FormEvent) => {
    event.preventDefault();
    setBusy('save');
    setNotice(null);
    setTestResult(null);
    try {
      const next = await window.electronAPI.ai.settingsSet({ apiKey: keyInput.trim() });
      setSettings(next);
      setKeyInput('');
      setNotice(next.apiKeySet ? '已保存' : '已清除 key');
      onSaved();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '保存失败');
    } finally {
      setBusy(null);
    }
  };

  const handleTest = async () => {
    setBusy('test');
    setTestResult(null);
    try {
      const result = await window.electronAPI.ai.settingsTest(keyInput.trim() || undefined);
      setTestResult(result);
    } catch (error) {
      setTestResult({ ok: false, message: error instanceof Error ? error.message : '测试失败' });
    } finally {
      setBusy(null);
    }
  };

  const updateModel = async (value: string) => {
    const nextModel: 'deepseek-flash' | 'deepseek-v4-pro' = value === 'deepseek-v4-pro' ? 'deepseek-v4-pro' : 'deepseek-flash';
    setModel(nextModel);
    try {
      const next = await window.electronAPI.ai.settingsSet({ model: nextModel });
      setSettings(next);
      setNotice('已保存');
    } catch {
      setNotice('保存失败');
    }
  };

  const updateVerdict = async (enabled: boolean) => {
    setVerdict(enabled);
    try {
      const next = await window.electronAPI.ai.settingsSet({ monitorVerdictEnabled: enabled });
      setSettings(next);
      setNotice('已保存');
    } catch {
      setNotice('保存失败');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content sync-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h2>AI 设置</h2>
          <button className="modal-close" onClick={onClose} aria-label="关闭">
            <IconClose />
          </button>
        </div>
        <div className="modal-body">
          <div className="sync-status-row">
            <span className={`sync-status-chip ${settings && !settings.apiKeySet ? 'error' : ''}`}>
              {settings ? (settings.apiKeySet ? `KEY ${settings.apiKeyMasked}` : '未配置 key') : '…'}
            </span>
            {notice && <span className="sync-notice">{notice}</span>}
          </div>

          <form className="sync-key-block" onSubmit={handleSaveKey}>
            <h3>DeepSeek</h3>
            <div className="sync-grid">
              <label className="sync-wide">
                API KEY
                <input
                  type="password"
                  value={keyInput}
                  onChange={(event) => setKeyInput(event.target.value)}
                  placeholder={settings?.apiKeySet ? settings.apiKeyMasked : 'sk-…'}
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              <label className="sync-wide">
                模型
                <SwissSelect
                  value={model}
                  onChange={(value) => void updateModel(value)}
                  options={[
                    { value: 'deepseek-flash', label: 'deepseek-flash' },
                    { value: 'deepseek-v4-pro', label: 'deepseek-v4-pro' }
                  ]}
                />
              </label>
            </div>
            <div className="sync-actions">
              <button type="button" className="button button-secondary" onClick={handleTest} disabled={busy !== null}>
                {busy === 'test' ? '测试中…' : '测试连接'}
              </button>
              <button type="submit" className="button button-primary" disabled={busy !== null}>
                {busy === 'save' ? '保存中…' : '保存 key'}
              </button>
            </div>
            {testResult && <div className={`sync-test-result ${testResult.ok ? 'ok' : 'err'}`}>{testResult.message}</div>}
          </form>

          <div className="sync-key-block">
            <h3>监测</h3>
            <label className="sync-enable">
              <input type="checkbox" checked={verdict} onChange={(event) => void updateVerdict(event.target.checked)} />
              AI 监测判定
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
