# B-3 SenseVoiceSmall spike：速度与质量对比

日期：2026-10-30 ｜ 验证基线：`06513ae` + 工作区新增（spike 脚本，本报告与脚本待批提交） ｜ 环境：Windows / Ryzen 9 5900HX 8C16T / 16GB / 8 线程

## 方法

- 1 轮热身丢弃 + 5 轮正式；两引擎顺序交替（whisper→SV、SV→whisper）；**每轮全新进程**。墙钟包含模型加载、解码与进程退出；不刷 OS 文件缓存；哈希与日志 IO 不计时。
- 夹具（均 16kHz mono PCM16，SHA-256 入报告 JSON）：`scripts/fixtures/jfk.wav`（11.0s）+ SenseVoice 官方 `zh.wav`（5.592s）/ `en.wav`（7.152s）。
- 运行器：`v1.0.0/scripts/sensevoice-spike.cjs`；机器可读报告 `sensevoice-spike-2026-10-30.json`（methodology / integrity / payloads / runs / summary）；逐轮 stdout/stderr 在 `C:\Users\hengxing\AppData\Local\Temp\opencode\hengsch-b3-bench-S9KxG1\`（临时目录）。
- 复现命令：`node v1.0.0/scripts/sensevoice-spike.cjs --assets-dir C:\Users\hengxing\AppData\Local\Temp\opencode --rounds 5 --threads 8 --report docs/evidence/ai-assistant/sensevoice-spike-2026-10-30.json`
- sherpa 参数：`--sense-voice-language=auto --sense-voice-use-itn=1 --num-threads=8 --provider=cpu`（脚本内置资产 SHA-256 校验，不匹配即中止）。

## 资产与校验（SHA-256 全部通过）

| 资产 | 版本/来源 | 字节 |
| --- | --- | --- |
| sherpa-onnx 运行时包 | GitHub release v2.0.1，sha `a644dfe2…58596` | 25,567,228（含解压） |
| sherpa-onnx-offline.exe + onnxruntime.dll + providers_shared.dll | 实际打包子集 | 20,667,904 |
| SenseVoiceSmall int8 模型 | HF rev `2365baeacb507f821a0c8120fcee3d484dba7a07`，sha `c71f0ce0…cd51` | 239,233,841 |
| tokens.txt | 同 rev，sha `f449eb28…9a1dc` | 315,894 |
| whisper 现状模型 ggml-small-q5_1.bin | sha `ae85e4…11bb`（与 voice-service pin 一致） | 190,085,487 |

## 实测结果（5 轮中位数）

| 样本 | 时长 | whisper 中位（min–max） | SenseVoice 中位（min–max） | 加速比 | wall RTF（whisper / SV） |
| --- | --- | --- | --- | --- | --- |
| jfk | 11.000s | 7726.7ms（7580–7886） | 2283.4ms（2219–2418） | **3.38×** | 0.702 / 0.208 |
| zh | 5.592s | 7130.3ms（7093–7345） | 2142.2ms（2089–2549） | **3.33×** | 1.275 / 0.383 |
| en | 7.152s | 7509.4ms（7403–7633） | 2194.8ms（2165–2336） | **3.42×** | 1.050 / 0.307 |

时间分解（SV 全部 15 轮原始日志）：

- 模型加载 `recognizer created`：**1.78–2.24s**（中位约 1.85s）——占墙钟主体。
- 解码 `Elapsed`：zh 0.162–0.180s、en 0.213–0.248s、jfk 0.301–0.360s（**RTF 0.03–0.06**）。
- 进程启动/退出等余量约 0.15s。
- 结论：SV 若做成**常驻进程/复用识别器**，2.1–2.3s 还能压到亚秒级；whisper 7.1–7.9s 是自回归解码本身，无法靠复用消除。

## 转写对照

| 样本 | whisper | SenseVoice | 评注 |
| --- | --- | --- | --- |
| jfk | `…for your country.`（全对，带标点） | `…for your country`（内容全对，句末无标点） | 基本等价 |
| zh | `开放时间早上九点至下午五点。` | `开饭时间早上9点至下午5点。` | **开放/开饭分歧**（SV 疑似误识别）；SV 做了 ITN（九点→9点） |
| en | `…with 50 pieces of gold.` | `…with 50 pieces of code.` | **SV 错词**（gold→code） |

小样本质量结论：**3 条 whisper 全对；SV 中英各 1 条错词**。速度赢 3.4×，质量在本组样本下弱于 whisper；`zh.wav` 无权威参考文本，只记录分歧不判对错。定稿前应补一轮真实中文待办语音对比。

## 体积

| 项 | whisper 现状 | SenseVoice 方案 | 差值 |
| --- | --- | --- | --- |
| 运行时（exe+dll） | 13,080,064 B | 20,667,904 B | **+7,587,840 B（+7.2 MiB）**，主要为 onnxruntime.dll 17.8MB |
| 模型+词表 | 190,085,487 B | 239,549,735 B | **+49,464,248 B（+47.2 MiB）** |
| 双后端共存 | — | 模型合计 429,635,222 B（≈410 MiB）+ 两套运行时 | — |

模型与运行时均不入 git、不进 electron-builder（现 whisper 模型也是安装后按需下载，fetch 脚本可仿写）。

## 许可

| 组件 | 许可 | 集成影响 |
| --- | --- | --- |
| whisper.cpp / ggml | MIT | 现状不变 |
| sherpa-onnx | Apache-2.0 | 保留 NOTICE/版权声明即可 |
| onnxruntime v1.28.2 | MIT（已核 LICENSE 原文） | 需随包附版权声明 |
| SenseVoice **模型权重** | FunASR Model Open Source License v1.1（HF 卡指向该许可） | **非 MIT**：须署名来源与模型名、保留模型标识，含禁诋毁条款；仓库代码 MIT 不覆盖权重。集成须在应用「关于/致谢」列出处 |
| sherpa 官方测试夹具 wav | 随仓库发布，仅作内部对比 | 不随产品分发 |

## 本轮门禁

`TEMP`/`TMP` 指向 `C:\Users\hengxing\AppData\Local\Temp\opencode`，均在 `D:\todo\HengSch` 执行。

| 命令 | 结果 |
| --- | --- |
| `npx tsc --noEmit --project v1.0.0/tsconfig.json` | 通过 |
| `npm run lint --workspace=v1.0.0` | 通过，0 警告 |
| `npm run build --workspace=v1.0.0` | 通过 |
| `npm test` | 桌面 73、共享 105、sync-bridge 13 全过 |
| `npm run ai:smoke --workspace=v1.0.0` | `voice ok`、`ai-smoke ok` |
| `npm run ai:acceptance --workspace=v1.0.0 -- --no-screenshots` | **56/56**，`rendererErrors: []`，`screenshotsSkipped: true` |
| `npm run reminder:integration --workspace=v1.0.0 -- --no-screenshots` | **15/15**，`errors: []`，`screenshotsSkipped: true` |

环境注记：

- 本会话 Electron `capturePage()` 报 `Current display surface not available for capture`，普通模式（及 `--disable-gpu`）均在 batch-delete-preview 截图处失败，属环境问题、与代码无关。为此给 `ai-acceptance.cjs` / `reminder-integration.cjs` 增加显式 `--no-screenshots` 参数，报告含 `screenshotsSkipped` 字段，全部功能断言照常执行。
- 日志中 `确认卡已过期`、`模拟批量写入失败`、`请选择将来的时间` 为用例设计内的故障注入/校验路径，非回归。
- 提醒回归产物 `production-integration.json` 已还原为运行前版本。

## 结论与决策点（待拍板）

**spike 结论**：速度收益真实（3.3–3.4×，常驻化后可再降），小样本质量弱于 whisper；体积 +47MB 模型 / +7.2MB 运行时；许可需模型署名。

- **A. 双后端共存（默认 whisper，SV 作"快速模式"可选）**——`voice-service` 抽后端 + 设置加模型下拉；成本：第二套下载器（hf-mirror 分段）、进度 UI 从百分比退化为 加载→解码→完成 三段、stdout JSON 解析、About 署名。
- **B. 直接替换 SenseVoice**——集成最省，但小样本 1/3 错词风险 + 中文现状可用性下降。
- **C. 维持现状**——whisper `-t 8` 已 5s 级、在 30s 超时内，B-3 降级为记录性 spike，不集成。

建议：**A**，且定稿前补一轮真实中文待办语音对比；若你更在意"少一套下载/许可/双份维护"，选 C 也站得住。
