# AI 助手抽屉实施任务书

配套设计：`2026-10-18-ai-assistant-drawer-design.md`（决策与契约以该文为准，本文件只管“怎么做、按什么顺序、怎么验收”）。

原则：每阶段结束跑对应门禁；UI 一律复用 Swiss Precision 令牌与既有组件类；不新增同步字段；key 与模型文件永不入库。

---

## 阶段 A：AI 网关与动作内核（无 UI）

**目标**：主进程能带着待办上下文调通 DeepSeek 工具循环，写动作只出“提案”不落盘，读动作立即回填。

**文件**
- 新增 `src/main/ai-tools.ts`：`validateCreate / validateUpdate / validateDelete / stageProposal / commitProposal / rejectProposal`；纯函数校验 + 同步写 electron-store（LWW meta、墓碑、`order` 规则）+ `push('sync:merged', …)`
- 新增 `src/main/ai-service.ts`：系统提示与上下文装配（待办≤100 条、分组、进程展示名前 60、本地时间与时区、历史≤20 条/30k 字符）、SSE 解析、工具循环（读立即执行 / 写暂存提案）、校验错误回填重试 ≤2、60s 超时、AbortController
- 新增 `src/main/ai-settings.ts`（或并入 index.ts）：`aiSettings` 读写（key 掩码回读）
- 修改 `src/main/index.ts`：注册 `ai:chat` `ai:stop` `ai:commit` `ai:reject` `ai:settings:*`，均校验 sender
- 新增 `src/main/ai-tools.test.ts`（并入根测试脚本）

**验收**
- 单测覆盖：create/update/delete 校验分支（时间在过去、分组不存在、目标已删）、commit 二次校验失败、reject 零写入、`order` 取值与墓碑字段
- `scripts/ai-smoke.cjs`：mock SSE（含工具调用分片）跑通“提问 → list_todos → 回答”与“提问 → create_todo 暂存 → commit”两条链
- 门禁：`npx tsc --noEmit`、`npm run lint`、根 `npm test`

## 阶段 B：抽屉 UI 与流式对话

**文件**
- 新增 `src/renderer/components/AiDrawer.tsx`、`Icons.tsx` 新增 AI 图标、`App.tsx` 底栏 `.foot-ai` 按钮与开合状态
- 新增 `src/renderer/styles` 段落（并入 `index.css`）：`.ai-drawer .ai-msg-ai .ai-msg-me .ai-stream .ai-notice .ai-err`，只用既有令牌，直角+发丝线
- preload / `electron.d.ts` 暴露 `ai.chat/stop/commit/reject/settings`

**验收**
- 挤压式布局（主列表宽度随之变化）、窄窗 300px 分支；流式逐字 + 停止按钮生效；无 key/断网顶部提示但输入框可用
- 纯打字路径（本阶段不带语音）完成“加一条明天 9 点报销” → 卡片流预留位置（阶段 C 接）
- 门禁：`npx tsc --noEmit`、`npm run lint`、`npm run build`

## 阶段 C：确认卡与写操作闭环

**文件**
- 新增 `src/renderer/components/AiProposalCard.tsx`：create/update 卡（字段可编辑，复用 `.form-group`/`.modal-footer`）、delete 卡（signal 红标注目标 + 二次确认）、状态行（待确认/已创建/已取消/数据已变化）
- 进程建议：卡片区仅当提案带 `monitor` 时出现，复用 `MonitorSection` 的字段呈现（开关、exe、阈值），exe 可改可清空

**验收**
- 新增可改后创建、取消零写入；修改 before/after 并排；删除必须二次确认；非法 exe 主进程拒绝并回模型重试；提交后主列表与云同步字段一致（`updatedAt/deviceId` 正确）
- 门禁：阶段 A 单测 + `npm run reminder:integration`（不得回归）

## 阶段 D：本地语音识别

