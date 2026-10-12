# 设计：系统托盘 + 关闭隐藏后台化 + 只问一次持久化

日期：2026-10-12
状态：已确认（用户选定：X 隐藏到托盘后台继续监测；「同天只问一次」持久化）
范围：仅桌面端（v1.0.0 Electron）
前置：`2026-10-11-monitor-revert-reset-design.md`（撤销重置已上线）

## 背景（用户报告：一直弹窗、关闭软件后还弹）

根因三层：

1. **关主窗口 ≠ 退出**：只要还有询问窗开着，`window-all-closed` 不触发 → 主进程存活 → 30s 轮询继续 → 继续排队弹窗；
2. **「同天只问一次」记在内存**：重启即清零，加上启动时的离线补问 → 每次重开都再弹一轮；
3. **无托盘、无单实例锁**：没有可见的后台入口，也无法从托盘完整退出；重复双击会起多实例各自弹窗。

## 1. 托盘图标（新 `src/main/tray.ts`）

- 图标：dev 取 `public/assets/icon.ico`，打包取 `dist/assets/icon.ico`（vite 构建已拷贝 public/，`electron-builder files: dist/**` 已覆盖）；文件缺失时跳过创建（不崩溃）；
- 左键单击 / 双击 → 显示主窗口；右键 → 菜单：**显示主窗口** / 分隔线 / **退出**；
- 提示文本「HengSch Todo」；应用启动 ready 后创建，常驻。

## 2. 关闭（X）= 隐藏到托盘

- `mainWindow.on('close')`：非退出流程 → `preventDefault()` + `hide()`（窗口实例保留，恢复时布局/状态不丢）；
- `window:close` IPC 不改（走同一 close 事件拦截）；
- 后台继续运行：轮询、询问小窗、通知均正常工作。

## 3. 完整退出

- 模块级 `isQuitting`，`app.on('before-quit')` 置位并执行清理（幂等）：
  - `cancelAskQueue()`（monitor-service 新导出：清空询问队列）；
  - `abortAskWindows()`（ask-window 新导出：settle 当前小窗为 cancel + 销毁，不阻塞 window-all-closed）；
  - `stopMonitorService()`（清轮询定时器——此前无人调用）；
- 托盘「退出」→ `app.quit()` → before-quit 清理 → close 放行 → 进程真正退出，**退出后零残留**。

## 4. 单实例锁

- 模块顶部 `app.requestSingleInstanceLock()`；拿不到锁 → `app.quit()`；
- `second-instance` → 显示并聚焦已有主窗口（双击图标不再起第二实例）。

## 5. 「同天只问一次」持久化

- electron-store 新键 `monitorAsked`：`{ day: 'YYYY-MM-DD', ids: string[] }`；
- `enqueueAsk` 门槛 = 内存 Set（防排队期间重复）∪ 持久化 ids（防重启后再弹）；
- **答复后落盘**（任何终点：完成 / 还没做 / ESC 关闭——看过就算问过）；展示失败（异常抛出）不落盘，重启仍可补问；崩溃未答 → 重启后离线补问照常；
- 跨天轮换：pruneAsked 时内存与磁盘一起清空重写；
- **对 2026-10-11 设计的覆盖**：revert（答「还没做」）仍重置当日进度，但**不再解除当天只问一次**——答复集接管后，同任务当天（含同会话、含重启）一律不再重复弹，彻底消除「一分钟阈值循环弹窗」。

## 6. 文档

- README 桌面小节：托盘行为（X 隐藏、托盘退出、只问一次跨重启）；
- architecture.md：tray.ts、before-quit 清理、monitorAsked 键。

## 验证

1. 门禁：`npx tsc --noEmit` + `npm run lint`（0 警告）+ 根 `npm test`（67 项）；
2. dev 手动：托盘图标出现 → X 隐藏 → 左键/菜单恢复 → 「退出」后无残留进程；
3. 弹窗行为：问过一次后重启应用，同任务当天不再弹；
4. 回归：询问小窗 UI 与裁决（complete/revert/none）不动。

## 不做的事（YAGNI）

- 不做托盘徽标/进度数字/气泡通知；
- 不做「隐藏到托盘时的提示气泡」（首次隐藏也不弹，避免打扰）；
- 不改询问小窗样式与 IPC 握手；
- 不动 mac 特化逻辑（darwin 语义已被 close→hide 覆盖）。
