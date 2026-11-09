// Boats in 3D for the bank view: hulls from the real lines and rigs from the sail plans, drawn in
// perspective on the 2D canvas. The IOM hull is the LM3 hull and deck plug (measured every 5%), its
// A, B and C rigs come from the IOM sail measurements; the 10 Rater is the GothiX 10r; the
// Marblehead is the Gothic M with a swing rig. DF95 and DF65 are scaled from the IOM for now.
// Same model as the design board renders.
import type { ClassId } from '@/sim/classes';
import { noGoAngle } from '@/sim/classes';
import { DEG, n180 } from '@/sim/math';
import type { Sea } from '@/sim/sea';
import { wavePhase } from '@/sim/sea';

export type RigId = 'A' | 'B' | 'C';

/** One station: fx (fraction of the length forward of amidships), half-beams and heights in metres. */
interface Station { fx: number; lowHw: number; lowZ: number; mbHw: number; mbZ: number; deHw: number; deZ: number; crownZ: number }

interface Rig {
  mastX: number; mastH: number; boomH: number; mainLuff: number; boom: number; roach: number; head: number;
  jibX: number; jibGap: number; hounds: number; jibLuff: number; jibFoot: number; jibHead: number; num: number;
  mainBattens: number[]; jibBattens: number[]; swing?: boolean; jibJ?: number; tackZ?: number;
}

interface Model { L: number; beam: number; stations: Station[]; hatches: [number, number, number][]; rigs: { A: Rig; B?: Rig; C?: Rig } }

function iomStations(scale = 1): Station[] {
  // LM3 hull and deck plug (mm): max half-beam and its height, waterline half-beam, deck crown.
  const mb = [7.4, 30.7, 44.9, 54.7, 62.9, 69.5, 75.0, 79.4, 82.6, 85.0, 86.3, 86.7, 86.4, 85.6, 84.4, 82.7, 80.6, 78.2, 75.4, 72.1, 68.9];
  const mbz = [18.5, 18.5, 19.1, 18.9, 19.2, 19.1, 19.4, 18.9, 20.4, 20.7, 19.7, 20.7, 20.4, 20.6, 21.3, 22.4, 24.0, 25.8, 26.3, 28.3, 29.6];
  const wl = [3.9, 21.4, 35.5, 46.3, 55.6, 62.7, 69.2, 74.1, 78.2, 80.7, 81.8, 82.7, 82.4, 81.6, 79.8, 77.6, 74.2, 69.6, 64.2, 52.8, 24.9];
  const crown = [83, 76.7, 73.6, 70.4, 67.3, 64.8, 64.8, 61.8, 61.8, 60.5, 58.5, 56, 53, 51, 49.5, 47.5, 45.5, 43.5, 42, 41, 40];
  const k = scale / 990;
  return mb.map((_, i) => {
    const dez = mbz[i] + (crown[i] - mbz[i]) * 0.55;
    return { fx: 0.5 - i * 0.05, lowHw: wl[i] * k, lowZ: 0, mbHw: mb[i] * k, mbZ: mbz[i] * k, deHw: mb[i] * 0.94 * k, deZ: dez * k, crownZ: crown[i] * k };
  });
}

function fromTable(fx: number[], hb: number[], dez: number[], cz: number[], low: [number, number][], half: number): Station[] {
  return fx.map((f, i) => ({ fx: f, lowHw: low[i][0] * half, lowZ: low[i][1], mbHw: hb[i] * half, mbZ: dez[i] * 0.45, deHw: hb[i] * half * 0.985, deZ: dez[i], crownZ: cz[i] }));
}

const IOM_A: Rig = { mastX: 0.04, mastH: 1.72, boomH: 0.06, mainLuff: 1.6, boom: 0.355, roach: 0.59, head: 0.02, jibX: 0.45, jibGap: 0.025, hounds: 1.28, jibLuff: 1.325, jibFoot: 0.38, jibHead: 0.02, num: 110, mainBattens: [0.25, 0.5, 0.75], jibBattens: [0.33, 0.67] };
const scaleRig = (r: Rig, k: number, kx = k): Rig => ({ ...r, mastH: r.mastH * k, boomH: r.boomH * k, mainLuff: r.mainLuff * k, boom: r.boom * k, head: r.head * k, hounds: r.hounds * k, jibLuff: r.jibLuff * k, jibFoot: r.jibFoot * k, jibHead: r.jibHead * k, num: r.num * Math.sqrt(k), jibGap: r.jibGap * kx });

