# 2026-10-19 全量复检修复计划（逻辑 · 界面 · 手感）

> 来源：2026-10-19 全量复检（3 个并行子代理审查 + 人工逐行核实关键项）。
> 范围：v1.0.0 桌面端（AI 抽屉/提案卡/AI 设置、Add/Edit 弹窗、ReminderSection、paper-lab）。
> 状态：**计划待评审**；本文件不改代码。用户已批准"全都修"，按本文档分批执行。
> 已完成的前置修复见 §0.2（无需重做）。

---

## 0. 背景

### 0.1 复检结论概览（§7 核实后修订）
| 类别 | P0 | P1 | P2 | 备注 |
|---|---|---|---|---|
| 逻辑 | 4（L-1~L-4） | 2（L-5、L-8） | 1（D-3） | ~~L-6/L-7~~ 核实为设计预期，已撤销 |
| 界面 | 2（U-1~U-3） | 7（U-4~U-9、U-11 归 P2 前的 U 系列） | 4 | U-10 收窄为嵌入组件 id 冲突（P2） |
| 手感 | 2（F-1、F-2） | 6（F-3~F-7） | 3（F-8~F-10） | F-7/F-8 含决策点 |
| 文档/测试 | — | — | 5（D-1、D-2、D-4~D-6） | |

### 0.2 复检期间已修复（本轮前置，已提交）
- `5dda4ac` 加纸时重排网格避免纸片重叠（修复 `e259fae` 引入的冒烟回归；`paper:smoke` 23/23 恢复）。
- `e259fae` 删纸不重置位置 + 纸团 z=24（pos-check 13/13px 验收通过）。

---

## 1. 总原则与工程约定

### 1.1 修复原则
1. **最小改动、不改产品语义**：只修缺陷，不顺手重构；每条改动可独立解释。
2. **单一真相**：跨进程计算（如 nextDueDate）落在主进程一个入口，渲染层只透传。
3. **向后兼容**：ai-flow 状态、存储结构只加可选字段；老数据/恢复路径不破坏。
4. **先核实后动手**：子代理报告项（标 📄）落地前必须读到代码现场，回填准确行号（§7）。
5. **涉及共享组件（SwissTimePicker / GroupSelect / ReminderSection / time-picker.css）时，主界面同步验收**，因为 Add/Edit 弹窗与 AI 提案卡共用。

### 1.2 门禁基线（每批完成后必跑，全绿才算完）
```powershell
# 在 D:\todo\HengSch\v1.0.0
cmd /c "npx tsc --noEmit 2>&1"     # PS5.1 下必须 cmd /c 包裹
npm run lint
npm run build
npm run paper:build
npm run paper:smoke                 # 期望 {"checks":23,"passed":23}
npm test                            # 49 项
# 在 D:\todo\HengSch（根）
npm test                            # workspaces + bridge + check:shared，0 fail
# 辅助验收（改到相关模块时）
npm run reminder:integration        # 期望 15 项；跑完还原 evidence（见 1.3）
node scripts/ai-smoke.cjs           # 期望 "ai-smoke ok"
npx electron C:\Users\hengxing\AppData\Local\Temp\opencode\paper-pos-check.cjs   # 期望 pass:true（改 paper-lab 时）
```
- 修改 `packages/shared-types` 后必须 `npm run sync-shared && npm run check:shared`。
- PS5.1 纪律：多行输出用 `Out-File -Encoding utf8` 落盘再读；跨文件写用编辑工具，禁 `(Get-Content)|Set-Content`。

### 1.3 提交与证据纪律
- **每个批次**：完成 → 全量门禁 → 向用户汇报 → **用户确认后**才 commit（前缀沿用 `fix(paper-lab)/fix(desktop)/feat(desktop)` 中文单行风格）。
- 跑 `reminder:integration` / `paper:smoke` 后 evidence 被重写：`git checkout -- docs/evidence/`，并删除产生的 `failure-debug.png` 之类新文件，保持工作区只含源码改动。

---

## 2. 批次总览

| 批次 | 内容 | 主要文件 | 风险 | 依赖 |
|---|---|---|---|---|
| **一** 逻辑 P0/P1 | L-1~L-8 | Add/Edit modal、ai-tools/index、ai-service、ai-flow、AiDrawer、paper-lab/App | 中（跨进程） | 无 |
| **二** 界面 | U-1~U-13 | index.css、AiProposalCard、GroupSelect、ReminderSection、time-picker | 中（共享组件） | 批次一（U-3 依赖 L-2 的 busy） |
| **三** 手感 | F-1~F-10 | AiDrawer、App.tsx(foot-ai)、index.css | 中（抽屉布局结构） | 批次一/二（反馈态复用） |
| **四** 中低危+文档+测试 | D-1~D-6 | AISettingsModal、ai-service、设计文档、测试 | 低 | 尽量最后（部分与前三批同文件） |

