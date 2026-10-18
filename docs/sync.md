# 云同步设计与协议

> Swiss Precision · 客户端合并 · 零依赖桥 · 最终一致

---

## 一、拓扑

```
┌──────────────┐    SFTP (ssh2)            ┌──────────────────────────┐
│ v1.0.0 桌面端 │ ──────────────────────────▶  /home/syncuser/sync.json
└──────────────┘                           ▲
                                       HTTP GET/PUT
┌──────────────┐    HTTP GET/PUT            │
│ v1.1.0-web   │ ────────┐                  │
└──────────────┘         │                  │
┌──────────────┐   HTTP GET/PUT  ▼
│ v1.1.0-an    │ ────────┘
└──────────────┘
               services/sync-bridge (:8642)
               etag 乐观锁 · 原子写 · CORS
```

- 桌面端 SFTP 直写；Web / 手机经 HTTP 桥
- 三端写入均为**合并后完整快照**（无增量/无操作日志）
- 两端先后写入靠 **etag 乐观锁 + 客户端 LWW 合并** 收敛，最终一致

---

## 二、sync.json 格式

```jsonc
{
  "version": 1,                          // 必须为 1，否则判定损坏
  "todos": [ /* Todo[] 含墓碑 */ ],
  "groups": [ /* Group[] 含墓碑 */ ],
  "writer": { "deviceId": "...", "at": 1728000000000 }  // 最后写入者（信息性）
}
```

- 解析入口：`parseSyncFile(text)` — 非 JSON、缺数组、`version !== 1` 均返回 `null`
- 解析为 `null` 时显示 `REMOTE ERROR` 并**停止本轮且不写回**（防止坏档覆盖）

---

## 三、记录级同步元数据

| 字段 | 含义 |
|---|---|
| `updatedAt` | LWW 主判据；缺失时用 `createdAt` 补齐 (`normalizeSynced`) |
| `deviceId` | 修改来源设备；`updatedAt` 相等时定序，缺失补 `'legacy'` |
| `deleted` | 墓碑标记。**删除不物理移除**，否则合并会把删除「复活」 |

`deviceId` 各端自生成持久化：Web 存 localStorage (`uuid v4`)、桌面存 electron-store、手机存 AsyncStorage。

---

## 三、合并算法 (`packages/shared-logic/src/sync.ts`)

`mergeSyncStates(local, remote, now)` — 纯函数，62 项单测覆盖。

