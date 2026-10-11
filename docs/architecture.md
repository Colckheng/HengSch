# 架构总览

## 1. Monorepo 组织

根 `package.json` 使用 **npm workspaces**：

```jsonc
"workspaces": ["v1.0.0", "v1.1.0-web", "packages/*"]
```

- `v1.1.0-an` **不在** workspaces 内：EAS / gradle 构建要求自包含工程，其 `shared/` 目录是 `packages/*` 的**内嵌副本**，由 `npm run sync-shared`（`v1.1.0-an/scripts/sync-shared.js`）从源头拷贝。改业务逻辑永远改 `packages/`，改完必须 `npm run sync-shared`。
- 根脚本：`build` / `build:packages` / `build:web` / `test`（跑全部 workspace 的 test）/ `start:an` / `sync-shared`。
- `overrides` 统一 react / react-dom 到 18.2.0（桌面声明 ^18.3.1，实际以 18.2.0 解析，避免多实例）。

### 各端接入 shared 的方式

| 端 | 方式 | 说明 |
|---|---|---|
| v1.0.0 桌面 | workspace 依赖 `"@hengsch/shared-*": "*"` | 解析到包的 `dist/`（`main: dist/index.js`），需先 `npm run build:packages`（根 install 后常规流程） |
| v1.1.0-web | **vite alias 源码直引** | `vite.config.ts` 把 `@hengsch/shared-*` 指向 `../packages/*/src/index.ts`，dev/build 无需预构建；`@` → `./src` |
| v1.1.0-an | 内嵌副本 `shared/` | Metro 直接编译副本；与 monorepo 解耦 |

## 2. 共享包

### @hengsch/shared-types（`packages/shared-types/src/index.ts`）

- `TodoType = 'once' | 'recurring'`，`CycleType = 'daily' | 'weekly' | 'monthly' | 'custom'`
- `TodoItem` / `RecurringTodo`（含 `monitor?: MonitorConfig`、`nextDueDate?`）、`Group`
- `SyncedMeta`（`updatedAt` / `deviceId` / `deleted`）：同步元数据，挂在 Todo 与 Group 上
- `SyncConfig`（SFTP 配置）、`WebSyncConfig` 等价物在各端 utils 内
- `SyncState` 状态机：`OFF | SYNCING | SYNCED | OFFLINE | AUTH ERROR | REMOTE ERROR`；`SyncStatus { state, at, error? }`
- `SyncPayload { todos, groups }`

### @hengsch/shared-logic（`packages/shared-logic/src/`）

纯函数 + vitest 单测（根 `npm test` 的 48 项来源）：

- `todo-utils.ts`：`calculateNextDueDate`、`toggleTodoStatus`（完成循环任务算下次到期并重置）、`sortTodosByStatus`、`filterTodosByGroup`、`generateTodoId` / `generateGroupId`
- `sync.ts`：`normalizeSynced`、`pickWinner`（LWW）、`mergeSyncStates`（全量合并）、`parseSyncFile`、`TOMBSTONE_TTL_MS`（30 天）——详见 [docs/sync.md](sync.md)
- `monitor.ts`：进程监测进度计算（配合桌面端 monitor-service）
- 以 ESM 输出（`module: dist/index.js`），兼容 Vite/Rollup 命名导出

### @hengsch/shared-storage（`packages/shared-storage/src/index.ts`）

`IStorage` 抽象：`get<T>(key)` / `set<T>(key, value)` / `delete(key)` / 可选 `clear` / `keys`。各端实现：

| 端 | 实现 | 位置 |
|---|---|---|
| 桌面 | electron-store（经 preload IPC） | renderer 经 `window.electronAPI` |
| Web | localStorage | `v1.1.0-web/src/utils/localStorageAdapter.ts` |
| 手机 | AsyncStorage | `v1.1.0-an/src/utils/asyncStorageAdapter.ts` |

## 3. 数据模型要点

- **Todo**：`id`、`title`、`description?`、`type`、`status`、`createdAt`、`completedAt?`、`order`（排序权重）、`groupId?`（缺省 `'default'`）；recurring 额外 `cycleType` / `customCycleDays?` / `nextDueDate?` / `monitor?`
- **Group**：`id`、`name`、`color`、`createdAt`；固定 `default`（「未分类」，不可删）
- **墓碑**：删除任务/分组时记录置 `deleted: true` + 刷新 `updatedAt`，同步合并防复活，30 天后合并时清除
- **本地视图**：各端 Context 持「可见列表」+ 墓碑，UI 只渲染非墓碑

