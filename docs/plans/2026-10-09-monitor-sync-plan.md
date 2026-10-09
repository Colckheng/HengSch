# HengSch Todo · 进程监测 + 云同步 实施计划

日期：2026-10-09
依据：`2026-10-09-monitor-sync-design.md`（三节已批准）
顺序原则：纯函数 + 单测先行 → 监测 → 同步 → 收尾；每阶段独立可验收、`tsc`/`eslint` 门禁贯穿。

---

## Phase 0 · 类型与迁移地基（预估 0.5 天）

**目标**：数据模型升级完成、删除改墓碑、迁移幂等，不引入任何新行为 UI。

| # | 任务 | 文件 |
|---|------|------|
| 0.1 | `MonitorConfig { exeName, thresholdMinutes }`；`RecurringTodo.monitor?: MonitorConfig` | `packages/shared-types/src/index.ts` |
| 0.2 | `SyncedMeta { updatedAt, deviceId, deleted? }`；`TodoItem`/`Group` 交叉合并 | 同上 |
| 0.3 | deviceId 生成：首启 `randomUUID()` 存主进程 electron-store `deviceId`，IPC `sync:deviceInfo` 暴露 | `src/main/index.ts`（或新 `src/main/device.ts`）、`preload.ts` |
| 0.4 | 迁移：加载时存量记录补 `updatedAt = updatedAt ?? createdAt`（renderer TodoContext/GroupContext 加载路径） | `src/renderer/context/*` |
| 0.5 | 删除改墓碑：`deleteTodo`/`deleteGroup` → `deleted: true` + `updatedAt = now`；所有查询/渲染路径过滤 `deleted`；30 天墓碑清理函数（先放 shared-logic，Phase 3 接线） | `TodoContext.tsx`、`GroupContext.tsx`、`TodoList.tsx`（如需） |

**验收**：删除任务 → UI 消失、store 内为墓碑且重启仍不可见；重排序/编辑刷新 `updatedAt`；`tsc`/`eslint` 0 error；**注意**：本阶段结束时数据已带同步元数据，但无任何同步行为（安全）。

---

## Phase 1 · 纯函数 + 单测（预估 1 天）

**目标**：两个核心算法达到设计文档 3.1 的覆盖矩阵，全绿后才进入集成。

| # | 任务 | 文件 |
|---|------|------|
| 1.1 | 引入 `vitest`（workspace 根 devDependency + `packages/shared-logic` 加 `"test": "vitest run"`，根加 `"test": "npm test --workspaces --if-present"`） | `package.json` ×2 |
| 1.2 | `creditPresence(progress, event{t,present}, capMs=180000)`：checkpoint 先进、封顶、跨天键、notified 锁、纯函数返回新 progress | `packages/shared-logic/src/monitor.ts` + `monitor.test.ts` |
| 1.3 | `backfillFromStart(progress, startTime, now, todayMidnight)`：`max(start, checkpoint, midnight)` 区间不重叠合并 | 同上 |
| 1.4 | `mergeSyncStates(local, remote, deviceId, now)`：LWW + deviceId 定序 + 墓碑参与 + 30 天清除 + 孤儿分组改绑 default + 迁移补字段 | `packages/shared-logic/src/sync.ts` + `sync.test.ts` |
| 1.5 | 测试矩阵（设计 3.1 全项），含「先关又开宁少勿多」方向性断言、双机交换输入结果一致断言 | — |

**验收**：`npm test` 全绿；覆盖率以矩阵为准（不追数字指标）；shared-logic 构建 `tsc` 通过。

---

## Phase 2 · 监测系统（预估 1.5 天）

**目标**：三层数据源全部工作，UI 可配置，验收清单 1–3 通过。

| # | 任务 | 文件 |
|---|------|------|
| 2.1 | `monitor-service.ts`：registry（内存）+ 30s 循环（`tasklist /fo csv /nh` 单次解析，CSV 引号处理）+ 逐 exe 调 `creditPresence` + 进度持久化 `monitorProgress`（7 天裁剪）| `src/main/monitor-service.ts`（新） |
| 2.2 | 冷启动回溯 ②：首次 `monitor:configure` 后跑一次 PowerShell `Get-Process … StartTime` → `backfillFromStart` | 同上 |
| 2.3 | ③ 计划任务：开关 IPC → 写 `monitor-specs.json` + `journal.ps1` 模板（含 `$ErrorActionPreference='SilentlyContinue'`、tasklist 解析、JSONL append、UTF-8）→ `schtasks /create /tn HengSchMonitor /sc minute /mo 2 /f`；关闭 → `/delete`；冷启动读 JSONL 行喂 `creditPresence`；7 天裁剪 | `src/main/journal.ts`（新）+ `src/main/assets/journal.ps1`（新） |
| 2.4 | 达标：IPC `monitor:completed` → renderer `updateTodo(id,{status:'completed'})`；主进程 `new Notification(...)` 每日每任务一次（notified 标志） | `monitor-service.ts`、`App.tsx`/`TodoContext` |
| 2.5 | IPC + preload：`monitor:configure` / `monitor:progress`(push) / `monitor:completed`(push) / `monitor:journalToggle` | `preload.ts`、`src/main/index.ts` |
| 2.6 | UI：Add/Edit 弹窗「自动监测」区（仅 recurring）：开关、进程下拉（tasklist 快照 + 刷新，IPC `monitor:listProcesses`）、手动输入、阈值分钟（默认 10）、全局「精确历史日志」复选 + 小字说明 | `AddTodoModal.tsx`、`EditTodoModal.tsx`、`index.css` |
| 2.7 | UI：行内 meta 进度 `监测 06/10 分钟`（进度经 `monitor:progress` 进 TodoContext 局部 state；0 进度且未启用不显示） | `TodoCard.tsx`、`TodoContext.tsx` |