**文件**
- 新增 `src/main/voice-service.ts`：WAV 头、临时文件生命周期、spawn whisper、退出码与超时（音频时长×3 封顶 30s）
- 新增 `resources/whisper/`（exe + 下载脚本，模型文件 gitignore）与 `scripts/fetch-whisper-model.ps1`
- 渲染层：麦克风按钮、16k PCM 采集与 WAV 拼装、`ai:voice` 调用、下载进度条（`.ai-voice-model`）
- `voice-service` 暴露 `getVoiceModelStatus / startVoiceModelDownload`，接 `ai:voice-model`

**验收**
- 首启下载（镜像 URL+sha256 固化进代码）、进度/重试/失败可见；未就绪麦克风置灰；识别文字进输入框可改可删
- `npm run ai:smoke`（新增脚本）用夹具 wav 断言包含预期词；打包产物含 whisper exe、不含模型
- 门禁：`npx tsc --noEmit`、`npm run lint`、`npm run build`

## 阶段 E：AI 监测判定

**文件**
- 修改 `src/main/monitor-service.ts`：达标/退出两处触发点前挂开关与 8s 超时降级
- 修改 `src/main/ai-service.ts`：`requestMonitorVerdict`（非流式、小 max_tokens、独立超时）
- 渲染层：抽屉内询问卡（算完成/保留 → `ai:monitor-answer`）+ 系统行记录判定理由；抽屉未开时走既有 `presentAskWindow`（文案带 AI 理由）

**验收**
- 三态逐条手测：完成/询问/拿不准；断网、无 key、超时、开关关 = 原规则行为；询问时抽屉开→抽屉问、抽屉关→小窗问，均不漏
- 门禁：`npm run reminder:integration` + 手动清单

## 阶段 F：设置、验收与交付

**文件**
- 新增 `src/renderer/components/AISettingsModal.tsx`（复用 `.sync-modal` 布局）：key 掩码、测试连接 chip、模型下拉、监测开关、语音模型状态；入口在抽屉顶部齿轮
- 文档：设计文/本任务书勾选、`docs/architecture.md` 补主进程模块表、README 功能矩阵加一行、`DEVELOPMENT_PLAN.md` 变更记录
- 证据：`docs/evidence/ai-assistant/`（对话截图、卡片截图、监测三态、语音往返记录、smoke 输出）

**验收清单（逐项勾）**
- [ ] 打字建/改/删待办全链路，删除二次确认，取消零写入
- [ ] 语音往返（说话 → 文字可改 → 发送 → 卡片 → 落盘）
- [ ] 进程预填：提到“打原神”类描述能在卡片区给出 exe 且可改
- [ ] 监测三态 + 降级矩阵全绿
- [ ] 无 key / 断网 / 模型未下载三种降级可用（打字路径完好）
- [ ] UI 对照 Swiss 规范：直角、发丝线、令牌色、无说明性段落
- [x] 门禁五件套：`npx tsc --noEmit` / `npm run lint`（0 警告）/ `npm run build` / 根 `npm test` / `npm run reminder:integration` —— 2026-10-24 全绿（另 `ai:smoke` 通过、`ai:acceptance` 39/39），证据 `docs/evidence/ai-assistant/gates-2026-10-24.md`
- [x] 打包 `npx electron-builder --win nsis` 产物内含 whisper exe、不含模型与 key —— `release/win-unpacked/resources/whisper` 含 exe + 14 DLL、0 个 `.bin`、无 key

## 阶段 G：串行确认对话流与循环提醒时刻选择（设计 §13）

**目标**：卡片内联对话流、确认后零等待推进下一条、取消走「改要求/跳过」、设置两档详细程度、循环提醒所有入口只选时刻且推进保时刻。