---

## 3. 批次一：逻辑（P0/P1）

### L-1 循环待办 nextDueDate 锚点错误 [P0] ✅（落地方案已按核实修正）
- **现象**：新建的循环待办"下一次到期"立刻是 now 而非下一次提醒目标时刻；编辑提醒时间后 nextDueDate 不跟随 → 重复任务时间漂移（完成→重开时 `calculateNextDueDate` 用错锚点推进，HH:MM 漂移）。
- **根因**（已核实）：`AddTodoModal.tsx:76` 写死 `nextDueDate: Date.now()`；`EditTodoModal.tsx` 全文不更新 `nextDueDate`。正确语义在 `ai-tools.ts:202`（create：`nextDueDate = remindAt + remindLeadMs`，无提醒则 `ctx.now`）与 `:243`（update：remindAt 变则 `target + remindLeadMs`；清除提醒保持锚点，见 `ai-tools.test.ts:167`），均有单测。
- **方案**（修正：落点在 shared-logic，不是主进程 handler——主进程没有 addTodo 业务层）：
  1. `packages/shared-logic/src/reminder.ts` 新增纯函数 `nextDueFromReminder(remindAt: number | undefined, leadMs: number | undefined, now: number)`，公式与 `ai-tools.ts:202/243` 完全一致；`ai-tools.ts` 改为调用它（单一真相）。
  2. `AddTodoModal` 提交循环任务时用该函数（替换 `Date.now()`）；`EditTodoModal` 在 `remindAt` 变化时同步、清除提醒时保留原锚点。
  3. v1.0.0 已依赖 `@hengsch/shared-logic`（package.json:29、TodoContext 已 import），渲染层直接可用；**改 shared-logic 后必跑 `npm run sync-shared && npm run check:shared`**。
- **验收**：
  - 单测：新函数（有提醒/无提醒）+ Add/Edit round-trip；复用 G1 既有测试样式（`todo-utils.test.ts:71` 锚定语义）。
  - 手工：Add 建"每天 23:00 循环"→ config 中 `nextDueDate` = 今天 23:00（目标时刻）而非 now；Edit 改 08:30 → 跟随；完成→重开 → 次日 08:30。
- **风险**：`calculateNextDueDate`（`todo-utils.ts:37`）消费端不受影响（它读存储锚点）；本条只修锚点写入。

### L-2 AI 确认无 in-flight 锁 + markCard 可覆写终态 [P0] ✅
- **现象**：双击"创建"→ 待办已建成功，但第二发 commit 报"已过期"→ 卡片从"已创建"翻红成"数据已变化/错误"→ 用户以为失败再点 → 重复建待办。删除二次确认（armed 后）同路径。
- **根因**（已核实）：
  - `AiDrawer.tsx:156-166` `handleConfirm` 全程无防抖/禁用，catch 里按报错正则（`过期|已被删除|不存在|已变化`）直接 `markCard(...,'stale'|'error')`。
  - `ai-flow.ts:126-133` `markCard` 无状态守卫（对照 `commitCard:83`、`rejectCard:98` 都查了 `pending`）。
  - `AiProposalCard.tsx:403` 按钮 `disabled={settled || isStale}` 只在**结果回来后**才生效。
- **方案**：
  1. **入口锁**：`AiDrawer` 维护 `committingRef: Set<entryId>`；`handleConfirm` 已在集合中直接 return；`finally` 移除。卡片侧新增 `busy?: boolean` prop → `disabled={settled || isStale || busy}`，按钮文案变"确认中…"。
  2. **终态守卫**：`markCard` 只允许 `pending → stale|error|任意`；`committed/rejected` 状态一律不覆写（原样返回 state）。`error` 卡再点确认允许覆盖为新结果（重试语义）。
  3. **抑制误报**：catch 中若该卡已非 pending（守卫命中不改），同时跳过 notice 展示（避免"明明成功却弹错误"）。
  4. 删除两段式确认的第二段按钮同样接 `busy`。
- **验收**：
  - 单测（ai-flow）：`markCard` 对 committed 卡无效；对 pending 卡生效；双击序列（commit→第二次 reject 路径）后卡为 committed。
  - 手工 CDP/真机：连点创建，卡最终停在"已创建"，无红色覆盖、无重复待办。
- **风险**：`staleByData`（`AiProposalCard.tsx:126`，基于 updatedAt 的数据侧判定）是独立显示逻辑，不受守卫影响——保持原样。

