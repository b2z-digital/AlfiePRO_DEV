// Canvas renderer for the race: water with wind streaks and the puffs that are really out there,
// the course, wakes, boats with their sails set to the wind, hails, and teaching overlays
// (zone, laylines, time to the line, who has right of way). Draws one frame; owns no state.
import type { Race } from '@/sim/engine';
import type { Boat } from '@/sim/types';
import { vmgAngles, noGoAngle } from '@/sim/classes';
import { dir, n180 } from '@/sim/math';
import { keepClear } from '@/sim/referee';
import { hullGap } from '@/sim/physics';

export interface Camera { x: number; y: number; scale: number } // world metres at screen centre, px per metre

export interface ViewOptions {
  w: number; h: number; dpr: number;
  cam: Camera;
  showLaylines: boolean;
  showZones: boolean;
  /** Draw boats this many steps back in their history (instant replay). 0 = live. */
  back: number;
  /** Player's time to the line at full speed, pre-start (s), with the point on the line. */
  ttl: { s: number; to: { x: number; y: number } } | null;
  flashes: { x: number; y: number; t: number }[];
  /** Pre-start, until the gun. */
  preStart: boolean;
  /** Next mark for the player (or null). */
  next: { x: number; y: number; name: string; upwind: boolean } | null;
}

const FONT = "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', sans-serif";

