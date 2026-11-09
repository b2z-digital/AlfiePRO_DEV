// Boat physics: wind at each boat (with wind shadow and backwind), speed, turning,
// tacks and gybes as real turns, being caught in irons, and collisions.

import { accelTau, bestSheet, noGoAngle, polarSpeed, trimEfficiency, upAngle } from './classes';
import { Course } from './course';
import { V2, clamp, cross, dir, dot, n180, n360, sub, twaOf } from './math';
import type { Boat } from './types';
import type { WindField } from './wind';

export const DT = 0.05;

export function bow(b: Boat): V2 {
  const d = dir(b.hdg), h = b.cls.loa / 2;
  return { x: b.x + d.x * h, y: b.y + d.y * h };
}
export function stern(b: Boat): V2 {
  const d = dir(b.hdg), h = b.cls.loa / 2;
  return { x: b.x - d.x * h, y: b.y - d.y * h };
}
/** Capsule core segment (bow and stern pulled in by the half-beam). */
export function capsule(b: Boat, x = b.x, y = b.y, hdg = b.hdg): [V2, V2, number] {
  const d = dir(hdg), r = b.cls.beam / 2, h = b.cls.loa / 2 - r;
  return [{ x: x - d.x * h, y: y - d.y * h }, { x: x + d.x * h, y: y + d.y * h }, r];
}

/** Wind each boat actually gets: the field, minus shadow from boats upwind, plus backwind. */
export function localWind(boats: Boat[], wind: WindField, t: number) {
  const base = boats.map(b => wind.sample(b.x, b.y, t));
  for (let i = 0; i < boats.length; i++) {
    const a = boats[i];
    let loss = 0, header = 0;
    if (!a.finished && !a.retired) {
      for (let j = 0; j < boats.length; j++) {
        if (i === j) continue;
        const b = boats[j];
        if (b.finished || b.retired) continue;
        const L = b.cls.loa;
        const d = { x: a.x - b.x, y: a.y - b.y };
        const dd = Math.hypot(d.x, d.y);
        if (dd > 8 * L) continue;
        // Shadow: a cone downwind of b's sail.
        const w = dir(base[j].twd + 180);
        const along = dot(d, w);
        const across = Math.abs(cross(w, d));
        if (along > 0.2 * L && along < 7 * L) {
          const hw = 0.45 * L + 0.22 * along;
          if (across < hw) {
            const k = (1 - along / (7 * L)) * (1 - (across / hw) ** 2);
            loss += 0.3 * k;
          }
        }
        // Backwind: a's sails get b's disturbed air when b is close to leeward and a little ahead.
        if (Math.abs(b.twa) < 75 && Math.abs(a.twa) < 75 && a.tack === b.tack) {
          const f = dir(b.hdg);
          const side = b.tack === 'stbd' ? { x: f.y, y: -f.x } : { x: -f.y, y: f.x }; // b's windward side
          const fa = dot(d, f), sa = dot(d, side);
          if (sa > 0.15 * L && sa < 1.7 * L && fa > -2.2 * L && fa < 0.5 * L) {
            const k = (1 - sa / (1.7 * L)) * (1 - Math.abs(fa + 0.6 * L) / (1.8 * L));
            if (k > 0) { loss += 0.14 * k; header += 6 * k; }
          }
        }
      }
    }
    loss = clamp(loss, 0, 0.6);
    const twd = a.tack === 'stbd' ? base[i].twd - header : base[i].twd + header;
    a.twd = n360(twd);
    a.tws = base[i].tws * (1 - loss);
    a.shadow = loss;
  }
}

