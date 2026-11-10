// After the finish, as skippers do on the water: a boat sails on through the line, turns away to
// the nearer end and waits beyond it, out of the way of the boats still racing, instead of
// stopping dead on the line. She is out of the race by then and nothing she does touches the boats
// still racing (no collisions with them, no wind shadow, no marks: see collide, localWind and
// markContacts), so sailing clear can't change anyone's result; boats waiting can bump each other.
// All of it runs in the engine, the same on every screen in a live race and in every replay.

import { bestSheet, noGoAngle } from './classes';
import { Course, fromCourse, toCourse } from './course';
import { V2, add, bearing, clamp, dir, dist, mul, n180, n360, sub } from './math';
import { bankAhead, lineSide } from './physics';
import type { Boat } from './types';
import { nearestShore, shoreWet } from './venue';

export interface Clearing {
  /** Where she waits. */
  spot: V2;
  /** When she finished. */
  t0: number;
  /** Through the line far enough to turn away. */
  clear: boolean;
  /** Waiting at her spot: luffed up with the sail let out. */
  parked: boolean;
  /** Turned away from a boat she was closing on: by how much (degrees), whether she's slowed to let
   *  it by, and until when. */
  dodge: number;
  slow: boolean;
  dodgeUntil: number;
}

/** Waiting spots: lengths beyond the line, outside its end, and between boats. */
const UP = 4.5, OUT = 5, GAP = 2.2, ROW = 2.6;

/** Inside the pond, on the water and well off the bank. */
function open(course: Course, p: V2, L: number): boolean {
  const { along, across } = toCourse(course, p);
  const B = course.bounds;
  if (along > B.alongMax - 2 * L || along < B.alongMin + 2 * L || Math.abs(across) > B.across - 2 * L) return false;
  const sh = course.shore;
  return !sh || (shoreWet(sh, p) && nearestShore(sh, p).d > 2.5 * L);
}

/**
 * Her waiting spot, chosen as she finishes: off the end of the line she's nearer (allowing for the
 * way she's heading), in rows beyond the line, each boat a place of her own. `taken` are the spots
 * of the boats that finished before her.
 */
export function startClearing(course: Course, b: Boat, t: number, taken: V2[]): Clearing {
  const L = b.cls.loa;
  const pin = toCourse(course, course.finish.pin), stbd = toCourse(course, course.finish.stbd);
  const ahead = toCourse(course, add(b, mul(dir(b.hdg), 3 * L)));
  const first = ahead.across >= (pin.across + stbd.across) / 2 ? 1 : -1;
  for (const side of [first, -first]) {
    const end = side > 0 ? stbd : pin;
    for (let k = 0; k < 48; k++) {
      const row = Math.floor(k / 6), col = k % 6;
      const p = fromCourse(course, end.along + (UP + row * ROW) * L, end.across + side * (OUT + col * GAP) * L);
      if (taken.some(q => dist(q, p) < 1.6 * L) || !open(course, p, L)) continue;
      return { spot: p, t0: t, clear: false, parked: false, dodge: 0, slow: false, dodgeUntil: -1 };
    }
  }
  // Nowhere off either end (a narrow bit of water): straight on, beyond the line.
  const at = toCourse(course, b);
  return { spot: fromCourse(course, Math.max(at.along, 0) + (UP + 2) * L, at.across), t0: t, clear: false, parked: false, dodge: 0, slow: false, dodgeUntil: -1 };
}

/** The heading for p: straight at it if she can, else close-hauled, tacking once the other tack lays it. */
function toward(b: Boat, p: V2): number {
  const want = bearing(b, p);
  const ng = noGoAngle(b.tws) + 8;
  return Math.abs(n180(want - b.twd)) >= ng ? want : n360(b.twd + (b.tack === 'stbd' ? -ng : ng));
}

/** Not into the bank: the nearest heading either side that's sailable and clear for a few lengths. */
function offBank(b: Boat, course: Course, hdg: number): number {
  const L = b.cls.loa;
  if (bankAhead(b, course, hdg) > 2.5 * L) return hdg;
  const ng = noGoAngle(b.tws) + 4;
  for (const a of [20, -20, 40, -40, 60, -60, 90, -90, 120, -120, 150, -150]) {
    const h = n360(hdg + a);
    if (Math.abs(n180(b.twd - h)) >= ng && bankAhead(b, course, h) > 3.5 * L) return h;
  }
  return hdg;
}

