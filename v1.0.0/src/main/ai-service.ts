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
let drawerOpen = false;
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
  if (patch.promptLevel !== undefined && patch.promptLevel !== 1 && patch.promptLevel !== 2) {
    throw new Error('详细程度只能是 1 或 2');
  }
  const current = readAiSettings(store);
  const next: AiSettings = {
    apiKey: patch.apiKey !== undefined ? (patch.apiKey || undefined) : current.apiKey,
    model: patch.model === 'deepseek-v4-pro' ? 'deepseek-v4-pro' : patch.model === 'deepseek-flash' ? 'deepseek-flash' : current.model,
    monitorVerdictEnabled: patch.monitorVerdictEnabled !== undefined ? patch.monitorVerdictEnabled === true : current.monitorVerdictEnabled,
    promptLevel: patch.promptLevel ?? current.promptLevel
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

// ---------------- E 监测判定 ----------------

export interface MonitorVerdict {
  verdict: 'complete' | 'ask' | 'keep';
  reason: string;
}

export interface MonitorVerdictInput {
  title: string;
  exeName: string;
  runtimeMinutes: number;
  status: 'pending' | 'completed';
}

/** 设计 §8：8s 独立超时，AI 绝不阻塞监测 */
const MONITOR_VERDICT_TIMEOUT_MS = 8_000;
const MONITOR_REASON_LIMIT = 120;

/** 渲染层开合状态：ask 抽屉内问 / 关则降级小窗 */
export function setDrawerOpen(open: boolean): void {
  drawerOpen = open;
}

export function isDrawerOpen(): boolean {
  return drawerOpen;
}

export function isMonitorVerdictActive(): boolean {
  if (!storeRef) return false;
  const settings = readAiSettings(storeRef);
  return settings.monitorVerdictEnabled && Boolean(settings.apiKey);
}

/** 纯函数：容忍 JSON/代码块/前后杂文，verdict 非法或无 JSON → null（按原规则降级） */
export function parseMonitorVerdict(text: string): MonitorVerdict | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let parsed: { verdict?: unknown; reason?: unknown };
  try {
    parsed = JSON.parse(text.slice(start, end + 1)) as { verdict?: unknown; reason?: unknown };
  } catch {
    return null;
  }
  if (parsed.verdict !== 'complete' && parsed.verdict !== 'ask' && parsed.verdict !== 'keep') return null;
  const reason = typeof parsed.reason === 'string' ? parsed.reason.trim().slice(0, MONITOR_REASON_LIMIT) : '';
  return { verdict: parsed.verdict, reason };
}

