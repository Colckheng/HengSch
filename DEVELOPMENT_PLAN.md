## HengSch 项目多端开发规划（v1.0.x / v1.1.x）

本文档描述 HengSch 多端（桌面、Web、移动）的总体规划与实施状态。后期如有调整，在本文档基础上更新版本记录，而不是另起新文档。

> 操作性文档（如何跑、如何部署、协议细节）见 [README.md](README.md) 与 `docs/`；本文侧重规划、里程碑与变更记录。

---

## 一、当前状态概览

### v1.0.0 桌面端（已完成）
- **技术栈**：Electron 30 + React 18 + TypeScript + Vite 5
- **目录位置**：`v1.0.0/`
- **主要特性**：待办（一次性 + 循环）、拖拽排序、分组管理、小窗模式、四边贴边吸附 + 闲置缩入、置顶、开机自启、窗口记忆、Swiss Precision UI、**进程监测自动完成**、**SFTP 云同步（LWW + 墓碑）**、**到点纸片提醒**、**AI 待办管家（提案确认 / 本地语音 / 监测判定）**

### v1.1.0-web 网页端（已完成）
- **技术栈**：Vite 5 + React 18 + TypeScript + vite-plugin-pwa
- **目录位置**：`v1.1.0-web/`
- **主要特性**：Swiss Precision UI、待办 / 分组全套、详情弹窗（编辑 / 删除）、**HTTP 云同步（可启用 / 停用）**、PWA（离线 + 主屏）、**移动端响应式（≤640 / ≤380px）**、触屏长按拖拽排序
- **部署**：自托管 nginx（任意云服务器），非 Vercel / Netlify（HTTPS 与 HTTP 桥混合内容冲突）

### v1.1.0-an 移动端（已完成）
- **技术栈**：Expo 51 + React Native 0.74 + TypeScript
- **目录位置**：`v1.1.0-an/`
- **主要特性**：Swiss UI、待办 / 分组 / 筛选、**HTTP 云同步**、状态条 + 设置弹窗；APK 本地 gradle / EAS 双通道交付；**本地到期提醒（通知开关/7 天预排/点击进详情）**、**左滑完成/删除/稍后**、**Android 桌面小组件（只读摘要）**

### services/sync-bridge 同步桥（已部署）
- **技术栈**：零依赖 Node ≥18 HTTP 服务（etag 乐观锁 + 原子写 + CORS）
- **部署**：systemd `sync-bridge`（默认 :8642），数据文件 `/home/syncuser/sync.json` 与桌面 SFTP 共用

### 文档（已补齐）
- 根 [README.md](README.md)：总入口与快速开始
- `docs/architecture.md`：架构总览；`docs/sync.md`：同步协议深潜；`docs/deployment.md`：云端部署运维
- 各端 README：`v1.0.0/`、`v1.1.0-web/`、`v1.1.0-an/`、`services/sync-bridge/`、`packages/`

---

## 二、v1.0.x（桌面端）规划：小窗模式吸附 + 贴边缩入（已完成）

### 2.1 需求目标

1. **小窗模式吸附（Snap）**
   - 小窗拖动到屏幕四周时，自动吸附到对应边缘（类似 Windows 窗口贴边）。
   - 支持多显示器：以当前窗口所在显示器的工作区域为基准。

2. **闲置自动缩入（Auto-hide）**
   - 小窗贴边后，一段时间无用户交互自动向对应边缘缩入（类老版 QQ），上下左右四边全支持。
   - 缩入后只留一条窄边，鼠标靠近自动弹出。
   - 行为可配置：简洁的「启用自动贴边缩入」开关，闲置时间默认 5 秒。

3. **交互稳定性**
   - 拖动窗口过程中不触发缩入；用户活动重置闲置计时器。

### 2.2 技术设计（已实现，作为背景保留）

- 主进程 `src/main/index.ts`：`screen.getDisplayMatching(workArea)`、move 事件防抖判定拖动结束、`setBounds` 多帧模拟动画。
- 状态：`snappedEdge`、`isHidden`、闲置 / 动画计时器；窄边 4px、吸附阈值 16px、弹出命中 6px、动画 180ms。
- 渲染进程监听 mousemove / mousedown / wheel / keydown 经 IPC 上报用户活动。

