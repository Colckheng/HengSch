# HengSch Todo UI 重设计 — 7 套获奖级 Demo 设计文档

日期：2026-10-08
状态：已获用户批准
目标：参考 Awwwards / Red Dot / iF / UX Design Awards / CSS Design Awards 水准，产出 7 套差异化的完整 UI 方案 demo，选定后移植进桌面端 v1.0.0。

## 一、决策摘要

- **范围**：桌面端 v1.0.0 优先（demo 模拟无边框窗口形态）
- **形式**：纯静态自包含 HTML，每套一个文件 + gallery.html 索引页
- **风格**：4 种点名气质全做 + 3 种补充方案，共 7 套
- **IA**：允许重设计信息架构（每套可不同）
- **功能**：核心功能（待办/分组/完成切换）保留，交互层与视觉层全面重做

## 二、文件结构

```
docs/ui-redesign/demos/
├── gallery.html        # 索引页
├── 01-swiss.html       # Swiss Precision      — Red Dot/iF 克制
├── 02-editorial.html   # Editorial Ink        — 印刷设计
├── 03-glass.html       # Glass Flow           — CSS Design Awards
├── 04-terminal.html    # Terminal HUD         — 深色数据风
├── 05-brutalist.html   # Brutalist Motion     — Awwwards 实验
├── 06-calm.html        # Calm OS              — UX Design Awards
└── 07-bento.html       # Bento Playful        — 便当格+黏土
```

## 三、共同基座约定（7 套一致，保证公平对比）

1. **窗口模拟**：页面为中性深灰底（各套可微调），中央渲染 800×600 桌面窗口（圆角、投影、无边框），含自定义标题栏（可拖拽感视觉、最小化/最大化/关闭三按钮）。
2. **统一假数据**（7 套内容完全一致）：

```
分组：
- work  工作   #E63329 (方案可改色但语义一致)
- life  生活   #7A9B76
- study 学习   #8AA6B8

任务（12 条）：
[work] 1. 完成 Q4 产品路线图初稿            pending  今天   高
[work] 2. Review PR #42 · 认证模块重构        pending  今天
[work] 3. 准备周五用户访谈提纲                pending  明天
[work] 4. 回复设计团队组件库反馈              pending  本周五
[work] 5. 发布 v1.2.0 release notes          completed
[life] 6. 买牛奶和鸡蛋                        pending  今天
[life] 7. 预约周六洗牙                        pending  周六
[life] 8. 每日晚间拉伸 15 分钟（循环 daily）   pending  今天
[life] 9. 给绿萝浇水                          completed
[study] 10. 读完《设计中的设计》第 3 章        pending  今天
[study] 11. 每周整理学习笔记（循环 weekly）    pending  周日
[study] 12. TypeScript 泛型练习               completed
```

3. **真实可交互**（非静态截图）：勾选完成（带 signature 动效）、切换分组筛选、hover 状态、打开"添加任务"浮层（表单可填、回车/按钮可真正插入列表）。
4. **Signature moment**：每套至少 1 个标志性瞬间（见各套 spec）。
5. **技术边界**：vanilla HTML/CSS/JS，内联无外链脚本；字体走 Google Fonts / fontshare CDN 且必须有系统字体回退链；动效仅 CSS + 少量 vanilla JS。
6. **无障碍**：键盘可 Tab 到达主要控件并有可见 focus；支持 `prefers-reduced-motion` 降级；对比度尽量 AA+（Calm OS 要求 AAA）。
7. **响应**：窗口在小视口下允许缩放/裁切，不产生页面横向滚动条崩坏。

## 四、各套方案 Spec

### 01 Swiss Precision（Red Dot / iF）
- 色：纸白 `#FAFAF8` 底、墨黑 `#0A0A0A`、信号红 `#E63329`、灰阶 hairline（`#E5E5E3`/`#8A8A86`）
- 字：Inter Tight（回退 Helvetica Neue/Arial），数字 `font-variant-numeric: tabular-nums`
- IA：标题栏下超大剩余计数（≥72px，tabular）+ 全宽行式列表（hairline 分隔、行高统一），分组切换=左缘编号式 tab（01 WORK / 02 LIFE / 03 STUDY），无卡片、无阴影
- Signature：完成 → 大计数 odometer 翻牌 + 行 FLIP 重排动画（180ms ease-out）
- 细节：8pt 间距系统；状态用 8px 实心方块（红=待办、黑=完成）；hover 行右滑出 meta（日期/分组）；红色仅用于计数与高优先标记；focus=2px 黑框 offset 2px

### 02 Editorial Ink（印刷设计）
- 色：报纸米白 `#F4F1EA`、墨黑 `#1A1714`、印刷红 `#C8322B`、旧金 `#B08D57`
- 字：Newsreader（衬线，回退 Georgia）标题；Space Grotesk（回退 Arial）全大写宽字距小标签
- IA："HengSch DAILY" 头版——报头（刊名+日期+期号 NO.xxx）、头条=高优先任务大标题占上 1/3、正文双栏任务条目（栏目名+序号+一行导语）、右栏"编辑部便签"=分组
- Signature：完成 = 印刷红划线动画（伪元素 background-size 0→100% 横扫）+ 条目转灰
- 细节：全页极细纸张噪点（SVG feTurbulence 或 CSS repeating-gradient）；分栏竖线；红色手写感批注符号（✓ / 改用 ✦）；期号=已完成数

