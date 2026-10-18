import { PAPER_HEIGHT as H, PAPER_WIDTH as W } from './gesture';

export interface PaperContent { title: string; time: string; group: string; color: string; number: string }
interface Vertex { x: number; y: number; z: number; u: number; v: number }
type Triangle = [number, number, number];
const COLS = 7;
const ROWS = 5;
export const CANVAS_WIDTH = 368;
export const CANVAS_HEIGHT = 268;
const noise = (n: number): number => { const v = Math.sin(n * 127.1 + 41.7) * 43758.5453; return v - Math.floor(v); };

function lines(ctx: CanvasRenderingContext2D, value: string, maxWidth: number, limit: number): string[] {
  const result: string[] = [];
  let current = '';
  for (const char of value) {
    if (ctx.measureText(current + char).width > maxWidth && current) {
      result.push(current);
      current = '';
      if (result.length === limit) {
        result[limit - 1] = result[limit - 1].slice(0, -1) + '…';
        return result;
      }
    }
    current += char;
  }
  if (current) result.push(current);
  return result;
}

export function makePaperTexture(content: PaperContent): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = W * 2;
  canvas.height = H * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.scale(2, 2);
  const gradient = ctx.createLinearGradient(0, 0, W, H);
  gradient.addColorStop(0, '#fefefc');
  gradient.addColorStop(0.72, '#f8f8f6');
  gradient.addColorStop(1, '#e9e9e7');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);
  // Reproducible paper grain; generated once per content change, never per frame.
  for (let i = 0; i < 1600; i += 1) {
    ctx.fillStyle = `rgba(10,10,10,${0.015 + noise(i + 3) * 0.035})`;
    ctx.fillRect(noise(i) * W, noise(i + 3000) * H, 0.5, 0.7);
  }
  ctx.strokeStyle = '#d3d3d1';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
  ctx.fillStyle = '#E63329';
  ctx.fillRect(23, 25, 6, 6);
  ctx.font = '600 10px "Inter Tight", "Microsoft YaHei", sans-serif';
  ctx.fillText('待办提醒', 38, 32);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#91918f';
  ctx.font = '11px Consolas, monospace';
  ctx.fillText(content.number.padStart(2, '0'), W - 23, 32);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#282826';
  ctx.font = '600 19px "Microsoft YaHei", sans-serif';
  lines(ctx, content.title, W - 48, 2).forEach((line, i) => ctx.fillText(line, 23, 68 + i * 29));
  ctx.fillStyle = '#737371';
  ctx.font = '12px Consolas, "Microsoft YaHei", monospace';
  ctx.fillText(content.time, 23, 125);
  ctx.strokeStyle = '#d7d7d5';
  ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(23, 143); ctx.lineTo(W - 23, 143); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = content.color;
  ctx.beginPath(); ctx.arc(26, 165, 3, 0, Math.PI * 2); ctx.fill();
  ctx.font = '11px "Microsoft YaHei", sans-serif';
  ctx.fillStyle = '#737371';
  ctx.fillText(content.group, 37, 169);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#898987';
  ctx.fillText('点击查看  ↗', W - 24, 169);
  ctx.fillStyle = '#e0e0de';
  ctx.beginPath(); ctx.moveTo(W - 15, H); ctx.lineTo(W - 15, H - 15); ctx.lineTo(W, H - 15); ctx.closePath(); ctx.fill();
  return canvas;
}

const sourceVertices: Vertex[] = [];
const triangles: Triangle[] = [];
for (let row = 0; row <= ROWS; row += 1) {
  for (let col = 0; col <= COLS; col += 1) {
    const id = row * (COLS + 1) + col;
    const u = (col + (col > 0 && col < COLS ? (noise(id + 11) - 0.5) * 0.6 : 0)) / COLS;
    const v = (row + (row > 0 && row < ROWS ? (noise(id + 77) - 0.5) * 0.6 : 0)) / ROWS;
    sourceVertices.push({ x: (u - 0.5) * W, y: (v - 0.5) * H, z: 0, u, v });
    if (row < ROWS && col < COLS) {
      const next = id + COLS + 1;
      triangles.push(...((row + col) % 2 ? [[id, id + 1, next], [id + 1, next + 1, next]] : [[id, id + 1, next + 1], [id, next + 1, next]]) as Triangle[]);
    }
  }
}

