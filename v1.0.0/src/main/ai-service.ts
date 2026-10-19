import type Store from 'electron-store';
import type { Todo, Group, AiProposal, AiChatMessage, AiChatResult } from '@hengsch/shared-types';
import { stageProposal, stageProposalBatch, applyProposal, STAGE_BATCH_MAX, type AiDataContext } from './ai-tools';

export type { AiChatMessage, AiChatResult };

export interface AiSettings {
  apiKey?: string;
  model: 'deepseek-flash' | 'deepseek-v4-pro';
  monitorVerdictEnabled: boolean;
  /** 详细程度：1=只按用户说的+默认（默认）；2=缺字段先集中问 */
  promptLevel: 1 | 2;
}

const ENDPOINT = 'https://api.deepseek.com/chat/completions';
const HISTORY_LIMIT = 20;
const HISTORY_CHAR_BUDGET = 30_000;
const HISTORY_MESSAGE_CHARS = 4_000;
const TODO_CONTEXT_LIMIT = 100;
const PROCESS_CONTEXT_LIMIT = 60;
const TOOL_ROUNDS = 6;
const STREAM_TIMEOUT_MS = 60_000;
const PROPOSAL_TTL_MS = 10 * 60_000;

const DEFAULT_SETTINGS: AiSettings = { model: 'deepseek-flash', monitorVerdictEnabled: false, promptLevel: 1 };

let storeRef: Store | null = null;
let push: (channel: string, payload: unknown) => void = () => undefined;
let activeRun: AbortController | null = null;
let lastProcessNames: string[] = [];
const proposals = new Map<string, { proposal: AiProposal; expires: number }>();

export function initAiService(store: Store, pushToRenderer: (channel: string, payload: unknown) => void): void {
  storeRef = store;
  push = pushToRenderer;
  proposals.clear();
  lastProcessNames = [];
}

export function readAiSettings(store: Store): AiSettings {
  const raw = store.get('aiSettings') as Partial<AiSettings> | undefined;
  return {
    apiKey: typeof raw?.apiKey === 'string' && raw.apiKey ? raw.apiKey : undefined,
    model: raw?.model === 'deepseek-v4-pro' ? 'deepseek-v4-pro' : 'deepseek-flash',
    monitorVerdictEnabled: raw?.monitorVerdictEnabled === true,
    promptLevel: raw?.promptLevel === 2 ? 2 : 1
  };
}

export function maskedAiSettings(store: Store): Omit<AiSettings, 'apiKey'> & { apiKeySet: boolean; apiKeyMasked: string } {
  const settings = readAiSettings(store);
  const { apiKey, ...rest } = settings;
  return {
    ...rest,
    apiKeySet: Boolean(apiKey),
    apiKeyMasked: apiKey ? `sk-…${apiKey.slice(-4)}` : ''
  };
}

export function writeAiSettings(store: Store, patch: Partial<AiSettings>): AiSettings {
  const current = readAiSettings(store);
  const next: AiSettings = {
    apiKey: patch.apiKey !== undefined ? (patch.apiKey || undefined) : current.apiKey,
    model: patch.model === 'deepseek-v4-pro' ? 'deepseek-v4-pro' : patch.model === 'deepseek-flash' ? 'deepseek-flash' : current.model,
    monitorVerdictEnabled: patch.monitorVerdictEnabled !== undefined ? patch.monitorVerdictEnabled === true : current.monitorVerdictEnabled,
    promptLevel: patch.promptLevel === 2 ? 2 : patch.promptLevel === 1 ? 1 : current.promptLevel
  };
  store.set('aiSettings', next);
  return next;
}

