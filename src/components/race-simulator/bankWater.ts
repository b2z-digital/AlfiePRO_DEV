// The water in the bank view, the way it looks from the bank: the wind's ripples (a texture that
// shrinks into the distance and drifts downwind), gusts as darker patches of rougher water and lulls
// as glassy ones, wave crests rolling downwind (lit along their tops, shaded in front, with
// whitecaps in rough water), and each boat's wake: her bow wave, the foam she leaves along her track
// and the V of her wash spreading behind. Everything is drawn on the water's plane, in perspective.
import type { Race } from '@/sim/engine';
import { DEG, dir } from '@/sim/math';
import type { Puff } from '@/sim/wind';
import { PUFF_LENGTH } from '@/sim/wind';
import type { Pose } from './boat3d';
import type { BankCam, BankView } from './bank';

interface V2 { x: number; y: number }

function hash(i: number, j: number) {
  let hh = (i * 374761393 + j * 668265263) | 0;
  hh = Math.imul(hh ^ (hh >>> 13), 1274126177);
  return ((hh ^ (hh >>> 16)) >>> 0) / 4294967296;
}
const smooth = (a: number, b: number, x: number) => { const u = Math.max(0, Math.min(1, (x - a) / (b - a))); return u * u * (3 - 2 * u); };

// ───────────────────────── Textures ─────────────────────────
// Tiles of ripple marks: across the wind is x, downwind is y. Drawn once, then mapped onto the water.
const TILE = 256;
type Tex = 'wind' | 'gust' | 'foam';
const tiles = new Map<Tex, CanvasPattern | null>();

/** Smooth noise on the tile, 0..1, that wraps at its edges (so the clumps tile too). */
function tileNoise(x: number, y: number, cells: number, seed: number): number {
  const fx = x * cells, fy = y * cells;
  const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
  const at = (a: number, b: number) => hash(((a % cells) + cells) % cells + seed * 131, ((b % cells) + cells) % cells + seed * 71);
  const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
  return (at(i, j) * (1 - su) + at(i + 1, j) * su) * (1 - sv) + (at(i, j + 1) * (1 - su) + at(i + 1, j + 1) * su) * sv;
}

function makeTile(kind: Tex): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = TILE; cv.height = TILE;
  const g = cv.getContext('2d');
  if (!g) return null;
  const mark = (x: number, y: number, draw: (x: number, y: number) => void) => {
    // Tiled: draw again across any edge it crosses.
    for (const ox of [-TILE, 0, TILE]) for (const oy of [-TILE, 0, TILE]) {
      if (x + ox < -24 || x + ox > TILE + 24 || y + oy < -24 || y + oy > TILE + 24) continue;
      draw(x + ox, y + oy);
    }
  };
  if (kind === 'foam') {
    // Churned water: soft white flecks and streaks.
    for (let k = 0; k < 520; k++) {
      const x = hash(k, 11) * TILE, y = hash(k, 23) * TILE, r = 1 + hash(k, 37) * 3.5;
      g.fillStyle = `rgba(245,250,255,${(0.25 + hash(k, 41) * 0.5).toFixed(2)})`;
      mark(x, y, (px, py) => { g.beginPath(); g.ellipse(px, py, r * 1.8, r * 0.8, 0, 0, Math.PI * 2); g.fill(); });
    }
  } else {
    // Ripples: lots of little crests, mostly across the wind, each a shaded front with a lit back,
    // gathered in patches the way the wind roughs up the water unevenly.
    const gust = kind === 'gust';
    const n = gust ? 3200 : 2300;
    for (let k = 0; k < n; k++) {
      const cx = hash(k, 3), cy = hash(k, 5);
      const clump = 0.6 * tileNoise(cx, cy, 4, 1) + 0.4 * tileNoise(cx, cy, 9, 2);
      if (hash(k, 7) > (gust ? 0.35 + 0.65 * clump : 0.1 + 0.9 * clump)) continue;
      const x = cx * TILE, y = cy * TILE;
      const len = 2.5 + hash(k, 9) * (gust ? 5 : 6.5);
      const tilt = (hash(k, 11) - 0.5) * 0.55; // radians either way of square to the wind
      const bend = (hash(k, 13) - 0.5) * 1.6;
      const ex = Math.cos(tilt) * len / 2, ey = Math.sin(tilt) * len / 2;
      const nx = -Math.sin(tilt), ny = Math.cos(tilt);
      const dark = `rgba(2,14,32,${((gust ? 0.36 : 0.22) + hash(k, 19) * 0.2).toFixed(2)})`;
      const lit = `rgba(196,220,244,${((gust ? 0.14 : 0.1) + hash(k, 21) * 0.11).toFixed(2)})`;
      mark(x, y, (px, py) => {
        g.lineWidth = 1;
        g.strokeStyle = dark;
        g.beginPath(); g.moveTo(px - ex, py - ey); g.quadraticCurveTo(px + nx * bend, py + ny * bend, px + ex, py + ey); g.stroke();
        g.strokeStyle = lit;
        g.beginPath(); g.moveTo(px - ex * 0.8 - nx * 1.2, py - ey * 0.8 - ny * 1.2); g.quadraticCurveTo(px + nx * (bend - 1.2), py + ny * (bend - 1.2), px + ex * 0.8 - nx * 1.2, py + ey * 0.8 - ny * 1.2); g.stroke();
      });
    }
  }
  return cv;
}

