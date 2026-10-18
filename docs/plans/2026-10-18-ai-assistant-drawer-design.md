# 设计：主窗口 AI 助手抽屉（待办管家 · 本地语音 · 智能进程与监测判定）

状态：**已确认**（2026-10-18，用户逐段确认）
配套实施计划：`2026-10-18-ai-assistant-taskbook.md`

适用范围：Windows 桌面端 `v1.0.0`。三端业务字段不变，不新增同步字段；AI 相关配置仅存本机。

---

## 1. 已确认的决策（用户逐条选择）

| 议题 | 决策 |
| --- | --- |
| 架构 | 本地语音识别 + 云端 DeepSeek 解析（全云端 ASR、全本地 LLM 均否决） |
| 供应商 | DeepSeek（用户已有 key），语音自行打包实现 |
| 触发形态 | 主窗口**侧边抽屉**（非独立小窗、非全局快捷键喊话） |
| 职责 | 待办管家：增删改查 + 智能建，不做通用闲聊 |
| 写操作 | 新增/修改**出卡可改**后确认；**删除必须二次确认**；查询直接答 |
| 进程智能选择 | AI 从运行进程列表预填建议，卡片可改，不确认不生效 |
| AI 辅助监测 | 规则触发后由 AI 判定结论（完成 / 问一句 / 拿不准则按原规则） |
| 输入方式 | **文本输入为主路径**，麦克风是可选补充，识别文字回落输入框可改再发 |
| UI | 与现有一致：Swiss Precision 设计系统，复用既有令牌与组件类 |

## 2. 范围与非目标

**做**：抽屉对话、结构化待办动作、预览确认卡、删除二次确认、进程建议预填、本地语音识别（打字降级可用）、监测 AI 判定（开关）、AI 设置弹窗。

**不做（首版）**：全局快捷键/语音唤醒、对话历史持久化与云同步、系统级通知、多轮并行长任务、自动创建新分组（分组只能从现有列表选，未匹配落“未分类”）、`deepseek-reasoner` 若不支持工具调用则置灰。

## 3. 架构与数据流

**主进程新增**
- `src/main/ai-service.ts`：DeepSeek HTTP+SSE 客户端、上下文装配、工具循环（读工具立即执行、写工具暂存提案）、超时与重试、流式转发
- `src/main/ai-tools.ts`：五个动作的校验与执行器（纯函数优先，模仿 `reminder-command.ts`）；写盘复用既有语义：`updatedAt` 盖当前时间、`deviceId` 用本机 id、删除打墓碑、新增取现有排序规则的 `order`，写后 `push('sync:merged', …)`，渲染层 `MERGE_TODOS` 自然合入，云同步不打架
- `src/main/voice-service.ts`：音频 Buffer → WAV 头 → spawn `whisper-cli.exe` → 文字；模型文件下载管理（国内镜像 + 进度 + sha256 校验）

**渲染层新增**
- `src/renderer/components/AiDrawer.tsx`：侧边抽屉（消息流、流式输出、输入框、麦克风、预览/确认卡）
- `src/renderer/components/AiProposalCard.tsx`：预览确认卡（可编辑字段、创建/取消、删除二次确认）
- `src/renderer/components/AISettingsModal.tsx`：key/模型/语音模型/监测开关
- `src/renderer/components/Icons.tsx`：新增 AI 图标；`App.tsx` 底栏新增 AI 按钮

**数据流一句话**：抽屉发文本（或录音→whisper→文字）→ 主进程带上下文调 DeepSeek → 模型返回工具调用 → 读工具立即回填、写工具生成**提案** → 抽屉渲染确认卡 → 用户编辑后 `ai:commit` 才落盘 → `sync:merged` 广播，列表与云同步一致更新。

**key 安全**：`aiSettings.apiKey` 只存 electron-store，仅主进程读取；渲染层永不接触；不入 git。

## 4. IPC 契约（均校验 `event.sender === mainWindow.webContents`）

