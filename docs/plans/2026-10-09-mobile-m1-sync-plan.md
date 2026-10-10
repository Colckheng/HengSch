# HengSch Todo · 手机端 M1 同步 实施计划

日期：2026-10-09
依据：`2026-10-09-mobile-v1.1.0-an-design.md`（§0–§8 已批准）
范围：仅 M1（同步桥 + 手机 SyncContext + 双机验收）；M2/M3/M4 另立计划。
顺序原则：共享层对齐先行 → 桥服务 → 手机端 → 双机验收；每阶段独立可验收。

---

## Phase 0 · shared 层与 an 对齐（预估 0.5 天）

**目标**：`v1.1.0-an` 的数据层具备与桌面完全一致的同步语义（元数据、墓碑、过滤），不引入任何同步行为。

| # | 任务 | 文件 |
|---|------|------|
| 0.1 | 重跑 `npm run sync-shared`，把 10/4 之后新增的 `shared-types`（SyncedMeta/MonitorConfig）、`shared-logic`（sync.ts/monitor.ts）带进 `v1.1.0-an/shared/`；确认 babel module-resolver 与 metro 别名指向副本 | `v1.1.0-an/scripts/sync-shared.js`、`babel.config.js`、`metro.config.js` |
| 0.2 | `deviceId` 工具：首启 `randomUUID()` 存 AsyncStorage（key `deviceId`），导出同步读取入口（内存缓存） | 新 `v1.1.0-an/src/utils/device.ts` |
| 0.3 | `addTodo`/`addGroup` 补 `fillSyncMeta()`（`updatedAt` + `deviceId`）；编辑同理刷新 `updatedAt` | `src/context/TodoContext.tsx`、`src/context/GroupContext.tsx` |
| 0.4 | 删除改墓碑：`deleteTodo`/`deleteGroup` → `deleted: true` + `updatedAt`；渲染/查询路径过滤 `deleted`；30 天墓碑清理调 shared-logic | 同上 + 消费组件 |
| 0.5 | 加载迁移：存量记录补 `updatedAt = updatedAt ?? createdAt`（幂等） | 同 0.3 两文件加载路径 |

**验收**：手机新增/编辑/删除 → 内存状态带完整元数据、删除不可见、重启仍不可见；`npx tsc --noEmit` 0 error（**an 无 eslint 配置，lint 门禁不适用**）；桌面三件套门禁复跑不受影响（sync-shared 副本变更不进 v1.0.0 源）。

> 实施记录：`v1.1.0-an` 此前**从未安装依赖**（无 node_modules），`npm install` 已补；tsconfig 补 `exclude` 排除同步过来的 vitest 测试文件；修复预存的 `asyncStorageAdapter.keys()` readonly 类型错误。

---

## Phase 1 · 云端 sync-bridge 服务（预估 1 天）

**目标**：ECS 上跑起 HTTP 桥，curl 脚本验证 etag/鉴权语义全对，桌面 SFTP 文件路径确认同一份真相。

| # | 任务 | 文件 |
|---|------|------|
| 1.1 | 新建独立包（**不进 npm workspaces**，避免动桌面门禁）：`node:http` 或 express 轻实现 | 新 `services/sync-bridge/package.json`、`src/server.js` |
| 1.2 | `GET /sync` → `200 {etag, state}`；`PUT /sync?etag=n` 原子写（tmp + `rename`）→ `200 {etag:n+1}`；etag 不匹配 → `409 {etag}`；`GET /health` 无鉴权；其余 404 | 同上 |
| 1.3 | 鉴权中间件：`Bearer <token>`，常量时间比较；token/端口/数据路径来自 `.env` | `src/auth.js`、`.env.example` |
| 1.4 | etag 实现：文件内容 SHA-1 前 12 位（重启自愈，无需内存态）；首次无文件 → `state: null` 由客户端全量 PUT 建档 | 同 1.2 |
| 1.5 | 单测：`node:test` 覆盖 建档/读/写/409/401/原子性（并发 PUT 仅一个成功） | `test/server.test.js` |
| 1.6 | 本地起服 + curl 验证脚本（中文 body、etag 往返、错误码矩阵） | `scripts/probe.sh`（或 .ps1） |
| 1.7 | 部署：`ssh cloud-server` 放 `/opt/hengsch/sync-bridge`、`.env`（token = 32+ 字节随机）、systemd unit（Restart=always）、`systemctl enable --now`；确认 `/var/lib/hengsch/sync.json` 与桌面 SFTP `remotePath` 指向**同一文件** | 服务器侧 + `services/sync-bridge/deploy/sync-bridge.service` |
| 1.8 | 安全组：放行该端口（**阿里云控制台手动步骤**，记录到 1.7 部署说明） | 部署说明文档 |

