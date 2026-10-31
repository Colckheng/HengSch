# HengSch 手机端总体设计：通知 → 手势 → Android 小组件

日期：2026-10-31 ｜ 状态：待用户审阅 ｜ 范围：`v1.1.0-an`（Expo 51 / RN 0.74.5 / prebuilt Android）

## 1. 最高前提：各部分风格必须一致

**任何新 UI 都必须沿用现有 Swiss Precision 规范，不允许出现第二套视觉语言。**

- 令牌与组件：**新组件必须复用所在端现有 Swiss 规范与样式**，包括纸感底、次级纸面、墨黑、次级墨灰、信号红、发丝线、mono/Inter Tight 字体及既有字号、间距节奏；不得另造色板或组件风格。桌面参考令牌为 `#FAFAF8 / #0A0A0A / #E63329 / #E5E5E3`；移动端现有 `#FAFAF7 / #111111` 等相近值，**跨端 token 收敛单列为 S0 样式任务，未批准前不改现有界面，不能夹带在功能批次里**。
- 形态：直角、1px 发丝线、无圆角卡片、无阴影、无说明性段落；只保留动作、字段、状态与错误。
- 新组件必须复用现有组件的排版、按钮、输入、Modal、列表项样式，不引入 Material 风格按钮、彩色圆角滑块、iOS 风格侧滑按钮或系统默认配色。
- 设置弹窗与 `SyncSettingsModal` 同构；滑动手势动作条用直角发丝线 + 墨黑/信号红；小组件在 RemoteViews 能力内保持纸底、墨黑字、mono 数字、信号红点缀。**RemoteViews 不能自定义 Inter Tight，使用系统字体/系统 mono，靠底色、直角、间距与数字样式对齐，不能承诺像素级一致。**
- OS 渲染的通知本体不受应用样式控制，文案仍统一为「待办提醒 + 待办标题」。
- **视觉验收是独立门禁**：设置弹窗、滑出动作条、桌面小组件均需截图并由用户肉眼确认；样式不一致不得进入「完成」。

## 2. 目标与非目标

**目标**
1. 本地到期通知：前台/后台/被杀时提醒，点击定位详情，数据变化自动重排。
2. 滑动手势：左滑完成/删除/稍后，保留现有排序、滚动、详情交互。
3. Android 桌面小组件：只读摘要，主屏查看今日待办，数据变更自动刷新。
4. 三步独立交付、独立验收，后一步不阻塞前一步上线。

**非目标**
- iOS、远程推送、通知内「完成/稍后」动作按钮、AI 管家、进程监测、导航/多页重构、Todo 数据模型变更、同步协议变更。
- 小组件上的完成/删除操作；主屏只读，动作仍在应用内完成。

## 3. 现状与约束

- Expo 51 + RN 0.74.5，`android/` 为已生成原生工程；新依赖或原生改动需重新 gradle 构建 / 打 APK。
- 单页 `App.tsx` + Modal；详情由 `detailTodo/isDetailOpen` 控制，无导航库。
- `TodoContext` 持有可见任务与 `isInitialized`；同步合并走 `applySyncedTodos`；AsyncStorage 存配置与 deviceId。
- 业务计算统一放 `packages/shared-logic` 并补 vitest，再 `npm run sync-shared`；移动端只写适配层。
- 通知需 Android 13+ 运行时权限；精确闹钟涉及 `SCHEDULE_EXACT_ALARM`；重启、OEM 省电、系统近似时间均可能影响投递。
- 小组件只能 Android App Widget（Kotlin + RemoteViews），Expo Go 不作为验收环境。

## 4. 总体架构与三步路线

保留现有单页架构与数据模型，只新增三个相互独立的适配层：

| 步骤 | 新增层 | 依赖 | 交付边界 |
|---|---|---|---|
| 第 1 步 通知 | `ReminderProvider` + 调度服务 + shared-logic 排程纯函数 | `expo-notifications` | 前台/后台/被杀提醒、点击详情、重排 |
| 第 2 步 手势 | 列表项手势包装层 | 先 PanResponder，必要时 `react-native-gesture-handler` + reanimated | 左滑完成/删除/稍后，不影响排序/滚动/详情 |
| 第 3 步 小组件 | Kotlin `TodoWidgetProvider` + `WidgetDataBridge` | App Widget / RemoteViews / SharedPreferences | 只读摘要、数据变化刷新、点击打开应用 |

顺序依据：通知价值最高；手势成本最低；小组件原生成本与机型风险最高，放最后。每步独立 commit、独立 APK、独立验收。

