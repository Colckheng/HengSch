# 设计：到点飘纸提醒（桌面端）

日期：2026-10-14
状态：已确认 v4（v3 后两轮修复：纸片窗 `screen-saver` 级置顶防主窗置顶压制、回收站移入 `#papers` 统一层叠；攒团动画改为折痕剪影多边形变形，弃用 feTurbulence 位移）
范围：桌面端（v1.0.0 Electron）为主；数据模型动 `packages/shared-types`（三端类型跟随，Web/手机端无 UI 不消费）
前置：无

## 背景

待办目前没有任何截止时间/提醒字段（`nextDueDate` 已定义但无消费方），主进程无到点扫描。本设计新增：添加待办时可设提醒时间，到点后纸片在桌面飘出，通过一套"纸"的隐喻手势处理。

## 1. 数据模型（`packages/shared-types`）

`TodoItem` 新增字段（可选，向后兼容，LWW 正常参与同步）：

```ts
remindAt?: number;      // 实际提醒触发时间戳（已扣除提前量的绝对时间）
remindedAt?: number;    // 最近一次弹出时间（防同一次提醒反复弹）
remindLeadMs?: number;  // 该待办选用的提前量（0=到点；循环待办完成时用它重算下一周期）
```

- `remindAt` 存绝对时间：单次待办创建/编辑时一次算好；改动到点时间或提前量时重算；
- `remindedAt` 在每次纸片弹出时盖章 `now`；snooze 或改时间时清空，允许再弹；
- 判定规则：`now >= remindAt` 且（`remindedAt` 为空 或 `remindedAt < remindAt`）→ 该弹；
- 循环待办：完成时按 `remindLeadMs` 把 `remindAt` 重算到 `nextDueDate - remindLeadMs` 并清 `remindedAt`；
- Web/手机端只透传字段，不做任何 UI。

桌面端 electron-store 新增键（不进同步）：

```ts
reminderSettings: {
  defaultLeadMs: number;    // 全局默认提前量，默认 10 分钟
  catchupAllMissed: boolean; // 启动补弹是否含历史（默认 false，只补今天）
}
```

## 2. 添加/编辑待办 UI

- 表单在监测区之后新增「提醒」区块：
  - 开关：启用提醒（默认关）；
  - 启用后显示：**Swiss 时间弹层（纯点选）**（自研 `SwissTimePicker`，共享于 `src/shared-ui/time-picker-core.ts` + `time-picker.css`：日期行 ◀ 今天/明天/后天 ▶ 翻天 + 0–23 小时 6×4 网格点选 + 分钟 −5 步进与 00/15/30/45 快捷芯片 + 已选大数字预览；默认 now+1h）+ 提前量选择（到点 / 提前 5 / 10 / 15 / 30 分 / 1 小时 / 自定义…；自定义分钟输入跟随全局默认提前量回显）；
  - 循环待办额外显示一行说明文案「完成后将按同样提前量提醒下一周期」；
- 提交时算出 `remindAt = 选中时间 - 提前量`、`remindLeadMs = 提前量`；编辑时同规则重算并清 `remindedAt`；
- 快速添加（小窗模式）不加提醒入口，保持轻量。

## 3. 主进程触发（新 `src/main/reminder-service.ts`）

- `initReminderService(store, onDue)`：启动即扫 + 30s `setInterval` 扫描；
- 扫描逻辑：读 store 全量待办（含墓碑过滤、`status === 'pending'`），按 §1 判定规则筛出该弹的；并发上限 **4 张**，超出进 FIFO 队列，每处理完一张（完成/扔掉/snooze 都算处理）出下一张，出队间隔 800ms 防糊脸；
- 弹出时盖 `remindedAt = now` 并写回 store（走渲染层已有 todo 更新通道或主进程直写 store，二选一，实现时定——倾向主进程直写 + 广播刷新）；
- **启动补弹**：`app ready` 后首扫时，对 `remindAt` 已过的项额外过滤：`catchupAllMissed=false` 时只收 `remindAt >= 今天 0 点` 的；应用未运行期间的错过项不做 schtasks 级追补（YAGNI）；
- 退出清理：`before-quit` 里 `stopReminderService()` 清定时器。

## 4. 纸片窗口（新 `src/main/paper-window.ts` + `paper.html` 渲染层）

复用 `ask-window.ts` 的窗口模板思路，但形态不同：