function fold(vertex: Vertex, index: number, progress: number): Vertex {
  const nx = vertex.u * 2 - 1;
  const ny = vertex.v * 2 - 1;
  // Map the original rectangle to an uneven circular volume, keeping shared edges joined.
  const diskX = nx * Math.sqrt(1 - ny * ny / 2);
  const diskY = ny * Math.sqrt(1 - nx * nx / 2);
  const radius = 28 + noise(index + 31) * 7;
  const targetX = diskX * radius;
  const targetY = diskY * radius;
  const wave = Math.sin(progress * Math.PI) * 9;
  const z = progress * ((noise(index + 90) - 0.5) * 22 + 15 * (1 - Math.min(1, Math.hypot(diskX, diskY))));
  return { ...vertex,
    x: vertex.x * (1 - progress) + targetX * progress + (noise(index + 39) - 0.5) * wave,
    y: vertex.y * (1 - progress) + targetY * progress + (noise(index + 49) - 0.5) * wave - z * 0.16,
    z };
}

function trianglePath(ctx: CanvasRenderingContext2D, a: Vertex, b: Vertex, c: Vertex): void {
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.closePath();
}

export function paintPaper(canvas: HTMLCanvasElement, texture: HTMLCanvasElement, progress: number): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== CANVAS_WIDTH * dpr || canvas.height !== CANVAS_HEIGHT * dpr) {
    canvas.width = CANVAS_WIDTH * dpr;
    canvas.height = CANVAS_HEIGHT * dpr;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, CANVAS_WIDTH * dpr / 2, CANVAS_HEIGHT * dpr / 2);
  ctx.clearRect(-CANVAS_WIDTH / 2, -CANVAS_HEIGHT / 2, CANVAS_WIDTH, CANVAS_HEIGHT);
  if (progress < 0.002) { ctx.drawImage(texture, -W / 2, -H / 2, W, H); return; }
  const vertices = sourceVertices.map((vertex, i) => fold(vertex, i, progress));
  const sorted = [...triangles].sort((left, right) => left.reduce((sum, i) => sum + vertices[i].z, 0) - right.reduce((sum, i) => sum + vertices[i].z, 0));
  for (const [ai, bi, ci] of sorted) {
    const a = vertices[ai]; const b = vertices[bi]; const c = vertices[ci];
    const sa = sourceVertices[ai]; const sb = sourceVertices[bi]; const sc = sourceVertices[ci];
    const sx1 = (sb.u - sa.u) * texture.width; const sy1 = (sb.v - sa.v) * texture.height;
    const sx2 = (sc.u - sa.u) * texture.width; const sy2 = (sc.v - sa.v) * texture.height;
    const determinant = sx1 * sy2 - sx2 * sy1;
    const ax = ((b.x - a.x) * sy2 - (c.x - a.x) * sy1) / determinant;
    const bx = ((c.x - a.x) * sx1 - (b.x - a.x) * sx2) / determinant;
    const ay = ((b.y - a.y) * sy2 - (c.y - a.y) * sy1) / determinant;
    const by = ((c.y - a.y) * sx1 - (b.y - a.y) * sx2) / determinant;
    ctx.save();
    trianglePath(ctx, a, b, c);
    ctx.fillStyle = '#f6f6f4'; ctx.fill();
    ctx.clip();
    ctx.transform(ax, ay, bx, by, a.x - ax * sa.u * texture.width - bx * sa.v * texture.height, a.y - ay * sa.u * texture.width - by * sa.v * texture.height);
    ctx.drawImage(texture, 0, 0);
    ctx.restore();
    const ux = b.x - a.x; const uy = b.y - a.y; const uz = b.z - a.z;
    const vx = c.x - a.x; const vy = c.y - a.y; const vz = c.z - a.z;
    const normal = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    const length = Math.hypot(...normal) || 1;
    const light = (-normal[0] * 0.45 - normal[1] * 0.55 + Math.abs(normal[2]) * 0.7) / length;
    const darkness = Math.min(0.46, Math.max(0, 0.72 - light) * progress * 0.7);
    trianglePath(ctx, a, b, c);
    ctx.fillStyle = `rgba(67,55,35,${darkness})`; ctx.fill();
    ctx.strokeStyle = `rgba(111,99,73,${progress * 0.14})`; ctx.lineWidth = 0.5; ctx.stroke();
  }
}
