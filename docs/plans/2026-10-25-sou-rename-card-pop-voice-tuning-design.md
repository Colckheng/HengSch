# 设计：小SOU 改名 · 卡片弹出动画 · 语音提速与识别反馈

日期：2026-10-25 ｜ 状态：用户已确认 ｜ 前置：任务书阶段 A–G 已交付（`b051dc4`）

## 背景与实测

1. 用户要求把「AI 管家」改名「小SOU」（UI + AI 自称，文档功能名不动）
2. 卡片弹出要求有动画——实际已有 `ai-in`（`index.css:1286`，0.18s 上移 4px）但太轻不可感，且 `.ai-ask`（取消问卡/监测询问卡）不在动画列表里
3. 语音识别慢——实测（11s 夹具、small-q5_1、空闲）：whisper 默认仅 4 线程 8s；`-t 8` 物理核 5s（-37%）；满载时 44–78s 为 CPU 争抢所致（见 `docs/evidence/ai-assistant/gates-2026-10-24.md`）

## §1 改名 小SOU

| 位置 | 改动 |
| --- | --- |
| `AiDrawer.tsx` 抽屉标题 | `AI 管家` → `小SOU` |
| `App.tsx` 页脚 AI 按钮 `aria-label`/`title` | `AI 管家` → `小SOU` |
| `AiDrawer.tsx` 对话角色标签（AI 侧 3 处） | `AI` → `小SOU` |
| `ai-service.ts` 系统提示词首句 | `…内的待办管家` → `…内的 AI 助手小SOU`，其余约束不动 |

不改：README/开发计划里的功能名「AI 待办管家」、设置弹窗标题「AI 设置」、空态提示。

## §2 卡片弹出动画（纯 CSS）

- 新 keyframes `ai-pop`：`opacity 0→1`、`translateY(8px→0)`、`scale(0.96→1)`，0.22s `cubic-bezier(0.2,0.9,0.3,1)`，`both`
- `.ai-card`（提案卡）与 `.ai-ask`（取消问卡、监测询问卡）改用 `ai-pop`；`.ai-msg-me/-ai`、`.ai-sys` 保持 `ai-in` 轻淡入
- `.ai-ask` 补进现有 `prefers-reduced-motion: reduce` 屏蔽列表
- 验收：卡片入场有可感弹出；`prefers-reduced-motion` 下无动画；`ai:acceptance` 渲染层零错误

## §3 语音提速与识别反馈

**提速**（`voice-service.ts` spawn 参数）：

- 加 `-t N`，`N = max(4, floor(os.cpus().length / 2))`（本机 16 逻辑核 → 8 物理核）
- 加 `-pp` 启用进度输出

**反馈链路**：

- 解析子进程 stderr 三阶段：`load_backend` →「加载模型」；`read_audio_data` →「识别中」；`whisper_print_progress_callback: progress = N%` → 钳制到 0–99（whisper 有 >100 的已知 bug，实测报 272%）
- `push('ai:voice-transcribe-progress', { phase: 'load'|'decode'|'progress', percent? })`
- `preload.ts`/`electron.d.ts` 暴露 `onVoiceTranscribeProgress`
- 渲染层：mic 忙态在现有 spinner 旁显示 `识别中 47%`；收不到 percent 时保底显示阶段词（加载模型/识别中）
- 结束/失败时推送 `{ phase: 'done' }` 并复位

**回归**：`npx tsc --noEmit` / `npm run lint` / 根 `npm test` / `ai:smoke`（voice 场景断言不变）/ `ai:acceptance` 39 项；任务书参数表回填线程与进度两行。

## 风险

1. `-pp` 进度值失真（钳 99 后短音频会瞬间跳满）——保底有阶段词，可接受
2. 线程公式取逻辑核一半，极端机型（4 逻辑核）下限 4 与现状一致，无回退风险