export function tex(ctx: CanvasRenderingContext2D, kind: Tex): CanvasPattern | null {
  if (!tiles.has(kind)) {
    const cv = makeTile(kind);
    tiles.set(kind, cv ? ctx.createPattern(cv, 'repeat') : null);
  }
  return tiles.get(kind) ?? null;
}

/**
 * Map a texture onto the water around a point: across the wind is the tile's x, downwind its y,
 * `m` metres to a tile pixel, scrolled downwind by `flow` pixels. Exact at Q, close enough nearby.
 */
export function mapAt(pat: CanvasPattern, V: Pick<BankView, 'P'>, Q: V2, across: V2, down: V2, m: number, flow: number) {
  const e = 0.25;
  const p0 = V.P(Q.x, Q.y, 0), px = V.P(Q.x + e, Q.y, 0), py = V.P(Q.x, Q.y + e, 0);
  const jxx = (px.x - p0.x) / e, jxy = (py.x - p0.x) / e, jyx = (px.y - p0.y) / e, jyy = (py.y - p0.y) / e;
  const A = { x: (jxx * across.x + jxy * across.y) * m, y: (jyx * across.x + jyy * across.y) * m };
  const B = { x: (jxx * down.x + jxy * down.y) * m, y: (jyx * down.x + jyy * down.y) * m };
  const uQ = ((Q.x * across.x + Q.y * across.y) / m) % TILE, vQ = ((Q.x * down.x + Q.y * down.y) / m - flow) % TILE;
  pat.setTransform(new DOMMatrix([A.x, A.y, B.x, B.y, p0.x - A.x * uQ - B.x * vQ, p0.y - A.y * uQ - B.y * vQ]));
  return Math.min(Math.hypot(A.x, A.y), Math.hypot(B.x, B.y)); // how big a tile pixel is on screen, at its smallest
}

// ───────────────────────── The wind's ripples ─────────────────────────
/**
 * Ripples over all the water: the wind's texture, mapped onto the water a few screen rows at a time.
 * Each row of the screen is a line of equal distance on the water, so thin bands map it all but
 * exactly, and it shrinks properly into the distance. You read the wind from it: its little crests
 * lie across the wind and it all drifts downwind. Two scales, fine and coarse, like a texture's mip
 * levels, so it never gets too fine to draw (which would shimmer).
 */
