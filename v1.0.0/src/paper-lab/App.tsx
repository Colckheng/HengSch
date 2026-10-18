import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';



import { BALL_SIZE, HOLD_MS, PAPER_HEIGHT, PAPER_WIDTH, cancel, constrain, contains, createGesture, hold, initialPosition, move, press, release, type Gesture, type Point, type Rect } from './gesture';
import { CANVAS_HEIGHT, CANVAS_WIDTH, makePaperTexture, paintPaper } from './paper-material';
import { PaperBin } from './PaperBin';


export interface Sample { id: number; title: string; description: string; group: string; color: string; time: number }
type Action = 'complete' | 'dismiss' | 'snooze';
interface Entry { id: number; text: string }
const sampleTitles = ['给自己留十分钟，\n起来走走', '把今天的想法，写下来', '整理这一周值得留下的事'];
const formatTime = (value: number): string => new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(value);
const newSample = (id: number): Sample => ({ id, title: sampleTitles[(id - 1) % sampleTitles.length].replace('\n', ''),
  description: '先放下手里的事情，喝一点水，看看窗外。\n不用急着完成所有事，先照顾好自己。',
  group: ['日常生活', '随手记录', '每周回顾'][(id - 1) % 3], color: ['#E63329', '#0A0A0A', '#8A8A86'][(id - 1) % 3], time: Date.now() });