## 5. 第 1 步：本地通知 / 到期提醒

### 5.1 排程（shared-logic）
新增 `buildReminderSchedule(todos, now)`：
- 过滤墓碑、已完成、无 `remindAt`、`remindAt <= now` 的项。
- 单次任务：1 条，触发时间 = `remindAt`。
- 循环任务：按 `nextDueDate` 与周期展开未来 7 天；每条触发时间 = `nextDueDate - remindLeadMs`。
- 按时间排序，按 `todoId + 触发时间` 去重，最多 50 条；返回 `{ todoId, title, at }[]`。
- vitest 覆盖：单次、循环、过去时间、墓碑、完成、上限、去重、提前量。
- 超出 7 天的循环不预排，应用启动/回前台时补齐；不把「应用长期不打开也永远准点」作为承诺。

### 5.2 调度服务
`src/notifications/reminderScheduler.ts`：
- `ensurePermission()`：读取/请求通知权限；返回 granted/denied。
- `ensureChannel()`：创建 `reminders` 渠道（高重要性、声音、震动）。
- `rescheduleAll(todos)`：先计算排程；计算成功后才 `cancelAllScheduledNotificationsAsync()` 并逐条 `scheduleNotificationAsync({ content, trigger: { date, channelId } })`；计算失败直接返回错误，**不得先清空旧通知**；写入失败返回可读错误并记录，不能把「已清空但未排上」当作成功。
- `scheduleTestNotification()`：5 秒后一条测试通知。
- 通知内容：标题「待办提醒」，正文 `todo.title`，`data: { todoId }`；图标、颜色与 app 主题一致。
- 精确闹钟权限被拒：接受系统近似时间，设置页显示「使用系统近似时间」。

### 5.3 设置与重排
- 本地设置 `reminders:v1 = { enabled: boolean }`，默认关；开启时请求权限，关闭时清空全部已排通知。
- `ReminderProvider`（位于 `TodoProvider` 与 `SyncProvider` 内）：
  - 初始化完成后，若开启则重排；
  - 待办数组变化，300ms 防抖重排；
  - AppState 回前台重排；
  - 同步合并引起的数据变化复用同一 effect；
  - 开关关闭时清空。
- 不新增同步字段；开关只影响本机。

### 5.4 设置 UI 与点击
- 工具栏新增铃铛按钮，打开 `ReminderSettingsModal`：开关、权限状态、精确闹钟状态、「发送测试提醒」、拒绝提示；样式与 `SyncSettingsModal` 同构。
- 点击通知：读取 `data.todoId`，初始化完成后在 `allTodos` 中查找并打开详情；找不到（已删除/未同步）则忽略；不修改待办状态。
- P0 先验证：10 秒测试通知在前台/后台/被杀的表现，以及重启后是否保留。若重启不保留，启动时重排并在文档明确「重启后未打开应用可能漏提醒」；需要 boot receiver 时单独拍板。

## 6. 第 2 步：滑动手势

- 左滑出现「完成 / 删除 / 稍后 1 小时」；横向位移超过阈值才激活，纵向滚动、点击详情、现有排序入口不受影响。
- 完成复用 `toggleTodoStatus`；删除走现有二次确认；稍后把 `remindAt` 改为 `now + 1h` 并清 `remindedAt`，复用 shared 的提醒命令语义，不另写一套。
- 动作条样式：直角、发丝线、墨黑/信号红；删除用信号红；不出现彩色圆角或系统默认侧滑按钮。
- 先用 PanResponder 做最小实现；若与列表滚动/排序冲突再引入 `react-native-gesture-handler` + reanimated，不预先堆依赖。
- 快速连滑不重复触发；手势进行中不触发点击或排序。

## 7. 第 3 步：Android 桌面小组件

- 新增 Kotlin `TodoWidgetProvider` + RemoteViews 布局 + manifest receiver；用 prebuild 或手动原生配置，不在 Expo Go 验收。
- `WidgetDataBridge`：任务初始化/变更/同步合并后，把 `{ pendingCount, topTitles, updatedAt }` 写入 SharedPreferences（或 JSON 文件）。
- 小组件显示：今日待办数、前 3 条待办标题、更新时间；纸底、墨黑字、mono 数字、信号红点缀；只读，不提供完成/删除。
- 刷新：数据变化时主动 `updateAppWidget`；保留系统周期刷新兜底；点击小组件只打开应用。
- 应用被杀/重启后仍从持久化数据读取；不同密度下布局不溢出。

## 8. 错误处理与边界

