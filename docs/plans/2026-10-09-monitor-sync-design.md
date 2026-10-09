# HengSch Todo · 进程监测 + 云同步 设计文档

日期：2026-10-09
状态：已与用户逐节确认（三节全部批准）
范围：`v1.0.0` 桌面端（Electron 30 + React 18 + electron-store）

---

## 0. 决策记录（澄清问答结论）

### 功能 1 · 进程监测

| # | 问题 | 决定 |
|---|------|------|
| 1 | 「运行 10 分钟」判定 | **A. 进程存在即计时**（挂机、切后台都算） |
| 2 | 任务↔应用绑定 | **C. 运行进程列表选择 + 手动输入 exe 名兜底** |
| 3 | 计时累计 | **A. 当天累计、跨天清零**（早 5min + 晚 5min = 达标） |
| 4 | 适用范围 | **A. 仅循环任务（recurring）**可挂监测 |
| 5 | 达标反馈 | **B. 标记完成 + Windows 系统通知** |
| 冷启动 | 打开软件时回溯今天 | 三层：①运行中 30s 轮询 ②冷启动回溯「当前仍在运行」的进程 ③可选增强覆盖「打开前已退出」的空档 |
| ③ 机制 | 审计日志 vs 快照任务 | **乙·用户级快照计划任务**（每 2 分钟、本人身份、无需 UAC、不碰系统审计策略） |

### 功能 2 · 云同步

| # | 问题 | 决定 |
|---|------|------|
| 6 | 服务器 | **A. 公网服务器**（可跑 Docker；无域名——HTTPS 方案因此被排除） |
| 7 | 同步行为 | **B. 自动定时**（每 60s 推拉 + 启动时 + 手动） |
| 8 | 同步范围 | **A. 仅数据**（待办 + 分组）；窗口/置顶/自启等设置每台设备独立 |
| 选型 | 架构 | **方案 3：SFTP 文件合并同步**（服务器零部署，SSH 自带加密与鉴权） |

---

## 1. 进程监测系统

### 1.1 架构与数据流

```
渲染层                         主进程
任务保存 ──monitor:configure──▶ MonitorRegistry [{todoId, exeName, thresholdMinutes}]
                                 │ 每 30s: tasklist /fo csv（单次 ~50ms，一次覆盖全部 exe）
                                 │ 命中 → 记账（见 1.2）
进度变化 ◀──monitor:progress─────┤ （渲染层用于行内 meta 显示）
达标     ◀──monitor:completed────┤ ──▶ new Notification() 系统通知
                                 │ 渲染层收到后复用现有 updateTodo 标记完成
```

- 监测配置**不持久化**：冷启动回溯在渲染层加载完 todos、首次 `monitor:configure` 到达后执行一次，之后进入 30s 循环。
- 进度持久化在主进程 electron-store：`monitorProgress`，键 `${todoId}:${YYYY-MM-DD}`，值 `{ ms, checkpointAt, notified }`；启动时清理 7 天前的键。

### 1.2 记账算法（核心，放 `@hengsch/shared-logic` 纯函数）

事件流输入：`(timestamp, present)` 有序事件（来源：30s 轮询 / 冷启动 StartTime / 计划任务日志行）。

```
对每个 monitor：
  delta = timestamp - checkpointAt
  若 present 且未达标：
      ms += min(delta, 180_000)      // 单步封顶 180s
  checkpointAt = timestamp           // 无论 present 与否都推进 ← 最易错点
  若 ms >= threshold*60_000 且 !notified：
      notified = true → 触发完成 + 通知
```

- **封顶 180s**：覆盖「2 分钟日志 tick」的正常间隔，同时把休眠/挂起造成的时钟跳变裁掉（宁少勿多）。
- **空档不误记**的关键：checkpoint 每 tick 前进。进程 10:00 关、10:10 开、10:10 轮询命中 → delta 只从上次 tick 算起，不会把 10 分钟空档计入。
- 已达标（notified）后当日不再累加。
- 跨天：键含日期，自然换键；`lastCheckpointAt` 缺失（当日首次）时以「今日 0 点」为下界。

### 1.3 三层数据源

**① 运行中轮询（常开）**
`tasklist /fo csv /nh` 单次全量拉取，JS 过滤绑定 exe（大小写不敏感）。失败 → 记日志，下 tick 重试。

**② 冷启动回溯「仍在运行」的进程（常开，零依赖）**
PowerShell 一次 `Get-Process -Name <bound...> | Select Name,StartTime`。
补记区间 = `[max(StartTime, lastCheckpointAt, 今日0点), now]`，与已有 `ms` 不重叠合并。
`StartTime` 拿不到（权限/系统进程）→ 跳过。
已知边界：休眠跨时段按 A 语义计入（进程确实存在）；如后续反馈过头再收紧。