1. **补齐元数据**：两边记录先过 `normalizeSynced` (补 `updatedAt`/`deviceId`)
2. **逐条 LWW** (`pickWinner`)：
   - `updatedAt` 大者胜 (缺省视作 `createdAt`)
   - 相等 → `deviceId` 字典序大者胜
   - 再相等 → **稳定键序序列化** 字典序大者胜（跨端确定，见 [M4](#M4)）
   - **墓碑同等参与比较**：删除也是带 `updatedAt` 的写操作，晚删者胜
3. **过期墓碑清除**：`deleted === true` 且 `now - updatedAt > 30天` → 丢弃
4. **孤儿任务改绑**：`todo.groupId` 不存在或已墓碑 → 改绑 `'default'`
5. **确定性排序**（两端收敛同一数组顺序）
   - todos：`order` → `createdAt` → `id`
   - groups：`createdAt` → `id`

> **边界**：同一条记录两端**同时**修改，LWW 仅保留 `updatedAt` 较大一侧（设计取舍，未做字段级合并）。

---

## 四、HTTP 同步桥 (`services/sync-bridge`)

零依赖 Node ≥18，单文件 `src/server.js`，`createBridge({ file, token, maxBody })` 可注入测试。

| 方法 | 路径 | 鉴权 | 行为 |
|---|---|---|---|
| GET | `/health` | 无 | `200 {"ok":true}` |
| GET | `/sync` | Bearer | `200 {etag, state}`；无文件时两者为 null |
| PUT | `/sync?etag=<当前etag>` | Bearer | body 为完整文件文本 |
| OPTIONS | 任意 | 无 | `204` + CORS 头 |

**PUT 结果**：
- `etag` 匹配 (或文件不存在且 `etag=`) → 原子写 → `200 {etag}`
- `etag` 不匹配 → `409 {etag: 当前值}`，客户端重读合并后重试
- 其它：token 缺/错 → `401`；body > 8MB → `413`；未知路径 `404`；方法错 `405`

### 实现要点

| 点 | 实现 |
|---|---|
| **鉴权** | `Authorization: Bearer <token>` → SHA256 + `timingSafeEqual` (常数时间、避免长度泄漏)；token <8 字符 fail-closed |
| **原子写** | `<file>.tmp.<pid>.<seq>` (wx + mode 0600) 写入后 `rename`，失败清理 tmp |
| **写串行化** | Promise 链，check+write 原子成对，防并发双过 etag 检查 |
| **CORS** | `Access-Control-Allow-Origin: *`，Methods `GET, PUT, OPTIONS`，Headers `Authorization, Content-Type` |
| **配置** (`.env`，systemd EnvironmentFile) | `SYNC_PORT`(8642)、`SYNC_FILE`、`SYNC_TOKEN`(32+字节随机串，**仅 .env、已 gitignore**) |

---

## 五、桌面端同步客户端 (`v1.0.0/src/main/sync-service.ts`)

- 传输：`ssh2` SFTP。`SyncConfig { enabled, host, port, username, remotePath }` (`remotePath` 支持 `~/`，经 `ext_openssh_expandPath` 展开)
- 首次启动 `ensureKeyPair()` 生成密钥对，公钥供用户上传 `authorized_keys`
- 周期：首拍 5s，之后 60s；离线指数退避 `5s × 2ⁿ` (上限 60s)
- 写入：合并后 `putAtomic` (tmp + `ext_openssh_rename`，退化到普通 rename)，失败重试 (3次/500ms)；写后**回读校验**内容一致
- 状态机：`OFF / SYNCING / SYNCED / OFFLINE / AUTH ERROR / REMOTE ERROR`，IPC 推给渲染进程页脚

> **桥与桌面关系**：桌面不走 HTTP，直接 SFTP 写 `SYNC_FILE` 同一路径；桥的写串行化只约束 HTTP 侧，桌面侧靠 SFTP 原子 rename + 客户端 LWW 收敛。

---

## 六、Web / 手机同步客户端 (HTTP)

两端 `SyncContext.tsx` 逻辑同构：

| 常量 | 值 | 说明 |
|---|---|---|
| `FIRST_RUN_DELAY_MS` | 5000 | 数据 Context 初始化后首拍延迟 |
| `BASE_INTERVAL_MS` | 60000 | 正常周期 |
| `OFFLINE_BACKOFF0_MS` | 5000 | 离线退避基数 `min(5s × 2ⁿ, 60s)` |
| `PUT_ATTEMPTS` | 3 | 409 冲突重试 (重读合并再 PUT，间隔 500ms×n) |
| fetch 超时 | 8000ms | `AbortController` |

**单周期流程**：
1. `GET /sync` 取 `{etag, state}`
2. `state === null` → 本地全量 `normalizeSynced` 后 `PUT ?etag=` 建档
3. 否则 `parseSyncFile`；解析失败 → `REMOTE ERROR`，不写回
5. `mergeSyncStates(本地, 远端)` → `PUT ?etag=<GET得到的>`；409 → 重读重合并重试 (≤3次)
5. 成功后把「合并结果」与「周期开始时本地快照」再合并一次 (回填飞行中编辑，LWW 保底)
6. 成功 → `SYNCED`、清离线计数；401 → `AUTH ERROR`；其它异常 → `OFFLINE` 累加退避

**触发时机**：首拍定时器、周期链式调度、Web 额外 `visibilitychange`/`online` 事件、设置页保存即触发。

**配置持久化**：
- Web: localStorage `syncConfig` `{ enabled, serverUrl, token }`
- 手机：AsyncStorage 同结构
- `enabled=false` 时周期链停摆、状态显示 OFF

---

## 七、配对指南

1. 服务器 `services/sync-bridge/.env` 的 `SYNC_TOKEN` 即配对 token（勿外传）
2. **手机 / Web**：设置弹窗填 `http://<SERVER_IP>:8642` + token → 勾选启用 → 测试连接 → 保存 → 60s 内出现 `SYNCED hh:mm`
3. **桌面**：SFTP 设置弹窗填主机/IP/端口/用户/远程路径 `~/sync.json`，首次把公钥追加到服务器 `~/.ssh/authorized_keys`

---

## 八、故障排查

| 现象 | 原因与处理 |
|---|---|
| `AUTH ERROR` | token 不对/被换；核对 `.env` `SYNC_TOKEN` |
| `OFFLINE` | 网络不通 / 桥没起 / 地址端口错；`curl http://<IP>:8642/health` |
| `REMOTE ERROR` | 远端 `sync.json` 损坏；人工修复 `/home/syncuser/sync.json` (可清为 `{"version":1,"todos":[],"groups":[]}`，各端下轮同步会全量重建——**会丢远端数据**，仅作最后手段) |
| Web 409 频发 | 多端高频同时写；重启桥清空写链，数据不丢 |
| 浏览器 CORS 报错 | 桥版本旧无 CORS 头；更新 server.js 重启 |
| 删除的任务复活 | 设备时钟偏差过大导致 `updatedAt` 落后；校准设备时间 |
| `REMOTE ERROR` 频发 | 远端文件损坏；人工修复或清空重建 |

---

> **关键常量**：`TOMBSTONE_TTL_MS = 30 * 86_400_000` | `VERSION = 1` | `MAX_BODY = 8MB`