- 通知权限拒绝：显示可读提示，允许继续手动建/改/查待办；不反复强弹。
- 精确闹钟拒绝：降级近似时间并提示；不假装准点。
- 通知点击找不到待办：忽略，不崩溃、不新建。
- 排程或通知 API 失败：不清空待办与设置；保留当前列表，显示错误。
- 手势与列表冲突：优先纵向滚动与详情点击；横滑阈值明确；排序入口不被吞。
- 小组件数据缺失：显示 0 条/空态，不显示旧缓存为「已同步」。
- 风格不一致：视为验收失败，不以「功能可用」豁免。

## 9. 测试与验收矩阵

| 类别 | 验收点 |
|---|---|
| 单次提醒 | 2 分钟后到点；前台/后台/被杀均收到；点击进详情 |
| 变更 | 改时间旧不响新响；完成/删除不响；循环下一次按新时间重排 |
| 同步 | 远端改时间本机重排；不重复通知 |
| 权限 | 拒绝通知权限、精确闹钟拒绝均有提示；列表/新建/同步不受影响 |
| 开关 | 关闭清空；再打开重排；无重复/无幽灵通知 |
| 重启 | 按 P0 实测记录；若不保留，启动重排并明确限制 |
| 手势 | 左滑出动作；纵向滚动、详情、排序不冲突；删除二次确认 |
| 小组件 | 可添加；待办数/标题/时间正确；变更后刷新；被杀/重启后正确 |
| 视觉 | 设置弹窗、滑出动作条、小组件截图，用户确认与现有 Swiss 风格一致 |

## 10. 分阶段与暂停点

| 阶段 | 产出 | 暂停点 |
|---|---|---|
| P0 原生 spike | 测试通知 APK；前台/后台/被杀/重启结果 | **你真机确认** |
| P1 共享排程 | 纯函数 + vitest + sync-shared | 无 |
| P2 通知业务层 | 权限/渠道/重排/设置/点击定位 | 无 |
| P3 滑动手势 | 手势层与冲突处理、真机交互 | 无 |
| P4 桌面小组件 | Kotlin provider + 数据桥 + APK | **你真机确认** |
| P5 文档交付 | README、DEVELOPMENT_PLAN、evidence、APK | 视觉验收通过后收尾 |

## 11. 风险与决策

1. **重启存活**：以 P0 实测为准；不保留则启动重排并明确「重启后未打开应用可能漏提醒」，必要时另评 boot receiver。
2. **精确闹钟**：权限被拒接受近似时间；是否额外引导系统设置，P0 后定。
3. **循环窗口**：默认 7 天 / 最多 50 条；长期不打开的补齐依赖启动/前台。
4. **OEM 省电**：按机型记录，不承诺全机型一致。
5. **prebuilt 原生工程**：config plugin 不自动改已生成的 `android/`；权限/图标/渠道需手动核对或 prebuild（prebuild 前先备份原生改动）。
6. **风格统一**：新增 UI 一律复用现有 Swiss 组件与令牌；小组件受 RemoteViews 限制的部分在文档标注，不用「系统默认」替代。

## 12. 预计改动文件

- `v1.1.0-an/package.json`（+`expo-notifications`；手势库按需要）
- `v1.1.0-an/android/app/src/main/AndroidManifest.xml`（通知权限/精确闹钟/重启接收，按 P0 结论）
- `v1.1.0-an/app.json`（通知图标/颜色，若需要）
- `v1.1.0-an/src/notifications/reminderScheduler.ts`
- `v1.1.0-an/src/context/ReminderContext.tsx`
- `v1.1.0-an/src/components/ReminderSettingsModal.tsx`
- `v1.1.0-an/src/components/TodoCard.tsx` / `TodoList.tsx`（手势层）
- `v1.1.0-an/android/.../TodoWidgetProvider.kt`、布局与 `WidgetDataBridge`
- `v1.1.0-an/App.tsx`（Provider、铃铛、点击定位、数据桥）
- `v1.1.0-an/src/utils/reminderSettings.ts`
- `packages/shared-logic/src/reminder-schedule.ts` + 测试
- 文档：移动端 README、DEVELOPMENT_PLAN、`docs/evidence/mobile-reminders/`、`docs/evidence/mobile-widget/`

## 13. 门禁

- `npm run sync-shared`（改 shared 后）
- 根 `npm test`（shared-logic 新增用例）
- `cd v1.1.0-an && npx tsc --noEmit`
- `npm run check:shared`
- gradle `assembleRelease` 产出 APK（需 JDK 17 / Android SDK）
- 真机功能验收 + 视觉验收记录入 evidence；构建成功不等于验收通过。
