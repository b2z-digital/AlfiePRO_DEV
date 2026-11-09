// Bank view: the race as a radio sailor sees it, standing in the control area on the bank and
// turning to follow their boat. A small perspective renderer on the 2D canvas: the sky and the far
// banks, the pond with its puffs, ripples and waves, the buoys and the start line, and every boat
// in 3D, heeled to the wind and moving on the waves, with mainsail and jib set to her sheet.
import type { Race } from '@/sim/engine';
import type { Boat } from '@/sim/types';
import { DEG, dir, n180 } from '@/sim/math';
import { noGoAngle } from '@/sim/classes';
import { wavePhase } from '@/sim/sea';
import type { WorldOverlay } from '@/sim/scene';

interface V2 { x: number; y: number }
interface Proj { x: number; y: number; z: number }

export interface BankCam {
  x: number; y: number; z: number;
  /** Compass heading the camera looks along, and how far down it looks (degrees). */
  yaw: number; pitch: number;
  /** Horizontal field of view, degrees. */
  fov: number;
  ready: boolean;
}

/** Eye height above the water: a skipper standing on a low bank. */
const EYE = 2.1;
const NEAR = 0.35;

export function newBankCam(): BankCam { return { x: 0, y: 0, z: EYE, yaw: 0, pitch: 3, fov: 50, ready: false }; }

/** The control area: a stretch of the right-hand bank (looking upwind), either side of the start line. */
export function controlArea(race: Race) {
  const c = race.course, B = c.bounds, L = c.L;
  const at = (along: number, across: number): V2 => ({ x: c.origin.x + c.up.x * along + c.right.x * across, y: c.origin.y + c.up.y * along + c.right.y * across });
  return { from: -8 * L, to: 14 * L, across: B.across + 1.2 * L, at };
}

/** Walk along the control area towards your boat and turn to keep her in view, glancing towards
 *  where she's going. Zoom narrows the view; it also narrows on its own when she's far off. */
export function followCam(cam: BankCam, race: Race, target: V2, dt: number, zoom: number, look: V2 | null, w: number) {
  const c = race.course, L = c.L;
  const ca = controlArea(race);
  const tAlong = (target.x - c.origin.x) * c.up.x + (target.y - c.origin.y) * c.up.y;
  const want = ca.at(Math.max(ca.from, Math.min(ca.to, tAlong)), ca.across);
  const snap = !cam.ready;
  const kWalk = snap ? 1 : Math.min(1, dt * 0.7);
  cam.x += (want.x - cam.x) * kWalk; cam.y += (want.y - cam.y) * kWalk;
  cam.z = EYE;
  const yawBoat = Math.atan2(target.x - cam.x, target.y - cam.y) / DEG;
  let yaw = yawBoat;
  if (look) {
    const yawLook = Math.atan2(look.x - cam.x, look.y - cam.y) / DEG;
    const lim = cam.fov * 0.22;
    yaw = yawBoat + Math.max(-lim, Math.min(lim, n180(yawLook - yawBoat) * 0.35));
  }
  const d = Math.hypot(target.x - cam.x, target.y - cam.y);
  // Keep your boat big enough to see: at least about 3% of the screen width long.
  const minPx = Math.max(16, Math.min(34, w * 0.025));
  const fovAuto = (2 * Math.atan((w * L) / (2 * minPx * Math.max(1, d)))) / DEG;
  const fov = Math.max(12, Math.min(75, Math.min(50 / zoom, fovAuto)));
  const pitch = (Math.atan2(cam.z, Math.max(1.5, d)) / DEG) * 0.82 + 0.4;
  if (snap) { cam.yaw = yaw; cam.pitch = pitch; cam.fov = fov; cam.ready = true; return; }
  cam.yaw += n180(yaw - cam.yaw) * Math.min(1, dt * 2.4);
  cam.pitch += (pitch - cam.pitch) * Math.min(1, dt * 2);
  cam.fov += (fov - cam.fov) * Math.min(1, dt * 2.5);
}

interface View {
  P: (x: number, y: number, z: number) => Proj;
  /** Screen points of a polygon on the water, clipped to what's in front of you. */
  ground: (pts: V2[]) => Proj[];
  /** Depth of a point on the water in front of the camera. */
  depth: (x: number, y: number) => number;
  F: number; w: number; h: number;
}

