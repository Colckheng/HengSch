# 自定义 NSIS 安装器：Swiss 纸感安装窗（2026-10-12）

## 背景与决策

当前安装器是 electron-builder 默认 NSIS MUI 向导（系统灰、默认字体、经典对话框），与桌面端 Swiss Precision 纸感 UI 严重脱节。经三档方案比较（A 品牌贴图 / B 全自绘脚本 / C 自研 Electron 安装器），确认走 **B**：

- **窗口内容全部自绘**（nsDialogs 自定义页），映射设计 token，与应用本体气质一致
- **窗口外壳保留系统原生标题栏**——安装器场景下去掉边框损害信任感，收益不抵成本
- 接受两个代价：差分 blockmap 语义失效（本无自动更新，零损失）；安装器脚本从官方模板改为自维护

## 页面流程（单页流，不设目录选择页）

默认装到 `%LOCALAPPDATA%\Programs\HengSch Todo`（多数同类应用惯例，Electron per-user 安装无需提权），三屏：

### 1/3 欢迎 · 安装位置
- 左上 H. 字标（复用 `icon.ico` 256 档导出的 PNG，48px）+ 「HengSch Todo」Inter Tight Semibold 22px 墨黑
- 副行：`v1.1.0 · Windows x64` mono 灰 `#8A8A86`
- 发丝线分隔 `#E5E5E3`
- 安装路径行：纸白输入框（发丝线描边，右角）+ 「浏览…」墨黑描边次级按钮，可编辑可浏览
- 底部行：勾选「创建桌面快捷方式」（默认勾）+「创建开始菜单快捷方式」（默认勾），自绘复选（直角小方块 + 墨黑勾）
- 右下主按钮：「安装」墨黑底纸白字

### 2/3 安装中
- 大号里程表数字：`000%` Inter Tight ExtraBold 64px 墨黑（补零到三位，呼应主界面里程表）
- 下方发丝线宽进度轨道 + 信号红 `#E63329` 填充
- 状态小字灰：「正在解压应用文件…」→「正在创建快捷方式…」→「正在注册卸载程序…」
- 无按钮（不可取消，解压仅数秒）

### 3/3 完成
- H. 字标 + 「安装完成」Inter Tight Semibold 22px
- 勾选「立即运行 HengSch Todo」（默认勾）
- 主按钮「完成」（运行勾选时按钮右下角缀 8px 信号红方点，呼应图标句点）

### 卸载器（同皮肤）
- 确认页：「确认卸载」+ 纸面警告文案 + 红色「卸载」主按钮（全应用唯一红色主按钮场景）
- 进度页：同 2/3 里程表 + 红进度
- 完成页：「卸载完成」+「完成」墨黑按钮

## 视觉规格（沿用设计语言，无新增色）

- 纸面 `#FAFAF8` 满铺窗体背景；墨黑 `#0A0A0A`；次级灰 `#8A8A86`；发丝线 `#E5E5E3`/`#D8D8D5`；信号红 `#E63329`
- 直角、无渐变、无阴影；按钮内边距与主界面一致的紧凑节奏
- 字体：捆绑 Inter Tight（400/600/800 三个字重 TTF，从 `packages/fontsource` 现有资产转换/取用），安装器运行时 `AddFontResource` 加载（不写入系统字体目录，卸载时 `RemoveFontResource`）；回退栈 `"Inter Tight", "Segoe UI"`
- 窗口尺寸约 520×340，固定不可缩放

## 技术方案

- `electron-builder.json`：`nsis.script` 指向 `build/installer.nsi`（自维护脚本），保留 `win.icon`（exe/安装器图标已是 H.）
- 自定义脚本基于 electron-builder 随包下发的 `core.nsh`/宏与插件体系构建：实施时先读 `node_modules/app-builder-lib/templates/nsis/*.nsi` 源码，照搬其**打包产物解压机制**（`app-64.7z` + Nsis7z 插件及其进度回调）与**安装器属性注册**（卸载注册表、DisplayName/Icon/EstimatedSize 等），仅替换呈现层
- 进度来源：沿用官方模板的解压进度回调喂给自绘进度条与里程表数字
- per-user 安装：`RequestExecutionLevel user`，快捷方式与卸载注册均写 HKCU，无 UAC 弹窗
- `.onInit` 校验同名实例是否运行（`FindWindow` 主窗口类名），运行中则提示并退出——与应用单实例锁语义衔接
- 卸载器同脚本生成（`WriteUninstaller`），运行中实例检测同上
- 字体资源在页面创建前加载、`.onGUIEnd`/卸载完成后释放

## 风险与兜底

| 风险 | 兜底 |
| --- | --- |
| 官方解压/注册宏不完全可复用 | 逐行读模板源码重写等价逻辑；保留 A 方案（`nsis.installerHeader` 贴图）作为极端情况退路 |
| Nsis7z 进度回调接入自绘控件有坑 | 退化为三阶段状态文字 + 不定值动画，里程表数字按阶段跳变（99% 封顶后完成） |
| Inter Tight 在安装环境加载失败 | 字体栈自动回退 Segoe UI，布局按 fallback 度量仍成立 |
| NSIS Unicode/中文路径 | `Unicode true` + 全脚本 Wide 字符串，装到含中文的自定义目录做验收项 |

## 验收

1. 门禁：`tsc + vite build`、`eslint --max-warnings 0`、根 `npm test` 全绿
2. 真机全流程：安装（默认路径 / 自定义含中文路径）→ 首启正常 → 卸载（运行中拦截提示）→ 残留检查（目录、开始菜单、桌面、HKCU 注册表项）
3. 视觉逐屏核对：纸面色、Inter Tight 生效、红色进度、里程表数字、勾选框行为
4. 通过后替换 GitHub Release 资产并更新说明