**验收**：`probe.sh` 全绿（含 401/409/并发 PUT）；`ssh cloud-server` 上手工 `curl` 读写通过；桌面 SFTP 仍能读到桥写入的文件（`sftp` list/get 验证一次）。

---

## Phase 2 · 手机 SyncContext（预估 1.5 天）

**目标**：手机端具备与桌面同构的推拉合并与状态机，UI 有完整设置与状态反馈。

| # | 任务 | 文件 |
|---|------|------|
| 2.1 | 设置存储：`serverUrl` / `token` 存 AsyncStorage；含「测试连接」（GET /health + /sync 各一发） | 新 `src/utils/syncConfig.ts` |
| 2.2 | `SyncContext`：状态机 `IDLE/SYNCING/SYNCED/OFFLINE/AUTH ERROR/REMOTE ERROR`；`runCycle` = GET → `mergeSyncStates(本地, 远端, now)` → 变化则 PUT（带 etag）→ 409 重读重合 ×3 → 回写本地存储；网络失败 → OFFLINE，**任何错误不覆盖本地** | 新 `src/context/SyncContext.tsx` |
| 2.3 | 触发：App 启动（延迟 5s）、`AppState` 回前台、60s 定时、手动 `runNow` | 同上 + `App.tsx` 接线 |
| 2.4 | 本地存储读写：合并结果整体写回 AsyncStorage（todos + groups 键与 TodoContext 现有格式对齐，回写经 TodoContext 应用而非旁路直改） | `SyncContext.tsx`、`TodoContext.tsx`、`GroupContext.tsx` |
| 2.5 | UI（Swiss 规格）：页脚状态条 `SYNCED 12:03 / SYNCING… / OFFLINE / AUTH ERROR / REMOTE ERROR`（mono 10px，点击进设置）；「同步设置」页/弹层：服务器地址 + token 输入（支持粘贴）+ 测试按钮 + 错误文案 | 新 `src/screens/SyncSettings.tsx`（或 Modal）、`src/components/` 复用 |
| 2.6 | 首同步冲突：远端 `state: null` → 本地全量 PUT；本地空 + 远端有 → 直接应用远端 | `SyncContext.tsx` |

**风险点**：`v1.1.0-an` 非 workspace，共享逻辑只能走副本——**任何 shared-logic 修改后必须重跑 0.1**；Expo Go 可跑 M1（纯 JS/TS），无需 prebuild；中文内容全链 UTF-8；`mergeSyncStates` 签名以 packages 内为准（先读源码再接线）。

**验收**：单机自测——改 `sync.json`（curl 模拟第二台设备）→ 手机 60s 内合并进 UI；token 改错 → `AUTH ERROR` 且本地不动；断网 → `OFFLINE`，恢复后自动追平。

### Phase 2 实施记录（2026-10-09，✅ 全部完成）

- 交付：`src/utils/syncConfig.ts`（配置存取 + testConnection，8s 超时）、`src/context/SyncContext.tsx`（状态机用 shared `SyncState`，首态 `OFF` 而非计划中的 `IDLE`；runCycle = GET → parseSyncFile（损坏→REMOTE ERROR 不写回）→ merge → PUT 带 etag（409 重读重合 ×3，退避 500/1000ms）→ **应用前再与当前本地原始数据 merge 一次**防丢飞行中编辑 → applySynced* 回写）、触发 = 启动 5s / 60s 链式调度（OFFLINE 5s×2^n 封顶 60s）/ AppState 回前台 / 手动 runNow；`src/components/SyncStatusFooter.tsx`（Swiss 规格，mono 10px，点进设置）、`src/components/SyncSettingsModal.tsx`（地址/token/测试/立即同步/当前状态）；`App.tsx` 接线 SyncProvider + 页脚 + Modal。
- **验收方式**：Expo web（Metro :8090）+ headless Chrome CDP 自动化驱动（同步逻辑平台无关）。注意：桥未加 CORS 头，浏览器需 `--disable-web-security` 才能测试；**RN 原生 fetch 不受 CORS 限制，真机无此问题**。
- 验收结果（全绿）：
  1. ✅ 配置 + 测试连接「连接成功，鉴权通过」→ 保存 → `SYNCED 12:30`；远端文件收到手机 default group（deviceId/updatedAt 齐）+ writer（闭环 A 手机→云）；
  2. ✅ curl 模拟设备 B PUT 待办 → 手机「立即同步」列表出现「来自设备B的验收待办」（闭环 B 云→手机）；
  3. ✅ 错 token 保存 → `AUTH ERROR`，且失败前后远端 etag 不变（不写回）；改回正确 token → `SYNCED`；
  4. ✅ `systemctl stop` → 立即同步 → `OFFLINE`；start 后 → `SYNCED`，设备 B 待办仍在（本地不丢）；
  5. ✅ 60s 自动周期：设备 B 新增待办后 **34s** 无手动操作自动进列表。