const MODELS: Record<ClassId, Model> = {
  IOM: {
    L: 1.0, beam: 0.1735, stations: iomStations(), hatches: [[-0.02, 0.13, 0.6], [-0.3, 0.08, 0.42]],
    rigs: {
      A: IOM_A,
      B: { ...IOM_A, mastH: 1.3, mainLuff: 1.18, boom: 0.345, roach: 0.55, hounds: 0.96, jibX: 0.415, jibLuff: 0.985, jibFoot: 0.345, num: 100 },
      C: { ...IOM_A, mastH: 1.0, mainLuff: 0.88, boom: 0.315, roach: 0.54, hounds: 0.715, jibX: 0.365, jibLuff: 0.735, jibFoot: 0.295, num: 90 },
    },
  },
  '10R': {
    L: 1.6, beam: 0.18, hatches: [[-0.45, 0.06, 0.42], [-0.27, 0.19, 0.62], [0.06, 0.12, 0.7], [0.19, 0.075, 0.55]],
    stations: fromTable(
      [0.5, 0.46, 0.42, 0.38, 0.33, 0.27, 0.2, 0.1, 0.0, -0.1, -0.2, -0.3, -0.38, -0.44, -0.5],
      [0.02, 0.2, 0.36, 0.5, 0.63, 0.75, 0.85, 0.95, 0.995, 1.0, 0.97, 0.9, 0.8, 0.7, 0.58],
      [0.096, 0.093, 0.09, 0.087, 0.084, 0.081, 0.078, 0.074, 0.07, 0.066, 0.062, 0.058, 0.055, 0.052, 0.05],
      [0.1, 0.108, 0.112, 0.112, 0.111, 0.108, 0.104, 0.096, 0.086, 0.077, 0.07, 0.064, 0.059, 0.055, 0.052],
      [[0.004, 0.016], [0.03, 0.01], [0.07, 0.004], [0.06, 0.0], [0.6, 0.0], [0.73, 0.0], [0.83, 0.0], [0.93, 0.0], [0.96, 0.0], [0.96, 0.0], [0.92, 0.0], [0.82, 0.0], [0.62, 0.0], [0.5, 0.01], [0.42, 0.02]], 0.09),
    rigs: { A: { mastX: 0.045, mastH: 2.17, boomH: 0.1, mainLuff: 2.01, boom: 0.45, roach: 0.86, head: 0.06, jibX: 0.27, jibGap: 0.025, hounds: 1.785, jibLuff: 1.485, jibFoot: 0.455, jibHead: 0.02, num: 150, mainBattens: [0.2, 0.4, 0.6, 0.8], jibBattens: [0.33, 0.67] } },
  },
  M: {
    L: 1.27, beam: 0.16, hatches: [[-0.33, 0.2, 0.5], [0.02, 0.07, 0.4], [0.16, 0.16, 0.55]],
    stations: fromTable(
      [0.5, 0.455, 0.4, 0.3, 0.2, 0.1, 0.0, -0.1, -0.2, -0.3, -0.4, -0.5],
      [0.02, 0.36, 0.6, 0.85, 0.95, 0.99, 1.0, 1.0, 0.97, 0.9, 0.74, 0.52],
      [0.095, 0.092, 0.089, 0.084, 0.079, 0.075, 0.071, 0.067, 0.063, 0.059, 0.055, 0.051],
      [0.1, 0.104, 0.106, 0.104, 0.099, 0.092, 0.084, 0.076, 0.069, 0.063, 0.058, 0.053],
      [[0.01, 0.004], [0.3, 0.0], [0.56, 0.0], [0.82, 0.0], [0.93, 0.0], [0.97, 0.0], [0.98, 0.0], [0.98, 0.0], [0.95, 0.0], [0.87, 0.0], [0.7, 0.0], [0.46, 0.004]], 0.08),
    rigs: { A: { mastX: 0.01, mastH: 2.1, boomH: 0.09, mainLuff: 1.85, boom: 0.33, roach: 0.62, head: 0.03, jibX: 0, jibGap: 0, hounds: 1.6, jibLuff: 1.42, jibFoot: 0.3, jibHead: 0.015, num: 125, mainBattens: [0.25, 0.5, 0.75], jibBattens: [0.4], swing: true, jibJ: 0.33, tackZ: 0.09 } },
  },
  DF95: { L: 0.95, beam: 0.165, stations: iomStations(0.95), hatches: [[-0.02, 0.13, 0.6], [-0.3, 0.08, 0.42]], rigs: { A: scaleRig(IOM_A, 0.93, 0.95) } },
  DF65: { L: 0.65, beam: 0.115, stations: iomStations(0.65), hatches: [[0.0, 0.16, 0.6]], rigs: { A: scaleRig(IOM_A, 0.66, 0.65) } },
};

