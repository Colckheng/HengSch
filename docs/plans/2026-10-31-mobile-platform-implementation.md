# HengSch 手机端三步增强实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 Android 单页应用上，按「本地通知 → 滑动手势 → Android 桌面小组件」三步交付，并保证所有新增 UI 与现有 Swiss 风格一致。

**Architecture:** 保留 Expo/RN 单页与数据模型；通知层新增 shared-logic 排程纯函数 + Expo 调度/设置/点击定位；手势层复用现有待办动作；小组件用 Kotlin AppWidget + SharedPreferences 数据桥。业务计算放 shared-logic，移动端只做适配。

**Tech Stack:** Expo 51、React Native 0.74.5、TypeScript、expo-notifications、AsyncStorage、PanResponder（必要时 gesture-handler/reanimated）、Kotlin AppWidget、gradle、vitest。

**Spec:** `docs/plans/2026-10-31-mobile-platform-design.md`

## Global Constraints

- 风格一致性为最高前提：新 UI 复用现有 Swiss 令牌/组件，直角、发丝线、无阴影、无说明性段落；视觉验收不通过不得收尾。
- 不改 Todo 数据模型与同步协议；不做 iOS、远程推送、AI/监测、通知动作按钮、主屏完成/删除。
- 业务计算只写 `packages/shared-logic` 并补 vitest，再 `npm run sync-shared`；移动端只写适配层。
- 通知默认关闭；循环预排未来 7 天、最多 50 条；精确闹钟被拒接受近似时间；计算排程失败不得先清空旧通知。
- prebuilt `android/`：权限/图标/渠道手动核对；测试与验收以 gradle APK 为准，不用 Expo Go。
- 每步独立可交付、独立 commit、独立 APK/证据；不开始实现前必须先通过本计划对应暂停点。

---

## Part A：本地通知 / 到期提醒

### Task A0：P0 原生通知可行性 spike

**Files:**
- Modify: `v1.1.0-an/package.json`（新增 `expo-notifications`）
- Modify: `v1.1.0-an/android/app/src/main/AndroidManifest.xml`
- Modify: `v1.1.0-an/App.tsx`（临时 spike 按钮，A3 前移除）
- Modify: `v1.1.0-an/app.json`（通知图标/颜色，如需要）

**Interfaces:**
- Produces: `expo-notifications` 可用、通知渠道 `reminders`、10 秒测试通知 APK；是否重启保留以实测记录。

- [ ] **Step 1: 安装依赖并补权限**

```bash
cd v1.1.0-an
npx expo install expo-notifications
```

`AndroidManifest.xml` 增加：

```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM"/>
```

- [ ] **Step 2: 写入临时 spike 代码**

`App.tsx` 顶部：

```ts
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false })
});
```

在 `AppContent` 中增加临时按钮：

```tsx
<TouchableOpacity onPress={async () => {
  await Notifications.requestPermissionsAsync();
  await Notifications.setNotificationChannelAsync('reminders', {
    name: '待办提醒', importance: Notifications.AndroidImportance.MAX, vibrationPattern: [0, 250, 250, 250]
  });
  await Notifications.scheduleNotificationAsync({
    content: { title: '待办提醒', body: '原生通知 spike' },
    trigger: { seconds: 10, channelId: 'reminders' }
  });
}}>
  <Text>10s 测试通知</Text>
</TouchableOpacity>
```

- [ ] **Step 3: 构建并真机验证**

```bash
cd v1.1.0-an
npx tsc --noEmit
cd android
./gradlew.bat assembleRelease
```

安装 `android/app/build/outputs/apk/release/app-release.apk`，验证：前台、退后台、杀进程、重启手机。记录机型/Android 版本/权限状态/是否收到。

- [ ] **Step 4: 暂停点决策**

