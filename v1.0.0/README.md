# HengSch Todo — 桌面端（v1.0.0）

Electron 桌面待办应用：Swiss Precision 设计、小窗贴边、进程监测自动完成、SFTP 云同步。

## 功能特性

### 待办事项
- 一次性 / 循环任务（每天 / 每周 / 每月 / 自定义天数），完成时自动续期下次到期
- 原生 HTML5 拖拽排序、详情查看、编辑、删除（确认框）
- 一次性 / 循环任务均可配置**进程监测**：绑定进程名，可选「自动监测」（运行达标自动完成）与「进程结束询问」（退出时弹窗复核，可撤销自动完成）（详见下文）

### 分组管理
- 建 / 改 / 删 / 颜色，按分组筛选，默认「未分类」分组不可删

### 窗口与系统
- 置顶、最小化、最大化、开机自启（Windows / macOS / Linux）
- 小窗模式（紧凑视图）：自动隐藏顶栏、最多显示 6 条、自动置顶，Alt+Q 退出；独立记忆位置大小
- 四边贴边吸附（阈值 16px，多显示器 workArea）+ 闲置 5s 自动缩入（窄边 4px、180ms 滑动动画、悬停窄边弹出）；开关在设置中
- 主窗口 / 小窗位置大小分别记忆

### 云同步（SFTP）
- 直写服务器上的 `sync.json`（与手机 / Web 端 HTTP 桥同一个文件），LWW + 墓碑客户端合并
- 设置弹窗：主机 / 端口 / 用户 / 远端路径（支持 `~/`）+「启用云同步」+ 测试连接
- 首次启动生成 SSH 密钥对，公钥自动展示，上传到服务器 `authorized_keys` 即可
- 页脚状态芯片：`SYNCING / SYNCED / OFFLINE / AUTH ERROR / REMOTE ERROR`
- 协议与合并算法详见 [../docs/sync.md](../docs/sync.md)

### 进程监测（桌面专属）
- 一次性 / 循环任务可绑定「进程名」，两个独立开关可单选可都选：
  - **自动监测**：进程累计运行达阈值分钟数即自动完成（走 `toggleTodoStatus` 续期逻辑）
  - **进程结束询问**：观察到进程退出沿弹 Swiss 风格询问小窗「做了吗」，答「还没做」可撤销自动完成（方案 A，询问优先）；同一天同一任务只问一次——答复（含 ESC 关闭）落盘持久化，重启后当天也不再重复弹；撤销后当日进度重置、重新计时

- 主进程 30s 轮询进程列表（tasklist / ps）
- 可选「监测日志」：写 Windows 计划任务 `HengSchMonitor` 输出，保留 7 天；开启后支持离线期间错过退出的当天补问一次（已答复过的任务不再补问）
- 设置界面 `MonitorSection` 提供进程名搜索、双开关、阈值、日志开关

### 系统托盘与退出
- 常驻系统托盘（通知区域）图标：左键单击/双击显示主窗口，右键菜单「显示主窗口 / 退出」
- 点击窗口关闭按钮（X）= 隐藏到托盘，后台继续监测与询问；真正退出用托盘右键「退出」，退出时自动取消排队中的询问与当前小窗，退出后零残留进程
- 单实例锁：重复双击启动不再产生第二个实例（避免两个进程各自轮询弹窗），改为聚焦已有窗口

### 界面
- Swiss Precision 风格：里程表数字、发丝线、直角纸感卡片，与 Web / 手机端视觉统一

## 技术栈

- Electron 30 + React 18 + TypeScript + Vite 5（vite-plugin-electron）
- 状态：Context + useReducer；存储：electron-store（主进程）经 preload IPC 暴露
- 拖放：原生 HTML5 Drag and Drop；SFTP：ssh2
- 打包：electron-builder（产物 `release/`）
- 共享：`@hengsch/shared-types` / `shared-logic` / `shared-storage`（workspace 依赖）

## 系统要求

- Node.js ≥ 16（开发），Windows 10+ / macOS 10.15+ / Linux

## 安装与运行

```bash
# 仓库根目录（workspace 安装）
npm install

cd v1.0.0
npm run electron:dev      # 开发（Vite + Electron）
npm run build             # tsc && vite build
npm run electron:build    # 打包，产物在 release/
```

代码检查：

```bash
npm run lint              # ESLint（--max-warnings 0）
npm run format            # Prettier
npx tsc --noEmit          # 类型门禁
```

## 使用说明

### 添加待办
1. 顶部「+」→ 填标题（必填）、描述、类型（一次性 / 循环）、分组
2. 循环任务选周期（每天 / 每周 / 每月 / 自定义天数）；任意类型可展开「进程监测」配置自动监测 / 进程结束询问
3. 「添加」保存

### 管理待办
- 完成切换：卡片左上角圆形复选框（循环任务完成后自动算下次到期）
- 详情：点击卡片；编辑 ✏️ / 删除 🗑️：卡片右下角（删除有确认）
- 排序：拖拽卡片

