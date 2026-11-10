// The water in the bank view, the way it looks from the bank: the wind's ripples and the waves (two
// textures that shrink into the distance, the ripples drifting downwind and the waves rolling with
// them), gusts as darker patches of rougher water and lulls as glassy ones, whitecaps in a breeze,
// and each boat's wake: her bow wave, the foam she leaves along her track and the V of her wash.
// Everything is drawn on the water's plane, in perspective, and mostly as textured strips of the
// screen, which a graphics card draws far faster than big shapes. Nothing jumps from frame to frame.
import type { Race } from '@/sim/engine';
import { DEG, dir } from '@/sim/math';
import type { Puff } from '@/sim/wind';
import { PUFF_LENGTH, puffLife } from '@/sim/wind';
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
type Tex = 'wind' | 'gust' | 'foam' | 'wave';
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
  if (kind === 'wave') {
    // One wavelength down the tile (the way the waves travel), three along a crest: each crest a soft
    // band that catches the sky on top and darkens on the face below, standing up more in some
    // places along its length than others, the way wind waves do.
    const img = g.createImageData(TILE, TILE), d = img.data;
    for (let x = 0; x < TILE; x++) {
      const along = 0.5 + 0.5 * Math.sin((x / TILE) * 2 * Math.PI * 3 + 0.7) * (0.6 + 0.4 * Math.sin((x / TILE) * 2 * Math.PI + 2.1));
      const stand = 0.15 + 0.85 * Math.pow(along, 1.6);
      const wob = 10 * Math.sin((x / TILE) * 2 * Math.PI * 2 + 0.4) + 5 * Math.sin((x / TILE) * 2 * Math.PI * 5 + 1.7);
      for (let y = 0; y < TILE; y++) {
        const ph = (2 * Math.PI * (y + wob)) / TILE; // crest at y = 64 (the waves travel down the tile)
        // Soft all through: a gentle sheen on the back of each wave as it rises to the crest, and the
        // dark band on its face just past the crest (the side it's travelling towards). A boat punching
        // upwind meets the dark band first, and that's when her bow lifts.
        const lit = Math.pow(0.5 + 0.5 * Math.cos(ph - 0.95), 3) * 0.09 * stand;
        const shade = Math.pow(0.5 + 0.5 * Math.cos(ph - 2.45), 2.2) * 0.26 * stand;
        // Light over dark, premultiplied.
        const a = lit + shade * (1 - lit);
        const k = (y * TILE + x) * 4;
        if (a <= 0.002) { d[k + 3] = 0; continue; }
        d[k] = Math.round((206 * lit + 4 * shade * (1 - lit)) / a);
        d[k + 1] = Math.round((226 * lit + 18 * shade * (1 - lit)) / a);
        d[k + 2] = Math.round((246 * lit + 40 * shade * (1 - lit)) / a);
        d[k + 3] = Math.round(255 * a);
      }
    }
    g.putImageData(img, 0, 0);
  } else if (kind === 'foam') {
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

const ZERO: V2 = { x: 0, y: 0 };

// Where the wind's ripples have got to. They drift downwind at a pace that grows with the breeze,
// and lie across it. Both are added up as the race goes on (a little each frame), never worked out
// from the clock: "time × speed" slides the whole pattern whenever the speed changes (backwards, up
// the course, every time the breeze eases), and turning the pattern about a far-off point swings
// it sideways under the boats whenever the wind shifts. Here a shift turns the ripples about the
// water you're looking at, so they only ever drift downwind.
const drifts = new WeakMap<Race, { t: number; twd: number; x: number; y: number; dist: number }>();
/** Metres a second the ripples drift downwind in a breeze of `kn` knots. */
export const rippleSpeed = (kn: number) => 0.18 + 0.05 * kn;
/** `dist`: how far they have drifted in all, metres. */
export function rippleDrift(race: Race, pivot: V2): { O: V2; down: V2; across: V2; kn: number; dist: number } {
  const t = race.t, twd = race.wind.meanTwd(t), kn = race.wind.meanTws(t) / 0.514444;
  const down = dir(twd + 180), across = { x: down.y, y: -down.x };
  let s = drifts.get(race);
  if (!s) { s = { t, twd, x: 0, y: 0, dist: 0 }; drifts.set(race, s); }
  const dt = t - s.t;
  if (dt !== 0) {
    if (Math.abs(dt) < 1) {
      // The wind has swung: turn the pattern with it, about the water in view.
      const d = ((((twd - s.twd) % 360) + 540) % 360 - 180) * DEG, cd = Math.cos(d), sd = Math.sin(d);
      const vx = pivot.x - s.x, vy = pivot.y - s.y;
      s.x = pivot.x - (vx * cd + vy * sd); s.y = pivot.y - (-vx * sd + vy * cd);
      const v = rippleSpeed(kn) * dt;
      s.x += down.x * v; s.y += down.y * v; s.dist += v;
    }
    s.t = t; s.twd = twd;
  }
  return { O: { x: s.x, y: s.y }, down, across, kn, dist: s.dist };
}

/**
 * Map a texture onto the water around a point: across the wind is the tile's x, downwind its y,
 * `m` metres to a tile pixel, scrolled downwind by `flow` pixels. Exact at Q, close enough nearby.
 */
export function mapAt(pat: CanvasPattern, V: Pick<BankView, 'P'>, Q: V2, across: V2, down: V2, m: number, flow: number, O: V2 = ZERO) {
  const e = 0.25;
  const p0 = V.P(Q.x, Q.y, 0), px = V.P(Q.x + e, Q.y, 0), py = V.P(Q.x, Q.y + e, 0);
  const jxx = (px.x - p0.x) / e, jxy = (py.x - p0.x) / e, jyx = (px.y - p0.y) / e, jyy = (py.y - p0.y) / e;
  const A = { x: (jxx * across.x + jxy * across.y) * m, y: (jyx * across.x + jyy * across.y) * m };
  const B = { x: (jxx * down.x + jxy * down.y) * m, y: (jyx * down.x + jyy * down.y) * m };
  const qx = Q.x - O.x, qy = Q.y - O.y;
  const uQ = ((qx * across.x + qy * across.y) / m) % TILE, vQ = ((qx * down.x + qy * down.y) / m - flow) % TILE;
  pat.setTransform(new DOMMatrix([A.x, A.y, B.x, B.y, p0.x - A.x * uQ - B.x * vQ, p0.y - A.y * uQ - B.y * vQ]));
  return Math.min(Math.hypot(A.x, A.y), Math.hypot(B.x, B.y)); // how big a tile pixel is on screen, at its smallest
}

/** As mapAt, with its own scale along each axis and a scroll on each: returns the screen size of a
 *  tile pixel down the tile (the way the waves travel), the axis that shrinks most with distance. */
function mapAt2(pat: CanvasPattern, V: Pick<BankView, 'P'>, Q: V2, across: V2, down: V2, mx: number, my: number, flowV: number) {
  const e = 0.25;
  const p0 = V.P(Q.x, Q.y, 0), px = V.P(Q.x + e, Q.y, 0), py = V.P(Q.x, Q.y + e, 0);
  const jxx = (px.x - p0.x) / e, jxy = (py.x - p0.x) / e, jyx = (px.y - p0.y) / e, jyy = (py.y - p0.y) / e;
  const A = { x: (jxx * across.x + jxy * across.y) * mx, y: (jyx * across.x + jyy * across.y) * mx };
  const B = { x: (jxx * down.x + jxy * down.y) * my, y: (jyx * down.x + jyy * down.y) * my };
  const uQ = ((Q.x * across.x + Q.y * across.y) / mx) % TILE, vQ = ((Q.x * down.x + Q.y * down.y) / my - flowV) % TILE;
  pat.setTransform(new DOMMatrix([A.x, A.y, B.x, B.y, p0.x - A.x * uQ - B.x * vQ, p0.y - A.y * uQ - B.y * vQ]));
  return Math.hypot(B.x, B.y);
}

// ───────────────────────── The wind's ripples ─────────────────────────
/**
 * The water's surface: the wind's ripples and the waves, mapped onto the water a few screen rows at a
 * time. Each row of the screen is a line of equal distance on the water, so thin strips map a texture
 * all but exactly, with no seams, and it shrinks properly into the distance.
 * - Ripples: their little crests lie across the wind and drift downwind, so you can read the wind.
 *   Two scales, fine and coarse (like a texture's mip levels), so they never get too fine to draw,
 *   which would shimmer.
 * - Waves: the main set and, at full detail, the second set a little off the wind, rolling at the
 *   same pace the boats feel them, and fading out before the crests crowd together in the distance.
 */
export function drawRipples(ctx: CanvasRenderingContext2D, V: BankView, race: Race, cam: BankCam, hz: number, detail = 2) {
  const ripple = tex(ctx, 'wind');
  const sea = race.sea;
  const wave = sea ? tex(ctx, 'wave') : null;
  if (!ripple && !wave) return;
  const t = race.t;
  const kn0 = race.wind.meanTws(t) / 0.514444;
  const strength = smooth(0.5, 13, kn0) * 0.8 + 0.12;
  // The ground under a screen row, straight ahead: the ray through it, down to the water.
  const cy = Math.cos(cam.yaw * DEG), sy = Math.sin(cam.yaw * DEG), cp = Math.cos(cam.pitch * DEG), sp = Math.sin(cam.pitch * DEG);
  const f = { x: sy * cp, y: cy * cp, z: -sp }, u = { x: sy * sp, y: cy * sp, z: cp };
  const groundAt = (row: number): (V2 & { d: number }) | null => {
    const k = (row - V.h / 2) / V.F;
    const dz = f.z - u.z * k;
    if (dz >= -1e-4) return null;
    const tt = -cam.z / dz;
    return { x: cam.x + (f.x - u.x * k) * tt, y: cam.y + (f.y - u.y * k) * tt, d: tt };
  };
  const FINE = 0.01, COARSE = 0.044;
  // The ripples turn (when the wind swings) about the water in the middle of the view.
  const { O, down, across } = rippleDrift(race, groundAt(hz + (V.h - hz) * 0.45) ?? { x: cam.x, y: cam.y });
  const w0 = sea && wave ? sea.trains[0] : null;
  const cols = detail >= 2 ? 4 : 2;
  const rgt = { x: cy, y: -sy };
  // The water under a screen point: its row and column.
  const groundXY = (row: number, col: number): (V2 & { d: number }) | null => {
    const k = (row - V.h / 2) / V.F, c = (col - V.w / 2) / V.F;
    const dz = f.z - u.z * k;
    if (dz >= -1e-4) return null;
    const tt = -cam.z / dz;
    return { x: cam.x + (f.x + rgt.x * c - u.x * k) * tt, y: cam.y + (f.y + rgt.y * c - u.y * k) * tt, d: tt };
  };
  // Strips get thinner towards the horizon, where the distance changes fastest from row to row.
  const band = detail >= 2 ? 8 : 14;
  const top = Math.max(0, Math.ceil(hz + 1));
  for (let y1 = V.h; y1 > top;) {
    const y0 = Math.max(top, y1 - Math.max(2, Math.min(band, (y1 - hz) * 0.07)));
    const Q = groundAt((y0 + y1) / 2);
    if (!Q) break;
    const far = 1 - smooth(500, 2200, Q.d);
    const h = y1 - y0 + 0.5;
    if (ripple) {
      ctx.fillStyle = ripple;
      // Fine near the bank; the coarse one takes over just where the fine one gets too small.
      const pf = mapAt(ripple, V, Q, across, down, FINE, 0, O);
      const af = smooth(0.2, 0.5, pf);
      if (af * strength > 0.012) { ctx.globalAlpha = af * strength * far; ctx.fillRect(0, y0, V.w, h); }
      if (af < 0.99 && detail >= 2) {
        const pc = mapAt(ripple, V, Q, across, down, COARSE, 0, O);
        const ac = smooth(0.2, 0.5, pc) * (1 - af) * 0.85;
        if (ac * strength > 0.012) { ctx.globalAlpha = ac * strength * far; ctx.fillRect(0, y0, V.w, h); }
      }
    }
    if (wave && w0) {
      // The main waves, mapped column by column (a strip's mapping is only exact down its middle,
      // and long wave crests would show the joins), faded in from just off the bank and out before
      // the crests crowd together in the distance.
      ctx.fillStyle = wave;
      const d = { x: w0.dx, y: w0.dy }, q = { x: d.y, y: -d.x };
      const my = w0.length / TILE, mx = (3 * w0.length) / TILE;
      // The tile's crest (y = 64) sits on the waves' crest: k s - ω t + φ = π/2.
      const s0 = (Math.PI / 2 + w0.omega * t - w0.phase) / w0.k;
      const cw = V.w / cols;
      for (let ci = 0; ci < cols; ci++) {
        const Qc = groundXY((y0 + y1) / 2, (ci + 0.5) * cw);
        if (!Qc) continue;
        const py = mapAt2(wave, V, Qc, q, d, mx, my, s0 / my - 64);
        const a = smooth(8, 26, py * TILE) * smooth(3, 10, Qc.d) * far * Math.min(1, (w0.amp / 0.02) * 0.8 + 0.2);
        if (a > 0.012) { ctx.globalAlpha = a; ctx.fillRect(ci * cw, y0, cw + 0.5, h); }
      }
    }
    y1 = y0;
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
  const down = race.wind.down, across = { x: down.y, y: -down.x };
  const pat = detail >= 2 ? tex(ctx, 'gust') : null;
  const rd = rippleDrift(race, { x: 0, y: 0 }); // (already moved on for this frame by the ripples)
  for (const p of race.wind.puffs) {
    // Darker the stronger it is: a big gust stands out, a little puff is just a shade.
    const a = Math.min(1, Math.abs(p.strength) * 1.5 + 0.25) * puffLife(p);
    if (a < 0.04 || V.depth(p.x, p.y) < -p.r * 2) continue;
    const outer = V.ground(puffRing(p, down, across, 1.1));
    if (outer.length < 3) continue;
    // Centre and principal axes of its outline on the screen: the ellipse it makes there.
    let mx = 0, my = 0;
    for (const q of outer) { mx += q.x; my += q.y; }
    mx /= outer.length; my /= outer.length;
    let sxx = 0, syy = 0, sxy = 0, minY = Infinity, maxY = -Infinity;
    for (const q of outer) { const dx = q.x - mx, dy = q.y - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y); }
    sxx /= outer.length; syy /= outer.length; sxy /= outer.length;
    const tr = sxx + syy, disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - (sxx * syy - sxy * sxy)));
    const ra = Math.sqrt(2 * (tr / 2 + disc)), rb = Math.sqrt(2 * Math.max(1e-6, tr / 2 - disc));
    if (ra < 1.5 || maxY < hz - 2 || minY > V.h + 4 || mx + ra < -40 || mx - ra > V.w + 40) continue;
    // The tone: a soft-edged ellipse (no hard outline anywhere, however close the gust is).
    const dark = p.strength > 0;
    const rgb = dark ? '3,14,30' : '178,205,232', k = dark ? 0.4 : 0.09;
    ctx.save();
    ctx.translate(mx, my); ctx.rotate(0.5 * Math.atan2(2 * sxy, sxx - syy)); ctx.scale(1, Math.max(0.02, rb / ra));
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, ra);
    g.addColorStop(0, `rgba(${rgb},${(k * a).toFixed(3)})`); g.addColorStop(0.6, `rgba(${rgb},${(k * a * 0.8).toFixed(3)})`); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, ra, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // A gust's rougher water: its texture over its ragged middle. Its ripples drift with the rest of
    // the water; the gust itself sweeps across them.
    if (dark && pat) {
      const px = mapAt(pat, V, { x: p.x, y: p.y }, rd.across, rd.down, 0.024, 0, rd.O);
      // Gone where it would be too fine to draw, and close in, where it would be blown up into blobs.
      const vis = smooth(0.16, 0.4, px) * (1 - smooth(2.5, 6, px));
      const q = vis > 0.02 ? V.ground(puffRing(p, down, across, 0.85)) : [];
      if (q.length >= 3) {
        ctx.fillStyle = pat; ctx.globalAlpha = 0.5 * a * vis;
        ctx.beginPath(); q.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y))); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }
}

