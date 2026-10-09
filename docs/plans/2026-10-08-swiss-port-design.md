# Swiss Precision → v1.0.0 桌面端移植设计

日期：2026-10-08
前置：`2026-10-08-ui-redesign-demos-design.md`（demo 阶段）；用户选定方案 01 Swiss Precision
用户决策：分组自定义颜色**保留**，以 8px 小面积色点使用，其余严格执行黑/白/信号红纪律

## 1. 范围

- 只改视觉与交互层：`v1.0.0/src/renderer/`（styles + 组件 JSX 结构微调）
- 不改：数据结构、Context/Reducer 逻辑、shared 包、主进程 IPC、小窗/贴边机制本身

## 2. 设计 Token（写入 index.css `:root`）

- 色：`--paper:#FAFAF8` `--ink:#0A0A0A` `--signal:#E63329` `--hairline:#E5E5E3` `--ink-2:#8A8A86` `--ink-3:#B9B9B4`
- 间距：8pt 系列 `--s1:8px … --s8:64px`
- 字体：Inter Tight（@fontsource 本地打包，离线可用）→ Helvetica Neue → Arial；数字 `tabular-nums`
- 圆角：Swiss 全局 `0`（浮层/按钮直角，checkbox 方形）

## 3. 布局改造

1. **头部**：`07` 两位补零大计数（72px+）+ 右侧 `TASKS REMAINING` 小标签与 `09 pending · 03 done`
2. **分组导航**：编号式 tab `00 ALL / 01 WORK …`（编号按分组数组动态重排），active 底部 2px 黑下划线；tab 行右侧 `+ ADD TASK` 方框按钮
3. **任务行**（56px、hairline 分隔、无卡片无圆角）：
   - 左：8px 状态方块（红=待办/黑=完成）；高优先行左缘 2px 红条
   - 中：标题（完成转 `--ink-2` + 删除线）
   - 右：hover 滑出 meta（截止 · 分组色点+名）；循环行尾 ↻；拖拽手柄 hover 出现
   - 行点击=详情、勾选=完成、hover 出现 ✎/🗑 动作（保持现有行为）
4. **页脚**：`09 PENDING · 03 COMPLETED · 12 TOTAL` + ADD TASK 黑底按钮
5. **WindowControls**：字符 `− □ ✕` 保留，改为线条 hover 态；7 个功能钮全部保留，缩小字号/间距

## 4. Signature 动效

- **Odometer 翻牌**：App 大计数组件，值变化时逐位上滑替换（180ms ease-out），reduced-motion 降为瞬时
- **FLIP 重排**：TodoList 用 useLayoutEffect 实现 First-Last-Invoke-Transition，勾选/筛选/拖拽后行位移动画 180ms

## 5. 冲突处理

- 分组色：行内不再整卡铺色，改为 8px 色点（meta 内）+ tab 色点；ColorPicker 功能保留
- 小窗 compact：计数缩 40px、隐藏 `TASKS REMAINING`/页脚、行高 44px、保留分组 tab 紧凑化
- 拖拽：保留原生 HTML5 drag，dragging 行降透明 + 虚线 hairline

## 6. 验收

- `tsc --noEmit` 0 error；eslint 0 error（warnings 不新增）
- 运行截图与 `docs/ui-redesign/demos/01-swiss.html` 观感一致（布局/色彩/字体/动效四对齐）
- 全部既有功能可用：CRUD、分组、筛选、拖拽、详情、小窗、置顶、自启、贴边