export async function testAiConnection(store: Store, overrideKey?: string): Promise<{ ok: boolean; message: string }> {
  const key = overrideKey !== undefined ? overrideKey.trim() : readAiSettings(store).apiKey ?? '';
  if (!key) return { ok: false, message: '未配置 API key' };
  try {
    const response = await fetch('https://api.deepseek.com/models', { headers: { Authorization: `Bearer ${key}` } });
    if (response.ok) return { ok: true, message: `连接成功（${response.status}）` };
    if (response.status === 401) return { ok: false, message: 'key 无效（401）' };
    if (response.status === 402) return { ok: false, message: '余额不足（402）' };
    return { ok: false, message: `请求失败（${response.status}）` };
  } catch {
    return { ok: false, message: '网络不可用，无法连接 DeepSeek' };
  }
}

/** 纯 SSE 行拆分：按行产出 data: 后面的负载，可被任意分片切开 */
export function createSseFeed(): { push(chunk: string): string[] } {
  let buffer = '';
  return {
    push(chunk: string): string[] {
      buffer += chunk;
      const out: string[] = [];
      let index = buffer.indexOf('\n');
      while (index >= 0) {
        const line = buffer.slice(0, index).replace(/\r$/, '');
        buffer = buffer.slice(index + 1);
        if (line.startsWith('data:')) out.push(line.slice(5).trim());
        index = buffer.indexOf('\n');
      }
      return out;
    }
  };
}

export interface ToolCallAcc {
  id: string;
  name: string;
  args: string;
}

/** 合并流式 tool_calls 分片（按 index 归并） */
export function accumulateToolCalls(
  store: Map<number, ToolCallAcc>,
  deltas: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }> | undefined
): void {
  if (!Array.isArray(deltas)) return;
  for (const delta of deltas) {
    const index = typeof delta.index === 'number' ? delta.index : 0;
    const acc = store.get(index) ?? { id: '', name: '', args: '' };
    if (delta.id && !acc.id) acc.id = delta.id;
    if (delta.function?.name && !acc.name) acc.name = delta.function.name;
    if (delta.function?.arguments) acc.args += delta.function.arguments;
    store.set(index, acc);
  }
}

function formatClock(now: number): string {
  const date = new Date(now);
  return `${date.toLocaleString('zh-CN', { hour12: false })}（ISO ${date.toISOString()}）`;
}

export function compactTodoLines(todos: Todo[], groups: Group[]): string {
  const visible = todos.filter((todo) => !todo.deleted);
  const ordered = [...visible.filter((todo) => todo.status === 'pending'), ...visible.filter((todo) => todo.status === 'completed')]
    .slice(0, TODO_CONTEXT_LIMIT);
  if (!ordered.length) return '（暂无待办）';
  const groupName = (id?: string): string => groups.find((group) => !group.deleted && group.id === id)?.name ?? '未分类';
  return ordered
    .map((todo) => {
      const lead = [`#${todo.id}`, todo.status === 'pending' ? '[待办]' : '[已完成]', todo.title].join(' ');
      const parts = [`分组:${groupName(todo.groupId)}`];
      if (todo.remindAt) parts.push(`提醒:${new Date(todo.remindAt).toISOString()}${todo.remindLeadMs ? ` 提前${Math.round(todo.remindLeadMs / 60000)}分钟` : ''}`);
      if ('cycleType' in todo) parts.push(`循环:${todo.cycleType}${todo.customCycleDays ? `(${todo.customCycleDays}天)` : ''}`);
      if (todo.monitor) parts.push(`监测:${todo.monitor.exeName}`);
      return [lead, ...parts].join(' | ');
    })
    .join('\n');
}