- **窗口**：每显示器一个全屏透明无边框置顶窗口（`transparent: true, frame: false, alwaysOnTop: true, skipTaskbar: true, hasShadow: false`），创建后 `setAlwaysOnTop(true, 'screen-saver')` 提级——主窗口开着「窗口置顶」(floating) 且聚焦时会压过 floating 级纸片窗；默认 `setIgnoreMouseEvents(true, { forward: true })` 鼠标穿透；悬停命中纸片/卡片/垃圾桶时切回可点击，移出再穿透；
- **纸片外观（拟物便签，v3）**：约 224×138 直角卡片、**1.5px 灰色描边**（#9a958a）、纸白底、双层投影（近实 2px 硬偏移 + 远虚 12px 软）、纸纤维纹理（细噪点 + 斜向纤维两层）、右下翻起折角（小三角+投影）、左上磨砂半透明红胶带（附装订孔）、粗体标题 2 行截断、等宽时间（月日 时:分）、分组色为底部 2px 细线；
- **飘动**：每张纸独立正弦漂移轨迹（相位、速度随机错开，限速 40px/s 级）+ **±2° 慢摆**（`--sway` 变量）；单击命中区域 = 纸片矩形；
- **单击 → 展开**：详情卡对齐 ask-window 语言（2px ink 边、红方块 + `DUE NOW` 眉标、粗体标题、等宽时间、描述折叠 3 行、Swiss `.button` 三按钮）——
  - **完成**：IPC 回主进程 → 标记 completed（循环待办推进下一周期并重算 remindAt）→ 纸片消失；
  - **稍后提醒**：竖排 hairline 分隔行菜单 10 分钟后 / 1 小时后 / 3 小时后 / 明天 9:00 / 自定义…（自定义 = 内嵌 Swiss 时间面板，与主窗同款纯点选）→ 改写 `remindAt`、清 `remindedAt` → 纸片收回、进队尾；
  - **收起**：卡片缩回原位变回纸片继续飘；
- **长按（500ms）→ 抓起**：纸片跟手；此后所有指针位移计入攒团进度（累计路径长度，满 **800px**）→ **折痕剪影变形（v4）**：12 顶点 clip-path 多边形按每次抓取随机的收拢系数向心错位收拢（锯齿折痕轮廓）+ 斜向折痕线浮现 + 随 `--c` 单向旋转（±8–16°，开抓随机方向）+ 微缩 + drop-shadow 跟随剪影；攒满 → **预备放大 1.06 → 加速收紧**（200ms JS 补间 `--s` 至 0.57）→ 切纸团态弹性回弹（`ball-snap` `--s` 1.15→1 带旋转惯性 `--ball-spin` 转正）成**不规则多边形纸团**（52px，clip-path 三选一随机、分组色底 + 折痕渐变面片）；**中途松手：展平、进度/剪影/旋转复位、恢复飘动**；攒满后成团跟手，可再抓起拖动；（v2 的 feTurbulence+feDisplacementMap 位移已弃用——大面积位移是水波/融化感，非折纸）
- **回收站（线稿垃圾桶，v3）**：屏幕右下角大号线稿垃圾桶（Swiss 1.5px 描边，无容器方块）+ 下方 `DISCARD` 眉标，仅当有纸在场时淡入上移；纸团靠近 → 图标变 signal-red 并上跳 4px；拖入 → 纸片飞向图标中心缩小销毁 → 语义 = **只关提醒**：`remindedAt = now` 写回，待办保持 pending；**DOM 必须放在 `#papers` 内**（`#papers` 是 `position:fixed` 独立层叠上下文，回收站放外面根层 z50 会永远压过内层 z60 的按住纸片）；层叠序：按住/抓取纸片 60 > 回收站 50 > 详情卡 40 > 飘动纸片 auto；
- **并发**：同屏最多 4 张（含展开/被抓状态），其余排队；处理完一张 800ms 后放下一张；
- 多显示器：v1 只在主显示器出纸（YAGNI 后续）。

## 5. 设置入口

- 主界面 footer 同步按钮旁加「提醒设置」按钮（铃铛图标）→ 打开新的 `ReminderSettingsModal`：
  - 默认提前量（到点/5分/15分/1小时/自定义）；
  - 补弹范围开关：「启动时补弹更早错过的提醒」（默认关）；
- 保存写 electron-store `reminderSettings`，立即生效（下轮扫描应用）。

## 6. 同步与兼容

- 三个新字段参与 LWW 全量合并，无协议改动；旧端（未升级的 Web/手机）合并时字段原样保留（合并是整记录级，只要旧端不写该记录就不丢；旧端若编辑同一条待办会整记录覆盖丢字段——属已知可接受降级，升级后自愈）；
- 墓碑待办不弹；被删分组的待办照常弹（分组仅决定纸片底色）。

## 验证

1. 门禁：根 `npm test`（shared-logic 合并用例补 remindAt 相关 2-3 项）+ 桌面端 `npx tsc --noEmit` + `npm run lint`；
2. dev 手动：
   - 设 now+1min 提醒 → 到点纸片飘出，主界面该待办出现"已提醒"弱标记（小铃铛角标）；
   - 单击展开 → 完成/snooze/收起三路各自生效；snooze 后到新时间再弹；
   - 长按→拖动→松手（未成团）→ 展平整张；长按攒满 800px → 成团 → 拖入垃圾桶 → 待办仍 pending 且当天不再弹；
   - 两条同时到点 → 并发 2 张各自飘；第三条到点排队；
   - 重启应用：弹过且处理的不再弹；今天错过没弹过的补弹；昨天错过的默认不补；
   - 循环待办（每天+提前10分）完成 → 次日到点再弹；
3. 回归：monitor 询问小窗、同步、托盘不受影响（新服务独立 init/stop）。

## 不做的事（YAGNI）

- 应用未运行期间的计划任务追补（schtasks 弹纸）；
- 提醒声音/系统 Toast 回退；
- 多显示器出纸、纸片穿透到全屏游戏（`alwaysOnTop` 层级用 default 即可）；
- Web/手机端提醒 UI 与推送；
- 到期未处理升级为系统通知；
- 纸片自定义皮肤/便签内容编辑。
