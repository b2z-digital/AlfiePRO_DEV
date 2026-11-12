// Boats in 3D for the bank view: hulls from the real lines and rigs from the sail plans, drawn in
// perspective on the 2D canvas. The IOM hull is the LM3 hull and deck plug (measured every 5%), its
// A, B and C rigs come from the IOM sail measurements; the 10 Rater is the GothiX 10r; the
// Marblehead is the Gothic M with a swing rig. DF95 and DF65 are scaled from the IOM for now.
// Same model as the design board renders.
import type { ClassId } from '@/sim/classes';
import { iomRig, noGoAngle } from '@/sim/classes';
import { DEG, n180 } from '@/sim/math';
import type { Sea } from '@/sim/sea';
import type { BoatLook } from '@/sim/types';
import { hullMotion } from '@/sim/sea';

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

const IOM_A: Rig = { mastX: 0.04, mastH: 1.72, boomH: 0.03, mainLuff: 1.6, boom: 0.355, roach: 0.59, head: 0.02, jibX: 0.45, jibGap: 0.025, hounds: 1.28, jibLuff: 1.325, jibFoot: 0.38, jibHead: 0.02, num: 110, mainBattens: [0.25, 0.5, 0.75], jibBattens: [0.33, 0.67] };
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
    rigs: { A: { mastX: 0.045, mastH: 2.17, boomH: 0.045, mainLuff: 2.01, boom: 0.45, roach: 0.86, head: 0.06, jibX: 0.27, jibGap: 0.025, hounds: 1.785, jibLuff: 1.485, jibFoot: 0.455, jibHead: 0.02, num: 150, mainBattens: [0.2, 0.4, 0.6, 0.8], jibBattens: [0.33, 0.67] } },
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

/** How big a class's model is: hull length, where the mast stands, how tall it is, and where the jib tacks down (m, boat frame). */
export function modelSize(cls: ClassId, rig: RigId = 'A'): { L: number; mastX: number; mastH: number; jibX: number; boom: number } {
  const m = MODELS[cls] ?? MODELS.IOM, r = m.rigs[rig] ?? m.rigs.A;
  return { L: m.L, mastX: r.mastX * m.L, mastH: r.mastH, jibX: r.jibX * m.L, boom: r.boom };
}

/** The rig a class sails with in this breeze (knots): IOMs change down to the B rig, then the C. */
export function rigFor(cls: ClassId, knots: number): RigId {
  return cls === 'IOM' ? iomRig(knots) : 'A';
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
  /** The jib's angle off the centreline: negative when it's goose-winged out on the other side. */
  boom: number; jib: number;
  /** How much the sails are luffing, 0 (full) to 1 (flogging). */
  luff: number;
  /** Running pressed: 0 level, 1 the bow buried (white water over it). */
  dive?: number;
  /** Hull; the sail numbers; the deck. */
  color: string; ink: string; deck: string;
  /** Her bottom, when it's painted a colour of its own (the hull colour when not given). */
  bottom?: string;
  /** The tape up the jib's luff: the one strip of colour on her sails (their back edges are bare film, as on a real boat). */
  luffTape: string;
  /** The patches at the corners of both sails. */
  patch?: BoatLook['patch'] | null;
  /** The patches over her deck hatches (dark grey when not given). */
  hatch?: string;
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

function mixHex(a: string, b: string, t: number): string {
  const p = parseInt(a.slice(1), 16), q = parseInt(b.slice(1), 16);
  const ch = (sh: number) => Math.round(((p >> sh) & 255) * (1 - t) + ((q >> sh) & 255) * t);
  return `#${[16, 8, 0].map(sh => ch(sh).toString(16).padStart(2, '0')).join('')}`;
}

function shade(hex: string, k: number): string {
  const v = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((v >> 16) & 255) * k)), g = Math.min(255, Math.round(((v >> 8) & 255) * k)), b = Math.min(255, Math.round((v & 255) * k));
  return `rgb(${r},${g},${b})`;
}

const ramp = (a: number, b: number, x: number) => { const u = Math.max(0, Math.min(1, (x - a) / (b - a))); return u * u * (3 - 2 * u); };

/**
 * How the sails sit for a true wind angle and sheet, as on the top view: both off one sheet. The
 * sails are on the side her tack puts them (which already waits until she's well by the lee before
 * it changes), and luffing and goose-winging come on gradually, so a boat sailing close to either
 * never flickers between the two looks.
 */