### 2.3 版本拆分与里程碑

- **v1.0.1**（已完成）：四边吸附（多显示器）+ 无动画缩入 / 弹出，闲置固定 5s + 开关。
- **v1.0.2**（已完成）：动效版缩入 / 弹出（180ms），窄边定为 4px，启动不再自动开 DevTools。
- **v1.0.3**（已完成）：吸附优先级固定 上 > 下 > 左 > 右；悬停窄边自动弹出；修复弹出后无法移动。右上角循环弹出 bug 后续已修复并验收。

---

## 三、v1.1.0 总体规划：移动端 + 网页端 + 共享层

### 3.1 Monorepo 组织（已落地）

- `v1.0.0/`、`v1.1.0-web/`、`packages/*` 在 npm workspaces 内；`v1.1.0-an` 独立工程（自包含构建），`shared/` 为内嵌副本 + `npm run sync-shared`。
- `packages/shared-types`、`shared-logic`、`shared-storage`：类型 / 业务逻辑（含单测）/ 存储抽象。

### 3.2 跨端共享策略（已落地）

- 数据模型、循环续期、排序筛选、**云同步合并（LWW + 墓碑）**、监测计算全部下沉 `shared-*`。
- 各端只写「壳 + 适配层」：存储适配（electron-store / localStorage / AsyncStorage）、同步传输（SFTP / HTTP）、UI 组件。

---

## 四、v1.1.0-web（网页端）（已完成）

### 4.1 技术栈与结构

- Vite 5 + React 18 + TS（strict + noUnusedLocals/Parameters）；vite alias 直引 `packages/*/src`。
- Swiss Precision UI 组件全套（TodoCard/List、Add/Edit/Detail、GroupManager、SyncSettings、ConfirmDialog、SwissSelect、Odometer 等）+ ErrorBoundary。

### 4.2 功能（全部完成）

- 待办 / 分组全套；详情弹窗含编辑 / 删除；HTML5 拖拽 + **触屏长按 300ms 拖拽**（长按激活、黑线落点、拖后抑制误触点击）。
- **HTTP 云同步**：SyncContext（首拍 5s、周期 60s、离线退避、409 重试、visibility/online 触发、StrictMode 安全）；设置弹窗含「启用」开关；localStorage 存配置与 deviceId。
- 响应式：`@media ≤640px / ≤380px`，触屏禁文本选择、iOS 安全区、16px 输入防缩放、`100dvh`。
- **PWA**：vite-plugin-pwa，autoUpdate + workbox 预缓存。
- 部署：nginx 自托管（index.html / sw.js no-cache、assets immutable），见 `docs/deployment.md`。

### 4.3 里程碑

- **web v0.1**（已完成）：骨架、共享包接入、核心功能、响应式初版、PWA、白屏修复、模板清理。
- **web v0.2**（已完成）：Swiss UI 移植、HTTP 同步、详情编辑 / 删除、移动端触屏适配（长按拖拽）、8 项审查 bug 修复（同步开关 / StrictMode 定时器 / no-cache 缓存策略等）、自托管上线。

---

## 五、v1.1.0-an（移动端）（已完成）

- Expo 51 + RN 0.74 + TS；AsyncStorage 适配 IStorage；自包含构建（内嵌 shared + sync-shared）。
- Todo / 分组全套 + 筛选 + 列表重排；Swiss UI；页脚 SyncStatusFooter + SyncSettingsModal。
- **HTTP 云同步**（与 Web 同构状态机：5s 首拍 / 60s 周期 / 退避 / 409 重试）；`usesCleartextTraffic` 允许 HTTP 桥。
- APK 交付：本地 gradle `assembleRelease`（主通道）或 EAS preview；交付物 `HengSch-Todo-v1.1.0.apk`。
- 门禁：`npx tsc --noEmit`（无独立单测，业务逻辑由根测试覆盖）。
- 后续增强（**已实现，待真机验收**）：本地通知 / 到期提醒、滑动手势、Android 桌面小组件；通知/手势/小组件代码与 APK 已就绪，真机验收记录见 `docs/evidence/mobile-enhancements/`。

---

## 六、云同步体系（已完成）