### L-3 paper-lab `act()` 成功路径不清 busy/pending [P0] ✅
- **现象**：提醒条上点"完成/稍后"成功后组件仍认为 busy → 后续交互（start/drag/Escape/drift）全被拦，永久卡死。当前靠父级 500ms 删样本/换 key 掩盖，属潜伏死锁。
- **根因**：`paper-lab/App.tsx` `act()`：`busy.current = false` 与 `setPending(false)` 只在 catch（约 222 行）；成功分支（约 215-217 行）只 `setDetail(false); setLeaving(action)`。对照正确实现 `ReminderSettingsModal.tsx:54-58`（`.finally()`）。
- **方案**：`act()` 改 `.finally(() => { busy.current = false; setPending(false); })`，catch 只负责 `setError`；确认 `leaving` 动画结束有复位路径（现由父级卸载兜底，补 `animationend/onAction 完成后 setLeaving(null)` 更稳）。
- **验收**：手工（demo 模式慢速下）：act 成功 → 同一纸片可再次点开；无父级删除路径的场景（若有）不死锁。tsc/lint/paper:smoke/pos-check 全绿。
- **风险**：`leaving` 复位若过早会闪回原位——以动画结束回调为准，勿在 finally 里直接清 `leaving`。

### L-4 `ai:chat` 无并发闸门 + `activeRun` 单槽被后完成者置空 [P0] ✅
- **现象**：快速连发两条消息 → 两个 run 并发/交叉，流式内容互相污染；先完成的 run 把 `activeRun` 清空，后完成的 stop/收尾失效。
- **根因**（已核实 `ai-service.ts:495-526`）：`runAiChat` 入口无 `activeRun` 检查，508 行无条件覆盖槽位；520 行 `finally` **无条件** `activeRun = null`（先完成者清掉后启动者的槽）；525 行 `stop` 依赖该槽。
- **方案**：
  1. 入口闸门：`if (activeRun) return { proposals: [], error: 'AI 正在生成中，请先停止或等待完成' }`（该函数错误走返回值不抛异常，保持风格一致）。
  2. 收尾守卫：`if (activeRun === controller) activeRun = null`；`cancelAiChat` 不变。
- **验收**：单测/ai-smoke：并发第二发得到明确中文错误；A 先启动 B 后启动、A 先结束时 B 仍可被 stop。

### L-5 `promptLevel` 非法值静默保留旧值 [P1] ✅
- **根因**（已核实 `ai-service.ts:66`）：`patch.promptLevel === 2 ? 2 : patch.promptLevel === 1 ? 1 : current.promptLevel` —— 非法值静默吞掉。加载路径 `:46` 归一化是安全的，保持不变。
- **方案**：写入路径校验两档枚举，非法 → 抛中文错误回前端显示；AISettingsModal 展示该错误（与 D-1 保存反馈衔接）。
- **验收**：单测：非法值抛错且现值不变；合法值生效。

### L-6 ~~AI 队列过期清理与重启语义~~ [已撤销：核实为设计预期] ✅
- **核实结论**：
  1. **重启清零是设计**：提案是主进程内存 Map（不落盘）；任务书 137 行明文"队列重启后半途 → `ai:queue:list` 重建兜底；全丢只影响未确认卡（本就未落盘，零脏数据）"。
  2. **"过期不清理"是设计**：任务书/设计 §13 "单条 10 min TTL，**轮到显示时才起算/续期**（长队列不误杀）"；`ai-service.ts:531` commit 时校验过期并删；`refreshProposalExpiry`（547）touch 续期；`listQueuedProposals`（555）不过滤是**故意**（恢复后由首个显示卡的 touch 自动续期，`AiDrawer.tsx:97-105` 效果链已核实闭合）。
- **处置**：不修。残留小点（内存 Map 在用户长期弃置时不驱逐）随进程退出消失，记入 §9 不做。

### L-7 ~~touchedRef 单槽~~ [已降级 P2：核实为设计预期，可选微改] ✅
- **核实结论**：任务书 93 行"队列轮到显示时续 TTL（`refreshProposalExpiry`）"——串行首条 touch **就是设计**；`refreshProposalExpiry` 幂等（只是重盖 expires，重复无害）。"重挂载重复 touch"仅多延长一次 TTL，无功能影响。
- **处置**：不改行为。可选：`touchedRef` 换 module 级 `Set` 防重复续期（收益极小，批次四顺手做或不做）。

### L-8 `replace`/amend 分支 reject 失败静默 [P1] ✅（代码已核）
- **现象**：改要求流程里 `ai.reject` 是 fire-and-forget（`AiDrawer.tsx:123` `.catch(() => undefined)`），失败时队列其实没出队，界面无感。
- **方案**：catch → `setNotice({kind:'error', text:'原提案移除失败…'})`（或主进程 reject 幂等化，落地定）；与 F-5 的改要求模式条一起改。

---

## 4. 批次二：界面（P1/P2）