只有「10 秒测试通知在后台/被杀可达」才继续 A1；若重启不保留，记录「启动时重排，重启后未打开应用可能漏提醒」，需要 boot receiver 时另行拍板。移除临时按钮或留到 A3 的「发送测试提醒」入口。

- [ ] **Step 5: Commit**

```bash
git add v1.1.0-an/package.json v1.1.0-an/package-lock.json v1.1.0-an/android/app/src/main/AndroidManifest.xml v1.1.0-an/App.tsx
git commit -m "feat(mobile): P0 原生通知可行性 spike"
```

### Task A1：shared-logic 排程纯函数

**Files:**
- Create: `packages/shared-logic/src/reminder-schedule.ts`
- Create: `packages/shared-logic/src/reminder-schedule.test.ts`
- Modify: `packages/shared-logic/src/index.ts`（导出）

**Interfaces:**
- Consumes: `Todo`、`calculateNextDueDate`、`Todo.remindAt/remindLeadMs/nextDueDate`
- Produces: `ReminderScheduleItem { todoId: string; title: string; at: number }`、`buildReminderSchedule(todos, now, horizonMs?, limit?)`

- [ ] **Step 1: 写失败测试**

`reminder-schedule.test.ts` 至少覆盖：

```ts
import { describe, it, expect } from 'vitest';
import { buildReminderSchedule } from './reminder-schedule';
import type { Todo } from '@hengsch/shared-types';

const NOW = Date.parse('2026-10-31T08:00:00Z');
const base = { id: 'a', title: '报销', type: 'once' as const, status: 'pending' as const, createdAt: 1, updatedAt: 1, order: 0 };

describe('buildReminderSchedule', () => {
  it('单次只保留未来 remindAt', () => {
    const todos: Todo[] = [
      { ...base, remindAt: NOW + 60_000 },
      { ...base, id: 'b', remindAt: NOW - 60_000 },
      { ...base, id: 'c', status: 'completed', remindAt: NOW + 60_000 },
      { ...base, id: 'd', deleted: true, remindAt: NOW + 60_000 }
    ];
    expect(buildReminderSchedule(todos, NOW)).toEqual([{ todoId: 'a', title: '报销', at: NOW + 60_000 }]);
  });

  it('循环按 nextDueDate - lead 展开 7 天并去重', () => {
    const todos: Todo[] = [{
      ...base, type: 'recurring', cycleType: 'daily', nextDueDate: NOW + 86_400_000, remindLeadMs: 600_000
    } as Todo];
    const result = buildReminderSchedule(todos, NOW);
    expect(result.length).toBe(7);
    expect(result[0].at).toBe(NOW + 86_400_000 - 600_000);
    expect(result.every((item, i, arr) => i === 0 || item.at > arr[i - 1].at)).toBe(true);
  });

  it('过去循环先推进到下一次，且最多 50 条', () => {
    const todos: Todo[] = Array.from({ length: 60 }, (_, i) => ({
      ...base, id: `t${i}`, type: 'recurring', cycleType: 'daily', nextDueDate: NOW - 86_400_000
    } as Todo));
    const result = buildReminderSchedule(todos, NOW);
    expect(result.length).toBe(50);
    expect(result.every((item) => item.at > NOW)).toBe(true);
  });
});
```

- [ ] **Step 2: 运行确认失败**

```bash
npx vitest run packages/shared-logic/src/reminder-schedule.test.ts
```

预期：模块不存在而失败。

- [ ] **Step 3: 实现纯函数**

`reminder-schedule.ts`：

