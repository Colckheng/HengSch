# sync-bridge — HengSch Todo HTTP 同步桥

零依赖 Node（≥18）HTTP 服务：Web / 手机端通过它读写 `sync.json`；桌面端走 SFTP 直写**同一个文件**。合并逻辑全在客户端（LWW + 墓碑，`@hengsch/shared-logic`），桥只做原子读写与 etag 乐观锁。已支持 CORS（Web 浏览器可直连）。

## 协议

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| GET | `/health` | 无 | `{"ok":true}` |
| GET | `/sync` | Bearer | `{"etag": "sha1前12位" \| null, "state": "字符串" \| null}` |
| PUT | `/sync?etag=<当前etag>` | Bearer | body 为完整文件文本；etag 匹配（或文件不存在且 etag 为空）→ 原子写，200 `{"etag":新值}`；不匹配 → 409 `{"etag":当前值}`，客户端需重读重合后重试 |
| OPTIONS | 任意 | 无 | 204 + CORS 头（浏览器预检） |

其它：token 缺失/错误 → 401；body >8MB → 413；未知路径 → 404；方法不对 → 405。
etag 校验含**空 etag 也会 409**（文件已存在时；防止客户端误判"无档"导致无条件覆盖）。

CORS 头（所有响应携带）：`Access-Control-Allow-Origin: *`、Methods `GET, PUT, OPTIONS`、Headers `Authorization, Content-Type`、`Max-Age 86400`。

鉴权实现：`Authorization: Bearer <token>`，sha256 后 `timingSafeEqual` 常数时间比较；token 配置 <8 字符拒绝启动。

## 服务器部署（阿里云 ECS 39.102.49.72，Ubuntu）

```bash
# 0. 前置：Node ≥18（本机装在 /opt/node20，已 symlink /usr/local/bin/node）
node -v

# 1. 放文件（本地 → 服务器）
scp -r services/sync-bridge/* cloud-server:/opt/hengsch/sync-bridge/

# 2. 配置（服务器上）
cd /opt/hengsch/sync-bridge
cp .env.example .env && vim .env
# SYNC_PORT=8642
# SYNC_FILE=/home/syncuser/sync.json
# SYNC_TOKEN=<32+ 字节随机串>      ← 与各端设置页一致；勿提交仓库（.env 已 gitignore）
chown -R syncuser:syncuser /opt/hengsch/sync-bridge /home/syncuser/sync.json 2>/dev/null || true

# 3. systemd
sudo cp deploy/sync-bridge.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now sync-bridge
systemctl status sync-bridge   # active (running)
journalctl -u sync-bridge -f   # 应见 listening 0.0.0.0:8642

# 4. 防火墙
ufw allow 8642/tcp && ufw reload          # 主机防火墙
# 阿里云安全组：放行 TCP 8642（出方向默认全开，入方向需加规则）

# 5. 验收（探针自带 token 参数）
bash scripts/probe.sh http://39.102.49.72:8642 <SYNC_TOKEN>   # 9 项全绿
```

> 配置键以 `.env.example` 为准：`SYNC_PORT` / `SYNC_FILE` / `SYNC_TOKEN`（`process.env` 优先于 .env）。

## 测试

```bash
npm test          # node --test，11 项：鉴权、etag/409、原子写、回读、CORS（OPTIONS/ACAO）、413/404/405
```

## 客户端配对

### Web 端（v1.1.0-web）
打开 <http://39.102.49.72/> → 页脚同步芯片 →「同步设置」→ 勾选启用 → 地址 `http://39.102.49.72:8642` → token → 测试连接 → 保存。

### 手机端（v1.1.0-an）
App 底部状态条（`SYNC OFF — 未配置`）→「同步设置」→ 同上填写 → 保存 → 状态条 60s 内变 `SYNCED hh:mm`。

状态机（Web / 手机一致）：`SYNCING / SYNCED / OFFLINE / AUTH ERROR / REMOTE ERROR`；点击状态条可重测与「立即同步」。

### 桌面端（v1.0.0）
不走本桥：SFTP 直写 `SYNC_FILE` 同一路径，配置见桌面端 README 的「云同步（SFTP）」。

## 注意

- **token 只放 `.env`（已 gitignore），不要提交**；换 token 需同步改手机 / Web 设置页。
- 桌面 SFTP 路径必须是 `/home/syncuser/sync.json`（与 `SYNC_FILE` 同文件）；桥写文件的属主是 `syncuser`，权限 600。
- 远端文件损坏（非 version 1 合法 JSON）→ 客户端显示 `REMOTE ERROR` 且**不写回**，需人工修复文件。
- 重启服务：`systemctl restart sync-bridge`（文件不丢，tmp+rename 原子写；写链清空由客户端 409 重试兜底）。

## 文件一览

```
src/server.js         # HTTP 服务（createBridge 可注入 file/token/maxBody 测试）
src/auth.js           # Bearer 常数时间鉴权
test/server.test.js   # node --test 单测
scripts/probe.sh      # 部署验收探针（9 项）
deploy/sync-bridge.service  # systemd 单元（syncuser、EnvironmentFile、ReadWritePaths）
.env.example          # SYNC_PORT / SYNC_FILE / SYNC_TOKEN
```
