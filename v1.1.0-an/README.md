# HengSch Todo — 移动端（v1.1.0-an）

Android / iOS 待办应用：Expo + React Native，Swiss UI，HTTP 云同步。交付物：`HengSch-Todo-v1.1.0.apk`。

## 功能

- 待办：一次性 / 循环、完成切换、详情 / 编辑 / 删除、列表内排序（`reorderTodos`）
- 分组：建 / 改 / 删 / 颜色、分组筛选
- 云同步：HTTP 桥（与 Web 端同构状态机），底部状态条 + 设置弹窗，详见 [../docs/sync.md](../docs/sync.md)
- 本地存储：AsyncStorage（`IStorage` 适配）
- **到期提醒**：工具栏 `ALR` 打开提醒设置，本机通知开关、权限状态、5 秒测试提醒；新增/编辑待办可选「5 分钟 / 30 分钟 / 1 小时 / 明天 9:00 / 清除」；单次按 `remindAt`，循环按周期预排未来 7 天、最多 50 条
- **左滑手势**：列表项左滑露出「完成 / 稍后 1h / 删除」，删除二次确认
- **桌面小组件**：Android 主屏只读摘要（待办数 + 前 3 条标题 + 更新时间），点击打开应用

## 到期提醒 / 左滑手势 / 桌面小组件

### 到期提醒（仅本机，不写云同步）

- 入口：工具栏 `ALR` → 提醒设置；开启时请求通知权限，关闭时清空已排提醒。
- 新增/编辑待办内可选提醒预设：5 分钟后、30 分钟后、1 小时后、明天 9:00、清除；循环任务以选定时刻作为下一周期锚点。
- 排程：`packages/shared-logic` 的 `buildReminderSchedule`；单次取 `remindAt`，循环按 `nextDueDate - remindLeadMs` 展开未来 7 天，按时间升序、去重、最多 50 条。
- 重排时机：初始化完成、待办变化（300ms 防抖）、回到前台、同步合并。
- 点击通知打开对应待办详情；已删除/未同步的 id 静默忽略。
- 权限：Android 13+ 通知权限；Android 12+ 精确闹钟权限被拒时使用系统近似时间。
- 限制：应用被杀时由系统投递；重启手机后是否保留以真机实测为准，不保留则启动时重排，未打开应用期间的提醒可能漏。

### 左滑手势

- 左滑超过阈值露出动作条；横向位移不够时纵向滚动与点击详情保持原行为。
- 「完成」走 `toggleTodoStatus`；「稍后 1h」把 `remindAt` 改为当前 +1 小时并清 `remindedAt`；「删除」二次确认后打墓碑。

### 桌面小组件（Android）

- 只读：待办数、前 3 条标题、更新时间；主屏点击打开应用，不能在小组件上完成/删除。
- 数据：JS 通过 `WidgetBridgeModule` 写 SharedPreferences，原生 `TodoWidgetProvider` 刷新；系统周期刷新兜底。
- 视觉：RemoteViews 仅支持系统字体，使用纸底、墨黑、发丝线、mono 数字对齐现有 Swiss 风格。

## 工程特点：自包含

**本工程不在 monorepo workspaces 内**（EAS / gradle 构建要求自包含）。业务逻辑来自内嵌副本：

```
v1.1.0-an/shared/     ← packages/{shared-types,shared-logic,shared-storage} 的拷贝
```

- **改业务逻辑永远改 `packages/`**，然后在仓库根目录跑 `npm run sync-shared` 拷贝进来
- 反向手改 `shared/` 会在下次 sync 时被覆盖，不要这么做
- EAS 云构建不依赖 monorepo 父级目录

## 环境要求

- Node ≥ 18
- Expo CLI 随 `expo` 依赖内（`npm run start` 即 `expo start --offline`）
- 本地跑 Android 需要：JDK 17、Android SDK（`ANDROID_HOME`）、`npm run android`（expo prebuild + gradle）
- iOS 本地需 Xcode（`npm run ios`）；当前主要交付 Android APK

## 脚本

