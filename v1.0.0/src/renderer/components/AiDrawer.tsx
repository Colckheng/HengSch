import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { AiChatMessage } from '@hengsch/shared-types';
import { IconClose, IconGear, IconMic, IconSend, IconStop } from './Icons';
import { AiProposalCard, type AiCardStatus } from './AiProposalCard';
import { AISettingsModal } from './AISettingsModal';
import { startVoiceRecording, type VoiceRecording } from '../voice-recorder';
import type { VoiceModelStatus } from '../types/electron';
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
  mergeRestoredQueue,
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

export function AiDrawer({
  open,
  onClose,
  onActivityChange
}: {
  open: boolean;
  onClose: () => void;
  onActivityChange?: (info: { busy: boolean; pendingCount: number }) => void;
}): JSX.Element {
  const [flow, setFlow] = useState<FlowState>(emptyFlow);
  const [stream, setStream] = useState('');
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState('');
  const [notice, setNotice] = useState<DrawerNotice | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [amending, setAmending] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const [micState, setMicState] = useState<'idle' | 'recording' | 'busy'>('idle');
  const [voiceModel, setVoiceModel] = useState<VoiceModelStatus | null>(null);
  const recordingRef = useRef<VoiceRecording | null>(null);
  const micTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamRef = useRef('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const replaceRef = useRef<ReplaceTarget | null>(null);
  const restoredRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const atBottomRef = useRef(true);
  const justSentRef = useRef(false);
  const { state: todoState } = useTodos();
  const { state: groupState } = useGroups();
  const flowRef = useRef(flow);
  flowRef.current = flow;
  const committingRef = useRef<Set<string>>(new Set());
  const [committingIds, setCommittingIds] = useState<ReadonlySet<string>>(() => new Set());
  const lastSentRef = useRef<AiChatMessage[] | null>(null);

  const pendingCount = useMemo(
    () => flow.entries.filter((entry) => entry.kind === 'card' && entry.status === 'pending').length,
    [flow]
  );

  useEffect(() => {
    onActivityChange?.({ busy, pendingCount });
  }, [busy, pendingCount, onActivityChange]);

  useEffect(() => {
    const off = window.electronAPI.ai.onChunk(({ delta }) => {
      streamRef.current += delta;
      setStream(streamRef.current);
    });
    return off;
  }, []);

  // 语音模型状态：挂载即订阅（设置里下载的进度抽屉也收得到），打开时刷新一次
  useEffect(() => {
    const off = window.electronAPI.ai.onVoiceModel((status) => setVoiceModel(status));
    window.electronAPI.ai.voiceModelStatus().then((status) => setVoiceModel(status)).catch(() => undefined);
    return off;
  }, []);

  // 抽屉关闭/卸载时放弃未送识别的录音
  useEffect(() => {
    if (open) return;
    recordingRef.current?.discard();
    recordingRef.current = null;
    if (micTimerRef.current) {
      clearTimeout(micTimerRef.current);
      micTimerRef.current = null;
    }
    setMicState((current) => (current === 'busy' ? current : 'idle'));
  }, [open]);

  useEffect(() => () => {
    recordingRef.current?.discard();
    recordingRef.current = null;
    if (micTimerRef.current) clearTimeout(micTimerRef.current);
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
    // 未决队列恢复（按 proposal id 合并：本地已有的跳过，缺的补进队尾）
    if (!restoredRef.current) {
      restoredRef.current = true;
      window.electronAPI.ai
        .queueList()
        .then((list) => {
          if (!alive || !list.length) return;
          setFlow((current) => mergeRestoredQueue(current, list));
        })
        .catch(() => undefined);
    }
    return () => {
      alive = false;
    };
  }, [open]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    // F-3 打开即聚焦 + 定位到底部
    if (open) {
      atBottomRef.current = true;
      element.scrollTop = element.scrollHeight;
      inputRef.current?.focus();
      return;
    }
    // F-1 仅在原本就在底部（或刚发送）时吸底；上翻回看不被拽回
    if (atBottomRef.current || justSentRef.current) {
      element.scrollTop = element.scrollHeight;
    }
    if (!stream) {
      justSentRef.current = false;
      if (atBottomRef.current) setShowJump(false);
    }
  }, [flow, stream, notice, open]);

  const handleMsgScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
    atBottomRef.current = nearBottom;
    if (nearBottom) setShowJump(false);
    else if (flowRef.current.entries.length > 0) setShowJump(true);
  };

  const jumpToLatest = () => {
    const element = scrollRef.current;
    if (!element) return;
    atBottomRef.current = true;
    element.scrollTop = element.scrollHeight;
    setShowJump(false);
  };

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
    lastSentRef.current = next;
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
    if (busy) {
      setNotice({ kind: 'info', text: '正在生成中，先停止或等本次完成' });
      return;
    }
    if (!text) return;
    setInput('');
    if (inputRef.current) inputRef.current.style.height = '';
    const target = replaceRef.current;
    const content = target ? `[流程] 重新暂存这条待办（原：${target.label}）。新要求：${text}` : text;
    setAmending(false);
    if (target) {
      // 改要求：旧提案先出队，避免主进程重入门禁拦下新一轮 stage
      window.electronAPI.ai.reject(target.proposalId).catch(() => setNotice({ kind: 'error', text: '原提案移出队列失败，请重试' }));
    }
    const next = appendText(flow, 'user', content, target ? text : undefined);
    setFlow(next);
    justSentRef.current = true;
    void sendMessages(toChatMessages(next.entries));
  };

  const retryLast = () => {
    const last = lastSentRef.current;
    if (!last || busy) return;
    void sendMessages(last);
  };

  const handleStop = () => {
    window.electronAPI.ai.stop().catch(() => undefined);
  };

  const handleConfirm = async (entryId: string, proposalId: string, patch?: unknown) => {
    if (committingRef.current.has(entryId)) return;
    committingRef.current.add(entryId);
    setCommittingIds(new Set(committingRef.current));
    try {
      await window.electronAPI.ai.commit(proposalId, patch);
      setFlow((previous) => commitCard(previous, entryId));
      setNotice(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : '确认失败';
      const stale = /过期|已被删除|不存在|已变化/.test(message);
      const entry = flowRef.current.entries.find((item) => item.id === entryId);
      if (entry?.kind === 'card' && entry.status !== 'committed' && entry.status !== 'rejected') {
        setFlow((previous) => markCard(previous, entryId, stale ? 'stale' : 'error', message));
      }
    } finally {
      committingRef.current.delete(entryId);
      setCommittingIds(new Set(committingRef.current));
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
    window.electronAPI.ai.reject(proposalId).catch(() => setNotice({ kind: 'error', text: '原提案移出队列失败，请重试' }));
    setFlow((previous) => skipCard(previous, cardEntryId));
  };

  const handleAmend = (cardEntryId: string, proposalId: string, label: string) => {
    replaceRef.current = { anchorId: cardEntryId, label, proposalId };
    setAmending(true);
    inputRef.current?.focus();
  };

  const exitAmend = () => {
    replaceRef.current = null;
    setAmending(false);
    inputRef.current?.focus();
  };

  const handleNewSession = () => {
    replaceRef.current = null;
    setAmending(false);
    setNotice(null);
    setFlow((previous) => ({
      ...previous,
      entries: previous.entries.filter((entry) => entry.kind !== 'text' && entry.kind !== 'summary')
    }));
  };

  const growInput = (element: HTMLTextAreaElement) => {
    element.style.height = 'auto';
    const max = 6 * 1.5 * 13 + 16;
    element.style.height = `${Math.min(element.scrollHeight, max)}px`;
  };

  const handleInputAutoGrow = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
    growInput(event.target);
  };

  /** 识别完成/失败统一收口：文本进输入框可改，错误走 notice */
  const stopVoice = async (rec: VoiceRecording) => {
    setMicState('busy');
    try {
      const { wav, seconds } = await rec.stop();
      if (seconds < 0.4) {
        setNotice({ kind: 'error', text: '录音太短，请重试' });
        return;
      }
      const { text } = await window.electronAPI.ai.voice(wav);
      if (!text) {
        setNotice({ kind: 'error', text: '未识别到内容，请重试' });
        return;
      }
      setNotice(null);
      setInput((current) => (current ? current + text : text));
      requestAnimationFrame(() => {
        const element = inputRef.current;
        if (!element) return;
        growInput(element);
        element.focus();
      });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : '语音识别失败' });
    } finally {
      setMicState('idle');
    }
  };

  const handleMic = () => {
    if (micState === 'recording') {
      const rec = recordingRef.current;
      recordingRef.current = null;
      if (micTimerRef.current) {
        clearTimeout(micTimerRef.current);
        micTimerRef.current = null;
      }
      if (rec) void stopVoice(rec);
      return;
    }
    if (micState !== 'idle' || voiceModel?.state !== 'ready' || !voiceModel.exeReady) return;
    startVoiceRecording()
      .then((rec) => {
        recordingRef.current = rec;
        setMicState('recording');
        micTimerRef.current = setTimeout(() => {
          const active = recordingRef.current;
          recordingRef.current = null;
          micTimerRef.current = null;
          if (active) void stopVoice(active);
        }, 60_000);
      })
      .catch((error: unknown) => {
        const denied = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
        setNotice({ kind: 'error', text: denied ? '麦克风权限被拒绝' : error instanceof Error ? error.message : '无法开始录音' });
      });
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
      const time = entry.at ? new Date(entry.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
      return (
        <div key={entry.id} className={entry.role === 'user' ? 'ai-msg-me' : 'ai-msg-ai'}>
          <span className="ai-msg-role">
            {entry.role === 'user' ? 'YOU' : 'AI'}
            {time && <span className="ai-msg-time">{time}</span>}
          </span>
          <div className="ai-msg-body">{entry.display ?? entry.content}</div>
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
            <button type="button" className="button" onClick={() => handleAmend(card.id, card.proposal.id, summary)} disabled={busy}>
              改要求
            </button>
            <button type="button" className="button button-secondary" onClick={() => handleSkip(card.id, card.proposal.id)} disabled={busy}>
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
        busy={committingIds.has(entry.id)}
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
          <button type="button" className="ai-drawer-close" onClick={handleNewSession} aria-label="新会话" title="新会话（清空对话，保留待确认卡片）">
            ＋
          </button>
          <button type="button" className="ai-drawer-close" onClick={() => setSettingsOpen(true)} aria-label="AI 设置" title="设置">
            <IconGear size={14} />
          </button>
          <button type="button" className="ai-drawer-close" onClick={onClose} aria-label="关闭 AI 抽屉" title="关闭">
            <IconClose size={14} />
          </button>
        </div>
      </div>
      <AISettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} onSaved={refreshKeyNotice} />
      {notice && (
        <div className={notice.kind === 'error' ? 'ai-err' : 'ai-notice'} role={notice.kind === 'error' ? 'alert' : 'status'}>
          <span className="ai-notice-text">{notice.text}</span>
          <span className="ai-notice-actions">
            {notice.kind === 'error' && lastSentRef.current && (
              <button type="button" className="ai-notice-btn" onClick={retryLast} disabled={busy}>
                重试
              </button>
            )}
            <button type="button" className="ai-notice-btn" onClick={() => setNotice(null)} aria-label="关闭提示">
              ✕
            </button>
          </span>
        </div>
      )}
      <div className="ai-msgs" ref={scrollRef} onScroll={handleMsgScroll}>
        {flow.entries.length === 0 && !stream && !busy && (
          <div className="ai-empty">READY · 例如「加一条明天 9 点报销」</div>
        )}
        {flow.entries.map(renderEntry)}
        {stream && (
          <div className="ai-msg-ai">
            <span className="ai-msg-role">AI</span>
            <div className="ai-msg-body ai-stream">{stream}</div>
          </div>
        )}
        {busy && !stream && (
          <div className="ai-msg-ai">
            <span className="ai-msg-role">AI</span>
            <div className="ai-msg-body ai-skeleton" aria-label="正在生成">
              <i /> <i /> <i />
            </div>
          </div>
        )}
        {showJump && (
          <button type="button" className="ai-jump" onClick={jumpToLatest}>
            ↓ 回到最新
          </button>
        )}
      </div>
      {amending && replaceRef.current && (
        <div className="ai-amend-bar" role="status">
          <span className="ai-amend-text">正在改要求：{replaceRef.current.label}</span>
          <button type="button" className="ai-amend-exit" onClick={exitAmend} aria-label="退出改要求" title="退出改要求">
            ✕
          </button>
        </div>
      )}
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
          onChange={handleInputAutoGrow}
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
          <button
            type="button"
            className={`ai-mic${micState === 'recording' ? ' recording' : ''}`}
            aria-label={micState === 'recording' ? '停止录音' : '语音输入'}
            title={
              voiceModel?.state !== 'ready' || !voiceModel.exeReady
                ? '模型未下载'
                : micState === 'recording'
                  ? '停止录音'
                  : '语音输入'
            }
            disabled={micState === 'busy' || (micState === 'idle' && (voiceModel?.state !== 'ready' || !voiceModel.exeReady))}
            onClick={handleMic}
          >
            {micState === 'busy' ? <span className="ai-mic-busy" /> : <IconMic size={12} />}
          </button>
          {busy ? (
            <button type="button" className="ai-stop" onClick={handleStop} title="停止生成">
              <IconStop size={11} /> 停止
            </button>
          ) : (
            <button type="submit" className="ai-send" title="发送" disabled={!input.trim()}>
              <IconSend size={11} /> 发送
            </button>
          )}
        </div>
      </form>
    </aside>
  );
}