function PaperCanvas({ sample, gesture, reduced, object, hint, leaving, trash }: {
  sample: Sample; gesture: Gesture; reduced: boolean;
  object: React.RefObject<HTMLButtonElement>; hint: React.RefObject<HTMLDivElement>;
  leaving: Action | null; trash: Rect;
}): JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null);
  const visual = useRef({ ...gesture.center, progress: gesture.progress });
  const latest = useRef({ gesture, reduced, leaving, trash });
  latest.current = { gesture, reduced, leaving, trash };
  const wake = useRef<() => void>(() => undefined);
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => { let active = true; void document.fonts.ready.then(() => { if (active) setFontsReady(true); }); return () => { active = false; }; }, []);
  // Font readiness changes the pixels even though it is not part of the text.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const texture = useMemo(() => makePaperTexture({ title: sample.title, time: formatTime(sample.time), group: sample.group, color: sample.color, number: String(sample.id) }), [sample, fontsReady]);
  useLayoutEffect(() => {
    let frame = 0;
    let lastTime = 0;
    let exit: { at: number; x: number; y: number } | null = null;
    let painted = -1;
    const tick = (time: number): void => {
      frame = 0;
      if (!canvas.current || !object.current) return;
      const { gesture: target, reduced: quiet, leaving: action, trash: bin } = latest.current;
      const dt = Math.min(48, lastTime ? time - lastTime : 16.67);
      lastTime = time;
      const v = visual.current;
      const blend = quiet ? 1 : 1 - Math.exp(-dt / 52);
      const follow = quiet ? 1 : 1 - Math.exp(-dt / 14);
      v.progress += (target.progress - v.progress) * blend;
      if (Math.abs(v.progress - target.progress) < 0.001) v.progress = target.progress;
      v.x += (target.center.x - v.x) * follow;
      v.y += (target.center.y - v.y) * follow;
      if (Math.abs(v.x - target.center.x) < 0.08) v.x = target.center.x;
      if (Math.abs(v.y - target.center.y) < 0.08) v.y = target.center.y;
      const width = PAPER_WIDTH * (1 - v.progress) + BALL_SIZE * v.progress;
      const height = PAPER_HEIGHT * (1 - v.progress) + BALL_SIZE * v.progress;
      let x = v.x; let y = v.y; let scale = 1; let rotate = 0; let opacity = 1;
      if (action) {
        if (!exit) exit = { at: time, x, y };
        const t = quiet ? 1 : Math.min(1, (time - exit.at) / 430);
        if (action === 'dismiss' && target.progress === 1) {
          const mouthX = bin.x + bin.width / 2;
          const mouthY = bin.y + 33;
          if (t < 0.4) {
            const u = 1 - (1 - t / 0.4) ** 3;
            x = exit.x + (mouthX - exit.x) * u;
            y = exit.y + (mouthY - 16 - exit.y) * u;
            scale = 1 - u * 0.1;
          } else {
            const u = (t - 0.4) / 0.6;
            x = mouthX; y = mouthY - 16 + u * u * 81;
            scale = 0.9 - u * 0.36;
            opacity = 1 - Math.max(0, (u - 0.68) / 0.32);
          }
          // Stay in front until above the mouth; the foreground wall then occludes it.
          object.current.style.zIndex = t < 0.4 ? '40' : '25';
          rotate = t * 32;
        } else { scale = 1 - t * 0.12; opacity = 1 - t; y -= t * 18; }
        if (t < 1) frame = requestAnimationFrame(tick);
      }
      object.current.style.width = `${width}px`;
      object.current.style.height = `${height}px`;
      object.current.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) rotate(${rotate}deg) scale(${scale})`;
      object.current.style.opacity = String(opacity);
      if (hint.current) {
        hint.current.style.transform = `translate3d(${v.x}px, ${v.y + height / 2 + 22}px, 0) translateX(-50%)`;
      }
      if (painted !== v.progress) { paintPaper(canvas.current, texture, v.progress); painted = v.progress; }
      if (!action && (v.progress !== target.progress || v.x !== target.center.x || v.y !== target.center.y)) frame = requestAnimationFrame(tick);
    };
    wake.current = () => { if (!frame) { lastTime = 0; frame = requestAnimationFrame(tick); } };
    wake.current();
    return () => { cancelAnimationFrame(frame); wake.current = () => undefined; };
  }, [texture, object, hint]);
  useLayoutEffect(() => { wake.current(); });
  return <canvas ref={canvas} className="paper-material" style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }} aria-hidden="true" />;
}
export function Paper({ sample, index, count, bounds, trash, reduced, onState, onAction, onActive }: {
  sample: Sample; index: number; count: number; bounds: Rect; trash: Rect; reduced: boolean;
  onState: (id: number, ball: boolean, hot: boolean) => void;
  onAction: (sample: Sample, action: Action, at?: number) => Promise<void>;
  onActive: (text: string) => void;
}): JSX.Element {
  const [gesture, setGesture] = useState(() => createGesture(initialPosition(index, count, bounds)));
  const current = useRef(gesture);
  const button = useRef<HTMLButtonElement>(null);
  const hint = useRef<HTMLDivElement>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout>>();
  const automaticFrame = useRef(0);
  const mounted = useRef(true);
  const [detail, setDetail] = useState(false);
  const [menu, setMenu] = useState(false);
  const [custom, setCustom] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [pointerInput, setPointerInput] = useState(false);
  const [leaving, setLeaving] = useState<Action | null>(null);
  const busy = useRef(false);
  const dialog = useRef<HTMLDivElement>(null);
  const drift = useRef({ vx: 0, vy: 0 });
  const cursor = useRef<Point | null>(null);
  const ball = gesture.progress === 1;
  const handling = gesture.pointer !== null;
  const hot = (gesture.phase === 'ball-moving' && contains(trash, gesture.last)) || (pending && ball);
  const apply = useCallback((next: Gesture): void => { current.current = next; setGesture(next); }, []);
  const clearHold = (): void => { clearTimeout(holdTimer.current); holdTimer.current = undefined; };
  const resetGrip = (): void => { clearHold(); cancelAnimationFrame(automaticFrame.current); apply(cancel(current.current, bounds)); };
  const unfold = (): void => { apply(createGesture(constrain(current.current.center, 0, bounds))); onActive('纸片已展开，可以重新查看。'); };

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; clearTimeout(holdTimer.current); cancelAnimationFrame(automaticFrame.current); };
  }, []);
  useEffect(() => {
    onState(sample.id, ball || gesture.phase === 'crumpling', hot);
    return () => onState(sample.id, false, false);
  }, [sample.id, ball, gesture.phase, hot, onState]);
  useEffect(() => {
    const next = cancel(current.current, bounds);
    apply({ ...next, center: initialPosition(index, count, bounds) });
  }, [apply, bounds, count, index]);
  useEffect(() => {
    const track = (event: PointerEvent): void => { cursor.current = { x: event.clientX, y: event.clientY }; };
    window.addEventListener('pointermove', track);
    return () => window.removeEventListener('pointermove', track);
  }, []);
  // 静止时缓慢游走；鼠标靠近、按住或任何非纸片状态时停下
  useEffect(() => {
    const speed = 14;
    if (!drift.current.vx && !drift.current.vy) {
      const angle = Math.random() * Math.PI * 2;
      drift.current = { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
    }
    const timer = setInterval(() => {
      const g = current.current;
      if (detail || pending || leaving || busy.current || g.pointer !== null || g.phase !== 'paper') return;
      const near = cursor.current;
      if (near && Math.hypot(near.x - g.center.x, near.y - g.center.y) < 96) return;
      const halfW = PAPER_WIDTH / 2 + 12;
      const halfH = PAPER_HEIGHT / 2 + 12;
      const lowX = bounds.x + halfW;
      const highX = bounds.x + bounds.width - halfW;
      const lowY = bounds.y + halfH;
      const highY = bounds.y + bounds.height - halfH;
      let x = g.center.x + drift.current.vx * 0.05;
      let y = g.center.y + drift.current.vy * 0.05;
      if (x <= lowX) { x = lowX; drift.current.vx = Math.abs(drift.current.vx); }
      else if (x >= highX) { x = highX; drift.current.vx = -Math.abs(drift.current.vx); }
      if (y <= lowY) { y = lowY; drift.current.vy = Math.abs(drift.current.vy); }
      else if (y >= highY) { y = highY; drift.current.vy = -Math.abs(drift.current.vy); }
      if (x !== g.center.x || y !== g.center.y) apply({ ...g, center: { x, y } });
    }, 50);
    return () => clearInterval(timer);
  }, [apply, bounds, detail, leaving, pending, reduced]);
  useEffect(() => {
    if (detail) dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [detail]);
  useEffect(() => {
    const abort = (): void => { if (current.current.pointer !== null || current.current.phase === 'crumpling') { clearHold(); cancelAnimationFrame(automaticFrame.current); apply(cancel(current.current, bounds)); } };
    const key = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || busy.current) return;
      if (current.current.pointer !== null || current.current.phase === 'crumpling') { abort(); onActive('已取消抓取，提醒仍保留。'); }
      else if (detail) { if (menu) setMenu(false); else { setDetail(false); button.current?.focus(); } }
    };
    window.addEventListener('blur', abort);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('blur', abort); window.removeEventListener('keydown', key); };
  }, [apply, bounds, detail, menu, onActive]);

  const pointerPoint = (event: React.PointerEvent): Point => {
    const rect = event.currentTarget.closest('.paper-stage')!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const start = (event: React.PointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0 || busy.current || current.current.pointer !== null) return;
    setPointerInput(true);
    event.preventDefault(); button.current?.focus({ preventScroll: true });
    const next = press(current.current, pointerPoint(event), event.pointerId, performance.now());
    apply(next);
    event.currentTarget.setPointerCapture(event.pointerId);
    clearHold();
    holdTimer.current = setTimeout(() => {
      apply(hold(current.current, performance.now()));
      if (current.current.phase === 'crumpling') onActive('移动揉纸，揉成纸团。Escape 可取消。');
    }, HOLD_MS + 1);
  };
  const drag = (event: React.PointerEvent<HTMLButtonElement>): void => {
    if (current.current.pointer !== event.pointerId || busy.current) return;
    apply(move(current.current, pointerPoint(event), event.pointerId, bounds));
    if (current.current.phase === 'moving') { clearHold(); onActive('正在移动纸片，松手放下。'); }
    else if (current.current.phase === 'ball-moving') onActive(contains(trash, current.current.last) ? '松手关闭本次提醒，待办仍保留。' : '纸团已揉好，拖到右下角纸篓。');
  };
  const act = async (action: Action, at?: number): Promise<void> => {
    if (busy.current) return;
    busy.current = true; setPending(true); setError(''); resetGrip();
    try {
      await onAction(sample, action, at);
      if (!mounted.current) return;
      setDetail(false); setLeaving(action);
    } catch {
      if (!mounted.current) return;
      setError('操作未保存，请重试。');
      onActive('操作未保存，提醒仍保留，可以重试。');
      busy.current = false; setPending(false);
    }
  };
  const end = (event: React.PointerEvent<HTMLButtonElement>): void => {
    clearHold();
    const result = release(current.current, pointerPoint(event), event.pointerId, bounds, trash);
    apply(result.gesture);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (result.intent === 'open') { setDetail(true); setMenu(false); }
    if (result.intent === 'unfold') unfold();
    if (result.intent === 'discard') void act('dismiss');
  };
  const autoCrumple = (): void => {
    setDetail(false); setError('');
    const initial = cancel(current.current, bounds);
    const started = performance.now();
    const step = (time: number): void => {
      const t = reduced ? 1 : Math.min(1, (time - started) / 760);
      const progress = t * t * (3 - 2 * t);
      apply({ ...initial, progress, phase: t === 1 ? 'ball' : 'crumpling' });
      if (t < 1) automaticFrame.current = requestAnimationFrame(step);
      else { button.current?.focus({ preventScroll: true }); onActive('纸团已揉好，拖到纸篓；点击可以展开。'); }
    };
    automaticFrame.current = requestAnimationFrame(step);
  };
  const trapFocus = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Tab') return;
    const elements = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') ?? []);
    const first = elements[0]; const last = elements[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  return <>
    <button ref={button} className={`paper-object ${leaving ? 'is-leaving' : ''}`} data-phase={gesture.phase} data-progress={gesture.progress.toFixed(3)} data-paper-id={sample.id} data-pointer-input={pointerInput}
      aria-label={`${ball ? '展开纸团' : '查看提醒'}：${sample.title}`}
      style={{ zIndex: handling ? 40 : leaving ? 25 : 5 + index,
        visibility: detail ? 'hidden' : 'visible' }}
      disabled={pending} onPointerDown={start} onPointerMove={drag} onPointerUp={end}
      onPointerCancel={resetGrip} onLostPointerCapture={() => { if (current.current.pointer !== null) resetGrip(); }}
      onKeyDown={(event) => {
        setPointerInput(false);
        if ((event.key === 'Enter' || event.key === ' ') && !busy.current && (current.current.phase === 'paper' || current.current.phase === 'ball')) {
          event.preventDefault(); if (ball) unfold(); else setDetail(true);
        }
      }}
      onClick={(event) => { if (event.detail === 0 && !busy.current && (current.current.phase === 'paper' || current.current.phase === 'ball')) { if (ball) unfold(); else setDetail(true); } }}>
      <PaperCanvas sample={sample} gesture={gesture} reduced={reduced} object={button} hint={hint} leaving={leaving} trash={trash} />
      <span className="paper-grip-indicator" aria-hidden="true" />
    </button>
    {!detail && !leaving && (error || pending) && <div ref={hint} id={`hint-${sample.id}`} className={`paper-hint ${error ? 'has-error' : ''}`} style={{ visibility: hot ? 'hidden' : 'visible' }}>
      {error || '正在保存…'}
    </div>}
    {detail && <div className="detail-veil" onPointerDown={(event) => { if (event.target === event.currentTarget && !pending) { setDetail(false); button.current?.focus(); } }}>
      <div className="paper-detail" ref={dialog} role="dialog" aria-modal="true" aria-labelledby={`detail-title-${sample.id}`} onKeyDown={trapFocus}>
        <div className="detail-heading"><span className="eyebrow">REMINDER / {String(sample.id).padStart(2, '0')}</span><button className="icon-button" aria-label="收起详情" disabled={pending} onClick={() => { setDetail(false); button.current?.focus(); }}>×</button></div>
        <span className="group-label"><i style={{ background: sample.color }} />{sample.group}</span>
        <h2 id={`detail-title-${sample.id}`}>{sample.title}</h2>
        <p className="detail-time">{formatTime(sample.time)} · 到点提醒</p>
        <p className="detail-description">{sample.description}</p>
        {error && <p role="alert" className="action-error">{error}</p>}
        {!menu ? <>
          <div className="detail-primary"><button className="action-primary" disabled={pending} onClick={() => void act('complete')}>✓ 完成待办</button><button className="action-secondary" disabled={pending} onClick={() => setMenu(true)}>稍后提醒</button></div>
          <div className="detail-secondary"><button disabled={pending} onClick={autoCrumple}>揉成纸团 ↗</button><button disabled={pending} onClick={() => void act('dismiss')}>关闭本次提醒</button></div>
        </> : <div className="snooze-menu"><span className="eyebrow">什么时候再提醒？</span>
          <div className="snooze-choices">{[10, 30, 60].map((minutes) => <button key={minutes} disabled={pending} onClick={() => void act('snooze', Date.now() + minutes * 60_000)}>{minutes === 60 ? '1 小时后' : `${minutes} 分钟后`}</button>)}
            <button disabled={pending} onClick={() => { const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(9, 0, 0, 0); void act('snooze', tomorrow.getTime()); }}>明天 09:00</button></div>
          <label htmlFor={`custom-${sample.id}`}>自定义时间</label><input id={`custom-${sample.id}`} type="datetime-local" value={custom} disabled={pending} onChange={(event) => setCustom(event.target.value)} />
          <div className="detail-primary"><button className="action-primary" disabled={pending} onClick={() => { const at = new Date(custom).getTime(); if (!Number.isFinite(at) || at <= Date.now()) setError('请选择将来的有效时间。'); else void act('snooze', at); }}>确定时间</button><button className="action-secondary" disabled={pending} onClick={() => { setMenu(false); setError(''); }}>返回</button></div>
        </div>}
      </div>
    </div>}
  </>;
}

export function App(): JSX.Element {
  const stage = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState<Rect>({ x: 0, y: 0, width: 850, height: 640 });
  const [samples, setSamples] = useState<Sample[]>(() => [newSample(1)]);
  const [generation, setGeneration] = useState(0);
  const [states, setStates] = useState<Record<number, { ball: boolean; hot: boolean }>>({});
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [failNext, setFailNext] = useState(false);
  const failure = useRef(false);
  const [message, setMessage] = useState('点击纸片查看，或长按后试着揉一揉。');
  const [entries, setEntries] = useState<Entry[]>([]);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const sequence = useRef(2);
  const epoch = useRef(0);
  const nextEntry = useRef(1);
  useLayoutEffect(() => {
    if (!stage.current) return;
    const resize = new ResizeObserver(([entry]) => setBounds({ x: 0, y: 0, width: entry.contentRect.width, height: entry.contentRect.height }));
    resize.observe(stage.current);
    return () => resize.disconnect();
  }, []);
  useEffect(() => { const currentTimers = timers.current; return () => currentTimers.forEach(clearTimeout); }, []);
  const trash: Rect = { x: bounds.width - 200, y: bounds.height - 212, width: 176, height: 184 };
  const visible = Object.values(states).some((state) => state.ball);
  const hot = Object.values(states).some((state) => state.hot);
  const onState = useCallback((id: number, ball: boolean, hot: boolean) => {
    setStates((previous) => {
      if (previous[id]?.ball === ball && previous[id]?.hot === hot) return previous;
      return { ...previous, [id]: { ball, hot } };
    });
  }, []);
  const onAction = async (sample: Sample, action: Action, at?: number): Promise<void> => {
    const activeEpoch = epoch.current;
    await new Promise((resolve) => setTimeout(resolve, 160));
    if (activeEpoch !== epoch.current) throw new Error('Reset');
    if (failure.current) { failure.current = false; setFailNext(false); throw new Error('Simulated write failure'); }
    if (action === 'snooze' && (!at || at <= Date.now())) throw new Error('Invalid snooze');
    const text = action === 'complete' ? '示例待办已完成' : action === 'dismiss' ? '本次提醒已关闭 · 示例待办仍未完成' : `稍后提醒已设为 ${formatTime(at!)}`;
    setMessage(text);
    setEntries((previous) => [{ id: nextEntry.current++, text }, ...previous].slice(0, 4));
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      if (activeEpoch === epoch.current) setSamples((previous) => previous.filter((item) => item.id !== sample.id));
    }, reduced ? 20 : 500);
    timers.current.add(timer);
  };
  const reset = (): void => {
    epoch.current += 1; timers.current.forEach(clearTimeout); timers.current.clear();
    setStates({}); setSamples([newSample(1)]); setGeneration((value) => value + 1); setEntries([]); sequence.current = 2;
    failure.current = false; setFailNext(false); setMessage('新纸片准备好了。试试长按，再小幅移动揉纸。');
  };
  return <div className={`lab ${reduced ? 'reduce-motion' : ''}`}>
    <header className="lab-header"><a className="wordmark" href="./paper-lab.html">H<span className="brand-dot">.</span> <span>HENGSCH</span></a><span className="prototype-badge">体验原型 / 示例数据</span></header>
    <main className="lab-layout"><aside className="lab-sidebar">
      <span className="eyebrow">HENGSCH / REMINDER</span><h1>到点提醒。<br />处理，然后继续。</h1>
      <p className="intro">一张纸，记住眼前的小事。<br />做完，留到稍后，或揉一揉放下。</p>
      <div className="instructions"><div><span>01</span><p><strong>点一下，看看提醒</strong><small>完成、稍后，或直接关闭本次提醒。</small></p></div><div><span>02</span><p><strong>长按，移动揉成团</strong><small>按住后任意移动，纸片就会逐渐收皱。</small></p></div><div><span>03</span><p><strong>放进纸篓，轻一点</strong><small>只关闭提醒，待办仍留在列表里。</small></p></div></div>
      <div className="lab-controls"><button className="action-primary" onClick={reset}>↺ 再试一次</button><button className="action-secondary" disabled={samples.length >= 3} onClick={() => { const id = sequence.current++; setSamples((previous) => [...previous, newSample(id)]); }}>＋ 加一张纸</button></div>
      <details className="lab-options"><summary>体验选项</summary><label><input type="checkbox" checked={reduced} onChange={(event) => setReduced(event.target.checked)} />减少动态效果</label><label><input type="checkbox" checked={failNext} onChange={(event) => { failure.current = event.target.checked; setFailNext(event.target.checked); }} />下次操作模拟保存失败</label></details>
      <div className="lab-note"><span className="eyebrow">试用说明</span><p>这里只使用示例。完成与稍后操作会显示结果，不会修改你的真实待办。</p></div>
    </aside><section className="workspace"><div className="workspace-heading"><span>提醒预览</span><span>{String(samples.length).padStart(2, '0')} 张纸片</span></div>
      <div ref={stage} className="paper-stage" style={{ minHeight: bounds.width < 690 && samples.length > 2 ? samples.length * 240 + 50 : 520 }} aria-label="纸片交互体验区">
        <div className="stage-grain" aria-hidden="true" />
        <div className="stage-caption" aria-hidden="true">留一点空白，<br />给正在发生的生活。</div>
        {samples.map((sample, index) => <Paper key={`${generation}-${sample.id}`} sample={sample} index={index} count={samples.length} bounds={bounds} trash={trash} reduced={reduced} onState={onState} onAction={onAction} onActive={setMessage} />)}
        <PaperBin visible={visible} hot={hot} rect={trash} />
        {samples.length === 0 && <div className="stage-empty"><span>✓</span><h2>桌面轻了一点。</h2><p>这次提醒已经处理好了。</p><button onClick={reset}>再拿一张纸 ↗</button></div>}
      </div><footer className="workspace-status"><span className="status-dot" /><p role="status" aria-live="polite">{message}</p><span className="escape-hint">ESC 取消</span></footer>
      {entries.length > 0 && <ol className="event-list" aria-label="示例操作记录">{entries.map((entry) => <li key={entry.id}>{entry.text}</li>)}</ol>}
    </section></main><footer className="lab-footer"><span>HENGSCH — PAPER REMINDERS</span><span>交互原型 01 · 纸片 / 揉纸 / 丢弃</span></footer>
  </div>;
}




