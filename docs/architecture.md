# HengSch 架构总览

> Swiss Precision 设计语言 · 三端同构 · 客户端合并 · 零依赖桥

---

## 一、Monorepo 拓扑

```
HengSch/
├── v1.0.0/                 # Electron 桌面端（workspace）
├── v1.1.0-web/             # Web 端（workspace，Vite alias 直引 shared 源码）
├── v1.1.0-an/              # 移动端（独立工程，shared/ 为内嵌副本）
├── packages/
│   ├── shared-types/       # 类型定义
│   ├── shared-logic/       # 纯函数 + 单测
│   └── shared-storage/     # 存储抽象接口
├── services/
│   └── sync-bridge/        # HTTP 同步桥（零依赖，systemd 部署）
├── docs/                   # 架构 / 同步协议 / 部署文档
├── DEVELOPMENT_PLAN.md     # 规划与变更记录
└── package.json            # npm workspaces 根（不含 v1.1.0-an）
```

```jsonc
// 根 package.json
{
  "workspaces": ["v1.0.0", "v1.1.0-web", "packages/*"],
  "overrides": { "react": "18.2.0", "react-dom": "18.2.0" }
}
```

> `v1.1.0-an` 不在 workspaces 内：EAS/gradle 要求自包含工程，`shared/` 为 `packages/*` 的内嵌副本，`npm run sync-shared` 从源头拷贝。

---

## 二、三端接入 shared 方式

| 端 | 方式 | 关键点 |
|---|---|---|
| **桌面** | workspace 依赖 `@hengsch/shared-*` | 解析到包 `dist/`，需先 `npm run build:packages` |
| **Web** | Vite alias 源码直引 | `vite.config.ts` 将 `@hengsch/shared-*` 指向 `../packages/*/src/index.ts` |
| **移动端** | 内嵌副本 `shared/` | Metro 编译副本，与 monorepo 解耦 |

---

## 三、共享包

### `@hengsch/shared-types` (`packages/shared-types/src/index.ts`)

| 类型 | 关键字段 |
|---|---|
| `TodoType` | `'once' \| 'recurring'` |
| `CycleType` | `'daily' \| 'weekly' \| 'monthly' \| 'custom'` |
| `TodoItem` / `RecurringTodo` | `monitor?: MonitorConfig`, `nextDueDate?` |
| `Group` | `id` `name` `color` `createdAt` |
| `SyncedMeta` | `updatedAt` `deviceId` `deleted` —— 同步元数据 |
| `SyncState` | `OFF \| SYNCING \| SYNCED \| OFFLINE \| AUTH ERROR \| REMOTE ERROR` |
| `SyncPayload` | `{ todos, groups }` |

### `@hengsch/shared-logic` (`packages/shared-logic/src/`)

| 模块 | 核心导出 | 单测覆盖 |
|---|---|---|
| `todo-utils.ts` | `calculateNextDueDate`, `toggleTodoStatus`, `sortTodosByStatus`, `filterTodosByGroup`, `generateTodoId/GroupId` | ✅ |
| `sync.ts` | `normalizeSynced`, `pickWinner` (LWW), `mergeSyncStates`, `parseSyncFile`, `TOMBSTONE_TTL_MS=30d` | ✅ 62项 |
| `monitor.ts` | 进程监测进度、退出沿检测、询问裁决 | ✅ |

> 输出：ESM (`module: dist/index.js`)，兼容 Vite/Rollup 命名导出

### `@hengsch/shared-storage` (`packages/shared-storage/src/index.ts`)

```ts
interface IStorage {
  get<T>(key: string): Promise<T>
  set<T>(key: string, value: T): Promise<void>
  delete(key: string): Promise<void>
  clear?(): Promise<void>
  keys?(): Promise<string[]>
}
```

| 端 | 实现 | 位置 |
|---|---|---|
| 桌面 | electron-store (preload IPC) | `window.electronAPI` |
| Web | localStorage | `utils/localStorageAdapter.ts` |
| 手机 | AsyncStorage | `utils/asyncStorageAdapter.ts` |

---

## 四、数据模型核心

```ts
// Todo 核心字段
{
  id: string
  title: string
  description?: string
  type: 'once' | 'recurring'
  status: 'pending' | 'completed'
  createdAt: number
  completedAt?: number
  order: number
  groupId?: string  // 默认 'default'
  monitor?: MonitorConfig  // 进程监测，once/recurring 均可绑定
  // recurring 专属
  cycleType?: 'daily' | 'weekly' | 'monthly' | 'custom'
  customCycleDays?: number
  nextDueDate?: number
}

// Group
{ id, name, color, createdAt }  // 'default' 不可删

// 墓碑机制
deleted: true + 刷新 updatedAt → 同步合并防复活 → 30 天 TTL 后合并清除
```

---

## 五、状态管理（三端同构）

```
Context + useReducer
├── TodoContext    → 增删改查、完成切换、排序、applySyncedTodos
├── GroupContext   → 分组 CRUD、applySyncedGroups
├── WindowContext  → 仅桌面：置顶/小窗/最小化 UI 状态
└── SyncContext    → 同步状态机、周期调度、配置
```

数据持久化：变更即写本地存储，同步合并结果同样落盘。

Provider 嵌套：**GroupProvider → TodoProvider → SyncProvider → UI**

---

## 五、桌面端架构 (v1.0.0)

### 主进程 (`src/main/`)

