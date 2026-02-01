## HengSch 项目多端开发规划（v1.0.x / v1.1.x）

本文档描述当前桌面端 v1.0.0 的后续演进规划，以及移动端 / Web 端的新版本规划。后期如果有调整，建议在本文档基础上更新版本记录，而不是另起新文档。

---

## 一、当前状态概览（v1.0.0 桌面端）

- **技术栈**：Electron + React + TypeScript + Vite  
- **目录位置**：`v1.0.0/`（当前桌面端主工程）  
- **主要特性**：
  - 待办事项：一次性 + 循环任务、状态管理、拖拽排序
  - 分组管理：颜色主题、筛选等
  - 窗口特性：小窗模式、置顶、开机自启动、窗口位置和大小记忆

本规划重点围绕：
- 桌面端 v1.0.x 小窗模式增强
- 新增 v1.1.0-web（网页端）与 v1.1.0-an（移动端）

---

## 二、v1.0.x（桌面端）规划：小窗模式吸附 + 贴边缩入

### 2.1 需求目标

1. **小窗模式吸附（Snap）**
   - 小窗拖动到屏幕四周时，自动吸附到对应边缘（类似 Windows 窗口贴边）。
   - 支持多显示器：以当前窗口所在显示器的工作区域为基准。

2. **闲置自动缩入（Auto-hide）**
   - 小窗贴边后，在一段时间内无用户交互时，自动向对应边缘“缩进去”（类似老版 QQ 贴边隐藏），支持上下左右四条边全部缩入。
   - 窗口缩入后只保留一条可见窄边，鼠标移到窄边时自动弹出恢复。
   - 行为可配置：提供一个简洁的“启用自动贴边缩入”开关，闲置时间默认固定为 5 秒。

3. **交互稳定性**
   - 拖动窗口过程中不触发缩入逻辑。
   - 用户有操作时（鼠标移动、点击、滚动、键盘输入），应重置闲置计时器，避免频繁缩入/弹出造成抖动。

### 2.2 技术设计思路

#### 2.2.1 主进程（`src/main/index.ts`）职责

- 使用 Electron `BrowserWindow` + `screen`：
  - 通过 `screen.getDisplayMatching(windowBounds).workArea` 获取当前窗口所在显示器的工作区域。
  - 监听 `move` 事件，并做防抖/节流，判断“拖动结束”。
  - 根据窗口与四个边缘的距离，决定是否吸附并修正位置。
- 小窗模式相关状态：
  - `isCompactMode`: 是否处于小窗模式（已有）。
  - `snappedEdge`: `'left' | 'right' | 'top' | 'bottom' | null`。
  - `isHidden`: 是否已缩入边缘。
  - `idleTimer` / `animTimer`: 闲置计时器与动画计时器句柄。
- 自动缩入与弹出：
  - 闲置达到设定时间（默认 5 秒）后，若处于小窗模式且已贴边，则执行缩入：
    - 通过多次 `setBounds` 模拟滑动动画（或先实现为一步到位的无动画版本，降低复杂度）。
    - 缩入后保留一条窄边（例如宽度/高度 8 像素）在屏幕可见区域。
  - 当检测到鼠标靠近该窄边时，执行弹出还原原始窗口位置。
- IPC 通信扩展（视需要逐步增加）：
  - `window:userActivity`：渲染进程通知有用户活动，用于重置闲置计时器。
  - 预留配置类 IPC：`window:setAutoHideConfig` / `window:getAutoHideConfig`（延迟时间、是否启用自动缩入等）。

#### 2.2.2 渲染进程（React）职责

- 在小窗模式下，监听用户交互事件，例如：
  - `mousemove`、`mousedown`、`wheel`、`keydown` 等。
- 当检测到用户交互时，通过 `window.electronAPI` 调用主进程（如 `window.userActivity()`）来重置闲置计时器。
- 继续使用现有的 `WindowContext` 维护 `isCompactMode` 等 UI 状态，不直接参与窗口坐标计算和动画，尽量将“物理窗口行为”放在主进程处理。

### 2.3 版本拆分与里程碑