### 03 Glass Flow（CSS Design Awards）
- 色：暗底 `#0B0B14` + 2-3 个大模糊渐变光斑（紫 `#7B2FFF`、蓝 `#2F6BFF`、青 `#2FD0C6`），缓慢漂移动画；玻璃卡 `rgba(255,255,255,.07)` + `backdrop-filter: blur(16px)` + 1px `rgba(255,255,255,.14)` 高光边
- 字：General Sans（fontshare，回退 Inter/system-ui）
- IA：顶栏周热力条（7 天完成热力）+ 任务玻璃卡片纵向流 + 分组色带 chips
- Signature：完成 = 卡片中心光爆波纹（radial 扩散）+ 背景光斑色相推进
- 细节：全局噪点 overlay（opacity .04）；鼠标移动视差光斑（JS，轻量）；卡片 hover 轻浮起+高光增强；完成卡片降透明并加 ✓

### 04 Terminal HUD（深色数据风）
- 色：底 `#0C0F0E`、主绿 `#33FF66`、琥珀 `#FFB000`、青 `#5EE0E0`、dim `#5A6B60`；CRT 扫描线 opacity ≤.05
- 字：JetBrains Mono（回退 Cascadia Code/monospace）全等宽
- IA：顶栏系统状态（uptime、今日 throughput 迷你条形图、负载条=完成率）；主体=进程表列头 `PID  TASK  STATE  DUE  GRP`；分组=左侧挂载卷 `/work` `/life` `/study`；底部命令行 `hengsch@local:~$` **可真实输入**，回车添加任务（插入表首，打字机入场）
- Signature：添加=逐字打字机入队；完成=该行变 dim + 打印 `process exited 0`
- 细节：状态 `[ ]`/`[✓]` ASCII；闪烁光标 `▋`；hover 行出现反色块；循环任务标注 `↻`；reduced-motion 关闭扫描线与闪烁

### 05 Brutalist Motion（Awwwards 实验）
- 色：酸性绿 `#CCFF00`、电光紫 `#7B2FFF`、警示橙 `#FF4D00`、纯黑白高对比
- 字：Archivo Black（标题，回退 Impact/Arial Black）+ Space Grotesk（正文）
- IA：错位网格——任务=超大标题行（clamp 28–56px 占满行宽）、行左缘巨型序号（01…）、分组名=顶部 marquee 横滚带、右上背景层巨型完成率水印数字
- Signature：完成 = strikethrough 从左疾扫（120ms）+ 行 padding 坍缩 + 整页撞色闪一帧（2 次 background 交替）
- 细节：hover 整行 `mix-blend-mode: difference` 反色；2px 粗描边按钮；贴纸标签 rotate(-3°)；入场标题字符错位 stagger；禁用圆角（0 radius）

### 06 Calm OS（UX Design Awards）
- 色：暖白 `#F7F5F2`、墨 `#2B2926`、鼠尾草绿 `#5F8A5B`（完成）、雾蓝 `#6E93A8`（进行）、琥珀 `#C98A2E`（到期）；每个状态=颜色+图标+文字三重编码
- 字：system-ui 栈 + Nunito Sans（回退），行高 ≥1.6
- IA：垂直时间轴——「今天」按上午/下午/晚上分段 → 「接下来 7 天」→ 「已完成」折叠区；右侧常驻专注卡片（当前高亮任务 + 25:00 计时器 + 开始/暂停）
- Signature：完成 = 柔和呼吸圆环收缩 + 时间轴节点灯点亮；专注模式启动 = 列表柔焦退后、只留当前任务
- 细节：微文案（完成反馈"很好，今天已完成 3/5"）；44px 最小触达；`aria-live` 播报完成；focus 环 3px；reduced-motion 全降级；AAA 对比（正文 ≥7:1）

### 07 Bento Playful（便当格 + 黏土）
- 色：奶油底 `#FFF8EE`、黏土珊瑚 `#FF8A7A`、晴蓝 `#7AB8FF`、开心果 `#A8D8A0`、阳光 `#FFD166`、墨 `#3A342C`
- 字：Nunito（回退 Quicksand/system-ui），粗圆数字
- IA：CSS Grid 不等大便当盒——大格=今日进度环（液态填充）、中格=任务清单、小格=streak 火焰（3 天）、小格=分组色块计数、小格=格言；圆角 24–32px
- Signature：完成 = 格子弹性 pop（scale bounce 400ms cubic-bezier 弹性）+ 进度环液态推进 + 达成 5/8 时轻彩纸
- 细节：黏土质感=内高光 `inset 0 2px 0 rgba(255,255,255,.8)` + 外柔影；按压 `scale(.97)`；全部状态有圆润触感；空状态用纯 CSS 表情

## 五、验收标准

1. 7 文件 + gallery 均可在浏览器直接打开，无控制台报错
2. 每套完成切换/分组筛选/添加任务三类交互真实可用
3. 每套 signature moment 可被观察到
4. 键盘 Tab 可达主要控件，focus 可见
5. `prefers-reduced-motion` 下动效降级不报错
6. 7 套假数据一致；视觉系统互相差异化明显

## 六、后续（移植阶段，另行规划）

- 选定 1–2 套后，制定移植计划：CSS 变量主题系统 + 组件层重构进 `v1.0.0` React
- 桌面端特色形态（小窗 compact / 贴边缩入）需在移植时纳入主题适配