/** Integrate one boat for one step. Returns 'tack' or 'gybe' when the boat passed through the wind. */
export function integrate(b: Boat, dt: number, t: number): 'tack' | 'gybe' | null {
  const c = b.cls;
  const twa = twaOf(b.hdg, b.twd);
  const a = Math.abs(twa);
  const ng = noGoAngle(b.tws);
  const perfect = polarSpeed(c, b.tws, a);
  b.targetSpd = perfect;
  let target = perfect * trimEfficiency(b.sheet, a);
  const drag = 1 - 0.3 * b.rudder * b.rudder * clamp(b.spd / c.hullSpeed, 0, 1);
  target *= drag;
  const tau = target > b.spd ? accelTau(b.tws) : a < ng ? 0.9 : 1.3;
  b.spd += (target - b.spd) * (1 - Math.exp(-dt / tau));
  if (b.spd < 0) b.spd = 0;

  const steer = clamp(b.spd / (0.35 * c.hullSpeed), a < ng + 4 ? 0.32 : 0.16, 1);
  const rotTarget = b.rudder * c.maxRot * steer;
  b.rot += (rotTarget - b.rot) * (1 - Math.exp(-dt / 0.12));
  b.hdg = n360(b.hdg + b.rot * dt);

  const v = dir(b.hdg);
  let vx = v.x * b.spd, vy = v.y * b.spd;
  if (a < ng) {
    // In irons: the wind pushes her backwards.
    const back = dir(b.twd + 180);
    const k = 0.07 * b.tws * (1 - a / ng);
    vx += back.x * k; vy += back.y * k;
  }
  b.x += vx * dt; b.y += vy * dt;
  b.distSailed += Math.hypot(vx, vy) * dt;

  const newTwa = twaOf(b.hdg, b.twd);
  b.twa = newTwa;
  // Her tack is her windward side. Running, the boom stays where it is until she is well by the lee,
  // so a boat sailing dead downwind doesn't flip between port and starboard (RRS definitions).
  let newTack = b.tack;
  if (b.tack === 'stbd' && newTwa < 0 && newTwa > -168) newTack = 'port';
  else if (b.tack === 'port' && newTwa > 0 && newTwa < 168) newTack = 'stbd';
  const passed: 'tack' | 'gybe' | null = newTack !== b.tack ? (Math.abs(newTwa) < 90 ? 'tack' : 'gybe') : null;
  if (passed === 'tack') {
    b.lastTackFrom = b.tack;
    b.tackingSince = t;
    b.lastHtwT = t;
  }
  if (passed === 'gybe') b.lastGybeT = t;
  b.tack = newTack;
  // Rule 13 ends when she is on a close-hauled course (or further off the wind).
  if (b.tackingSince !== null && Math.abs(newTwa) >= upAngle(b.tws) - 3) b.tackingSince = null;
  if (b.tackingSince !== null && t - b.tackingSince > 6) b.tackingSince = null; // stuck in irons: not "tacking" for ever
  return passed;
}

/** Sheet the AI or the auto-trim uses for an angle. */
export function autoSheet(b: Boat): number {
  return bestSheet(Math.abs(b.twa));
}

export interface ContactPair { a: number; b: number; depth: number }

/** Push overlapping hulls apart and slow them. Returns the pairs in contact this step. */
export function collide(boats: Boat[]): ContactPair[] {
  const out: ContactPair[] = [];
  for (let i = 0; i < boats.length; i++) {
    const A = boats[i];
    if (A.finished || A.retired) continue;
    for (let j = i + 1; j < boats.length; j++) {
      const B = boats[j];
      if (B.finished || B.retired) continue;
      const reach = (A.cls.loa + B.cls.loa) / 2 + 0.05;
      if (Math.abs(A.x - B.x) > reach || Math.abs(A.y - B.y) > reach) continue;
      const [a0, a1, ra] = capsule(A), [b0, b1, rb] = capsule(B);
      const { d, pa, pb } = closest(a0, a1, b0, b1);
      const depth = ra + rb - d;
      if (depth > 0) {
        out.push({ a: i, b: j, depth });
        let n = sub(pa, pb);
        const len = Math.hypot(n.x, n.y) || 1e-6;
        n = { x: n.x / len, y: n.y / len };
        const push = depth / 2 + 0.012 * Math.min(A.cls.loa, B.cls.loa); // bounce apart a little
        A.x += n.x * push; A.y += n.y * push;
        B.x -= n.x * push; B.y -= n.y * push;
        A.spd *= 0.86; B.spd *= 0.86;
      }
    }
  }
  return out;
}