**③ 精确历史：用户级快照计划任务（可选增强，全局开关）**
- 启用流程（无 UAC）：应用把**全部绑定 exe 的并集**写入 `%LOCALAPPDATA%\hengsch\monitor-specs.json` →
  `schtasks /create /tn HengSchMonitor /sc minute /mo 2 /tr "powershell -NoProfile -File journal.ps1" /f`（以当前用户身份运行）。
- `journal.ps1`（应用生成）：每 2 分钟 `tasklist` 过滤 specs 中的 exe，追加一行到 `monitor-journal.jsonl`：`{"t": <epochMs>, "run": ["game.exe", ...]}`。
- 冷启动：读取 `t > checkpointAt` 的日志行，**逐行作为事件喂给同一记账函数**（行间隔 cap 180s 天然覆盖），空档即被补齐；应用正常运行时轮询与日志行交错喂入，同一 checkpoint 机制保证不重复记账。
- 关闭开关 → `schtasks /delete`；日志保留 7 天，应用启动时裁剪。
- 精度 ±2 分钟（对 10 分钟阈值无感）。任务被用户手动禁用 → 静默降级为仅 ①+②。

### 1.4 UI

- **编辑/新建弹窗**（仅 `type === 'recurring'` 渲染）「自动监测」区块：
  - 开关（启用后展开）
  - 进程选择：下拉列出当前运行进程（`tasklist` 快照 + 手动刷新按钮），选中回填 exe 名；下拉下方保留手动输入框（兜底）
  - 阈值分钟数（number，min 1，默认 10）
  - 全局复选：「精确历史日志（覆盖软件未运行时段）」← 1.3-③ 开关 + 说明小字
- **行内进度**：hover/focus meta 追加 `监测 06/10 分钟`（两位补零）；无进度不显示（0/10 也显示，让用户明白监测在生效）。
- 编辑弹窗删除监测 = 清空配置字段，进度键保留（30 天后清理）。

### 1.5 容错

| 场景 | 行为 |
|------|------|
| exe 改名/未运行 | 永远 0 进度，无报错（meta 可见 0/10 自明） |
| `tasklist`/PowerShell 失败 | 下 tick 重试，进度不动 |
| 休眠唤醒时钟跳变 | 180s 封顶 |
| 任务被手动完成 | 当日停止累加（notified 视为已完成） |
| 计划任务被禁用 | 静默降级，不提示 |

---

## 2. 云同步（SFTP 合并同步）

### 2.1 数据模型变更（`@hengsch/shared-types`）

```ts
interface SyncedMeta {
  updatedAt: number;   // 每次修改刷新
  deviceId: string;    // 修改来源
  deleted?: boolean;   // 墓碑
}
// TodoItem / Group 交叉合并 SyncedMeta
```

- **迁移**（首启）：存量记录补 `updatedAt = createdAt`；生成本机 `deviceId`（UUID，存 electron-store `deviceId`）。
- **删除 = 墓碑**：`deleteTodo/deleteGroup` 改为置 `deleted: true` + 刷新 `updatedAt`；UI 层过滤墓碑；**同步时清除 30 天前的墓碑**。（没有墓碑，A 机删除会被 B 机旧数据复活。）
- 这是行为变更：渲染层所有「数组剔除删除」的路径统一改走墓碑。

### 2.2 远端文件

服务器目录（用户自建，如 `~/hengsch/`），单文件 `sync.json`：

```json
{ "version": 1,
  "todos":  [ { "...": "记录 + SyncedMeta" } ],
  "groups": [ { "...": "记录 + SyncedMeta" } ],
  "writer": { "deviceId": "...", "at": 1760000000000 } }
```

### 2.3 同步周期与合并（`@hengsch/shared-logic` 纯函数）

触发：每 **60s** + 应用启动后 + 网络恢复 + 设置页「立即同步」。

```
渲染层 ──sync:run(localState)──▶ 主进程 ssh2 SFTP
  1. get sync.json        （不存在 → 首次：put 本地全量，结束）
  2. merge(local, remote)  → 逐记录 LWW：updatedAt 大者胜；
                             相等 → deviceId 字典序（两机结果确定一致）
                             墓碑同等参与比较（晚删胜过早改）
                             孤儿分组（引用已墓碑）→ 改绑 'default'
                             清除 30 天前墓碑
  3. 写回 electron-store + put 临时文件 → posixRename 原子替换
     （失败重试 ×3 指数退避；写后回读校验，不一致立即再合并一轮）
  4. 返回合并全量 ──▶ 渲染层整体应用（与进行中的本地编辑以全量覆盖前先本地 flush）
sync:status ──▶ 页脚状态
```