## 4. 状态管理（三端同构）

Context + `useReducer`：

| Context | 职责 |
|---|---|
| TodoContext | 增删改查、完成切换（调 shared `toggleTodoStatus`）、排序、`applySyncedTodos`（同步整体应用） |
| GroupContext | 分组 CRUD、`applySyncedGroups` |
| WindowContext（仅桌面） | 置顶 / 小窗 / 最小化等窗口 UI 状态 |
| SyncContext | 同步状态机、周期调度、配置（详见 [docs/sync.md](sync.md)） |

数据持久化：Todo/Group 变更即写本地存储（localStorage / AsyncStorage / electron-store），同步合并结果同样落盘。

Provider 嵌套（Web 端为例）：`GroupProvider → TodoProvider → SyncProvider → UI`（Sync 需读两个 Context）。

## 5. 桌面端架构（v1.0.0）

- **主进程**（`src/main/`）：
  - `index.ts`：窗口生命周期、小窗/贴边/缩入状态机（吸附阈值 16px、窄边 4px、悬停弹出 6px、动画 180ms、多显示器 workArea）、IPC
  - `sync-service.ts`：SFTP 同步（ssh2、密钥对生成、原子写 + 回读校验、周期调度）
  - `monitor-service.ts`：进程监测（30s 轮询 tasklist、达标自动完成循环任务、计划任务 `HengSchMonitor` 日志、7 天日志保留）
  - `auto-start.ts`：开机自启（exec-paths / LaunchAgents / desktop autostart）
  - `preload.ts`：contextIsolation 下白名单暴露 API
- **渲染进程**（`src/renderer/`）：Swiss UI 组件 + Context；原生 HTML5 拖拽排序；`WindowControls` 无边框窗口按钮
- 安全基线：`contextIsolation: true`、`nodeIntegration: false`

## 6. Web 端架构（v1.1.0-web）

- 入口链：`index.html → src/main.tsx → App.tsx（ErrorBoundary → Provider 树）`
- 组件：`TodoCard / TodoList / AddTodoModal / EditTodoModal / TodoDetailModal（含编辑/删除）/ GroupManagerModal / SyncSettingsModal / ConfirmDialog / ColorPicker / GroupSelect / SwissSelect / Odometer / Icons / ErrorBoundary`
- 同步：HTTP 桥客户端（`context/SyncContext.tsx` + `utils/syncConfig.ts` + `utils/device.ts`）
- PWA：`vite-plugin-pwa`（`registerType: 'autoUpdate'`，workbox 预缓存 html/js/css/ico/png/svg）
- 响应式：`@media (max-width: 640px)` / `(max-width: 380px)`；触屏（`pointer: coarse`）禁文本选择、长按 300ms 拖拽排序；iOS 安全区 + 16px 输入框防缩放
- 开发端口 5174；`tsconfig` 开 `noUnusedLocals` / `noUnusedParameters`（门禁更严）

## 7. 移动端架构（v1.1.0-an）

- Expo 51（React Native 0.74.5，React 18.2），浅色主题，`usesCleartextTraffic: true`（允许 HTTP 桥）
- 与 Web 同构的组件/Context 命名（`AddTodoModal` 等），触屏原生实现（无 DOM）
- 页脚 `SyncStatusFooter`（状态机芯片 + 点击进设置）；设置弹窗与 Web 同名同字段
- 构建：本地 `android/gradlew` 或 EAS（`eas.json` preview 出 APK）

## 8. 同步桥（services/sync-bridge）

零依赖 Node HTTP 网关：etag 乐观锁 + 串行化原子写 + CORS；无业务逻辑。详见 [docs/sync.md](sync.md) 与 [deployment.md](deployment.md)。

## 9. 测试与门禁矩阵

| 层 | 命令 | 覆盖 |
|---|---|---|
| shared-logic | 根 `npm test` → vitest | LWW 合并、墓碑、孤儿改绑、排序收敛、monitor 计算（48 项） |
| sync-bridge | `cd services/sync-bridge && npm test` | 鉴权、etag/409、原子写、CORS、413/404/405（11 项） |
| 桌面 | `npx tsc --noEmit` + `npm run lint` | 类型 + ESLint 零警告 |
| Web | `npx tsc --noEmit` + `npm run build` | 严格类型 + 生产构建（含 PWA 生成） |
| 手机 | `npx tsc --noEmit` | 类型（改 shared 后先 sync-shared） |