- **拓扑**：三端共享 `/home/syncuser/sync.json`；桌面 SFTP（ssh2 原子写 + 回读校验）；Web / 手机走 sync-bridge HTTP（etag 乐观锁 + 串行化写 + CORS）。
- **合并**：客户端 `mergeSyncStates`（逐条 LWW：updatedAt → deviceId → JSON 定序；墓碑 30 天 TTL；孤儿改绑 default；确定性排序），vitest 覆盖。
- **桥**：零依赖 Node，`/health` `/sync` GET/PUT + OPTIONS 预检；401/409/413/404/405；systemd 部署；probe.sh 9 项探针。
- 设计与运维细节：`docs/sync.md`、`docs/deployment.md`。

---

## 七、实施顺序与完成状态

1. **第一阶段：桌面端 v1.0.x**（已完成）——吸附、缩入、动效、优先级、角落 bug 修复。
2. **第二阶段：Monorepo + packages**（已完成）——三个共享包 + workspaces + 桌面重构接入。
3. **第三阶段：v1.1.0-web**（已完成）——v0.1 核心 + v0.2 Swiss UI / 同步 / 移动适配 / 上线。
4. **第四阶段：v1.1.0-an**（已完成）——Expo 工程 + 核心功能 + HTTP 同步 + APK。
5. **第五阶段：云同步体系**（已完成）——shared-logic 合并、sync-bridge 服务、桌面 SFTP、三端配对。
6. **第六阶段：硬化与运维**（已完成）——桥 CORS、nginx 自托管、移动端响应式、8 项 bug 修复、文件清理、文档补齐。
7. **第七阶段：AI 待办管家与验收收尾**（进行中）——阶段 A–G、B-1/B-2、B-3 spike、B-4 QA 三项已完成；阶段 F 手测 F-1/F-2/F-3 通过、F-4 部分、F-5 跳过、F-6 仅静态；纸片 §16 实测跳过（未验证项保持未验证）；移动端通知/手势/小组件已实现并出 APK，待真机验收。

---

## 八、变更记录

- 2026-01-20：初版规划创建；确认移动端 React Native + TS；自动缩入四边、闲置 5s + 开关。
- 2026-01-22：v1.0.3 完成（吸附优先级、悬停弹出、弹出后无法移动）；遗留右上角循环弹出问题。
- 2026-01-31：Monorepo 搭建；v1.1.0-web v0.1 完成（含白屏修复）；v1.1.0-an 完成（EAS + 自包含构建）；shared-logic 改 ESM 输出；系统性代码优化与文档更新。
- 2026-10-09：桌面 Swiss Precision UI 移植；进程监测 Phase 0-3（自动完成 + 日志）；SFTP LWW 同步（提交 850ebfe、fc9d37a）。
- 2026-10-10：手机端 M1（HTTP 同步 + Swiss UI）；桌面同步修复；sync-bridge 服务上线（提交 396ee34）。
- 2026-10-11：
  - Web 端移植 Swiss UI + HTTP 同步 + 详情编辑 / 删除，构建通过并上线；
  - sync-bridge 增加 CORS（OPTIONS 预检 + ACAO），云端部署验证 9/9；
  - 放弃 Vercel / Netlify，改 nginx 自托管（index.html / sw.js no-cache、assets immutable）；
  - Web 移动端适配（≤640 / ≤380px 媒体查询、触屏长按拖拽、iOS 安全区）；
  - 修复 8 项审查 bug：同步「启用」开关、nginx 缓存策略、StrictMode 吞首拍定时器、触屏长按拖拽、详情弹窗编辑 / 删除、触屏禁选、删除 monitor 死 CSS、删除 -webkit-app-region 残留；
  - 仓库文件清理（日志 / tsbuildinfo / docs 旧稿 / vercel·netlify 配置）；
  - 文档体系补齐：根 README、docs/{architecture,sync,deployment}.md、三端 + 桥 + packages README、本文档状态刷新（该批工作于 2026-10-18 随本轮提交入库）。