export function sailSet(twa: number, sheet: number, tws: number, disabled: boolean, tack?: 'stbd' | 'port') {
  const a = Math.abs(twa);
  const ease = 1 - Math.min(1, Math.max(0, disabled ? 0 : sheet));
  const maxBoom = 8 + ease * 82;
  const natural = Math.min(88, Math.max(0, a - 4));
  const boom = Math.min(maxBoom, natural);
  const ng = noGoAngle(tws);
  const luff = disabled ? 1 : Math.max(ramp(2, 10, maxBoom - natural), 1 - ramp(ng, ng + 5, a));
  // Running deep with the sheet eased, the jib swings across to goose-wing on the other side.
  const goose = ramp(150, 162, a) * ramp(0.5, 0.68, ease) * (1 - luff);
  const jib = (1 - goose) * Math.min(maxBoom * 1.08 + 2, natural + 2) - goose * Math.min(85, maxBoom);
  const sd: 1 | -1 = tack ? (tack === 'stbd' ? -1 : 1) : twa >= 0 ? -1 : 1;
  return { boom, jib, luff, sd };
}

/** Lift, pitch and roll on the waves, as her hull rides them (see hullMotion). */
export function onWaves(p: Pose, sea: Sea | null, t: number): Pose {
  if (!sea) return p;
  const m = hullMotion(sea, p.x, p.y, t, p.hdg, p.spd, (MODELS[p.cls] ?? MODELS.IOM).L);
  // (On top of any trim she already has: bow down in a dive.)
  return { ...p, heave: p.heave + m.heave, pitch: p.pitch + m.pitch, heel: p.heel + m.roll };
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
  sail(kind: 'main' | 'jib'): { S: (f: number, g: number) => V3; ang: number; sd: number; /** Foot and luff lengths, m. */ foot: number; luffLen: number } {
    const { m, r, p } = this;
    const L = m.L;
    const deck = deckAt(m, r.mastX);
    let x0: number, y0 = 0, z0: number, x1: number, y1 = 0, z1: number, foot: number, ang: number, roach: number, head: number, twist: number, depth: number, sd: number;
    if (kind === 'main') {
      x0 = r.mastX * L; z0 = deck + r.boomH; x1 = x0 - 0.018 * L;
      // The main boom sits low, a couple of centimetres off the deck (as the jib's does), and never
      // closer than that to the highest point under it.
      if (!r.swing) for (let u = 0; u <= 6; u++) z0 = Math.max(z0, deckAt(m, (x0 - (r.boom * u) / 6) / L) + 0.02);
      z1 = z0 + r.mainLuff;
      foot = r.boom; ang = p.boom; roach = r.roach; head = r.head; twist = 11; depth = 0.09 - 0.075 * p.luff; sd = p.sd;
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
      // A goose-winged jib has a negative angle: out on the other side, with its belly that way too.
      foot = r.jibFoot; ang = r.swing ? p.boom : p.jib; roach = 0; head = r.jibHead; twist = 8; depth = 0.095 - 0.08 * p.luff;
      sd = p.sd;
      if (ang < 0) { ang = -ang; sd = -p.sd; }
    }
    const flapK = 0.014 * L * p.luff;
    const S = (f: number, g: number): V3 => {
      const lx = x0 + (x1 - x0) * f, ly = y0 + (y1 - y0) * f, lz = z0 + (z1 - z0) * f;
      const ch = foot * (1 - f) * (1 + roach * f) + head * f;
      const a = (ang + twist * f) * DEG;
      const dx = -Math.cos(a), dy = sd * Math.sin(a), px = Math.sin(a), py = sd * Math.cos(a);
      const cb = depth * 4 * g * (1 - g) * ch + (flapK ? Math.sin(f * 11 + g * 5 + p.x * 3) * flapK * g : 0);
      return this.w(lx + dx * g * ch + px * cb, ly + dy * g * ch + py * cb, lz);
    };
    return { S, ang, sd, foot, luffLen: Math.hypot(x1 - x0, y1 - y0, z1 - z0) };
  }
}

/**
 * The patches at a sail's corners, as outlines on the sail's own surface (f up the sail, g along
 * the chord): fingers, fanned out from the tack and the clew and hanging side by side from the
 * head; or plain, a quarter-round patch at each foot corner and a small band at the head. Colour
 * one, and colour two taking turn about with it when there is one. `chord(f)` is the sail's width
 * at f of the way up, in metres (the fingers at the head are laid out across it).
 */
