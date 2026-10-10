export type TodoType = 'once' | 'recurring';

export type CycleType = 'daily' | 'weekly' | 'monthly' | 'custom';

/**
 * 云同步元数据（每条被同步的记录携带）
 * - updatedAt: 每次修改刷新，LWW 合并依据
 * - deviceId:  修改来源，updatedAt 相等时定序
 * - deleted:   墓碑标记（删除不再物理移除，同步后由对端复活是不允许的）
 */
export interface SyncedMeta {
  updatedAt?: number;
  deviceId?: string;
  deleted?: boolean;
}

/**
 * 进程监测配置（仅循环任务）
 */
export interface MonitorConfig {
  exeName: string;
  thresholdMinutes: number;
}

/** 云同步连接配置（私钥单独存 electron-store，不入此结构） */
export interface SyncConfig {
  enabled: boolean;
  host: string;
  port: number;
  username: string;
  /** 远端 sync.json 绝对路径（支持 ~/ 开头） */
  remotePath: string;
}

/** 页脚状态机（设计 2.5） */
export type SyncState = 'OFF' | 'SYNCING' | 'SYNCED' | 'OFFLINE' | 'AUTH ERROR' | 'REMOTE ERROR';

export interface SyncStatus {
  state: SyncState;
  at: number;
  error?: string;
}

/** 同步全量载荷（本地/远端同构） */
export interface SyncPayload {
  todos: Todo[];
  groups: Group[];
}

export interface Group extends SyncedMeta {
  id: string;
  name: string;
  color: string;
  createdAt: number;
}

export interface TodoItem extends SyncedMeta {
  id: string;
  title: string;
  description?: string;
  type: TodoType;
  status: 'completed' | 'pending';
  createdAt: number;
  completedAt?: number;
  order: number;
  groupId?: string;
}

export interface RecurringTodo extends TodoItem {
  type: 'recurring';
  cycleType: CycleType;
  customCycleDays?: number;
  nextDueDate?: number;
  monitor?: MonitorConfig;
}

export type Todo = TodoItem | RecurringTodo;
