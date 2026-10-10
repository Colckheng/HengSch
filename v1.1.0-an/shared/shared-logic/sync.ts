import type { Todo, Group } from '@hengsch/shared-types';

/** 墓碑保留期：超过后在合并时清除 */
export const TOMBSTONE_TTL_MS = 30 * 86_400_000;

interface Identified {
  id: string;
  createdAt: number;
  updatedAt?: number;
  deviceId?: string;
  deleted?: boolean;
}

/** 合并前补齐同步元数据（迁移幂等） */
export function normalizeSynced<T extends Identified>(record: T): T {
  return {
    ...record,
    updatedAt:
      typeof record.updatedAt === 'number' ? record.updatedAt : record.createdAt,
    deviceId: typeof record.deviceId === 'string' ? record.deviceId : 'legacy'
  };
}

/**
 * 单条记录 LWW：updatedAt 大者胜；相等比 deviceId 字典序；再相等比内容。
 * 对输入顺序对称（merge(A,B) 与 merge(B,A) 结果一致）。
 */
export function pickWinner<T extends Identified>(a: T | undefined, b: T | undefined): T | undefined {
  if (!a) return b;
  if (!b) return a;
  const au = a.updatedAt ?? a.createdAt;
  const bu = b.updatedAt ?? b.createdAt;
  if (au !== bu) return au > bu ? a : b;
  const ad = a.deviceId ?? '';
  const bd = b.deviceId ?? '';
  if (ad !== bd) return ad > bd ? a : b;
  return JSON.stringify(a) >= JSON.stringify(b) ? a : b;
}

function mergeCollection<T extends Identified>(locals: T[], remotes: T[], now: number): T[] {
  const byId = new Map<string, T>();
  for (const record of [...locals, ...remotes]) {
    const prev = byId.get(record.id);
    byId.set(record.id, prev ? (pickWinner(prev, record) as T) : record);
  }
  const out: T[] = [];
  for (const record of byId.values()) {
    if (record.deleted && (record.updatedAt ?? record.createdAt) < now - TOMBSTONE_TTL_MS) {
      continue; // 清除过期墓碑
    }
    out.push(record);
  }
  return out;
}

function sortTodos(todos: Todo[]): Todo[] {
  return [...todos].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

function sortGroups(groups: Group[]): Group[] {
  return [...groups].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * 双端全量合并（纯函数）：
 * - 逐记录 LWW（墓碑同等参与比较）
 * - 过期墓碑清除
 * - 孤儿任务改绑 default（引用的分组不存在或已墓碑）
 * - todos 按 order 排序、groups 按 createdAt 排序（两端收敛到同一顺序）
 */
export function mergeSyncStates(
  local: { todos: Todo[]; groups: Group[] },
  remote: { todos: Todo[]; groups: Group[] },
  now: number
): { todos: Todo[]; groups: Group[] } {
  const groups = mergeCollection(
    local.groups.map(normalizeSynced),
    remote.groups.map(normalizeSynced),
    now
  );
  const todos = mergeCollection(
    local.todos.map(normalizeSynced),
    remote.todos.map(normalizeSynced),
    now
  );

  const visibleGroupIds = new Set(groups.filter((group) => !group.deleted).map((group) => group.id));
  const rebound = todos.map((todo) => {
    if (todo.deleted || !todo.groupId || todo.groupId === 'default') return todo;
    if (visibleGroupIds.has(todo.groupId)) return todo;
    return { ...todo, groupId: 'default' } as Todo;
  });

  return { todos: sortTodos(rebound), groups: sortGroups(groups) };
}

export interface SyncFile {
  version: 1;
  todos: Todo[];
  groups: Group[];
  writer?: { deviceId: string; at: number };
}

/** 远端文件解析：非 JSON / 结构不符返回 null（调用方不得写回） */
export function parseSyncFile(text: string): SyncFile | null {
  try {
    const data = JSON.parse(text) as SyncFile;
    if (!data || !Array.isArray(data.todos) || !Array.isArray(data.groups)) return null;
    if (data.version !== 1) return null;
    return data;
  } catch {
    return null;
  }
}
