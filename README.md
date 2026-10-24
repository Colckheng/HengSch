# HengSch Todo

```
┌─────────────────────────────────────────────────────────────────┐
│  HengSch Todo  v1.0.3                                            │
│  多端待办管理 · Swiss Precision 设计语言 · 三端同构 · 云同步    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 为什么不一样

HengSch 不是又一个待办清单——它把待办做到了桌面、进程和对话里：

- **❶ AI 待办管家（桌面端）** — 主窗口侧边抽屉里用一句话就能建、改、查待办。主进程的 DeepSeek 工具循环负责理解意图：读操作立即回填，写操作一律先生成可编辑的「提案-确认卡」，你点确认才落盘并走云同步。批量提案串行确认、两档详细程度，还能顺手选好循环提醒时刻——AI 能提议，不能替你做主。
- **❷ 到点纸片提醒** — 提醒不是通知中心里一闪而过的横幅，是一张飘到桌面上的纸片：静止时缓慢游走，长按揉成团丢进纸篓只关本次提醒；稍后/完成先写盘再消失，跨日、重启都会补弹，不会静默丢掉。
- **❸ 进程监测** — 待办可以绑到应用进程上：用够时长自动完成，进程退出时弹窗询问、三态裁决，当天只问一次，离线错过的退出当天补问。「打开软件练琴 30 分钟」这类待办，软件替你记账。
- **❹ 自建云同步，不绑厂商云** — 三端共享同一份 sync.json：LWW + 30 天墓碑在客户端合并，同步桥是零依赖 Node 服务，跑在自己的服务器上。数据在哪、怎么合的，代码里都写得明明白白。
- **❺ 贴边待命的桌面形态** — 闲置缩成 4px 窄边贴在屏幕边上，悬停才弹出；小窗模式、关闭到托盘、单实例锁——它是个常驻桌面的工具，不是又一个需要你想起来打开的 App。

设计语言：Swiss Precision —— 纸感底色、发丝线、直角卡片、里程表数字。

---

## ❶  端·技术栈·状态

| 端 | 目录 | 技术栈 | 状态 |
|---|---|---|---|
| **桌面** | `v1.0.0/` | Electron 30 · React 18 · Vite 5 · TypeScript | ✅ 完成 (v1.0.3+ · SFTP同步 · 进程监测 · 到点提醒 · AI待办管家) |
| **Web** | `v1.1.0-web/` | Vite 5 · React 18 · PWA · TypeScript | ✅ 完成 (Swiss UI · HTTP同步 · 移动端适配) |
| **移动** | `v1.1.0-an/` | Expo 51 · RN 0.74 · React 18 | ✅ 完成 (HTTP同步 · APK交付) |
| **同步桥** | `services/sync-bridge/` | Node ≥18 · 零依赖 · HTTP网关 | ✅ 已部署 (阿里云ECS · systemd) |

> **Web 端与同步桥均自托管** · 部署详见 [`docs/deployment.md`](docs/deployment.md)  

---

## ❷  功能矩阵

```
┌────────────────────┬────────────────────────────────────────────────────┐
│ 待办管理            │ 一次性 / 循环 (日/周/月/自定义) · 完成切换自动续期  │
│                    │ 详情 · 编辑 · 删除确认 · 拖拽排序 (HTML5 原生)       │
├────────────────────┼────────────────────────────────────────────────────┤
│ 分组管理            │ 建/改/删/颜色 · 筛选 · 默认「未分类」不可删       │
├────────────────────┼────────────────────────────────────────────────────┤
│ 云同步              │ 三端共享同一份 sync.json (LWW + 墓碑合并)        │
│                    │ 桌面 SFTP · Web/手机 HTTP 桥 · 客户端合并        │
├────────────────────┼────────────────────────────────────────────────────┤
│ 桌面专属            │ 小窗模式 (640×560上限) · 四边贴边吸附            │
│                    │ 闲置缩入 (4px窄边·悬停弹出) · 置顶/开机自启       │
│                    │ 进程监测 (达标自动完成 / 退出沿询问 / AI判定)   │
│                    │ 到点提醒 (全屏纸片 · 揉团丢纸篓 · 稍后/完成)     │
│                    │ AI 待办管家 (提案确认卡 · 本地语音 · 批量串行)   │
├────────────────────┼────────────────────────────────────────────────────┤
│ Web 专属            │ PWA (离线+安装) · 响应式 ≤640/380px             │
│                    │ 触屏长按 300ms 拖拽排序 · iOS安全区+16px         │
├────────────────────┼────────────────────────────────────────────────────┤
│ 设计系统            │ Swiss Precision: 里程表数字 · 发丝线 · 直角卡片  │
│                    │ 纸感底色 (#FAFAF8) · 墨黑 (#0A0A0A) · 发丝线     │
└────────────────────┴────────────────────────────────────────────────────┘
```

---

## ❸ Monorepo 拓扑

```
HengSch/
├── v1.0.0/                 # Electron 桌面端 (workspace)
├── v1.1.0-web/             # Web 端 (workspace, Vite alias 直引 shared)
├── v1.1.0-an/              # 移动端 (独立工程, shared/ 为内嵌副本)
├── packages/
│   ├── shared-types/       # 类型定义
│   ├── shared-logic/       # 纯函数 + 单测 (vitest)
│   └── shared-storage/     # 存储抽象接口
├── services/
│   └── sync-bridge/        # HTTP 同步桥 (零依赖, systemd)
├── docs/                   # 架构 / 同步协议 / 部署文档
├── DEVELOPMENT_PLAN.md     # 规划与变更记录
└── package.json            # npm workspaces 根 (不含 v1.1.0-an)
```

```jsonc
{
  "workspaces": ["v1.0.0", "v1.1.0-web", "packages/*"],
  "overrides": { "react": "18.2.0", "react-dom": "18.2.0" }
}
```

> `v1.1.0-an` 不在 workspaces：EAS/gradle 要求自包含工程，`shared/` 为 `packages/*` 的内嵌副本，`npm run sync-shared` 从源头拷贝。改业务逻辑永远改 `packages/`，改完必跑 `npm run sync-shared`。

---

## ❹ 快速启动

### 依赖安装 (一次即可)
```bash
npm install
```

### 桌面端
```bash
cd v1.0.0
npm run electron:dev       # 开发 (Vite + Electron)
npm run electron:build     # 打包 (产物在 release/)
npm run lint               # ESLint 门禁 (--max-warnings 0)
npx tsc --noEmit           # 类型门禁
```

### Web 端
```bash
cd v1.1.0-web
npm run dev                # http://localhost:5174
npm run build              # tsc + vite build (含 PWA Service Worker)
npx tsc --noEmit           # 类型门禁 (strict + noUnusedLocals/Parameters)
```

### 移动端
```bash
npm run sync-shared        # 先把 packages/ 源码同步进 v1.1.0-an/shared/
cd v1.1.0-an
npm run start              # Expo 开发服务器 (--offline)
npm run android            # 本地 gradle 构建并安装到设备/模拟器
npx tsc --noEmit           # 类型门禁 (移动端仅类型检查, 无单测)
```

### APK 交付
```bash
cd v1.1.0-an
./android/gradlew.bat assembleRelease   # 需 JAVA_HOME
# 或 EAS 云构建
```

### 共享逻辑测试
```bash
npm test                    # 根目录一键跑所有 workspace 测试 (shared-logic vitest, 62项)
```

### 同步桥测试 (不在 workspaces 内)
```bash
cd services/sync-bridge && npm test    # node --test, 11 项
```

---

## ❺ 云同步一览

```
┌──────────────────────────────────────────────────────────────────────┐
│  三端最终收敛到服务器上的同一个文件 /home/syncuser/sync.json          │
│                                                                      │
│  桌面端 ──SFTP(ssh2)──┐                                              │
│                       ├──> sync.json <── HTTP PUT/GET ── sync-bridge │
│  Web 端  ──HTTP───────┤                        :8642                │
│ 手机端  ──HTTP───────┘                        ↑                       │
│                                            (etag 乐观锁 + 原子写 + CORS)  │
└──────────────────────────────────────────────────────────────────────┘
```

- **合并永远在客户端**：`@hengsch/shared-logic` 的 `mergeSyncStates` (逐条 LWW、墓碑 30 天 TTL、孤儿任务改绑 default、确定性排序)
- **桥只做原子读写**：etag (sha1 前 12 位) 乐观锁，冲突 409，写串行化 + tmp+rename
- **配对**：各端设置弹窗填服务器地址 + token (桥 `.env` 中 `SYNC_TOKEN`，已 gitignore，**不要提交到仓库**)

---

## ❻ 文档索引

| 文档 | 内容 |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | 总览、Monorepo、共享包、数据模型、状态管理、各端架构 |
| [`docs/sync.md`](docs/sync.md) | sync.json 格式、LWW 合并算法、桥协议、三端同步行为 |
| [`docs/deployment.md`](docs/deployment.md) | 云端部署 (nginx / systemd)、发布流程、验收、备份、故障排查 |
| [`DEVELOPMENT_PLAN.md`](DEVELOPMENT_PLAN.md) | 多端开发规划、里程碑、变更记录 |
| [`v1.0.0/README.md`](v1.0.0/README.md) | 桌面端使用与开发说明 |
| [`v1.1.0-web/README.md`](v1.1.0-web/README.md) | Web 端开发、同步配置、触屏交互 |
| [`v1.1.0-an/README.md`](v1.1.0-an/README.md) | 移动端环境、构建 APK、sync-shared |
| [`services/sync-bridge/README.md`](services/sync-bridge/README.md) | 同步桥协议、部署、验收探针 |
| [`packages/README.md`](packages/README.md) | 共享包 API 一览 |

---

## ❼ 开发约定

```
语言：UI 与文档中文；代码注释中文
提交：conventional commits (feat/fix/chore/refactor/docs/test)
门禁 (提交前必过)：
  桌面: npx tsc --noEmit + npm run lint
  Web  : npx tsc --noEmit + npm run build
  移动  : npx tsc --noEmit (改 shared 后先 npm run sync-shared)
  根   : npm test (62+11=73 项)
```

- `v1.1.0-an/shared/` 是**内嵌副本**不是源头；改业务逻辑永远改 `packages/`，再 `npm run sync-shared`
- Web / 桌面通过 vite 别名 / workspace 直接引用 `packages/*/src`，无需先构建共享包

---

## ❼ 作者

**HengStar** · ISC License

---

```
┌─────────────────────────────────────────────────────────────────┐
│  里程表: v1.0.3  ·  里程碑: Swiss Precision  ·  许可: ISC      │
└─────────────────────────────────────────────────────────────────┘
```

---

> **瑞士风格设计注记**  
> - 里程表数字：Inter Tight ExtraBold / 补零三位  
> - 发丝线：`#E5E5E3` / 1px 直线  
> - 纸感底色：`#FAFAF8` / 墨黑 `#0A0A0A` / 信号红 `#E63329`  
> - 直角卡片 · 无圆角 · 无阴影 · 紧凑节奏 · 留白呼吸