**风险点**：`tasklist` 输出本地化（列名中文）→ **只用 `/fo csv` 结构不依赖表头**；exe 名大小写不敏感；`schtasks` 命令行引号（`/tr` 内路径含空格用嵌套引号）；PowerShell 脚本中文/路径编码。

**验收**：手工清单 1–3（10 分钟通知自动完成 / 双段游玩冷启动补齐 / 跨 0 点清零）；不开 ③ 时降级无报错。

---

## Phase 3 · 云同步（预估 2 天）

**目标**：双实例互推收敛，验收清单 4–6 通过。

| # | 任务 | 文件 |
|---|------|------|
| 3.1 | 依赖 `ssh2`（v1.0.0） | `v1.0.0/package.json` |
| 3.2 | `sync-service.ts`：密钥对 `generateKeyPairSync('ed25519')`、配置读写（host/port/user/remotePath 存 electron-store `syncConfig`）、`testConnection`（list 目录）、`runCycle`：get → `mergeSyncStates` → store 写回 → put tmp + `posixRename` → 回读校验（不一致立即再合一轮）→ ×3 指数退避 | `src/main/sync-service.ts`（新） |
| 3.3 | 远端文件缺省处理：不存在 → 首次 put 本地全量；远端非 JSON → 状态 `REMOTE ERROR` 且**不写回** | 同上 |
| 3.4 | 循环调度：60s + 启动后（延迟 5s）+ 网络恢复（`online` 事件）+ 手动；状态 push `sync:status {state, at}` | 同上 |
| 3.5 | IPC + preload：`sync:configure` / `sync:run(localState)→merged` / `sync:test` / `sync:keypair` / `sync:status`(push) / `sync:runNow` | `preload.ts`、`index.ts` |
| 3.6 | 渲染层接线：改动后本地即时保存不变；`sync:run` 传全量 → 返回值整体应用（先 flush 本地 pending 再应用）；删除/编辑/重排全部走墓碑/updatedAt | `TodoContext.tsx`、`GroupContext.tsx` |
| 3.7 | UI：页脚中置状态 `SYNCED 12:03 / SYNCING… / OFFLINE / AUTH ERROR / REMOTE ERROR`（点击开设置）；「同步设置」弹窗：连接表单 + 测试按钮 + 公钥展示/复制 + 服务器配钥说明（`echo '…' >> ~/.ssh/authorized_keys`）+ 手动「立即同步」 | 新 `SyncSettingsModal.tsx`、`App.tsx`、`index.css` |

**风险点**：`posixRename` 依赖 OpenSSH 扩展（主流发行版默认有，失败则降级 `rename` 覆盖写）；ssh2 keepalive 断连重连；两设备同秒写撞车（设计已接受残余风险）；中文文件内容 UTF-8。

**验收**：手工清单 4–6（双实例改 deviceId 互推：编辑/删除不复活/重排序收敛；断网 5 分钟恢复补传；测试连接与公钥流程）。

---

## Phase 4 · 收尾（预估 0.5 天）

| # | 任务 |
|---|------|
| 4.1 | 真机手工验收清单（设计 3.3）**全项跑一遍**，结果记录回设计文档附录 |
| 4.2 | `tsc --noEmit` 0 error、`eslint` 0 error、`npm test` 全绿 |
| 4.3 | 服务器侧说明沉淀：`docs/plans/` 或 README 增补「同步服务器 3 步配置」 |
| 4.4 | 提交（分 phase 或一次性，按用户指示）；还原调试用 node_modules patch（vite-plugin-electron 9223，如仍在） |

---

## 依赖与顺序关系

```
Phase 0 ──▶ Phase 1 ──┬──▶ Phase 2 ──┐
                       └──▶ Phase 3 ──┴──▶ Phase 4
```

- Phase 2/3 互相独立，可按任意顺序；建议 2 先（不依赖新依赖，反馈快）。
- Phase 1 未全绿不得进入 2/3（算法是两功能共同地基）。
- 每个 Phase 结束：`tsc`/`eslint`/`npm test` 门禁 + 对应验收。

## 全局风险表

| 风险 | 缓解 |
|------|------|
| `tasklist`/`schtasks` 本地化与引号 | 只用 CSV 结构；命令模板集中一处并真机验证 |
| 计划任务被安全软件拦截 | 静默降级（设计已定），文档注明 |
| ssh2 无 CAS 同秒覆盖 | 写后回读 + 下周期 LWW；文档如实标注残余风险 |
| 墓碑改造遗漏过滤点 | Phase 0 验收专项：grep `todos.filter`/`groups` 全路径核对 |
| 迁移破坏既有数据 | 迁移幂等 + 只加字段不删改；Phase 0 前备份 `config.json` |
