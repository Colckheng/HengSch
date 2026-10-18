import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { AiChatMessage, AiProposal } from '@hengsch/shared-types';
import { IconClose, IconGear, IconSend, IconStop } from './Icons';
import { AiProposalCard, type AiCardStatus } from './AiProposalCard';
import { AISettingsModal } from './AISettingsModal';
import { useTodos } from '../context/TodoContext';
import { useGroups } from '../context/GroupContext';

interface DrawerNotice {
  kind: 'error' | 'info';
  text: string;
}

interface CardEntry {
  proposal: AiProposal;
  status: AiCardStatus;
  errorText?: string;
}

export function AiDrawer({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [stream, setStream] = useState('');
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState('');
  const [notice, setNotice] = useState<DrawerNotice | null>(null);
  const [cards, setCards] = useState<CardEntry[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const streamRef = useRef('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { state: todoState } = useTodos();
  const { state: groupState } = useGroups();

  useEffect(() => {
    const off = window.electronAPI.ai.onChunk(({ delta }) => {
      streamRef.current += delta;
      setStream(streamRef.current);
    });
    return off;
  }, []);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    window.electronAPI.ai
      .settingsGet()
      .then((settings) => {
        if (alive && !settings.apiKeySet) setNotice((current) => current ?? { kind: 'info', text: '未配置 AI：设置里填入 DeepSeek key 后可用' });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [open]);

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages, stream, cards, notice]);

  async function sendMessages(next: AiChatMessage[]): Promise<void> {
    setMessages(next);
    setBusy(true);
    setStream('');
    streamRef.current = '';
    setNotice(null);
    try {
      const result = await window.electronAPI.ai.chat(next);
      const streamed = streamRef.current;
      streamRef.current = '';
      setStream('');
      if (streamed) setMessages((previous) => [...previous, { role: 'assistant', content: streamed }]);
      if (result.proposals.length) {
        setCards((previous) => [...previous, ...result.proposals.map((proposal) => ({ proposal, status: 'pending' as AiCardStatus }))]);
      }
      if (result.error) setNotice({ kind: result.error === '已停止生成' ? 'info' : 'error', text: result.error });
    } catch (error) {
      streamRef.current = '';
      setStream('');
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'AI 服务异常' });
    } finally {
      setBusy(false);
    }
  }

  const submitText = () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    void sendMessages([...messages, { role: 'user', content: text }]);
  };

  const handleStop = () => {
    window.electronAPI.ai.stop().catch(() => undefined);
  };

  const handleConfirm = async (id: string, patch?: unknown) => {
    try {
      await window.electronAPI.ai.commit(id, patch);
      setCards((previous) => previous.map((entry) => (entry.proposal.id === id ? { ...entry, status: 'committed', errorText: undefined } : entry)));
      setNotice(null);
      window.setTimeout(() => setCards((previous) => previous.filter((entry) => entry.proposal.id !== id)), 2000);
    } catch (error) {
      const message = error instanceof Error ? error.message : '确认失败';
      const stale = /过期|已被删除|不存在|已变化/.test(message);
      setCards((previous) => previous.map((entry) => (entry.proposal.id === id ? { ...entry, status: stale ? 'stale' : 'error', errorText: message } : entry)));
    }
  };

  const handleReject = async (id: string) => {
    try {
      await window.electronAPI.ai.reject(id);
    } catch {
      /* 主进程已丢弃时也把卡片收走 */
    }
    setCards((previous) => previous.map((entry) => (entry.proposal.id === id ? { ...entry, status: 'rejected', errorText: undefined } : entry)));
    window.setTimeout(() => setCards((previous) => previous.filter((entry) => entry.proposal.id !== id)), 1500);
  };

  const refreshKeyNotice = () => {
    window.electronAPI.ai
      .settingsGet()
      .then((settings) => {
        setNotice(settings.apiKeySet ? null : { kind: 'info', text: '未配置 AI：设置里填入 DeepSeek key 后可用' });
      })
      .catch(() => undefined);
  };

  return (
    <aside className={`ai-drawer ${open ? 'open' : ''}`} aria-hidden={!open}>
      <div className="ai-drawer-head">
        <span className="ai-drawer-title">AI 管家</span>
        <div className="ai-drawer-head-actions">
          <button type="button" className="ai-drawer-close" onClick={() => setSettingsOpen(true)} aria-label="AI 设置" title="设置">
            <IconGear size={14} />
          </button>
          <button type="button" className="ai-drawer-close" onClick={onClose} aria-label="关闭 AI 抽屉" title="关闭">
            <IconClose size={14} />
          </button>
        </div>
      </div>
      <AISettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} onSaved={refreshKeyNotice} />
      {notice && <div className={notice.kind === 'error' ? 'ai-err' : 'ai-notice'}>{notice.text}</div>}
      <div className="ai-msgs" ref={scrollRef}>
        {messages.length === 0 && !stream && cards.length === 0 && (
          <div className="ai-empty">READY · 例如「加一条明天 9 点报销」</div>
        )}
        {messages.map((message, index) => (
          <div key={`${index}-${message.role}`} className={message.role === 'user' ? 'ai-msg-me' : 'ai-msg-ai'}>
            <span className="ai-msg-role">{message.role === 'user' ? 'YOU' : 'AI'}</span>
            <div className="ai-msg-body">{message.content}</div>
          </div>
        ))}
        {stream && (
          <div className="ai-msg-ai">
            <span className="ai-msg-role">AI</span>
            <div className="ai-msg-body ai-stream">{stream}</div>
          </div>
        )}
        {cards.map((entry) => (
          <AiProposalCard
            key={entry.proposal.id}
            proposal={entry.proposal}
            status={entry.status}
            errorText={entry.errorText}
            todos={todoState.todos}
            groups={groupState.groups}
            onConfirm={(id, patch) => void handleConfirm(id, patch)}
            onReject={(id) => void handleReject(id)}
          />
        ))}
      </div>
      <form
        className="ai-input"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          submitText();
        }}
      >
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submitText();
            }
          }}
          placeholder="输入内容，回车发送（Shift+回车换行）"
          rows={2}
          aria-label="AI 对话输入"
        />
        <div className="ai-input-actions">
          {busy ? (
            <button type="button" className="ai-stop" onClick={handleStop} title="停止生成">
              <IconStop size={11} /> 停止
            </button>
          ) : (
            <button type="submit" className="ai-send" title="发送">
              <IconSend size={11} /> 发送
            </button>
          )}
        </div>
      </form>
    </aside>
  );
}
