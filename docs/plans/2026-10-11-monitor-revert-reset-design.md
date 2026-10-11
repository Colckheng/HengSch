# 设计：撤销自动完成后的监测停摆修复（revert 重置 + 启动自愈）

日期：2026-10-11
状态：已确认（用户批准）
范围：桌面端（v1.0.0 Electron）+ shared-logic 纯函数
前置：`2026-10-11-monitor-once-ask-exit-design.md`（功能已上线，本次修 bug）

## 背景（用户报告 + 本机运行态还原）

用户场景：创建任务绑定 QQ 进程（auto+askOnExit）→ 退出 QQ → 弹窗答「还没做」→ 之后再打开 QQ，监测完全失效（不计时、不再达标、再退出也不弹窗）。

本机状态还原出的时间线：创建任务时 QQ 已运行约 84 分钟 → bootstrap 回溯直接记 84 分钟 → 超 10 分钟阈值 → 自动完成并置 `notified=true` → 用户答「还没做」撤销回待办 → **但 `notified=true` 未清**。

两个机制叠加造成死锁：

1. `creditPresence` 中 `if (progress.notified) return` —— 达标通知后当日记账永久冻结（防重复完成通知的设计）；撤销后任务回到待办，冻结却没解除 → 当天监测彻底停摆；
2. 「同天同任务只问一次」（askedToday）—— 已答过一次，后续退出沿不再弹窗，无补救机会。

同一僵死态（pending + notified=true）也可由用户手动撤销自动完成产生，同样停摆到次日 0 点。

## 修复

### 1. 撤销即重置（monitor-service `runAskDialog`）

- `resolveAskAction` 裁决为 `revert` 时，主进程在发送 `monitor:ask-resolved` 之前：
  - 重置当日进度：`progressStore[key] = createDayProgress(now)`（ms=0、notified=false、checkpoint=现在——从当前时刻重新记账，不回填历史）；持久化 + `pushProgress` 让 UI 徽标归零；
  - `askedToday.delete(askKey(todoId, now))` —— 解除当天询问限制；
- 效果：重新打开进程 → 重新计时 → 再跑满阈值 → 再次自动完成 → 再次退出 → 再次询问。每一轮都要求真实跑满阈值，天然限流，不构成骚扰。

### 2. 启动自愈（monitor-service `bootstrap`）

- 新增纯函数判定僵死态：任务待办 + 当日 progress.notified=true；
- bootstrap 逐条处理时，僵死态任务：`prog = createDayProgress(now)` 并**跳过**当日 journal 喂入与仍在运行进程回溯（避免一启动又立刻回填满阈值、立刻自动完成——用户刚说过「没做」）；
- 非僵死态任务路径完全不变（journal 补空档 + 回溯语义保持）；
- 覆盖场景：答「还没做」撤销、用户手动把自动完成的任务切回待办 —— 均在下次应用启动时恢复监测。

### 3. shared-logic 纯函数 + 单测

```ts
/** 僵死态：任务待办但当日已 notified——记账与达标判定均短路，调用方应重置当日进度 */
export function isProgressStale(
  progress: MonitorProgress | undefined,
  status: 'pending' | 'completed' | null
): boolean {
  return status === 'pending' && (progress?.notified ?? false);
}
```

单测：pending+notified → true；completed+notified → false；pending+未通知 → false；无进度记录 → false。

### 4. 文档

- README 监测小节补一句：答「还没做」撤销后当日进度重置、重新计时；
- architecture.md monitor-service 描述补「撤销重置/启动自愈」。

## 验证

1. 门禁：桌面 `npx tsc --noEmit` + `npm run lint`（0 警告）+ 根 `npm test`（62 + 新增单测）；
2. dev 热重载后自查：本机 QQ 任务当前为 completed 停摆态 → 切回待办 → 重启应用 → 观察进度徽标归零、重新计时；
3. 回归：正常任务（非僵死态）的 journal/回溯路径不受影响（bootstrap 分支只多一个前置判断）。

## 不做的事（YAGNI）

- 不做手动取消完成时的即时 IPC 重置（启动自愈已覆盖，少一条渲染层→主进程通道）；
- 不改「同天只问一次」的一般语义（仅 revert 后解除）；
- 不动 `creditPresence`/`markThresholdReached` 既有纯函数（冻结语义本身保留，只在正确的时机重置）。