/** The rig a class sails with in this wind: IOMs change down to the B rig when it's fresh. */
export function rigFor(cls: ClassId, wind: 'light' | 'medium' | 'fresh'): RigId {
  return cls === 'IOM' && wind === 'fresh' ? 'B' : 'A';
}

function deckAt(m: Model, fx: number): number {
  const st = m.stations;
  if (fx >= st[0].fx) return st[0].crownZ;
  for (let k = 0; k < st.length - 1; k++) {
    if (st[k].fx >= fx && fx >= st[k + 1].fx) {
      const u = (st[k].fx - fx) / Math.max(1e-6, st[k].fx - st[k + 1].fx);
      return st[k].crownZ + (st[k + 1].crownZ - st[k].crownZ) * u;
    }
  }
  return st[st.length - 1].crownZ;
}

export interface Pose {
  cls: ClassId; rig: RigId;
  x: number; y: number; hdg: number;
  /** + heels to port (the starboard-tack lean). */
  heel: number; pitch: number; heave: number;
  /** Sails out to starboard (+1) or port (-1). */
  sd: 1 | -1;
  boom: number; jib: number; goose: boolean; luff: boolean;
  color: string; tape: string; ink: string; deck: string;
  sail: string; country: string;
  spd: number; hullSpeed: number;
  isPlayer: boolean; alpha: number;
}

export interface Projector {
  (x: number, y: number, z: number): { x: number; y: number; z: number };
}

type V3 = [number, number, number];
const SUN: V3 = [-0.557, 0.321, 0.766];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

function shade(hex: string, k: number): string {
  const v = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((v >> 16) & 255) * k)), g = Math.min(255, Math.round(((v >> 8) & 255) * k)), b = Math.min(255, Math.round((v & 255) * k));
  return `rgb(${r},${g},${b})`;
}

/** How the sails sit for a true wind angle and sheet, as on the top view: both off one sheet. */
export function sailSet(twa: number, sheet: number, tws: number, disabled: boolean) {
  const a = Math.abs(twa);
  const ease = 1 - Math.min(1, Math.max(0, disabled ? 0 : sheet));
  const maxBoom = 8 + ease * 82;
  const natural = Math.min(88, Math.max(0, a - 4));
  const boom = Math.min(maxBoom, natural);
  const luff = disabled || maxBoom > natural + 6 || a < noGoAngle(tws) + 2;
  const goose = a > 156 && ease > 0.6 && !luff;
  const jib = goose ? Math.min(85, maxBoom) : Math.min(maxBoom * 1.08 + 2, natural + 2);
  return { boom, jib, luff, goose, sd: (twa >= 0 ? -1 : 1) as 1 | -1 };
}

/** Lift, pitch and roll on the waves. */
export function onWaves(p: Pose, sea: Sea | null, t: number): Pose {
  if (!sea) return p;
  const ph = wavePhase(sea, p.x, p.y, t);
  const slope = ((2 * Math.PI) / sea.length) * (sea.height / 2) * Math.cos(ph);
  const rel = (p.hdg - (sea.from + 180)) * DEG;
  return { ...p, heave: (sea.height / 2) * Math.sin(ph), pitch: (Math.atan(slope * Math.cos(rel)) / DEG) * 0.8, heel: p.heel + (Math.atan(-slope * Math.sin(rel)) / DEG) * 0.6 };
}