export function patchShapes(patch: NonNullable<Pose['patch']>, foot: number, luffLen: number, chord: (f: number) => number = f => foot * (1 - f) * 1.5 + 0.02): { color: string; pts: [number, number][] }[] {
  const out: { color: string; pts: [number, number][] }[] = [];
  const r0 = Math.min(0.26 * foot, 0.085 * luffLen);
  const two = patch.two ?? patch.one;
  // (rho metres from the corner, at theta from the foot towards straight up the sail.)
  const at = (f0: number, g0: number, sg: number, rho: number, th: number): [number, number] =>
    [Math.max(0, Math.min(1, f0 + (rho * Math.sin(th)) / luffLen)), Math.max(0, Math.min(1, g0 + (sg * rho * Math.cos(th)) / foot))];
  for (const [g0, sg, r] of [[0, 1, r0 * 0.85], [1, -1, r0]] as const) {
    if (patch.style === 'solid') {
      for (const [k, color] of (patch.two ? [[0.66, patch.one], [0.38, two]] : [[0.6, patch.one]]) as [number, string][]) {
        const pts: [number, number][] = [[0, g0]];
        for (let a = 0; a <= 8; a++) pts.push(at(0, g0, sg, r * k, (a / 8) * (Math.PI / 2)));
        out.push({ color, pts });
      }
    } else {
      // Each finger starts at the corner, widens to its width and runs out to a round end (as the
      // real ones are cut: a point would lift and peel).
      const n = 5;
      for (let i = 0; i < n; i++) {
        const th = (6 + (i * 78) / (n - 1)) * DEG, len = r * (0.78 + 0.22 * Math.sin((Math.PI * i) / (n - 1)));
        const hw = len * 0.09, ax = Math.cos(th), ay = Math.sin(th);
        // (d along the finger from the corner, s across it: both in metres on the sail.)
        const on = (d: number, s: number): [number, number] =>
          [Math.max(0, Math.min(1, (d * ay + s * ax) / luffLen)), Math.max(0, Math.min(1, g0 + (sg * (d * ax - s * ay)) / foot))];
        const pts: [number, number][] = [[0, g0], on(len * 0.34, -hw)];
        for (let a = 0; a <= 8; a++) { const q = -Math.PI / 2 + (a / 8) * Math.PI; pts.push(on(len - hw + Math.cos(q) * hw, Math.sin(q) * hw)); }
        pts.push(on(len * 0.34, hw));
        out.push({ color: i % 2 ? two : patch.one, pts });
      }
    }
  }
  if (patch.style === 'fingers') {
    // At the head, three long narrow fingers hanging down from the top, side by side: the one by
    // the leech the longest, the one by the mast the shortest, each a strip of even width run out
    // to a round end. (The sail is a thumb's width up there, so they start as one and part as it
    // widens.)
    const hw = 0.065 * r0, clamp = (x: number) => Math.max(0, Math.min(1, x));
    ([[0.78, 1.25], [0.5, 1.05], [0.22, 0.75]] as const).forEach(([c, k], i) => {
      const len = k * r0, pts: [number, number][] = [];
      const put = (d: number, off: number) => { const f = 1 - d / luffLen, ch = Math.max(1e-3, chord(f)); pts.push([f, clamp((c * ch + off) / ch)]); };
      for (let a = 0; a <= 5; a++) put(((len - hw) * a) / 5, -hw);
      for (let a = 1; a < 8; a++) { const q = (a / 8) * Math.PI; put(len - hw + Math.sin(q) * hw, -Math.cos(q) * hw); }
      for (let a = 5; a >= 0; a--) put(((len - hw) * a) / 5, hw);
      out.push({ color: i % 2 ? two : patch.one, pts });
    });
  } else {
    const h = Math.min(0.04, (0.5 * r0) / luffLen);
    out.push({ color: patch.one, pts: [[1 - h, 0], [1 - h, 1], [1, 1], [1, 0]] });
  }
  return out;
}

/** One identification mark on a sail: which face it is stuck to, what it says, how tall its characters are, the space between them and how far up the luff its middle sits (all in metres). */
export interface IdMark { what: 'number' | 'letters' | 'insignia'; side: 'stbd' | 'port' | 'both'; text: string; h: number; space: number; z: number }

/** A class's sizes for the marks on her sails (metres). */
export interface IdSpec {
  /** Height of the sail numbers; the least they may come down to on a sail too small for them. */
  num: number; numLow: number;
  /** Space between neighbouring digits. */
  space: number;
  /** Clear height between the number on one side and the number on the other; the least it may close to. */
  rows: number; rowsMin: number;
  /** National letters: their height (and the least), the space between neighbours, the clear height between rows (and the least). */
  letters: number; lettersLow: number; letterSpace: number; letterRows: number; letterRowsMin: number;
  /** The class mark at the head of the mainsail (plain lettering, standing in for the class's own insignia), and its width where the class rules give one. */
  mark: string; markWide?: number;
}

// The IRSA classes sail under the Racing Rules' radio sailing appendix (E8) and the IRSA
// supplementary class rules: numbers 100 to 110 mm tall and 20 to 30 apart, letters 60 to 70 tall
// and 13 to 23 apart, 40 mm clear between a line on one side and a line on the other (20 at the
// least); a small headsail's numbers may come down to between 80 and 90.
const IRSA_ID = { num: 0.105, numLow: 0.08, space: 0.024, rows: 0.04, rowsMin: 0.02, letters: 0.065, lettersLow: 0.04, letterSpace: 0.016, letterRows: 0.04, letterRowsMin: 0.02 };
export const SAIL_ID: Record<ClassId, IdSpec> = {
  IOM: { ...IRSA_ID, mark: 'IOM' }, '10R': { ...IRSA_ID, mark: '10R' }, M: { ...IRSA_ID, mark: 'M' },
  // The DragonFlite 95 and DragonForce 65 have tables of their own in their class rules (H.9, H.10).
  DF95: { num: 0.105, numLow: 0.1, space: 0.018, rows: 0.04, rowsMin: 0.02, letters: 0.045, lettersLow: 0.04, letterSpace: 0.009, letterRows: 0.02, letterRowsMin: 0.015, mark: '95', markWide: 0.07 },
  DF65: { num: 0.092, numLow: 0.085, space: 0.016, rows: 0.03, rowsMin: 0.01, letters: 0.045, lettersLow: 0.04, letterSpace: 0.009, letterRows: 0.02, letterRowsMin: 0.015, mark: '65', markWide: 0.06 },
};
/** How wide a digit is for its height (a plain, upright face of Helvetica's proportions), and a 1. */
export const ID_DIGIT = 0.68, ID_ONE = 0.42;

