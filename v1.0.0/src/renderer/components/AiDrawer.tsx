import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { AiChatMessage } from '@hengsch/shared-types';
import { IconClose, IconGear, IconSend, IconStop } from './Icons';
import { AiProposalCard, type AiCardStatus } from './AiProposalCard';
import { AISettingsModal } from './AISettingsModal';
import { useTodos } from '../context/TodoContext';
import { useGroups } from '../context/GroupContext';
import {
  emptyFlow,
  appendText,
  insertStaged,
  commitCard,
  cancelCard,
  skipCard,
  replaceAfterCancel,
  markCard,
  rebuildQueue,
  toChatMessages,
  type FlowState,
  type FlowEntry
} from '../ai-flow';

interface DrawerNotice {
  kind: 'error' | 'info';
  text: string;
}

interface ReplaceTarget {
  /** 被取消卡的 entry id（新条目插到它后面） */
  anchorId: string;
  /** 用于 [流程] 上下文的一句话（summary 或标题） */
  label: string;
  /** 被取消提案的 id（替换成功后从主进程队列丢弃） */
  proposalId: string;
}

export function AiDrawer({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  const [flow, setFlow] = useState<FlowState>(emptyFlow);
  const [stream, setStream] = useState('');
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState('');
  const [notice, setNotice] = useState<DrawerNotice | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [amending, setAmending] = useState(false);
  const streamRef = useRef('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const replaceRef = useRef<ReplaceTarget | null>(null);
  const restoredRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
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
    // 未决队列恢复（仅当本会话还没有卡片时重建，只跑一次）
    if (!restoredRef.current) {
      restoredRef.current = true;
      window.electronAPI.ai
        .queueList()
        .then((list) => {
          if (!alive || !list.length) return;
          setFlow((current) => {
            if (current.entries.some((entry) => entry.kind === 'card')) return current;
            return rebuildQueue(list);
          });
        })
        .catch(() => undefined);
    }
    return () => {
      alive = false;
    };
  }, [open]);

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [flow, stream, notice]);

  /** 轮到显示的 pending 卡续 TTL（每个提案只 touch 一次） */
  const touchedRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const pending = flow.entries.find(
      (entry): entry is Extract<FlowEntry, { kind: 'card' }> => entry.kind === 'card' && entry.status === 'pending'
    );
    const proposalId = pending?.proposal.id;
    if (!proposalId || proposalId === touchedRef.current) return;
    touchedRef.current = proposalId;
    void window.electronAPI.ai.queueTouch(proposalId).catch(() => undefined);
  }, [flow]);

  async function sendMessages(next: AiChatMessage[]): Promise<void> {
    setBusy(true);
    setStream('');
    streamRef.current = '';
    setNotice(null);
    try {
      const result = await window.electronAPI.ai.chat(next);
      const streamed = streamRef.current;
      streamRef.current = '';
      setStream('');
      if (streamed) setFlow((previous) => appendText(previous, 'assistant', streamed));
      const target = replaceRef.current;
      if (result.proposals.length) {
        if (target) {
          replaceRef.current = null;
          setFlow((previous) => replaceAfterCancel(previous, target.anchorId, result.proposals));
          window.electronAPI.ai.reject(target.proposalId).catch(() => undefined);
        } else {
          setFlow((previous) => insertStaged(previous, result.proposals));
        }
      }
      if (result.error) setNotice({ kind: result.error === '已停止生成' ? 'info' : 'error', text: result.error });
    } catch (error) {
      streamRef.current = '';
      setStream('');
      replaceRef.current = null;
      setAmending(false);
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'AI 服务异常' });
    } finally {
      setBusy(false);
    }
  }

  const submitText = () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    const target = replaceRef.current;
    const content = target ? `[流程] 重新暂存这条待办（原：${target.label}）。新要求：${text}` : text;
    setAmending(false);
    const next = appendText(flow, 'user', content);
    setFlow(next);
    void sendMessages(toChatMessages(next.entries));
  };

  const handleStop = () => {
    window.electronAPI.ai.stop().catch(() => undefined);
  };

  const handleConfirm = async (entryId: string, proposalId: string, patch?: unknown) => {
    try {
      await window.electronAPI.ai.commit(proposalId, patch);
      setFlow((previous) => commitCard(previous, entryId));
      setNotice(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : '确认失败';
      const stale = /过期|已被删除|不存在|已变化/.test(message);
      setFlow((previous) => markCard(previous, entryId, stale ? 'stale' : 'error', message));
    }
  };

  /** 取消：不出队不落盘，就地变已取消并问「这条怎么办？」 */
  const handleCancel = (id: string) => {
    replaceRef.current = null;
    setAmending(false);
    setFlow((previous) => cancelCard(previous, id));
  };

  const handleSkip = (cardEntryId: string, proposalId: string) => {
    replaceRef.current = null;
    setAmending(false);
    window.electronAPI.ai.reject(proposalId).catch(() => undefined);
    setFlow((previous) => skipCard(previous, cardEntryId));
  };

  const handleAmend = (cardEntryId: string, proposalId: string, label: string) => {
    replaceRef.current = { anchorId: cardEntryId, label, proposalId };
    setAmending(true);
    inputRef.current?.focus();
  };

  const refreshKeyNotice = () => {
    window.electronAPI.ai
      .settingsGet()
      .then((settings) => {
        setNotice(settings.apiKeySet ? null : { kind: 'info', text: '未配置 AI：设置里填入 DeepSeek key 后可用' });
      })
      .catch(() => undefined);
  };

  const renderEntry = (entry: FlowEntry): JSX.Element | null => {
    if (entry.kind === 'text') {
      return (
        <div key={entry.id} className={entry.role === 'user' ? 'ai-msg-me' : 'ai-msg-ai'}>
          <span className="ai-msg-role">{entry.role === 'user' ? 'YOU' : 'AI'}</span>
          <div className="ai-msg-body">{entry.content}</div>
        </div>
      );
    }
    if (entry.kind === 'summary') {
      return (
        <div key={entry.id} className="ai-msg-ai">
          <span className="ai-msg-role">AI</span>
          <div className="ai-msg-body">{entry.content}</div>
        </div>
      );
    }
    if (entry.kind === 'system') {
      return (
        <div key={entry.id} className="ai-sys" role="status">
          {entry.content}
        </div>
      );
    }
    if (entry.kind === 'ask') {
      const card = flow.entries.find((item) => item.kind === 'card' && item.id === entry.forEntryId);
      if (!card || card.kind !== 'card') return null;
      const summary = card.proposal.summary
        ?? (card.proposal.kind === 'create'
          ? card.proposal.draft.title
          : card.proposal.kind === 'update'
            ? card.proposal.draft.title ?? card.proposal.before.title
            : card.proposal.before.title);
      return (
        <div key={entry.id} className="ai-ask">
          <span className="ai-ask-text">这条怎么办？</span>
          <div className="ai-ask-actions">
            <button type="button" className="button" onClick={() => handleAmend(card.id, card.proposal.id, summary)}>
              改要求
            </button>
            <button type="button" className="button button-secondary" onClick={() => handleSkip(card.id, card.proposal.id)}>
              跳过
            </button>
          </div>
        </div>
      );
    }
    return (
      <AiProposalCard
        key={entry.id}
        proposal={entry.proposal}
        status={entry.status as AiCardStatus}
        errorText={entry.errorText}
        todos={todoState.todos}
        groups={groupState.groups}
        onConfirm={(_proposalId, patch) => void handleConfirm(entry.id, entry.proposal.id, patch)}
        onReject={() => handleCancel(entry.id)}
      />
    );
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
        {flow.entries.length === 0 && !stream && (
          <div className="ai-empty">READY · 例如「加一条明天 9 点报销」</div>
        )}
        {flow.entries.map(renderEntry)}
        {stream && (
          <div className="ai-msg-ai">
            <span className="ai-msg-role">AI</span>
            <div className="ai-msg-body ai-stream">{stream}</div>
          </div>
        )}
      </div>
      <form
        className="ai-input"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          submitText();
        }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submitText();
            }
          }}
          placeholder={amending ? '说说新要求，回车发送' : '输入内容，回车发送（Shift+回车换行）'}
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