### U-1 `.ai-stream` 流式光标缺失 + 孤儿 CSS [P1] ✅
- **根因**：`AiDrawer.tsx:281` 挂 `ai-stream` 类；`index.css` 全文无 `.ai-stream`（已 grep 核实）；设计 §6 要求"尾部 2px 光标方块闪烁"。另有 `.ai-typing`/`.ai-send` 孤儿检查（`.ai-send` 存在且在用；`.ai-typing` 落地 grep 决定删或补）。
- **方案**：补 `.ai-stream::after { content:''; width:2px; height:1em; background:var(--signal); animation: blink 1s steps(1) infinite }`；流结束由"是否还带 ai-stream 类"自然控制（流结束即不渲染该节点）。清理真孤儿类。
- **验收**：肉眼：生成中尾部闪烁方块、结束后消失。

### U-2 提案卡四态不可分 + error 文案错 [P1] 📄+✅
- **根因**（已核实 `AiProposalCard.tsx:131-133`）：committed/rejected 同吃 `.ok` 同色；error 兜底显示"待确认"且无 class；卡片根节点（249/202）不带状态 class；无 ✓/✕ 图标（设计 §13.0 要求）。
- **方案**：
  1. `statusLabel`：error → "确认失败"；stale → "数据已变化"（保持）；committed → "✓ 已创建/已更新/已删除"；rejected → "✕ 已取消"。
  2. `statusClass`：committed `ok`、rejected `muted`、error/stale `bad`；根节点 `className={'ai-card ' + statusClass}`，CSS 用边框/底色区分（微弱，不抢内容）。
  3. 补 `.ai-status` 图标样式（纯 CSS 字符，不引图标库）。
- **验收**：五态截图肉眼可分；`npm test` 内若有 label 断言同步更新。

### U-3 settled 死表单：disabled 不可见、分组/提醒仍可点 [P1] 📄
- **根因**：input `disabled={settled}` 但 `.form-group input` 无 `:disabled` 样式；`GroupSelect.tsx:4-9`、`ReminderSection.tsx:14-19` **无 disabled 参数**，终态卡里仍可点开面板改（改了无效）。
- **方案**：
  1. CSS：`.ai-card input:disabled { opacity:.55; background:var(--paper-2); cursor:not-allowed }`。
  2. `GroupSelect` / `ReminderSection` 增加可选 `disabled?: boolean`（默认 false，主界面不受影响）；`AiProposalCard` 传 `settled || isStale || busy`。
  3. 终态卡是否折叠成单行摘要：**属设计变更**，本批不做，单独提给用户决定（记入 §9）。
- **验收**：终态卡所有控件点不动且样式灰化；主界面 Add/Edit 的分组/提醒不受影响（reminder:integration 15 项回归）。

### U-4 错误条无关闭/重试 [P1] 📄
- **方案**：`.ai-err` 行加 ✕（清 `notice`）；对"服务异常/超时"类错误附"重试"按钮 = 用 `lastSentRef`（`sendMessages` 调用前存 `toChatMessages(next)`）重发。停止类 info 不带重试。
- **验收**：报错 → 点 ✕ 消失；点重试原样重发并流式回来。

### U-5 消息区滚动条未并入设计系统 [P2] 📄
- **方案**：`index.css:1902` 附近 webkit scrollbar 规则加 `.ai-msgs`。
- **验收**：8px 发丝线滚动条与全站一致。

### U-6 `[流程]` 脚手架长句直接进用户气泡 [P1] 📄
- **根因**：`AiDrawer.tsx:144-147` 把 `[流程] 重新暂存这条待办（原：…）。新要求：…` 整串作为 user 消息入库并渲染。
- **方案**：`ai-flow` 的 text entry 增加可选 `display?: string`（入库/发模型仍用完整 content，`toChatMessages` 不变；渲染优先 `display`）。向后兼容：老数据无 display 回退 content。
- **验收**：气泡只显示用户原话；模型仍收到含 [流程] 前缀的完整指令（流式日志/单测确认）。

### U-7 对话流排版微调组 [P2] 📄
一次小改集合，均为 CSS/小结构：
1. `.ai-sys` 上下加 hairline 分节（区别于普通消息）。
2. `.ai-card` 背景改 `--paper-2` 或加 2px ink 左条（操作对象权重 > 气泡）。
3. `.ai-msg-ai` 补左 2px `--signal` 竖线（设计 §6）。
4. 抽屉打开时 `.modal-overlay` 整窗居中偏移问题：先量化（抽屉 360px 挤压布局），用 `.app-main` 内居中或 overlay 左偏，二选一，避免弹窗"歪"。