function makeView(cam: BankCam, w: number, h: number): View {
  const cy = Math.cos(cam.yaw * DEG), sy = Math.sin(cam.yaw * DEG);
  const cp = Math.cos(cam.pitch * DEG), sp = Math.sin(cam.pitch * DEG);
  // Camera basis: forward (looking down by the pitch), right, and up.
  const f = { x: sy * cp, y: cy * cp, z: -sp };
  const r = { x: cy, y: -sy };
  const u = { x: sy * sp, y: cy * sp, z: cp };
  const F = (w / 2) / Math.tan((cam.fov / 2) * DEG);
  const P = (x: number, y: number, z: number): Proj => {
    const dx = x - cam.x, dy = y - cam.y, dz = z - cam.z;
    const zc = dx * f.x + dy * f.y + dz * f.z;
    const xc = dx * r.x + dy * r.y;
    const yc = dx * u.x + dy * u.y + dz * u.z;
    const zz = Math.max(0.05, zc);
    return { x: w / 2 + (xc / zz) * F, y: h / 2 - (yc / zz) * F, z: zc };
  };
  const depth = (x: number, y: number) => (x - cam.x) * f.x + (y - cam.y) * f.y - cam.z * f.z;
  const ground = (pts: V2[]): Proj[] => {
    const out: Proj[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const za = depth(a.x, a.y) - NEAR, zb = depth(b.x, b.y) - NEAR;
      if (za >= 0) out.push(P(a.x, a.y, 0));
      if ((za >= 0) !== (zb >= 0)) { const k = za / (za - zb); out.push(P(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, 0)); }
    }
    return out;
  };
  return { P, ground, depth, F, w, h };
}

function hash(i: number, j: number) {
  let hh = (i * 374761393 + j * 668265263) | 0;
  hh = Math.imul(hh ^ (hh >>> 13), 1274126177);
  return ((hh ^ (hh >>> 16)) >>> 0) / 4294967296;
}

const FONT = "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', sans-serif";

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * k)), g = Math.min(255, Math.round(((n >> 8) & 255) * k)), b = Math.min(255, Math.round((n & 255) * k));
  return `rgb(${r},${g},${b})`;
}

function path(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], close = true) {
  ctx.beginPath();
  pts.forEach((q, k) => (k ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
  if (close) ctx.closePath();
}

/** A line on the water, clipped to what's in front of you. */
function groundLine(ctx: CanvasRenderingContext2D, V: View, pts: V2[], closed: boolean) {
  ctx.beginPath();
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const za = V.depth(a.x, a.y) - NEAR, zb = V.depth(b.x, b.y) - NEAR;
    if (za < 0 && zb < 0) continue;
    let a2 = a, b2 = b;
    if (za < 0) { const k = za / (za - zb); a2 = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }; }
    if (zb < 0) { const k = za / (za - zb); b2 = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }; }
    const p1 = V.P(a2.x, a2.y, 0.004), p2 = V.P(b2.x, b2.y, 0.004);
    ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
  }
  ctx.stroke();
}

function label(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color: string, size = 12, weight = 700) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(6,11,22,0.6)'; ctx.fillText(s, x + 0.8, y + 0.8);
  ctx.fillStyle = color; ctx.fillText(s, x, y);
}

/** How far a boat heels, degrees: + is to port, the way she leans on starboard tack. */
export function heelOf(b: { twa: number; tws: number; sheet: number; disabled?: boolean }): number {
  const a = Math.abs(b.twa);
  if (b.disabled) return 4 * Math.sign(b.twa || 1);
  const ng = noGoAngle(b.tws);
  const kn = b.tws / 0.514444;
  const power = a < ng ? 0.1 : Math.sin(Math.min(Math.PI, ((a - ng + 10) / 120) * Math.PI)) * (a > 140 ? 0.35 : 1);
  const trim = Math.max(0.2, Math.min(1, b.sheet * 1.2));
  const heel = Math.min(30, (4 + kn * 1.8) * power * trim);
  return b.twa >= 0 ? heel : -heel;
}

interface Rig { L: number; beam: number; mast: number; mastH: number; boomH: number; boom: number; jibTack: number; jib: number; hounds: number; free: number }

function rig(b: Boat): Rig {
  const L = b.cls.loa;
  const mastH = 1.65 * Math.pow(L, 0.92);
  return { L, beam: b.cls.beam, mast: 0.1 * L, mastH, boomH: 0.09 * L, boom: 0.39 * L, jibTack: 0.42 * L, jib: 0.29 * L, hounds: mastH * 0.8, free: 0.05 * L };
}

export interface BankOptions {
  w: number; h: number; dpr: number; cam: BankCam;
  /** What you're sailing to: drawn with its name, and pointed to when it's out of view. */
  next: { x: number; y: number; name: string } | null;
  showZones: boolean;
  preStart: boolean;
  flashes: { x: number; y: number; t: number }[];
  overlays?: WorldOverlay[];
  names?: boolean;
  /** Draw boats this many steps back in their history (instant replay). */
  back: number;
}