| 模块 | 核心职责 |
|---|---|
| `index.ts` | 窗口生命周期、小窗/贴边/缩入状态机（吸附 16px、窄边 4px、悬停弹出 6px、动画 180ms、多显示器 workArea）、单实例锁、关闭=隐藏托盘、before-quit 统一收尾、IPC |
| `sync-service.ts` | SFTP 同步 (ssh2、密钥对生成、原子写+回读校验、周期调度) |
| `monitor-service.ts` | 30s 轮询 tasklist、达标自动完成、进程退出沿询问、撤销回滚、僵死态自愈、计划任务日志、7天日志保留；AI 监测判定（开关、8s 超时降级、抽屉内问/小窗） |
| `ai-service.ts` | DeepSeek 网关：系统提示装配、SSE 流式工具循环、提案暂存队列（TTL/续期）、设置读写与连通测试、监测判定请求 |
| `ai-tools.ts` | 提案校验与落盘纯函数（create/update/delete、批量原子入队、commit 二次校验、墓碑） |
| `voice-service.ts` | 本地 whisper：模型状态/下载（sha256 校验+进度）、spawn 识别、超时控制 |
| `ask-window.ts` | 独立询问小窗（无边框置顶、串行队列、IPC、退出强结算 cancel） |
| `reminder-service.ts` | 每秒到点扫描、提醒队列与 `openPaperReminders` 本机持久化、重启/跨日补弹、动作执行入口 `runReminderAction` |
| `reminder-command.ts` | 动作纯函数：校验实例与时间后同步写 electron-store，先写盘后应答，幂等 |
| `paper-window.ts` | 桌面纸片 overlay（单个全屏透明窗、`screen-saver` 级置顶、16ms 光标比对切换鼠标穿透、按住保持捕获、dev 试用纸片 `previewPaper`） |
| `tray.ts` | 系统托盘（左键显示/右键菜单、图标缺失静默跳过） |
| `auto-start.ts` | 开机自启（exec-paths / LaunchAgents / desktop autostart） |
| `preload.ts` | contextIsolation 下白名单暴露 API |

> **安全基线**：`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`

### 渲染进程

Swiss UI 组件 + Context + 原生 HTML5 拖拽排序 + `WindowControls` 无边框窗口按钮

提醒相关：`ReminderSection`（新增/编辑表单的提醒时间与提前量）、`ReminderSettingsModal`（补弹开关 + “当前提醒”面板，可完成/稍后/关闭排队中的提醒）；纸片渲染层 `src/paper-reminder/`（overlay，复用 `src/paper-lab/` 的纸片与手势组件）。

---

## 六、Web 端架构 (v1.1.0-web)

- 入口：`index.html → main.tsx → App.tsx (ErrorBoundary → Provider 树)`
- 组件：`TodoCard/TodoList/AddTodoModal/EditTodoModal/TodoDetailModal/GroupManagerModal/SyncSettingsModal/ConfirmDialog/ColorPicker/GroupSelect/SwissSelect/Odometer/Icons/ErrorBoundary`
- 同步：HTTP 桥客户端 (`SyncContext` + `syncConfig.ts` + `device.ts`)
- PWA: `vite-plugin-pwa` (`registerType: 'autoUpdate'`，workbox 预缓存)
- 响应式：`@media (max-width: 640px)` / `(max-width: 380px)`；触屏长按 300ms 拖拽；iOS 安全区 + 16px 输入框防缩放
- `tsconfig`: `noUnusedLocals` / `noUnusedParameters` 严格门禁

---

## 七、移动端架构 (v1.1.0-an)

| 项 | 详情 |
|---|---|
| 框架 | Expo 51 (RN 0.74.5, React 18.2)，浅色主题 |
| 网络 | `usesCleartextTraffic: true` (允许 HTTP 桥) |
| 组件/Context | 与 Web 同构命名 (`AddTodoModal` 等)，触屏原生实现 |
| 同步状态 | `SyncStatusFooter` (状态机芯片 + 点击进设置) |
| 构建 | 本地 `android/gradlew` 或 EAS (`eas.json` preview APK) |

---

## 八、同步桥

零依赖 Node ≥18，单文件 `src/server.js`，`createBridge({ file, token, maxBody })` 可注入测试。

- **协议**：GET/HEAD/health, GET/PUT/sync, OPTIONS
- **鉴权**：Bearer + SHA256 + `timingSafeEqual`，token <8 字符 fail-closed
- **原子写**：`tmp.<pid>.<seq>` (wx + 0600) → `rename`
- **写串行化**：Promise 链，check+write 原子成对
- **CORS**: `Access-Control-Allow-Origin: *`

详见 `docs/sync.md` 与 `deployment.md`。

---

## 九、测试与门禁矩阵

| 层 | 命令 | 覆盖 |
|---|---|---|
| shared-logic | `npm test` (vitest) | LWW、墓碑、孤儿改绑、排序收敛、monitor (62 项) |
| sync-bridge | `cd services/sync-bridge && npm test` | 鉴权、etag/409、原子写、CORS、413/404/405 (11项) |
| 桌面 | `npx tsc --noEmit` + `npm run lint` | 类型 + ESLint 零警告 |
| Web | `npx tsc --noEmit` + `npm run build` | 严格类型 + 生产构建 (含 PWA) |
| 手机 | `npx tsc --noEmit` | 类型 (改 shared 后先 `npm run sync-shared`) |

---

## 文档索引

| 文档 | 内容 |
|---|---|
| [architecture.md](architecture.md) | 本文档：总览、Monorepo、共享包、数据模型、状态管理、各端架构 |
| [sync.md](sync.md) | sync.json 格式、LWW 合并算法、桥协议、三端同步行为 |
| [deployment.md](deployment.md) | 云端部署、nginx、systemd、发布流程、验收、备份、故障排查 |
| [DEVELOPMENT_PLAN.md](../DEVELOPMENT_PLAN.md) | 多端开发规划、里程碑、变更记录 |

---

> **版本**: v1.0.3+ (桌面) | **许可**: ISC | **作者**: HengStar