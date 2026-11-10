// Radio sailing classes and their performance (polars).
// Target speeds come from a simple displacement-hull model: hull speed from waterline length
// (Froude 0.4), a wind-strength curve and a true-wind-angle curve whose best upwind angle
// narrows from about 46° in very light air to about 38° in breeze (after onemetre.net's IOM model).
// Every number here is a starting point to tune against real tracks later.

import { clamp, KN } from './math';
import { datan, dcos, dexp, dpow, dsin } from './dmath';

export type ClassId = 'IOM' | 'DF95' | 'DF65' | '10R' | 'M';

export interface ClassDef {
  id: ClassId;
  name: string;
  loa: number;        // length overall, m
  beam: number;       // m
  lwl: number;        // waterline length, m
  hullSpeed: number;  // m/s
  eff: number;        // overall efficiency (heavier or simpler boats < 1)
  maxRot: number;     // deg/s with full rudder at full speed
  /** Righting moment against the rig's heeling force: apparent wind² (m²/s²) per unit of sin(heel)/cos²(heel). */
  stiffness: number;
  /** Natural roll period, s: a deep, heavy bulb makes it slow and steady. */
  rollPeriod: number;
}

function mk(id: ClassId, name: string, loa: number, beam: number, lwl: number, eff: number, stiffness: number): ClassDef {
  const hullSpeed = 0.4 * Math.sqrt(9.81 * lwl);
  return { id, name, loa, beam, lwl, hullSpeed, eff, maxRot: 105 / Math.sqrt(loa), stiffness, rollPeriod: 1.0 * Math.sqrt(loa) };
}

export const CLASSES: Record<ClassId, ClassDef> = {
  // From the class plans: the LM3 IOM (beam 173.5 mm), the Gothic M and the GothiX 10r (1225 mm waterline).
  // Stiffness is set so a boat close-hauled in 9 to 10 knots heels about 22°, as they do.
  IOM: mk('IOM', 'IOM', 1.0, 0.1735, 0.98, 1.0, 79),
  M: mk('M', 'Marblehead', 1.27, 0.16, 1.22, 1.0, 81),
  '10R': mk('10R', '10 Rater', 1.6, 0.18, 1.225, 1.0, 86),
  DF95: mk('DF95', 'DF95', 0.95, 0.19, 0.9, 0.9, 72),
  DF65: mk('DF65', 'DF65', 0.65, 0.16, 0.62, 0.88, 68),
};

/** The rig an IOM sails with in a breeze (knots): the A rig, the B from about 12½ knots, the C from 20. */
export function iomRig(knots: number): 'A' | 'B' | 'C' {
  return knots >= 20 ? 'C' : knots >= 12.5 ? 'B' : 'A';
}

/** The rig's heeling power for the breeze (1 = the class's A rig): IOMs change down as it builds. */
export function rigPower(cls: ClassId, knots: number): number {
  if (cls !== 'IOM') return 1;
  const r = iomRig(knots);
  return r === 'C' ? 0.5 : r === 'B' ? 0.72 : 1;
}

/**
 * How hard the sails heel her (about 0 to 1.3): close-hauled to a close reach the sails mostly push
 * her over, further off the wind more of their force drives her forward, and head to wind they flog.
 * Eased past the sweet spot she spills wind; over-sheeted on a reach she heels more.
 */
export function heelForce(absTwa: number, sheet: number, tws: number): number {
  const a = clamp(absTwa, 0, 180);
  const ng = noGoAngle(tws);
  if (a < ng - 4) return 0.05;
  const point = a <= 45 ? 1 : a <= 80 ? 1 + 0.15 * ((a - 45) / 35) : a <= 110 ? 1.15 - 0.25 * ((a - 80) / 30) : 0.12 + 0.78 * dcos(((a - 110) / 70) * (Math.PI / 2));
  const fill = clamp((a - (ng - 4)) / 10, 0, 1);
  // Pinching above her best close-hauled angle the sails start to lift and lose their power.
  const luff = 1 - 0.6 * clamp((upAngle(tws) - a) / 18, 0, 1);
  const e = sheet - bestSheet(a);
  const trim = e < 0 ? Math.max(0.08, 1 + 2.6 * e) : 1 + Math.min(0.35, e * (a > 70 ? 1.6 : 0.5));
  return Math.max(0.05, point * fill * luff * trim);
}

