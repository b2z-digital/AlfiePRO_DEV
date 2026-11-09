// Small maths helpers for the race simulator.
// World frame: x = east (m), y = north (m). Headings and wind directions are compass
// degrees (0 = north, 90 = east). Wind direction is where the wind blows FROM.

export interface V2 { x: number; y: number }

export const DEG = Math.PI / 180;
export const KN = 0.514444; // metres per second in one knot

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => { const u = clamp(t, 0, 1); return u * u * (3 - 2 * u); };

/** Normalise to (-180, 180]. */
export function n180(d: number): number {
  let a = d % 360;
  if (a <= -180) a += 360;
  if (a > 180) a -= 360;
  return a;
}
/** Normalise to [0, 360). */
export function n360(d: number): number {
  const a = d % 360;
  return a < 0 ? a + 360 : a;
}

/** Unit vector for a compass heading. */
export function dir(hdg: number): V2 {
  return { x: Math.sin(hdg * DEG), y: Math.cos(hdg * DEG) };
}
/** Compass bearing from a to b. */
export function bearing(a: V2, b: V2): number {
  return n360(Math.atan2(b.x - a.x, b.y - a.y) / DEG);
}
export const dist = (a: V2, b: V2) => Math.hypot(b.x - a.x, b.y - a.y);
export const add = (a: V2, b: V2): V2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: V2, b: V2): V2 => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: V2, k: number): V2 => ({ x: a.x * k, y: a.y * k });
export const dot = (a: V2, b: V2) => a.x * b.x + a.y * b.y;
/** z of a × b. Positive when b is anticlockwise (to the left) of a in the x-east/y-north frame. */
export const cross = (a: V2, b: V2) => a.x * b.y - a.y * b.x;

/** Signed true wind angle: positive = wind over the starboard side (starboard tack). */
export function twaOf(hdg: number, twd: number): number {
  return n180(twd - hdg);
}

/** Closest distance between segments p1-q1 and p2-q2. */
export function segSegDist(p1: V2, q1: V2, p2: V2, q2: V2): number {
  const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2);
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
  let s: number, t: number;
  if (a <= 1e-9 && e <= 1e-9) return Math.hypot(r.x, r.y);
  if (a <= 1e-9) { s = 0; t = clamp(f / e, 0, 1); }
  else {
    const c = dot(d1, r);
    if (e <= 1e-9) { t = 0; s = clamp(-c / a, 0, 1); }
    else {
      const b = dot(d1, d2), denom = a * e - b * b;
      s = denom !== 0 ? clamp((b * f - c * e) / denom, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); }
      else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  const c1 = add(p1, mul(d1, s)), c2 = add(p2, mul(d2, t));
  return Math.hypot(c1.x - c2.x, c1.y - c2.y);
}

/** Distance from point p to segment a-b. */
export function pointSegDist(p: V2, a: V2, b: V2): number {
  const ab = sub(b, a), ap = sub(p, a);
  const t = clamp(dot(ap, ab) / Math.max(1e-9, dot(ab, ab)), 0, 1);
  return dist(p, add(a, mul(ab, t)));
}

/** Do segments a-b and c-d intersect? Returns the parameter along a-b, or -1. */
export function segIntersect(a: V2, b: V2, c: V2, d: V2): number {
  const r = sub(b, a), s = sub(d, c);
  const den = cross(r, s);
  if (Math.abs(den) < 1e-12) return -1;
  const t = cross(sub(c, a), s) / den;
  const u = cross(sub(c, a), r) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : -1;
}

/** Deterministic random numbers (mulberry32). */
export class Rng {
  private s: number;
  constructor(seed: number) { this.s = (seed >>> 0) || 1; }
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(lo: number, hi: number) { return lo + (hi - lo) * this.next(); }
  int(lo: number, hi: number) { return Math.floor(this.range(lo, hi + 1)); }
  pick<T>(xs: T[]): T { return xs[Math.min(xs.length - 1, Math.floor(this.next() * xs.length))]; }
  /** Approximately normal, mean 0, sd 1. */
  gauss(): number { let s = 0; for (let i = 0; i < 4; i++) s += this.next(); return (s - 2) * Math.sqrt(3); }
  chance(p: number) { return this.next() < p; }
}