```bash
npm run start           # expo start --offline（Metro，离线模式不查更新）
npm run android         # 本地构建并安装到设备/模拟器
npm run ios             # iOS 本地构建
npm run sync-shared     # 从 packages/ 同步共享代码到 shared/
```

## 同步配对

1. 底部状态条（初始 `SYNC OFF — 未配置`）→ 进入「同步设置」
2. 服务器地址：`http://<SERVER_IP>:8642`；token：桥 `.env` 的 `SYNC_TOKEN`
3. 「测试连接」（/health + /sync 鉴权）→「保存」→ 状态条 60s 内变 `SYNCED hh:mm`
4. 状态机：`SYNCING / SYNCED / OFFLINE / AUTH ERROR / REMOTE ERROR`；点击状态条可重测与「立即同步」

调度参数与 Web 端一致：首拍 5s、周期 60s、离线退避 `5s×2^n` 上限 60s、PUT 409 重试 ≤3 次。配置与 deviceId 存 AsyncStorage。`app.json` 已开 `usesCleartextTraffic`（允许 HTTP 明文桥）。

## 构建 APK

### 方式一：本地 gradle（当前交付流程）

```powershell
# 需 JDK 17 + Android SDK；首次需已 expo prebuild 生成 android/ 目录
cd v1.1.0-an\android
$env:JAVA_HOME = "D:\Java\jdk-17"    # 与 android/gradle.properties 的 installations.paths 保持一致
.\gradlew.bat assembleRelease
# 产物：android\app\build\outputs\apk\release\app-release.apk
# 交付时重命名为 HengSch-Todo-v1.1.0.apk
```

> 若 Maven Central 不可达导致 `generateReleaseLintModel` 拉 robolectric 依赖失败，可先跳过 lint 任务打包（不影响产物）：
> `.\gradlew.bat assembleRelease -x lint -x lintVitalRelease -x lintVitalAnalyzeRelease -x generateReleaseLintModel -x generateReleaseLintVitalModel -x lintReportRelease`

### 方式二：EAS 云构建（无需本地 SDK）

```bash
npx eas build --platform android --profile preview
```

需登录 Expo 账号（`app.json` 已绑定 projectId）。

## 门禁

```bash
cd v1.1.0-an
npx tsc --noEmit        # 移动端仅类型检查（无独立单测；业务逻辑由根 npm test 覆盖）
npm run check:shared    # 确认 shared/ 与 packages/ 一致
```

改过 `packages/` 后：先在仓库根 `npm run sync-shared`，再跑本端 tsc 与构建。

## 项目结构

```
src/
├── App.tsx                     # Provider 树 + ErrorBoundary
├── components/                 # TodoCard/List、Add/Edit/Detail、GroupManager、
│                               # SyncSettings、SyncStatusFooter、ConfirmDialog、
│                               # ColorPicker、ErrorBoundary、SwipeableTodoRow、
│                               # ReminderSettingsModal
├── context/
│   ├── TodoContext.tsx          # 待办 + 墓碑 + reorderTodos
│   ├── GroupContext.tsx         # 分组
│   ├── SyncContext.tsx          # HTTP 同步（与 Web 同构）
│   └── ReminderContext.tsx      # 通知重排/回前台/点击定位
├── notifications/
│   └── reminderScheduler.ts     # 权限、渠道、排程、测试通知
├── utils/
│   ├── asyncStorageAdapter.ts   # IStorage 实现
│   ├── reminderSettings.ts      # 本机提醒开关
│   ├── widgetSummary.ts         # 小组件摘要桥
│   ├── device.ts                # deviceId
│   └── syncConfig.ts            # 配置读写 / 测试连接
shared/                         # packages/ 内嵌副本（sync-shared 生成，勿手改）
scripts/sync-shared.js          # 同步脚本
android/                        # gradle 工程（prebuild 生成/更新）
│   └── app/src/main/java/com/hengsch/todo/  # TodoWidgetProvider / WidgetBridgeModule / WidgetSummaryStore
app.json / eas.json             # Expo 配置 / EAS 构建配置
```
