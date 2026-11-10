// Rules Academy diagrams: the situation is run on the real engine for a few seconds and drawn from
// above: wind, marks and the 4-length zone, the start line or the bank, each boat's track, and the
// boats where they start (solid) and where they end up (faint). So the picture is what really happens.
import { buildScene, PlanFn, SceneDef } from '@/sim/scene';
import { dir, n180 } from '@/sim/math';
import { drawBoat } from './render';

export interface DiagramBoat {
  label: string; color: string; isPlayer: boolean; disabled: boolean;
  pts: { x: number; y: number; hdg: number; twa: number; sheet: number }[];
  hail: { x: number; y: number; text: string } | null;
}

export interface DiagramData {
  boats: DiagramBoat[];
  marks: { x: number; y: number; name: string; zone: boolean }[];
  line: { x1: number; y1: number; x2: number; y2: number } | null;
  bank: { x: number; y: number }[];
  twd: number;
  L: number;
}

/** Run the scene and keep what the diagram needs. Labels are by role; "player" is your boat. */
export function sceneDiagram(scene: SceneDef, plan: PlanFn | 'ai' | undefined, seconds: number, labels: Record<string, string>, seed = 1): DiagramData {
  const { race } = buildScene(scene, seed, plan);
  const boats: DiagramBoat[] = race.boats.map(b => ({
    label: b.isPlayer ? labels.player ?? 'You' : labels[b.name] ?? b.name,
    color: b.color, isPlayer: b.isPlayer, disabled: !!b.disabled, pts: [], hail: null,
  }));
  const rec = () => race.boats.forEach((b, i) => boats[i].pts.push({ x: b.x, y: b.y, hdg: b.hdg, twa: b.twa, sheet: b.sheet }));
  rec();
  let ev = 0;
  for (let k = 1; k <= seconds * 20; k++) {
    race.step();
    if (k % 4 === 0) rec();
    for (; ev < race.events.length; ev++) {
      const e = race.events[ev];
      if (e.type !== 'hail') continue;
      const i = race.boats.findIndex(b => b.id === e.boat);
      if (i >= 0 && !boats[i].hail) boats[i].hail = { x: race.boats[i].x, y: race.boats[i].y, text: e.text };
    }
  }
  const c = race.course, L = c.L;
  // Marks near the action, with the zone drawn round the ones a boat is sailing to.
  const near = (x: number, y: number, r: number) => boats.some(bt => bt.pts.some(p => Math.hypot(p.x - x, p.y - y) < r));
  const marks = c.marks
    .filter(m => near(m.p.x, m.p.y, 9 * L))
    .map(m => ({ x: m.p.x, y: m.p.y, name: m.kind === 'pin' ? 'Pin' : m.kind === 'start-stbd' ? 'Start mark' : m.label === '1' ? 'Mark 1' : m.label, zone: m.kind !== 'pin' && m.kind !== 'start-stbd' && near(m.p.x, m.p.y, 5.5 * L) }));
  const P = c.start.pin, S = c.start.stbd;
  const line = near((P.x + S.x) / 2, (P.y + S.y) / 2, 9 * L) || near(P.x, P.y, 6 * L) || near(S.x, S.y, 6 * L) ? { x1: P.x, y1: P.y, x2: S.x, y2: S.y } : null;
  const B = c.bounds;
  const corner = (a: number, x: number) => ({ x: c.origin.x + c.up.x * a + c.right.x * x, y: c.origin.y + c.up.y * a + c.right.y * x });
  const bank = [corner(B.alongMin, -B.across), corner(B.alongMax, -B.across), corner(B.alongMax, B.across), corner(B.alongMin, B.across)];
  return { boats, marks, line, bank, twd: race.wind.meanTwd(0), L };
}

const FONT = "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', sans-serif";

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color: string, size = 12, align: CanvasTextAlign = 'left', weight = 600) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(6,11,22,0.7)'; ctx.fillText(s, x + 0.8, y + 0.8);
  ctx.fillStyle = color; ctx.fillText(s, x, y);
}