- 2026-10-18：桌面端到点纸片提醒上线（新增 remindAt / remindLeadMs / reminderSettings 字段、每秒到点扫描与补弹队列、全屏透明 overlay 纸片手势「完成/稍后/丢纸篓」、提醒设置「当前提醒」面板、npm run reminder:integration 15 项集成检查）；界面文案精简、置顶提级 screen-saver、静止纸片 14px/s 游走（修复边缘死锁与 reduce-motion 短路）；README 与 docs/architecture.md 同步，docs/evidence/paper-reminder-rebuild/ 证据入库，五项门禁全绿。
- 2026-10-24：桌面端 AI 待办管家全量落地（任务书阶段 A–G）——DeepSeek 工具循环 + 提案确认卡（批量串行确认、取消改要求/跳过、两档详细程度）、串行对话流与循环提醒时刻选择（推进保时刻）、本地 whisper 语音转文字（官方 v1.9.2 exe + ggml-small-q5_1 模型，hf-mirror 下载带 sha256 校验，打包只含 exe 不含模型）、AI 监测判定（开关默认关，8s 超时降级，抽屉内问/小窗双路径）；§8 手工剧本自动化验收 39 项断言（scripts/ai-acceptance.cjs），ai-smoke 增语音场景；五项门禁 + ai:smoke + ai:acceptance 全绿。
- 2026-10-25：
  - AI 交互三改：小SOU 改名、提案卡 ai-pop 动画、语音 whisper `-t 8` 与识别进度（提交 `ba7c2a3`）；
  - 修复 invoke 应答与流式 chunk 跨通道竞态导致的双气泡（`mergeIntoLastAssistant`）；
  - 页脚同步按钮回流防重叠、主窗口 minWidth 460（`7299763`）；
  - 阶段 F 门禁/打包勾选与自动化验收证据（`b051dc4`）；收尾计划定稿 + QA 37 项审计台账回填（`b552158`）。
- 2026-10-30：
  - B-1 抽屉对话跨重载持久化 + 终态卡折叠一行（`9a1f42b`）；
  - B-2 批量删除合并清单与原子提交：多条删除一张清单卡、勾选原子落盘、失败/过期保留整组（`06513ae`）；
  - B-3 SenseVoiceSmall spike：3 夹具 × 5 轮，中位 2.1–2.3s vs whisper 7.1–7.9s（提速 3.3–3.4×）；**拍板路线 A：双后端共存**（默认 whisper，SenseVoice 快速模式；集成另立批次，落地前补真实中文待办语音对比并署名 FunASR 许可）；证据与无头门禁入库（`56ace55`）。
- 2026-10-31：
  - 阶段 F 手测：F-1 打字全链路通过，期间修复 remindAt 时区（ISO 带偏移由主进程解析）、取消未移出主进程队列、新会话残留终态卡、「在吗」模型臆测旧卡（`2374429`）；F-2 语音往返通过；F-3 进程预填通过，修复进程上下文 60→200 截断（`82dc138`）；
  - F-4 监测三态部分完成：ask（抽屉内询问）/ keep / 用户裁决 complete 已见；四种降级用户决定跳过；F-5 三种降级跳过；F-6 仅静态核对令牌色/直角/发丝线，主观视觉未确认；纸片 §16 实测用户决定跳过，未验证项保持未验证；
  - B-4 QA 三项修复：U-4 重试来源、U-7.4 窄屏 60px、F-5 生成中锁卡（`110d958`）；AI 验收 60/60、桌面 79、共享 105、桥 13、提醒 15/15；
  - 手机端三步增强：本地到期提醒（expo-notifications、权限/渠道、shared-logic 排程、设置弹窗、点击进详情）、左滑完成/删除/稍后、Android 只读小组件（Kotlin provider + 数据桥）；shared-logic 114 项测试通过，APK 构建通过（`docs/evidence/mobile-enhancements/2026-10-31-build.md`），**待真机验收**；
  - 清理测试待办；移动端增强进入已排期（本地通知 / 小组件 / 滑动手势三选一，先出调研对比）。
- 2026-11-01：手机端增强收尾修复——提醒开关/权限/已排数收敛到 `ReminderContext`（设置弹窗不再各自维护状态）、通知点击处理后清除 last response、滑动手势改用 ref 最新回调、已完成待办显示「恢复」并禁用稍后、小组件刷新切主线程；应用图标按桌面端 H 标重制（白底黑 H 红块，方形/圆形/自适应），通知小图标/强调色补齐；重打 APK（60,323,400 bytes，sha256 `a6202de9…`)；根测试/shared/mobile tsc 通过，真机验收待做。