### U-8 时间面板/分组菜单被 overflow 裁剪 [P1] 📄
- **根因**：`.tp-panel`（time-picker.css:40-45）与 `.group-select-menu` 向下展开，位于 `overflow-y:auto` 的消息列表内，近底部被裁。
- **方案**（共享组件，主界面同用）：打开时测下方空间，不足则加 `.up` 类向上翻转；两处组件都做。回退方案：打开时 `scrollIntoView({block:'nearest'})`。
- **验收**：卡片贴近底部时点"提醒时间/分组"，面板完整可见；主界面 Add/Edit 弹窗内同样正常（reminder:integration + 手工）。

### U-9 提醒面板的 backdrop/Escape 关掉整个弹窗 [P1] ✅
- **现象**：Add/Edit 里打开时间面板后点遮罩或按 Esc，整个弹窗被关（应只关面板）。
- **根因**（已核实）：`AddTodoModal.tsx:43-55` window 级 keydown：`isOpen` 时任意 Esc 直接 `handleClose()`；`:101` overlay `onClick=handleClose`。`SwissTimePicker.tsx:59` 只有 capture-phase pointerdown 外点关面板，无 Esc、不拦事件冒泡（Swiss* 组件内 grep 无任何 Escape/stopPropagation）→ 面板开着时 Esc/遮罩双层都关到底。
- **方案**：面板开合状态上提（`ReminderSection`/`SwissTimePicker` 加可选 `onOpenChange` 回调）；弹窗层 Esc/遮罩逻辑判"面板开着先关面板"。EditTodoModal 同步改（同模式）。
- **验收**：Esc 一级级退（面板 → 弹窗）；遮罩点击同理；AI 卡片内同组件行为一致。

### U-10 固定字符串 id 冲突 [已降 P2 并收窄：弹窗之间不冲突，冲突在卡片内嵌组件] ✅
- **核实结论**：`AddTodoModal.tsx:98` `if (!isOpen) return <></>` —— **关闭时不挂 DOM**，Add/Edit 永不共存（打开一个必然先关另一个），"两个弹窗 htmlFor 撞车"不成立。**真实冲突**：`AiProposalCard` 内嵌 `ReminderSection`（固定 id `reminder-enabled/reminder-time/reminder-lead`）常驻抽屉，与打开的 Add/Edit 弹窗同页共存 → label `htmlFor` 指错、点 A 焦点进 B。卡内自有字段已用 `${uid}-` 前缀（`AiProposalCard.tsx:274+`），只有内嵌 Section 组件是固定 id。
- **方案**（收窄）：`ReminderSection`、`SwissTimePicker`、`SwissSelect`、`GroupSelect`、`MonitorSection` 全部改 `useId()` 前缀（Add/Edit/卡三处调用方自动受益）；Add/Edit 自己的 `htmlFor="title"` 等无需改（不共存），但 `document.getElementById('title')`（`AddTodoModal.tsx:62`）保留现状即可。
- **验收**：抽屉开着 + Add 弹窗开着 → 点"提前量"label 焦点进弹窗内的 select（而非卡片内）；reminder:integration 回归。

### U-11 自定义提前量输入与显示脱节 [P2] ✅
- **根因**（已核实 `ReminderSection.tsx:101-109,154-165`）：`handleCustomMinutes` 在**每个键击**就 `emit`（"3"→3 分钟先落一次、"30"→再落一次）；解析失败时只 `return` 但 `customMinutes` state 已更新 → 输入框显示与实际 lead 脱节；`leadKey` 由 `value.remindLeadMs` 反推，初值可能与 `customMinutes` 初始 state 不一致。
- **方案**：自定义输入改为"失焦/Enter 提交"（校验 ≥0 才 emit）；`customMinutes` 初值从 `value.remindLeadMs` 派生，显示与 emit 同源；非法输入内联提示不提交。
- **验收**：输入 30 失焦 → chips/存储都是 30；键入过程中不落半截值；非法输入有提示且值不变。

### U-12 循环任务"下次提醒跨天"无提示 [P2] 📄
- **方案**：`ReminderSection`/详情处对 recurring 加一行 mono 小字："明天 08:30 再次提醒"（用 `calculateNextDueDate` 的渲染层轻量版或 IPC 查）。属增强，做最简版。
- **验收**：循环任务能看到下次时刻；一次性任务不显示。

### U-13 消息无时间戳 [P2] 📄
- **方案**：`ai-flow` text entry 加可选 `at?: number`（`appendText` 打点，老数据可空）；渲染 `YOU/AI` 角标后 mono 10px `HH:MM`。
- **验收**：新消息有时间戳；恢复的队列文本无时间戳不报错。

---

## 5. 批次三：手感（P1/P2）