| 通道 | 方向 | 载荷 |
| --- | --- | --- |
| `ai:chat` | invoke | `{ messages: {role:'user'\|'assistant', content:string}[] }`，主进程流式应答 |
| `ai:chunk` | main→renderer | `{ delta }` 逐字增量 |
| `ai:done` | main→renderer | `{ proposals: Proposal[], error?: string, usage? }` |
| `ai:stop` | renderer→main | 中断当前请求（AbortController） |
| `ai:proposal` | main→renderer | 写动作暂存结果（通常随 `ai:done` 一起到） |
| `ai:commit` | invoke | `{ proposalId, patch }` → `{ ok, error? }`，编辑后的字段为最终数据 |
| `ai:reject` | invoke | `{ proposalId }` → `{ ok }` |
| `ai:voice` | invoke | `Uint8Array` 音频 → `{ text }` / `{ error }` |
| `ai:settings:get` / `ai:settings:set` | invoke | key、模型、监测开关（掩码读回） |
| `ai:voice-model` | invoke | `{ status: 'missing'\|'downloading'\|'ready', progress?, error? }`；`{ action:'start'\|'retry' }` 触发下载 |
| `ai:monitor-verdict` | main→renderer | 监测事件请求 AI 判定，**8 秒超时**，回 `{ verdict:'complete'\|'ask'\|'keep', reason }` |
| `ai:monitor-answer` | renderer→main | 用户在抽屉的裁决 `{ todoId, answer:'complete'\|'keep' }` |

无 key、断网、超时：主进程回 `ai:done { error }`，抽屉顶部一条提示，**输入框仍可手打建待办**。

## 5. AI 动作与工具

模型可见工具（DeepSeek function calling）：

| 工具 | 行为 | 落盘时机 |
| --- | --- | --- |
| `list_todos` | 读，立即回填结果 | 不落盘 |
| `create_todo` | 校验 → **暂存提案** → 工具结果回“已生成预览卡，等待用户确认” | 用户点“创建”才写 |
| `update_todo` | 校验 → 暂存（before/after 并排展示） | 用户确认才写 |
| `delete_todo` | 校验 → 暂存（列出目标） | 用户**二次确认**才打墓碑 |
| （无独立进程工具） | `create/update_todo` 参数含 `monitor {exeName, auto, askOnExit, thresholdMinutes}`；运行进程展示名列表直接进系统上下文，主进程校验 exeName 必须在当前列表内 | 同卡片确认 |

- 每轮最多暂存 1 个写动作（系统提示约束），保持确认语义清晰
- 校验失败（时间在过去、分组不存在、exeName 不在列表）→ 作为工具错误结果回填模型**自动重试，最多 2 次**；仍失败 → `ai:done` 带错误行，卡片仍展示可手工改
- 上下文：系统提示（角色+字段语义+中文简洁+禁止编造）+ 紧凑待办清单（id/标题/状态/时间/分组/是否有监测，上限 100 条，超出丢最旧已完成）+ 分组列表 + 运行进程展示名（前 60）+ 本地当前时间与时区；历史由渲染层传最近 20 条且 ≤30k 字符
- 提案在主进程暂存（内存 Map，带过期时间 10 分钟），提交时以提案为基线再次全量校验

## 6. UI（Swiss Precision，复用现有设计系统）

- **令牌**：只用 `--paper/--paper-2/--ink/--ink-2/--ink-3/--signal/--hairline/--hairline-strong/--s1..--s4/--ease/--font/--font-mono`；**直角 0 圆角、1px 发丝线、无阴影**（与现有 `.modal-content` 一致）
- **抽屉**：`<aside class="ai-drawer">` 放在 `.app-container` 内、主区 flex **挤压**不覆盖；宽 360px（窗口 ≤760px 时 300px），`border-left: 1px solid var(--hairline)`，底栏 `.foot-ai` 按钮同 `.foot-reminder` 规格；图标在 `Icons.tsx` 新增
- **消息**：不用圆角气泡——AI 消息 `.ai-msg-ai`（`--paper-2` 底、直角、左 2px `--signal` 竖线），用户消息 `.ai-msg-me`（`--ink` 底白字、直角、右对齐）；时间戳 `--font-mono` 10px `--ink-3`；流式输出尾部 2px 光标方块闪烁
- **确认卡**：复用 `.form-group` 字段布局与 `.modal-footer` 按钮规格（黑主按钮“创建/确认”，细线次按钮“取消”）；删除卡用 `--signal` 文案标注目标标题；错误行 mono 小字 signal 红
- **设置弹窗**：复用 `.sync-modal` 的布局（分块标题、label/input、测试连接按钮、状态 chip），key 输入框 `type=password` 掩码显示
- **文案**：界面文字遵守上一轮精简原则——**不写说明性段落**，只留动作标签、状态与错误