/**
 * What a sail carries to identify her, laid out by the rules for identification on sails. Every
 * sail has her number on both sides: two digits, the starboard side's uppermost and the port
 * side's clear below it, level, with room left in front for a 1. On the mainsail the numbers sit
 * above the quarter height, the national letters below them (starboard uppermost again) and the
 * class mark up at the head, above three-quarter height, back to back.
 *
 * Where a sail is too small for all that, the rules give way in their own order: the numbers come
 * down below the quarter line; the letters close up under the numbers, then on each other, then
 * shrink, then go; the two rows of numbers close up; and last the numbers themselves come down.
 *
 * `chord(f)` is the sail's width at f of the way up the luff, in metres.
 */
export function idMarks(cls: ClassId, kind: 'main' | 'jib', luffLen: number, chord: (f: number) => number, sail: string, country?: string, classMark = true): IdMark[] {
  const R = SAIL_ID[cls], out: IdMark[] = [];
  const d = sail.replace(/\D/g, '');
  if (d) {
    const text = d.length > 2 ? d.slice(-3) : d.padStart(2, '0');
    // Nothing down among the corner patches along the foot, nor up where the class mark goes.
    const low = 0.06 * luffLen, top = (kind === 'main' ? 0.72 : 0.8) * luffLen;
    let h = R.num, rows = R.rows + 0.01;
    // The foot of the port number: just above the quarter line on a mainsail, a fifth of the way up a jib.
    let base = kind === 'main' ? 0.25 * luffLen + 0.012 : 0.2 * luffLen;
    const fits = () => base + 2 * h + rows <= top && 2 * ID_DIGIT * h + R.space + 0.02 <= chord((base + 1.5 * h + rows) / luffLen);
    if (!fits()) rows = R.rows;
    while (!fits() && base > low + 0.012) base = Math.max(low + 0.012, base - 0.01);
    if (!fits()) rows = R.rowsMin;
    if (!fits()) for (const hh of R.num >= 0.1 && R.numLow < 0.09 ? [0.088, R.numLow] : [R.numLow]) { h = hh; if (fits()) break; }
    out.push({ what: 'number', side: 'stbd', text, h, space: R.space, z: base + 1.5 * h + rows }, { what: 'number', side: 'port', text, h, space: R.space, z: base + 0.5 * h });
    if (kind === 'main' && country) {
      let hl = R.letters, under = R.letterRows, between = R.letterRows;
      const ok = () => base - under - between - 2 * hl >= low;
      if (!ok()) under = R.letterRowsMin;
      if (!ok()) between = R.letterRowsMin;
      if (!ok()) hl = R.lettersLow;
      if (ok()) out.push({ what: 'letters', side: 'stbd', text: country, h: hl, space: R.letterSpace, z: base - under - 0.5 * hl }, { what: 'letters', side: 'port', text: country, h: hl, space: R.letterSpace, z: base - under - between - 1.5 * hl });
    }
  }
  if (kind === 'main' && classMark) {
    const n = R.mark.length, per = n * ID_DIGIT + (n - 1) * 0.2;
    out.push({ what: 'insignia', side: 'both', text: R.mark, h: Math.min(0.05, (R.markWide ?? 1) / per, (0.8 * chord(0.83)) / per), space: 0, z: 0.83 * luffLen });
  }
  return out;
}