export function drawRipples(ctx: CanvasRenderingContext2D, V: BankView, race: Race, cam: BankCam, hz: number, detail = 2) {
  const pat = tex(ctx, 'wind');
  if (!pat) return;
  const t = race.t;
  const down = dir(race.wind.meanTwd(t) + 180), across = { x: down.y, y: -down.x };
  const kn = race.wind.meanTws(t) / 0.514444;
  const strength = smooth(0.5, 13, kn) * 0.8 + 0.12;
  // The ground under a screen row, straight ahead: the ray through it, down to the water.
  const cy = Math.cos(cam.yaw * DEG), sy = Math.sin(cam.yaw * DEG), cp = Math.cos(cam.pitch * DEG), sp = Math.sin(cam.pitch * DEG);
  const f = { x: sy * cp, y: cy * cp, z: -sp }, u = { x: sy * sp, y: cy * sp, z: cp };
  const groundAt = (row: number): (V2 & { d: number }) | null => {
    const k = (row - V.h / 2) / V.F;
    const dz = f.z - u.z * k;
    if (dz >= -1e-4) return null;
    const tt = -cam.z / dz;
    const x = cam.x + (f.x - u.x * k) * tt, y = cam.y + (f.y - u.y * k) * tt;
    return { x, y, d: tt };
  };
  const top = Math.max(0, Math.ceil(hz + 1));
  const band = detail >= 2 ? 6 : 12;
  for (const [m, a0, coarse] of [[0.01, 1, false], [0.044, 0.85, true]] as const) {
    if (coarse && detail < 2) continue;
    const flow = (t * (0.16 + 0.025 * kn)) / m;
    ctx.fillStyle = pat;
    for (let y1 = V.h; y1 > top; y1 -= band) {
      const y0 = Math.max(top, y1 - band);
      const Q = groundAt((y0 + y1) / 2);
      if (!Q) break;
      const px = mapAt(pat, V, Q, across, down, m, flow);
      // The coarse texture takes over just where the fine one gets too small to draw.
      const fade = coarse ? smooth(0.2, 0.5, px) * (1 - smooth(0.2, 0.5, (px * 0.01) / 0.044)) : smooth(0.2, 0.5, px);
      const alpha = a0 * strength * fade * (1 - smooth(500, 2200, Q.d));
      if (alpha < 0.012) continue;
      ctx.globalAlpha = alpha;
      ctx.fillRect(0, y0, V.w, y1 - y0 + 0.5);
    }
  }
  ctx.globalAlpha = 1;
}

// ───────────────────────── Gusts and lulls ─────────────────────────
/** The outline of a puff on the water: a little lumpy, the way gusts are. */
function puffRing(p: Puff, down: V2, across: V2, scale: number): V2[] {
  const out: V2[] = [];
  for (let k = 0; k < 20; k++) {
    const ang = (k / 20) * Math.PI * 2;
    const lump = 1 + 0.16 * Math.sin(ang * 3 + p.id * 1.7) + 0.09 * Math.sin(ang * 5 + p.id * 0.6);
    const al = Math.cos(ang) * p.r * PUFF_LENGTH * scale * lump, ac = Math.sin(ang) * p.r * scale * lump;
    out.push({ x: p.x + down.x * al + across.x * ac, y: p.y + down.y * al + across.y * ac });
  }
  return out;
}

/**
 * Gusts: darker water, roughed up by the extra wind, with a definite (if ragged) edge you can see
 * coming. Lulls: smoother, paler patches where the water reflects more of the sky.
 */
export function drawGusts(ctx: CanvasRenderingContext2D, V: BankView, race: Race, hz: number, detail = 2) {
  const t = race.t;
  const down = race.wind.down, across = { x: down.y, y: -down.x };
  const kn = race.wind.meanTws(t) / 0.514444;
  const pat = detail >= 2 ? tex(ctx, 'gust') : null;
  for (const p of race.wind.puffs) {
    const life = Math.sin(Math.PI * Math.min(1, Math.max(0, p.age / p.life)));
    const a = Math.min(1, Math.abs(p.strength) * 3.2 + 0.15) * life;
    if (a < 0.04 || V.depth(p.x, p.y) < -p.r * 2) continue;
    const outer = V.ground(puffRing(p, down, across, 1.08));
    if (outer.length < 3) continue;
    let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
    for (const q of outer) { minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y); minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x); }
    if (maxY < hz - 2 || minY > V.h + 4 || maxX < -20 || minX > V.w + 20) continue;
    const path = (pts: { x: number; y: number }[]) => { ctx.beginPath(); pts.forEach((q, k) => (k ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.closePath(); };
    if (p.strength > 0) {
      // The dark of the gust, deepest in its middle.
      const layers: [number, number][] = [[1.08, 0.3], [0.74, 0.42]];
      for (const [sc, k] of layers) {
        const q = sc === 1.08 ? outer : V.ground(puffRing(p, down, across, sc));
        if (q.length < 3) continue;
        ctx.fillStyle = `rgba(3,14,30,${(k * a).toFixed(3)})`;
        path(q); ctx.fill();
      }
      // Its rougher water: the gust texture, mapped at its middle and scrolling a little faster
      // than the gust itself moves.
      if (pat) {
        const px = mapAt(pat, V, { x: p.x, y: p.y }, across, down, 0.024, (t * (0.5 + 0.05 * kn)) / 0.024);
        const vis = smooth(0.16, 0.4, px);
        if (vis > 0.02) {
          ctx.fillStyle = pat;
          const q = V.ground(puffRing(p, down, across, 0.9));
          if (q.length >= 3) { ctx.globalAlpha = 0.55 * a * vis; path(q); ctx.fill(); }
          ctx.globalAlpha = 1;
        }
      }
    } else {
      // A lull: glassier, so paler with the sky, and softer at its edge.
      for (const [sc, k] of [[1.08, 0.07], [0.8, 0.08]] as const) {
        const q = sc === 1.08 ? outer : V.ground(puffRing(p, down, across, sc));
        if (q.length < 3) continue;
        ctx.fillStyle = `rgba(178,205,232,${(k * a).toFixed(3)})`;
        path(q); ctx.fill();
      }
    }
  }
}