/** Draw the diagram to fit the canvas. */
export function drawDiagram(ctx: CanvasRenderingContext2D, d: DiagramData, w: number, h: number, dpr: number) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#0B1A31';
  ctx.fillRect(0, 0, w, h);
  // Fit the tracks, with room for labels.
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const grow = (x: number, y: number) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
  for (const b of d.boats) for (const p of b.pts) grow(p.x, p.y);
  for (const m of d.marks) grow(m.x, m.y);
  const L = d.L;
  const pad = 2.2 * L;
  x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
  const s = Math.min(w / (x1 - x0), h / (y1 - y0));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const X = (x: number) => w / 2 + (x - cx) * s;
  const Y = (y: number) => h / 2 - (y - cy) * s;

  // Streaks.
  ctx.strokeStyle = 'rgba(180,205,255,0.07)';
  ctx.lineWidth = 1;
  const wd = dir(d.twd + 180);
  ctx.beginPath();
  for (let i = 0; i < 14; i++) for (let j = 0; j < 10; j++) {
    const sx = ((i * 97 + j * 31) % 100) / 100 * w, sy = ((j * 53 + i * 17) % 100) / 100 * h;
    ctx.moveTo(sx, sy); ctx.lineTo(sx + wd.x * 10, sy - wd.y * 10);
  }
  ctx.stroke();

  // Bank: land outside the pond.
  ctx.save();
  ctx.beginPath();
  ctx.rect(-10, -10, w + 20, h + 20);
  ctx.moveTo(X(d.bank[0].x), Y(d.bank[0].y));
  for (let k = 1; k < 4; k++) ctx.lineTo(X(d.bank[k].x), Y(d.bank[k].y));
  ctx.closePath();
  ctx.fillStyle = '#0A140F';
  ctx.fill('evenodd');
  ctx.restore();

  // Start line.
  if (d.line) {
    ctx.setLineDash([7, 5]); ctx.strokeStyle = '#FFB340'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(X(d.line.x1), Y(d.line.y1)); ctx.lineTo(X(d.line.x2), Y(d.line.y2)); ctx.stroke();
    ctx.setLineDash([]);
  }
  // Zones and marks.
  for (const m of d.marks) {
    if (m.zone) {
      ctx.setLineDash([5, 5]); ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.strokeStyle = 'rgba(255,255,255,0.38)'; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(X(m.x), Y(m.y), 4 * L * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.setLineDash([]);
      text(ctx, '4-length zone', X(m.x), Y(m.y) + 4 * L * s - 10, 'rgba(235,240,255,0.55)', 11, 'center', 500);
    }
    ctx.fillStyle = '#FF9F43'; ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(X(m.x), Y(m.y), 6.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    text(ctx, m.name, X(m.x), Y(m.y) - 15, 'rgba(235,240,255,0.8)', 11.5, 'center');
  }
  // Tracks.
  for (const b of d.boats) {
    if (b.pts.length < 2) continue;
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = b.color; ctx.globalAlpha = 0.6; ctx.lineWidth = 1.8;
    ctx.beginPath();
    b.pts.forEach((p, k) => (k ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))));
    ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  // Boats: faint ghosts along the way, solid at the start, outlined at the end.
  const Lpx = Math.max(18, Math.min(30, L * s));
  for (const b of d.boats) {
    const n = b.pts.length;
    for (let k = 8; k < n - 1; k += 8) {
      const p = b.pts[k];
      drawBoat(ctx, X(p.x), Y(p.y), p.hdg, p.twa, b.disabled ? 0 : p.sheet, Lpx * 0.9, b.color, b.isPlayer, b.disabled, 0.18);
    }
    const e = b.pts[n - 1];
    drawBoat(ctx, X(e.x), Y(e.y), e.hdg, e.twa, b.disabled ? 0 : e.sheet, Lpx, b.color, b.isPlayer, b.disabled, 0.45);
    const p0 = b.pts[0];
    drawBoat(ctx, X(p0.x), Y(p0.y), p0.hdg, p0.twa, b.disabled ? 0 : p0.sheet, Lpx, b.color, b.isPlayer, b.disabled, 1);
  }
  // Labels at the start positions, nudged off the hull.
  for (const b of d.boats) {
    const p0 = b.pts[0];
    const side = n180(p0.hdg - 90) > 0 ? 1 : -1;
    const tone = b.isPlayer ? '#A9D2FF' : b.color === '#FB923C' ? '#FFCB96' : 'rgba(235,240,255,0.85)';
    text(ctx, b.label, X(p0.x) + side * (Lpx * 0.7 + 6), Y(p0.y) + Lpx * 0.55, tone, 12.5, side > 0 ? 'left' : 'right', 700);
    if (b.hail) text(ctx, `“${b.hail.text}”`, X(b.hail.x), Y(b.hail.y) - Lpx * 0.9 - 8, '#FFFFFF', 11.5, 'center', 600);
  }
  // Wind arrow.
  const ax = w - 34, ay = 26;
  const v = dir(d.twd + 180);
  ctx.strokeStyle = '#9CCBFF'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(ax - v.x * 16, ay + v.y * 16); ctx.lineTo(ax + v.x * 16, ay - v.y * 16); ctx.stroke();
  const hx = ax + v.x * 16, hy = ay - v.y * 16, a = Math.atan2(-v.y, v.x);
  ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx - 7 * Math.cos(a - 0.5), hy - 7 * Math.sin(a - 0.5)); ctx.moveTo(hx, hy); ctx.lineTo(hx - 7 * Math.cos(a + 0.5), hy - 7 * Math.sin(a + 0.5)); ctx.stroke();
  text(ctx, 'WIND', ax, ay + 26, 'rgba(235,240,255,0.6)', 10, 'center', 600);
}
