# 设计：一次性任务进程监测 + 进程结束询问

日期：2026-10-11
状态：已确认（用户选定方案 A）
范围：仅桌面端（v1.0.0 Electron）

## 背景与目标

现状 `MonitorConfig` 只挂在循环任务上，且只有单一逻辑：进程累计运行 ≥ 阈值 → 自动完成。

用户场景：游戏日常/周常任务。"进程在跑"≠"任务真做了"（可能挂机干别的），自动完成只是初判；进程退出是天然的人工复核时机。

目标：

1. 一次性（once）任务也能绑定监测进程；
2. 每个绑了进程的任务有两个独立开关，可单选可都选：
   - **自动监测**（现有）：累计运行达阈值 → 自动完成 + 通知；
   - **进程结束询问**（新增）：观察到进程退出沿 → 弹窗询问是否完成；
3. 两个都开时**询问结果优先**（方案 A）：弹窗可撤销自动完成。

## 1. 数据结构（packages/shared-types）

```ts
interface MonitorConfig {
  exeName: string;
  thresholdMinutes: number;   // 仅 auto 模式参与判定
  auto?: boolean;             // 默认 true——旧数据兼容，行为不变
  askOnExit?: boolean;        // 默认 false
}
```

- `monitor` 字段从 `RecurringTodo` 提升到 `TodoItem`（所有任务类型可绑定）；
- 旧数据无 `auto`/`askOnExit` 字段 → 按 `auto: true, askOnExit: false` 解释，行为与现在完全一致；
- web/手机端不识别 `monitor`，同步忽略该字段，无影响。

## 2. UI（v1.0.0 renderer）

### MonitorSection

- 解除 `type === 'recurring'` 限制：once 类型的 Add/Edit 弹窗也显示监测区；
- 两个独立复选框：
  - 「自动监测（达时长自动完成）」→ 控制 `auto`；
  - 「进程结束时询问」→ 控制 `askOnExit`；
- 都关 = 解除绑定（`monitor` 置 undefined）；至少开一个才生效；
- 只选「询问」时不显示阈值输入（阈值只对 auto 有意义）；默认值沿用现值 10 分钟；
- 「精确历史日志」开关（journal，全局）保持现有位置与语义，补充提示：不开则应用离线期间错过的退出不会补问。

### TodoCard

- ask-only（`auto` 关、`askOnExit` 开）任务不显示「监测 xx/xx 分钟」徽标；
- 其余保持现状。

### EditTodoModal

- 现状 `monitor: type === 'recurring' ? monitor : undefined` 改为所有类型保留。

## 3. 主进程行为（monitor-service）

### 退出沿检测

- tick（30 秒轮询）中为每个已注册任务记录"上次是否在跑"（内存 Map）；
- 上次在跑、这次不在 → 退出沿（exit edge）；
- 精度 30 秒，可接受。

### 弹窗

- 原生 `dialog.showMessageBox`（不依赖窗口可见，贴边隐藏时也能弹）；
- 按钮：「完成」/「还没做」，默认焦点在「还没做」（防止误触完成）；
- 多任务退出沿排队串行弹，不并发。

### 裁决逻辑（方案 A）

| 退出沿发生时任务状态 | 弹窗语义 | 答「完成」 | 答「还没做」 |
|---|---|---|---|
| 待办（未达阈值） | "做了吗？" | 标记完成 | 保持待办 |
| 已被自动完成（progress.notified） | "真做了吗？" | 保持完成 | **撤销**，回待办 |
| 手动完成（用户自己勾的） | —— | **不弹** | —— |

- 撤销 = 状态改回 pending、清除 completedAt、盖 updatedAt/deviceId 章（与手动切换同一条 TOGGLE 路径）；
- 判定"已被自动完成"依据该任务当日 progress 的 `notified` 标记（notified=true 说明走过自动完成链路）。

### 防骚扰

- 同一天同一任务只弹一次（内存 Set 记录已问 todoId，跨天重置）；
- 进程又起来又退出算新一轮，但当天已问过就不再问；
- 用户答完立即入 Set（含"还没做"答案）。

### auto 链路

- 现有 threshold → notified → notifyCompleted → renderer TOGGLE 完成链路不变；
- 仅注册表 entry 增加 auto/askOnExit 两个标志位；
- `auto: false` 的任务不参与阈值判定（不 auto-complete，但 journal 进度照记）；
- `askOnExit: false` 的任务不做退出沿检测。

## 4. 离线补问（依赖 journal 开关）

- journal 全局开关未开 → 没有离线补问能力，错过就错过；
- journal 开着：应用打开时 bootstrap 已回放当天快照行，顺带判断：
  - `askOnExit=true` 且当天快照显示该 exe 出现过、当前进程已不在、任务仍待办 → 排队补问一次；
- 只读 `dayStart ~ now`（当天）的行，绝不读昨天及更早（防读爆数据）；
- 补问与在线退出沿共用同一"当天只问一次"Set。

## 5. 测试

- **shared-logic 单测**：退出沿检测抽成纯函数（输入：上次运行集合 + 本次运行集合 + 注册表；输出：退出沿列表），补 vitest 用例；
- **弹窗链路**：原生模态不好自动化断言，走 notepad 手动验证清单：
  1. once 任务 + auto：notepad 跑 1 分钟 → 自动完成 + 通知；
  2. once 任务 + ask：起停 notepad → 弹窗，答「完成」→ 完成；答「还没做」→ 保持待办；
  3. both：达阈值自动完成 → 停进程 → 弹窗答「还没做」→ 撤销回待办；
  4. 手动完成的任务停进程 → 不弹窗；
  5. 当天答过一次后再起停 → 不再弹；
  6. journal 开启 + 离线起停 notepad + 重启应用 → 补问一次。

## 兼容性与迁移

- 无数据迁移：旧 `monitor` 字段结构不变，新字段可选缺省；
- 门禁照旧：web tsc+build、桌面 tsc+lint、根 48 单测（新增用例后递增）。