- 附：桥 etag 语义复验（节点脚本干净测）：错 etag→409、空 etag→409（无 clobber 洞）、正确 etag→200。
- 门禁：`v1.1.0-an` `npx tsc --noEmit` = 0 error。

---

## Phase 3 · 双机验收（预估 0.5 天）

**目标**：设计 §3.4 五条清单在真实双机（桌面 v1.0.0 + 手机真机 dev build）上全部通过。

| # | 任务 |
|---|------|
| 3.1 | 清单 1：双向新增/完成，对端 ≤60s 可见 |
| 3.2 | 清单 2：双端离线各改同一条 → 重连合并 LWW 正确、无重复行（deviceId 不同） |
| 3.3 | 清单 3：桌面删除 tombstone（如 `remote-b-test`）→ 手机端不复活；手机删除 → 桌面不复活 |
| 3.4 | 清单 4：手机 token 错 → `AUTH ERROR` 不写回；修正后恢复 |
| 3.5 | 清单 5：`systemctl stop sync-bridge` → 双端 `OFFLINE`；start 后自动追平；期间桌面 SFTP 写入与桥恢复后合并正确 |
| 3.6 | 结果记录回设计文档附录（通过/问题/修法） |

---

## Phase 4 · 收尾（预估 0.5 天）

| # | 任务 |
|---|------|
| 4.1 | `v1.1.0-an` 内 `npx tsc --noEmit` + `npm run lint` 0 error；v1.0.0 三件套门禁复跑不受影响 |
| 4.2 | 部署说明沉淀：`services/sync-bridge/README.md`（3 步：放文件 → systemd → 安全组）+ 手机配对步骤（设置页截图级说明） |
| 4.3 | `sync-shared` 副本变更与全部代码提交（按用户指示） |

### Phase 3 实施记录（2026-10-10）

- 3.1-3.5 ✅：五条清单全部 PASS（真机 APK 17:06 版 + 桌面 dev + 云端桥）。证据与语义说明见设计文档**附录 A**。
- 验收途中修复：桌面 OFF 页脚死锁、ssh2 `NO_SUCH_FILE` 首传死锁、Android cleartext HTTP；设置页「测试连接通过即保存 / 立即同步先保存」UX（用户反馈）。
- 3.6 ✅：已记录至设计文档附录 A。

### Phase 4 实施记录（2026-10-09 起，2026-10-10 更新）

- 4.1 ✅：an `tsc`=0；v1.0.0 `tsc`=0、`eslint`=0（`--max-warnings 0`）；根 `npm test` 48/48。（an 无 lint 配置，4.1 的 lint 项不适用）
- 4.2 ✅：`services/sync-bridge/README.md` 已写（协议表 / 服务器部署 5 步 / 手机配对 4 步 / 注意事项含 CORS 说明与"空 etag 同样 409"）。
- 4.3 ⏳：等用户指示提交。

---

## 依赖与顺序关系

```
Phase 0 ──▶ Phase 2 ──▶ Phase 3 ──▶ Phase 4
   └──────▶ Phase 1 ──────┘（1 与 2 可并行，3 前必须都完成）
```

- Phase 0 是 2 的前置（SyncContext 依赖完整元数据语义）。
- Phase 1 独立可先行（部署+curl 验收不依赖手机端）。
- Phase 3 需要：桌面 dev 进程 + 手机真机 + 云端服务，三方齐备。

---

## 后续计划（本文档不含）

- **M2 监测**：UsageStats 权限 + 前台服务 + 按事件区间记账（设计 §4）
- **M3 Widget/通知**：prebuild 原生工程 + SharedPreferences 快照桥（设计 §5）
- **M4 原子岛**：vivo 开放平台申请（设计 §6，不阻塞上线）