// ───────────────────────── Whitecaps ─────────────────────────
/**
 * Whitecaps: in rough water, and on choppy water once it blows fresh, little flecks of white break
 * off the crests where the two sets of waves pile up. They ride the crests, and come and go as the
 * sets move through each other, so they never pop.
 */
export function drawWaves(ctx: CanvasRenderingContext2D, V: BankView, race: Race, cam: BankCam) {
  const sea = race.sea;
  if (!sea) return;
  const t = race.t;
  const kn = race.wind.meanTws(t) / 0.514444;
  const capsK = sea.kind === 'rough' ? 1 : smooth(12, 18, kn) * 0.8;
  if (capsK < 0.02) return;
  const fw = dir(cam.yaw);
  const halfTan = Math.tan((cam.fov / 2) * DEG) * 1.15;
  const w = sea.trains[0], other = sea.trains[1] ?? sea.trains[0];
  const d = { x: w.dx, y: w.dy }, q = { x: d.y, y: -d.x };
  const lam = w.length, reach = Math.min(70, lam * 20), step = Math.max(0.6, lam * 0.8);
  const sCam = cam.x * d.x + cam.y * d.y, qCam = cam.x * q.x + cam.y * q.y;
  const n0 = Math.ceil(((sCam - reach) * w.k - w.omega * t + w.phase - Math.PI / 2) / (2 * Math.PI));
  const n1 = Math.floor(((sCam + reach) * w.k - w.omega * t + w.phase - Math.PI / 2) / (2 * Math.PI));
  const foam = tex(ctx, 'foam');
  for (let n = n0; n <= n1; n++) {
    const s = (Math.PI / 2 + 2 * Math.PI * n + w.omega * t - w.phase) / w.k;
    for (let qq = Math.floor((qCam - reach) / step) * step; qq < qCam + reach; qq += step) {
      const mid = { x: d.x * s + q.x * (qq + step / 2), y: d.y * s + q.y * (qq + step / 2) };
      const rx = mid.x - cam.x, ry = mid.y - cam.y, depth = rx * fw.x + ry * fw.y;
      if (depth < 1.5 || depth > reach || Math.abs(rx * fw.y - ry * fw.x) > depth * halfTan + step) continue;
      const phO = other.k * (mid.x * other.dx + mid.y * other.dy) - other.omega * t + other.phase;
      const id = Math.round(qq / step);
      const cap = smooth(0.82, 0.98, 0.5 + 0.5 * Math.cos(phO)) * smooth(0.6, 0.9, hash(n, id)) * capsK * (1 - smooth(reach * 0.6, reach, depth));
      if (cap < 0.06) continue;
      for (let j = 0; j < 3; j++) {
        const off = (hash(n + 7 * j, id) - 0.5) * step, back = (hash(n, id + 11 * j) - 0.5) * lam * 0.06;
        const c = { x: mid.x + q.x * off + d.x * back, y: mid.y + q.y * off + d.y * back };
        const r = 0.05 + 0.06 * hash(n + j, id + 3), a = cap * (1 - 0.25 * j);
        const ring: V2[] = [];
        for (let k = 0; k < 9; k++) {
          const ang = (k / 9) * Math.PI * 2, rr = r * (0.75 + 0.5 * hash(n * 13 + j + k, id));
          ring.push({ x: c.x + q.x * Math.cos(ang) * rr * 2.2 + q.y * Math.sin(ang) * rr * 0.8, y: c.y + q.y * Math.cos(ang) * rr * 2.2 - q.x * Math.sin(ang) * rr * 0.8 });
        }
        const pts = V.ground(ring);
        if (pts.length < 3) continue;
        ctx.beginPath(); pts.forEach((pt, k) => (k ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y))); ctx.closePath();
        ctx.fillStyle = `rgba(240,247,255,${(0.22 * a).toFixed(3)})`; ctx.fill();
        if (foam) {
          mapAt(foam, V, c, q, { x: -q.y, y: q.x }, 0.004, 0);
          ctx.globalAlpha = Math.min(1, a * 1.1); ctx.fillStyle = foam; ctx.fill(); ctx.globalAlpha = 1;
        }
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
  const quadTo = (pth: Path2D, a: V2, b: V2, c: V2, d: V2, z = 0) => {
    const pa = V.P(a.x, a.y, z), pb = V.P(b.x, b.y, z), pc = V.P(c.x, c.y, z), pd = V.P(d.x, d.y, z);
    if (Math.min(pa.z, pb.z, pc.z, pd.z) < 0.4) return;
    pth.moveTo(pa.x, pa.y); pth.lineTo(pb.x, pb.y); pth.lineTo(pc.x, pc.y); pth.lineTo(pd.x, pd.y); pth.closePath();
  };
  const LANE = [0.12, 0.095, 0.07, 0.048, 0.026];
  for (const wb of boats) {
    const H = race.hist[wb.i];
    const n = H.x.length - 1 - Math.max(0, back);
    if (n < 3) continue;
    const { pose: p, L, beam } = wb;
    const fast = Math.min(1.3, p.spd / Math.max(0.05, wb.hullSpeed));
    if (fast < 0.06 || V.depth(p.x, p.y) < 0.7) continue;
    // Her track back from the stern, every step of it: each point stays put on the water, so the
    // wake grows smoothly behind her instead of being re-sampled every frame.
    const T = 1.6 + 3.6 * Math.min(1, fast);
    const steps = Math.min(n, Math.round(T / 0.05));
    const pts: { x: number; y: number; nx: number; ny: number; age: number; s: number }[] = [];
    let s0 = 0;
    // A frame drawn part-way through a step: she is a little behind the last point of her track,
    // so the wake starts at her stern as drawn and picks her track up from the point before.
    const lag = back <= 0 ? race.renderLag : 0;
    if (lag > 0) {
      const f = dir(p.hdg);
      pts.push({ x: p.x - f.x * L * 0.47, y: p.y - f.y * L * 0.47, nx: f.y, ny: -f.x, age: 0, s: 0 });
    }
    for (let k = lag > 0 ? n - 1 : n; k >= n - steps; k--) {
      const f = dir(H.hdg[k]);
      const q = { x: H.x[k] - f.x * L * 0.47, y: H.y[k] - f.y * L * 0.47 };
      if (pts.length) s0 += Math.hypot(q.x - pts[pts.length - 1].x, q.y - pts[pts.length - 1].y);
      pts.push({ ...q, nx: f.y, ny: -f.x, age: Math.max(0, (n - k) * 0.05 - lag), s: s0 });
    }
    if (pts.length < 3) continue;
    // ── The lane, smoother and paler than the ripples round it, and white water just behind her ──
    const width = (age: number) => beam * (0.32 + 1.5 * (age / T)) * (0.7 + 0.4 * fast);
    const lane = LANE.map(() => new Path2D()), churn = new Path2D();
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k], b = pts[k + 1], wa = width(a.age), wbb = width(b.age);
      const A = { x: a.x + a.nx * wa, y: a.y + a.ny * wa }, B = { x: b.x + b.nx * wbb, y: b.y + b.ny * wbb };
      const C = { x: b.x - b.nx * wbb, y: b.y - b.ny * wbb }, D = { x: a.x - a.nx * wa, y: a.y - a.ny * wa };
      quadTo(lane[Math.min(LANE.length - 1, Math.floor((a.age / T) * LANE.length))], A, B, C, D);
      if (a.age < 0.25 + 0.5 * fast) quadTo(churn, A, B, C, D);
    }
    lane.forEach((pth, k) => { ctx.fillStyle = `rgba(176,204,232,${LANE[k] * Math.min(1, 0.4 + fast)})`; ctx.fill(pth); });
    ctx.fillStyle = 'rgba(232,242,252,0.22)'; ctx.fill(churn);
    if (foam) {
      mapAt(foam, V, pts[0], { x: pts[0].nx, y: pts[0].ny }, { x: -pts[0].ny, y: pts[0].nx }, 0.008, 0);
      ctx.fillStyle = foam; ctx.globalAlpha = 0.8; ctx.fill(churn); ctx.globalAlpha = 1;
    }
    // ── Her wash: a feather of little waves along each arm of the V, at fixed distances behind her ──
    if (fast > 0.2 && detail > 0) {
      const reach = L * (1.2 + 2.6 * fast), gap = 0.12 + 0.2 * fast;
      const lit = new Path2D(), dark = new Path2D();
      let k = 1;
      for (let next = gap * 0.6; next < reach; next += gap) {
        while (k < pts.length && pts[k].s < next) k++;
        if (k >= pts.length) break;
        // Exactly that far back along her track, between the two points either side.
        const a0 = pts[k - 1], a1 = pts[k], u = (next - a0.s) / Math.max(1e-6, a1.s - a0.s);
        const a = { x: a0.x + (a1.x - a0.x) * u, y: a0.y + (a1.y - a0.y) * u, nx: a0.nx + (a1.nx - a0.nx) * u, ny: a0.ny + (a1.ny - a0.ny) * u };
        const fade = 1 - next / reach;
        if (fade < 0.15) continue;
        const len = (0.05 + 0.1 * fast) * (0.5 + 0.8 * fade), th = 0.012 + 0.012 * fast * fade;
        for (const side of [1, -1]) {
          // The little crests lie at about 55° to her track, sloping back from the arm.
          const off = beam * 0.45 + next * KELVIN;
          const c = { x: a.x + a.nx * off * side, y: a.y + a.ny * off * side };
          const tx = -a.ny, ty = a.nx, ang = 55 * DEG;
          const ex = (tx * Math.cos(ang) + a.nx * side * Math.sin(ang)) * len, ey = (ty * Math.cos(ang) + a.ny * side * Math.sin(ang)) * len;
          const ox = (-ey / len) * th, oy = (ex / len) * th;
          const e0 = { x: c.x - ex * 0.5, y: c.y - ey * 0.5 }, e1 = { x: c.x + ex * 0.5, y: c.y + ey * 0.5 };
          quadTo(lit, { x: e0.x + ox, y: e0.y + oy }, { x: e1.x + ox, y: e1.y + oy }, e1, e0);
          quadTo(dark, e0, e1, { x: e1.x - ox * 1.6, y: e1.y - oy * 1.6 }, { x: e0.x - ox * 1.6, y: e0.y - oy * 1.6 });
        }
      }
      // Close to the bank they'd read as rows of dashes, so they fade out as she comes near.
      const far = smooth(4, 14, V.depth(p.x, p.y));
      if (far > 0.02) {
        ctx.fillStyle = `rgba(3,15,32,${(0.13 * far).toFixed(3)})`; ctx.fill(dark);
        ctx.fillStyle = `rgba(214,232,250,${(0.32 * far).toFixed(3)})`; ctx.fill(lit);
      }
    }
    // ── Bow buried in a dive: a mound of white water piled up over it and thrown out to each side ──
    const dive = p.dive ?? 0;
    if (dive > 0.3) {
      const f = dir(p.hdg), sd = { x: f.y, y: -f.x };
      const k = Math.min(1.3, (dive - 0.3) / 0.6);
      const c0 = { x: p.x + f.x * L * 0.44, y: p.y + f.y * L * 0.44 };
      // Soft-edged, like spray and foam, and steady (it swells and settles, it doesn't flicker).
      const swell = 1 + 0.08 * Math.sin(race.t * 6.5 + wb.i);
      const blob = (rx: number, ry: number, fwd: number, alpha: number) => {
        const c1 = { x: c0.x + f.x * fwd, y: c0.y + f.y * fwd };
        const pc = V.P(c1.x, c1.y, 0.01), px = V.P(c1.x + sd.x * rx, c1.y + sd.y * rx, 0.01), py = V.P(c1.x + f.x * ry, c1.y + f.y * ry, 0.01);
        if (Math.min(pc.z, px.z, py.z) < 0.4) return;
        const ax = Math.hypot(px.x - pc.x, px.y - pc.y), ay = Math.hypot(py.x - pc.x, py.y - pc.y);
        if (ax < 1 || ay < 0.3) return;
        ctx.save();
        ctx.translate(pc.x, pc.y); ctx.rotate(Math.atan2(px.y - pc.y, px.x - pc.x)); ctx.scale(1, Math.max(0.05, ay / ax));
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, ax);
        g.addColorStop(0, `rgba(250,253,255,${alpha.toFixed(3)})`); g.addColorStop(0.55, `rgba(238,246,255,${(alpha * 0.6).toFixed(3)})`); g.addColorStop(1, 'rgba(232,242,252,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, 0, ax, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      };
      blob(beam * (1.3 + 2.0 * k) * swell, L * (0.16 + 0.2 * k), L * 0.0, 0.34 * Math.min(1, k));
      blob(beam * (0.7 + 1.0 * k) * swell, L * (0.09 + 0.1 * k), L * 0.05, 0.8 * Math.min(1, k));
    }
    // ── Bow wave: white water peeling off both sides of the bow ──
    if (fast > 0.12) {
      const f = dir(p.hdg), sd = { x: f.y, y: -f.x };
      const at = (fx: number, side: number, off: number) => ({ x: p.x + f.x * fx * L + sd.x * side * off, y: p.y + f.y * fx * L + sd.y * side * off });
      const hw = beam / 2, flare = hw * (0.5 + 1.3 * fast), aft = 0.16 + 0.34 * fast;
      const soft = new Path2D(), white = new Path2D();
      for (const side of [1, -1]) {
        // A soft sheet of white, then the bright curl along the hull.
        const sheet = [at(0.49, side, 0.01), at(0.38, side, hw * 0.85), at(0.5 - aft * 0.6, side, hw + flare * 0.55), at(0.5 - aft, side, hw + flare), at(0.5 - aft * 1.05, side, hw + flare * 0.4), at(0.5 - aft * 0.7, side, hw * 0.9)];
        const curl = [at(0.49, side, 0.005), at(0.4, side, hw * 0.8), at(0.5 - aft * 0.55, side, hw + flare * 0.35), at(0.5 - aft * 0.6, side, hw * 0.95)];
        for (const [pth, ring] of [[soft, sheet], [white, curl]] as const) {
          const q = ring.map(pt => V.P(pt.x, pt.y, p.heave));
          if (q.some(qq => qq.z < 0.4)) continue;
          q.forEach((qq, k2) => (k2 ? pth.lineTo(qq.x, qq.y) : pth.moveTo(qq.x, qq.y)));
          pth.closePath();
        }
      }
      ctx.fillStyle = 'rgba(236,245,255,0.32)'; ctx.fill(soft);
      ctx.fillStyle = 'rgba(248,252,255,0.75)'; ctx.fill(white);
    }
  }
}
