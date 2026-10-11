# 云端部署与运维

目标环境：一台公网 Ubuntu 服务器（下文以阿里云 ECS 为例，其它云厂商同理），通过 SSH 访问（示例中别名 `cloud-server`，按你的 `~/.ssh/config` 替换）。承载两件事：

1. **Web 端**：nginx 托管静态构建产物，`http://<SERVER_IP>/`
2. **同步桥**：systemd 服务 `sync-bridge`，`http://<SERVER_IP>:8642`

## 1. 服务器布局

| 路径 | 用途 |
|---|---|
| `/var/www/hengsch-web/` | Web 构建产物（owner `www-data`） |
| `/etc/nginx/sites-available/hengsch-web` | nginx 站点配置（80 端口 default） |
| `/opt/hengsch/sync-bridge/` | 桥源码 + `.env`（owner `syncuser`） |
| `/home/syncuser/sync.json` | 同步数据文件（桥与桌面 SFTP 共用，600） |
| `/opt/node20/` | Node 20 安装（symlink 至 `/usr/local/bin/node`） |

防火墙：`ufw allow 80/tcp`、`ufw allow 8642/tcp`；阿里云安全组同步放行入方向 TCP 80 / 8642。

> 为什么不用 Vercel / Netlify：免费托管均为 HTTPS，浏览器会拦截对 HTTP 同步桥（:8642）的混合内容请求，故改为自托管。（仓库里曾有 `vercel.json` / `netlify.toml`，已删除。）

## 2. Web 端部署

### 2.1 nginx 配置

本地源文件：`C:\Users\hengxing\AppData\Local\Temp\opencode\hengsch-web.conf`；服务器路径 `/etc/nginx/sites-available/hengsch-web`。

```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    root /var/www/hengsch-web;
    index index.html;

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;

    # HTML 与 SW 脚本必须每次校验，否则发版后浏览器拿着旧 index.html
    # 引用已删除的 hash 资源 → 白屏
    location = /index.html {
        add_header Cache-Control "no-cache";
    }

    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache";
    }

    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}
```

缓存策略要点：

- `/`（即 index.html）与任意未命中路径（SPA 回退到 index.html）→ `no-cache`：浏览器每次向服务器校验
- `/assets/*`（vite 指纹文件名）→ 一年 immutable 长缓存
- PWA 的 `sw.js` 走 `/` 回退 → `no-cache`，保证新版本 Service Worker 及时接管（`registerType: 'autoUpdate'`）

### 2.2 发布流程

```powershell
# 1. 本地构建（v1.1.0-web 目录）
npx tsc --noEmit
npm run build

# 2. 上传
scp -r dist\* cloud-server:/tmp/hengsch-web-dist/

# 3. 原子替换 + 归属
ssh cloud-server "sudo rm -rf /var/www/hengsch-web/* && sudo cp -r /tmp/hengsch-web-dist/* /var/www/hengsch-web/ && sudo chown -R www-data:www-data /var/www/hengsch-web && sudo rm -rf /tmp/hengsch-web-dist"
```

更新 nginx 配置后需 `sudo nginx -t && sudo systemctl reload nginx`。

### 2.3 发布后验收

```powershell
# 缓存头
(Invoke-WebRequest http://<SERVER_IP>/ -Method Head).Headers['Cache-Control']        # no-cache
(Invoke-WebRequest http://<SERVER_IP>/assets/<某hash>.js -Method Head).Headers['Cache-Control']  # public, max-age=31536000, immutable

# 页面与资源
Invoke-WebRequest http://<SERVER_IP>/                      # 200，HTML 内引用的 js/css/sw 均 200
```

浏览器强刷一次（Ctrl+Shift+R）确认新版本生效。

## 3. 同步桥部署

### 3.1 首次部署

```bash
# 0. 前置：Node ≥18（本机 /opt/node20，已 symlink /usr/local/bin/node）
node -v

# 1. 上传源码
scp -r services/sync-bridge/* cloud-server:/opt/hengsch/sync-bridge/

# 2. 配置（服务器上）
cd /opt/hengsch/sync-bridge
cp .env.example .env && vim .env
# SYNC_PORT=8642
# SYNC_FILE=/home/syncuser/sync.json
# SYNC_TOKEN=<32+ 字节随机串>     ← 手机/Web 配对用这个值，勿提交仓库
chown -R syncuser:syncuser /opt/hengsch/sync-bridge

# 3. systemd
sudo cp deploy/sync-bridge.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now sync-bridge
systemctl status sync-bridge        # active (running)
journalctl -u sync-bridge -f        # 应见 listening 0.0.0.0:8642
```

systemd 单元要点：`User=syncuser`、`EnvironmentFile=.env`、`ProtectSystem=strict` + `ReadWritePaths=/home/syncuser`、`Restart=always`。

### 3.2 更新代码

```bash
scp services/sync-bridge/src/server.js cloud-server:/opt/hengsch/sync-bridge/src/
ssh cloud-server "sudo systemctl restart sync-bridge"
```

重启不丢数据：写入是 tmp+rename 原子替换；重启后写链清空，409 风险由客户端重试兜底。

### 3.3 验收

```bash
# 服务器或本地跑探针（9 项全绿）
bash services/sync-bridge/scripts/probe.sh http://<SERVER_IP>:8642 <SYNC_TOKEN>
```

覆盖：health 200、鉴权 GET 200、无 token/错 token 401、幂等 PUT 200、回读一致、stale etag 409、DELETE 405、未知路径 404。

CORS 验收（Web 端可用性前提）：

```bash
curl -si -X OPTIONS http://<SERVER_IP>:8642/sync | head -5          # 204 + Access-Control-Allow-*
curl -si -H "Origin: http://<SERVER_IP>" http://<SERVER_IP>:8642/health | grep -i access-control
```

单元测试（本地）：`cd services/sync-bridge && npm test`（node --test，11 项，含 CORS 断言）。

## 4. 数据与备份

- 数据文件：`/home/syncuser/sync.json`（单一事实来源，桌面 SFTP 与桥共用）
- 备份：`scp cloud-server:/home/syncuser/sync.json ./sync-backup-$(date +%F).json`
- 恢复：上传回原路径并 `chown syncuser:syncuser && chmod 600`，重启桥无必要（每次请求即时读盘）
- 清档重建（最后手段，会丢远端数据）：把文件改为 `{"version":1,"todos":[],"groups":[]}`，各端下轮同步会全量上传本地

## 5. 常见故障

| 症状 | 排查 |
|---|---|
| 网页白屏 | 多为缓存：确认 index.html / sw.js 为 `no-cache`；浏览器强刷；`journalctl`/`curl` 确认 `/assets/` 新 hash 存在 |
| `/health` 通但配对 401 | token 不一致；核对 `.env` 的 `SYNC_TOKEN` 与各端设置页 |
| 浏览器报 CORS 错 | 桥是旧版无 CORS 头；更新 server.js 重启（见 3.2） |
| 桥 active 但写 500 | 看 `journalctl -u sync-bridge`；检查 `/home/syncuser` 权限与磁盘 |
| nginx 502/静态 404 | `sudo nginx -t`；确认 `/var/www/hengsch-web` 已同步 dist 且属主 www-data |
| 端口不通 | `ufw status` + 阿里云安全组入方向规则 |