```ts
import type { Todo, RecurringTodo } from '@hengsch/shared-types';
import { calculateNextDueDate } from './todo-utils';

export interface ReminderScheduleItem { todoId: string; title: string; at: number }

const DAY = 24 * 60 * 60 * 1000;

function recurringItems(todo: RecurringTodo, now: number, horizonMs: number, limit: number): ReminderScheduleItem[] {
  const lead = todo.remindLeadMs ?? 0;
  let due = todo.nextDueDate ?? (typeof todo.remindAt === 'number' ? todo.remindAt + lead : undefined);
  if (typeof due !== 'number') return [];
  const out: ReminderScheduleItem[] = [];
  for (let i = 0; i < 500 && out.length < limit; i += 1) {
    if (due - lead <= now) {
      const next = calculateNextDueDate(todo.cycleType, todo.customCycleDays, due, now);
      if (typeof next !== 'number') break;
      due = next;
    }
    if (due >= now + horizonMs) break;
    const at = due - lead;
    if (at > now) out.push({ todoId: todo.id, title: todo.title, at });
    const next = calculateNextDueDate(todo.cycleType, todo.customCycleDays, due, due);
    if (typeof next !== 'number') break;
    due = next;
  }
  return out;
}

export function buildReminderSchedule(todos: Todo[], now: number, horizonMs = 7 * DAY, limit = 50): ReminderScheduleItem[] {
  const items: ReminderScheduleItem[] = [];
  for (const todo of todos) {
    if (todo.deleted || todo.status !== 'pending') continue;
    if (todo.type === 'recurring') {
      items.push(...recurringItems(todo, now, horizonMs, limit));
    } else if (typeof todo.remindAt === 'number' && todo.remindAt > now) {
      items.push({ todoId: todo.id, title: todo.title, at: todo.remindAt });
    }
  }
  return items.sort((a, b) => a.at - b.at)
    .filter((item, index, arr) => index === 0 || item.todoId !== arr[index - 1].todoId || item.at !== arr[index - 1].at)
    .slice(0, limit);
}
```

- [ ] **Step 4: 跑测试与 sync-shared**

```bash
npx vitest run packages/shared-logic/src/reminder-schedule.test.ts
npm test
npm run sync-shared
npm run check:shared
```

- [ ] **Step 5: Commit**

```bash
git add packages/shared-logic/src/reminder-schedule.ts packages/shared-logic/src/reminder-schedule.test.ts packages/shared-logic/src/index.ts v1.1.0-an/shared
git commit -m "feat(shared): 本地通知排程纯函数（单次/循环/7天/上限）"
```

### Task A2：移动端调度服务与本地设置

**Files:**
- Create: `v1.1.0-an/src/notifications/reminderScheduler.ts`
- Create: `v1.1.0-an/src/utils/reminderSettings.ts`

**Interfaces:**
- Consumes: `buildReminderSchedule`、Expo `Notifications`
- Produces: `rescheduleAll(todos): Promise<{ ok: boolean; error?: string }>`、`scheduleTestNotification()`、`getRemindersEnabled()/setRemindersEnabled()`

- [ ] **Step 1: 设置存储**

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
const KEY = 'reminders:v1';
export async function getRemindersEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(KEY)) === 'true';
}
export async function setRemindersEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(KEY, enabled ? 'true' : 'false');
}
```

- [ ] **Step 2: 实现调度服务**

```ts
import * as Notifications from 'expo-notifications';
import type { Todo } from '@hengsch/shared-types';
import { buildReminderSchedule } from '../../shared/shared-logic';

export async function ensureChannel(): Promise<void> {
  await Notifications.setNotificationChannelAsync('reminders', {
    name: '待办提醒', importance: Notifications.AndroidImportance.MAX, vibrationPattern: [0, 250, 250, 250]
  });
}

export async function rescheduleAll(todos: Todo[]): Promise<{ ok: boolean; error?: string }> {
  try {
    const now = Date.now();
    const plan = buildReminderSchedule(todos, now);
    await ensureChannel();
    await Notifications.cancelAllScheduledNotificationsAsync();
    for (const item of plan) {
      await Notifications.scheduleNotificationAsync({
        content: { title: '待办提醒', body: item.title, data: { todoId: item.todoId } },
        trigger: { date: new Date(item.at), channelId: 'reminders' }
      });
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '通知排程失败' };
  }
}

