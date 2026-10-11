# 云同步设计与协议

HengSch 三端（桌面 / Web / Android）共享服务器上的**同一个数据文件** `sync.json`。合并逻辑全部在客户端（纯函数，有单测），服务端只是带乐观锁的原子文件网关。

## 1. 拓扑

```
┌──────────────┐   SFTP（ssh2，直写文件）
│ v1.0.0 桌面端 │ ─────────────────────────┐
└──────────────┘                          ▼
                                /home/syncuser/sync.json
┌──────────────┐   HTTP GET/PUT            ▲
│ v1.1.0-web   │ ─────────────┐            │
└──────────────┘              │            │
┌──────────────┐   HTTP GET/PUT│            │
│ v1.1.0-an    │ ──────────────┤            │
└──────────────┘               ▼            │
                        services/sync-bridge（:8642）
                        etag 乐观锁 · 原子写 · CORS
```

- 手机与 Web 使用 HTTP 桥（`GET/PUT http://<host>:8642/sync`）；桌面直接 SFTP 读写同一个文件。
- 三种客户端写入的都是**合并后的完整文件**（全量快照，无增量/无操作日志）。
- 两端先后写入靠 **etag 乐观锁** + 客户端 **LWW 合并**收敛，最终一致。

## 2. sync.json 格式

由 `@hengsch/shared-logic` 的 `SyncFile` 类型定义：

```jsonc
{
  "version": 1,                  // 必须为 1，否则客户端判为损坏
  "todos":  [ /* Todo[]，含墓碑 */ ],
  "groups": [ /* Group[]，含墓碑 */ ],
  "writer": { "deviceId": "…", "at": 1728000000000 }  // 最后写入者（信息性）
}
```

- 解析入口：`parseSyncFile(text)` — 非 JSON、缺 `todos`/`groups` 数组、`version !== 1` 一律返回 `null`。
- 客户端解析出 `null` 时显示 `REMOTE ERROR` 并**停止本轮且不写回**（防止坏档被覆盖），需人工修复服务器文件。

### 记录级同步元数据（SyncedMeta）

每条 Todo / Group 携带：

| 字段 | 含义 |
|---|---|
| `updatedAt` | 最后修改时间戳；LWW 主判据。缺失时用 `createdAt` 补齐（`normalizeSynced`） |
| `deviceId` | 修改来源设备；`updatedAt` 相等时定序。缺失补 `'legacy'` |
| `deleted` | 墓碑标记。**删除不物理移除记录**，否则对端合并会把删除「复活」 |

`deviceId` 各端自己生成并持久化：Web 存 localStorage key `deviceId`（uuid v4）；桌面存 electron-store；手机存 AsyncStorage。

## 3. 合并算法（客户端，`packages/shared-logic/src/sync.ts`）

`mergeSyncStates(local, remote, now)`，纯函数，`sync.test.ts` 单测覆盖，62 项门禁之一。

1. **补齐元数据**：两边记录先过 `normalizeSynced`（补 `updatedAt`/`deviceId`）。
2. **逐条 LWW**（`pickWinner`）：
   - `updatedAt`（缺省视作 `createdAt`）大者胜；
   - 相等 → `deviceId` 字典序大者胜；
   - 再相等 → `JSON.stringify` 字典序大者胜（保证对称收敛：merge(A,B) 与 merge(B,A) 一致）。
   - **墓碑同等参与比较**：删除也是一个带 `updatedAt` 的写操作，晚删者胜。
3. **过期墓碑清除**：`deleted === true` 且时间超过 `TOMBSTONE_TTL_MS`（30 天）的记录在合并结果中丢弃。
4. **孤儿任务改绑**：todo 引用的 groupId 不存在或已墓碑 → 改绑 `'default'`。
5. **确定性排序**（两端收敛到同一数组顺序）：
   - todos：`order` → `createdAt` → `id`
   - groups：`createdAt` → `id`

