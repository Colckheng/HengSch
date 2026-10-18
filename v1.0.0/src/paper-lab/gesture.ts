export interface Point { x: number; y: number }
export interface Rect extends Point { width: number; height: number }
export type Phase = 'paper' | 'pressing' | 'moving' | 'crumpling' | 'ball' | 'ball-pressing' | 'ball-moving';
export type Intent = 'none' | 'open' | 'unfold' | 'discard';
export const HOLD_MS = 350;
export const CLICK_SLOP = 6;
export const PAPER_WIDTH = 304;
export const PAPER_HEIGHT = 196;
export const BALL_SIZE = 62;

export interface Gesture {
  phase: Phase;
  center: Point;
  progress: number;
  pointer: number | null;
  startedAt: number;
  start: Point;
  last: Point;
  offset: Point;
  distance: number;
}

export function createGesture(center: Point): Gesture {
  return { phase: 'paper', center, progress: 0, pointer: null, startedAt: 0,
    start: center, last: center, offset: { x: 0, y: 0 }, distance: 0 };
}

export function initialPosition(index: number, count: number, bounds: Rect): Point {
  const columns = count > 1 && bounds.width >= 690 ? 2 : 1;
  const x = bounds.x + bounds.width * ((index % columns) + 0.5) / columns;
  const y = bounds.y + (count === 1 ? 180 : 142) + Math.floor(index / columns) * 240;
  return constrain({ x, y }, 0, bounds);
}

export function contains(rect: Rect, point: Point): boolean {
  return point.x >= rect.x && point.y >= rect.y && point.x <= rect.x + rect.width && point.y <= rect.y + rect.height;
}

export function constrain(center: Point, progress: number, bounds: Rect): Point {
  const halfW = (PAPER_WIDTH * (1 - progress) + BALL_SIZE * progress) / 2;
  const halfH = (PAPER_HEIGHT * (1 - progress) + BALL_SIZE * progress) / 2;
  const clamp = (n: number, low: number, high: number): number => high < low ? (low + high) / 2 : Math.max(low, Math.min(high, n));
  return { x: clamp(center.x, bounds.x + halfW + 12, bounds.x + bounds.width - halfW - 12),
    y: clamp(center.y, bounds.y + halfH + 12, bounds.y + bounds.height - halfH - 12) };
}

export function press(g: Gesture, point: Point, pointer: number, time: number): Gesture {
  if (g.pointer !== null || (g.phase !== 'paper' && g.phase !== 'ball')) return g;
  return { ...g, phase: g.phase === 'ball' ? 'ball-pressing' : 'pressing', pointer, startedAt: time,
    start: point, last: point, offset: { x: point.x - g.center.x, y: point.y - g.center.y },
    distance: 0 };
}

export function hold(g: Gesture, time: number): Gesture {
  return g.phase === 'pressing' && time - g.startedAt >= HOLD_MS
    ? { ...g, phase: 'crumpling' } : g;
}

export function move(g: Gesture, point: Point, pointer: number, bounds: Rect): Gesture {
  if (g.pointer !== pointer) return g;
  let phase = g.phase;
  if (phase === 'pressing' || phase === 'ball-pressing') {
    if (Math.hypot(point.x - g.start.x, point.y - g.start.y) <= CLICK_SLOP) return g;
    phase = phase === 'pressing' ? 'moving' : 'ball-moving';
  }
  const next = { ...g, phase };
  if (phase === 'crumpling') {
    const dx = point.x - g.last.x;
    const dy = point.y - g.last.y;
    const length = Math.hypot(dx, dy);
    // Every movement contributes equally, independent of direction or event size.
    next.distance += length;
    next.progress = Math.min(1, next.distance / 440);
    next.last = point;
    if (next.progress >= 1) { next.phase = 'ball-moving'; next.offset = { x: 0, y: 0 }; }
  } else {
    next.last = point;
  }
  const grip = phase === 'crumpling' ? 1 - next.progress : 1;
  next.center = constrain({ x: point.x - g.offset.x * grip, y: point.y - g.offset.y * grip }, next.progress, bounds);
  return next;
}

export function cancel(g: Gesture, bounds: Rect): Gesture {
  const ball = g.progress >= 1;
  return { ...createGesture(constrain(g.center, ball ? 1 : 0, bounds)), phase: ball ? 'ball' : 'paper', progress: ball ? 1 : 0 };
}

export function release(g: Gesture, point: Point, pointer: number, bounds: Rect, trash: Rect | null): { gesture: Gesture; intent: Intent } {
  if (g.pointer !== pointer) return { gesture: g, intent: 'none' };
  const click = Math.hypot(point.x - g.start.x, point.y - g.start.y) <= CLICK_SLOP;
  let intent: Intent = 'none';
  if (g.phase === 'pressing' && click) intent = 'open';
  if (g.phase === 'ball-pressing' && click) intent = 'unfold';
  if (g.phase === 'ball-moving' && trash && contains(trash, point)) intent = 'discard';
  return { gesture: cancel(g, bounds), intent };
}
