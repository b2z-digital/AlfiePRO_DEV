// Canvas renderer for the race: water with wind streaks and the puffs that are really out there,
// the course, wakes, boats with their sails set to the wind, hails, and teaching overlays
// (zone, laylines, time to the line, who has right of way). Draws one frame; owns no state.
import type { Race } from '@/sim/engine';
import type { Boat } from '@/sim/types';
import type { WorldOverlay } from '@/sim/scene';
import { vmgAngles, noGoAngle } from '@/sim/classes';
import { dir, n180 } from '@/sim/math';
import { keepClear } from '@/sim/referee';
import { hullGap } from '@/sim/physics';
import { drawVenueLand, waterPath } from './venueMap';
import { drawCredit } from './bankVenue';
import { ALFIE, YOU_INTRO, alfieCallout } from './bank';
import { mapAt, tex } from './bankWater';

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
  /** Teaching marks for a drill or lesson (target rings, lines). */
  overlays?: WorldOverlay[];
  /** Label other boats by name ("Orange") as well as sail number, as in a lesson. */
  names?: boolean;
  /** A ghost to race: another member's boat from their own race, drawn faint (no one hits her). */
  ghost?: { b: Boat; label: string } | null;
  /** How much detail the water gets: 2 full, 1 less, 0 the least (for slower devices). */
  detail?: number;
}