// ───────────────────────── Waves ─────────────────────────
/**
 * Wave crests: each crest of the main waves is a soft, broken band across the water, moving
 * downwind at the waves' speed: shaded on its face towards you, with a faint lit edge on top. Where
 * the second set of waves meets it in step the crest stands up more, and in rough water those
 * places break into little patches of white.
 */
export function drawWaves(ctx: CanvasRenderingContext2D, V: BankView, race: Race, cam: BankCam) {
  const sea = race.sea;
  if (!sea) return;
  const t = race.t;
  const fw = dir(cam.yaw);
  const halfTan = Math.tan((cam.fov / 2) * DEG) * 1.15;
  // Whitecaps in rough water, and on choppy water too once it blows fresh.
  const kn = race.wind.meanTws(t) / 0.514444;
  const capsK = sea.kind === 'rough' ? 1 : smooth(12, 18, kn) * 0.8;
  const LEVELS = 5;
  const lightP = Array.from({ length: LEVELS }, () => new Path2D()), darkP = Array.from({ length: LEVELS }, () => new Path2D());
  const caps: { x: number; y: number; r: number; a: number; along: V2 }[] = [];
  const quad = (pth: Path2D, a: V2, b: V2, c: V2, d: V2) => {
    const pa = V.P(a.x, a.y, 0), pb = V.P(b.x, b.y, 0), pc = V.P(c.x, c.y, 0), pd = V.P(d.x, d.y, 0);
    pth.moveTo(pa.x, pa.y); pth.lineTo(pb.x, pb.y); pth.lineTo(pc.x, pc.y); pth.lineTo(pd.x, pd.y); pth.closePath();
  };
  const w = sea.trains[0], other = sea.trains[1] ?? sea.trains[0];
  const d = { x: w.dx, y: w.dy }, q = { x: d.y, y: -d.x };
  const lam = w.length;
  const reach = Math.min(110, lam * 32);
  const sCam = cam.x * d.x + cam.y * d.y, qCam = cam.x * q.x + cam.y * q.y;
  // Crest n sits where k s - ω t + φ = π/2 + 2πn.
  const n0 = Math.ceil(((sCam - reach) * w.k - w.omega * t + w.phase - Math.PI / 2) / (2 * Math.PI));
  const n1 = Math.floor(((sCam + reach) * w.k - w.omega * t + w.phase - Math.PI / 2) / (2 * Math.PI));
  const step = Math.max(0.6, lam * 0.8);
  for (let n = n0; n <= n1; n++) {
    const s = (Math.PI / 2 + 2 * Math.PI * n + w.omega * t - w.phase) / w.k;
    const toward = sCam > s ? 1 : -1; // which side of the crest you're on
    for (let qq = Math.floor((qCam - reach) / step) * step; qq < qCam + reach; qq += step) {
      const mid = { x: d.x * s + q.x * (qq + step / 2), y: d.y * s + q.y * (qq + step / 2) };
      const rx = mid.x - cam.x, ry = mid.y - cam.y;
      const depth = rx * fw.x + ry * fw.y;
      if (depth < 1.5 || depth > reach) continue;
      if (Math.abs(rx * fw.y - ry * fw.x) > depth * halfTan + step) continue;
      // How far apart the crests look here: fade them out before they crowd into stripes.
      const gap = (lam * V.F * cam.z) / (depth * depth);
      const vis = smooth(4, 14, gap) * (1 - smooth(reach * 0.5, reach, depth)) * smooth(1.5, 4, depth);
      if (vis < 0.08) continue;
      // Short-crested: each crest runs a few wavelengths, then dies away, and the second set of
      // waves decides where it stands up.
      const phO = other.k * (mid.x * other.dx + mid.y * other.dy) - other.omega * t + other.phase;
      const join = 0.5 + 0.5 * Math.cos(phO);
      const run = 0.5 + 0.5 * Math.sin((qq / lam) * 1.3 + n * 2.3 + 0.7 * Math.sin((qq / lam) * 0.45 + n * 0.8));
      const k = vis * smooth(0.25, 0.9, run) * (0.25 + 0.75 * join);
      const lv = Math.min(LEVELS - 1, Math.floor(k * LEVELS));
      if (lv > 0) {
        const at = (ds: number, dq: number): V2 => ({ x: d.x * (s + ds) + q.x * (qq + dq), y: d.y * (s + ds) + q.y * (qq + dq) });
        quad(darkP[lv], at(toward * lam * 0.04, 0), at(toward * lam * 0.04, step), at(toward * lam * 0.32, step), at(toward * lam * 0.32, 0));
        quad(lightP[lv], at(-toward * lam * 0.02, 0), at(-toward * lam * 0.02, step), at(toward * lam * 0.03, step), at(toward * lam * 0.03, 0));
      }
      // Whitecaps: where the two sets pile up in rough water, a little white breaks off the crest.
      if (capsK > 0.02) {
        const cap = smooth(0.82, 0.98, join) * smooth(0.6, 0.9, hash(n, Math.round(qq / step))) * vis * capsK;
        if (cap > 0.08) {
          // A few small flecks of white, not one slab.
          const id = Math.round(qq / step);
          for (let j = 0; j < 3; j++) {
            const off = (hash(n + 7 * j, id) - 0.5) * step, back = (hash(n, id + 11 * j) - 0.5) * lam * 0.06;
            caps.push({ x: mid.x + q.x * off + d.x * back, y: mid.y + q.y * off + d.y * back, r: 0.05 + 0.06 * hash(n + j, id + 3), a: cap * (1 - 0.25 * j), along: q });
          }
        }
      }
    }
  }
  for (let lv = 1; lv < LEVELS; lv++) {
    const f = lv / (LEVELS - 1);
    ctx.fillStyle = `rgba(4,18,38,${(0.11 * f).toFixed(3)})`; ctx.fill(darkP[lv]);
    ctx.fillStyle = `rgba(206,226,246,${(0.03 * f).toFixed(3)})`; ctx.fill(lightP[lv]);
  }
  if (caps.length) {
    const foam = tex(ctx, 'foam');
    for (const c of caps) {
      // A ragged little patch of foam, longer along the crest than across it.
      const ring: V2[] = [];
      for (let k = 0; k < 9; k++) {
        const ang = (k / 9) * Math.PI * 2, rr = c.r * (0.75 + 0.5 * hash(Math.round(c.x * 31) + k, Math.round(c.y * 17)));
        ring.push({ x: c.x + c.along.x * Math.cos(ang) * rr * 2.2 + c.along.y * Math.sin(ang) * rr * 0.8, y: c.y + c.along.y * Math.cos(ang) * rr * 2.2 - c.along.x * Math.sin(ang) * rr * 0.8 });
      }
      const pts = V.ground(ring);
      if (pts.length < 3) continue;
      ctx.beginPath(); pts.forEach((pt, k) => (k ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y))); ctx.closePath();
      ctx.fillStyle = `rgba(240,247,255,${(0.22 * c.a).toFixed(3)})`; ctx.fill();
      if (foam) {
        mapAt(foam, V, c, c.along, { x: -c.along.y, y: c.along.x }, 0.004, 0);
        ctx.globalAlpha = Math.min(1, c.a * 1.1); ctx.fillStyle = foam; ctx.fill(); ctx.globalAlpha = 1;
      }
    }
  }
}