export async function scheduleTestNotification(): Promise<void> {
  await ensureChannel();
  await Notifications.scheduleNotificationAsync({
    content: { title: '待办提醒', body: '测试提醒：5 秒后应看到本通知' },
    trigger: { seconds: 5, channelId: 'reminders' }
  });
}
```

- [ ] **Step 3: 类型检查与提交**

```bash
cd v1.1.0-an && npx tsc --noEmit
git add v1.1.0-an/src/notifications/reminderScheduler.ts v1.1.0-an/src/utils/reminderSettings.ts
git commit -m "feat(mobile): 通知调度服务与本地开关存储"
```

### Task A3：Provider、提醒设置、通知点击定位

**Files:**
- Create: `v1.1.0-an/src/context/ReminderContext.tsx`
- Create: `v1.1.0-an/src/components/ReminderSettingsModal.tsx`
- Modify: `v1.1.0-an/App.tsx`

**Interfaces:**
- Consumes: `rescheduleAll`、`scheduleTestNotification`、`get/setRemindersEnabled`、`TodoContext.state/isInitialized`
- Produces: `ReminderProvider`、`ReminderSettingsModal`；`AppContent` 的铃铛按钮与 `openTodoById(id)`

- [ ] **Step 1: Provider 与重排**

`ReminderContext.tsx` 核心：

```tsx
const { state, allTodos, isInitialized } = useTodos();
const [enabled, setEnabled] = useState(false);
const [error, setError] = useState<string | null>(null);