### F-1 强制吸底滚动，长回复无法回看 [P1] ✅+📄
- **根因**（已核实 `AiDrawer.tsx:90-93`）：`[flow, stream, notice]` 每次变化（流式每 delta）都 `scrollTop = scrollHeight`，无"用户在底部"判断。
- **方案**：
  1. 变化前测 `atBottom = scrollHeight - scrollTop - clientHeight < 48`。
  2. 仅 `atBottom || 首个流式块 || 用户刚发送` 时吸底（发送/流起用 `behavior:'smooth'`）。
  3. 不在底部且有新内容（流式或新卡）→ 显示"↓ 回到最新"浮标，点击滚到底。
  4. `open` 变 true 时显式滚到底（顺带修"重开位置不定"）。
- **验收**：AI 长回复中往上翻 → 不被拽回；新消息浮标出现；点它回底；发送后自动到底。

### F-2 点击→终态之间零反馈（无 loading/spinner）[P1] ✅+📄
- **根因**：`handleConfirm` await 期间卡片无任何状态（全站 CSS 无 spinner keyframes，grep 核实）；诱发连点（联动 L-2）。
- **方案**：
  1. 承接 L-2 的 `busyIds`：按钮变"确认中…"、禁用、卡片加 `.is-busy` 微弱边框脉冲（`@keyframes` 一次补全，供复用）。
  2. `sendMessages` 期间（首 token 前）：见 F-4 的占位气泡。
  3. spinner 不做通用组件，只做这两处的 CSS 动效（最小面）。
- **验收**：点创建 → 立刻看到"确认中…"→ 变"已创建"；期间按钮点不动。

### F-3 抽屉开合 0 过渡 + 不自动聚焦 + 重开滚动不定 [P1] 📄
- **根因**：`display:none ↔ flex`（index.css:720-732）硬切，整列瞬间挤窄 360px；`open` effect（AiDrawer:62-88）无 focus/scroll 逻辑（唯一 focus 在 amend，185 行）。
- **方案**：
  1. 抽屉常驻 DOM：`flex-basis: 0 → 360px`（`transition: flex-basis .24s var(--ease)`）+ 关闭态 `visibility:hidden; pointer-events:none; aria-hidden`。**保留**窄屏（index.css:716-718）强制隐藏逻辑——该媒体查询下直接 `display:none` 不参与过渡。
  2. `open` 变 true：`inputRef.focus()` + 滚到底（与 F-1 合并一处 effect）。
  3. 关闭态抽屉内不可 Tab 进入（`visibility:hidden` 天然挡住，验收 tab 序）。
- **验收**：开/关列宽平滑过渡；打开即可打字；窄屏行为与现状一致；无控制台错误。

### F-4 生成中回车静默 / 空输入可点 / 首 token 前死寂 [P1] 📄
- **方案**（`AiDrawer.tsx` submit/send 区）：
  1. busy 时回车：`setNotice({kind:'info', text:'正在生成中，先停止或等本次完成'})`（区别于静默 return）。
  2. 空输入：发送按钮 `disabled={!input.trim() || busy}` + CSS 降透明。
  3. `busy && !stream`：渲染"…"骨架气泡（三点 keyframes），首 delta 到来即被真流替换。
- **验收**：三种场景各有明确反馈；正常发送路径不受影响。

### F-5 改要求模式不可见、无退出口、在途可点跳过 [P1] 📄
- **方案**（`AiDrawer` + `.ai-ask` 区）：
  1. 输入区上方模式条：`正在改要求：{原条目标题} ✕`，✕ = 清 `replaceRef` + `setAmending(false)`（卡保持 pending，新入口）。
  2. `sendMessages` busy 期间：`.ai-ask` 两按钮（改要求/跳过）与卡片操作一并禁用。
  3. L-8 的 reject 失败 notice。
- **验收**：模式始终可见可退；生成中点跳过无反应（禁用态可见）；气泡里 [流程] 长句按 U-6 只显原话。

### F-6 发送/停止/关闭按钮缺 active 与过渡（死按钮感）[P2] 📄
- **方案**：`.ai-send/.ai-stop/.ai-drawer-close` 补 `transition: background .15s ease, color .15s ease` 与 `:active { transform: translateY(1px) }`，对齐 `.button:active`（index.css:1566）。
- **验收**：与全站按钮手感一致。

### F-7 AI 入口无"后台在跑/待确认"提示；compact 模式入口消失 [P1] ✅（产品意图待用户拍板）
- **根因**（已核实 `App.tsx:237-270`）：footer（含 `foot-ai`）整个被 `!isCompactMode` 门控；compact 只渲染 `compact-add` 快速添加条（272+），AI/同步/提醒设置入口全部消失；`AiDrawer` 仍挂载但 CSS（index.css:716-718）强制隐藏。`.foot-ai` 只表示开/关（252-260），busy/待确认信息在抽屉内部，App 无从显示。
- **方案**：
  1. `AiDrawer` 新增可选回调 `onActivityChange({busy, pendingCount})`（busy/pending 变化处调用）；`App` 存状态 → `.foot-ai` 加小圆点（busy 脉冲、pending 数字角标）。
  2. compact 模式是否保留 AI 入口 → **问用户**（§11 决策点 D-A）；若保留，最小改法是 compact 条上加一个同款图标按钮并放开抽屉的 compact 隐藏。