- **v1.0.1**
  - 实现基本的“拖动结束自动吸附四边”（多显示器支持）。
  - 无动画版本的“闲置自动缩入 + 鼠标靠近自动弹出”，支持上下左右四边。
  - 闲置时间采用固定值 5 秒，提供一个简洁的启用/禁用开关（不做复杂时间调节 UI）。

- **v1.0.2**
  - 为“小窗贴边缩入 / 弹出”增加动效版本（滑动动画，更接近 QQ 贴边体验）。
  - 调整缩入后保留在屏幕内的窄边像素值，当前规划为固定 **4 像素**（后续可根据体验微调）。
  - 调整应用启动行为：进入应用后不再自动打开开发者工具 / 检查页面，仅在开发调试需要时手动开启。
  - 在保留界面简洁的前提下，细化与整理相关配置与实现（如边缘判定、防抖处理等）。

- **v1.0.3**（已完成）
  - 修复角落/多边同时满足吸附阈值时的吸附边选择：改为固定优先级 **上 > 下 > 左 > 右**（而不是按距离最小）。
  - 修复缩入后需要点击才弹出的问题：改为鼠标悬停在保留的窄边区域（当前为 4px）即可自动弹出，并提升命中稳定性。
  - 修复弹出后无法移动窗口的问题：确保弹出动画过程中和完成后窗口状态完全恢复。
  - **已知问题**：在右上角等角落位置，缩入后可能出现“立刻自动弹出并循环”的bug，已尝试多种修复方案但问题仍存在，待后续版本进一步优化。

---

## 三、v1.1.0 总体规划：移动端 + 网页端

v1.1.0 计划新增两个子项目：

- **v1.1.0-web**：Web 网页版本（浏览器使用）。
- **v1.1.0-an**：移动端版本（Android / iOS）。

### 3.1 目录与仓库组织建议（Monorepo）

在当前仓库下建议形成以下结构：

- `v1.0.0/`：现有 Electron 桌面端。
- `v1.1.0-web/`：Web 版本工程（Vite + React + TS）。
- `v1.1.0-an/`：移动端工程（技术栈待定：React Native 或 Capacitor + React）。
- `packages/`：存放可复用的共享代码：
  - `packages/shared-types/`：Todo、Group、窗口配置等 TypeScript 类型定义。
  - `packages/shared-logic/`：纯业务逻辑模块（如循环任务计算、排序、过滤、数据迁移等），输出 ESM 格式以兼容 Vite/Rollup。
  - `packages/shared-storage/`：存储接口定义与默认实现（桌面端、Web 端、移动端可有各自实现）。
  - （可选）`packages/shared-ui/`：跨 Web + Electron 共用的一些基础 UI 组件或样式工具。

后续可以考虑引入 npm workspaces / pnpm / yarn workspace 来统一管理多工程依赖。

### 3.2 跨端共享策略

**目标**：业务规则只写一份，各端只写“壳 + 适配层”。

共享内容包括但不限于：

- **数据模型**：
  - Todo 类型（一次性 / 循环、时间配置、完成状态等）。
  - Group 类型（分组名称、颜色、排序等）。
  - 配置项（是否自动缩入、缩入延迟时间等）。

- **业务逻辑**（放在 `shared-logic` 中）：
  - 循环任务的生成与下次时间计算。
  - 任务排序、筛选（按分组、状态、时间等）。
  - 数据迁移逻辑（版本升级时字段变更）。

- **存储抽象**（放在 `shared-storage` 中）：
  - 定义统一的存储接口：
    - `get(key: string): Promise<any>`
    - `set(key: string, value: any): Promise<void>`
    - `delete(key: string): Promise<void>`
  - 不同端的具体实现：
    - 桌面端：基于 `electron-store`，通过预加载脚本暴露的 IPC 接口实现。
    - Web 端：基于 `localStorage` 或 `IndexedDB`。
    - 移动端：基于 `AsyncStorage` / `MMKV` / 其他持久化方案。

---

## 四、v1.1.0-web（网页端）规划

### 4.1 技术栈与结构