/**
 * Keeping out of everyone's way (Rule 23.1: a boat not racing doesn't interfere with one racing),
 * those waiting included: the turn from `hdg` (degrees, nearest first) that keeps her clear of every
 * boat for the next few seconds; if no turn does, the least bad one, slowly (`slow`).
 */
function giveWay(b: Boat, i: number, boats: Boat[], hdg: number): { off: number; slow: boolean } {
  const L = b.cls.loa;
  const near = boats.filter((o, j) => j !== i && !o.retired && Math.abs(o.x - b.x) < 8 * L && Math.abs(o.y - b.y) < 8 * L);
  if (!near.length) return { off: 0, slow: false };
  const sp = Math.max(b.spd, 0.3 * b.cls.hullSpeed);
  const ng = noGoAngle(b.tws) + 4;
  let best = 0, bestGap = -Infinity;
  for (const a of [0, 20, -20, 40, -40, 60, -60, 90, -90]) {
    if (Math.abs(n180(b.twd - (hdg + a))) < ng) continue;
    const v = mul(dir(hdg + a), sp);
    // How much room this course leaves: closer than now, or under a length or so, is too close.
    let gap = Infinity;
    for (const o of near) {
      const r = sub(o, b), w = sub(mul(dir(o.hdg), o.spd), v);
      const ww = w.x * w.x + w.y * w.y;
      const tc = ww > 1e-9 ? clamp(-(r.x * w.x + r.y * w.y) / ww, 0, 4) : 0;
      const miss = dist({ x: 0, y: 0 }, add(r, mul(w, tc)));
      gap = Math.min(gap, miss - Math.min(1.15 * L, dist(o, b)));
    }
    if (gap >= 0) return { off: a, slow: false };
    if (gap > bestGap) { bestGap = gap; best = a; }
  }
  return { off: best, slow: true };
}

/** Rudder for a heading (the long way round if she's too slow to tack through a big turn). */
function steer(b: Boat, hdg: number) {
  let err = n180(hdg - b.hdg);
  if (Math.abs(err) > 60 && b.spd < 0.3 * b.cls.hullSpeed) {
    const twaEnd = b.twa - err;
    if (Math.sign(twaEnd) !== Math.sign(b.twa) && Math.abs(twaEnd) < 180 && Math.abs(b.twa) > noGoAngle(b.tws)) err = err > 0 ? err - 360 : err + 360;
  }
  b.rudder = clamp(err / 22 - b.rot / 260, -1, 1);
}

/** Each step after she finishes: helm and sheet to sail clear to her spot, and wait there. */
export function sailClear(b: Boat, i: number, c: Clearing, boats: Boat[], course: Course, t: number) {
  const L = b.cls.loa;
  if (!c.clear && (lineSide(course, b) > 1.5 * L || t - c.t0 > 6)) c.clear = true;
  const d = dist(b, c.spot);
  if (c.parked && d > 3 * L) c.parked = false;
  else if (!c.parked && c.clear && d < 1.2 * L) c.parked = true;
  let hdg: number, sheet: number;
  if (!c.clear) {
    // On through the line first, the way she was going; if she shot the line head to wind, she
    // bears away to close-hauled to get going again.
    const ng = noGoAngle(b.tws) + 6;
    hdg = Math.abs(b.twa) >= ng ? b.hdg : n360(b.twd + (b.tack === 'stbd' ? -ng : ng));
    sheet = bestSheet(Math.max(Math.abs(b.twa), ng), b.tws);
  } else if (c.parked) {
    // Waiting: luffed up on a close reach with the sail let right out, she all but stops. She
    // drifts a little, and sails back up when she's drifted off her spot.
    hdg = n360(b.twd + (b.tack === 'stbd' ? -60 : 60));
    sheet = 0;
  } else {
    hdg = offBank(b, course, toward(b, c.spot));
    // Having turned away from someone, she holds it a moment rather than weaving.
    if (t >= c.dodgeUntil) {
      const g = giveWay(b, i, boats, hdg);
      c.dodge = g.off; c.slow = g.slow;
      c.dodgeUntil = g.off || g.slow ? t + 1.2 : t + 0.25;
    }
    if (Math.abs(n180(b.twd - (hdg + c.dodge))) >= noGoAngle(b.tws) + 4) hdg = n360(hdg + c.dodge);
    // Easing a little as she arrives, so she doesn't charge in, and to slow for someone.
    sheet = bestSheet(Math.abs(n180(b.twd - hdg)), b.tws) * clamp(d / (2.5 * L), 0.6, 1) * (c.slow ? 0.6 : 1);
  }
  steer(b, hdg);
  b.sheet = clamp(sheet, 0, 1);
}