- **验收**：常规模式关着抽屉能看到 busy/待确认信号；按决策结果验收 compact。

### F-8 输入框固定 2 行 + 无清空会话入口 [P2] ✅（队列语义已核、待用户拍板）
- **核实结论**：任务书/设计文档均**无**"新会话"定义（grep 会话/清空/重置无相关命中）；既定事实是"消息流本就不持久化，重启只丢已显示历史"（设计 §13.2）。队列语义与 L-6/L-7 绑定（内存暂存、轮到显示续期）。
- **方案**：
  1. textarea auto-grow：`rows=2` 起步，input 时调高、6 行封顶。
  2. "新会话"按钮（头部）：清 text 条目；队列卡默认**保留**（只清对话文本）——**问用户**确认（§11 决策点 D-B）。不做 `rebuildQueue` 全量重建（会与本地已显示卡重复）。
- **验收**：长文可全见；新会话后文本历史消失、卡片队列按决策语义保留。

### F-9 新条目硬出现（全站唯一无动画区）[P2] 📄
- **方案**：`.ai-card, .ai-msg-user, .ai-msg-ai, .ai-sys` 加 `animation: ai-in .18s var(--ease)`（opacity 0→1 + translateY(4px)→0）；尊重 `prefers-reduced-motion`（已有 reduce-motion 体系则挂同类开关）。
- **验收**：出现动效柔和、不与滚动打架（配合 F-1）。

### F-10 抽屉开着时 Add 弹窗对中偏移 [P2] 📄
- 并入 U-7 第 4 条处理（同一布局问题），不单开。

---

## 6. 批次四：中低危、文档与测试（P2）

- **D-1 `saveSettings` 连点竞态**：AISettingsModal 保存中禁用按钮 + 成功/失败提示（可回滚提示按原样保留）。
- **D-2 stage 重入无提示**：主进程 `stageProposalBatch` 在队列已有未决时返回明确"已有 N 条待确认"而不是静默排队/覆盖（落地按任务书语义定）。
- **D-3 `calculateNextDueDate` DST 漂移/500 轮上限** ✅（位置已核）：实现就在 `packages/shared-logic/src/todo-utils.ts:37-52`——500 轮上限耗尽后静默返回 `base`（可能是过去时刻）；DST 风险在 `stepCycle` 的日历步进（1-29 行，落地时读 body）。方案：上限行为显式化（注释 + 测试锁定"返回最后一步"）；用固定 TZ 环境变量补 DST 用例（如 `TZ=America/New_York` 下 3 月/11 月切换日推进保时刻）。改 shared-logic 后 `sync-shared` + `check:shared`。
- **D-4 队列恢复竞态** ✅（现场已核）：`AiDrawer.tsx:71-84`——`queueList()` 异步回来时，若用户已先发消息staging 了本地卡（`entries.some(kind==='card')` 为真）则**整个跳过** rebuild → 队列里未显示的提案留在主进程 Map、界面上永远不出卡。窗口窄（open 后到 queueList resolve 之间用户已交互）但真实。方案：改为按 proposal id 合并（本地已有则跳过该条，缺的补进队列尾），或 open 后首次发送前先 await restore。落地选改动小者 + ai-smoke 补场景。
- **D-5 设计文档修订**：`2026-10-18-ai-assistant-drawer-design.md` §4 与实现漂移处、`ai:stage` 通道说明（实际是 `ai:chat` 内嵌 stage）按现状回写；**只改描述、不改语义**。
- **D-6 测试补齐**：L-1（nextDueDate 对齐）、L-2（markCard 守卫/双击序列）、L-4（并发闸门）、L-5（promptLevel 校验）四个单测进 `npm test`。

---

## 7. 落地前核实结果（2026-10-19，已全部完成）