- **技术栈**：Vite + React + TypeScript（与桌面端渲染层保持一致风格）。
- **目录位置**：`v1.1.0-web/`。
- **核心依赖**：
  - `react` / `react-dom`
  - `@dnd-kit/*`（当前使用原生 HTML5 拖拽）
  - 与桌面端共享的 `shared-*` 包。

### 4.2 功能目标

- 对齐桌面端的核心功能：
  - Todo 增删改查，一次性 / 循环任务。
  - 分组管理（新增、编辑、删除、颜色）。
  - 拖拽排序。
  - 任务详情查看。
- 适配 Web 环境：
  - **响应式布局**：桌面端与移动端均做相应适配。
  - **移动端交互**：
    - 添加/编辑待办：移动端使用全屏展示。
    - 分组管理：移动端使用侧边抽屉。
  - 无手势操作（按设计暂不实现左滑删除等）。
  - 顶部工具栏（+ 添加、📁 分组管理）。

### 4.3 数据存储与状态管理

- 存储：
  - 使用 `localStorage`，接口通过 `shared-storage` 封装（`LocalStorageAdapter`）。
  - 本地离线数据，无云端同步。
- 状态管理：
  - 沿用 Context + `useReducer` 方案。
  - 与桌面端共享 Todo/Group 状态结构定义。

### 4.4 PWA 支持（已实现）

- **manifest.json**：应用名称、描述、主题色、`display: standalone`，支持安装到主屏。
- **Service Worker**：通过 `vite-plugin-pwa` 实现离线缓存，支持离线访问。

### 4.5 里程碑

- **web v0.1**（已完成）
  - 项目基础骨架搭建完成。
  - 集成 `shared-types`、`shared-logic`、`shared-storage`。
  - 实现 Todo 列表、分组管理、添加/编辑/详情等核心功能。
  - 响应式布局（桌面端 + 移动端，添加/编辑全屏、分组侧边抽屉）。
  - PWA 支持（manifest + Service Worker + 安装到主屏）。
  - **问题修复**（启动后白屏）：
    - tsconfig 补充 `"jsx": "react-jsx"`，保证 TS 能正确解析 JSX。
    - TodoContext、GroupContext 补全 `useState` 的导入。
    - 增加 ErrorBoundary 用于捕获并展示运行时错误。

---

## 五、v1.1.0-an（移动端）规划

### 5.1 技术方案选择（已确认）

- **首选方案：React Native + TypeScript（已选）**
  - 原生体验更好，便于后续接入系统能力（通知、Widget 等）。
  - UI 需要针对移动端重新设计，但可以在交互上做到更贴合手机使用习惯。

- **备选方案：Capacitor + React（如后期有需要可评估）**
  - 可复用更多 Web React UI，但当前规划中不作为首选方案。

**无论具体实现细节如何，移动端业务逻辑都会优先从 `shared-*` 中复用。**

### 5.2 目录与结构

- **目录位置**：`v1.1.0-an/`。
- **核心内容**：
  - 使用共享的类型和业务逻辑。
  - 单独的移动端 UI 层，适配触摸交互与移动端屏幕尺寸。
  - 独立的存储实现（如 AsyncStorage）。

### 5.3 功能目标

- 对齐桌面端 / Web 端的主要功能：
  - Todo 管理（一次性 / 循环）。
  - 分组管理。
  - 基础排序和过滤。
- 移动端特性（可作为后续增强项）：
  - 通知/提醒（到期提醒）。
  - 桌面小组件（如“今日待办”）。

### 5.4 里程碑（粗粒度）

- **an v0.1**（已完成）
  - 项目结构搭建完成，使用 Expo (React Native) + TypeScript，可在真机/模拟器运行。
  - 集成 `shared-types`、`shared-logic`、`shared-storage`。
  - 实现 Todo 与分组的基础功能：列表、详情、编辑、添加、删除、分组管理。
  - 存储使用 AsyncStorage 实现 `IStorage` 接口。
  - Metro 配置支持 monorepo，workspace 包含 `v1.1.0-an`。
  - **EAS Build 打包 APK**：配置 `eas.json`，支持 `eas build --platform android --profile preview` 云构建 APK，无需本地 Android SDK。
  - **启动前**需在根目录执行 `npm run build:packages` 以编译共享包。