function hash(i: number, j: number) {
  let h = (i * 374761393 + j * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function drawRace(ctx: CanvasRenderingContext2D, race: Race, v: ViewOptions) {
  const { w, h, dpr, cam } = v;
  const s = cam.scale;
  const L = race.course.L;
  const X = (x: number) => w / 2 + (x - cam.x) * s;
  const Y = (y: number) => h / 2 - (y - cam.y) * s;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // ── Water ──
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0A1830'); g.addColorStop(1, '#0E2644');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const t = race.t;
  const twd = race.wind.meanTwd(t);
  const tws = race.wind.meanTws(t);
  const wd = dir(twd + 180); // direction the wind blows towards

  // Puffs (darker, rippled water) and lulls (glassy patches), rolling down the course.
  for (const p of race.wind.puffs) {
    const life = Math.sin(Math.PI * Math.min(1, Math.max(0, p.age / p.life)));
    const a = Math.min(1, Math.abs(p.strength) * 2.2) * life;
    if (a < 0.02) continue;
    const px = X(p.x), py = Y(p.y), r = p.r * s;
    if (px < -r * 2 || px > w + r * 2 || py < -r * 2 || py > h + r * 2) continue;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate((twd * Math.PI) / 180);
    ctx.scale(1, 1.5);
    const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    if (p.strength > 0) { rg.addColorStop(0, `rgba(2,8,20,${0.55 * a})`); rg.addColorStop(1, 'rgba(2,8,20,0)'); }
    else { rg.addColorStop(0, `rgba(170,205,255,${0.07 * a})`); rg.addColorStop(1, 'rgba(170,205,255,0)'); }
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Wind streaks drifting downwind.
  const G = Math.max(2.4 * L, 46 / s);
  const drift = (t * Math.max(0.25, tws * 0.12)) % G;
  const x0 = cam.x - w / 2 / s - G, x1 = cam.x + w / 2 / s + G;
  const y0 = cam.y - h / 2 / s - G, y1 = cam.y + h / 2 / s + G;
  const seg = Math.min(14, 0.55 * L * s);
  ctx.strokeStyle = 'rgba(180,205,255,0.10)';
  ctx.lineWidth = 1.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = Math.floor(x0 / G); i <= Math.ceil(x1 / G); i++) {
    for (let j = Math.floor(y0 / G); j <= Math.ceil(y1 / G); j++) {
      const hx = hash(i, j), hy = hash(j + 7, i - 3);
      const bx = i * G + hx * G + wd.x * drift, by = j * G + hy * G + wd.y * drift;
      const sx = X(bx), sy = Y(by);
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + wd.x * seg, sy - wd.y * seg);
    }
  }
  ctx.stroke();

  // ── The bank: everything outside the pond is land ──
  const c = race.course;
  {
    const B = c.bounds;
    const corner = (a: number, x: number) => ({ x: c.origin.x + c.up.x * a + c.right.x * x, y: c.origin.y + c.up.y * a + c.right.y * x });
    const q = [corner(B.alongMin, -B.across), corner(B.alongMax, -B.across), corner(B.alongMax, B.across), corner(B.alongMin, B.across)];
    ctx.save();
    ctx.beginPath();
    ctx.rect(-10, -10, w + 20, h + 20);
    ctx.moveTo(X(q[0].x), Y(q[0].y));
    for (let k = 1; k < 4; k++) ctx.lineTo(X(q[k].x), Y(q[k].y));
    ctx.closePath();
    ctx.fillStyle = '#0A140F';
    ctx.fill('evenodd');
    ctx.beginPath();
    ctx.moveTo(X(q[0].x), Y(q[0].y));
    for (let k = 1; k < 4; k++) ctx.lineTo(X(q[k].x), Y(q[k].y));
    ctx.closePath();
    ctx.strokeStyle = 'rgba(150,190,140,0.28)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  // ── Course ──
  const P = c.start.pin, S = c.start.stbd;
  // Line extensions, then the line.
  ctx.setLineDash([2, 6]);
  ctx.strokeStyle = 'rgba(255,179,64,0.22)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(X(P.x), Y(P.y)); ctx.lineTo(X(P.x - (S.x - P.x) * 0.35), Y(P.y - (S.y - P.y) * 0.35));
  ctx.moveTo(X(S.x), Y(S.y)); ctx.lineTo(X(S.x + (S.x - P.x) * 0.35), Y(S.y + (S.y - P.y) * 0.35));
  ctx.stroke();
  ctx.setLineDash([7, 5]);
  ctx.strokeStyle = '#FFB340';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(X(P.x), Y(P.y)); ctx.lineTo(X(S.x), Y(S.y)); ctx.stroke();
  // Gate line.
  const gp = c.byId.GP?.p, gs = c.byId.GS?.p;
  if (gp && gs) {
    ctx.setLineDash([3, 5]);
    ctx.strokeStyle = 'rgba(255,179,64,0.32)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(X(gp.x), Y(gp.y)); ctx.lineTo(X(gs.x), Y(gs.y)); ctx.stroke();
  }
  ctx.setLineDash([]);

  // Next mark: route hint, laylines, zone.
  const player = race.player;
  if (v.next && player) {
    const nx = X(v.next.x), ny = Y(v.next.y);
    if (v.showLaylines && v.next.upwind) {
      const up = vmgAngles(player.cls, player.tws || tws).up + 1.5;
      const len = 18 * L * s;
      const sb = dir(twd - up + 180), pt = dir(twd + up + 180);
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = 'rgba(77,163,255,0.38)';
      ctx.beginPath(); ctx.moveTo(nx, ny); ctx.lineTo(nx + sb.x * len, ny - sb.y * len); ctx.stroke();
      ctx.strokeStyle = 'rgba(77,163,255,0.22)';
      ctx.beginPath(); ctx.moveTo(nx, ny); ctx.lineTo(nx + pt.x * len, ny - pt.y * len); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (v.showZones) {
      ctx.setLineDash([5, 5]);
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.strokeStyle = 'rgba(255,255,255,0.36)';
      ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(nx, ny, 4 * L * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.setLineDash([]);
    }
    // Faint route from the player to the mark, with the distance.
    const d = Math.hypot(v.next.x - player.x, v.next.y - player.y);
    if (d > 6 * L) {
      ctx.setLineDash([2, 6]);
      ctx.strokeStyle = 'rgba(235,240,255,0.2)';
      ctx.lineWidth = 1.2;
      const px = X(player.x), py = Y(player.y);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(nx, ny); ctx.stroke();
      ctx.setLineDash([]);
      const k = Math.min(0.5, (14 * L) / d);
      const lx = px + (nx - px) * k, ly = py + (ny - py) * k;
      label(ctx, `To ${v.next.name} · ${Math.round(d / L)} lengths`, lx + 8, ly, 'rgba(235,240,255,0.6)', 12, 'left');
    }
  }

  // Marks.
  for (const m of c.marks) {
    const mx = X(m.p.x), my = Y(m.p.y);
    const r = Math.max(5.5, m.r * s);
    ctx.fillStyle = '#FF9F43';
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    const name = m.kind === 'pin' ? 'Pin' : m.kind === 'start-stbd' ? (v.preStart ? 'Start mark' : 'S') : m.label === '1' ? 'Mark 1' : m.label;
    label(ctx, name, mx, my - r - 7, 'rgba(235,240,255,0.78)', 12, 'center', 600);
  }

  // Time to the line (pre-start).
  if (v.ttl && player) {
    const px = X(player.x), py = Y(player.y);
    const tx = X(v.ttl.to.x), ty = Y(v.ttl.to.y);
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#4DA3FF';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#4DA3FF';
    ctx.beginPath(); ctx.arc(tx, ty, 3.5, 0, Math.PI * 2); ctx.fill();
    label(ctx, `${v.ttl.s.toFixed(1)} s to the line`, tx, ty - 12, '#9CCBFF', 12.5, 'center', 600);
  }

  // ── Wakes ──
  const back = Math.max(0, v.back | 0);
  race.boats.forEach((b, i) => {
    const H = race.hist[i];
    const n = H.x.length - back;
    if (n < 4) return;
    ctx.strokeStyle = b.color;
    ctx.lineWidth = b.isPlayer ? 2.2 : 2;
    ctx.lineCap = 'round';
    const from = Math.max(0, n - 70);
    for (let k = from + 6; k < n; k += 6) {
      ctx.globalAlpha = 0.38 * ((k - from) / (n - from));
      ctx.beginPath();
      ctx.moveTo(X(H.x[k - 6]), Y(H.y[k - 6]));
      ctx.lineTo(X(H.x[k]), Y(H.y[k]));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });

  // ── Boats ──
  const Lpx = Math.max(18, L * s);
  const order = race.boats.map((_, i) => i).sort((a, bb) => (race.boats[a].isPlayer ? 1 : 0) - (race.boats[bb].isPlayer ? 1 : 0));
  for (const i of order) {
    const b = race.boats[i];
    const H = race.hist[i];
    const k = H.x.length - 1 - back;
    const bx = back > 0 && k >= 0 ? H.x[k] : b.x, by = back > 0 && k >= 0 ? H.y[k] : b.y;
    const bh = back > 0 && k >= 0 ? H.hdg[k] : b.hdg;
    const twa = n180(b.twd - bh);
    const sx = X(bx), sy = Y(by);
    if (sx < -60 || sx > w + 60 || sy < -60 || sy > h + 60) continue;
    if (b.isPlayer) {
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = '#4DA3FF';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(sx, sy, Lpx * 0.95 + 4, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    drawBoat(ctx, sx, sy, bh, twa, b.sheet, Lpx, b.color, b.isPlayer, Math.abs(twa) < noGoAngle(b.tws || tws) + 2, b.finished ? 0.45 : 1);
    // Label.
    if (b.isPlayer) label(ctx, 'You', sx + Lpx * 0.75 + 8, sy - Lpx * 0.4, '#FFFFFF', 12.5, 'left', 700);
    else label(ctx, b.sail, sx, sy + Lpx * 0.62 + 12, 'rgba(235,240,255,0.78)', 11.5, 'center', 600);
    // Status badges.
    if (b.ocs && !b.started) badge(ctx, 'OCS', sx + Lpx * 0.6, sy + Lpx * 0.25, '#F87171');
    else if (b.penalty.owed > 0) badge(ctx, b.penalty.active ? 'Turning' : 'Penalty', sx + Lpx * 0.6, sy + Lpx * 0.25, '#FF9F43');
    // Hail bubble.
    if (b.hail && race.t - b.hail.t < 2.6 && back === 0) bubble(ctx, b.hail.text, sx, sy - Lpx * 0.8 - 10, /protest/i.test(b.hail.text));
  }

  // ── Right-of-way chips for the player ──
  if (player && back === 0 && !player.finished) {
    let best: Boat | null = null, bestG = 4 * L;
    for (const o of race.boats) {
      if (o === player || o.finished || o.retired) continue;
      const gp = hullGap(player, o);
      if (gp > bestG) continue;
      // Only if they are converging.
      const rv = { x: o.x - player.x, y: o.y - player.y };
      const vp = dir(player.hdg), vo = dir(o.hdg);
      const rel = { x: vo.x * o.spd - vp.x * player.spd, y: vo.y * o.spd - vp.y * player.spd };
      if (rv.x * rel.x + rv.y * rel.y > 0 && gp > 1.2 * L) continue;
      best = o; bestG = gp;
    }
    if (best) {
      const kc = keepClear(player, best, race.t);
      if (kc.keeper !== -1) {
        const ox = X(best.x), oy = Y(best.y), px = X(player.x), py = Y(player.y);
        if (kc.keeper === 0) {
          chip(ctx, `${best.sail} · right of way`, ox - 70, oy + Lpx * 0.6 + 26, 'blue');
          chip(ctx, `Keep clear · Rule ${kc.rule}`, px + Lpx * 0.7 + 10, py + 6, 'orange');
        } else {
          chip(ctx, `${best.sail} keeps clear · Rule ${kc.rule}`, ox - 80, oy + Lpx * 0.6 + 26, 'orange');
          chip(ctx, 'Your right of way', px + Lpx * 0.7 + 10, py + 6, 'blue');
        }
      }
    }
  }

  // Incident flashes.
  for (const f of v.flashes) {
    const age = race.t - f.t;
    if (age < 0 || age > 2.5) continue;
    const r = 12 + age * 26;
    ctx.strokeStyle = `rgba(255,159,67,${0.8 * (1 - age / 2.5)})`;
    ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.arc(X(f.x), Y(f.y), r, 0, Math.PI * 2); ctx.stroke();
  }
}

/** One boat: hull, sail set to the wind and sheet, mast. Lpx = hull length on screen. */
export function drawBoat(ctx: CanvasRenderingContext2D, sx: number, sy: number, hdg: number, twa: number, sheet: number, Lpx: number, color: string, isPlayer: boolean, luffing: boolean, alpha = 1) {
  const k = Lpx / 24;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(sx, sy);
  ctx.rotate((hdg * Math.PI) / 180);
  ctx.save();
  ctx.scale(k * 0.78, k);
  ctx.beginPath();
  ctx.moveTo(0, -13);
  ctx.bezierCurveTo(4.2, -7.5, 5, 1.5, 3.8, 11);
  ctx.lineTo(-3.8, 11);
  ctx.bezierCurveTo(-5, 1.5, -4.2, -7.5, 0, -13);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = (isPlayer ? 1.3 : 1) / k;
  ctx.strokeStyle = isPlayer ? '#E8F2FF' : '#0A1830';
  ctx.stroke();
  ctx.restore();
  // Sail: boom angle from the sheet, unless the sail is luffing in line with the wind.
  const a = Math.abs(twa);
  const maxBoom = 8 + (1 - Math.min(1, Math.max(0, sheet))) * 82;
  const natural = Math.min(88, Math.max(0, a - 4));
  const boom = Math.min(maxBoom, natural);
  const flapping = luffing || maxBoom > natural + 6;
  const side = twa >= 0 ? -1 : 1; // starboard tack: sail to port
  const mx = 0, my = -3.9 * k;
  const len = 11.5 * k;
  const r = (boom * Math.PI) / 180;
  const ex = mx + side * Math.sin(r) * len, ey = my + Math.cos(r) * len;
  const midx = (mx + ex) / 2, midy = (my + ey) / 2;
  const nx = (ey - my) / len, ny = -(ex - mx) / len; // perpendicular
  const belly = flapping ? 0 : 0.17 * len * side; // bellies out to leeward
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = Math.max(1.4, 1.8 * k * 0.55);
  ctx.lineCap = 'round';
  if (flapping) ctx.setLineDash([2, 1.6]);
  ctx.beginPath();
  ctx.moveTo(mx, my);
  ctx.quadraticCurveTo(midx + nx * belly, midy + ny * belly, ex, ey);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, size: number, align: CanvasTextAlign, weight = 500) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(6,11,22,0.55)';
  ctx.fillText(text, x + 0.8, y + 0.8);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function chip(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, tone: 'blue' | 'orange') {
  ctx.font = `600 11.5px ${FONT}`;
  const w = ctx.measureText(text).width + 22, h = 24;
  roundRect(ctx, x, y - h / 2, w, h, 12);
  ctx.fillStyle = tone === 'blue' ? 'rgba(42,147,255,0.18)' : 'rgba(255,159,67,0.18)';
  ctx.fill();
  ctx.strokeStyle = tone === 'blue' ? 'rgba(77,163,255,0.6)' : 'rgba(255,159,67,0.6)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = tone === 'blue' ? '#A9D2FF' : '#FFCB96';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + 11, y + 0.5);
}

function badge(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
  ctx.font = `700 10px ${FONT}`;
  const w = ctx.measureText(text).width + 10, h = 16;
  roundRect(ctx, x, y - h / 2, w, h, 8);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.fillStyle = '#0A1220';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + 5, y + 0.5);
}

function bubble(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, protest: boolean) {
  ctx.font = `600 13px ${FONT}`;
  const w = ctx.measureText(text).width + 20, h = 26;
  roundRect(ctx, x - w / 2, y - h, w, h, 9);
  ctx.fillStyle = protest ? 'rgba(127,29,29,0.92)' : 'rgba(7,13,27,0.9)';
  ctx.fill();
  ctx.strokeStyle = protest ? 'rgba(248,113,113,0.7)' : 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 5, y); ctx.lineTo(x, y + 6); ctx.lineTo(x + 5, y);
  ctx.fillStyle = protest ? 'rgba(127,29,29,0.92)' : 'rgba(7,13,27,0.9)';
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y - h / 2 + 0.5);
}

/** Debrief map: the course and full tracks from the 5 Hz recording, boats at frame f. */
export function drawReplayMap(ctx: CanvasRenderingContext2D, race: Race, w: number, h: number, dpr: number, frame: number, focus: string[]) {
  const c = race.course;
  // Fit the marks and every track into the canvas, with a margin.
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const grow = (x: number, y: number) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
  for (const m of c.marks) grow(m.p.x, m.p.y);
  for (let k = 0; k < race.track.length; k += 3) { const d = race.track[k].d; for (let i = 0; i < race.boats.length; i++) grow(d[i * 5], d[i * 5 + 1]); }
  const pad = 2 * c.L;
  const s = Math.min(w / (x1 - x0 + 2 * pad), h / (y1 - y0 + 2 * pad));
  const cam = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  const X = (x: number) => w / 2 + (x - cam.x) * s;
  const Y = (y: number) => h / 2 - (y - cam.y) * s;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#0B1A31';
  ctx.fillRect(0, 0, w, h);
  // Line and marks.
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = '#FFB340';
  ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(X(c.start.pin.x), Y(c.start.pin.y)); ctx.lineTo(X(c.start.stbd.x), Y(c.start.stbd.y)); ctx.stroke();
  ctx.setLineDash([]);
  for (const m of c.marks) {
    ctx.fillStyle = '#FF9F43';
    ctx.beginPath(); ctx.arc(X(m.p.x), Y(m.p.y), 4.5, 0, Math.PI * 2); ctx.fill();
  }
  const T = race.track;
  if (!T.length) return;
  const n = race.boats.length;
  const f = Math.max(0, Math.min(T.length - 1, frame | 0));
  // Tracks up to the frame: focused boats bright, the rest faint.
  race.boats.forEach((b, i) => {
    const hot = focus.includes(b.id);
    ctx.strokeStyle = b.color;
    ctx.globalAlpha = hot ? 0.9 : 0.16;
    ctx.lineWidth = hot ? (b.isPlayer ? 2.4 : 2) : 1.2;
    ctx.beginPath();
    for (let k = 0; k <= f; k += 2) {
      const d = T[k].d;
      const x = X(d[i * 5]), y = Y(d[i * 5 + 1]);
      if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
  // Boats at the frame.
  const d = T[f].d;
  for (let i = 0; i < n; i++) {
    const b = race.boats[i];
    const x = X(d[i * 5]), y = Y(d[i * 5 + 1]), hd = d[i * 5 + 2];
    drawBoat(ctx, x, y, hd, n180(T[f].twd - hd), 0.7, 14, b.color, b.isPlayer, false, focus.includes(b.id) ? 1 : 0.6);
  }
}