const TONE = { blue: ['rgba(77,163,255,0.85)', 'rgba(77,163,255,0.10)', '#9CCBFF'], orange: ['rgba(255,159,67,0.85)', 'rgba(255,159,67,0.10)', '#FFCB96'], green: ['rgba(52,211,153,0.85)', 'rgba(52,211,153,0.10)', '#A7F3D0'] } as const;

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
  g.addColorStop(0, '#11294A'); g.addColorStop(1, '#173764');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const t = race.t;
  const twd = race.wind.meanTwd(t);
  const tws = race.wind.meanTws(t);
  const wd = dir(twd + 180); // direction the wind blows towards

  // The wind's ripples over all the water (the same texture as the bank view, seen from above).
  const flat = { P: (x: number, y: number) => ({ x: X(x), y: Y(y), z: 1 }) };
  const acrossW = { x: wd.y, y: -wd.x };
  const tm = Math.max(0.02, Math.min(0.25, 0.8 / s));
  const kn = tws / 0.514444;
  const detail = v.detail ?? 2;
  const wind = detail >= 1 ? tex(ctx, 'wind') : null;
  if (wind) {
    mapAt(wind, flat, { x: cam.x, y: cam.y }, acrossW, wd, tm, (t * (0.16 + 0.025 * kn)) / tm);
    ctx.globalAlpha = 0.25 + 0.45 * Math.min(1, kn / 13);
    ctx.fillStyle = wind; ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }
  // Puffs: darker, rougher water, half as long again along the wind as across it, as the boats feel
  // them. Lulls: smoother, paler patches.
  const gust = detail >= 2 ? tex(ctx, 'gust') : null;
  for (const p of race.wind.puffs) {
    const life = Math.sin(Math.PI * Math.min(1, Math.max(0, p.age / p.life)));
    const a = Math.min(1, Math.abs(p.strength) * 3.2 + 0.15) * life;
    if (a < 0.03) continue;
    const px = X(p.x), py = Y(p.y), r = p.r * s;
    if (px < -r * 2 || px > w + r * 2 || py < -r * 2 || py > h + r * 2) continue;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate((twd * Math.PI) / 180);
    ctx.scale(1, 1.5);
    const rg = ctx.createRadialGradient(0, 0, r * 0.15, 0, 0, r * 1.08);
    if (p.strength > 0) { rg.addColorStop(0, `rgba(2,9,22,${0.78 * a})`); rg.addColorStop(0.7, `rgba(2,9,22,${0.6 * a})`); rg.addColorStop(1, 'rgba(2,9,22,0)'); }
    else { rg.addColorStop(0, `rgba(190,215,255,${0.13 * a})`); rg.addColorStop(1, 'rgba(190,215,255,0)'); }
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(0, 0, r * 1.08, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (p.strength > 0 && gust && r > 6) {
      mapAt(gust, flat, { x: p.x, y: p.y }, acrossW, wd, tm, (t * (0.5 + 0.05 * kn)) / tm);
      ctx.fillStyle = gust;
      for (const [k, al] of [[0.95, 0.35], [0.7, 0.4]] as const) {
        ctx.globalAlpha = al * a;
        ctx.beginPath(); ctx.ellipse(px, py, r * k, r * 1.5 * k, (twd * Math.PI) / 180, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  // Wind streaks drifting downwind. Laid out along and across the wind; each one fades in, drifts a
  // cell's length and fades out, so nothing ever jumps back.
  const G = Math.max(2.4 * L, 46 / s);
  const across = { x: wd.y, y: -wd.x };
  const seg = Math.min(14, 0.55 * L * s);
  const rv = Math.hypot(w, h) / 2 / s + G;
  const ca = cam.x * wd.x + cam.y * wd.y, cc = cam.x * across.x + cam.y * across.y;
  const flow = t * Math.max(0.25, tws * 0.12) / G;
  ctx.lineWidth = 1.2;
  ctx.lineCap = 'round';
  for (const pass of [0, 1]) {
    ctx.strokeStyle = pass ? 'rgba(180,205,255,0.09)' : 'rgba(180,205,255,0.04)';
    ctx.beginPath();
    for (let i = Math.floor((ca - rv) / G); i <= Math.ceil((ca + rv) / G); i++) {
      for (let j = Math.floor((cc - rv) / G); j <= Math.ceil((cc + rv) / G); j++) {
        const ph = (flow + hash(i, j)) % 1;
        const fade = Math.sin(Math.PI * ph);
        if ((fade > 0.55 ? 1 : 0) !== pass || fade < 0.15) continue;
        const u = (i + ph) * G, v = (j + hash(j + 7, i - 3)) * G;
        const sx = X(wd.x * u + across.x * v), sy = Y(wd.y * u + across.y * v);
        if (sx < -20 || sx > w + 20 || sy < -20 || sy > h + 20) continue;
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + wd.x * seg, sy - wd.y * seg);
      }
    }
    ctx.stroke();
  }

  // Waves: crests across the wind, rolling downwind (the same waves the boats feel).
  if (race.sea) {
    const sea = race.sea, wv = dir(sea.from + 180), crossV = { x: wv.y, y: -wv.x };
    const rough = sea.kind === 'rough';
    const cs = cam.x * wv.x + cam.y * wv.y, cw = cam.x * crossV.x + cam.y * crossV.y;
    const n0 = Math.floor((cs - rv) / sea.length), n1 = Math.ceil((cs + rv) / sea.length);
    if ((n1 - n0) < 260) {
      ctx.strokeStyle = rough ? 'rgba(200,225,255,0.13)' : 'rgba(200,225,255,0.08)';
      ctx.lineWidth = rough ? 1.6 : 1.1;
      ctx.beginPath();
      for (let n = n0; n <= n1; n++) {
        const sAlong = sea.length * (n + 0.25 + t / sea.period);
        for (let k = -6; k <= 6; k++) {
          const off = (k + hash(n, k) * 0.6) * 3.2 * sea.length;
          const cx0 = wv.x * sAlong + crossV.x * (cw + off), cy0 = wv.y * sAlong + crossV.y * (cw + off);
          const half = sea.length * (0.8 + hash(k, n) * 1.2);
          const ax = X(cx0 - crossV.x * half), ay = Y(cy0 - crossV.y * half), bx = X(cx0 + crossV.x * half), by = Y(cy0 + crossV.y * half);
          if (Math.max(ax, bx) < -10 || Math.min(ax, bx) > w + 10 || Math.max(ay, by) < -10 || Math.min(ay, by) > h + 10) continue;
          ctx.moveTo(ax, ay); ctx.quadraticCurveTo((ax + bx) / 2 + wd.x * 2, (ay + by) / 2 - wd.y * 2, bx, by);
        }
      }
      ctx.stroke();
      if (rough) {
        // Whitecaps on some crests.
        ctx.fillStyle = 'rgba(235,245,255,0.35)';
        for (let n = n0; n <= n1; n++) for (let k = -6; k <= 6; k++) {
          if (hash(n * 3 + k, k - n) > 0.12) continue;
          const sAlong = sea.length * (n + 0.25 + t / sea.period);
          const off = (k + hash(n, k) * 0.6) * 3.2 * sea.length;
          const qx = X(wv.x * sAlong + crossV.x * (cw + off)), qy = Y(wv.y * sAlong + crossV.y * (cw + off));
          if (qx < 0 || qx > w || qy < 0 || qy > h) continue;
          ctx.beginPath(); ctx.ellipse(qx, qy, 4, 1.6, -Math.atan2(-crossV.y, crossV.x), 0, Math.PI * 2); ctx.fill();
        }
      }
    }
  }

  // ── The bank: everything outside the pond is land (at a venue, outside the real shoreline) ──
  const c = race.course;
  if (race.venue) {
    const T = (x: number, y: number): [number, number] => [X(x), Y(y)];
    drawVenueLand(ctx, race.venue, T, s, w, h, true);
    // The course area: as far as the boats can go out on the open lake.
    const B = c.bounds;
    const corner = (a: number, x: number) => ({ x: c.origin.x + c.up.x * a + c.right.x * x, y: c.origin.y + c.up.y * a + c.right.y * x });
    const q = [corner(B.alongMin, -B.across), corner(B.alongMax, -B.across), corner(B.alongMax, B.across), corner(B.alongMin, B.across)];
    ctx.save();
    waterPath(ctx, race.venue, T); ctx.clip('evenodd');
    ctx.setLineDash([3, 7]);
    ctx.strokeStyle = 'rgba(235,240,255,0.16)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(X(q[0].x), Y(q[0].y)); for (let k = 1; k < 4; k++) ctx.lineTo(X(q[k].x), Y(q[k].y)); ctx.closePath(); ctx.stroke();
    ctx.restore();
  } else {
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

  // Teaching overlays.
  for (const ov of v.overlays ?? []) {
    const [stroke, fill, text] = TONE[ov.tone];
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = stroke;
    if (ov.kind === 'ring') {
      ctx.fillStyle = fill;
      ctx.beginPath(); ctx.arc(X(ov.x), Y(ov.y), Math.max(6, ov.r * s), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (ov.label) label(ctx, ov.label, X(ov.x), Y(ov.y) - Math.max(6, ov.r * s) - 9, text, 12, 'center', 600);
    } else {
      ctx.beginPath(); ctx.moveTo(X(ov.x1), Y(ov.y1)); ctx.lineTo(X(ov.x2), Y(ov.y2)); ctx.stroke();
      if (ov.label) label(ctx, ov.label, (X(ov.x1) + X(ov.x2)) / 2, (Y(ov.y1) + Y(ov.y2)) / 2 - 10, text, 12, 'center', 600);
    }
    ctx.setLineDash([]);
  }

  // ── Wakes: a faint track in each boat's colour, and the water she churns up ──
  const back = Math.max(0, v.back | 0);
  const KELVIN = Math.tan((19.47 * Math.PI) / 180);
  race.boats.forEach((b, i) => {
    const H = race.hist[i];
    const n = H.x.length - back;
    if (n < 4) return;
    // Her track, for where she's been.
    ctx.strokeStyle = b.color;
    ctx.lineWidth = b.isPlayer ? 1.6 : 1.3;
    ctx.lineCap = 'round';
    const from = Math.max(0, n - 70);
    for (let k = from + 6; k < n; k += 6) {
      ctx.globalAlpha = 0.2 * ((k - from) / (n - from));
      ctx.beginPath();
      ctx.moveTo(X(H.x[k - 6]), Y(H.y[k - 6]));
      ctx.lineTo(X(H.x[k]), Y(H.y[k]));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // White water: foam just behind her, a widening lane and the V of her wash, bigger the faster she goes.
    const last = n - 1, fast = Math.min(1.3, H.spd[last] / Math.max(0.05, b.cls.hullSpeed));
    if (fast < 0.1 || L * s < 6) return;
    const T = 1.6 + 3.6 * Math.min(1, fast), steps = Math.min(last, Math.round(T / 0.05));
    const pts: { x: number; y: number; nx: number; ny: number; age: number; d: number }[] = [];
    let dd = 0;
    for (let k = last; k >= last - steps; k -= 2) {
      const f = dir(H.hdg[k]);
      const q = { x: H.x[k] - f.x * b.cls.loa * 0.47, y: H.y[k] - f.y * b.cls.loa * 0.47 };
      if (pts.length) dd += Math.hypot(q.x - pts[pts.length - 1].x, q.y - pts[pts.length - 1].y);
      pts.push({ ...q, nx: f.y, ny: -f.x, age: (last - k) * 0.05, d: dd });
    }
    const beam = b.cls.beam;
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k], c = pts[k + 1];
      const wa = beam * (0.35 + 1.5 * (a.age / T)), wc = beam * (0.35 + 1.5 * (c.age / T));
      ctx.fillStyle = `rgba(222,236,250,${(0.22 * Math.pow(1 - a.age / T, 1.4) * Math.min(1, fast)).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(X(a.x + a.nx * wa), Y(a.y + a.ny * wa)); ctx.lineTo(X(c.x + c.nx * wc), Y(c.y + c.ny * wc));
      ctx.lineTo(X(c.x - c.nx * wc), Y(c.y - c.ny * wc)); ctx.lineTo(X(a.x - a.nx * wa), Y(a.y - a.ny * wa));
      ctx.closePath(); ctx.fill();
    }
    if (fast > 0.25) {
      const reach = b.cls.loa * (1.2 + 2.6 * fast);
      for (const side of [1, -1]) {
        ctx.beginPath();
        let started = false;
        for (const q of pts) {
          if (q.d > reach) break;
          const off = beam * 0.45 + q.d * KELVIN;
          const x = X(q.x + q.nx * off * side), y = Y(q.y + q.ny * off * side);
          if (started) ctx.lineTo(x, y); else { ctx.moveTo(x, y); started = true; }
        }
        const g = ctx.createRadialGradient(X(pts[0].x), Y(pts[0].y), 0, X(pts[0].x), Y(pts[0].y), reach * s);
        g.addColorStop(0, 'rgba(225,238,252,0.5)'); g.addColorStop(1, 'rgba(225,238,252,0)');
        ctx.strokeStyle = g; ctx.lineWidth = 1.2; ctx.stroke();
      }
    }
  });

  // ── Boats ──
  const Lpx = Math.max(18, L * s);
  // The ghost first, under everyone.
  if (v.ghost && !back) {
    const g = v.ghost.b, gx = X(g.x), gy = Y(g.y);
    if (gx > -60 && gx < w + 60 && gy > -60 && gy < h + 60) {
      drawBoat(ctx, gx, gy, g.hdg, n180(g.twd - g.hdg), g.sheet, Lpx, '#E8F1FF', false, false, 0.38);
      label(ctx, v.ghost.label, gx + Lpx * 0.75 + 8, gy - Lpx * 0.4, 'rgba(232,241,255,0.7)', 11.5, 'left', 600);
    }
  }
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
    const intro = b.isPlayer && back === 0 && race.t < YOU_INTRO;
    if (b.isPlayer) {
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = '#4DA3FF';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(sx, sy, Lpx * 0.95 + 4, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      // When the race opens: rings spreading from your boat, in Alfie's colours.
      if (intro) {
        for (const ph of [0, 0.5]) {
          const u = (race.t * 0.9 + ph) % 1;
          ctx.strokeStyle = ALFIE[Math.floor((race.t * 0.9 + ph) % ALFIE.length)];
          ctx.globalAlpha = (1 - u) * 0.9 * Math.min(1, (YOU_INTRO - race.t) / 1.5);
          ctx.lineWidth = 2.4;
          ctx.beginPath(); ctx.arc(sx, sy, Lpx * (1 + 2.2 * u) + 4, 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
    }
    drawBoat(ctx, sx, sy, bh, twa, b.disabled ? 0 : b.sheet, Lpx, b.color, b.isPlayer, b.disabled || Math.abs(twa) < noGoAngle(b.tws || tws) + 2, b.finished ? 0.45 : 1);
    // Label.
    if (intro) {
      const pulse = 0.5 + 0.5 * Math.sin(race.t * 7);
      ctx.globalAlpha = Math.min(1, (YOU_INTRO - race.t) / 1.2);
      alfieCallout(ctx, 'This is you', sx, sy - Lpx * 0.9 - 6 - 3 * pulse, pulse);
      ctx.globalAlpha = 1;
    } else if (b.isPlayer) label(ctx, 'You', sx + Lpx * 0.75 + 8, sy - Lpx * 0.4, '#FFFFFF', 12.5, 'left', 700);
    else label(ctx, v.names && b.name && b.name !== b.sail ? `${b.name} · ${b.sail}` : b.sail, sx, sy + Lpx * 0.62 + 12, 'rgba(235,240,255,0.78)', 11.5, 'center', 600);
    // Status badges.
    if (b.disabled) badge(ctx, 'Out of control', sx + Lpx * 0.6, sy + Lpx * 0.25, '#94A3B8');
    else if (b.ocs && !b.started) badge(ctx, 'OCS', sx + Lpx * 0.6, sy + Lpx * 0.25, '#F87171');
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
  if (race.venue) drawCredit(ctx, `Map data ${race.venue.def.credit}`, w, h);
}

/** One boat from above: hull, mainsail and jib set to the wind and the sheet. Lpx = hull length on
 *  screen. Both sails come off the one sheet, as on a radio yacht; running deep, the jib swings out
 *  on the other side (goose-winged). */
export function drawBoat(ctx: CanvasRenderingContext2D, sx: number, sy: number, hdg: number, twa: number, sheet: number, Lpx: number, color: string, isPlayer: boolean, luffing: boolean, alpha = 1) {
  const k = Lpx / 24;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(sx, sy);
  ctx.rotate((hdg * Math.PI) / 180);
  // Hull, with a soft shadow on the water.
  ctx.save();
  ctx.scale(k * 0.78, k);
  ctx.beginPath();
  ctx.moveTo(0, -13);
  ctx.bezierCurveTo(4.2, -7.5, 5, 1.5, 3.8, 11);
  ctx.lineTo(-3.8, 11);
  ctx.bezierCurveTo(-5, 1.5, -4.2, -7.5, 0, -13);
  ctx.closePath();
  ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 4; ctx.shadowOffsetX = 1.5; ctx.shadowOffsetY = 1.5;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = (isPlayer ? 1.3 : 1) / k;
  ctx.strokeStyle = isPlayer ? '#E8F2FF' : '#0A1830';
  ctx.stroke();
  // Deck highlight.
  ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(0, 9); ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 0.9 / k; ctx.stroke();
  ctx.restore();
  // Sails: the boom angle comes from the sheet, unless the sail is luffing in line with the wind.
  const a = Math.abs(twa);
  const ease = 1 - Math.min(1, Math.max(0, sheet));
  const maxBoom = 8 + ease * 82;
  const natural = Math.min(88, Math.max(0, a - 4));
  const boom = Math.min(maxBoom, natural);
  const flapping = luffing || maxBoom > natural + 6;
  const side = twa >= 0 ? -1 : 1; // starboard tack: sails to port
  const sail = (mx: number, my: number, len: number, ang: number, sd: number, flap: boolean, width: number) => {
    const r = (ang * Math.PI) / 180;
    const ex = mx + sd * Math.sin(r) * len, ey = my + Math.cos(r) * len;
    const midx = (mx + ex) / 2, midy = (my + ey) / 2;
    const nx = (ey - my) / len, ny = -(ex - mx) / len;
    const belly = flap ? 0 : 0.17 * len * sd;
    ctx.lineWidth = width;
    if (flap) ctx.setLineDash([2, 1.6]);
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.quadraticCurveTo(midx + nx * belly, midy + ny * belly, ex, ey);
    ctx.stroke();
    ctx.setLineDash([]);
  };
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineCap = 'round';
  // Jib: forward of the mast. Running deep with the sheet eased it goose-wings to the other side.
  const goose = a > 156 && ease > 0.6 && !luffing;
  const jibAng = goose ? Math.min(85, maxBoom) : Math.min(maxBoom * 1.08 + 2, natural + 2);
  ctx.globalAlpha = alpha * 0.95;
  sail(0, -11.6 * k, 7 * k, jibAng, goose ? -side : side, flapping && !goose, Math.max(1.2, 1.5 * k * 0.55));
  ctx.globalAlpha = alpha;
  // Mainsail.
  sail(0, -3.9 * k, 11.5 * k, boom, side, flapping, Math.max(1.4, 1.8 * k * 0.55));
  // Mast.
  ctx.fillStyle = '#E9EEF8';
  ctx.beginPath(); ctx.arc(0, -3.9 * k, Math.max(1, 0.9 * k), 0, Math.PI * 2); ctx.fill();
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
/** The part of the water a replay shows: x0..x1, y0..y1 in metres. */
export interface ReplayBox { x0: number; y0: number; x1: number; y1: number }

/** Everywhere the race went: the marks and every boat's track. */
export function raceBox(race: Race): ReplayBox {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const grow = (x: number, y: number) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
  for (const m of race.course.marks) grow(m.p.x, m.p.y);
  for (let k = 0; k < race.track.length; k += 3) { const d = race.track[k].d; for (let i = 0; i < race.boats.length; i++) grow(d[i * 5], d[i * 5 + 1]); }
  return { x0, y0, x1, y1 };
}

/**
 * The replay: tracks up to the frame (the boats in focus bright, the rest faint with a short tail),
 * the boats as they were and the wind then, within `box` (the whole race by default), with the
 * names of the boats in focus.
 */
export function drawReplayMap(ctx: CanvasRenderingContext2D, race: Race, w: number, h: number, dpr: number, frame: number, focus: string[], box?: ReplayBox) {
  const c = race.course;
  const B = box ?? raceBox(race);
  const pad = 2 * c.L;
  const s = Math.min(w / (B.x1 - B.x0 + 2 * pad), h / (B.y1 - B.y0 + 2 * pad));
  const cam = { x: (B.x0 + B.x1) / 2, y: (B.y0 + B.y1) / 2 };
  const X = (x: number) => w / 2 + (x - cam.x) * s;
  const Y = (y: number) => h / 2 - (y - cam.y) * s;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#0B1A31';
  ctx.fillRect(0, 0, w, h);
  if (race.venue) drawVenueLand(ctx, race.venue, (x, y) => [X(x), Y(y)], s, w, h, s > 6);
  // Line and marks.
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = '#FFB340';
  ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(X(c.start.pin.x), Y(c.start.pin.y)); ctx.lineTo(X(c.start.stbd.x), Y(c.start.stbd.y)); ctx.stroke();
  ctx.setLineDash([]);
  for (const m of c.marks) {
    const r = Math.max(4.5, m.r * s);
    ctx.fillStyle = '#FF9F43';
    ctx.beginPath(); ctx.arc(X(m.p.x), Y(m.p.y), r, 0, Math.PI * 2); ctx.fill();
    if (s > 5) label(ctx, m.kind === 'pin' ? 'Pin' : m.kind === 'start-stbd' ? 'S' : m.label === '1' ? 'Mark 1' : m.label, X(m.p.x), Y(m.p.y) - r - 7, 'rgba(235,240,255,0.7)', 11.5, 'center', 600);
  }
  const T = race.track;
  if (!T.length) return;
  const n = race.boats.length;
  const f = Math.max(0, Math.min(T.length - 1, frame | 0));
  // Tracks up to the frame: focused boats bright, the rest faint, with a brighter last 10 s.
  race.boats.forEach((b, i) => {
    const hot = focus.includes(b.id);
    ctx.strokeStyle = b.color;
    ctx.globalAlpha = hot ? 0.9 : 0.14;
    ctx.lineWidth = hot ? (b.isPlayer ? 2.4 : 2) : 1.2;
    ctx.beginPath();
    for (let k = 0; k <= f; k += 2) {
      const d = T[k].d;
      const x = X(d[i * 5]), y = Y(d[i * 5 + 1]);
      if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    if (!hot) {
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      for (let k = Math.max(0, f - 50); k <= f; k++) { const d = T[k].d; const x = X(d[i * 5]), y = Y(d[i * 5 + 1]); if (k === Math.max(0, f - 50)) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.stroke();
    }
  });
  ctx.globalAlpha = 1;
  // Boats at the frame, big enough to read when zoomed in.
  const d = T[f].d;
  const Lpx = Math.max(14, Math.min(40, c.L * s));
  for (let i = 0; i < n; i++) {
    const b = race.boats[i];
    const x = X(d[i * 5]), y = Y(d[i * 5 + 1]), hd = d[i * 5 + 2];
    const hot = focus.includes(b.id);
    drawBoat(ctx, x, y, hd, n180(T[f].twd - hd), 0.7, Lpx, b.color, b.isPlayer, false, hot ? 1 : 0.6);
    if (hot || s > 8) label(ctx, b.isPlayer ? 'You' : b.sail, x + Lpx * 0.55 + 4, y - Lpx * 0.4, b.isPlayer ? '#FFFFFF' : 'rgba(235,240,255,0.8)', b.isPlayer ? 12.5 : 11.5, 'left', b.isPlayer ? 700 : 600);
  }
  // The wind at that moment.
  {
    const wd = dir(T[f].twd + 180), cx = w - 30, cy = 30;
    ctx.strokeStyle = 'rgba(156,203,255,0.9)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx - wd.x * 11, cy + wd.y * 11); ctx.lineTo(cx + wd.x * 11, cy - wd.y * 11);
    const ax = cx + wd.x * 11, ay = cy - wd.y * 11, pxv = { x: wd.y, y: wd.x };
    ctx.moveTo(ax, ay); ctx.lineTo(ax - wd.x * 6 + pxv.x * 5, ay + wd.y * 6 + pxv.y * 5);
    ctx.moveTo(ax, ay); ctx.lineTo(ax - wd.x * 6 - pxv.x * 5, ay + wd.y * 6 - pxv.y * 5);
    ctx.stroke();
  }
  if (race.venue) drawCredit(ctx, `Map data ${race.venue.def.credit}`, w, h);
}
