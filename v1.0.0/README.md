# HengSch Todo

一款功能完整的待办事项管理软件，采用微软便签风格设计。

## 功能特性

### 待办事项管理
- ✅ 支持一次性待办事项和循环待办事项
- ✅ 循环待办事项提供完整的时间配置选项
  - 预设时间周期：一天、一周、一个月
  - 自定义时间周期设置功能
- ✅ 任务状态管理（完成/未完成）
- ✅ 视觉状态区分（颜色、图标、样式）
- ✅ 横向拖放排序功能
- ✅ 待办事项详情查看

### 分组管理
- ✅ 创建自定义分组
- ✅ 为分组选择颜色主题
- ✅ 编辑和删除分组
- ✅ 按分组筛选待办事项
- ✅ 默认"未分类"分组
- ✅ 分组颜色在待办卡片上显示

### 软件运行特性
- ✅ 开机自启动功能（Windows/macOS/Linux）
- ✅ 窗口置顶功能
- ✅ 窗口最小化操作
- ✅ 小窗模式（紧凑视图）
  - 自动隐藏顶部控制栏
  - 限制显示6个待办事项
  - 自动置顶窗口
  - Alt+Q 快捷键退出小窗模式
- ✅ 窗口大小和位置记忆
- ✅ 小窗模式独立的位置和大小记忆

### 界面设计
- 🎨 微软便签风格的卡片式布局
- 🎨 柔和的阴影效果和圆角设计
- 🎨 多种颜色主题的待办事项卡片
- 🎨 清晰的状态标识和交互反馈
- 🎨 分组颜色主题显示
- 🎨 响应式设计，适配不同窗口大小

## 技术栈

- **框架**: Electron + React + TypeScript
- **构建工具**: Vite
- **状态管理**: React Context API + useReducer
- **拖放**: 原生 HTML5 Drag and Drop API
- **数据存储**: electron-store
- **打包工具**: electron-builder
- **代码规范**: ESLint + Prettier

## 系统要求

- **Node.js**: >= 16.0.0
- **npm**: >= 8.0.0
- **操作系统**: Windows 10+, macOS 10.15+, Linux (主流发行版)

## 安装和运行

### 开发环境

1. 克隆项目
```bash
git clone <repository-url>
cd HengSch
```

2. 安装依赖
```bash
npm install
```

3. 启动开发服务器
```bash
npm run dev
```

4. 启动Electron应用（开发模式）
```bash
npm run electron:dev
```

### 生产构建

1. 构建应用
```bash
npm run build
```

2. 打包应用
```bash
npm run electron:build
```

打包完成后，安装包将生成在 `release` 目录中。

### 代码检查和格式化

```bash
# 运行ESLint检查
npm run lint

# 使用Prettier格式化代码
npm run format
```

## 使用说明

### 添加待办事项

1. 点击顶部的"+"按钮
2. 在弹出的对话框中填写信息：
   - 标题（必填）
   - 描述（可选）
   - 类型：一次性待办事项 / 循环待办事项
   - 分组：选择要添加到的分组
   - 循环周期（仅循环待办事项）：每天 / 每周 / 每月 / 自定义
3. 点击"添加"按钮保存

### 管理待办事项

- **查看详情**：点击待办事项卡片查看详细信息
- **标记完成/未完成**：点击卡片左上角的圆形复选框
- **编辑待办事项**：点击卡片右下角的 ✏️ 按钮
- **删除待办事项**：点击卡片右下角的 🗑️ 按钮
- **拖放排序**：拖动卡片调整顺序

### 分组管理

1. 点击顶部的"📁"按钮打开分组管理
2. **新建分组**：
   - 点击"+ 新建分组"按钮
   - 输入分组名称
   - 选择分组颜色
   - 点击"添加"按钮
3. **编辑分组**：点击分组上的 ✏️ 按钮
4. **删除分组**：点击分组上的 🗑️ 按钮（默认分组不能删除）
5. **按分组筛选**：在主界面点击分组按钮进行筛选

### 窗口控制

- **置顶/取消置顶**：点击 ▲/△ 按钮
- **小窗模式**：点击 ⬛/⬜ 按钮切换紧凑视图
  - 小窗模式下自动隐藏顶部控制栏
  - 只显示前6个待办事项
  - 自动置顶窗口
  - 按Alt+Q退出小窗模式
- **开机自启动**：点击 ⏻/⏼ 按钮切换开机自启动
- **最小化**：点击 − 按钮最小化窗口
- **最大化/还原**：点击 □ 按钮切换窗口大小
- **关闭**：点击 ✕ 按钮关闭应用

## 项目结构

