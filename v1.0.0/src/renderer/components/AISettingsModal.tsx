import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { IconClose } from './Icons';
import { SwissSelect } from './SwissSelect';
import type { AiMaskedSettings, VoiceModelStatus } from '../types/electron';

interface AISettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function AISettingsModal({ isOpen, onClose, onSaved }: AISettingsModalProps): JSX.Element {
  const [settings, setSettings] = useState<AiMaskedSettings | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [model, setModel] = useState<'deepseek-flash' | 'deepseek-v4-pro'>('deepseek-flash');
  const [promptLevel, setPromptLevel] = useState<1 | 2>(1);
  const [verdict, setVerdict] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState<'test' | 'save' | null>(null);
  const [voice, setVoice] = useState<VoiceModelStatus | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) return undefined;
    const off = window.electronAPI.ai.onVoiceModel((status) => setVoice(status));
    window.electronAPI.ai
      .voiceModelStatus()
      .then((status) => setVoice(status))
      .catch(() => undefined);
    return off;
  }, [isOpen]);

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
        setPromptLevel(next.promptLevel);
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
    if (busy) return;
    const nextModel: 'deepseek-flash' | 'deepseek-v4-pro' = value === 'deepseek-v4-pro' ? 'deepseek-v4-pro' : 'deepseek-flash';
    setModel(nextModel);
    setBusy('save');
    try {
      const next = await window.electronAPI.ai.settingsSet({ model: nextModel });
      setSettings(next);
      setNotice('已保存');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '保存失败');
    } finally {
      setBusy(null);
    }
  };

  const updateVerdict = async (enabled: boolean) => {
    if (busy) return;
    setVerdict(enabled);
    setBusy('save');
    try {
      const next = await window.electronAPI.ai.settingsSet({ monitorVerdictEnabled: enabled });
      setSettings(next);
      setNotice('已保存');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '保存失败');
    } finally {
      setBusy(null);
    }
  };

  const updatePromptLevel = async (value: string) => {
    if (busy) return;
    const level: 1 | 2 = value === '2' ? 2 : 1;
    setPromptLevel(level);
    setBusy('save');
    try {
      const next = await window.electronAPI.ai.settingsSet({ promptLevel: level });
      setSettings(next);
      setNotice('已保存');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '保存失败');
    } finally {
      setBusy(null);
    }
  };

  const handleVoiceDownload = async () => {
    if (voiceBusy) return;
    setVoiceBusy(true);
    setNotice(null);
    try {
      const status = await window.electronAPI.ai.voiceModelDownload();
      setVoice(status);
      if (status.state === 'ready') setNotice('语音模型已就绪');
      else if (status.state === 'error') setNotice(status.error ?? '下载失败');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '下载失败');
    } finally {
      setVoiceBusy(false);
    }
  };

  const voiceChip = !voice
    ? '…'
    : !voice.exeReady
      ? '组件缺失'
      : voice.state === 'ready'
        ? '模型就绪'
        : voice.state === 'downloading'
          ? `下载中 ${Math.round(voice.progress * 100)}%`
          : voice.state === 'error'
            ? '失败'
            : '未下载';

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
                  disabled={busy !== null}
                  options={[
                    { value: 'deepseek-flash', label: 'deepseek-flash' },
                    { value: 'deepseek-v4-pro', label: 'deepseek-v4-pro' }
                  ]}
                />
              </label>
              <label className="sync-wide">
                详细程度
                <SwissSelect
                  value={String(promptLevel)}
                  onChange={(value) => void updatePromptLevel(value)}
                  disabled={busy !== null}
                  options={[
                    { value: '1', label: '只按我说的（默认）' },
                    { value: '2', label: '缺的先问我' }
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
              <input type="checkbox" checked={verdict} disabled={busy !== null} onChange={(event) => void updateVerdict(event.target.checked)} />
              AI 监测判定
            </label>
          </div>

          <div className="sync-key-block">
            <h3>语音模型</h3>
            <div className="sync-status-row">
              <span className={`sync-status-chip ${voice && (voice.state === 'error' || !voice.exeReady) ? 'error' : ''}`}>{voiceChip}</span>
              {voice?.state === 'error' && <span className="sync-notice">{voice.error}</span>}
            </div>
            {voice?.state === 'downloading' && (
              <div className="ai-voice-model">
                <span className="ai-voice-model-bar">
                  <i style={{ width: `${Math.round(voice.progress * 100)}%` }} />
                </span>
                <span>{Math.round(voice.progress * 100)}%</span>
              </div>
            )}
            {voice && voice.state !== 'ready' && voice.state !== 'downloading' && (
              <div className="sync-actions">
                <button type="button" className="button button-secondary" onClick={() => void handleVoiceDownload()} disabled={voiceBusy}>
                  {voiceBusy ? '下载中…' : voice.state === 'error' ? '重试' : '下载模型'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