- **撞车残余风险**：SFTP 无 CAS，两设备同秒写入可能互相覆盖，下周期 LWW 可恢复大部分（未被覆盖侧的记录带 updatedAt，若整文件被覆盖则丢该窗口内改动）。单人双设备 + 60s 错峰概率极低；文档如实标注，将来有域名可平移到方案 1（REST 事务）且客户端合并代码复用。
- 远端非 JSON/损坏 → 状态 `REMOTE ERROR`，**不写回**（不洗对方数据）。

### 2.4 安全与首次配对

- 依赖 `ssh2`（纯 JS，无编译）；密钥对用 `ssh2.utils.generateKeyPairSync('ed25519')`。
- 设置页：显示公钥 +「复制」；用户在服务器执行一次 `echo '<公钥>' >> ~/.ssh/authorized_keys`。
- 连接表单：host / port(默认22) / username / 远端路径；「测试连接」按钮（list 目录验证）。
- 私钥存 electron-store（本地磁盘，个人场景暂不做口令——YAGNI，记入 out-of-scope）。
- 传输经 SSH 加密；服务器静态文件为明文（信任自己的服务器，标注在文档）。

### 2.5 状态呈现与错误处理

| 状态 | 页脚（中置小字，Swiss 大写） |
|------|------|
| 成功 | `SYNCED 12:03` |
| 进行中 | `SYNCING…` |
| 断网/SSH 不通 | `OFFLINE`（不弹窗，下周期自动重试） |
| 认证失败 | `AUTH ERROR`（设置页同步标红） |
| 远端损坏 | `REMOTE ERROR` |

点击页脚状态 → 打开「同步设置」弹窗。

---

## 3. 测试策略

### 3.1 单元（`@hengsch/shared-logic`，注入时钟/事件流）

- `creditPresence`：正常累加 / checkpoint 先进再判（空档不误记）/ 跨天换键 / 180s 封顶（休眠跳变）/ 已达标不再累加 / 冷启动 StartTime 区间与已记进度不重叠合并 / 「先关又开」方向性验证（宁少勿多）
- `mergeSyncStates`：本地新 / 远端新 / 删 vs 改（墓碑胜）/ updatedAt 相等 → deviceId 定序（双机一致性）/ 30 天墓碑清除 / 孤儿分组改绑 / 迁移补字段

### 3.2 集成

- 监测：假注册表 + 模拟进程事件流驱动主进程循环（不 spawn 真进程）。
- 同步：内存假 SFTP 服务器跑全周期（get→merge→put→校验）；断网重试、AUTH 错误注入。

### 3.3 真机手工验收清单

1. 循环任务绑 `xxx.exe`、阈值 10 分钟 → 运行进程看 meta 进度增长 → 达标系统通知 + 自动完成
2. 杀掉 HengSch，分两段玩游戏 → 重启 → ②/③ 把当日进度补齐（③启用时空档全补；未启用时仅补「仍在运行」段）
3. 跨 0 点检查进度清零、次日重新计数
4. 双设备（第二实例改 deviceId）：编辑/删除/重排互推，验证删除不复活、顺序收敛
5. 断网 5 分钟 → OFFLINE → 恢复自动补传
6. 设置页测试连接、公钥流程走通

### 3.4 门禁

`tsc --noEmit` 0 error；`eslint` 0 error（维持现有 6 条既有 warning）。

---

## 4. Out of Scope（明确不做）

- 多用户/账号体系、网页端、移动端
- 方案 1（REST）与方案 2（CouchDB）本期不实现（预留升级路径，客户端合并层可复用）
- 前台活跃判定（判定语义 B）、输入钩子
- 私钥口令加密、云内容应用层加密
- 冲突弹窗（单人场景 LWW 静默合并）
- 监测进度的历史曲线/统计报表

## 5. 依赖与涉及文件

- 新增依赖：`ssh2`（仅 v1.0.0）
- `packages/shared-types`：`SyncedMeta`、`RecurringTodo.monitor?`、`MonitorConfig`
- `packages/shared-logic`：`creditPresence`、`mergeSyncStates`（+ 单测）
- `src/main`：`monitor-service.ts`、`sync-service.ts`、journal 脚本模板、新 IPC 通道
- `src/renderer`：任务弹窗「自动监测」区、同步设置弹窗、页脚状态、删除改墓碑、进度 meta
- `scripts/`（应用资源）：`journal.ps1` 模板