## 7. 语音管线

1. 渲染层 `getUserMedia` 采 16kHz 单声道 Float32 → 停止后转 16-bit PCM WAV（渲染层本地拼 44 字节头，不引 ffmpeg），上限 60 秒
2. `ai:voice` 传 Buffer → 主进程写临时文件 → spawn `whisper-cli.exe -l auto -np -f <wav>` → stdout 文字 → 删临时文件
3. 模型：`ggml-small-q5_0`（约 187MB），首启从 **hf-mirror.com**（国内镜像）下载到 `%APPDATA%\hengsch\whisper\`，下载前写死 URL 与 **sha256**（实现时确认并固化，见 §12）；抽屉显示进度与重试
4. 未就绪/下载失败：麦克风按钮置灰 + tooltip“模型未下载”，打字不受影响；识别 1~3 秒转圈，超时/非零退出 → 错误行可重试
5. dev 与打包路径：打包 `process.resourcesPath/whisper/`，dev 用仓库 `resources/whisper/`（gitignore 模型文件，只入库 exe 下载脚本）

## 8. AI 监测判定（设置开关，默认关）

- 现有规则触发点（达标 N 分钟 / 进程退出询问）改为：开关开 → 组包 {待办摘要、进程名、本次运行时长} 请求 `ai:monitor-verdict`，**8 秒超时**
- `complete` → 走现有自动完成路径；`ask` → **抽屉开着在抽屉内问**（AI 理由 + “算完成/保留”两按钮），**抽屉关着降级到现有 ask-window 小窗**（复用壳，文案带 AI 理由）；`keep` → 什么都不做
- `keep`、超时、断网、无 key、解析失败 → **完全按原规则执行**，AI 绝不阻塞监测
- 判定与理由写入对话历史（渲染层系统行），事后可问“刚才为什么算我完成”

## 9. 设置与安全

`aiSettings`（electron-store）：`{ apiKey?, model:'deepseek-chat', monitorVerdictEnabled:false }`
- key 输入掩码、保存即生效、`测试连接` 按钮回 200/401/网络错误 chip
- 端点固定 `https://api.deepseek.com/chat/completions`；`deepseek-reasoner` 提供但实测不支持工具调用则置灰
- 永不 `console.log` key；错误信息里脱敏 Authorization

## 10. 错误与降级矩阵

| 场景 | 行为 |
| --- | --- |
| 无 key | 抽屉顶一条“未配置 AI”，可读历史、可手打建待办 |
| 断网/超时（60s） | 错误行 + 重试按钮；不产生任何写盘 |
| 模型非法输出/工具错误 | 循环内自动回填错误重试 ≤2 次，仍败 → 错误行 + 卡片可手工改 |
| whisper 未下载/失败 | 麦克风置灰或错误行，打字路径完好 |
| 监测判定任何异常 | 按原规则执行（见 §8） |
| 提案过期（10 分钟）/目标已变化 | commit 校验失败 → 卡片标注“数据已变化”，刷新后重试 |

## 11. 测试与验收

- **单测**（`npm test` 并入根测试）：`ai-tools` 校验与落盘纯函数（模仿 `reminder-command.test.ts`）、SSE 增量解析、提案暂存/过期/二次校验
- **冒烟脚本**：`scripts/ai-smoke.cjs`——mock DeepSeek 响应跑工具循环；预制 wav 跑 whisper 断言出字
- **手动验收清单**：抽屉开合与挤压布局、流式输出与停止、打字建待办出卡可改、取消零写入、删除二次确认、进程预填与非法 exe 回退、监测三态、断网/无 key 降级、UI 对照 Swiss 规范
- **门禁**：`npx tsc --noEmit`、`npm run lint`（零警告）、`npm run build`、根 `npm test`、`npm run reminder:integration`（不得回归）
- 证据目录：`docs/evidence/ai-assistant/`

## 12. 开放事项（实现时确认后固化）

- whisper.cpp Windows 可执行文件版本与模型下载 URL、sha256（写死进 `voice-service.ts`，附校验）
- `deepseek-chat` 工具调用与流式工具调用的实测行为（失败则回退非流式单请求）
- 录音在 125%/150% DPI 下的采样不受影响（纯 Web Audio，预期无问题，列验收项）
