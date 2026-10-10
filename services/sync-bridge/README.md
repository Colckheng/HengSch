# sync-bridge — HengSch Todo HTTP 同步桥

零依赖 Node（≥18）HTTP 服务：手机端 v1.1.0-an 通过它读写 `sync.json`；桌面端 v1.0.0 走 SFTP 直写**同一个文件**。合并逻辑全在客户端（LWW + 墓碑，`@hengsch/shared-logic`），桥只做原子读写与 etag 乐观锁。

## 协议

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| GET | `/health` | 无 | `{"ok":true}` |
| GET | `/sync` | Bearer | `{"etag": "sha1前12位" \| null, "state": "字符串" \| null}` |
| PUT | `/sync?etag=<当前etag>` | Bearer | body 为完整文件文本；etag 匹配（或文件不存在）→ 原子写，200 `{"etag":新值}`；不匹配 → 409 `{"etag":当前值}`，客户端需重读重合后重试 |

其它：token 缺失/错误 → 401；body >8MB → 413；未知路径 → 404；方法不对 → 405。
etag 校验含**空 etag 也会 409**（防止客户端误判"无档"导致无条件覆盖）。

## 服务器部署（阿里云 ECS 39.102.49.72，Ubuntu 22.04）

```bash
# 0. 前置：Node ≥18（本机装在 /opt/node20，已 symlink /usr/local/bin/node）
node -v

# 1. 放文件（本地 → 服务器）
scp -r services/sync-bridge/* cloud-server:/opt/hengsch/sync-bridge/

# 2. 配置（服务器上）
cd /opt/hengsch/sync-bridge
cp .env.example .env && vim .env   # PORT=8642 / SYNC_FILE=/home/syncuser/sync.json / AUTH_TOKEN=<随机64hex>
chown -R syncuser:syncuser /opt/hengsch/sync-bridge /home/syncuser/sync.json 2>/dev/null || true

# 3. systemd
sudo cp deploy/sync-bridge.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now sync-bridge
systemctl status sync-bridge   # active (running)
journalctl -u sync-bridge -f   # 应见 listening 0.0.0.0:8642

# 4. 防火墙
ufw allow 8642/tcp && ufw reload          # 主机防火墙
# 阿里云安全组：放行 TCP 8642（出方向默认全开，入方向需加规则）

# 5. 验收（本地跑，需无 Bearer 鉴权的 probe 自带 token）
bash scripts/probe.sh http://39.102.49.72:8642 <token>   # 9 项全绿
```

## 手机配对（v1.1.0-an）

1. 手机与电脑同网无所谓（桥走公网），打开 App 底部状态条（`SYNC OFF — 未配置`）→ 进入「同步设置」；
2. 服务器地址填 `http://39.102.49.72:8642`，token 粘贴服务器 `.env` 中的 `AUTH_TOKEN`；
3. 点「测试连接」→ 应显示「连接成功，鉴权通过」→「保存」→ 状态条 60s 内变 `SYNCED hh:mm`；
4. 状态机：`SYNCING / SYNCED / OFFLINE / AUTH ERROR / REMOTE ERROR`，点击状态条可随时重测与「立即同步」。

## 注意

- **token 只放 `.env`（已 gitignore），不要提交**；换 token 需同步改手机设置页。
- 桌面 SFTP 路径必须是 `/home/syncuser/sync.json`（与 `SYNC_FILE` 同文件）；桥写文件的属主是 `syncuser`，权限 600。
- 远端文件损坏（非 version 1 合法 JSON）→ 客户端显示 `REMOTE ERROR` 且**不写回**，需人工修复文件。
- 服务无 CORS 头：浏览器直连会被 CORS 拦（RN 原生不受影响）；如需 web 端同步再补 `Access-Control-Allow-*` 与 OPTIONS 处理。
- 重启服务：`systemctl restart sync-bridge`（文件不丢，tmp+rename 原子写）。