- **an v0.2**
  - 完善 UI 交互（滑动操作、手势交互等）。
  - 增加本地通知功能（如到期提醒）。
  - 优化性能与启动速度。

---

## 六、建议的实施顺序

1. **第一阶段：桌面端 v1.0.x**
   - 在现有 `v1.0.0` 基础上实现：
     - 小窗模式四边吸附。
     - 基础版闲置自动缩入 + 鼠标靠近弹出。
   - 在此基础上迭代动画与配置选项。

2. **第二阶段：抽取共享代码（packages）与 Monorepo 搭建**（已完成）
   - 创建 `packages/shared-types/`：抽取 Todo、Group 等 TypeScript 类型定义。
   - 创建 `packages/shared-logic/`：抽取循环任务计算、排序、过滤等业务逻辑。
   - 创建 `packages/shared-storage/`：定义存储接口抽象（IStorage）。
   - 创建根目录 `package.json`，配置 npm workspaces 支持 Monorepo。
   - 重构 `v1.0.0` 使用共享包，验证抽象是否合理：
     - 更新类型引用：从 `@hengsch/shared-types` 导入类型。
     - 更新业务逻辑：使用 `@hengsch/shared-logic` 中的工具函数（toggleTodoStatus、sortTodosByStatus、generateTodoId 等）。
     - 配置 TypeScript 路径别名，支持直接引用 packages 源码。

3. **第三阶段：v1.1.0-web 搭建**
   - 创建 `v1.1.0-web` 工程。
   - 接入共享类型与业务逻辑，实现核心功能。

4. **第四阶段：v1.1.0-an 搭建**（已完成）
   - 采用 Expo (React Native) + TypeScript 作为移动端技术路线。
   - 搭建 `v1.1.0-an` 工程，实现 Todo 列表、详情、编辑、分组管理、添加/删除等核心功能。
   - 使用 AsyncStorage 持久化，Metro 配置支持 monorepo。

---

## 七、后续调整与版本记录

本规划是当前时间点的初版方案，后续可以根据实际开发过程中的体验与需求变化进行调整。建议在每次大的规划调整后，在本文件中追加一小节“变更记录”，例如：

- 2026-01-20：初版规划文档创建，确认移动端采用 React Native + TypeScript，自动缩入支持四边，闲置时间默认 5 秒且提供简洁开关。
- 2026-01-22：v1.0.3 开发完成，修复了角落吸附优先级、悬停弹出、弹出后无法移动等问题。已知问题：右上角等角落位置缩入后可能出现循环弹出的bug，待后续版本优化。
- 2026-01-31：第二阶段（Monorepo 搭建）完成，创建了 `packages/shared-types`、`packages/shared-logic`、`packages/shared-storage` 三个共享包，并重构 `v1.0.0` 使用这些共享模块，验证了抽象设计的合理性。
- 2026-01-31：第三阶段（v1.1.0-web）完成，创建 Web 端工程，迁移核心组件，实现响应式布局（移动端添加/编辑全屏、分组侧边抽屉），PWA 支持（manifest + Service Worker + 安装到主屏），使用 localStorage 本地存储。
- 2026-01-31：修复 v1.1.0-web 启动白屏问题（tsconfig 补充 jsx、Context 补全 useState 导入、增加 ErrorBoundary）。
- 2026-01-31：第四阶段（v1.1.0-an）完成，创建移动端 Expo 工程，实现 Todo/分组基础功能，使用 AsyncStorage，Metro 配置 monorepo。
- 2026-01-31：v1.0.0 构建修复：auto-start.ts 改用 execSync 保持同步返回；GroupManagerModal 修复 state.todos 误用（改用 todoState.todos）及 useTodos 在回调内调用问题。
- 2026-01-31：shared-logic 输出由 CommonJS 改为 ESM，解决 Vite/Rollup 命名导出解析问题。
- 2026-01-31：v1.1.0-an 添加 EAS Build 配置，支持 `eas build --platform android` 云端打包 APK。

这样可以方便未来回顾每一阶段的决策背景。