| # | 项 | 核实结论 |
|---|---|---|
| 1 | L-4 | ✅ 确认：`ai-service.ts:508` 无闸门覆盖槽位、`:520` finally 无条件清空。方案改为"返回 error 结果"（该函数不抛异常）。 |
| 2 | L-5 | ✅ 确认：`:66` 非法值静默保留旧值；加载路径 `:46` 安全不动。 |
| 3 | L-6 | ❌ **撤销**：重启清零 + 过期不主动清理均为任务书明文设计（内存暂存、轮到显示续期、commit 时校验）。 |
| 4 | L-7 | ❌ **降级 P2**：串行首条 touch 是任务书设计（93 行）；`refreshProposalExpiry` 幂等，重复无害。 |
| 5 | L-1 落点 | 🔧 **修正**：主进程无 addTodo 业务层；`calculateNextDueDate` 在 `@hengsch/shared-logic`（v1.0.0 已依赖）。方案改为 shared-logic 新增纯函数 + 渲染层直用。create/update 精确公式取自 `ai-tools.ts:202/243` + 单测。 |
| 6 | U-2/U-3 | ✅ 确认：根节点无状态 class（202/249）；CSS 无 `input:disabled`、无 `.muted`；按钮 `:disabled` 样式齐全（927+）。 |
| 7 | U-8/U-9 | ✅ 确认：Swiss* 组件无任何 Escape 处理；Add/Edit window keydown + overlay onClick 直接关整窗（`AddTodoModal.tsx:43-55,101`）。 |
| 8 | U-10 | 🔧 **收窄**：弹窗关闭即卸载（`:98`），模态之间不冲突；真实冲突是卡片内嵌 `ReminderSection` 固定 id 与弹窗共存。改 useId 贯穿共享组件即可。 |
| 9 | U-11 | ✅ 确认：每键击 emit + 解析失败只 return → 显示/实际脱节（`ReminderSection.tsx:101-109`）。 |
| 10 | F-7 | ✅ 确认 compact 无 footer 只有快速添加条（`App.tsx:237,272`）；是否给 compact 加 AI 入口 = 决策点 D-A。 |
| 11 | F-8 | ✅ 任务书/设计**无**"新会话"定义；默认"只清文本保留队列" = 决策点 D-B。 |
| 12 | D-3 | ✅ 500 轮上限在 `shared-logic/todo-utils.ts:45`，耗尽静默返回 base；DST 看 `stepCycle`。 |
| 13 | D-4 | ✅ 竞态真实：`AiDrawer.tsx:71-84`，queueList 回来时本地已有卡则整体跳过重建。 |

原则不变：批次执行中若现场与本文档不符，**先更新本文档再动手**。

---

## 8. 最终验收清单（全部批次完成后）

1. 门禁全绿（§1.2 全套）+ `reminder:integration` 15 + `ai-smoke` + `paper:smoke` 23 + `pos-check`（改了 paper-lab 才跑）。
2. 手工剧本（AI 抽屉全流程）：
   - 发送 → 流式闪烁光标 → 长回复可回看（浮标出现）→ 停止/重试可用；
   - 提案卡：双击创建不翻红、四态可分、终态控件锁死、错误条可关/可重试；
   - 改要求：模式条可见可退、[流程] 气泡只显原话、生成中 ask 禁用；
   - 关抽屉（过渡动画）→ 入口有角标 → 重开自动聚焦+定位最新；
   - 循环待办：新建/编辑后 nextDueDate 正确、有"下次提醒"提示。
3. 回归面：主界面 Add/Edit（Esc/面板/分组/提前量）、reminder 设置面板、paper-lab 交互（拖/揉/扔/键盘/reduce-motion）。
4. 工作区干净（evidence 还原）、逐批提交经用户确认。

## 9. 明确不做 / 需用户另行决定
- 终态提案卡折叠成单行摘要（设计变更，见 U-3）→ **决策点 D-C**。
- 通用 spinner 组件 / 图标库引入（保持最小 CSS 动效）。
- L-6/L-7 相关的队列"过期清理/重启恢复"行为改动（核实为设计预期，不动）。
- 弃置队列条目的内存驱逐（随进程退出消失，收益≈0）。

## 10. 风险与回滚
- **共享组件改动**（U-8/U-9/U-10/U-11、disabled 贯穿）是最大回归面 → 每条都跑 reminder:integration + 主界面手工。
- **shared-logic 改动**（L-1、D-3）→ `sync-shared` + `check:shared` 必跑，v1.1.0-an 副本同步。
- **抽屉结构改动**（F-3 display→flex-basis）影响布局与 tab 序 → 单独验收窄屏媒体查询与 focus 可达性。
- **ai-flow 可选字段**（display/at）→ 恢复路径与 `toChatMessages` 单测兜底。
- 每批独立 commit，出问题按批回滚；evidence 永远不进 commit（除非用户明确要）。

## 11. 待用户拍板的决策点（批次对应实现前回答即可）
| 编号 | 问题 | 默认（不答按此执行） | 影响 |
|---|---|---|---|
| D-A | compact（窄窗）模式要不要保留 AI 入口？ | **不保留**（维持现状，只修常规模式角标） | F-7 |
| D-B | "新会话"按钮是否清空卡片队列？ | **只清对话文本，队列保留** | F-8 |
| D-C | 终态（已创建/已取消）提案卡要不要折叠成一行摘要？ | **不折叠**（只做 U-3 的禁用样式与锁定） | U-3 |
