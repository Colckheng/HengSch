import { useState, useEffect } from 'react';
import type { MonitorConfig } from '../types';
import { SwissSelect } from './SwissSelect';

interface MonitorSectionProps {
  monitor?: MonitorConfig;
  onChange: (monitor?: MonitorConfig) => void;
}

export function MonitorSection({ monitor, onChange }: MonitorSectionProps): JSX.Element {
  const [enabled, setEnabled] = useState(Boolean(monitor));
  const [exeName, setExeName] = useState(monitor?.exeName ?? '');
  const [threshold, setThreshold] = useState(String(monitor?.thresholdMinutes ?? 10));
  const [processes, setProcesses] = useState<string[]>([]);
  const [journal, setJournal] = useState(false);

  useEffect(() => {
    let alive = true;
    window.electronAPI.monitor
      .getJournalEnabled()
      .then((v) => { if (alive) setJournal(v); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    window.electronAPI.monitor
      .listProcesses()
      .then((list) => { if (alive) setProcesses(list); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [enabled]);

  const emit = (en: boolean, exe: string, th: string): void => {
    const minutes = parseInt(th, 10);
    if (en && exe.trim() && Number.isFinite(minutes) && minutes >= 1) {
      onChange({ exeName: exe.trim(), thresholdMinutes: minutes });
    } else {
      onChange(undefined);
    }
  };

  const handleToggle = (checked: boolean): void => {
    setEnabled(checked);
    emit(checked, exeName, threshold);
  };

  const handleExe = (value: string): void => {
    setExeName(value);
    emit(enabled, value, threshold);
  };

  const handleThreshold = (value: string): void => {
    setThreshold(value);
    emit(enabled, exeName, value);
  };

  const handleJournal = (checked: boolean): void => {
    setJournal(checked);
    window.electronAPI.monitor.setJournalEnabled(checked).catch(() => undefined);
  };

  const exeOptions = (() => {
    const lower = new Set(processes.map((p) => p.toLowerCase()));
    return exeName && !lower.has(exeName.toLowerCase()) ? [exeName, ...processes] : processes;
  })();

  return (
    <div className="monitor-section">
      <label className="monitor-toggle" htmlFor="monitor-enabled">
        <input
          id="monitor-enabled"
          type="checkbox"
          checked={enabled}
          onChange={(e) => handleToggle(e.target.checked)}
        />
        <span className="monitor-toggle-label">自动监测</span>
        <span className="monitor-hint">进程运行达阈值即自动完成</span>
      </label>

      {enabled && (
        <>
          <div className="form-group">
            <label htmlFor="monitor-exe">运行进程</label>
            <SwissSelect
              id="monitor-exe"
              options={[
                { value: '', label: '选择正在运行的进程…' },
                ...exeOptions.map((name) => ({ value: name, label: name }))
              ]}
              value={exeName}
              onChange={handleExe}
              placeholder="选择正在运行的进程…"
            />
            <input
              type="text"
              className="monitor-exe-manual"
              value={exeName}
              onChange={(e) => handleExe(e.target.value)}
              placeholder="或手动输入 exe 名，例：game.exe"
              autoComplete="off"
              aria-label="手动输入进程名"
            />
          </div>

          <div className="form-group">
            <label htmlFor="monitor-threshold">阈值（分钟）</label>
            <input
              id="monitor-threshold"
              type="number"
              min="1"
              value={threshold}
              onChange={(e) => handleThreshold(e.target.value)}
              placeholder="10"
              autoComplete="off"
            />
          </div>

          <label className="monitor-journal" htmlFor="monitor-journal">
            <input
              id="monitor-journal"
              type="checkbox"
              checked={journal}
              onChange={(e) => handleJournal(e.target.checked)}
            />
            <span>精确历史日志（每 2 分钟快照，覆盖软件未运行时段）</span>
          </label>
          <p className="monitor-note">
            每 2 分钟由计划任务记录一次进程快照；关闭开关即移除任务。冷启动时按日志回补当日空档（精度 ±2 分钟）。
          </p>
        </>
      )}
    </div>
  );
}