export interface DrawOpts {
  P: Projector;
  /** Focal length, px. */
  F: number;
  dpr: number;
  cam: V3;
  t: number;
  /** How bright her shaded side is, 0 to 1 (0.6 on the water; more under studio light, so a colour reads true all the way round). */
  ambient?: number;
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

/**
 * The order to paint the mainsail, jib and mast, far to near. Sorting them by depth flickers when
 * they're at about the same distance (seen from behind, as the boat pitches), so the order comes from
 * which side of each sail you're on: from leeward the jib shows in front of the main (its leech is
 * outside the main's luff), from windward the main hides it; the mast is in front of a sail seen from
 * its windward side, or from ahead of its luff.
 */
function stackOrder<T extends { d: number }>(g: Geo, sails: { kind: 'main' | 'jib'; S: (f: number, h: number) => V3 }[], cam: V3, layers: T[]): T[] {
  const [lMain, lJib, lMast] = layers; // pushed in that order: the main, the jib, then the mast
  const main = sails.find(s => s.kind === 'main'), jib = sails.find(s => s.kind === 'jib');
  if (!main || !jib || layers.length !== 3) return [...layers].sort((a, b) => b.d - a.d);
  const lee = sub(g.w(0, g.p.sd, 0), g.w(0, 0, 0)); // towards her leeward side
  const leeward = (S: (f: number, h: number) => V3) => {
    const p0 = S(0.35, 0), n0 = cross(sub(S(0.35, 1), p0), sub(S(0.75, 0), p0));
    const n = dot(n0, lee) < 0 ? [-n0[0], -n0[1], -n0[2]] as V3 : n0;
    return dot(n, sub(cam, S(0.45, 0.4))) > 0;
  };
  const leeMain = leeward(main.S), leeJib = leeward(jib.S);
  const luff = main.S(0.3, 0), chord = sub(main.S(0.3, 1), luff);
  const aheadOfLuff = dot(chord, sub(cam, luff)) < 0;
  // "a in front of b", for each pair.
  const front = new Map<T, Set<T>>([[lMain, new Set()], [lJib, new Set()], [lMast, new Set()]]);
  if (leeMain) front.get(lJib)!.add(lMain); else front.get(lMain)!.add(lJib);
  if (!leeMain || aheadOfLuff) front.get(lMast)!.add(lMain); else front.get(lMain)!.add(lMast);
  if (!leeJib) front.get(lMast)!.add(lJib); else front.get(lJib)!.add(lMast);
  // Far to near: the one nothing else is behind first.
  const out: T[] = [], left = [lMain, lJib, lMast];
  while (left.length) {
    const k = left.findIndex(a => left.every(b => b === a || front.get(b)!.has(a)));
    if (k < 0) return [...layers].sort((a, b) => b.d - a.d); // they disagree: fall back to depth
    out.push(left.splice(k, 1)[0]);
  }
  return out;
}

/**
 * The ink box of each character at 100 px: left and right of its origin, and its height above the
 * baseline. Measured, so a mark can be set down at its true size on the sail whatever the typeface.
 * (Kept for a few seconds only: the web font may not have arrived at the first asking.)
 */
let glyphBox = new Map<string, { l: number; r: number; a: number }>(), glyphAt = 0;
function glyphs(ctx: CanvasRenderingContext2D, chars: string): Map<string, { l: number; r: number; a: number }> {
  const now = typeof performance !== 'undefined' ? performance.now() : 0;
  if (now - glyphAt > 4000) { glyphBox = new Map(); glyphAt = now; }
  let set = false;
  for (const c of chars) {
    if (glyphBox.has(c)) continue;
    if (!set) { ctx.save(); ctx.font = `800 100px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; set = true; }
    const m = ctx.measureText(c);
    const l = m.actualBoundingBoxLeft ?? 0, r = m.actualBoundingBoxRight ?? m.width, a = m.actualBoundingBoxAscent || 72;
    glyphBox.set(c, { l, r: r > -l ? r : m.width, a });
  }
  if (set) ctx.restore();
  return glyphBox;
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
  // (Her wake and bow wave are drawn on the water first: see bankWater.)
  const half = m.beam / 2;
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
  // Her canoe body under the waterline: deepest a little forward of amidships, rising to the stem and
  // the transom. When she heels or pitches, the part that lifts out of the water shows (her windward
  // bilge, her forefoot as she rides a wave); the water hides whatever is below its surface.
  const D = 0.056 * L;
  const drop = (fx: number) => D * Math.pow(Math.max(0, Math.sin(Math.PI * Math.min(1, (0.5 - fx) / 0.95))), 0.75);
  const under = (side: number, w: 'bilge' | 'keel') => idx.map(i => {
    const s = st[i], dz = drop(s.fx);
    return w === 'bilge' ? g.w(s.fx * L, side * s.lowHw * 0.8, s.lowZ - dz * 0.55) : g.w(s.fx * L, side * s.lowHw * 0.16, s.lowZ - dz);
  });
  // The water's surface round her: she rides up and down with it, and along her length it slopes
  // with the wave she's riding (so pitching doesn't bury her stern), but it stays level across her,
  // so heeling lifts her windward side out.
  const tp = Math.tan(p.pitch * DEG), fw = { x: Math.sin(p.hdg * DEG), y: Math.cos(p.hdg * DEG) };
  const above = (q: V3) => q[2] - p.heave - ((q[0] - p.x) * fw.x + (q[1] - p.y) * fw.y) * tp;
  const wet = (pts: V3[]): V3[] => {
    const out: V3[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], sa = above(a), sb = above(b);
      if (sa >= 0) out.push(a);
      if ((sa >= 0) !== (sb >= 0)) { const k = sa / (sa - sb); out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]); }
    }
    return out;
  };
  const ctr = g.w(0, 0, st[ns >> 1].deZ * 0.5);
  const faces: { d: number; pts: V3[]; color: string }[] = [];
  const face = (pts: V3[], color: string, isDeck: boolean) => {
    // Newell's normal: right for twisted quads too (the flared topsides by the transom are).
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]);
    }
    let nrm = norm([nx, ny, nz]);
    const cen: V3 = [0, 0, 0];
    for (const q of pts) { cen[0] += q[0] / pts.length; cen[1] += q[1] / pts.length; cen[2] += q[2] / pts.length; }
    if (dot(nrm, sub(cen, ctr)) < 0) nrm = [-nrm[0], -nrm[1], -nrm[2]];
    // The hull is convex: a face turned away from you is hidden, so it's never drawn (sorting the
    // far side against the near one by depth can flicker as she pitches).
    if (dot(nrm, sub(o.cam, cen)) < 0) return;
    // Only what's above the water.
    const vis = wet(pts);
    if (vis.length < 3) return;
    const amb = isDeck ? Math.max(0.78, o.ambient ?? 0) : o.ambient ?? 0.6;
    const lit = amb + (1 - amb) * Math.max(0, dot(nrm, SUN));
    const d = o.P(cen[0], cen[1], cen[2]).z;
    faces.push({ d, pts: vis, color: shade(color, lit) });
  };
  for (const side of [1, -1]) {
    const lo = ring(side, 'low'), mb = ring(side, 'mb'), de = ring(side, 'de');
    const bi = under(side, 'bilge'), ke = under(side, 'keel');
    for (let k = 0; k < idx.length - 1; k++) {
      // (A two-tone hull: everything below the middle of her topsides in a colour of its own, the hull colour in a band up to the sheer.)
      face([ke[k], ke[k + 1], bi[k + 1], bi[k]], p.bottom ?? p.color, false);
      face([bi[k], bi[k + 1], lo[k + 1], lo[k]], p.bottom ?? p.color, false);
      face([lo[k], lo[k + 1], mb[k + 1], mb[k]], p.bottom ?? p.color, false);
      face([mb[k], mb[k + 1], de[k + 1], de[k]], p.color, false);
      face([de[k], de[k + 1], crown[k + 1], crown[k]], p.deck, true);
    }
  }
  {
    const kp = under(1, 'keel'), km = under(-1, 'keel');
    for (let k = 0; k < idx.length - 1; k++) face([km[k], km[k + 1], kp[k + 1], kp[k]], p.bottom ?? p.color, false);
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
  // Hatch covers (only when you can see her deck) and the bow bumper (only from ahead of her stem).
  const o0 = g.w(0, 0, 0), upV = sub(g.w(0, 0, 1), o0), fwdV = sub(g.w(1, 0, 0), o0);
  if (size > 30) {
    ctx.fillStyle = p.hatch ?? 'rgba(38,44,54,0.88)';
    for (const [hx, hl, hw] of m.hatches) {
      const hc = g.w(hx * L, 0, deckAt(m, hx));
      if (dot(upV, sub(o.cam, hc)) <= 0 || above(hc) < 0) continue;
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
    const stem = g.w(s0.fx * L, 0, s0.crownZ * 0.5);
    if (dot(fwdV, sub(o.cam, stem)) > 0 && above(stem) >= 0) {
      const bump = [g.w(s0.fx * L, 0, s0.crownZ), g.w((s0.fx - 0.02) * L, s1.deHw * 0.4, s1.deZ), g.w((s0.fx - 0.02) * L, s1.lowHw * 0.4, s1.lowZ), g.w(s0.fx * L, 0, s0.lowZ), g.w((s0.fx - 0.02) * L, -s1.lowHw * 0.4, s1.lowZ), g.w((s0.fx - 0.02) * L, -s1.deHw * 0.4, s1.deZ)].map(q => o.P(...q));
      ctx.fillStyle = '#121519';
      poly(ctx, bump); ctx.fill();
    }
  }
  // Sails: shaded panels, seams, the jib's luff tape, corner patches, battens, numbers, tell-tales.
  const sails = (['main', 'jib'] as const).map(kind => {
    const s = g.sail(kind);
    return { kind, ...s, d: o.P(...s.S(0.4, 0.45)).z };
  });
  const nf = size > 70 ? 8 : size > 30 ? 4 : 2, ng = size > 70 ? 5 : size > 30 ? 3 : 1;
  const fill = mixHex('#E4E8EE', '#D9DFE8', p.luff);
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
    // Far to near along the chord: from behind the leech is nearer, from ahead the luff. A fixed
    // order (not a depth sort, which flickers when the sail is nearly edge-on to you).
    const leechNear = dot(sub(grid[nf >> 1][ng], grid[nf >> 1][0]), sub(o.cam, grid[nf >> 1][0])) > 0;
    quads.sort((a, b) => (leechNear ? a.j - b.j : b.j - a.j) || b.d - a.d);
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
    // The leech: the bare edge of the film, a fine grey line so the sail has an outline against the water.
    ctx.strokeStyle = 'rgba(154,163,179,0.7)'; ctx.lineWidth = tw * 0.8;
    ctx.beginPath(); ctx.moveTo(scr[0][ng].x, scr[0][ng].y); for (let i = 1; i <= nf; i++) ctx.lineTo(scr[i][ng].x, scr[i][ng].y); ctx.stroke();
    ctx.strokeStyle = 'rgba(154,163,179,0.7)'; ctx.lineWidth = tw * 0.9;
    ctx.beginPath(); ctx.moveTo(scr[0][0].x, scr[0][0].y); for (let j = 1; j <= ng; j++) ctx.lineTo(scr[0][j].x, scr[0][j].y); ctx.stroke();
    if (sl.kind === 'jib') {
      ctx.strokeStyle = p.luffTape; ctx.lineWidth = tw * 1.5;
      ctx.beginPath(); ctx.moveTo(scr[0][0].x, scr[0][0].y); for (let i = 1; i <= nf; i++) ctx.lineTo(scr[i][0].x, scr[i][0].y); ctx.stroke();
    }
    // Corner patches (close enough to see them): stuck on the film, so they show from both sides.
    if (p.patch && size > 42) {
      ctx.globalAlpha = p.alpha * 0.94;
      ctx.lineJoin = 'round';
      const across = (f: number) => { const a = sl.S(f, 0), b = sl.S(f, 1); return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); };
      for (const sh of patchShapes(p.patch, sl.foot, sl.luffLen, across)) {
        ctx.fillStyle = sh.color;
        poly(ctx, sh.pts.map(([f, gg]) => o.P(...sl.S(f, gg)))); ctx.fill();
      }
      ctx.globalAlpha = p.alpha;
    }
    const bats = sl.kind === 'main' ? r.mainBattens : r.jibBattens;
    if (size > 45) {
      ctx.strokeStyle = '#A3ADBD'; ctx.lineWidth = tw * 1.1;
      ctx.beginPath();
      for (const f of bats) { const a = o.P(...sl.S(f, 0.8)), b = o.P(...sl.S(f, 0.99)); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
      ctx.stroke();
    }
    // Her number, national letters and class mark, laid out by the rules (see idMarks). Each is stuck
    // to one face of the sail and reads from that side; from the other it shows through the film,
    // faint and back to front.
    if (size > 38 && p.sail) {
      const nx = sl.sd * Math.sin(sl.ang * DEG), ny = Math.cos(sl.ang * DEG); // starboard-face normal, boat frame
      const wn = [nx * Math.sin(p.hdg * DEG) + ny * Math.cos(p.hdg * DEG), nx * Math.cos(p.hdg * DEG) - ny * Math.sin(p.hdg * DEG)];
      const cen = sl.S(0.45, 0.45);
      // How squarely each face is turned to you: +1 the starboard face, -1 the port face, 0 edge-on.
      // The marks fade out as the sail turns edge-on, so they never flick from one side to the other.
      const toCam = Math.hypot(cen[0] - o.cam[0], cen[1] - o.cam[1]) || 1;
      const face = Math.max(-1, Math.min(1, -(wn[0] * (cen[0] - o.cam[0]) + wn[1] * (cen[1] - o.cam[1])) / toCam / 0.2));
      const stbdVisible = face >= 0;
      const shown = Math.abs(face) * Math.abs(face) * (3 - 2 * Math.abs(face));
      const chordAt = (f: number) => { const a = sl.S(f, 0), b = sl.S(f, 1); return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); };
      const D = o.dpr;
      if (shown > 0.02) for (const mk of idMarks(p.cls, sl.kind, sl.luffLen, chordAt, p.sail, size > 70 ? p.country : undefined, size > 70)) {
        const f = mk.z / sl.luffLen, ch = chordAt(f);
        const vis = mk.side === 'both' || (mk.side === 'stbd') === stbdVisible;
        // A mark reads towards the luff on the starboard face and towards the leech on the port face.
        const toLeech = mk.side === 'both' ? !stbdVisible : mk.side === 'port';
        // Each character's width and the space between, in millimetres on the sail.
        const chars = [...mk.text];
        const g100 = glyphs(ctx, mk.text + '0');
        const zero = g100.get('0')!, squeeze = Math.min(1, (ID_DIGIT * zero.a) / (zero.l + zero.r));
        const across = (h: number) => chars.reduce((a, c) => { const m = g100.get(c)!; return a + ((m.l + m.r) * h * squeeze) / zero.a; }, 0) + (mk.what === 'insignia' ? 0.2 * h : mk.space * 1000) * (chars.length - 1);
        // The class mark is as big as the head of the sail has room for.
        const hm = mk.h * 1000 * (mk.what === 'insignia' ? Math.min(1, (ch * 700) / across(mk.h * 1000)) : 1);
        const k = hm / zero.a;
        const widths = chars.map(c => { const m = g100.get(c)!; return (m.l + m.r) * k * squeeze; });
        const space = mk.what === 'insignia' ? 0.2 * hm : mk.space * 1000;
        let wide = across(hm);
        // A number of two digits keeps the room for a 1 in front of it: the three sit centred on the
        // sail, and the 1's place stays bare (unless she carries one). Too narrow a sail for that:
        // the two digits sit in the middle.
        let lead = 0;
        if (mk.what === 'number' && chars.length === 2) {
          const slot = ID_ONE * hm + space;
          if (wide + slot + 20 <= ch * 1000) lead = slot;
        }
        wide += lead;
        const fitK = Math.min(1, (ch * 1000 - 12) / wide);
        const O = sl.S(f, 0.5), U = sl.S(f, 0.55), Vv = sl.S(Math.min(1, f + 0.05), 0.5);
        const eu = norm(sub(U, O));
        let ev = norm(sub(Vv, O));
        const kk = dot(ev, eu);
        ev = norm([ev[0] - eu[0] * kk, ev[1] - eu[1] * kk, ev[2] - eu[2] * kk]);
        const sgn = toLeech ? 1 : -1;
        const p0 = o.P(O[0], O[1], O[2]);
        const pu = o.P(O[0] + eu[0] * 0.1 * sgn, O[1] + eu[1] * 0.1 * sgn, O[2] + eu[2] * 0.1 * sgn);
        const pv = o.P(O[0] + ev[0] * 0.1, O[1] + ev[1] * 0.1, O[2] + ev[2] * 0.1);
        const ux = (pu.x - p0.x) / 100, uy = (pu.y - p0.y) / 100;
        const vx = -(pv.x - p0.x) / 100, vy = -(pv.y - p0.y) / 100;
        ctx.fillStyle = p.ink;
        ctx.globalAlpha = p.alpha * (vis ? 0.92 : 0.22) * shown;
        ctx.font = `800 100px ${FONT}`;
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        let x = (-wide / 2 + lead) * fitK;
        chars.forEach((c, i) => {
          const m = g100.get(c)!;
          // Local millimetres: x along the line of the mark, y down the sail; the character's ink box
          // is set down exactly on its place, hm tall.
          ctx.setTransform(ux * D, uy * D, vx * D, vy * D, p0.x * D, p0.y * D);
          ctx.transform(k * squeeze * fitK, 0, 0, k, x, hm / 2);
          ctx.fillText(c, m.l, 0);
          x += (widths[i] + space) * fitK;
        });
        ctx.setTransform(D, 0, 0, D, 0, 0);
        ctx.globalAlpha = p.alpha;
      }
    }
    if (size > 55) {
      for (const [f, col] of [[0.3, '#E5484D'], [0.62, '#3E7BFA']] as const) {
        const a = o.P(...sl.S(f, 0.16));
        const flutter = Math.sin(o.t * 19 + f * 7) * 3 * p.luff;
        const b = o.P(...sl.S(f - 0.04 * p.luff, 0.25));
        ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.2, tw * 1.3);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 - 1.2 + flutter, b.x, b.y + flutter); ctx.stroke();
      }
    }
    // The booms along each foot: the main's, and the jib's (a radio yacht's jib is set on a boom too).
    {
      const bt = o.P(...sl.S(0, 0)), bc = o.P(...sl.S(0, 1));
      ctx.strokeStyle = '#3A404C'; ctx.lineCap = 'round'; ctx.lineWidth = lw(sl.kind === 'main' ? 0.009 : 0.0075);
      ctx.beginPath(); ctx.moveTo(bt.x, bt.y); ctx.lineTo(bc.x, bc.y); ctx.stroke();
    }
  } });
  // The mast, in front of the sails or hidden behind them by depth.
  const mMid = g.w(r.mastX * L - 0.01 * L, 0, deck + r.mastH * 0.45);
  layers.push({ d: o.P(mMid[0], mMid[1], mMid[2]).z, draw: () => {
    // She stops at the head of the mainsail: nothing stands up above the sail.
    const m0 = o.P(...g.w(r.mastX * L, 0, deck)), m1 = o.P(...sails[0].S(1, 0));
    ctx.strokeStyle = '#3A404C'; ctx.lineCap = 'butt'; ctx.lineWidth = lw(0.011);
    ctx.beginPath(); ctx.moveTo(m0.x, m0.y); ctx.lineTo(m1.x, m1.y); ctx.stroke();
    ctx.lineCap = 'round';
  } });
  for (const l of stackOrder(g, sails, o.cam, layers)) l.draw();
  ctx.restore();
  return { top: { x: top.x, y: top.y }, base: { x: base.x, y: base.y }, size };
}

/** True wind angle of a boat for a heading (for replays, where the heading is from the history). */
export function twaFor(twd: number, hdg: number) { return n180(twd - hdg); }