/** Boats touching marks. Returns the boat index and mark id for each touch. */
export function markContacts(boats: Boat[], course: Course): { boat: number; mark: string }[] {
  const out: { boat: number; mark: string }[] = [];
  for (let i = 0; i < boats.length; i++) {
    const b = boats[i];
    if (b.finished || b.retired) continue;
    for (const m of course.marks) {
      if (Math.abs(b.x - m.p.x) > b.cls.loa || Math.abs(b.y - m.p.y) > b.cls.loa) continue;
      const [c0, c1, r] = capsule(b);
      const { d, p } = closestOnSeg(m.p, c0, c1);
      const depth = r + m.r - d;
      if (depth > 0) {
        out.push({ boat: i, mark: m.id });
        let n = sub(p, m.p);
        const len = Math.hypot(n.x, n.y) || 1e-6;
        n = { x: n.x / len, y: n.y / len };
        b.x += n.x * (depth + 0.002); b.y += n.y * (depth + 0.002);
        b.spd *= 0.8;
      }
    }
  }
  return out;
}

/** Keep boats inside the pond: they stop against the bank. */
export function bank(b: Boat, course: Course): boolean {
  const d = sub({ x: b.x, y: b.y }, course.origin);
  const along = dot(d, course.up), across = dot(d, course.right);
  const B = course.bounds;
  let hit = false;
  let na = along, nc = across;
  if (along < B.alongMin) { na = B.alongMin; hit = true; }
  if (along > B.alongMax) { na = B.alongMax; hit = true; }
  if (across < -B.across) { nc = -B.across; hit = true; }
  if (across > B.across) { nc = B.across; hit = true; }
  if (hit) {
    b.x = course.origin.x + course.up.x * na + course.right.x * nc;
    b.y = course.origin.y + course.up.y * na + course.right.y * nc;
    // Lose the speed going into the bank; a boat sliding along it keeps some way on.
    const v = dir(b.hdg);
    const into = Math.max(0, (na !== along ? Math.sign(along - na) * dot(v, course.up) : 0) + (nc !== across ? Math.sign(across - nc) * dot(v, course.right) : 0));
    b.spd *= 1 - 0.5 * Math.min(1, into);
  }
  return hit;
}

function closestOnSeg(p: V2, a: V2, b: V2): { d: number; p: V2 } {
  const ab = sub(b, a), ap = sub(p, a);
  const t = clamp(dot(ap, ab) / Math.max(1e-9, dot(ab, ab)), 0, 1);
  const q = { x: a.x + ab.x * t, y: a.y + ab.y * t };
  return { d: Math.hypot(p.x - q.x, p.y - q.y), p: q };
}

/** Closest points between two segments. */
export function closest(p1: V2, q1: V2, p2: V2, q2: V2): { d: number; pa: V2; pb: V2 } {
  const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2);
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
  let s = 0, t = 0;
  if (a > 1e-9 && e > 1e-9) {
    const c = dot(d1, r), b = dot(d1, d2), den = a * e - b * b;
    s = den !== 0 ? clamp((b * f - c * e) / den, 0, 1) : 0;
    t = (b * s + f) / e;
    if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
  } else if (a > 1e-9) { s = clamp(-dot(d1, r) / a, 0, 1); }
  else if (e > 1e-9) { t = clamp(f / e, 0, 1); }
  const pa = { x: p1.x + d1.x * s, y: p1.y + d1.y * s };
  const pb = { x: p2.x + d2.x * t, y: p2.y + d2.y * t };
  return { d: Math.hypot(pa.x - pb.x, pa.y - pb.y), pa, pb };
}

/** Minimum gap between two hulls (negative = overlapping). */
export function hullGap(a: Boat, b: Boat, ax = a.x, ay = a.y, ah = a.hdg, bx = b.x, by = b.y, bh = b.hdg): number {
  const [a0, a1, ra] = capsule(a, ax, ay, ah), [b0, b1, rb] = capsule(b, bx, by, bh);
  return closest(a0, a1, b0, b1).d - ra - rb;
}

/** Signed distance of a point from the start/finish line: positive = course side (upwind). */
export function lineSide(course: Course, p: V2): number {
  const l = sub(course.start.stbd, course.start.pin);
  const len = Math.hypot(l.x, l.y);
  return cross(l, sub(p, course.start.pin)) / len;
}

export { n180 };