### 分组管理
顶部「📁」→ 新建（名称 + 颜色）/ 编辑 / 删除（默认分组不可删）；主界面点分组按钮筛选。

### 窗口控制（无边框标题栏右侧）
- ▲/△ 置顶 · ⬛/⬜ 小窗（Alt+Q 退出）· ⏻/⏼ 自启 · − 最小化 · □ 最大化 · ✕ 关闭

### 云同步配置
页脚同步芯片 →「同步设置」：
1. 填 SFTP 主机（你的服务器 IP）、端口 22、用户、远端路径 `~/sync.json`
2. 勾选「启用云同步」；把弹窗里的公钥追加到服务器 `~/.ssh/authorized_keys`
3. 「测试连接」（连通 + 目录可写）→「保存」→ 首拍 5s 后开始，之后 60s 周期

## 项目结构

```
v1.0.0/
├── src/
│   ├── main/                         # 主进程
│   │   ├── index.ts                  # 窗口、贴边/缩入状态机、IPC
│   │   ├── preload.ts                # 白名单 API 暴露
│   │   ├── auto-start.ts             # 开机自启
│   │   ├── sync-service.ts           # SFTP 同步（ssh2、原子写、周期调度）
│   │   └── monitor-service.ts        # 进程监测轮询与自动完成
│   └── renderer/                     # 渲染进程
│       ├── App.tsx / main.tsx
│       ├── components/               # TodoCard/List、Add/Edit/Detail、
│       │                             # GroupManager、SyncSettings、MonitorSection、
│       │                             # ConfirmDialog、ColorPicker、GroupSelect、
│       │                             # SwissSelect、Odometer、Icons、WindowControls
│       ├── context/                  # TodoContext / GroupContext / WindowContext
│       ├── types/                    # index.ts + electron.d.ts
│       └── styles/index.css
├── package.json / tsconfig.json / vite.config.ts / electron-builder.json
└── README.md
```

## 核心实现

### 状态管理
- **TodoContext**：增删改查、完成切换（shared `toggleTodoStatus`）、排序、同步结果整体应用
- **GroupContext**：分组 CRUD
- **WindowContext**：置顶 / 小窗 / 最小化等 UI 状态

### 数据持久化（electron-store）
待办、分组、窗口位置大小（含小窗独立）、置顶、自启状态、同步配置（私钥单独存）、监测进度与日志开关。

### 主/渲染 IPC
窗口控制、存储读写、自启切换、同步（configure / test / status 推送）、监测配置。

### 贴边缩入（主进程状态机）
吸附阈值 16px；缩入后窄边 4px；悬停 6px 命中弹出；动画 180ms 多帧 `setBounds`；多显示器取窗口所在 `workArea`；拖动过程抑制缩入。

### SFTP 同步（`src/main/sync-service.ts`）
ssh2 连接 → `ext_openssh_expandPath` 展开 `~/` → 读远端 → `mergeSyncStates` → 原子写（tmp + rename，失败退化普通 rename，带重试）→ 回读校验。常量：首拍 5s、周期 60s、离线退避 5s×2ⁿ 上限 60s、PUT 重试 3 次。

## 门禁（提交前）

1. `npx tsc --noEmit`
2. `npm run lint`（零警告）
3. 仓库根 `npm test`（shared-logic 62 项，覆盖本端复用的合并 / 循环续期 / 监测询问逻辑）

## 已知问题

- 大量待办（数百条+）未做虚拟滚动，可能出现渲染性能瓶颈
- 自启状态在部分平台的检测可能不准（系统 API 差异）

## 安全

- `contextIsolation: true` + `nodeIntegration: false`，preload 白名单暴露
- SSH 私钥独立存储，不随 SyncConfig 序列化到普通字段
- 校验用户输入；避免动态 exec（监测用固定 tasklist/ps 命令）

## 更新日志

### v1.0.0
- 初始版本：待办 / 分组 / 小窗 / 置顶 / 自启 / 拖放排序

### v1.0.1
- 小窗四边自动吸附（多显示器）、闲置自动缩入 + 悬停弹出（无动画版）

### v1.0.2
- 缩入 / 弹出动效（180ms）；窄边固定 4px；启动不再自动开 DevTools

### v1.0.3
- 修复角落多边吸附优先级（固定 上 > 下 > 左 > 右）、悬停弹出命中、弹出后无法移动
- 后续修复：右上角等角落缩入后循环弹出问题（已解决并验收）

### v1.0.4
- Swiss Precision 设计语言移植（Odometer / SwissSelect / 直角卡片）
- 进程监测自动完成循环任务 + 监测日志
- SFTP 云同步（与手机 / Web 共享 sync.json，LWW + 墓碑）

### v1.1.0（当前工作区）
- 修复 Windows 开机自启（`setLoginItemSettings` 正确指向安装版路径，启动时自动修复旧注册表残留）
- 进程监测升级：一次性任务可绑定进程；「自动监测」与「进程结束询问」双开关（可都选，询问结果优先、可撤销自动完成）；离线错过退出当天补问一次

## 作者

HengStar · ISC License