// ───────────────────────── Wakes ─────────────────────────
export interface WakeBoat { i: number; pose: Pose; L: number; beam: number; hullSpeed: number }

/**
 * Each boat's wake, from her real track. Just behind her the water is churned white; behind that
 * her wake lies as a smoother, paler lane across the ripples, widening and fading. Out to each side
 * her wash spreads at the Kelvin angle as a feather of little waves, and the bow wave peels off
 * both sides of her bow. All of it grows with her speed. `back` draws it as it was that many steps
 * ago (instant replay).
 */
export function drawWakes(ctx: CanvasRenderingContext2D, V: BankView, race: Race, boats: WakeBoat[], back: number, detail = 2) {
  const foam = detail >= 2 ? tex(ctx, 'foam') : null;
  const KELVIN = Math.tan(19.47 * DEG);
  const lane = [new Path2D(), new Path2D(), new Path2D()];
  const churns: { pth: Path2D; at: { x: number; y: number; nx: number; ny: number } }[] = [];
  const featherLit = new Path2D(), featherDark = new Path2D();
  const bowSoft = new Path2D(), bowWhite = new Path2D();
  const quadTo = (pth: Path2D, a: V2, b: V2, c: V2, d: V2, z = 0) => {
    const pa = V.P(a.x, a.y, z), pb = V.P(b.x, b.y, z), pc = V.P(c.x, c.y, z), pd = V.P(d.x, d.y, z);
    if (Math.min(pa.z, pb.z, pc.z, pd.z) < 0.4) return;
    pth.moveTo(pa.x, pa.y); pth.lineTo(pb.x, pb.y); pth.lineTo(pc.x, pc.y); pth.lineTo(pd.x, pd.y); pth.closePath();
  };
  for (const wb of boats) {
    const H = race.hist[wb.i];
    const n = H.x.length - 1 - Math.max(0, back);
    if (n < 3) continue;
    const { pose: p, L, beam } = wb;
    const fast = Math.min(1.3, p.spd / Math.max(0.05, wb.hullSpeed));
    if (fast < 0.06 || V.depth(p.x, p.y) < 0.7) continue;
    // Her track back from the stern.
    const T = 1.6 + 3.6 * Math.min(1, fast);
    const steps = Math.min(n, Math.round(T / 0.05));
    const pts: { x: number; y: number; nx: number; ny: number; age: number; s: number }[] = [];
    let s0 = 0;
    for (let k = n; k >= n - steps; k -= 2) {
      const f = dir(H.hdg[k]);
      const q = { x: H.x[k] - f.x * L * 0.47, y: H.y[k] - f.y * L * 0.47 };
      if (pts.length) s0 += Math.hypot(q.x - pts[pts.length - 1].x, q.y - pts[pts.length - 1].y);
      pts.push({ ...q, nx: f.y, ny: -f.x, age: (n - k) * 0.05, s: s0 });
    }
    if (pts.length < 3) continue;
    // ── The lane, and the white water just behind her ──
    const width = (age: number) => beam * (0.32 + 1.5 * (age / T)) * (0.7 + 0.4 * fast);
    const churn = new Path2D();
    churns.push({ pth: churn, at: { x: pts[0].x, y: pts[0].y, nx: pts[0].nx, ny: pts[0].ny } });
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k], b = pts[k + 1], wa = width(a.age), wbb = width(b.age);
      const A = { x: a.x + a.nx * wa, y: a.y + a.ny * wa }, B = { x: b.x + b.nx * wbb, y: b.y + b.ny * wbb };
      const C = { x: b.x - b.nx * wbb, y: b.y - b.ny * wbb }, D = { x: a.x - a.nx * wa, y: a.y - a.ny * wa };
      quadTo(lane[Math.min(2, Math.floor((a.age / T) * 3))], A, B, C, D);
      if (a.age < 0.25 + 0.5 * fast) quadTo(churn, A, B, C, D);
    }
    // ── Her wash: a feather of little waves along each arm of the V ──
    if (fast > 0.2 && detail > 0) {
      const reach = L * (1.2 + 2.6 * fast), gap = 0.12 + 0.2 * fast;
      let next = gap * 0.6, k = 1;
      while (next < reach && k < pts.length) {
        while (k < pts.length && pts[k].s < next) k++;
        if (k >= pts.length) break;
        const a = pts[k], fade = 1 - next / reach;
        const len = (0.05 + 0.1 * fast) * (0.5 + 0.8 * fade), th = 0.012 + 0.012 * fast * fade;
        // The little crests lie at about 55° to her track, sloping back from the arm.
        for (const side of [1, -1]) {
          const off = beam * 0.45 + next * KELVIN;
          const c = { x: a.x + a.nx * off * side, y: a.y + a.ny * off * side };
          const tx = -a.ny, ty = a.nx; // along her track, forwards
          const ang = 55 * DEG;
          const ex = (tx * Math.cos(ang) + a.nx * side * Math.sin(ang)) * len, ey = (ty * Math.cos(ang) + a.ny * side * Math.sin(ang)) * len;
          const ox = -ey / len * th, oy = ex / len * th;
          const e0 = { x: c.x - ex * 0.5, y: c.y - ey * 0.5 }, e1 = { x: c.x + ex * 0.5, y: c.y + ey * 0.5 };
          if (fade > 0.15) {
            quadTo(featherLit, { x: e0.x + ox, y: e0.y + oy }, { x: e1.x + ox, y: e1.y + oy }, e1, e0);
            quadTo(featherDark, e0, e1, { x: e1.x - ox * 1.6, y: e1.y - oy * 1.6 }, { x: e0.x - ox * 1.6, y: e0.y - oy * 1.6 });
          }
        }
        next += gap;
      }
    }
    // ── Bow wave: white water peeling off both sides of the bow ──
    if (fast > 0.12) {
      const f = dir(p.hdg), sd = { x: f.y, y: -f.x };
      const at = (fx: number, side: number, off: number) => ({ x: p.x + f.x * fx * L + sd.x * side * off, y: p.y + f.y * fx * L + sd.y * side * off });
      const hw = beam / 2, flare = hw * (0.5 + 1.3 * fast), aft = 0.16 + 0.34 * fast;
      for (const side of [1, -1]) {
        // A soft sheet of white, then the bright curl along the hull.
        const soft = [at(0.49, side, 0.01), at(0.38, side, hw * 0.85), at(0.5 - aft * 0.6, side, hw + flare * 0.55), at(0.5 - aft, side, hw + flare), at(0.5 - aft * 1.05, side, hw + flare * 0.4), at(0.5 - aft * 0.7, side, hw * 0.9)];
        const white = [at(0.49, side, 0.005), at(0.4, side, hw * 0.8), at(0.5 - aft * 0.55, side, hw + flare * 0.35), at(0.5 - aft * 0.6, side, hw * 0.95)];
        for (const [pth, ring] of [[bowSoft, soft], [bowWhite, white]] as const) {
          const q = ring.map(pt => V.P(pt.x, pt.y, p.heave));
          if (q.some(qq => qq.z < 0.4)) continue;
          q.forEach((qq, k2) => (k2 ? pth.lineTo(qq.x, qq.y) : pth.moveTo(qq.x, qq.y)));
          pth.closePath();
        }
      }
    }
  }
  // The lane: paler and smoother than the rippled water round it, fading as it widens.
  [0.11, 0.075, 0.04].forEach((a, k) => { ctx.fillStyle = `rgba(176,204,232,${a})`; ctx.fill(lane[k]); });
  ctx.fillStyle = 'rgba(3,15,32,0.13)'; ctx.fill(featherDark);
  ctx.fillStyle = 'rgba(214,232,250,0.32)'; ctx.fill(featherLit);
  for (const c of churns) {
    ctx.fillStyle = 'rgba(232,242,252,0.22)'; ctx.fill(c.pth);
    if (!foam) continue;
    mapAt(foam, V, c.at, { x: c.at.nx, y: c.at.ny }, { x: -c.at.ny, y: c.at.nx }, 0.008, 0);
    ctx.fillStyle = foam; ctx.globalAlpha = 0.8; ctx.fill(c.pth); ctx.globalAlpha = 1;
  }
  ctx.fillStyle = 'rgba(236,245,255,0.32)'; ctx.fill(bowSoft);
  ctx.fillStyle = 'rgba(248,252,255,0.75)'; ctx.fill(bowWhite);
}
