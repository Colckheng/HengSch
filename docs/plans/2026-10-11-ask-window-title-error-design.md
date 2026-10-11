# 设计：进程结束询问独立小窗 + 标题警示统一自定义样式

日期：2026-10-11
状态：已确认（用户选定：独立小窗口 + 统一自定义样式）
范围：仅桌面端（v1.0.0 Electron）
前置：`2026-10-11-monitor-once-ask-exit-design.md`（功能已上线，本次纯 UI 适配）

## 背景与目标

上一轮"进程结束询问"用主进程原生 `dialog.showMessageBox`，是 Windows 系统灰框，与 Swiss Precision UI 完全不搭。同时添加/编辑待办时标题没填会弹**浏览器原生气泡**（`required` 触发），丑且与自定义 `.form-error` 两条路径不统一。

目标：

1. 询问弹窗改为**独立无边框小窗口**（用户选定），完全自绘 Swiss 风格，不依赖主窗口状态（最小化/贴边也能弹）；
2. 标题校验去掉原生气泡，**统一走自定义样式**（用户选定）：红边框 + 瑞士风警示文案。

## 1. 询问小窗（ask window）

### 1.1 窗口规格（主进程新建 `ask-window.ts`）

```ts
new BrowserWindow({
  width: 380, height: 240,
  frame: false, resizable: false, movable: false,
  minimizable: false, maximizable: false,
  alwaysOnTop: true, skipTaskbar: true,
  show: false,               // ready-to-show 后再 show + focus
  webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
})
```

- 屏幕居中（相对 primaryDisplay，多显示器取鼠标所在屏 `cursorScreenPoint` → `screen.getDisplayNearestPoint`）；
- 一次只弹一个：`drainAskQueue` 串行不变，答完（含关闭）`win.destroy()` 销毁，下一条再建新窗；
- `webContents.on('render-process-gone')` 等异常 → 按 cancel 处理，不阻塞队列。

### 1.2 IPC 握手

- 主 → 小窗：`ask:present`，payload `{ todoId, title, message, detail }`（message/detail 与现文案一致：`「${entry.title}」的进程已结束` / 自动完成过的显示"该任务之前已自动标记完成，它真的完成了吗？"）；
- 小窗 → 主（invoke `ask:answer`）：`'complete' | 'not-done' | 'cancel'`；
- 主进程 `runAskDialog` 改为 `await` 小窗答案（Promise 挂起，取代 `dialog.showMessageBox`）：
  - `cancel`（ESC / 点 X / 关闭）按 `'not-done'` 语义交给 `resolveAskAction`——已自动完成的会被撤销回待办，与原生 cancelId=1（还没做）行为一致；
  - `complete` / `not-done` 直接进 `resolveAskAction`，后续 `monitor:ask-resolved` 链路不变；
- **兜底**：小窗创建失败（异常）→ 回退原生 `dialog.showMessageBox`，功能不挂；
- 小窗加载失败兜底：dev 加载 `http://localhost:5175/ask.html`、prod `loadFile(dist/ask.html)`，`did-fail-load` → cancel + 销毁。

### 1.3 渲染层（新入口，纯 TS 不引 React）

- 新增根级 `ask.html` + `src/ask/main.ts`：一个标题、任务名、问句、两个按钮（`完成` / `还没做`，`还没做`为默认聚焦——延续 defaultId=1 防误触语义）；
- 不用 React：单页面两按钮，纯 TS + 原生 DOM 保持轻量，避免多一份 React 运行时；
- 样式复用 `src/renderer/styles/index.css`（confirm-box / button 体系），少量 ask 专属样式（窗口整体、无边框拖动区、按钮占满）；
- ESC → `cancel`；按钮点击 → invoke `ask:answer` 后 `window.close()`；
- preload 独立精简版（仅暴露 answer invoke），不复用主窗口 preload 白名单。

### 1.4 构建（vite 多页）

- `vite.config.ts`：`rollupOptions.input` 增加 `ask`（`{ main: 'index.html', ask: 'ask.html' }`），产物 `dist/ask.html`；
- 主进程 dev/prod 判断与 index.ts 现有逻辑一致（`process.env['VITE_DEV_SERVER_URL']` 或硬编码 5175 判断照抄 index.ts 的条件）。

## 2. 标题警示统一自定义样式

- `AddTodoModal` / `EditTodoModal`：标题 `<input>` **移除 `required`**（自定义 `handleSubmit` 已拦空值，原生气泡是唯一丑源）；循环天数输入的 `required` 不动（不在本次范围）；
- 报错态样式（CSS 属性选择器，零新增状态字段）：
  - `.form-group input[aria-invalid='true']` → 边框 `var(--signal)` + 淡红阴影（现有 `aria-invalid={titleError}` 已接好）；
  - `.form-error` 重做：去掉 `■ ` 前缀（伪元素删除），改 2px 红色左边线 + 11px/700/letter-spacing 0.08em 小字，signal 红；
- 空值与纯空格两条路径现在都走 `!title.trim()` → 同一样式，原生气泡彻底消失；
- 输入时即时清错（已有 `onChange` 清 `titleError`）不变。

## 3. 验证

1. 门禁：桌面 `npx tsc --noEmit` + `npm run lint`（0 警告）；根 `npm test` 不涉及（无 shared 改动，62 项应不变）；
2. 手动：dev 启动 → 绑一个 `askOnExit` 任务 → 停进程 → 确认独立小窗外观/ESC/两按钮/焦点；
3. 手动：添加待办标题留空 → 确认无原生气泡、红边 + 新警示样式；纯空格同样式；输入即恢复；
4. 回归：auto 自动完成链路不受影响（不碰 tick/checkThreshold）。

## 4. 不做的事（YAGNI）

- 不做小窗复用/多窗排队 UI（串行销毁重建足够）；
- 不做小窗拖动、缩放、记忆位置；
- 不统一循环天数的原生校验（范围外）；
- 不动 `resolveAskAction` 等 shared 纯函数（UI 层适配，逻辑零变更）。