> 已知边界：同一条记录若在两台设备上**同时**修改，LWW 只保留 `updatedAt` 较大一侧，另一侧的编辑会丢（设计取舍，未做字段级合并）。

## 4. HTTP 同步桥（services/sync-bridge）

零依赖 Node ≥18，单文件 `src/server.js`，`createBridge({ file, token, maxBody })` 可注入测试。

### 4.1 协议

| 方法 | 路径 | 鉴权 | 行为 |
|---|---|---|---|
| GET | `/health` | 无 | `200 {"ok":true}` |
| GET | `/sync` | Bearer | `200 {"etag":"sha1前12位"\|null,"state":"文件文本"\|null}`；无文件时两者为 null |
| PUT | `/sync?etag=<当前etag>` | Bearer | body 为完整文件文本 |
| OPTIONS | 任意 | 无 | `204` + CORS 头（浏览器预检） |

PUT 结果：

- `etag` 匹配（或文件不存在且 `etag=` 为空）→ 原子写 → `200 {"etag":<新sha1前12>}`
- `etag` 不匹配（**含文件已存在但客户端传空 etag**，防误判无档覆盖）→ `409 {"etag":<当前值>}`，客户端需重读合并后重试
- 其它：token 缺失/错误 → `401`；body > 8MB → `413`；未知路径 → `404`；方法不对 → `405`

### 4.2 实现要点

- **鉴权**（`src/auth.js`）：`Authorization: Bearer <token>`，先 sha256 再 `timingSafeEqual`（常数时间、避免长度泄漏）；token 配置 < 8 字符一律 fail closed。
- **原子写**：`<file>.tmp.<pid>.<seq>`（`wx` + mode 0600）写入后 `rename`，失败清理 tmp。
- **写串行化**：所有 PUT 排在一个 Promise 链上，check+write 原子成对，防并发双过 etag 检查。
- **CORS**：`Access-Control-Allow-Origin: *`，Methods `GET, PUT, OPTIONS`，Headers `Authorization, Content-Type`，`Max-Age 86400`（Web 端浏览器跨域必需；RN 原生请求不受 CORS 影响）。
- **配置**（`.env`，systemd EnvironmentFile；`process.env` 优先）：
  - `SYNC_PORT`（默认 8642）
  - `SYNC_FILE`（如 `/home/syncuser/sync.json`）
  - `SYNC_TOKEN`（32+ 字节随机串，**只放 .env，已 gitignore**）

## 5. 桌面端同步客户端（`v1.0.0/src/main/sync-service.ts`）

- 传输：`ssh2` SFTP。配置 `SyncConfig { enabled, host, port, username, remotePath }`（`remotePath` 支持 `~/`，经 `ext_openssh_expandPath` 展开）；SSH 私钥**单独**存 electron-store，不进 SyncConfig 结构。
- 首次启动生成密钥对（`ensureKeyPair`），公钥展示给用户以便上传到服务器 `authorized_keys`。
- 周期：首拍 5s，之后 60s；离线指数退避 `5s × 2^n`（上限 60s）。
- 写入：合并后 `putAtomic`（tmp + `ext_openssh_rename`，退化到普通 rename），失败重试（`PUT_ATTEMPTS=3`，`PUT_BACKOFF_MS=500`）；写后**回读校验**内容一致。
- 状态机 `SyncState`：`OFF / SYNCING / SYNCED / OFFLINE / AUTH ERROR / REMOTE ERROR`，经 IPC 推给渲染进程页脚展示。
- 与桥的关系：桌面不走 HTTP，直接写 `SYNC_FILE` 同一路径；桥的写串行化只约束 HTTP 侧，桌面侧靠 SFTP 原子 rename + 客户端 LWW 收敛。

## 6. Web / 手机同步客户端（HTTP）

两端 `SyncContext.tsx` 逻辑同构（常量一致）：

