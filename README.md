# HengSch Todo

多端待办事项管理软件（桌面 / Web / Android），Swiss Precision 设计语言，三端共享业务逻辑，支持多端云同步。

| 端 | 目录 | 技术栈 | 状态 |
|---|---|---|---|
| 桌面端 | `v1.0.0/` | Electron 30 + React 18 + Vite 5 | ✅ 完成（v1.0.3+，含 SFTP 同步与进程监测） |
| 网页端 | `v1.1.0-web/` | Vite 5 + React 18 + PWA | ✅ 完成（Swiss UI + HTTP 同步 + 移动端适配） |
| 移动端 | `v1.1.0-an/` | Expo 51 + React Native 0.74 | ✅ 完成（HTTP 同步 + APK 交付） |
| 同步桥 | `services/sync-bridge/` | Node ≥18，零依赖 HTTP 服务 | ✅ 已部署（阿里云 ECS） |

网页端与同步桥均**自托管**在你自己的服务器上，部署方法见 [docs/deployment.md](docs/deployment.md)。

## 功能总览

- **待办管理**：一次性 / 循环任务（每天 / 每周 / 每月 / 自定义天数）、完成切换（循环任务自动续期）、详情、编辑、删除（确认）、拖拽排序
- **分组管理**：建 / 改 / 删 / 颜色，按分组筛选，默认「未分类」分组
- **云同步**：三端共享同一份 `sync.json`（LWW + 墓碑合并，客户端合并），桌面走 SFTP，Web / 手机走 HTTP 桥，详见 [docs/sync.md](docs/sync.md)
- **桌面端专属**：小窗模式（640×560 上限）、四边贴边吸附 + 闲置缩入（4px 窄边、悬停弹出）、置顶、开机自启、窗口记忆、进程监测自动完成循环任务
- **Web 端专属**：PWA（离线 + 安装到主屏）、移动端响应式（≤640px / ≤380px）、触屏长按拖拽排序
- **设计**：Swiss Precision 风格（里程表数字、发丝线、直角卡片、纸感底色），三端视觉统一

## Monorepo 结构

```
HengSch/
├── v1.0.0/                  # Electron 桌面端（workspace）
├── v1.1.0-web/              # Web 端（workspace，Vite 别名直引 shared 源码）
├── v1.1.0-an/               # 移动端（独立工程，shared/ 为内嵌副本，npm run sync-shared 同步）
├── packages/
│   ├── shared-types/        # Todo / Group / SyncConfig / SyncState 等类型
│   ├── shared-logic/        # 业务逻辑 + 单测（vitest）：todo-utils、sync 合并、monitor
│   └── shared-storage/      # IStorage 存储抽象接口
├── services/
│   └── sync-bridge/         # HTTP 同步桥（零依赖 Node，systemd 部署）
├── docs/                    # 架构 / 同步协议 / 部署文档
├── DEVELOPMENT_PLAN.md      # 多端开发规划与变更记录（活文档）
└── package.json             # npm workspaces 根（不含 v1.1.0-an）
```

## 快速开始

根目录安装依赖（一次即可，覆盖桌面 + Web + 共享包）：

```bash
npm install
```

### 桌面端

```bash
cd v1.0.0
npm run electron:dev        # 开发（Vite + Electron）
npm run electron:build      # 打包（产物在 release/）
npm run lint                # ESLint 门禁（--max-warnings 0）
npx tsc --noEmit            # 类型门禁
```

### Web 端

```bash
cd v1.1.0-web
npm run dev                 # http://localhost:5174
npm run build               # tsc + vite build（含 PWA Service Worker）
npx tsc --noEmit            # 类型门禁（strict + noUnusedLocals/Parameters）
```

部署到云端见 [docs/deployment.md](docs/deployment.md)。

### 移动端

```bash
npm run sync-shared         # 先把 packages/ 源码同步进 v1.1.0-an/shared/（改过 shared 后必跑）
cd v1.1.0-an
npm run start               # Expo 开发服务器（--offline）
npm run android             # 本地 gradle 构建并安装到设备/模拟器
npx tsc --noEmit            # 类型门禁（移动端仅类型检查，无单测）
```

APK 交付：本地 `android/gradlew.bat assembleRelease`（需 JAVA_HOME）或 EAS 云构建，详见 [v1.1.0-an/README.md](v1.1.0-an/README.md)。

### 共享逻辑测试

```bash
npm test                    # 根目录一键跑所有 workspace 测试（shared-logic vitest，48 项）
```

同步桥自身测试（不在 workspaces 内，需单独跑）：

```bash
cd services/sync-bridge && npm test    # node --test，11 项
```

## 云同步一览

三端最终收敛到服务器上的**同一个文件** `/home/syncuser/sync.json`：

```
桌面端 ──SFTP(ssh2)──┐
                     ├──> sync.json <── HTTP PUT/GET ── sync-bridge :8642
Web 端  ──HTTP───────┤                        ↑
手机端  ──HTTP───────┘              （etag 乐观锁 + 原子写 + CORS）
```

- **合并永远在客户端**：`@hengsch/shared-logic` 的 `mergeSyncStates`（逐条 LWW、墓碑 30 天 TTL、孤儿任务改绑 default、确定性排序）
- **桥只做原子读写**：etag（sha1 前 12 位）乐观锁，冲突 409，写串行化 + tmp+rename
- **配对**：各端设置弹窗填服务器地址 + token（桥的 `.env` 中 `SYNC_TOKEN`），详见 [docs/sync.md](docs/sync.md)
- token 只放服务器 `.env`（已 gitignore），**不要提交到仓库**

## 开发约定

- 语言：UI 与文档中文；代码注释中文
- 提交：conventional commits（`feat(scope): ...` / `fix(scope): ...`）
- 门禁（提交前必过）：
  - 桌面：`npx tsc --noEmit` + `npm run lint`
  - Web：`npx tsc --noEmit` + `npm run build`
  - 移动：`npx tsc --noEmit`（改过 shared 后先 `npm run sync-shared`）
  - 根：`npm test`（48/48）
- `v1.1.0-an/shared/` 是**内嵌副本**不是源头；改业务逻辑一律改 `packages/`，再 `npm run sync-shared`
- Web / 桌面通过 vite 别名 / workspace 直接引用 `packages/*/src`，无需先构建共享包
- 本机约定：所有本地服务密码统一 `041698`（新增服务沿用，见全局 CLAUDE.md）

## 文档索引

| 文档 | 内容 |
|---|---|
| [docs/architecture.md](docs/architecture.md) | 目录结构、状态管理、数据模型、存储适配、各端接入 shared 的方式 |
| [docs/sync.md](docs/sync.md) | sync.json 格式、LWW 合并算法、桥协议、三端同步客户端行为 |
| [docs/deployment.md](docs/deployment.md) | 云端部署（nginx / sync-bridge systemd）、发布流程、验收、备份 |
| [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) | 多端开发规划、里程碑与变更记录 |
| [v1.0.0/README.md](v1.0.0/README.md) | 桌面端使用与开发说明 |
| [v1.1.0-web/README.md](v1.1.0-web/README.md) | Web 端开发、同步配置、触屏交互 |
| [v1.1.0-an/README.md](v1.1.0-an/README.md) | 移动端环境、构建 APK、sync-shared |
| [services/sync-bridge/README.md](services/sync-bridge/README.md) | 同步桥协议、部署、验收探针 |
| [packages/README.md](packages/README.md) | 共享包 API 一览 |

## 作者

HengStar · ISC License