class Geo {
  readonly m: Model; readonly r: Rig;
  private ch: number; private sh: number; private cp: number; private sp: number; private cr: number; private sr: number;
  constructor(readonly p: Pose) {
    this.m = MODELS[p.cls] ?? MODELS.IOM;
    this.r = this.m.rigs[p.rig] ?? this.m.rigs.A;
    this.ch = Math.cos(p.hdg * DEG); this.sh = Math.sin(p.hdg * DEG);
    this.cp = Math.cos(p.pitch * DEG); this.sp = Math.sin(p.pitch * DEG);
    this.cr = Math.cos(p.heel * DEG); this.sr = Math.sin(p.heel * DEG);
  }
  /** Local (x forward, y to starboard, z up) to the world. */
  w(lx: number, ly: number, lz: number): V3 {
    const x1 = lx * this.cp - lz * this.sp, z1 = lx * this.sp + lz * this.cp;
    const y2 = ly * this.cr - z1 * this.sr, z2 = ly * this.sr + z1 * this.cr;
    return [this.p.x + x1 * this.sh + y2 * this.ch, this.p.y + x1 * this.ch - y2 * this.sh, z2 + this.p.heave];
  }
  /** Sail surface: f up the sail, g along the chord from the luff. */
  sail(kind: 'main' | 'jib'): { S: (f: number, g: number) => V3; ang: number; sd: number } {
    const { m, r, p } = this;
    const L = m.L;
    const deck = deckAt(m, r.mastX);
    let x0: number, y0 = 0, z0: number, x1: number, y1 = 0, z1: number, foot: number, ang: number, roach: number, head: number, twist: number, depth: number, sd: number;
    if (kind === 'main') {
      x0 = r.mastX * L; z0 = deck + r.boomH; z1 = z0 + r.mainLuff; x1 = x0 - 0.018 * L;
      foot = r.boom; ang = p.boom; roach = r.roach; head = r.head; twist = 11; depth = p.luff ? 0.015 : 0.09; sd = p.sd;
    } else {
      const hx = r.mastX * L, hz = deck + r.hounds;
      let tx: number, ty: number, tz: number;
      if (r.swing) {
        const a0 = p.boom * DEG;
        tx = r.mastX * L + Math.cos(a0) * (r.jibJ ?? 0.3); ty = -p.sd * Math.sin(a0) * (r.jibJ ?? 0.3); tz = deck + (r.tackZ ?? 0.08);
      } else {
        tx = r.jibX * L; ty = 0;
        // The jib boom sits clear of the deck: a small gap over the highest point under the foot.
        const cx = tx - r.jibFoot;
        let top = 0;
        for (let u = 0; u <= 10; u++) top = Math.max(top, deckAt(m, (cx + ((tx - cx) * u) / 10) / L));
        tz = top + r.jibGap;
      }
      const sl = Math.hypot(hx - tx, hz - tz);
      const k = Math.min(1, r.jibLuff / sl);
      x0 = tx; y0 = ty; z0 = tz; x1 = tx + (hx - tx) * k; y1 = ty * (1 - k); z1 = tz + (hz - tz) * k;
      foot = r.jibFoot; ang = r.swing ? p.boom : p.jib; roach = 0; head = r.jibHead; twist = 8; depth = p.luff ? 0.015 : 0.095;
      sd = p.goose ? -p.sd : p.sd;
    }
    const flapK = p.luff ? 0.014 * L : 0;
    const S = (f: number, g: number): V3 => {
      const lx = x0 + (x1 - x0) * f, ly = y0 + (y1 - y0) * f, lz = z0 + (z1 - z0) * f;
      const ch = foot * (1 - f) * (1 + roach * f) + head * f;
      const a = (ang + twist * f) * DEG;
      const dx = -Math.cos(a), dy = sd * Math.sin(a), px = Math.sin(a), py = sd * Math.cos(a);
      const cb = depth * 4 * g * (1 - g) * ch + (flapK ? Math.sin(f * 11 + g * 5 + p.x * 3) * flapK * g : 0);
      return this.w(lx + dx * g * ch + px * cb, ly + dy * g * ch + py * cb, lz);
    };
    return { S, ang, sd };
  }
}

export interface DrawOpts {
  P: Projector;
  /** Focal length, px. */
  F: number;
  dpr: number;
  cam: V3;
  t: number;
}

const FONT = "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', sans-serif";