| 常量 | 值 | 说明 |
|---|---|---|
| `FIRST_RUN_DELAY_MS` | 5000 | 数据 Context 初始化完成后的首拍延迟（避开启动高峰） |
| `BASE_INTERVAL_MS` | 60000 | 正常周期 |
| `OFFLINE_BACKOFF0_MS` | 5000 | 离线退避基数，`min(5s × 2^连续离线次数, 60s)` |
| `PUT_ATTEMPTS` | 3 | 409 冲突重试次数（重读后重新合并再 PUT，间隔 500ms×n） |
| fetch 超时 | 8000ms（Web `fetchWithTimeout`） | AbortController |

单周期流程：

1. `GET /sync` 取 `{etag, state}`
2. `state === null`（远端无档）→ 本地全量 `normalizeSynced` 后 `PUT ?etag=`（空）建档
3. 否则 `parseSyncFile`；解析失败 → `REMOTE ERROR`，不写回
4. `mergeSyncStates(本地, 远端)` → `PUT ?etag=<GET 到的 etag>`；409 → 重读 → 重新合并 → 重试（≤3 次，耗尽 → `REMOTE ERROR`）
5. 成功后把「合并结果」与「周期开始时的本地快照」再合并一次（回填飞行中的本地编辑，LWW 保底），整体 `applySyncedTodos/Groups` 应用到 Context
6. 成功 → `SYNCED`、清离线计数；401 → `AUTH ERROR`；其它异常 → `OFFLINE` 并累加退避

触发时机：

- 首拍定时器（StrictMode 安全：timerRef 重武装 + pending 防双链）
- 周期链式调度（每轮 `finally` 里安排下一轮）
- Web 端额外：`visibilitychange`（标签页重新可见）与 `window online` 事件立即同步；`runCycle` 用 `runningRef` 自守防并发
- 设置弹窗保存且 `enabled=true` → 立即触发一轮

配置持久化：

- Web：localStorage key `syncConfig`：`{ enabled, serverUrl, token }`（`serverUrl` 去尾斜杠）
- 手机：AsyncStorage 同结构
- **`enabled=false` 时周期链停摆、状态显示 OFF**（可关闭同步）

## 7. 配对指南

1. 服务器 `services/sync-bridge/.env` 里的 `SYNC_TOKEN` 即配对 token（勿外传）。
2. **手机 / Web**：设置弹窗（Web：页脚同步芯片 → 同步设置；手机：底部状态条 → 同步设置）：
   - 服务器地址：`http://<SERVER_IP>:8642`
   - token：粘贴 `SYNC_TOKEN`
   - 勾选「启用」→「测试连接」（`/health` 通 + `/sync` 鉴权过）→ 保存 → 60s 内出现 `SYNCED hh:mm`
3. **桌面**：设置弹窗走 SFTP：主机 `<SERVER_IP>`、端口 22、用户、`remotePath` 填 `~/sync.json`（即 `/home/syncuser/sync.json`），首次把公钥追加到服务器该用户的 `~/.ssh/authorized_keys`。

## 8. 故障排查

| 现象 | 原因与处理 |
|---|---|
| `AUTH ERROR` | token 不对或被更换；核对服务器 `.env` 的 `SYNC_TOKEN` |
| `OFFLINE` | 网络不通 / 桥没起（`systemctl status sync-bridge`）/ 地址端口错；`curl http://<SERVER_IP>:8642/health` |
| `REMOTE ERROR` | 远端 sync.json 损坏（非 version 1 合法 JSON）；人工修复 `/home/syncuser/sync.json`（可清成 `{"version":1,"todos":[],"groups":[]}`，各端下次会全量重建——注意会丢远端数据，仅作最后手段） |
| Web 端 409 频发 | 多端高频同时写；桥重启即可（写链清空），数据不丢 |
| 浏览器 CORS 报错 | 桥版本过旧没带 CORS 头；更新 `server.js` 并 `systemctl restart sync-bridge` |
| 删除的任务复活 | 该端本地时钟偏差过大导致 `updatedAt` 落后；校准设备时间 |