/**
 * Heel (degrees) where the bulb's righting moment balances the sails: tan φ = q. The bulb rights her
 * harder the further she goes over, but a big enough gust still lays her nearly flat.
 */
export function heelFor(q: number): number {
  if (q <= 1e-6) return 0;
  return Math.min(85, (datan(q) * 180) / Math.PI);
}

/** Best close-hauled true wind angle (deg) for a wind speed in m/s. */
export function upAngle(tws: number): number {
  const kn = tws / KN;
  return 46 - 8 * clamp((kn - 2) / 12, 0, 1);
}
/** Below this angle the sails can't drive the boat. */
export function noGoAngle(tws: number): number {
  return upAngle(tws) - 18;
}

/** Speed factor for a true wind angle (0..180), 1.0 = best reaching speed. */
function angleFactor(a: number, tws: number): number {
  const kn = tws / KN;
  const up = upAngle(tws), ng = up - 18;
  if (a < ng) return 0;
  // Pinching: she slows steadily as she points above her best angle, to nothing head to wind.
  if (a < up) return 0.78 * ((a - ng) / (up - ng));
  if (a < 95) return 0.78 + 0.22 * dsin(((a - up) / (95 - up)) * Math.PI / 2);
  if (a < 140) return 1 - 0.12 * dpow((a - 95) / 45, 1.5);
  const drop = 0.16 - 0.1 * clamp((kn - 4) / 10, 0, 1);
  return 0.88 - drop * ((a - 140) / 40);
}

/** Target boat speed (m/s) for a class, true wind speed (m/s) and |true wind angle| (deg). */
export function polarSpeed(c: ClassDef, tws: number, absTwa: number): number {
  const kn = tws / KN;
  const base = 1 - dexp(-kn / 6);
  let v = c.hullSpeed * base * angleFactor(absTwa, tws) * 1.15 * c.eff;
  if (absTwa > 110 && kn > 12) v *= 1 + 0.25 * clamp((kn - 12) / 8, 0, 1); // surfing in breeze
  return v;
}

export interface VmgAngles { up: number; down: number; upVmg: number; downVmg: number; upSpeed: number; downSpeed: number }
const vmgCache = new Map<string, VmgAngles>();

/** Best upwind and downwind angles for a class at a wind speed (cached to 0.25 m/s). */
export function vmgAngles(c: ClassDef, twsIn: number): VmgAngles {
  const q = Math.round(twsIn * 4);
  const key = `${c.id}:${q}`;
  const hit = vmgCache.get(key);
  if (hit) return hit;
  const tws = q / 4; // computed at the cached wind speed, so results never depend on call order
  let up = 45, upV = 0, upS = 0, dn = 170, dnV = 0, dnS = 0;
  for (let a = 25; a <= 80; a += 0.5) {
    const s = polarSpeed(c, tws, a), v = s * dcos(a * Math.PI / 180);
    if (v > upV) { upV = v; up = a; upS = s; }
  }
  // Never dead downwind: a boat running needs a definite gybe (and boom side) to be on.
  for (let a = 120; a <= 165; a += 0.5) {
    const s = polarSpeed(c, tws, a), v = -s * dcos(a * Math.PI / 180);
    if (v > dnV) { dnV = v; dn = a; dnS = s; }
  }
  const r = { up, down: dn, upVmg: upV, downVmg: dnV, upSpeed: upS, downSpeed: dnS };
  vmgCache.set(key, r);
  return r;
}

/** Best sheet setting (0 = fully eased, 1 = fully in) for |true wind angle|. */
export function bestSheet(absTwa: number): number {
  const a = clamp(absTwa, 0, 180);
  if (a <= 45) return 0.95 - (a / 45) * 0.08;
  if (a <= 90) return 0.87 - ((a - 45) / 45) * 0.37;
  if (a <= 135) return 0.5 - ((a - 90) / 45) * 0.22;
  return 0.28 - ((a - 135) / 45) * 0.13;
}

/** Drive lost to wrong trim: 1 = perfect. Under-sheeting (luffing) costs more than over-sheeting. */
export function trimEfficiency(sheet: number, absTwa: number): number {
  const e = sheet - bestSheet(absTwa);
  if (e >= 0) return Math.max(0.12, 1 - 2.4 * e * e);
  return Math.max(0.05, 1 - 3.6 * e * e);
}

/** Time constant (s) for speed to build towards target; light air is slow. */
export function accelTau(tws: number): number {
  return 1.5 + 12 / (tws / KN + 1);
}