function poly(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

/** The boat's mirror image in the water. */
export function drawReflection(ctx: CanvasRenderingContext2D, p: Pose, o: DrawOpts, alpha: number) {
  if (alpha <= 0.01) return;
  const g = new Geo(p);
  const st = g.m.stations, L = g.m.L;
  const M = (v: V3) => o.P(v[0], v[1], -v[2]);
  ctx.save();
  ctx.globalAlpha = alpha * p.alpha;
  const rim = [...st.map(s => M(g.w(s.fx * L, s.deHw, s.deZ))), ...st.slice().reverse().map(s => M(g.w(s.fx * L, -s.deHw, s.deZ)))];
  ctx.fillStyle = shade(p.color, 0.85);
  poly(ctx, rim); ctx.fill();
  ctx.fillStyle = '#DCE3EC';
  for (const kind of ['main', 'jib'] as const) {
    const { S } = g.sail(kind);
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= 6; i++) pts.push(M(S(i / 6, 0)));
    for (let i = 6; i >= 0; i--) pts.push(M(S(i / 6, 1)));
    poly(ctx, pts); ctx.fill();
  }
  ctx.restore();
}

/** Draw one boat. Returns the screen point above the masthead and at the waterline. */
export function drawBoat3d(ctx: CanvasRenderingContext2D, p: Pose, o: DrawOpts): { top: { x: number; y: number }; base: { x: number; y: number }; size: number } {
  const g = new Geo(p);
  const { m, r } = g;
  const L = m.L, st = m.stations, ns = st.length;
  const base = o.P(...g.w(0, 0, 0));
  const depth = Math.max(0.6, base.z);
  const size = (o.F * L) / depth; // hull length on screen
  const deck = deckAt(m, r.mastX);
  const top = o.P(...g.w(r.mastX * L, 0, deck + r.mastH * 1.04));
  ctx.save();
  ctx.globalAlpha = p.alpha;
  const lw = (k: number) => Math.max(1, (o.F * k) / depth);
  // Wake and bow wave.
  const fast = p.spd / Math.max(0.1, p.hullSpeed);
  const half = m.beam / 2;
  if (fast > 0.3 && size > 10) {
    const bowx = st[Math.min(3, ns - 1)].fx * L;
    ctx.strokeStyle = 'rgba(230,240,255,0.32)'; ctx.lineWidth = lw(0.012);
    ctx.beginPath();
    for (const sd of [1, -1]) {
      const q0 = o.P(...g.w(-0.45 * L, sd * half * 0.7, 0)), q1 = o.P(...g.w(-(0.5 + 1.8 * fast) * L, sd * (half + 0.25 * L * fast), 0));
      ctx.moveTo(q0.x, q0.y); ctx.lineTo(q1.x, q1.y);
    }
    ctx.stroke();
    ctx.strokeStyle = `rgba(244,248,255,${Math.min(0.9, fast).toFixed(2)})`; ctx.lineWidth = lw(0.014); ctx.lineCap = 'round';
    ctx.beginPath();
    for (const sd of [1, -1]) {
      const q0 = o.P(...g.w(bowx, 0, 0)), q1 = o.P(...g.w(bowx - 0.18 * L, sd * half * 1.35, 0)), q2 = o.P(...g.w(bowx - 0.42 * L, sd * half * 1.95, 0));
      ctx.moveTo(q0.x, q0.y); ctx.quadraticCurveTo(q1.x, q1.y, q2.x, q2.y);
    }
    ctx.stroke();
  }
  // Hull: topsides in two strips and the crowned deck, painted far to near and shaded by the sun.
  const step = size < 45 ? 2 : 1;
  const idx: number[] = [];
  for (let i = 0; i < ns; i += step) idx.push(i);
  if (idx[idx.length - 1] !== ns - 1) idx.push(ns - 1);
  const ring = (side: number, w: 'low' | 'mb' | 'de') => idx.map(i => {
    const s = st[i];
    return w === 'low' ? g.w(s.fx * L, side * s.lowHw, s.lowZ) : w === 'mb' ? g.w(s.fx * L, side * s.mbHw, s.mbZ) : g.w(s.fx * L, side * s.deHw, s.deZ);
  });
  const crown = idx.map(i => g.w(st[i].fx * L, 0, st[i].crownZ));
  const ctr = g.w(0, 0, st[ns >> 1].deZ * 0.5);
  const faces: { d: number; pts: V3[]; color: string }[] = [];
  const face = (pts: V3[], color: string, isDeck: boolean) => {
    let nrm = norm(cross(sub(pts[1], pts[0]), sub(pts[pts.length - 1], pts[0])));
    const cen: V3 = [0, 0, 0];
    for (const q of pts) { cen[0] += q[0] / pts.length; cen[1] += q[1] / pts.length; cen[2] += q[2] / pts.length; }
    if (dot(nrm, sub(cen, ctr)) < 0) nrm = [-nrm[0], -nrm[1], -nrm[2]];
    const lit = (isDeck ? 0.78 : 0.6) + (isDeck ? 0.22 : 0.4) * Math.max(0, dot(nrm, SUN));
    const d = o.P(cen[0], cen[1], cen[2]).z;
    faces.push({ d, pts, color: shade(color, lit) });
  };
  for (const side of [1, -1]) {
    const lo = ring(side, 'low'), mb = ring(side, 'mb'), de = ring(side, 'de');
    for (let k = 0; k < idx.length - 1; k++) {
      face([lo[k], lo[k + 1], mb[k + 1], mb[k]], p.color, false);
      face([mb[k], mb[k + 1], de[k + 1], de[k]], p.color, false);
      face([de[k], de[k + 1], crown[k + 1], crown[k]], p.deck, true);
    }
  }
  {
    const t = idx.length - 1;
    const a = ring(1, 'de')[t], b = ring(-1, 'de')[t], c = ring(-1, 'mb')[t], d = ring(-1, 'low')[t], e = ring(1, 'low')[t], f = ring(1, 'mb')[t];
    face([a, crown[t], b, c, d, e, f], p.color, false);
  }
  faces.sort((a, b) => b.d - a.d);
  for (const fc of faces) {
    const pts = fc.pts.map(q => o.P(q[0], q[1], q[2]));
    ctx.fillStyle = fc.color; ctx.strokeStyle = fc.color; ctx.lineWidth = 0.6;
    poly(ctx, pts); ctx.fill(); ctx.stroke();
  }
  if (size > 30) {
    // Hatch covers and the bow bumper.
    ctx.fillStyle = 'rgba(38,44,54,0.88)';
    for (const [hx, hl, hw] of m.hatches) {
      let zc = deckAt(m, hx), hb = half;
      for (let k = 0; k < ns - 1; k++) if (st[k].fx >= hx && hx >= st[k + 1].fx) { const u = (st[k].fx - hx) / (st[k].fx - st[k + 1].fx); hb = st[k].deHw + (st[k + 1].deHw - st[k].deHw) * u; break; }
      const sag = 0.25 * (st[ns >> 1].crownZ - st[ns >> 1].deZ);
      const pts: { x: number; y: number }[] = [];
      for (let a = 0; a < 14; a++) {
        const tt = (a / 14) * Math.PI * 2, cx = Math.cos(tt), cy = Math.sin(tt);
        const sx = Math.sign(cx) * Math.sqrt(Math.abs(cx)), sy = Math.sign(cy) * Math.sqrt(Math.abs(cy));
        const ly = sy * hw * hb;
        pts.push(o.P(...g.w((hx + (sx * hl) / 2) * L, ly, zc - sag * (ly / Math.max(1e-6, hb)) ** 2 + 0.001)));
      }
      poly(ctx, pts); ctx.fill();
      zc = 0;
    }
    const s0 = st[0], s1 = st[1];
    const bump = [g.w(s0.fx * L, 0, s0.crownZ), g.w((s0.fx - 0.02) * L, s1.deHw * 0.4, s1.deZ), g.w((s0.fx - 0.02) * L, s1.lowHw * 0.4, s1.lowZ), g.w(s0.fx * L, 0, s0.lowZ), g.w((s0.fx - 0.02) * L, -s1.lowHw * 0.4, s1.lowZ), g.w((s0.fx - 0.02) * L, -s1.deHw * 0.4, s1.deZ)].map(q => o.P(...q));
    ctx.fillStyle = '#121519';
    poly(ctx, bump); ctx.fill();
  }
  // Sails, the further one first: shaded panels, seams, leech tape, battens, numbers, tell-tales.
  const sails = (['main', 'jib'] as const).map(kind => {
    const s = g.sail(kind);
    return { kind, ...s, d: o.P(...s.S(0.4, 0.45)).z };
  }).sort((a, b) => b.d - a.d);
  const nf = size > 70 ? 8 : size > 30 ? 4 : 2, ng = size > 70 ? 5 : size > 30 ? 3 : 1;
  const fill = p.luff ? '#D9DFE8' : '#E4E8EE';
  const tw = Math.max(1, (o.F * 0.006 * L) / depth);
  // Sails, mast and boom are painted far to near, so a sail in front of the mast hides it.
  const layers: { d: number; draw: () => void }[] = [];
  for (const sl of sails) layers.push({ d: sl.d, draw: () => {
    if (sl.kind === 'jib' && size > 30) {
      const tk = o.P(...sl.S(0, 0)), hd = o.P(...g.w(r.mastX * L - 0.004, 0, deck + r.hounds));
      ctx.strokeStyle = 'rgba(91,100,116,0.7)'; ctx.lineWidth = Math.max(0.7, (o.F * 0.003) / depth);
      ctx.beginPath(); ctx.moveTo(tk.x, tk.y); ctx.lineTo(hd.x, hd.y); ctx.stroke();
    }
    const grid: V3[][] = [];
    const scr: { x: number; y: number; z: number }[][] = [];
    for (let i = 0; i <= nf; i++) {
      const row: V3[] = [], srow: { x: number; y: number; z: number }[] = [];
      for (let j = 0; j <= ng; j++) { const q = sl.S(i / nf, j / ng); row.push(q); srow.push(o.P(q[0], q[1], q[2])); }
      grid.push(row); scr.push(srow);
    }
    const quads: { d: number; i: number; j: number; c: string }[] = [];
    for (let i = 0; i < nf; i++) for (let j = 0; j < ng; j++) {
      const a = grid[i][j];
      const nrm = norm(cross(sub(grid[i][j + 1], a), sub(grid[i + 1][j], a)));
      quads.push({ d: scr[i][j].z, i, j, c: shade(fill, 0.82 + 0.18 * Math.abs(dot(nrm, SUN))) });
    }
    quads.sort((a, b) => b.d - a.d);
    ctx.globalAlpha = p.alpha * 0.95;
    for (const q of quads) {
      const { i, j } = q;
      ctx.fillStyle = q.c; ctx.strokeStyle = q.c; ctx.lineWidth = 0.5;
      poly(ctx, [scr[i][j], scr[i][j + 1], scr[i + 1][j + 1], scr[i + 1][j]]); ctx.fill(); ctx.stroke();
    }
    ctx.globalAlpha = p.alpha;
    if (size > 30 && nf >= 4) {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.9;
      ctx.beginPath();
      for (let i = 1; i < nf; i += 2) { ctx.moveTo(scr[i][0].x, scr[i][0].y); for (let j = 1; j <= ng; j++) ctx.lineTo(scr[i][j].x, scr[i][j].y); }
      ctx.stroke();
    }
    ctx.lineCap = 'round';
    ctx.strokeStyle = p.tape; ctx.lineWidth = tw * 1.5;
    ctx.beginPath(); ctx.moveTo(scr[0][ng].x, scr[0][ng].y); for (let i = 1; i <= nf; i++) ctx.lineTo(scr[i][ng].x, scr[i][ng].y); ctx.stroke();
    ctx.strokeStyle = 'rgba(154,163,179,0.7)'; ctx.lineWidth = tw * 0.9;
    ctx.beginPath(); ctx.moveTo(scr[0][0].x, scr[0][0].y); for (let j = 1; j <= ng; j++) ctx.lineTo(scr[0][j].x, scr[0][j].y); ctx.stroke();
    if (sl.kind === 'jib') {
      ctx.strokeStyle = p.tape; ctx.lineWidth = tw * 1.3;
      ctx.beginPath(); ctx.moveTo(scr[0][0].x, scr[0][0].y); for (let i = 1; i <= nf; i++) ctx.lineTo(scr[i][0].x, scr[i][0].y); ctx.stroke();
    }
    const bats = sl.kind === 'main' ? r.mainBattens : r.jibBattens;
    if (size > 45) {
      ctx.strokeStyle = '#A3ADBD'; ctx.lineWidth = tw * 1.1;
      ctx.beginPath();
      for (const f of bats) { const a = o.P(...sl.S(f, 0.8)), b = o.P(...sl.S(f, 0.99)); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
      ctx.stroke();
    }
    // Numbers: the starboard side's sit higher than the port side's; the far side shows through, mirrored.
    if (size > 38 && p.sail) {
      const nx = sl.sd * Math.sin(sl.ang * DEG), ny = Math.cos(sl.ang * DEG); // starboard-face normal, boat frame
      const wn = [nx * Math.sin(p.hdg * DEG) + ny * Math.cos(p.hdg * DEG), nx * Math.cos(p.hdg * DEG) - ny * Math.sin(p.hdg * DEG)];
      const cen = sl.S(0.45, 0.45);
      const stbdVisible = wn[0] * (cen[0] - o.cam[0]) + wn[1] * (cen[1] - o.cam[1]) < 0;
      const spots: [boolean, number, number, string, number][] = sl.kind === 'main'
        ? [[true, 0.64, 0.47, p.sail, r.num], [false, 0.5, 0.5, p.sail, r.num], ...(size > 70 && p.country ? [[true, 0.35, 0.42, p.country, r.num * 0.5], [false, 0.26, 0.44, p.country, r.num * 0.5]] as [boolean, number, number, string, number][] : [])]
        : [[true, 0.52, 0.42, p.sail, r.num * 0.9], [false, 0.38, 0.45, p.sail, r.num * 0.9]];
      for (const [stbd, f, gg, text, mm] of spots) {
        const vis = stbd === stbdVisible;
        const O = sl.S(f, gg), U = sl.S(f, Math.min(1, gg + 0.05)), Vv = sl.S(Math.min(1, f + 0.05), gg);
        const eu = norm(sub(U, O));
        let ev = norm(sub(Vv, O));
        const kk = dot(ev, eu);
        ev = norm([ev[0] - eu[0] * kk, ev[1] - eu[1] * kk, ev[2] - eu[2] * kk]);
        const p0 = o.P(O[0], O[1], O[2]);
        const pu = o.P(O[0] + eu[0] * 0.1, O[1] + eu[1] * 0.1, O[2] + eu[2] * 0.1);
        const pv = o.P(O[0] + ev[0] * 0.1, O[1] + ev[1] * 0.1, O[2] + ev[2] * 0.1);
        let ux = (pu.x - p0.x) / 100, uy = (pu.y - p0.y) / 100;
        const vx = -(pv.x - p0.x) / 100, vy = -(pv.y - p0.y) / 100;
        if ((ux > 0) !== vis) { ux = -ux; uy = -uy; }
        const D = o.dpr;
        ctx.setTransform(ux * D, uy * D, vx * D, vy * D, p0.x * D, p0.y * D);
        ctx.font = `800 ${mm}px ${FONT}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = p.ink;
        ctx.globalAlpha = p.alpha * (vis ? 0.92 : 0.26);
        ctx.fillText(text, 0, 0);
        ctx.setTransform(D, 0, 0, D, 0, 0);
        ctx.globalAlpha = p.alpha;
      }
    }
    if (size > 55) {
      for (const [f, col] of [[0.3, '#E5484D'], [0.62, '#3E7BFA']] as const) {
        const a = o.P(...sl.S(f, 0.16));
        const flutter = p.luff ? Math.sin(o.t * 19 + f * 7) * 3 : 0;
        const b = o.P(...sl.S(f - (p.luff ? 0.04 : 0), 0.25));
        ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.2, tw * 1.3);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 - 1.2 + flutter, b.x, b.y + flutter); ctx.stroke();
      }
    }
    if (sl.kind === 'main') {
      const bt = o.P(...sl.S(0, 0)), bc = o.P(...sl.S(0, 1));
      ctx.strokeStyle = '#3A404C'; ctx.lineCap = 'round'; ctx.lineWidth = lw(0.009);
      ctx.beginPath(); ctx.moveTo(bt.x, bt.y); ctx.lineTo(bc.x, bc.y); ctx.stroke();
    }
  } });
  // The mast, in front of the sails or hidden behind them by depth.
  const mMid = g.w(r.mastX * L - 0.01 * L, 0, deck + r.mastH * 0.45);
  layers.push({ d: o.P(mMid[0], mMid[1], mMid[2]).z, draw: () => {
    const m0 = o.P(...g.w(r.mastX * L, 0, deck)), m1 = o.P(...g.w(r.mastX * L - 0.02 * L, 0, deck + r.mastH));
    ctx.strokeStyle = '#3A404C'; ctx.lineCap = 'round'; ctx.lineWidth = lw(0.011);
    ctx.beginPath(); ctx.moveTo(m0.x, m0.y); ctx.lineTo(m1.x, m1.y); ctx.stroke();
  } });
  layers.sort((a, b) => b.d - a.d);
  for (const l of layers) l.draw();
  ctx.restore();
  return { top: { x: top.x, y: top.y }, base: { x: base.x, y: base.y }, size };
}

/** True wind angle of a boat for a heading (for replays, where the heading is from the history). */
export function twaFor(twd: number, hdg: number) { return n180(twd - hdg); }
