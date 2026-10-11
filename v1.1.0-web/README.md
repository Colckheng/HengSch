# HengSch Todo — Web 端（v1.1.0-web）

浏览器版待办应用：Swiss Precision UI + PWA 离线 + HTTP 云同步 + 移动端适配。线上部署：<http://39.102.49.72/>

## 功能

- 待办：一次性 / 循环（每天 / 每周 / 每月 / 自定义）、完成切换、详情（含编辑 / 删除按钮）、拖拽排序
- 分组：建 / 改 / 删 / 颜色、筛选、默认「未分类」
- PWA：离线可用、安装到主屏（`display: standalone`）、Service Worker `autoUpdate`
- 云同步：HTTP 桥（etag 乐观锁 + LWW 合并），设置弹窗可**启用 / 停用**，详见 [../docs/sync.md](../docs/sync.md)
- 响应式：≤640px 适配手机（里程表缩小、页脚精简、操作按钮常显）、≤380px 小屏进一步收缩；iOS 安全区 + 16px 输入框（防自动缩放）、`100dvh`
- 触屏交互：长按 300ms 拖拽排序（黑线指示落点、拖后抑制误触点击、移动超 10px 取消长按）；`pointer: coarse` 禁文本选择

## 快速开始

依赖在 monorepo 根目录统一安装（本端是 workspace）：

```bash
# 仓库根目录
npm install

cd v1.1.0-web
npm run dev          # http://localhost:5174
```

shared 包经 vite alias **直接引用源码**（`../packages/*/src/index.ts`），无需先构建共享包。

## 构建与门禁

```bash
npx tsc --noEmit     # 类型门禁（strict + noUnusedLocals/noUnusedParameters）
npm run build        # tsc && vite build；workbox 生成 sw.js 预缓存
npm run preview      # 本地预览构建产物
```

生产产物在 `dist/`。部署到云端（nginx）见 [../docs/deployment.md](../docs/deployment.md)。

## 同步配置

页脚同步芯片 →「同步设置」：

1. 勾选「启用云同步」
2. 服务器地址：`http://39.102.49.72:8642`（桥根地址，无路径）
3. token：服务器 `services/sync-bridge/.env` 中的 `SYNC_TOKEN`
4. 「测试连接」（/health + /sync 鉴权）→「保存」→ 立即触发一轮，之后页脚显示 `SYNCED hh:mm`

行为细节（实现于 `src/context/SyncContext.tsx`）：

- 首拍 5s（等数据 Context 初始化），周期 60s；离线指数退避 `5s×2^n` 上限 60s
- 标签页重新可见（`visibilitychange`）/ 网络恢复（`online`）立即同步；`runningRef` 防并发
- PUT 冲突 409 → 重读重新合并重试（≤3 次）；远端文件损坏 → `REMOTE ERROR` 且不写回
- 取消「启用」保存后周期链停摆，状态 `OFF`
- 配置存 localStorage key `syncConfig`；设备 ID 存 key `deviceId`（uuid）
- fetch 超时 8s（`utils/syncConfig.ts` 的 `fetchWithTimeout`）

## 项目结构

```
src/
├── main.tsx                    # 入口
├── App.tsx                     # Provider 树 + 页脚同步芯片 + 弹窗编排
├── components/                 # TodoCard/List、Add/Edit/Detail、GroupManager、
│                               # SyncSettings、ConfirmDialog、ColorPicker、
│                               # GroupSelect、SwissSelect、Odometer、Icons、ErrorBoundary
├── context/
│   ├── TodoContext.tsx          # 待办状态 + 墓碑 + applySyncedTodos
│   ├── GroupContext.tsx         # 分组状态 + applySyncedGroups
│   └── SyncContext.tsx          # HTTP 同步状态机与调度
├── utils/
│   ├── localStorageAdapter.ts   # IStorage 实现
│   ├── device.ts                # deviceId（localStorage uuid）
│   └── syncConfig.ts            # 配置读写 / testConnection / fetchWithTimeout
├── types/index.ts
└── styles/index.css             # Swiss UI 全量样式 + 响应式 + 触屏规则
```

## 与其它端的差异

| 点 | Web | 桌面 / 手机 |
|---|---|---|
| 同步传输 | HTTP 桥 | 桌面 SFTP；手机 HTTP 桥 |
| 拖拽排序 | 自研：鼠标 + 触屏长按 | 桌面 HTML5 DnD；手机列表内按钮/拖拽 |
| 进程监测 | 无（仅类型保留 `monitor` 字段） | 桌面专属 |
| 窗口行为 | 无 | 桌面专属（小窗 / 贴边 / 置顶） |

## 门禁清单（提交前）

1. `npx tsc --noEmit`
2. `npm run build`
3. 根目录 `npm test`（业务逻辑由 shared-logic 单测覆盖，本端无独立测试文件）