useEffect(() => { getRemindersEnabled().then(setEnabled); }, []);
useEffect(() => {
  if (!enabled || !isInitialized) return;
  const timer = setTimeout(() => { rescheduleAll(allTodos).then((r) => setError(r.ok ? null : r.error ?? null)); }, 300);
  return () => clearTimeout(timer);
}, [enabled, isInitialized, allTodos]);
useEffect(() => {
  const sub = AppState.addEventListener('change', (next) => {
    if (next === 'active' && enabled) rescheduleAll(allTodos);
  });
  return () => sub.remove();
}, [enabled, allTodos]);
```

开关开启时请求权限并 `setRemindersEnabled(true)`；关闭时 `cancelAllScheduledNotificationsAsync()` 并 `setRemindersEnabled(false)`。

- [ ] **Step 2: 设置弹窗与铃铛**

`ReminderSettingsModal` 复用 `SyncSettingsModal` 的 Modal/按钮/发丝线样式，包含：开关、权限状态、「发送测试提醒」（调用 `scheduleTestNotification`）、错误文本。`App.tsx` 工具栏增加铃铛按钮并渲染该 Modal。

- [ ] **Step 3: 点击通知定位**

`AppContent` 增加：

```ts
const openTodoById = (id: string) => {
  const todo = allTodos.find((item) => item.id === id && !item.deleted);
  if (todo) { setDetailTodo(todo); setIsDetailOpen(true); }
};
useEffect(() => {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const id = response.notification.request.content.data.todoId;
    if (typeof id === 'string') openTodoById(id);
  });
  Notifications.getLastNotificationResponseAsync().then((response) => {
    const id = response?.notification.request.content.data.todoId;
    if (typeof id === 'string') openTodoById(id);
  });
  return () => sub.remove();
}, [allTodos]);
```

- [ ] **Step 4: 类型检查、提交、真机功能验收**

```bash
cd v1.1.0-an && npx tsc --noEmit
git add v1.1.0-an/src/context/ReminderContext.tsx v1.1.0-an/src/components/ReminderSettingsModal.tsx v1.1.0-an/App.tsx
git commit -m "feat(mobile): 到期提醒设置、重排与通知点击定位"
```

按规格验收：前台/后台/被杀提醒、点击详情、编辑/完成/删除、循环、同步合并、权限拒绝、关闭清空、无重复。

---

## Part B：滑动手势

### Task B1：PanResponder 滑动动作条

**Files:**
- Create: `v1.1.0-an/src/components/SwipeableTodoRow.tsx`
- Modify: `v1.1.0-an/src/components/TodoList.tsx`
- Modify: `v1.1.0-an/src/components/TodoCard.tsx`（仅在需要暴露卡片容器时）

**Interfaces:**
- Consumes: `Todo`、`toggleTodoStatus`、`deleteTodo`、`updateTodo`、`rescheduleRemind`
- Produces: `SwipeableTodoRow({ todo, onDetail })`；左滑动作「完成/删除/稍后 1 小时」

- [ ] **Step 1: 实现手势容器**

用 `PanResponder.create`：只响应 `dx < -24 && |dx| > |dy|`，位移超过 60 时打开动作条；纵向滚动交还列表。动作条为直角、发丝线、墨黑/信号红。

```tsx
const translateX = useRef(new Animated.Value(0)).current;
const panResponder = useRef(PanResponder.create({
  onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy),
  onPanResponderMove: (_, g) => { if (g.dx < 0) translateX.setValue(Math.max(g.dx, -160)); },
  onPanResponderRelease: (_, g) => {
    const open = g.dx < -60;
    Animated.timing(translateX, { toValue: open ? -160 : 0, duration: 160, useNativeDriver: true }).start();
  }
})).current;
```

`SwipeableTodoRow` 用 `Animated.View` 包装原卡片，动作区只读 `open` 状态决定「完成/删除/稍后」是否可点。

- [ ] **Step 2: 接入动作**

```ts
onComplete: () => toggleTodoStatus(todo.id);
onDelete: () => Alert.alert('删除待办', `确定删除「${todo.title}」吗？`, [
  { text: '取消', style: 'cancel' },
  { text: '删除', style: 'destructive', onPress: () => deleteTodo(todo.id) }
]);
onSnooze: () => updateTodo(todo.id, rescheduleRemind(todo, Date.now() + 60 * 60 * 1000));
```

`TodoList` 用 `SwipeableTodoRow` 包装原 `TodoCard`，保留 `onDetail`、分组筛选、现有排序入口。

- [ ] **Step 3: 类型检查与提交**

```bash
cd v1.1.0-an && npx tsc --noEmit
git add v1.1.0-an/src/components/SwipeableTodoRow.tsx v1.1.0-an/src/components/TodoList.tsx
git commit -m "feat(mobile): 左滑完成/删除/稍后手势"
```

### Task B2：手势冲突与视觉验收

- [ ] 真机验证：纵向滚动、点击详情、现有排序不被打断；左滑动作不重复触发；删除二次确认；三种结果与同步一致。
- [ ] 截图滑出动作条并让用户确认 Swiss 风格；不一致则调整后再验收。
- [ ] 若 PanResponder 与列表冲突无法解决，再引入 `react-native-gesture-handler` + reanimated，单独 commit，不预先安装。
- [ ] `git commit -m "test(mobile): 手势冲突与视觉验收记录"`（证据入 `docs/evidence/mobile-gestures/`）

---

## Part C：Android 桌面小组件

### Task C0：AppWidget 原生 spike

**Files:**
- Create: `v1.1.0-an/android/app/src/main/java/com/hengsch/todo/TodoWidgetProvider.kt`
- Create: `v1.1.0-an/android/app/src/main/res/layout/widget_todo.xml`
- Modify: `v1.1.0-an/android/app/src/main/AndroidManifest.xml`

**Interfaces:**
- Produces: 可添加的只读小组件，显示固定文案「今日待办 0」。

- [ ] **Step 1: 实现 provider 与布局**

```kotlin
class TodoWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    for (id in ids) {
      val views = RemoteViews(context.packageName, R.layout.widget_todo)
      views.setTextViewText(R.id.widget_count, "今日待办 0")
      manager.updateAppWidget(id, views)
    }
  }
}
```

布局使用纸底、墨黑字、直角分隔线、mono 数字；manifest 注册 `AppWidgetProvider` 与 `APPWIDGET_UPDATE` action。

- [ ] **Step 2: 构建并安装 APK，主屏添加小组件**

```bash
cd v1.1.0-an/android && ./gradlew.bat assembleRelease
```

记录是否能添加、显示是否溢出、系统字体下 Swiss 风格是否可接受。

- [ ] **Step 3: Commit**

```bash
git add v1.1.0-an/android/app/src/main/java/com/hengsch/todo/TodoWidgetProvider.kt v1.1.0-an/android/app/src/main/res/layout/widget_todo.xml v1.1.0-an/android/app/src/main/AndroidManifest.xml
git commit -m "feat(mobile): Android 桌面小组件原生 spike"
```

### Task C1：WidgetDataBridge 与刷新

**Files:**
- Create: `v1.1.0-an/src/utils/widgetSummary.ts`
- Modify: `v1.1.0-an/android/app/src/main/java/com/hengsch/todo/TodoWidgetProvider.kt`
- Modify: `v1.1.0-an/App.tsx`

**Interfaces:**
- Consumes: `allTodos`、`isInitialized`
- Produces: `{ pendingCount, topTitles, updatedAt }` 写入 SharedPreferences；provider 读取并刷新

- [ ] **Step 1: 写入摘要**

在任务初始化/变化/同步合并后写入：

```ts
const summary = {
  pendingCount: allTodos.filter((t) => !t.deleted && t.status === 'pending').length,
  topTitles: allTodos.filter((t) => !t.deleted && t.status === 'pending').slice(0, 3).map((t) => t.title),
  updatedAt: Date.now()
};
```

通过 Expo 原生模块/NativeModules 暴露 `setWidgetSummary(json)`；若无现成模块，新增 Kotlin `WidgetBridgeModule` 写 SharedPreferences。

- [ ] **Step 2: provider 读取并刷新**

读取 `pendingCount/topTitles/updatedAt` 填充 `widget_count` 与三个标题行；空数据显示「暂无待办」；点击打开应用。数据变化时 `AppWidgetManager.updateAppWidget` 刷新。

- [ ] **Step 3: 真机验收与提交**

验证新增/编辑/完成/删除/同步后刷新，被杀/重启后仍正确；截图让用户确认视觉一致。

```bash
git add v1.1.0-an/src/utils/widgetSummary.ts v1.1.0-an/android/app/src/main/java/com/hengsch/todo/TodoWidgetProvider.kt v1.1.0-an/App.tsx
git commit -m "feat(mobile): 桌面小组件数据桥与刷新"
```

### Task C2：文档与总门禁

- [ ] 更新 `v1.1.0-an/README.md`：通知/手势/小组件的使用、权限、构建与限制。
- [ ] 更新 `DEVELOPMENT_PLAN.md`：三步完成/实测限制/证据路径。
- [ ] 证据：`docs/evidence/mobile-notifications/`、`mobile-gestures/`、`mobile-widget/`。
- [ ] 门禁：

```bash
npm run sync-shared
npm test
cd v1.1.0-an && npx tsc --noEmit && npm run check:shared
cd android && ./gradlew.bat assembleRelease
```

- [ ] 最终提交：`docs: 手机端通知/手势/小组件交付与验收记录`

---

## 暂停点汇总

1. **A0 后**：你真机确认 10 秒测试通知在后台/被杀可达；不通过不进入 A1。
2. **A3 后**：通知全量验收与视觉确认通过，才进入手势。
3. **B2 后**：手势不破坏排序/滚动/详情，视觉确认通过。
4. **C1 后**：小组件数据与视觉验收通过，才写交付文档。
5. 任何需要 prebuild/原生权限/boot receiver 的决策，先暂停确认，不擅自扩大范围。