export function drawBank(ctx: CanvasRenderingContext2D, race: Race, v: BankOptions) {
  const { w, h, dpr, cam } = v;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const V = makeView(cam, w, h);
  const { P } = V;
  const c = race.course, B = c.bounds, L = c.L;
  const t = race.t;
  const twd = race.wind.meanTwd(t);
  const tws = race.wind.meanTws(t);
  const at = (al: number, ac: number): V2 => ({ x: c.origin.x + c.up.x * al + c.right.x * ac, y: c.origin.y + c.up.y * al + c.right.y * ac });
  const inPond = (x: number, y: number) => {
    const dx = x - c.origin.x, dy = y - c.origin.y;
    const al = dx * c.up.x + dy * c.up.y, ac = dx * c.right.x + dy * c.right.y;
    return al > B.alongMin && al < B.alongMax && Math.abs(ac) < B.across;
  };

  // ── Sky, haze and the land ──
  const fw = dir(cam.yaw);
  const hz = P(cam.x + fw.x * 4000, cam.y + fw.y * 4000, 0).y; // the horizon
  const sky = ctx.createLinearGradient(0, Math.min(0, hz - h), 0, Math.max(1, hz));
  sky.addColorStop(0, '#3F6FA8'); sky.addColorStop(0.7, '#8DB3D6'); sky.addColorStop(1, '#C9DCEB');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, Math.max(0, hz) + 1);
  const land = ctx.createLinearGradient(0, hz, 0, h);
  land.addColorStop(0, '#7E9C8C'); land.addColorStop(0.06, '#56744D'); land.addColorStop(1, '#3B5634');
  ctx.fillStyle = land;
  ctx.fillRect(0, Math.max(0, hz), w, h);

  // Distant tree line beyond the pond, then the pond itself.
  const pond = [at(B.alongMin, -B.across), at(B.alongMax, -B.across), at(B.alongMax, B.across), at(B.alongMin, B.across)];
  const trees = (back: number, n: number, hMin: number, hVar: number, color: string, seed: number) => {
    ctx.fillStyle = color;
    for (let e = 0; e < 4; e++) {
      const a = pond[e], b2 = pond[(e + 1) % 4];
      const ex = b2.x - a.x, ey = b2.y - a.y, el = Math.hypot(ex, ey) || 1;
      const out = { x: -ey / el, y: ex / el }; // the pond runs anticlockwise, so this points away from it
      for (let k = 0; k < n; k++) {
        const u = (k + hash(k, e + seed)) / n;
        const off = back * L * (1 + hash(e + seed, k) * 0.8);
        const gx = a.x + ex * u + out.x * off, gy = a.y + ey * u + out.y * off;
        const d = V.depth(gx, gy);
        if (d < 4) continue;
        const base = P(gx, gy, 0);
        if (base.x < -200 || base.x > w + 200) continue;
        const ht = hMin + hash(k + seed, e) * hVar;
        const top = P(gx, gy, ht);
        const wpx = Math.max(2, ((ht * (0.55 + hash(e, k + seed) * 0.5)) / d) * V.F);
        ctx.beginPath();
        ctx.ellipse(base.x, (base.y + top.y) / 2, wpx / 2, Math.max(1, (base.y - top.y) / 2), 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };
  // Check the pond runs the way `trees` expects (its outward normal), and flip it if not.
  {
    const a = pond[0], b2 = pond[1], cx0 = (pond[0].x + pond[2].x) / 2, cy0 = (pond[0].y + pond[2].y) / 2;
    const out = { x: -(b2.y - a.y), y: b2.x - a.x };
    if ((a.x - cx0) * out.x + (a.y - cy0) * out.y < 0) pond.reverse();
  }
  trees(16, 34, 7, 6, '#4E6E5A', 11);

  const water = V.ground(pond);
  if (water.length > 2) {
    const wg = ctx.createLinearGradient(0, hz, 0, h);
    wg.addColorStop(0, '#9DB8CF'); wg.addColorStop(0.035, '#5F86A8'); wg.addColorStop(0.25, '#2F577E'); wg.addColorStop(1, '#173A5E');
    ctx.fillStyle = wg;
    path(ctx, water); ctx.fill();
    ctx.strokeStyle = 'rgba(220,235,220,0.18)'; ctx.lineWidth = 1; ctx.stroke();
  }
  trees(4, 46, 3, 5, '#2F4A32', 3);

  // ── Puffs: darker patches of rippled water, stretched along the wind ──
  const wv = dir(twd), xv = { x: wv.y, y: -wv.x };
  for (const p of race.wind.puffs) {
    const life = Math.sin(Math.PI * Math.min(1, Math.max(0, p.age / p.life)));
    const a = Math.min(1, Math.abs(p.strength) * 3 + 0.2) * life;
    if (a < 0.04 || V.depth(p.x, p.y) < -p.r * 1.6) continue;
    for (const [sc, al] of [[1, 0.5], [0.62, 0.55]] as const) {
      const ring: V2[] = [];
      for (let k = 0; k < 22; k++) {
        const ang = (k / 22) * Math.PI * 2;
        const along = Math.cos(ang) * p.r * 1.5 * sc, acr = Math.sin(ang) * p.r * sc;
        ring.push({ x: p.x + wv.x * along + xv.x * acr, y: p.y + wv.y * along + xv.y * acr });
      }
      const q = V.ground(ring);
      if (q.length < 3) continue;
      ctx.fillStyle = p.strength > 0 ? `rgba(6,18,38,${0.5 * a * al})` : `rgba(215,232,255,${0.1 * a * al})`;
      path(ctx, q); ctx.fill();
    }
  }

  // ── Ripples and waves, fixed to the water: each one drifts downwind and fades in and out ──
  const sea = race.sea;
  const seaK = sea ? sea.height / 0.1 : 0;
  const drift = dir(twd + 180);
  const ripple = (cell: number, reach: number, len0: number, alpha: number) => {
    const i0 = Math.floor((cam.x - reach) / cell), i1 = Math.ceil((cam.x + reach) / cell);
    const j0 = Math.floor((cam.y - reach) / cell), j1 = Math.ceil((cam.y + reach) / cell);
    const flow = (t * Math.max(0.15, tws * 0.05)) / cell;
    ctx.beginPath();
    let crestPts = 0;
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const ph = (flow + hash(i, j)) % 1;
        const fade = Math.sin(Math.PI * ph);
        if (fade < 0.2) continue;
        const x = (i + hash(j, i + 5)) * cell + drift.x * ph * cell, y = (j + hash(i + 9, j)) * cell + drift.y * ph * cell;
        const d = V.depth(x, y);
        if (d < 0.8 || d > reach) continue;
        if (!inPond(x, y)) continue;
        let len = len0 * (0.6 + hash(i - 3, j + 1) * 0.8);
        if (sea) {
          const lift = (1 + Math.sin(wavePhase(sea, x, y, t))) / 2;
          if (lift < 0.45) continue;
          len *= 1 + 2.2 * seaK * lift;
          crestPts++;
        }
        const a1 = P(x - xv.x * len, y - xv.y * len, 0), a2 = P(x + xv.x * len, y + xv.y * len, 0);
        if (a1.x < -40 || a1.x > w + 40 || a1.y > h + 10) continue;
        ctx.moveTo(a1.x, a1.y); ctx.lineTo(a2.x, a2.y);
      }
    }
    ctx.strokeStyle = `rgba(222,236,255,${alpha * (sea ? 1.3 : 1)})`;
    ctx.stroke();
    return crestPts;
  };
  ctx.lineWidth = 1; ctx.lineCap = 'round';
  ripple(0.7, 11, 0.12, 0.16);
  ripple(2.6, 70, 0.4, 0.11);
  // Whitecaps in rough water.
  if (sea && sea.kind === 'rough') {
    ctx.fillStyle = 'rgba(240,248,255,0.5)';
    const cell = 1.6;
    for (let i = Math.floor((cam.x - 40) / cell); i <= Math.ceil((cam.x + 40) / cell); i++) {
      for (let j = Math.floor((cam.y - 40) / cell); j <= Math.ceil((cam.y + 40) / cell); j++) {
        if (hash(i * 3, j * 7) < 0.82) continue;
        const x = (i + hash(j, i)) * cell, y = (j + hash(i, j + 2)) * cell;
        const d = V.depth(x, y);
        if (d < 1 || d > 40 || !inPond(x, y)) continue;
        if (Math.sin(wavePhase(sea, x, y, t)) < 0.92) continue;
        const q = P(x, y, 0.01);
        const rr = Math.max(0.8, (0.09 / d) * V.F);
        ctx.beginPath(); ctx.ellipse(q.x, q.y, rr * 1.6, rr * 0.45, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  // ── The course: start line, zone, teaching marks ──
  ctx.lineCap = 'butt';
  ctx.setLineDash([9, 7]);
  ctx.strokeStyle = v.preStart ? 'rgba(255,190,80,0.9)' : 'rgba(255,190,80,0.5)';
  ctx.lineWidth = 1.6;
  groundLine(ctx, V, [c.start.pin, c.start.stbd], false);
  if (v.showZones && v.next) {
    const ring: V2[] = [];
    for (let k = 0; k < 40; k++) { const ang = (k / 40) * Math.PI * 2; ring.push({ x: v.next.x + Math.cos(ang) * 4 * L, y: v.next.y + Math.sin(ang) * 4 * L }); }
    ctx.setLineDash([6, 6]); ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.2;
    groundLine(ctx, V, ring, true);
  }
  for (const ov of v.overlays ?? []) {
    ctx.setLineDash([6, 5]); ctx.strokeStyle = 'rgba(77,163,255,0.9)'; ctx.lineWidth = 1.6;
    if (ov.kind === 'segment') groundLine(ctx, V, [{ x: ov.x1, y: ov.y1 }, { x: ov.x2, y: ov.y2 }], false);
    else {
      const ring: V2[] = [];
      for (let k = 0; k < 28; k++) { const ang = (k / 28) * Math.PI * 2; ring.push({ x: ov.x + Math.cos(ang) * ov.r, y: ov.y + Math.sin(ang) * ov.r }); }
      groundLine(ctx, V, ring, true);
    }
  }
  ctx.setLineDash([]);
  // Incident flashes: a ring spreading on the water.
  for (const fl of v.flashes) {
    const age = t - fl.t;
    if (age < 0 || age > 1.6) continue;
    const ring: V2[] = [];
    const rr = (0.6 + age * 2.2) * L;
    for (let k = 0; k < 28; k++) { const ang = (k / 28) * Math.PI * 2; ring.push({ x: fl.x + Math.cos(ang) * rr, y: fl.y + Math.sin(ang) * rr }); }
    ctx.strokeStyle = `rgba(255,120,90,${0.9 * (1 - age / 1.6)})`; ctx.lineWidth = 2.2;
    groundLine(ctx, V, ring, true);
  }

  // ── Everything standing on the water, far to near: buoys and boats ──
  type Item = { z: number; draw: () => void };
  const items: Item[] = [];
  const nextAt = v.next;
  for (const m of c.marks) {
    const base = P(m.p.x, m.p.y, 0);
    if (base.z < NEAR) continue;
    const isNext = !!nextAt && Math.hypot(nextAt.x - m.p.x, nextAt.y - m.p.y) < 0.01;
    items.push({ z: base.z, draw: () => {
      const bob = sea ? sea.height * 0.4 * Math.sin(wavePhase(sea, m.p.x, m.p.y, t)) : 0;
      const b0 = P(m.p.x, m.p.y, bob), top = P(m.p.x, m.p.y, bob + 0.34);
      const rpx = Math.max(2.2, (m.r / base.z) * V.F);
      const hgt = Math.max(4, b0.y - top.y);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(b0.x, b0.y, rpx * 1.25, Math.max(1, rpx * 0.3), 0, 0, Math.PI * 2); ctx.fill();
      const gr = ctx.createLinearGradient(b0.x - rpx, 0, b0.x + rpx, 0);
      const pin = m.kind === 'pin' || m.kind === 'start-stbd';
      gr.addColorStop(0, pin ? '#C9A21A' : '#D96B16'); gr.addColorStop(0.45, pin ? '#FFE266' : '#FFB061'); gr.addColorStop(1, pin ? '#B08A10' : '#C25F14');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.moveTo(b0.x - rpx, b0.y);
      ctx.lineTo(b0.x - rpx * 0.5, b0.y - hgt);
      ctx.lineTo(b0.x + rpx * 0.5, b0.y - hgt);
      ctx.lineTo(b0.x + rpx, b0.y);
      ctx.closePath(); ctx.fill();
      const name = m.kind === 'pin' ? 'Pin' : m.kind === 'start-stbd' ? 'Start' : m.label === '1' ? 'Mark 1' : m.label;
      if (isNext) {
        const yy = b0.y - hgt - 12;
        ctx.fillStyle = '#9CCBFF';
        ctx.beginPath(); ctx.moveTo(b0.x - 5, yy - 5); ctx.lineTo(b0.x + 5, yy - 5); ctx.lineTo(b0.x, yy + 1); ctx.closePath(); ctx.fill();
        label(ctx, name, b0.x, yy - 14, '#CFE5FF', 12.5);
      } else if (base.z < 80) label(ctx, name, b0.x, b0.y - hgt - 10, 'rgba(255,255,255,0.8)', 11.5, 600);
    } });
  }
  race.boats.forEach((b, i) => {
    const H = race.hist[i];
    const kk = H.x.length - 1 - v.back;
    const live = v.back <= 0 || kk < 0;
    const bx = live ? b.x : H.x[kk], by = live ? b.y : H.y[kk], bh = live ? b.hdg : H.hdg[kk];
    const d = V.depth(bx, by);
    if (d < 0.7) return;
    items.push({ z: d, draw: () => drawBoat3d(ctx, V, race, b, bx, by, bh, live ? b.spd : H.spd[kk], d, H, v) });
  });
  items.sort((a, b) => b.z - a.z);
  for (const it of items) it.draw();

  // ── Where's the mark? An arrow at the edge of the view when it's out of sight ──
  if (nextAt) {
    const q = P(nextAt.x, nextAt.y, 0.3);
    const off = q.z < NEAR || q.x < 24 || q.x > w - 24 || q.y < 24 || q.y > h - 24;
    if (off) {
      // Direction to it on screen; behind you, it's to whichever side is nearer.
      let dx = q.x - w / 2, dy = q.y - h / 2;
      if (q.z < NEAR) { const side = n180(Math.atan2(nextAt.x - cam.x, nextAt.y - cam.y) / DEG - cam.yaw); dx = side >= 0 ? 1 : -1; dy = 0; }
      const k = Math.min((w / 2 - 40) / Math.max(1e-6, Math.abs(dx)), (h / 2 - 70) / Math.max(1e-6, Math.abs(dy)));
      const ax = w / 2 + dx * k, ay = h / 2 + dy * k;
      const ang = Math.atan2(dy, dx);
      ctx.save();
      ctx.translate(ax, ay); ctx.rotate(ang);
      ctx.fillStyle = 'rgba(7,13,27,0.75)';
      ctx.beginPath(); ctx.arc(0, 0, 17, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#9CCBFF';
      ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-5, -7); ctx.lineTo(-2, 0); ctx.lineTo(-5, 7); ctx.closePath(); ctx.fill();
      ctx.restore();
      label(ctx, nextAt.name.replace(/^the /, ''), Math.max(60, Math.min(w - 60, ax)), ay + (ay > h / 2 ? -28 : 28), '#CFE5FF', 12);
    }
  }
}

function drawBoat3d(ctx: CanvasRenderingContext2D, V: View, race: Race, b: Boat, bx: number, by: number, bh: number, spd: number, d: number, H: { x: number[]; y: number[] }, v: BankOptions) {
  const { P } = V;
  const g = rig(b);
  const t = race.t;
  const sea = race.sea;
  const twa = n180(b.twd - bh);
  let heel = heelOf({ twa, tws: b.tws, sheet: b.sheet, disabled: b.disabled });
  // On the waves: heave, and pitch and roll with the slope of the water.
  let heave = 0, pitch = 0;
  if (sea) {
    const ph = wavePhase(sea, bx, by, t);
    heave = sea.height * 0.5 * Math.sin(ph);
    const slope = ((2 * Math.PI) / sea.length) * sea.height * 0.5 * Math.cos(ph);
    const rel = (bh - (sea.from + 180)) * DEG; // heading against the way the waves travel
    pitch = Math.atan(slope * Math.cos(rel)) * 0.8;
    heel += (Math.atan(-slope * Math.sin(rel)) / DEG) * 0.6;
  }
  const hr = heel * DEG, cr = Math.cos(hr), sr = Math.sin(hr), cpt = Math.cos(pitch), spt = Math.sin(pitch);
  const ch = Math.cos(bh * DEG), sh = Math.sin(bh * DEG);
  // Boat frame: x forward, y to starboard, z up. Pitch (bow up +) then heel (to port +).
  const W = (lx: number, ly: number, lz: number): Proj => {
    const x1 = lx * cpt - lz * spt, z1 = lx * spt + lz * cpt;
    const y2 = ly * cr - z1 * sr, z2 = ly * sr + z1 * cr;
    return P(bx + x1 * sh + y2 * ch, by + x1 * ch - y2 * sh, Math.max(-0.03, z2 + heave));
  };
  const size = (V.F * g.L) / Math.max(0.5, d); // hull length on screen, px
  const alpha = b.finished ? 0.5 : 1;
  ctx.save();
  ctx.globalAlpha = alpha;

  // Wake.
  const n = H.x.length - v.back;
  if (n > 6 && size > 5) {
    ctx.strokeStyle = 'rgba(235,245,255,0.3)'; ctx.lineWidth = Math.max(1, size * 0.025);
    ctx.beginPath();
    let first = true;
    for (let k = Math.max(0, n - 70); k < n; k += 3) {
      const q = P(H.x[k], H.y[k], 0);
      if (q.z < NEAR) { first = true; continue; }
      if (first) { ctx.moveTo(q.x, q.y); first = false; } else ctx.lineTo(q.x, q.y);
    }
    ctx.stroke();
  }

  // Hull: deck and waterline outlines, the topsides between them.
  const half = g.beam / 2;
  const plan: [number, number][] = [
    [0.5, 0], [0.4, 0.42], [0.22, 0.84], [0, 1], [-0.22, 0.97], [-0.4, 0.86], [-0.5, 0.7],
    [-0.5, -0.7], [-0.4, -0.86], [-0.22, -0.97], [0, -1], [0.22, -0.84], [0.4, -0.42],
  ];
  const deck = plan.map(([x, y]) => W(x * g.L, y * half, g.free));
  const wl = plan.map(([x, y]) => W(x * g.L * 0.96, y * half * 0.82, 0));
  ctx.fillStyle = 'rgba(4,14,30,0.3)';
  path(ctx, wl.map(q => ({ x: q.x + size * 0.03, y: q.y + size * 0.012 }))); ctx.fill();
  ctx.fillStyle = shade(b.color, 0.6);
  for (let k = 0; k < plan.length; k++) {
    const k2 = (k + 1) % plan.length;
    path(ctx, [deck[k], deck[k2], wl[k2], wl[k]]); ctx.fill();
  }
  ctx.fillStyle = b.color;
  path(ctx, deck); ctx.fill();
  ctx.strokeStyle = b.isPlayer ? 'rgba(255,255,255,0.95)' : 'rgba(10,20,40,0.55)'; ctx.lineWidth = b.isPlayer ? 1.4 : 0.8; ctx.stroke();
  // Bow wave, and spray when she's punching into waves.
  const fast = spd / Math.max(0.1, b.cls.hullSpeed);
  if (fast > 0.35 && size > 8) {
    ctx.strokeStyle = `rgba(240,248,255,${Math.min(0.75, (fast - 0.35) * 1.4)})`; ctx.lineWidth = Math.max(1, size * 0.02);
    for (const sd of [1, -1]) {
      const p0 = W(0.47 * g.L, 0, 0), p1 = W(0.25 * g.L, sd * half * 1.25, 0), p2 = W(0.05 * g.L, sd * half * 1.6, 0);
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.quadraticCurveTo(p1.x, p1.y, p2.x, p2.y); ctx.stroke();
    }
  }
  if (sea && pitch < -0.12 && fast > 0.4 && size > 10) {
    ctx.fillStyle = 'rgba(240,248,255,0.6)';
    for (let k = 0; k < 5; k++) {
      const q = W(0.45 * g.L + hash(k, Math.floor(t * 8)) * 0.05 * g.L, (hash(Math.floor(t * 8), k) - 0.5) * g.beam, 0.03 + hash(k, 3) * 0.06);
      ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(0.8, size * 0.012), 0, Math.PI * 2); ctx.fill();
    }
  }

  // Sails: one sheet sets both, as on a radio yacht. Running deep with the sheet eased, the jib
  // goose-wings out on the other side.
  const a = Math.abs(twa);
  const ease = 1 - Math.min(1, Math.max(0, b.disabled ? 0 : b.sheet));
  const maxBoom = 8 + ease * 82;
  const natural = Math.min(88, Math.max(0, a - 4));
  const boom = Math.min(maxBoom, natural);
  const luff = !!b.disabled || maxBoom > natural + 6 || a < noGoAngle(b.tws) + 2;
  const side = twa >= 0 ? -1 : 1; // starboard tack: sails out to port (negative y)
  const goose = a > 156 && ease > 0.6 && !luff;
  const flutter = (k: number) => (luff ? Math.sin(t * 23 + k * 1.7 + bx * 3) * 0.035 * g.L : 0);
  const sail = (tackX: number, headX: number, tackZ: number, headZ: number, len: number, ang: number, sd: number, twist: number) => {
    const steps = 6;
    const luffPts: Proj[] = [], leech: Proj[] = [], mids: Proj[][] = [];
    for (let k = 0; k <= steps; k++) {
      const f = k / steps;
      const z = tackZ + (headZ - tackZ) * f;
      const lx = tackX + (headX - tackX) * f;
      luffPts.push(W(lx, 0, z));
      const chord = len * (1 - f) * (1 - 0.12 * f) + 0.035 * g.L * f;
      const angK = (ang + twist * f) * DEG;
      leech.push(W(lx - Math.cos(angK) * chord + flutter(k), sd * Math.sin(angK) * chord + flutter(k + 3), z * 0.985));
      // Draft: the deepest point of the curve, 40% back and a tenth of the chord to leeward.
      if (k === 2 || k === 4) {
        const camber = luff ? 0.02 : 0.1;
        const mx = lx - Math.cos(angK) * chord * 0.4 + Math.sin(angK) * chord * camber;
        const my = sd * (Math.sin(angK) * chord * 0.4 + Math.cos(angK) * chord * camber);
        mids.push([luffPts[k], W(mx, my, z), leech[k]]);
      }
    }
    const pts = [...luffPts, ...leech.reverse()];
    ctx.fillStyle = luff ? 'rgba(232,238,248,0.85)' : 'rgba(250,252,255,0.95)';
    path(ctx, pts); ctx.fill();
    ctx.strokeStyle = 'rgba(30,40,60,0.35)'; ctx.lineWidth = 0.8; ctx.stroke();
    if (size > 18) {
      ctx.strokeStyle = 'rgba(40,60,90,0.18)'; ctx.lineWidth = 1;
      for (const [p0, pm, p1] of mids) { ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.quadraticCurveTo(2 * pm.x - (p0.x + p1.x) / 2, 2 * pm.y - (p0.y + p1.y) / 2, p1.x, p1.y); ctx.stroke(); }
    }
    return leech[leech.length - 1]; // the clew
  };
  const jibAng = goose ? Math.min(85, maxBoom) : Math.min(maxBoom * 1.08 + 2, natural + 2);
  const jibSide = goose ? -side : side;
  // Draw the sail further from you first.
  const jibMid = W(g.jibTack - 0.1 * g.L, jibSide * 0.08 * g.L, g.hounds * 0.4), mainMid = W(g.mast - 0.15 * g.L, side * 0.1 * g.L, g.mastH * 0.4);
  const drawJib = () => sail(g.jibTack, g.mast + 0.02 * g.L, g.free + 0.02 * g.L, g.hounds, g.jib, jibAng, jibSide, 6);
  const drawMain = () => sail(g.mast, g.mast, g.boomH, g.mastH, g.boom, boom, side, 10);
  let clew: Proj;
  if (jibMid.z > mainMid.z) { drawJib(); clew = drawMain(); } else { clew = drawMain(); drawJib(); }
  // Mast and boom.
  const m0 = W(g.mast, 0, g.free), m1 = W(g.mast, 0, g.mastH);
  ctx.strokeStyle = 'rgba(40,46,60,0.9)'; ctx.lineWidth = Math.max(1, size * 0.012);
  ctx.beginPath(); ctx.moveTo(m0.x, m0.y); ctx.lineTo(m1.x, m1.y); ctx.stroke();
  const b0 = W(g.mast, 0, g.boomH);
  ctx.lineWidth = Math.max(1, size * 0.01);
  ctx.beginPath(); ctx.moveTo(b0.x, b0.y); ctx.lineTo(clew.x, clew.y); ctx.stroke();
  // Sail number on the main, once she's close enough to read it.
  if (size > 26) {
    const sp = W(g.mast - g.boom * 0.42 * Math.cos(boom * DEG), side * Math.sin(boom * DEG) * g.boom * 0.42, g.mastH * 0.52);
    ctx.font = `800 ${Math.round(Math.min(28, size * 0.15))}px ${FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = b.isPlayer ? '#1D4ED8' : 'rgba(20,30,50,0.85)';
    ctx.fillText(b.sail, sp.x, sp.y);
  }
  ctx.restore();

  // Labels over the masthead.
  const top = W(g.mast, 0, g.mastH * 1.06);
  if (b.isPlayer) {
    ctx.fillStyle = '#4DA3FF';
    ctx.beginPath(); ctx.moveTo(top.x - 6, top.y - 12); ctx.lineTo(top.x + 6, top.y - 12); ctx.lineTo(top.x, top.y - 5); ctx.closePath(); ctx.fill();
    label(ctx, 'You', top.x, top.y - 22, '#FFFFFF', 13);
  } else if (size > 9) {
    label(ctx, v.names && b.name && b.name !== b.sail ? `${b.name} · ${b.sail}` : b.sail, top.x, top.y - 9, 'rgba(255,255,255,0.85)', 11.5, 600);
  }
  if (b.hail && t - b.hail.t < 2.6 && v.back === 0) {
    ctx.font = `600 13px ${FONT}`;
    const tw = ctx.measureText(b.hail.text).width + 18;
    const yy = top.y - (b.isPlayer ? 46 : 32);
    ctx.fillStyle = /protest/i.test(b.hail.text) ? 'rgba(127,29,29,0.92)' : 'rgba(7,13,27,0.88)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(top.x - tw / 2, yy - 12, tw, 24, 8); else ctx.rect(top.x - tw / 2, yy - 12, tw, 24);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(b.hail.text, top.x, yy + 0.5);
  }
  const bottom = W(0, 0, 0);
  if (b.penalty.owed > 0 || (b.ocs && !b.started && t >= race.gunT)) label(ctx, b.ocs && !b.started ? 'OCS' : 'Penalty', bottom.x, bottom.y + 13, b.ocs && !b.started ? '#FCA5A5' : '#FFCB96', 11, 700);
  if (b.disabled) label(ctx, 'Out of control', bottom.x, bottom.y + 13, '#FCA5A5', 11, 700);
}
