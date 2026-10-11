# HengSch Todo — 移动端（v1.1.0-an）

Android / iOS 待办应用：Expo + React Native，Swiss UI，HTTP 云同步。交付物：`HengSch-Todo-v1.1.0.apk`。

## 功能

- 待办：一次性 / 循环、完成切换、详情 / 编辑 / 删除、列表内排序（`reorderTodos`）
- 分组：建 / 改 / 删 / 颜色、分组筛选
- 云同步：HTTP 桥（与 Web 端同构状态机），底部状态条 + 设置弹窗，详见 [../docs/sync.md](../docs/sync.md)
- 本地存储：AsyncStorage（`IStorage` 适配）

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
$env:JAVA_HOME = "<JDK17 路径>"    # 本机为 jdk-17
.\gradlew.bat assembleRelease
# 产物：android\app\build\outputs\apk\release\app-release.apk
# 交付时重命名为 HengSch-Todo-v1.1.0.apk
```

### 方式二：EAS 云构建（无需本地 SDK）

```bash
npx eas build --platform android --profile preview
```

需登录 Expo 账号（`app.json` 已绑定 projectId）。

## 门禁

```bash
cd v1.1.0-an
npx tsc --noEmit        # 移动端仅类型检查（无独立单测；业务逻辑由根 npm test 覆盖）
```

改过 `packages/` 后：先在仓库根 `npm run sync-shared`，再跑本端 tsc 与构建。

## 项目结构

```
src/
├── App.tsx                     # Provider 树 + ErrorBoundary
├── components/                 # TodoCard/List、Add/Edit/Detail、GroupManager、
│                               # SyncSettings、SyncStatusFooter、ConfirmDialog、
│                               # ColorPicker、ErrorBoundary
├── context/
│   ├── TodoContext.tsx          # 待办 + 墓碑 + reorderTodos
│   ├── GroupContext.tsx         # 分组
│   └── SyncContext.tsx          # HTTP 同步（与 Web 同构）
├── utils/
│   ├── asyncStorageAdapter.ts   # IStorage 实现
│   ├── device.ts                # deviceId
│   └── syncConfig.ts            # 配置读写 / 测试连接
shared/                         # packages/ 内嵌副本（sync-shared 生成，勿手改）
scripts/sync-shared.js          # 同步脚本
android/                        # gradle 工程（prebuild 生成/更新）
app.json / eas.json             # Expo 配置 / EAS 构建配置
```