/** 非流式小请求；开关关/无 key/任何异常 → null（调用方按原规则执行） */
export async function requestMonitorVerdict(input: MonitorVerdictInput): Promise<MonitorVerdict | null> {
  if (!isMonitorVerdictActive() || !storeRef) return null;
  const settings = readAiSettings(storeRef);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MONITOR_VERDICT_TIMEOUT_MS);
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
      body: JSON.stringify({
        model: settings.model,
        messages: [
          {
            role: 'system',
            content:
              '你是进程监测判定器。根据待办与进程运行情况判断是否算完成，只输出一行 JSON：{"verdict":"complete|ask|keep","reason":"不超过40字的简短理由"}。complete=运行情况足以判定任务完成；keep=明显不够格或与任务无关；拿不准输出 ask。'
          },
          {
            role: 'user',
            content: `待办：${input.title}\n进程：${input.exeName}\n本次已运行：${input.runtimeMinutes} 分钟\n任务当前状态：${input.status === 'completed' ? '已完成（可能被自动标记）' : '待办'}`
          }
        ],
        max_tokens: 100,
        temperature: 0.1,
        stream: false,
        thinking: { type: 'disabled' }
      }),
      signal: controller.signal
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return parseMonitorVerdict(data.choices?.[0]?.message?.content ?? '');
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
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
    '你是 HengSch Todo 桌面应用内的 AI 助手小SOU，只用简体中文，回答简洁直接，不闲聊、不吹捧、不写客套话。',
    '你可以用工具查询、创建、修改、删除待办。写操作会先生成预览卡等用户确认（删除需二次确认），工具结果会告诉你已生成预览卡——此时只需一句话说明，不要复述字段。',
    '对话流：',
    '- 用户一次提到多条待办时：先用一段文字给出清单总览（每条一行，只写标题与关键属性），然后同轮调用 stage_batch 把全部条目一次入队（每条 summary 写成可独立展示的一句话描述）；入队后一句话提示“共 N 条，按卡片顺序确认”。连续删除会合并为一张清单卡，勾选后一次确认，未勾选的保留。',
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
      description: `总览轮专用：一次暂存多条写操作（≤${STAGE_BATCH_MAX} 条），全部入队后用户按顺序确认；连续删除合并清单勾选`,
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
          // D-2 重入门禁：已有未决提案时不再静默排队，把明确信息回给模型
          const pendingCount = [...proposals.values()].filter((entry) => entry.expires > Date.now()).length;
          if (pendingCount > 0) {
            content = JSON.stringify({
              error: `已有 ${pendingCount} 条待确认提案，请先让用户确认或跳过现有卡片后再暂存新提案`
            });
          } else {
            const batch = parseToolStaging(call.name, call.args, ctx);
            for (const item of batch) {
              staged.push(item.proposal);
              proposals.set(item.proposal.id, { proposal: item.proposal, expires: Date.now() + PROPOSAL_TTL_MS });
            }
            content = batch.length > 1 || call.name === 'stage_batch'
              ? JSON.stringify({ staged: true, count: batch.length, proposalIds: batch.map((item) => item.proposal.id), note: `已暂存 ${batch.length} 条操作，按卡片顺序等用户确认（连续删除合并清单）` })
              : JSON.stringify({ staged: true, proposalId: batch[0].proposal.id, note: '已生成预览卡，等待用户确认' });
          }
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
  if (activeRun) return { proposals: [], error: 'AI 正在生成中，请先停止或等待完成' };
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
    if (activeRun === controller) activeRun = null;
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

/**
 * B-2 删除合并卡：勾选项全部校验/计算成功才落盘一次，再消费整组队列。
 * 校验或落盘失败均保留整组；未勾选项允许已过期/出队，跳过全部不写盘。
 */
export function commitProposalBatch(commitIds: string[], rejectIds: string[]): { committed: number; rejected: number } {
  if (!commitIds.length && !rejectIds.length) throw new Error('批量提交不能为空');
  const seen = new Set<string>();
  for (const id of [...commitIds, ...rejectIds]) {
    if (typeof id !== 'string' || !id) throw new Error('Invalid proposal id');
    if (seen.has(id)) throw new Error('重复的提案 id');
    const entry = proposals.get(id);
    if (entry && entry.proposal.kind !== 'delete') throw new Error('批量确认只支持删除提案');
    seen.add(id);
  }
  const now = Date.now();
  const selected: Array<Extract<AiProposal, { kind: 'delete' }>> = [];
  for (const id of commitIds) {
    const entry = proposals.get(id);
    if (!entry || now >= entry.expires) throw new Error('确认卡已过期，请重新发送');
    if (entry.proposal.kind !== 'delete') throw new Error('批量确认只支持删除提案');
    selected.push(entry.proposal);
  }
  if (selected.length) {
    const ctx = contextFromStore(lastProcessNames);
    let next = ctx.todos;
    for (const proposal of selected) {
      const current = next.find((todo) => todo.id === proposal.draft.todoId && !todo.deleted);
      if (!current || current.updatedAt !== proposal.before.updatedAt) throw new Error('待办已被删除或已变化，请重新发送');
      next = applyProposal(proposal, { ...ctx, todos: next });
    }
    storeRef!.set('todos', next);
    for (const id of seen) proposals.delete(id);
    push('sync:merged', { todos: next, groups: ctx.groups });
  } else {
    for (const id of seen) proposals.delete(id);
  }
  return { committed: commitIds.length, rejected: rejectIds.length };
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
