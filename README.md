# HengSch Todo · HengSch

> 多端待办管理应用：桌面端把待办做进桌面、进程与对话里，Web 与移动端共享同一份数据，同步全部由你自己托管。

[![license](https://img.shields.io/badge/license-ISC-blue.svg)](https://opensource.org/licenses/ISC)

---

## 这是什么 / 解决什么问题

HengSch Todo 不是一个「打开就写、关掉就忘」的清单工具。它把待办落到三个真实场景里：

- **桌面场景** —— 窗口可以缩成屏幕边缘一条 4px 窄边待命，闲置自动缩入、悬停才弹出；关闭只是收进托盘，后台继续跑。
- **进程场景** —— 待办可以绑到某个程序上：程序累计跑够时长自动打勾，程序退出时弹窗复核「到底做完没」，答「还没做」可以撤销自动完成。
- **对话场景** —— 侧边抽屉里一句话建 / 改 / 查待办。写操作永远先生成「提案确认卡」，你点确认才落盘并同步。

数据不绑任何厂商云：桌面端用 SFTP 直写服务器上的 `sync.json`，Web 与手机经一个零依赖 Node 同步桥读写**同一个文件**，合并算法（LWW + 墓碑）完全在客户端，代码可读、可改、可测。

设计语言：**Swiss Precision** —— 纸感底色、发丝线、直角卡片、里程表数字。

---

## 功能特性

### 桌面端（`v1.0.0/`）

| 能力 | 实现位置 |
|---|---|
| 待办：一次性 / 循环（每天·每周·每月·自定义天数），完成切换自动续期 | `src/renderer/context/TodoContext.tsx`、`packages/shared-logic/src/todo-utils.ts` 的 `calculateNextDueDate` / `toggleTodoStatus` |
| 分组：建 / 改 / 删 / 颜色 / 筛选，默认「未分类」不可删 | `src/renderer/context/GroupContext.tsx`、`components/GroupManagerModal.tsx` |
| 拖拽排序（HTML5 原生拖放） | `src/renderer/components/TodoList.tsx`、`TodoCard.tsx` |
| 小窗模式：紧凑视图，上限 640×560，独立记忆位置大小 | `src/main/index.ts`（`COMPACT_MAX_W=640` / `COMPACT_MAX_H=560`） |
| 四边贴边吸附（阈值 16px，多显示器 workArea） | `src/main/index.ts` 的 `computeSnappedEdge` / `snapWindowToEdge` |
| 闲置自动缩入为 4px 窄边、悬停 6px 命中弹出、180ms 动画，默认闲置 5s | `src/main/index.ts`（`HIDE_PEEK_PX=4` / `REVEAL_HOVER_PX=6` / `ANIM_DURATION_MS=180`） |
| 关闭到托盘、单实例锁、开机自启、置顶 | `src/main/tray.ts`、`src/main/index.ts`（`requestSingleInstanceLock`）、`src/main/auto-start.ts` |
| **进程监测**：30s 轮询 `tasklist`，达标自动完成 / 退出沿弹窗询问，当天只问一次 | `src/main/monitor-service.ts`（`tick` / `checkThreshold` / `enqueueAsk`）、`packages/shared-logic/src/monitor.ts` |
| 进程监测「监测日志」：Windows 计划任务 `HengSchMonitor` 每 2 分钟写快照，支持离线期间当天补问，日志留 7 天 | `src/main/monitor-service.ts` 的 `JOURNAL_SCRIPT` / `createScheduledTask` / `readJournalLines` |
| 进程监测 AI 判定（可选开关，8s 超时自动降级原规则） | `src/main/ai-service.ts` 的 `requestMonitorVerdict`、`monitor-service.ts` 的 `requestVerdict` |
| **到点纸片提醒**：全屏透明置顶 overlay，静止时 14px/s 缓慢游走 | `src/main/paper-window.ts`、`src/paper-lab/App.tsx` |
| 纸片长按揉成纸团、拖进纸篓只关本次提醒；稍后 / 完成先写盘再消失 | `src/paper-lab/gesture.ts`、`PaperBin.tsx`、`src/main/reminder-command.ts` 的 `applyReminderCommand` |
| 提醒跨日 / 重启补弹（队列持久化在 `openPaperReminders`） | `src/main/reminder-service.ts` 的 `scanReminders` |
| **AI 待办管家**：DeepSeek 工具循环（SSE 流式，最多 6 轮），读操作直接答、写操作生成提案确认卡 | `src/main/ai-service.ts` 的 `runAiChat` / `runToolLoop`、`src/main/ai-tools.ts` 的 `stageProposal` / `applyProposal` |
| AI 批量提案一次入队（≤10 条）按卡片顺序串行确认；连续删除合并为一张勾选清单 | `src/main/ai-tools.ts` 的 `stageProposalBatch`（`STAGE_BATCH_MAX=10`）、`src/main/ai-service.ts` 的 `commitProposalBatch` |
| AI 两档详细程度（档 1 只按你说的 / 档 2 缺字段集中追问） | `src/main/ai-service.ts` 的 `promptLevel` / `buildSystemPrompt` |
| 本地语音输入：whisper.cpp 本地转写（`ggml-small-q5_1`，下载带 sha256 校验） | `src/main/voice-service.ts` 的 `transcribe` / `startVoiceModelDownload`、`src/renderer/voice-recorder.ts` |
| **SFTP 云同步**：ed25519 密钥对、原子写 + 写后回读校验、离线指数退避 | `src/main/sync-service.ts` 的 `runCycle` / `runRemoteCycle` / `putAtomic` |
| 私钥用 `safeStorage` 加密（Windows 走 DPAPI），旧明文键自动迁移后删除 | `src/main/sync-service.ts` 的 `writePrivateKey` / `readPrivateKey` |

### Web 端（`v1.1.0-web/`）

| 能力 | 实现位置 |
|---|---|
| 待办 / 分组 / 详情编辑删除全套，Swiss Precision UI | `src/components/`（TodoCard、TodoList、AddTodoModal、EditTodoModal、TodoDetailModal、GroupManagerModal、ConfirmDialog、SwissSelect、Odometer 等） |
| 响应式：≤640px / ≤380px 两档，`100dvh`，iOS 安全区，16px 输入框防缩放 | `src/styles/index.css` |
| 触屏长按 300ms 拖拽排序（黑线落点、拖后抑制误触点击） | `src/styles/index.css`、`src/components/TodoList.tsx` |
| PWA：离线可用 + 安装到主屏，Service Worker `autoUpdate` | `vite.config.ts`（`vite-plugin-pwa`，workbox 预缓存） |
| HTTP 云同步：首拍 5s、周期 60s、离线退避、409 重试 ≤3 次、`visibilitychange` / `online` 触发 | `src/context/SyncContext.tsx`、`src/utils/syncConfig.ts` |

### 移动端（`v1.1.0-an/`）

| 能力 | 实现位置 |
|---|---|
| Expo 51 + RN 0.74，Swiss UI，待办 / 分组 / 筛选 | `App.tsx`、`src/components/` |
| HTTP 云同步（与 Web 同构状态机） | `src/context/SyncContext.tsx`、`src/utils/syncConfig.ts` |
| 本机到期提醒：`expo-notifications` 渠道 + 权限，循环任务按周期预排未来 7 天、最多 50 条 | `src/notifications/reminderScheduler.ts`、`packages/shared-logic/src/reminder-schedule.ts` 的 `buildReminderSchedule` |
| 提醒预设（5 分钟 / 30 分钟 / 1 小时 / 明天 9:00 / 清除） | `src/components/ReminderPresetPicker.tsx`、`src/utils/reminderPresets.ts` |
| 左滑手势：完成 / 稍后 1h / 删除（删除二次确认） | `src/components/SwipeableTodoRow.tsx` |
| Android 桌面小组件（只读摘要：待办数 + 前 3 条 + 更新时间） | `android/app/src/main/java/com/hengsch/todo/TodoWidgetProvider.kt`、`WidgetBridgeModule.kt`、`src/utils/widgetSummary.ts` |
| 本地存储 AsyncStorage 适配 `IStorage` | `src/utils/asyncStorageAdapter.ts` |

### 同步桥（`services/sync-bridge/`）

| 能力 | 实现位置 |
|---|---|
| 零依赖 HTTP 网关（只用 Node 内置 `http`/`crypto`/`fs`/`path`），Node ≥18 | `src/server.js` 的 `createBridge` |
| `GET /health`（免鉴权）、`GET /sync`、`PUT /sync?etag=`、`OPTIONS` 预检 | `src/server.js` |
| Bearer 鉴权：SHA256 + `timingSafeEqual` 常数时间比较，token <8 字符 fail-closed | `src/auth.js` 的 `checkAuth` |
| etag 乐观锁（sha1 前 12 位），冲突返回 409 | `src/server.js` 的 `etagOf` / `putSync` |
| 原子写：`tmp.<pid>.<seq>`（`wx` + 0600）→ `rename`，写串行化防并发双过 etag | `src/server.js` 的 `atomicWrite` / `writeChain` |
| CORS：允许 Web 浏览器直连 | `src/server.js` 的 `CORS_HEADERS` |
| 部署验收探针 9 项 + systemd 单元 | `scripts/probe.sh`、`deploy/sync-bridge.service` |

> **两处明确不在范围内**：Web 端与移动端**没有**进程监测与纸片提醒（`monitor` 字段只在桌面端使用；`remindAt` 只在桌面端与移动端本地提醒中使用）；AI 待办管家**只有桌面端有**（DeepSeek 调用只存在于 `v1.0.0/src/main/ai-service.ts`），Web 与移动端不含任何 AI 代码。

---

## 三端技术栈与状态

| 端 | 目录 | 真实包版本 | 技术栈 | 状态 |
|---|---|---|---|---|
| **桌面** | `v1.0.0/` | `1.1.0`（`v1.0.0/package.json`） | Electron 30 · React 18 · Vite 5 · TypeScript · electron-builder（NSIS x64） | 可用：待办 / 分组 / 小窗贴边 / 进程监测 / 纸片提醒 / AI 管家 / SFTP 同步 |
| **Web** | `v1.1.0-web/` | `1.1.0`（`v1.1.0-web/package.json`） | Vite 5 · React 18 · TypeScript · vite-plugin-pwa | 可用：Swiss UI · PWA · HTTP 同步 · 响应式 |
| **移动** | `v1.1.0-an/` | `app.json` = `1.1.0`（包 `package.json` 为 Expo 占位 `0.0.1`） | Expo 51 · RN 0.74.5 · React 18.2 · expo-notifications | 可用：待办 / 分组 / HTTP 同步 / 本机提醒 / 左滑手势 / Android 小组件 |
| **同步桥** | `services/sync-bridge/` | `1.0.0`（private） | Node ≥18 · 零依赖 HTTP 网关 | 可用：提供 systemd 单元与部署文档，自行部署 |

### 版本体系说明

- **根 `package.json` 的 `version: 1.0.0` 是 monorepo 自身的占位版本**（`"private": true`），不代表任何一端，也不参与打包。
- 三端真实版本分别取自：`v1.0.0/package.json`（桌面，打包版本即取此值）= **1.1.0**；`v1.1.0-web/package.json` = **1.1.0**；`v1.1.0-an/app.json` 的 `expo.version` = **1.1.0**。
- **目录名 `v1.0.0/` / `v1.1.0-web/` / `v1.1.0-an/` 是历史遗留命名**，不随版本号更新，请勿用目录名推断版本。
- 桌面端历史里程碑（v1.0.1 ~ v1.0.4、v1.1.0）记录在 [`v1.0.0/README.md`](v1.0.0/README.md) 的更新日志与 [`DEVELOPMENT_PLAN.md`](DEVELOPMENT_PLAN.md) 的变更记录里。

---

## 快速开始

### 前置条件

| 端 | 需要 |
|---|---|
| 桌面 | Node.js ≥ 18（开发）、Windows 10+（进程监测与监测日志**仅 Windows**） |
| Web | Node.js ≥ 18 |
| 移动 | Node.js ≥ 18；本地出包另需 JDK 17 + Android SDK（`ANDROID_HOME`）或 Expo 账号（EAS） |
| 同步桥 | Node.js ≥ 18（`engines.node: ">=18"`） |

### 依赖安装（一次即可，在仓库根目录）

```bash
npm install
```

根 `package.json` 的 `workspaces` 覆盖 `v1.0.0`、`v1.1.0-web`、`packages/*`；`v1.1.0-an` **不在 workspaces 内**（EAS / gradle 要求自包含工程），需单独安装：

```bash
cd v1.1.0-an && npm install
```

### 桌面端

```bash
cd v1.0.0
npm run electron:dev      # 开发：vite-plugin-electron 拉起 Electron（Vite 端口 5175）
npm run electron:build    # 打包：先拉 whisper.cpp exe → tsc && vite build → electron-builder，产物在 release/
npm run lint              # ESLint 门禁（--max-warnings 0）
npx tsc --noEmit          # 类型门禁
```

> `npm run electron:build` 会先执行 `npm run whisper:fetch`（PowerShell 脚本，从 whisper.cpp v1.9.2 release 下载 `whisper-bin-x64.zip` 并校验 sha256），用于打包本地语音组件。

### Web 端

```bash
cd v1.1.0-web
npm run dev                # 开发服务器 http://localhost:5174
npm run build              # tsc && vite build（含 PWA Service Worker 生成）
npm run preview            # 本地预览构建产物
npx tsc --noEmit           # 类型门禁（strict + noUnusedLocals/noUnusedParameters）
```

### 移动端

```bash
cd v1.1.0-an
npm run start              # Expo 开发服务器（--offline）；prestart 会自动先跑 sync-shared
npm run android            # 本地构建并安装到设备/模拟器；preandroid 同样自动 sync-shared
npx tsc --noEmit           # 类型门禁（移动端无独立单测）
```

出 APK（两种方式）：

```bash
# 方式一：本地 gradle（需 JDK 17 + Android SDK）
cd v1.1.0-an/android
./gradlew.bat assembleRelease
# 产物：android/app/build/outputs/apk/release/app-release.apk

# 方式二：EAS 云构建（需 Expo 账号，app.json 已绑定 projectId）
npx eas build --platform android --profile preview
```

### 同步桥

```bash
cd services/sync-bridge
cp .env.example .env   # 填 SYNC_PORT / SYNC_FILE / SYNC_TOKEN
npm start              # node src/server.js，默认监听 0.0.0.0:8642
```

---

## 目录结构

| 路径 | 说明 |
|---|---|
| `v1.0.0/` | Electron 桌面端（workspace）：`src/main/` 主进程、`src/renderer/` 渲染进程、`src/paper-lab/` `src/paper-reminder/` 纸片、`src/ask/` 询问小窗、`scripts/` 验收脚本 |
| `v1.1.0-web/` | Web PWA 端（workspace）：`src/components/` `src/context/` `src/utils/` `src/styles/` |
| `v1.1.0-an/` | 移动端（独立工程，不在 workspaces）：`src/`、`shared/`（`packages/*` 的内嵌副本）、`android/`、`scripts/sync-shared.js` |
| `packages/shared-types/` | 共享类型：`Todo` / `Group` / `SyncedMeta` / `MonitorConfig` / `SyncConfig` / `AiProposal` 等 |
| `packages/shared-logic/` | 共享纯函数 + vitest 单测：`todo-utils` / `sync`（LWW 合并）/ `monitor` / `reminder` / `reminder-schedule` |
| `packages/shared-storage/` | 存储抽象接口 `IStorage`（各端各自实现适配器） |
| `services/sync-bridge/` | HTTP 同步桥：`src/server.js` `src/auth.js` `test/server.test.js` `scripts/probe.sh` `deploy/sync-bridge.service` `.env.example` |
| `docs/architecture.md` | 架构总览：Monorepo、共享包、数据模型、各端架构 |
| `docs/sync.md` | 同步协议：`sync.json` 格式、LWW 合并算法、桥协议、三端同步行为 |
| `docs/deployment.md` | 云端部署运维：nginx、systemd、发布流程、验收、备份、故障排查 |
| `docs/evidence/` | 验收证据：AI 助手验收报告、纸片提醒集成记录与截图、移动端增强构建记录 |
| `docs/plans/` | 设计文档与任务书（16 篇）：AI 抽屉、纸片提醒、进程监测、移动端增强等 |
| `DEVELOPMENT_PLAN.md` | 多端规划、里程碑与变更记录 |

### 三端如何引用共享代码

| 端 | 方式 | 是否需要预构建 |
|---|---|---|
| 桌面 | `v1.0.0/vite.config.ts` 的 alias 指向 `../packages/*/src/index.ts` | **不需要**（源码直引） |
| Web | `v1.1.0-web/vite.config.ts` 的 alias 指向 `../packages/*/src/index.ts` | **不需要**（源码直引） |
| 移动 | `v1.1.0-an/shared/` 是 `packages/*/src` 的内嵌副本 | 需要先 `npm run sync-shared` |

> 桌面端与 Web 端一样通过 Vite alias 与 tsconfig `paths` 直引 `packages/*/src`，**无需预构建共享包**；只有移动端的 `shared/` 副本需要 `npm run sync-shared` 同步。`packages/README.md` 与 `docs/architecture.md` 已与此对齐。

---

## 常用脚本

### 仓库根目录（`package.json`）

| 命令 | 实际行为（已核对实现） |
|---|---|
| `npm run build` | = `build:web`，**只构建 Web 端**（`tsc && vite build`），不构建桌面端 |
| `npm run build:web` | `npm run build --workspace=v1.1.0-web` → Web 端 `tsc && vite build` |
| `npm run build:packages` | `npm run build --workspaces --if-present` → 实际构建**所有 workspace**（桌面 `tsc && vite build`、Web、三个 shared 包 `tsc`）。⚠️ 干净检出上会失败：workspace 顺序里 `shared-logic` 的 `tsc` 早于 `shared-types`，找不到 `@hengsch/shared-types` 的 `dist` 类型；需先单独构建 `packages/shared-types` |
| `npm test` | `npm test --workspaces --if-present && npm run test:bridge && npm run check:shared` → 桌面 87 项 + shared-logic 140 项 + 桥 13 项，最后校验移动端副本未漂移 |
| `npm run test:bridge` | `npm test --prefix services/sync-bridge` → `node --test`，13 项 |
| `npm run check:shared` | `npm run check:shared --prefix v1.1.0-an` → 比对 `v1.1.0-an/shared/` 与 `packages/*/src`，退出码 0 = 一致 |
| `npm run sync-shared` | `npm run sync-shared --prefix v1.1.0-an` → 把 `packages/*/src` 拷进 `v1.1.0-an/shared/`，并把 `@hengsch/shared-types` 导入改写成相对路径 |
| `npm run start:an` | `npm run start --prefix v1.1.0-an` → 先跑 `prestart`（sync-shared）再 `expo start --offline` |

### 桌面端（`v1.0.0/package.json`）

| 命令 | 说明 |
|---|---|
| `npm run electron:dev` | 开发模式（`vite` + vite-plugin-electron，Vite 端口 5175） |
| `npm run dev` | 只起 Vite 渲染层 |
| `npm run build` | `tsc && vite build`（渲染层 3 个 HTML 入口 index/ask/paper + 4 个主进程/预加载脚本） |
| `npm run electron:build` | `whisper:fetch && build && electron-builder` → NSIS x64 安装包，产物 `release/` |
| `npm run whisper:fetch` / `whisper:fetch-model` | 拉取 whisper.cpp v1.9.2 预编译 exe（sha256 校验）/ 模型 |
| `npm test` | `node scripts/test-paper-lab.cjs`：esbuild 打包 6 个测试文件后 `node --test`，87 项 |
| `npm run lint` / `npm run format` | ESLint 零警告 / Prettier 格式化 |
| `npm run paper:dev` / `paper:build` / `paper:desktop` / `paper:smoke` / `paper:record` | 纸片原型实验室（Vite / Electron / 冒烟 / 录屏） |
| `npm run reminder:integration` | 纸片提醒生产链路集成检查（Electron，隔离 userData，15 项断言） |
| `npm run ai:acceptance` | AI 抽屉手工剧本自动化验收（需先 `npm run build`；`-- --no-screenshots` 可跳过截图） |
| `npm run ai:smoke` | AI 服务 Node 侧冒烟（内置假 DeepSeek，不联网） |

### Web 端 / 移动端 / 同步桥

| 端 | 命令 | 说明 |
|---|---|---|
| Web | `npm run dev` / `build` / `preview` | 端口 5174 / `tsc && vite build` / 预览产物 |
| 移动 | `npm run start` / `android` / `ios` / `web` | Expo 各平台命令，`pre*` 钩子自动 `sync-shared` |
| 移动 | `npm run sync-shared` / `npm run check:shared` | 生成 / 校验内嵌副本 |
| 桥 | `npm start` / `npm test` | `node src/server.js` / `node --test` 13 项 |

---

## 数据与同步协议

### 单一事实来源

三端最终收敛到服务器上的**同一个文件**：

```text
桌面端 ──SFTP(ssh2, 原子写+回读校验)──┐
                                       ├──> /home/syncuser/sync.json
Web 端  ──HTTP GET/PUT────────────────┤        ↑
手机端  ──HTTP GET/PUT────────────────┘   sync-bridge :8642
                                  (etag 乐观锁 · 写串行化 · 原子写 · CORS)
```

### `sync.json` 格式

```jsonc
{
  "version": 1,                            // 必须为 1，否则判定损坏
  "todos": [ /* Todo[]，含墓碑 */ ],
  "groups": [ /* Group[]，含墓碑 */ ],
  "writer": { "deviceId": "...", "at": 1728000000000 }   // 最后写入者（信息性）
}
```

解析入口 `parseSyncFile(text)`（`packages/shared-logic/src/sync.ts`）：非 JSON、缺数组、`version !== 1` 一律返回 `null` → 客户端显示 `REMOTE ERROR` 且**本轮不写回**，防止坏档覆盖好档。

### 记录级同步元数据

| 字段 | 含义 |
|---|---|
| `updatedAt` | LWW 主判据；缺失时用 `createdAt` 补齐（`normalizeSynced`） |
| `deviceId` | 修改来源设备；`updatedAt` 相等时按字典序定序，缺失补 `'legacy'` |
| `deleted` | 墓碑标记。**删除不物理移除**，否则合并会把删除「复活」 |

### 合并算法（永远在客户端）

`mergeSyncStates(local, remote, now)` —— `packages/shared-logic/src/sync.ts`，纯函数：

1. **补齐元数据**：两边记录先过 `normalizeSynced`。
2. **逐条 LWW**（`pickWinner`）：`updatedAt` 大者胜 → 相等比 `deviceId` 字典序 → 再相等比**稳定键序序列化**（`stableStringify`，保证跨端选出同一个赢家，杜绝写-读-写震荡）。墓碑同等参与比较，晚删者胜。
3. **过期墓碑清除**：`deleted === true` 且 `now - updatedAt > TOMBSTONE_TTL_MS`（30 天）→ 丢弃。
4. **孤儿任务改绑**：`todo.groupId` 不存在或已墓碑 → 改绑 `'default'`。
5. **确定性排序**（两端收敛到同一顺序）：todos 按 `order → createdAt → id`；groups 按 `createdAt → id`。

> 边界取舍：同一条记录两端**同时**修改时，LWW 只保留 `updatedAt` 较大的一侧（未做字段级合并）。

### 同步桥协议

| 方法 | 路径 | 鉴权 | 行为 |
|---|---|---|---|
| GET | `/health` | 无 | `200 {"ok":true}` |
| GET | `/sync` | Bearer | `200 {etag, state}`；无文件时两者为 `null` |
| PUT | `/sync?etag=<当前 etag>` | Bearer | body 为完整文件文本；etag 匹配（或文件不存在且 etag 为空）→ 原子写 `200 {etag}`；不匹配 → `409 {etag}`，客户端重读重合后重试 |
| OPTIONS | 任意 | 无 | `204` + CORS 头（浏览器预检） |

其它：token 缺失 / 错误 → `401`；body > 8MB → `413`；未知路径 → `404`；方法不对 → `405`。默认端口 `8642`（`SYNC_PORT`），数据文件路径由 `SYNC_FILE` 指定。

### 三端同步客户端

| 端 | 传输 | 关键常量 |
|---|---|---|
| 桌面 | `ssh2` SFTP（`remotePath` 支持 `~/`） | 首拍 5s · 周期 60s · 离线退避 `min(5s×2ⁿ, 60s)` · 写重试 3 次（500ms 递增）· 写后回读校验 |
| Web / 移动 | HTTP 桥 | 首拍 5s · 周期 60s · 离线退避 `min(5s×2ⁿ, 60s)` · 409 重试 ≤3 次 · fetch 超时 8s |

状态机三端一致：`OFF / SYNCING / SYNCED / OFFLINE / AUTH ERROR / REMOTE ERROR`。

### 配对

- 桥的 `SYNC_TOKEN`（写在 `.env`，已 gitignore，**不要提交仓库**）即配对 token。
- **Web / 手机**：设置弹窗填 `http://<服务器IP>:8642` + token → 勾选启用 → 测试连接 → 保存，60s 内状态变 `SYNCED hh:mm`。
- **桌面**：设置弹窗填主机 / 端口 / 用户 / 远端路径；首次启动生成 ed25519 密钥对，把弹窗里展示的公钥追加到服务器 `~/.ssh/authorized_keys`。

---

## 测试

| 套件 | 命令 | 数量 | 状态 |
|---|---|---|---|
| 桌面端 | `cd v1.0.0 && npm test` | **87 项**（esbuild 打包 6 个 `*.test.ts(x)` 后 `node --test`：`ai-service` / `ai-tools` / `ai-flow` / `reminder-command` / `gesture` / `PaperBin`） | 全部通过 |
| 共享逻辑 | `cd packages/shared-logic && npm test`（vitest） | **140 项**（`sync` 29 · `monitor` 40 · `todo-utils` 35 · `reminder` 19 · `reminder-schedule` 17） | 全部通过 |
| 同步桥 | `cd services/sync-bridge && npm test`（`node --test`） | **13 项**（鉴权 / etag 409 / 原子写 / 并发 PUT / 回读 / CORS / 413 / 400 / 404 / 405） | 全部通过 |
| 一次性全跑 | 仓库根 `npm test` | **240 项** = 87 + 140 + 13，末尾附 `check:shared` 副本一致性校验 | 全部通过 |
| 移动端 | `npx tsc --noEmit` + `npm run check:shared` | 无独立单测，业务逻辑由 shared-logic 覆盖 | 通过 |

额外验收脚本（**不在** `npm test` 内）：

| 命令 | 内容 |
|---|---|
| `npm run reminder:integration`（桌面） | 纸片提醒生产链路 15 项断言，证据落在 `docs/evidence/paper-reminder-rebuild/production-integration.json` |
| `npm run ai:acceptance`（桌面） | AI 抽屉手工剧本自动化验收，报告 `docs/evidence/ai-assistant/ai-acceptance-report.json`（39 项断言，0 渲染错误） |
| `npm run ai:smoke`（桌面） | AI 服务 Node 侧冒烟，内置假 DeepSeek |
| `bash services/sync-bridge/scripts/probe.sh http://<IP>:8642 <TOKEN>` | 部署验收探针 **9 项**（health / 鉴权 / 幂等 PUT / 回读 / stale etag 409 / DELETE 405 / 未知路径 404） |

> 本仓库**未接入覆盖率工具**，也没有 CI 配置，请勿引用覆盖率数字。

---

## 部署

### 同步桥（自托管，Ubuntu）

仓库提供 systemd 单元 `services/sync-bridge/deploy/sync-bridge.service`（`User=syncuser`、`EnvironmentFile=.env`、`ProtectSystem=strict` + `ReadWritePaths=/home/syncuser`、`Restart=always`）与完整步骤（见 [`docs/deployment.md`](docs/deployment.md)）：

```bash
scp -r services/sync-bridge/* <server>:/opt/hengsch/sync-bridge/
cd /opt/hengsch/sync-bridge && cp .env.example .env && vim .env   # SYNC_PORT / SYNC_FILE / SYNC_TOKEN
sudo cp deploy/sync-bridge.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now sync-bridge
systemctl status sync-bridge && journalctl -u sync-bridge -f       # 应见 listening 0.0.0.0:8642
ufw allow 8642/tcp                                                  # 云厂商安全组同步放行入方向 8642
bash scripts/probe.sh http://<SERVER_IP>:8642 <SYNC_TOKEN>          # 9 项验收
```

### Web 端（自托管 nginx）

`v1.1.0-web` 构建后上传 `dist/` 到 `/var/www/hengsch-web/`，nginx 按 `docs/deployment.md` 的配置分发：`index.html` 与 SPA 回退 `no-cache`、`/assets/*` 长缓存 `immutable`（vite 指纹文件名）。**不建议用免费 HTTPS 托管**——浏览器会拦截对 HTTP 同步桥（:8642）的混合内容请求，故采用自托管。

### 桌面端与移动端

- 桌面：`npm run electron:build` → electron-builder NSIS x64 安装包（`release/`）。
- 移动：`eas build --platform android --profile preview` 或本地 `android/gradlew.bat assembleRelease`。

### 数据与备份

数据文件 `/home/syncuser/sync.json` 是单一事实来源，桌面 SFTP 与桥共用。备份即 `scp <server>:/home/syncuser/sync.json ./sync-backup-$(date +%F).json`；恢复后 `chown syncuser:syncuser && chmod 600` 即可，桥每次请求即时读盘、无需重启。

---

## 相关文档

| 文档 | 内容 |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | 架构总览：Monorepo 拓扑、共享包、数据模型、状态管理、各端架构 |
| [`docs/sync.md`](docs/sync.md) | 同步深潜：`sync.json` 格式、LWW 合并算法、桥协议、三端同步行为、故障排查 |
| [`docs/deployment.md`](docs/deployment.md) | 云端部署运维：nginx / systemd、发布流程、验收、备份、故障排查 |
| [`DEVELOPMENT_PLAN.md`](DEVELOPMENT_PLAN.md) | 多端开发规划、里程碑、变更记录 |
| [`v1.0.0/README.md`](v1.0.0/README.md) | 桌面端功能、窗口行为、SFTP 同步配置、进程监测、更新日志 |
| [`v1.1.0-web/README.md`](v1.1.0-web/README.md) | Web 端开发、同步配置、触屏交互、与其他端的差异 |
| [`v1.1.0-an/README.md`](v1.1.0-an/README.md) | 移动端环境、构建 APK、本机提醒 / 左滑手势 / 小组件、`sync-shared` 约定 |
| [`services/sync-bridge/README.md`](services/sync-bridge/README.md) | 同步桥协议、systemd 部署、验收探针、三端配对 |
| [`packages/README.md`](packages/README.md) | 三个共享包的导出 API 一览 |
| [`docs/evidence/`](docs/evidence/) | 验收证据：AI 助手验收报告与手册核对、纸片提醒集成记录与截图、移动端增强构建记录 |
| [`docs/plans/`](docs/plans/) | 设计文档与任务书（AI 抽屉、纸片提醒重建、进程监测裁决、移动端增强等 16 篇） |

---

## License

**ISC** —— 见根 [`package.json`](package.json) 的 `license` 字段（桌面端 `v1.0.0/` 与三个 shared 包同样标注 ISC；Web 端、移动端与同步桥的 `package.json` 未写该字段）。仓库根目录目前没有 `LICENSE` 文件。

作者：**HengStar**
