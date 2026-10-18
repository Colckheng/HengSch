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
 * 进程监测配置（所有任务类型均可绑定）
 * - auto:     累计运行达阈值自动完成（旧行为，默认 true）
 * - askOnExit: 进程退出沿弹窗询问是否完成（新行为，默认 false）
 * 两者可单选可都选；都选时询问结果优先（可撤销自动完成）
 */
export interface MonitorConfig {
  exeName: string;
  /** 仅 auto 模式参与判定；ask-only 可缺省语义（UI 不显示） */
  thresholdMinutes: number;
  /** 缺省视为 true（旧数据兼容） */
  auto?: boolean;
  /** 缺省视为 false */
  askOnExit?: boolean;
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
  /** 进程监测：once/recurring 均可绑定 */
  monitor?: MonitorConfig;
  /** 到点提醒触发时间戳（绝对时间，已扣除提前量）；缺省=无提醒 */
  remindAt?: number;
  /** 最近一次提醒弹出时间；弹出时盖章，防止同一次提醒反复触发 */
  remindedAt?: number;
  /** 本条选用的提前量（ms，0=到点）；循环待办完成时按它重算下一周期 remindAt */
  remindLeadMs?: number;
}

export interface RecurringTodo extends TodoItem {
  type: 'recurring';
  cycleType: CycleType;
  customCycleDays?: number;
  nextDueDate?: number;
}

export type Todo = TodoItem | RecurringTodo;
