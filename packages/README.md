# HengSch Shared Packages

本目录包含 HengSch 项目的共享代码包，采用 Monorepo 架构，供桌面端、Web 端、移动端共同使用。

## 包说明

### @hengsch/shared-types

共享的 TypeScript 类型定义，包括：
- `Todo`、TodoItem、RecurringTodo`：待办事项相关类型
- `Group`：分组相关类型
- `TodoType、CycleType`：枚举类型

### @hengsch/shared-logic

共享的业务逻辑，包括：
- `calculateNextDueDate`：计算循环任务的下次到期时间
- `toggleTodoStatus`：切换待办事项状态（含循环任务的下次到期时间计算）
- `sortTodosByStatus`：按状态排序待办事项
- `filterTodosByGroup`：按分组筛选待办事项
- `generateTodoId、generateGroupId`：生成 ID 的工具函数

### @hengsch/shared-storage

存储接口抽象，定义统一的存储接口 `IStorage`：
- `get<T>(key: string): Promise<T | undefined>`
- `set<T>(key: string, value: T): Promise<void>`
- `delete(key: string): Promise<void>`
- `clear?(): Promise<void>`（可选）
- `keys?(): Promise<string[]>`（可选）

不同端可以实现各自的存储实现：
- 桌面端：基于 `electron-store`，通过 IPC 接口实现
- Web 端：基于 `localStorage` 或 `IndexedDB`
- 移动端：基于 `AsyncStorage` / `MMKV` 等

## 使用方式

### 安装依赖

在根目录运行：
```bash
npm install
```

这会自动安装所有 workspace 包的依赖。

### 构建包

构建所有共享包：
```bash
npm run build:packages
```

或单独构建某个包：
```bash
cd packages/shared-types
npm run build
```

### 在项目中使用

在 `v1.0.0`、`v1.1.0-web`、`v1.1.0-an` 中，通过 workspace 协议引用：

```json
{
  "dependencies": {
    "@hengsch/shared-types": "workspace:*",
    "@hengsch/shared-logic": "workspace:*",
    "@hengsch/shared-storage": "workspace:*"
  }
}
```

然后在代码中导入：
```typescript
import type { Todo, Group } from '@hengsch/shared-types';
import { toggleTodoStatus, sortTodosByStatus } from '@hengsch/shared-logic';
import type { IStorage } from '@hengsch/shared-storage';
```

## 开发说明

- 所有包使用 TypeScript 编写
- 包之间可以相互依赖（如 `shared-logic` 依赖 `shared-types`）
- 开发时可以通过 TypeScript 路径别名直接引用源码，无需构建
- 生产构建时需要先构建共享包，再构建应用
