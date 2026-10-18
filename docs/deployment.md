# 云端部署与运维

> Swiss Precision · 零停机部署 · 单一事实来源 · 可逆回滚

---

## 目标环境

单台公网 Ubuntu 服务器（阿里云 ECS 为例，别名 `cloud-server`，按 `~/.ssh/config` 替换）。

| 路径 | 用途 |
|---|---|
| `/var/www/hengsch-web/` | Web 构建产物 (owner `www-data`) |
| `/etc/nginx/sites-available/hengsch-web` | nginx 站点配置 (80 端口 default) |
| `/opt/hengsch/sync-bridge/` | 桥源码 + `.env` (owner `syncuser`) |
| `/home/syncuser/sync.json` | 同步数据文件 (桥与桌面 SFTP 共用, 600) |
| `/opt/node20/` | Node 20 (symlink `/usr/local/bin/node`) |

防火墙：`ufw allow 80/tcp` `ufw allow 8642/tcp`；阿里云安全组同步放行入方向 TCP 80 / 8642。

> **为何不用 Vercel/Netlify**：免费托管均为 HTTPS，浏览器会拦截对 HTTP 同步桥 (:8642) 的混合内容请求，故改为自托管。

---

## 一、Web 端部署

### 1. nginx 配置

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

    # index.html 必须每次校验，否则发版后浏览器拿旧 index.html
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

**缓存策略**：
- `/` 与任意未命中路径 (SPA 回退 index.html) → `no-cache`：浏览器每次校验
- `/assets/*` (vite 指纹文件名) → 一年 immutable 长缓存
- PWA 的 `sw.js` 走 `/` 回退 → `no-cache`，保证新版本 SW 及时接管 (`registerType: 'autoUpdate'`)

### 发布流程

```powershell
# 1. 本地构建 (v1.1.0-web)
npx tsc --noEmit
npm run build

# 2. 上传
scp -r dist\* cloud-server:/tmp/hengsch-web-dist/

# 3. 原子替换 + 归属
ssh cloud-server "sudo rm -rf /var/www/hengsch-web/* && sudo cp -r /tmp/hengsch-web-dist/* /var/www/hengsch-web/ && sudo chown -R www-data:www-data /var/www/hengsch-web && sudo rm -rf /tmp/hengsch-web-dist"
```

更新 nginx 后：`sudo nginx -t && sudo systemctl reload nginx`。

### 发布后验收

```powershell
# 缓存头
(Invoke-WebRequest http://<SERVER_IP>/ -Method Head).Headers['Cache-Control']        # no-cache
(Invoke-WebRequest http://<SERVER_IP>/assets/<某hash>.js -Method Head).Headers['Cache-Control']  # public, max-age=31536000, immutable

# 页面与资源
Invoke-WebRequest http://<SERVER_IP>/                      # 200，HTML 内引用的 js/css/sw 均 200
```

浏览器强刷一次确认新版本生效。

---

## 二、同步桥部署

### 首次部署

```bash
# 0. 前置：Node ≥18 (本机 /opt/node20，已 symlink /usr/local/bin/node)
node -v

# 1. 上传源码
scp -r services/sync-bridge/* cloud-server:/opt/hengsch/sync-bridge/

# 2. 配置 (服务器上)
cd /opt/hengsch/sync-bridge
cp .env.example .env && vim .env
# SYNC_PORT=8642
# SYNC_FILE=/home/syncuser/sync.json
# SYNC_TOKEN=<32+ 字节随机串>     ← 手机/Web 配对用，勿提交仓库
chown -R syncuser:syncuser /opt/hengsch/sync-bridge

# 2. systemd
sudo cp deploy/sync-bridge.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now sync-bridge
systemctl status sync-bridge        # active (running)
journalctl -u sync-bridge -f        # 应见 listening 0.0.0.0:8642
```

systemd 要点：`User=syncuser`、`EnvironmentFile=.env`、`ProtectSystem=strict` + `ReadWritePaths=/home/syncuser`、`Restart=always`。

### 更新代码

```bash
scp services/sync-bridge/src/server.js cloud-server:/opt/hengsch/sync-bridge/src/
ssh cloud-server "sudo systemctl restart sync-bridge"
```

重启不丢数据：写入 tmp+rename 原子替换；重启后写链清空，409 风险由客户端重试兜底。

### 验收

```bash
# 服务器或本地跑探针 (11 项全绿)
bash services/sync-bridge/scripts/probe.sh http://<SERVER_IP>:8642 <SYNC_TOKEN>
```

覆盖：health 200、鉴权 GET 200、无 token/错 token 401、幂等 PUT 200、回读一致、stale etag 409、DELETE 405、未知路径 404。

CORS 验收：
```bash
curl -si -X OPTIONS http://<SERVER_IP>:8642/sync | head -5          # 204 + Access-Control-Allow-*
curl -si -H "Origin: http://<SERVER_IP>" http://<SERVER_IP>:8642/health | grep -i access-control
```

单元测试：`cd services/sync-bridge && npm test` (node --test，11 项，含 CORS 断言)。

---

## 三、数据与备份

| 项目 | 说明 |
|---|---|
| 数据文件 | `/home/syncuser/sync.json` (单一事实来源，桌面 SFTP 与桥共用) |
| 备份 | `scp cloud-server:/home/syncuser/sync.json ./sync-backup-$(date +%F).json` |
| 恢复 | 上传回原路径 `chown syncuser:syncuser && chmod 600`，重启桥无必要 (每次请求即时读盘) |
| 清档重建 | **最后手段，会丢远端数据**：文件改为 `{"version":1,"todos":[],"groups":[]}`，各端下轮同步会全量重建 |

---

## 五、常见故障

| 症状 | 排查 |
|---|---|
| 网页白屏 | 缓存：确认 index.html/sw.js 为 `no-cache`；浏览器强刷；`journalctl`/`curl` 确认 `/assets/` 新 hash 存在 |
| `/health` 通但配对 401 | token 不一致；核对 `.env` 的 `SYNC_TOKEN` 与各端设置页 |
| 浏览器报 CORS 错 | 桥版本旧无 CORS 头；更新 server.js 重启 |
| 桥 active 但写 500 | `journalctl -u sync-bridge`；检查 `/home/syncuser` 权限与磁盘 |
| nginx 502/静态 404 | `sudo nginx -t`；确认 `/var/www/hengsch-web` 已同步 dist 且属主 www-data |
| 端口不通 | `ufw status` + 阿里云安全组入方向规则 |

---

> **版本**: v1.0.3+ (桌面) | **许可**: ISC | **作者**: HengStar