export function buildSystemPrompt(todos: Todo[], groups: Group[], processNames: string[], now: number, promptLevel: 1 | 2 = 1): string {
  const groupLines = groups.filter((group) => !group.deleted).map((group) => `${group.id}=${group.name}`).join(', ') || '（无）';
  const processes = processNames.slice(0, PROCESS_CONTEXT_LIMIT).join(', ') || '（未取到进程列表）';
  const detailRule = promptLevel === 2
    ? '详细程度档2：写操作入队前，若标题、时间、循环、分组、提醒等关键字段有缺失，先在一条消息里用编号列表集中提问，收到用户答复后再入队；纯查询直接回答。'
    : '详细程度档1：只按用户明确说的字段设置，用户没说的一律用默认值，禁止向用户追问补充。';
  return [
    '你是 HengSch Todo 桌面应用内的待办管家，只用简体中文，回答简洁直接，不闲聊、不吹捧、不写客套话。',
    '你可以用工具查询、创建、修改、删除待办。写操作会先生成预览卡等用户确认（删除需二次确认），工具结果会告诉你已生成预览卡——此时只需一句话说明，不要复述字段。',
    '对话流：',
    '- 用户一次提到多条待办时：先用一段文字给出清单总览（每条一行，只写标题与关键属性），然后同轮调用 stage_batch 把全部条目一次入队（每条 summary 写成可独立展示的一句话描述）；入队后一句话提示“共 N 条，按顺序逐条确认”。',
    `- 单条待办直接用 create_todo/update_todo/delete_todo；除 stage_batch（一次至多 ${STAGE_BATCH_MAX} 条）外，每轮最多一个写操作。`,
    '- 用户消息带 [流程] 前缀时按其指示处理：要求“改”某条 → 只重新暂存那一条（新 summary+draft），不要动队列里其他条目；已由用户确认或跳过的内容不要再提。',
    detailRule,
    '字段规则：',
    '- type：once（一次性）或 recurring（循环）；循环必须给 cycleType（daily/weekly/monthly/custom），custom 还要 customCycleDays≥1 天；一次性任务不要传 cycleType。',
    '- remindAt 是毫秒时间戳且必须晚于现在；remindLeadMs 是提前量毫秒（0=到点，可省略）。循环待办只关心“时刻”：remindAt 给下一次发生的“时刻减提前量”，不要纠结日期。',
    '- groupId 只能从下面的分组里选（给 id 或名称），匹配不到就不传（会落到未分类）。',
    '- monitor 传 { exeName, thresholdMinutes(≥1), auto, askOnExit }，exeName 必须在“当前运行进程”列表里；用户没要求进程监测就不要传。',
    '- 标记完成/撤销完成用 update_todo 的 toggleStatus:true（与主界面勾选完全同一套规则，循环待办会续期）。',
    '- 纯查询先用 list_todos 拿最新数据。禁止编造不存在的待办 id。',
    `当前时间：${formatClock(now)}`,
    `分组列表：${groupLines}`,
    `当前运行进程：${processes}`,
    '当前待办：',
    compactTodoLines(todos, groups)
  ].join('\n');
}

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'list_todos',
      description: '查询当前待办列表（按最新数据返回）',
      parameters: { type: 'object', properties: { includeCompleted: { type: 'boolean', description: '是否包含已完成，默认 true' } }, additionalProperties: false }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_todo',
      description: '新建一条待办，生成预览卡等用户确认',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '标题，必填' },
          description: { type: 'string', description: '描述，可省略' },
          type: { type: 'string', enum: ['once', 'recurring'], description: '默认 once' },
          cycleType: { type: 'string', enum: ['daily', 'weekly', 'monthly', 'custom'], description: '循环任务必填' },
          customCycleDays: { type: 'integer', description: 'cycleType=custom 时必填，天数≥1' },
          groupId: { type: 'string', description: '已有分组的 id 或名称，可省略' },
          remindAt: { type: 'number', description: '提醒时间戳（毫秒，必须晚于现在），可省略' },
          remindLeadMs: { type: 'number', description: '提前量毫秒，可省略' },
          monitor: {
            type: 'object',
            properties: {
              exeName: { type: 'string' },
              thresholdMinutes: { type: 'integer' },
              auto: { type: 'boolean' },
              askOnExit: { type: 'boolean' }
            },
            required: ['exeName'],
            additionalProperties: false
          }
        },
        required: ['title'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_todo',
      description: '修改待办（含标记完成/撤销完成），生成预览卡等用户确认',
      parameters: {
        type: 'object',
        properties: {
          todoId: { type: 'string', description: '待办 id（来自 list_todos 或之前返回的数据）' },
          title: { type: 'string' },
          description: { type: 'string' },
          groupId: { type: 'string' },
          remindAt: { description: '毫秒时间戳，或字符串 "clear" 取消提醒' },
          remindLeadMs: { description: '提前量毫秒，或字符串 "clear"' },
          monitor: { description: '进程监测对象，或 null 移除' },
          toggleStatus: { type: 'boolean', description: 'true=切换完成状态' }
        },
        required: ['todoId'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_todo',
      description: '删除待办（打墓碑），生成确认卡等用户二次确认',
      parameters: {
        type: 'object',
        properties: { todoId: { type: 'string', description: '待办 id' } },
        required: ['todoId'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'stage_batch',
      description: `总览轮专用：一次暂存多条写操作（≤${STAGE_BATCH_MAX} 条），全部入队后用户按顺序逐条确认`,
      parameters: {
        type: 'object',
        properties: {
          entries: {
            type: 'array',
            maxItems: STAGE_BATCH_MAX,
            items: {
              type: 'object',
              properties: {
                summary: { type: 'string', description: '该条待办面向用户的一句话描述（会直接展示在对话流里）' },
                action: { type: 'string', enum: ['create', 'update', 'delete'] },
                draft: { type: 'object', description: '与对应单条工具完全相同的参数对象' }
              },
              required: ['summary', 'action', 'draft'],
              additionalProperties: false
            }
          }
        },
        required: ['entries'],
        additionalProperties: false
      }
    }
  }
] as const;

function ensureDeviceId(store: Store): string {
  let deviceId = store.get('deviceId') as string | undefined;
  if (!deviceId || typeof deviceId !== 'string') {
    deviceId = `ai-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
    store.set('deviceId', deviceId);
  }
  return deviceId;
}

function contextFromStore(processNames: string[]): AiDataContext {
  if (!storeRef) throw new Error('AI 服务未初始化');
  return {
    todos: (storeRef.get('todos') ?? []) as Todo[],
    groups: (storeRef.get('groups') ?? []) as Group[],
    processNames,
    now: Date.now(),
    deviceId: ensureDeviceId(storeRef)
  };
}

function trimHistory(messages: AiChatMessage[]): AiChatMessage[] {
  const kept = messages.slice(-HISTORY_LIMIT).map((message) => ({
    role: message.role,
    content: String(message.content ?? '').slice(0, HISTORY_MESSAGE_CHARS)
  }));
  let total = kept.reduce((sum, message) => sum + message.content.length, 0);
  while (kept.length > 1 && total > HISTORY_CHAR_BUDGET) {
    total -= kept[0].content.length;
    kept.shift();
  }
  return kept;
}

function mapHttpError(status: number, detail: string): string {
  if (status === 401) return 'API key 无效，请到 AI 设置里检查';
  if (status === 402) return 'DeepSeek 余额不足';
  if (status === 429) return '请求过于频繁，请稍后再试';
  if (status >= 500) return 'DeepSeek 服务暂不可用';
  return `DeepSeek 请求失败${detail ? `：${detail}` : ''}`;
}

async function callDeepSeek(body: Record<string, unknown>, signal: AbortSignal): Promise<Response> {
  const settings = storeRef ? readAiSettings(storeRef) : DEFAULT_SETTINGS;
  if (!settings.apiKey) throw new Error('未配置 AI（缺少 API key）');
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
      body: JSON.stringify({ ...body, model: settings.model, stream: true, temperature: 0.3, thinking: { type: 'disabled' } }),
      signal
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new Error('网络不可用，无法连接 DeepSeek');
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(mapHttpError(response.status, detail.slice(0, 200)));
  }
  return response;
}

interface ParsedStaging {
  proposal: AiProposal;
  summary?: string;
}

function parseToolStaging(name: string, args: string, ctx: AiDataContext): ParsedStaging[] {
  let payload: unknown = {};
  if (args.trim()) {
    try {
      payload = JSON.parse(args);
    } catch {
      throw new Error('工具参数不是合法 JSON');
    }
  }
  if (name === 'stage_batch') {
    const entries = (payload as { entries?: unknown }).entries;
    return stageProposalBatch(entries, ctx).map((entry) => {
      entry.proposal.summary = entry.summary;
      return { proposal: entry.proposal, summary: entry.summary };
    });
  }
  if (name === 'create_todo') return [{ proposal: stageProposal('create', payload, ctx) }];
  if (name === 'update_todo') return [{ proposal: stageProposal('update', payload, ctx) }];
  if (name === 'delete_todo') return [{ proposal: stageProposal('delete', payload, ctx) }];
  throw new Error(`未知工具：${name}`);
}

function listTodosContent(includeCompleted: boolean, ctx: AiDataContext): string {
  const visible = ctx.todos.filter((todo) => !todo.deleted && (includeCompleted || todo.status === 'pending'));
  const groupName = (id?: string): string => ctx.groups.find((group) => !group.deleted && group.id === id)?.name ?? '未分类';
  const items = visible.slice(0, TODO_CONTEXT_LIMIT).map((todo) => ({
    id: todo.id,
    title: todo.title,
    status: todo.status,
    type: todo.type,
    groupId: todo.groupId ?? 'default',
    groupName: groupName(todo.groupId),
    remindAt: todo.remindAt ?? null,
    remindLeadMs: todo.remindLeadMs ?? 0,
    monitor: todo.monitor ?? null,
    description: todo.description ?? ''
  }));
  return JSON.stringify({ items, total: visible.length });
}

async function runToolLoop(
  history: AiChatMessage[],
  ctx: AiDataContext,
  onChunk: (delta: string) => void,
  signal: AbortSignal,
  staged: AiProposal[],
  promptLevel: 1 | 2
): Promise<void> {
  type ApiMessage =
    | { role: 'system' | 'user'; content: string }
    | { role: 'assistant'; content: string | null; tool_calls?: unknown }
    | { role: 'tool'; tool_call_id: string; content: string };
  const apiMessages: ApiMessage[] = [
    { role: 'system', content: buildSystemPrompt(ctx.todos, ctx.groups, ctx.processNames, ctx.now, promptLevel) },
    ...history
  ];
  for (let round = 0; round < TOOL_ROUNDS; round += 1) {
    const response = await callDeepSeek({ messages: apiMessages, tools: TOOLS }, signal);
    const reader = response.body?.getReader();
    if (!reader) throw new Error('DeepSeek 未返回响应体');
    const feed = createSseFeed();
    const decoder = new TextDecoder();
    const toolCalls = new Map<number, ToolCallAcc>();
    let text = '';
    let sawToolCall = false;
    let done = false;
    while (!done) {
      const { done: finished, value } = await reader.read();
      if (finished) break;
      for (const payload of feed.push(decoder.decode(value, { stream: true }))) {
        if (payload === '[DONE]') {
          done = true;
          break;
        }
        let event: {
          choices?: Array<{ delta?: { content?: string | null; tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }> }; finish_reason?: string | null }>;
        };
        try {
          event = JSON.parse(payload);
        } catch {
          continue;
        }
        const choice = event.choices?.[0];
        if (choice?.delta?.content) {
          text += choice.delta.content;
          onChunk(choice.delta.content);
        }
        if (choice?.delta?.tool_calls) {
          sawToolCall = true;
          accumulateToolCalls(toolCalls, choice.delta.tool_calls);
        }
      }
    }
    if (!sawToolCall) {
      apiMessages.push({ role: 'assistant', content: text });
      return;
    }
    const ordered = [...toolCalls.entries()].sort((a, b) => a[0] - b[0]).map(([, value]) => value);
    const toolResults: string[] = [];
    const calls: unknown[] = [];
    for (const call of ordered) {
      if (!call.name) throw new Error('工具调用缺少名称');
      let content: string;
      try {
        if (call.name === 'list_todos') {
          let includeCompleted = true;
          if (call.args.trim()) {
            try {
              const parsed = JSON.parse(call.args) as { includeCompleted?: boolean };
              if (parsed.includeCompleted === false) includeCompleted = false;
            } catch {
              throw new Error('工具参数不是合法 JSON');
            }
          }
          content = listTodosContent(includeCompleted, ctx);
        } else {
          const batch = parseToolStaging(call.name, call.args, ctx);
          for (const item of batch) {
            staged.push(item.proposal);
            proposals.set(item.proposal.id, { proposal: item.proposal, expires: Date.now() + PROPOSAL_TTL_MS });
          }
          content = batch.length > 1 || call.name === 'stage_batch'
            ? JSON.stringify({ staged: true, count: batch.length, proposalIds: batch.map((item) => item.proposal.id), note: `已生成 ${batch.length} 张预览卡，按顺序等用户确认` })
            : JSON.stringify({ staged: true, proposalId: batch[0].proposal.id, note: '已生成预览卡，等待用户确认' });
        }
      } catch (error) {
        content = JSON.stringify({ error: error instanceof Error ? error.message : '参数错误' });
      }
      toolResults.push(content);
      calls.push({ id: call.id || `call_${Math.random().toString(36).slice(2)}`, type: 'function', function: { name: call.name, arguments: call.args } });
    }
    apiMessages.push({ role: 'assistant', content: text || null, tool_calls: calls });
    for (let i = 0; i < calls.length; i += 1) {
      const call = calls[i] as { id: string };
      apiMessages.push({ role: 'tool', tool_call_id: call.id, content: toolResults[i] });
    }
  }
  throw new Error('处理轮次过多，请把请求说得更具体一些');
}

/** 主进程入口：流式回推 chunk，最终返回本轮暂存的提案 */
export async function runAiChat(options: { messages: AiChatMessage[]; processNames?: string[]; signal?: AbortSignal }): Promise<AiChatResult> {
  if (!storeRef) throw new Error('AI 服务未初始化');
  const settings = readAiSettings(storeRef);
  if (!settings.apiKey) return { proposals: [], error: '未配置 AI：请先在设置里填入 DeepSeek API key' };
  const processNames = options.processNames ?? lastProcessNames;
  lastProcessNames = processNames;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, STREAM_TIMEOUT_MS);
  options.signal?.addEventListener('abort', () => controller.abort());
  activeRun = controller;
  const staged: AiProposal[] = [];
  try {
    const ctx = contextFromStore(processNames);
    await runToolLoop(trimHistory(options.messages), ctx, (delta) => push('ai:chunk', { delta }), controller.signal, staged, settings.promptLevel);
    return { proposals: staged };
  } catch (error) {
    const aborted = (error as Error)?.name === 'AbortError' || controller.signal.aborted;
    const message = timedOut ? '响应超时，请稍后再试' : aborted ? '已停止生成' : error instanceof Error ? error.message : 'AI 服务异常';
    return { proposals: staged, error: message };
  } finally {
    clearTimeout(timer);
    activeRun = null;
  }
}

export function cancelAiChat(): void {
  activeRun?.abort();
}

export function commitProposal(id: string, patch?: unknown): void {
  const entry = proposals.get(id);
  if (!entry) throw new Error('确认卡已过期，请重新发送');
  if (Date.now() > entry.expires) {
    proposals.delete(id);
    throw new Error('确认卡已过期，请重新发送');
  }
  const ctx = contextFromStore(lastProcessNames);
  const next = applyProposal(entry.proposal, ctx, patch);
  proposals.delete(id);
  storeRef!.set('todos', next);
  push('sync:merged', { todos: next, groups: ctx.groups });
}

export function rejectProposal(id: string): boolean {
  return proposals.delete(id);
}

/** 卡片轮到显示时续期（长队列不误杀） */
export function refreshProposalExpiry(id: string): boolean {
  const entry = proposals.get(id);
  if (!entry) return false;
  entry.expires = Date.now() + PROPOSAL_TTL_MS;
  return true;
}

/** 未决队列（插入顺序 = 入队顺序），抽屉挂载/重启重建用 */
export function listQueuedProposals(): AiProposal[] {
  return [...proposals.values()].map((entry) => entry.proposal);
}