```
HengSch/
├── src/
│   ├── main/                    # Electron 主进程
│   │   ├── index.ts            # 主进程入口，窗口管理和IPC通信
│   │   ├── preload.ts          # 预加载脚本，暴露API到渲染进程
│   │   └── auto-start.ts       # 开机自启动功能实现
│   ├── renderer/               # React 渲染进程
│   │   ├── App.tsx            # 根组件
│   │   ├── main.tsx           # 渲染进程入口
│   │   ├── components/         # React 组件
│   │   │   ├── TodoCard.tsx          # 待办事项卡片组件
│   │   │   ├── TodoList.tsx          # 待办事项列表组件
│   │   │   ├── AddTodoModal.tsx      # 添加待办事项模态框
│   │   │   ├── EditTodoModal.tsx     # 编辑待办事项模态框
│   │   │   ├── TodoDetailModal.tsx   # 待办事项详情模态框
│   │   │   ├── GroupManagerModal.tsx # 分组管理模态框
│   │   │   ├── ColorPicker.tsx       # 颜色选择器组件
│   │   │   └── WindowControls.tsx    # 窗口控制按钮组件
│   │   ├── context/            # Context 状态管理
│   │   │   ├── TodoContext.tsx       # 待办事项状态管理
│   │   │   ├── GroupContext.tsx      # 分组状态管理
│   │   │   └── WindowContext.tsx     # 窗口状态管理
│   │   ├── types/             # TypeScript 类型定义
│   │   │   ├── index.ts              # 主要类型定义
│   │   │   └── electron.d.ts         # Electron API 类型定义
│   │   └── styles/            # 样式文件
│   │       └── index.css              # 全局样式文件
├── public/                     # 静态资源
├── dist/                       # 构建输出目录
├── release/                    # 打包输出目录
├── package.json               # 项目配置和依赖
├── tsconfig.json              # TypeScript 配置
├── vite.config.ts            # Vite 构建配置
├── electron-builder.json      # Electron 打包配置
└── README.md                 # 项目文档
```

## 核心功能实现

### 状态管理

项目使用 React Context API 和 useReducer 进行状态管理，分为三个主要的 Context：

1. **TodoContext**: 管理待办事项的增删改查和排序
2. **GroupContext**: 管理分组的增删改查
3. **WindowContext**: 管理窗口状态（置顶、最小化、小窗模式等）

### 数据持久化

使用 `electron-store` 实现数据持久化，主要存储：
- 待办事项列表
- 分组列表
- 窗口位置和大小
- 小窗模式位置和大小
- 窗口置顶状态
- 小窗模式状态
- 开机自启动状态

### IPC 通信

主进程和渲染进程之间通过 Electron 的 IPC (Inter-Process Communication) 进行通信：
- 窗口控制：最小化、最大化、关闭、置顶、小窗模式切换
- 数据存储：读取、写入、删除配置数据
- 自启动控制：设置和获取开机自启动状态

## 开发指南

### 添加新功能

1. 在相应的 Context 中添加状态和操作函数
2. 在主进程中添加必要的 IPC 处理器
3. 在预加载脚本中暴露新的 API
4. 创建或更新相应的组件
5. 更新 TypeScript 类型定义

### 代码规范

- 使用 TypeScript 进行类型检查
- 遵循 ESLint 规则
- 使用 Prettier 格式化代码
- 组件使用函数式组件和 Hooks
- 状态管理优先使用 Context API

### 调试技巧

- 使用 Chrome DevTools 调试渲染进程
- 使用 `console.log` 和 `console.error` 进行日志输出
- 使用 Electron DevTools 查看主进程日志

## 已知问题

1. 开机自启动状态检测在某些平台上可能不准确
2. 大量待办事项时可能需要实现虚拟滚动来优化性能

## 性能优化

- 使用 React.memo 和 useMemo 优化组件渲染
- 使用防抖优化频繁的状态更新
- 优化 IPC 通信频率
- 使用 CSS 硬件加速
- 优化图片和静态资源加载

## 安全性

- 启用 contextIsolation 隔离渲染进程
- 禁用 nodeIntegration 防止渲染进程访问 Node.js API
- 使用预加载脚本安全地暴露 API
- 验证所有用户输入
- 避免使用危险的 exec 命令

## 开源协议

ISC License

## 贡献

欢迎提交 Issue 和 Pull Request！

在提交代码前，请确保：
1. 代码通过 ESLint 检查
2. 代码使用 Prettier 格式化
3. 添加必要的注释
4. 更新相关文档

## 作者

HengStar

## 更新日志

### v1.0.0
- 初始版本发布
- 实现基本的待办事项管理功能
- 支持分组管理
- 支持小窗模式
- 支持开机自启动
- 支持窗口置顶
- 支持拖放排序