**文件**
- `src/main/ai-tools.ts`：`stageProposalBatch`（逐条校验、原子入队、summary 随提案）；队列轮到显示时续 TTL（`refreshProposalExpiry`）；单条 commit/reject 语义不变
- `src/main/ai-service.ts`：新模型工具 `stage_batch`（entries≤10，三变体，schema 强制）；系统提示改写（N>1 总览轮必须一次入队；promptLevel 档1/档2 分别约束；档2 缺字段先集中问）
- `src/main/index.ts` + `preload.ts` + `electron.d.ts`：`ai:queue:list`；`ai:settings:get/set` 支持 `promptLevel`
- `packages/shared-logic/src/todo-utils.ts` / `reminder.ts`：`calculateNextDueDate` 锚定上一轮 `nextDueDate` 保时刻；toggle/advance 调用点传锚
- `src/renderer/components/AiDrawer.tsx`：条目流状态机（文本/卡片/系统行）、队列推进（确认→就地终态→放出下一条）、取消问句行 `[改要求][跳过]`、挂载时 `ai:queue:list` 重建
- `src/renderer/components/ReminderSection.tsx` / `SwissTimePicker`：循环模式=时刻+提前量（`type` 判定），一次性保持原交互；Add/Edit/AI 卡三入口传参
- `src/renderer/components/AISettingsModal.tsx`：详细程度 SwissSelect（1/2）
- 单测：`ai-tools` 批量原子性/续 TTL、`todo-utils` 保时刻推进（日/周/月/自定义/月尾）、promptLevel 进 prompt（纯函数化可测）

**验收**
- 多条描述 → N>1 总览 → 逐条确认就地 ✓已创建 → 自动放出下一条 → 结尾 `完成 N · 跳过 M` 系统行；单条无总览
- 取消 → 问句行 → 跳过继续 / 改要求打字 → AI 原位替换该条
- 档2 缺字段先集中问、答完出卡；档1 不反问
- 循环提醒三入口只选时刻；完成一轮后提醒仍是原 HH:MM（单测+手测）
- 关抽屉再开队列续走；重启后队列重建
- 门禁五件套 + 新增单测 + CDP 手工清单（设计 §13.4）

## 参数表（实现时以代码为准回填）

| 项 | 值 | 出处 |
| --- | --- | --- |
| DeepSeek 端点 | `https://api.deepseek.com/chat/completions` | `ai-service.ts` |
| 流式总超时 | 60 s | `ai-service.ts` |
| 工具校验重试 | ≤2 次 | `ai-service.ts` |
| 提案过期 | 10 min | `ai-tools.ts` |
| 监测判定超时 | 8 s | `monitor-service.ts` |
| 录音上限 | 60 s | `AiDrawer.tsx` |
| 历史截断 | 20 条 / 30k 字符 | `ai-service.ts` |
| 批量入队上限 | 10 条/轮，整批原子 | `ai-tools.ts` |
| 队列 TTL | 单条 10 min，轮到显示时续期 | `ai-tools.ts` |
| promptLevel | 1（默认）/ 2 | `ai-settings` |
| 提醒推进锚 | 上一轮 `nextDueDate`（保时刻） | `shared-logic/todo-utils.ts` |
| 待办上下文 | 100 条（超丢最旧已完成） | `ai-service.ts` |
| 进程上下文 | 展示名前 60 | `ai-service.ts` |
| 语音模型 | `ggml-small-q5_1` ≈190MB（HF 无 q5_0，已改 q5_1；URL+sha256 固化） | `voice-service.ts` |
| whisper 超时 | 音频时长×3，下限 10 s（模型加载）、封顶 30 s | `voice-service.ts` |

## 已知风险

1. `deepseek-flash` 流式工具调用的分片行为需实测（回退：工具轮非流式、纯文本轮流式）
2. 模型下载依赖 hf-mirror 可用性（失败给手动下载说明路径）
3. 监测判定的“AI 理由”写进 ask-window 文案需控制长度（限 120 字）
4. 本地 whisper 对中英夹杂口音的准确率属主观验收项，不达标再考虑换 medium 量化（约 500MB，设置里可切）
5. 模型不遵从 `stage_batch`、退回一次一条 → 退化路径=现有单条行为，功能不坏只是无总览；prompt 与 schema 双约束，验收时观察
6. 队列在应用重启后半途 → `ai:queue:list` 重建兜底；全丢只影响未确认卡（未落盘，零脏数据）
