# 自定义 NSIS 安装器：Swiss 纸感安装窗（2026-10-12）

## 背景与决策

当前安装器是 electron-builder 默认 NSIS MUI 向导（系统灰、默认字体、经典对话框），与桌面端 Swiss Precision 纸感 UI 严重脱节。经三档方案比较（A 品牌贴图 / B 全自绘脚本 / C 自研 Electron 安装器），确认走 **B**：

- **窗口内容全部自绘**（nsDialogs 自定义页），映射设计 token，与应用本体气质一致
- **窗口外壳保留系统原生标题栏**——安装器场景下去掉边框损害信任感，收益不抵成本
- 接受两个代价：差分 blockmap 语义失效（本无自动更新，零损失）；呈现层（页面）从官方模板改为自维护 hook 宏（安装/卸载逻辑仍走官方模板）

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
- 字体：捆绑 Inter Tight（400/600/800 三个字重 TTF，从根 `node_modules/@fontsource/inter-tight` 的 woff2 资产转 TTF），安装器运行时 `AddFontResource` 加载（不写入系统字体目录，卸载时 `RemoveFontResource`）；回退栈 `"Inter Tight", "Segoe UI"`
- 窗口尺寸约 520×340，固定不可缩放

## 技术方案（2026-10-12 修订：架构定案 `nsis.include`）

**架构定案：`nsis.include`（`build/installer.nsh` hook 宏），不用 `nsis.script` 全接管。**

调研证实 `nsis.script` 自定义脚本会让 `NsisTarget.js` `computeScriptAndSignUninstaller`（315-320 行）提前返回，跳过卸载器两遍构建——无 `UNINSTALLER_OUT_FILE`、无 `BUILD_UNINSTALLER` pass，而官方安装/卸载逻辑大量以 `!ifdef BUILD_UNINSTALLER` 分支包裹，全接管等于手工复刻卸载器构建且失去官方宏。`nsis.include` 路线保留官方两遍构建与全部安装逻辑，且 `getResource(this.options.include, "installer.nsh")` 会自动拾取 `build/installer.nsh`（buildResources 默认 `v1.0.0/build`）。

- `electron-builder.json`：`nsis.include: "build/installer.nsh"`（或省略——默认即此路径）+ `allowToChangeInstallationDirectory: false`（目录选择移入欢迎页，官方目录页移除）；保留 `win.icon`（exe/安装器图标已是 H.）
- **仅替换呈现层**：官方 `app-64.7z` 解压（Nsis7z）、卸载注册表（DisplayName/Icon/EstimatedSize）、快捷方式、`WriteUninstaller` 两遍构建全部保留；自定义集中在 `custom*` hook 宏：
  - `customWelcomePage`：自绘 nsDialogs 欢迎页（H. 字标 + 目录选择 + 两个快捷方式勾选），替代官方欢迎位
  - `customInstallmode`：设 `$isForceCurrentInstall "1"`，跳过安装模式页（per-user 单选、无 UAC）
  - `MUI_PAGE_INSTFILES` 前经 `customPageAfterChangeDir` 或页 `MUI_PAGE_CUSTOMFUNCTION_SHOW` 注入改色钩子（纸面/红进度/墨黑按钮/里程表）
  - `customFinishPage`：自绘完成页（立即运行勾选）
  - 卸载器：`customUnWelcomePage`（红色卸载确认页）→ instfiles 改色 → `customUninstallPage`（完成页），并在宏尾注入 `MUI_PAGE_CUSTOMFUNCTION_PRE` + `Abort` 跳过 `MUI_UNPAGE_FINISH`
  - `customRemoveFiles`：复刻 `uninstaller.nsh` 默认删除块（含 isUpdated 改名恢复流程），其后官方自动跑快捷方式清理
- 视觉实现：`SetCtlColors $HWNDPARENT ink paper` 全局纸面；进度条 `PBM_SETBARCOLOR`(0x0409 红) / `PBM_SETBKCOLOR`(0x2001 纸)，控件句柄用 EnumChildWindows + GetClassName `msctls_progress32` 查找（不猜控件 ID）；向导按钮 ID 1=Next/2=Cancel/3=Back，`SetWindowTheme "" ""` 去视觉样式后 `SetCtlColors` 做墨黑扁平按钮；里程表 % 用 SetTimer 回调轮询 `PBM_GETPOS`（回调参数忽略只 Pop 清栈），失败退化为阶段跳变
- 进度来源：官方解压进度条（Nsis7z 喂 `msctls_progress32`）+ 轮询转里程表数字
- per-user 安装：官方模板默认 `RequestExecutionLevel user`，快捷方式与卸载注册均写 HKCU，无 UAC 弹窗
- 同名实例拦截：沿用官方 `allowOnlyOneInstallerInstance.nsh`（与应用单实例锁语义衔接），卸载器端由 `customCheckAppRunning` 挂接
- 字体：Inter Tight 拉丁子集 TTF（400/600/800），从根 `node_modules/@fontsource/inter-tight` 的 woff2 用 wawoff2 转 TTF，放 `build/fonts/`；`.onInit` 用 `File` 嵌入 `$PLUGINSDIR` + `AddFontResourceW`，控件逐个 `CreateFontW`+`WM_SETFONT`（不动对话框字体以免 DLU 布局偏移）；中文靠 GDI 字体链接回退系统 CJK，与桌面端 CSS font stack 行为一致；卸载完成后 `RemoveFontResourceW`

## 风险与兜底

| 风险 | 兜底 |
| --- | --- |
| `nsis.include` hook 宏与官方页面插入点错位（-WX 使任何 NSIS 警告致命） | 逐行读 `templates/nsis/*.nsh` 对照插入顺序；宏体只引用插入时已 include 的命令 |
| Nsis7z 进度回调接入自绘控件有坑（阻塞且回调不确定） | 里程表数字按阶段跳变（SetTimer 轮询 `PBM_GETPOS`，拿不到就退化为状态文字 + 99% 封顶） |
| Inter Tight 在安装环境加载失败 | 字体栈自动回退 Segoe UI，布局按 fallback 度量仍成立 |
| NSIS Unicode/中文路径 | `Unicode true` + 全脚本 Wide 字符串，装到含中文的自定义目录做验收项 |

## 验收

1. 门禁：`tsc + vite build`、`eslint --max-warnings 0`、根 `npm test` 全绿
2. 真机全流程：安装（默认路径 / 自定义含中文路径）→ 首启正常 → 卸载（运行中拦截提示）→ 残留检查（目录、开始菜单、桌面、HKCU 注册表项）
3. 视觉逐屏核对：纸面色、Inter Tight 生效、红色进度、里程表数字、勾选框行为
4. 通过后替换 GitHub Release 资产并更新说明
