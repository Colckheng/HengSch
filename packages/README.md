# HengSch Shared Packages

HengSch 项目的共享代码包，Monorepo 架构，供桌面端、Web 端、移动端共同使用。总览见 [../README.md](../README.md)，架构细节见 [../docs/architecture.md](../docs/architecture.md)。

## 包说明

### @hengsch/shared-types

共享 TypeScript 类型定义（`src/index.ts`）：

- `TodoType` / `CycleType`：任务类型与周期枚举
- `TodoItem` / `RecurringTodo` / `Todo`：待办（`monitor?` 挂在 TodoItem，once/recurring 均可绑定；recurring 额外含 `nextDueDate`）
- `Group`：分组
- `SyncedMeta`（`updatedAt` / `deviceId` / `deleted`）：云同步元数据，挂在 Todo 与 Group 上
- `MonitorConfig`（`exeName` / `thresholdMinutes` / `auto?` / `askOnExit?`）：进程监测配置（自动监测 / 进程结束询问双开关）
- `SyncConfig`：桌面 SFTP 同步配置；`SyncState` / `SyncStatus`：页脚状态机
- `SyncPayload`：同步全量载荷

### @hengsch/shared-logic

共享业务逻辑（纯函数，ESM 输出，vitest 单测，根 `npm test` 共 140 项）：

- `todo-utils.ts`
  - `calculateNextDueDate`：计算循环任务下次到期
  - `toggleTodoStatus`：完成切换（循环任务续期）
  - `sortTodosByStatus` / `filterTodosByGroup`
  - `generateTodoId` / `generateGroupId`
- `sync.ts`（云同步核心，详见 [../docs/sync.md](../docs/sync.md)）
  - `mergeSyncStates`：双端全量合并（LWW + 墓碑 + 孤儿改绑 + 确定性排序）
  - `pickWinner` / `normalizeSynced` / `parseSyncFile`
  - `TOMBSTONE_TTL_MS`（30 天）、`SyncFile` 类型
- `monitor.ts`：进程监测进度计算、退出沿检测与询问裁决纯函数（配合桌面端 monitor-service）
- `index.ts` 统一重导出

### @hengsch/shared-storage

存储抽象 `IStorage`：

```ts
get<T>(key: string): Promise<T | undefined>
set<T>(key: string, value: T): Promise<void>
delete(key: string): Promise<void>
clear?(): Promise<void>
keys?(): Promise<string[]>
```

各端实现：

- 桌面端：electron-store（经 preload IPC）
- Web 端：localStorage（`v1.1.0-web/src/utils/localStorageAdapter.ts`）
- 移动端：AsyncStorage（`v1.1.0-an/src/utils/asyncStorageAdapter.ts`）

## 使用方式

### 安装

仓库根目录（workspaces 覆盖 `v1.0.0`、`v1.1.0-web`、`packages/*`）：

```bash
npm install
```

### 构建

共享包各自有 `build`（`tsc` → `dist/`）脚本：

```bash
cd packages/shared-logic && npm run build
```

根目录的 `npm run build:packages` 名义上构建全部 workspace（`npm run build --workspaces --if-present`），实际会把桌面端和 Web 端一起构建；在干净检出的仓库上直接跑会失败——workspace 顺序里 `shared-logic` 的 `tsc` 早于 `shared-types`，找不到 `@hengsch/shared-types` 的 `dist` 类型。需要构建共享包时，先单独构建 `packages/shared-types`：

```bash
npm run build --workspace=packages/shared-types
npm run build --workspace=packages/shared-logic
npm run build --workspace=packages/shared-storage
```

### 引用（桌面端与 Web 端相同：源码直引，无需预构建）

- **桌面端**：`v1.0.0/vite.config.ts` 与 `v1.0.0/tsconfig.json` 的 `paths` 都把 `@hengsch/shared-*` 指向 `../packages/*/src/index.ts`——**源码直引，不需要先 build:packages**。

```json
{ "dependencies": { "@hengsch/shared-logic": "*" } }
```

- **Web 端**：`vite.config.ts` 与 `tsconfig.json` 同样 alias 指向 `../packages/*/src/index.ts`，无需预构建。
- **移动端**：内嵌副本 `v1.1.0-an/shared/`，改完 packages 后根目录 `npm run sync-shared` 同步。

```typescript
import type { Todo, Group, SyncedMeta } from '@hengsch/shared-types';
import { toggleTodoStatus, mergeSyncStates } from '@hengsch/shared-logic';
import type { IStorage } from '@hengsch/shared-storage';
```

## 开发说明

- TypeScript 编写；包间可相互依赖（`shared-logic` → `shared-types`）
- **改业务逻辑一律改 `packages/`**，然后：桌面 / Web 直接生效（源码直引，改完刷新即可）；移动端跑 `npm run sync-shared`
- 修改后必跑根目录 `npm test`（桌面 87 + shared-logic 140 + 同步桥 13）
- 输出为 ESM（兼容 Vite/Rollup 命名导出；历史上曾因 CommonJS 出过解析问题）
