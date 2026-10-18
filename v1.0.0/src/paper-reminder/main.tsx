import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter-tight/500.css';
import '@fontsource/inter-tight/700.css';
import { Paper, type Sample } from '../paper-lab/App';
import { PaperBin } from '../paper-lab/PaperBin';
import type { ReminderBridge, ReminderPaper } from './protocol';
import '../paper-lab/paper-lab.css';
import './overlay.css';

declare global { interface Window { reminderPaper: ReminderBridge } }

export function ReminderOverlay(): JSX.Element {
  const [papers, setPapers] = useState<ReminderPaper[]>([]);
  const [size, setSize] = useState({ x: 0, y: 0, width: innerWidth, height: innerHeight });
  const [states, setStates] = useState<Record<number, { ball: boolean; hot: boolean }>>({});
  const [message, setMessage] = useState('');
  const [reduced, setReduced] = useState(matchMedia('(prefers-reduced-motion: reduce)').matches);
  const ids = useRef(new Map<string, number>());
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    let alive = true;
    const apply = (next: ReminderPaper[]): void => { if (alive) setPapers(next); };
    const off = window.reminderPaper.onPapers(apply);
    void window.reminderPaper.ready().then(apply);
    const resize = (): void => setSize({ x: 0, y: 0, width: innerWidth, height: innerHeight });
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const change = (): void => setReduced(motion.matches);
    motion.addEventListener('change', change); window.addEventListener('resize', resize);
    const pendingTimers = timers.current;
    return () => { alive = false; off(); motion.removeEventListener('change', change); window.removeEventListener('resize', resize); pendingTimers.forEach(clearTimeout); };
  }, []);
  useEffect(() => {
    let held = false;
    let previous = '';
    const report = (): void => {
      const dialog = document.querySelector('.paper-detail');
      const elements = dialog ? [dialog] : [...document.querySelectorAll('.paper-object:not(:disabled)')];
      const regions = elements.map(el => { const r = el.getBoundingClientRect(); return { x: r.x - 8, y: r.y - 8, width: r.width + 16, height: r.height + 16 }; });
      const serialized = JSON.stringify([regions, held]);
      if (serialized !== previous) { previous = serialized; window.reminderPaper.hitRegions(regions, held); }
    };
    const down = (): void => { held = true; report(); };
    const up = (): void => { held = false; report(); };
    window.addEventListener('pointerdown', down); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up); window.addEventListener('blur', up);
    const timer = setInterval(report, 16);
    return () => { clearInterval(timer); window.removeEventListener('pointerdown', down); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); window.removeEventListener('blur', up); };
  }, []);
  const onState = useCallback((id: number, ball: boolean, hot: boolean) => {
    setStates(previous => previous[id]?.ball === ball && previous[id]?.hot === hot ? previous : { ...previous, [id]: { ball, hot } });
  }, []);
  const samples = useMemo(() => papers.map(paper => {
    const key = JSON.stringify([paper.todoId, paper.remindAt]);
    if (!ids.current.has(key)) ids.current.set(key, ids.current.size + 1);
    return { id: ids.current.get(key)!, title: paper.title, description: paper.description ?? '', group: paper.group ?? '待办', color: paper.color ?? '#E63329', time: paper.remindAt } satisfies Sample;
  }), [papers]);
  const trash = { x: size.width - 200, y: size.height - 212, width: 176, height: 184 };
  return <div className={`desktop-reminders ${reduced ? 'reduce-motion' : ''}`}>
    <div className="paper-stage" aria-label="到点提醒">
      {papers.map((paper, index) => {
        const key = JSON.stringify([paper.todoId, paper.remindAt]);
        const sample = samples[index];
        return <Paper key={key} sample={sample} index={index} count={papers.length} bounds={size} trash={trash} reduced={reduced} onState={onState} onActive={setMessage}
          onAction={async (_sample, action, snoozeAt) => {
            await window.reminderPaper.action({ todoId: paper.todoId, remindAt: paper.remindAt, action, snoozeAt });
            const timer = setTimeout(() => { timers.current.delete(timer); void window.reminderPaper.resolved(paper.todoId, paper.remindAt); }, reduced ? 30 : 520);
            timers.current.add(timer);
          }} />;
      })}
      <PaperBin visible={Object.values(states).some(s => s.ball)} hot={Object.values(states).some(s => s.hot)} rect={trash} />
    </div>
    <span className="overlay-status" role="status" aria-live="polite">{message}</span>
  </div>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><ReminderOverlay /></React.StrictMode>);
