// Live Tracking: everything worked out from the tags' fixes. Pure and synchronous, so it runs the
// same on the live view, the race officer's console, the replay and the tests.
//
// Positions are local metres from the anchors (x, y); headings are compass degrees in that frame
// (0 = +y). A tag sits somewhere on the hull, so every start, finish and contact is measured from
// the hull itself: the bow is `bow` metres ahead of the tag along the heading, the stern
// `length − bow` behind it. "Any part of the hull" is whichever of the two is further across a line.

export interface V2 { x: number; y: number }
/** One fix: seconds (any clock, the same for every boat and the gun), metres, and the tag's own
 *  heading if it has a compass (null: worked out from the track). */
export interface Fix { t: number; x: number; y: number; h?: number | null }
export interface TrackedBoat {
  id: string;
  sail: string;
  name: string;
  color: string;
  /** Tag to bow (m). */
  bow: number;
  /** Hull length (m). */
  length: number;
  /** In time order. */
  fixes: Fix[];
}
export type Side = 'port' | 'starboard';
export interface CourseMark { id: string; name: string; p: V2; rounding: Side | null }
/** A mark to round, or a gate: round either of its two marks. */
export interface Waypoint { kind: 'mark' | 'gate'; name: string; marks: CourseMark[] }
export interface Line { pin: V2; boat: V2 }
export interface TrackedCourse {
  start: Line;
  finish: Line;
  waypoints: Waypoint[];
  /** The wind the course was laid for (compass, from), if known. */
  windDeg: number | null;
}
export interface TrackingSetup {
  /** Position accuracy (m): anything closer is too close to call. */
  accuracy: number;
  /** A mark counts as rounded once a boat comes within this distance of it. */
  roundingM: number;
  /** Hulls closer than this are a close encounter. */
  closeM: number;
  /** A racing boat slower than 0.1 m/s for this long has stopped. */
  stoppedS: number;
  /** A tag silent for this long is lost. */
  lostS: number;
}
export const DEFAULT_SETUP: TrackingSetup = { accuracy: 0.05, roundingM: 2, closeM: 0.3, stoppedS: 20, lostS: 5 };

// ── Vectors ──
const sub = (a: V2, b: V2): V2 => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: V2, b: V2): V2 => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: V2, k: number): V2 => ({ x: a.x * k, y: a.y * k });
const dot = (a: V2, b: V2) => a.x * b.x + a.y * b.y;
const len = (a: V2) => Math.hypot(a.x, a.y);
export const dist = (a: V2, b: V2) => Math.hypot(a.x - b.x, a.y - b.y);
const dir = (deg: number): V2 => ({ x: Math.sin(deg * Math.PI / 180), y: Math.cos(deg * Math.PI / 180) });
const bearing = (v: V2) => ((Math.atan2(v.x, v.y) * 180 / Math.PI) + 360) % 360;
/** Signed difference a − b in (−180, 180]. */
export const angDiff = (a: number, b: number) => { const d = ((a - b) % 360 + 540) % 360 - 180; return d === -180 ? 180 : d; };
const mid = (l: Line): V2 => mul(add(l.pin, l.boat), 0.5);

// ── Where a boat is at any moment ──
export interface BoatState { x: number; y: number; h: number; spd: number; fresh: boolean }

/** The last fix at or before t (binary search); -1 before the first. */
function fixIndex(fixes: Fix[], t: number): number {
  let lo = 0, hi = fixes.length - 1;
  if (hi < 0 || t < fixes[0].t) return -1;
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1;
    if (fixes[m].t <= t) lo = m; else hi = m - 1;
  }
  return lo;
}

function posAt(fixes: Fix[], t: number): V2 | null {
  const i = fixIndex(fixes, t);
  if (i < 0) return null;
  const a = fixes[i], b = fixes[i + 1];
  if (!b) return { x: a.x, y: a.y };
  const k = (t - a.t) / Math.max(1e-6, b.t - a.t);
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

/** State at t, interpolated. Heading from the tag's compass if it has one, else from the track
 *  (over ±0.4 s), held through moments the boat is all but stopped. */
export function stateAt(b: TrackedBoat, t: number, lostS = DEFAULT_SETUP.lostS): BoatState | null {
  const f = b.fixes;
  const i = fixIndex(f, t);
  if (i < 0) return null;
  const p = posAt(f, t)!;
  const fresh = t - f[i].t <= lostS && (i + 1 < f.length || t - f[i].t <= lostS);
  const p0 = posAt(f, t - 0.4) ?? p, p1 = posAt(f, Math.min(t + 0.4, f[f.length - 1].t)) ?? p;
  const v = sub(p1, p0);
  const dt = Math.max(1e-3, Math.min(t + 0.4, f[f.length - 1].t) - Math.max(t - 0.4, f[0].t));
  const spd = len(v) / dt;
  let h: number;
  const a = f[i], c = f[i + 1];
  if (a.h != null && Number.isFinite(a.h)) {
    h = c && c.h != null ? a.h + angDiff(c.h, a.h) * ((t - a.t) / Math.max(1e-6, c.t - a.t)) : a.h;
  } else if (spd > 0.12) {
    h = bearing(v);
  } else {
    // Stopped: the last heading she had while moving (up to 10 s back).
    h = NaN;
    for (let back = 0.5; back <= 10 && Number.isNaN(h); back += 0.5) {
      const q0 = posAt(f, t - back - 0.4), q1 = posAt(f, t - back + 0.4);
      if (q0 && q1 && dist(q0, q1) / 0.8 > 0.12) h = bearing(sub(q1, q0));
    }
    if (Number.isNaN(h)) h = 0;
  }
  return { x: p.x, y: p.y, h: (h + 360) % 360, spd, fresh };
}

/** The bow and the stern at t. */
export function hullAt(b: TrackedBoat, t: number): { bow: V2; stern: V2; s: BoatState } | null {
  const s = stateAt(b, t);
  if (!s) return null;
  const d = dir(s.h);
  return { bow: add(s, mul(d, b.bow)), stern: sub(s, mul(d, b.length - b.bow)), s };
}

// ── Lines ──
/** A line, and the direction that counts as crossing it (unit normal). */
interface Gate { a: V2; b: V2; n: V2 }
function lineGate(l: Line, towards: V2): Gate {
  const along = sub(l.boat, l.pin);
  let n = { x: -along.y, y: along.x };
  n = mul(n, 1 / (len(n) || 1));
  if (dot(sub(towards, mid(l)), n) < 0) n = mul(n, -1);
  return { a: l.pin, b: l.boat, n };
}
/** How far across the line (m, positive = crossed) and where along it (0 pin … 1 other end). */
function across(g: Gate, p: V2) {
  const ab = sub(g.b, g.a);
  return { d: dot(sub(p, g.a), g.n), u: dot(sub(p, g.a), ab) / dot(ab, ab) };
}
/** The furthest-across part of the hull. */
function hullAcross(g: Gate, h: { bow: V2; stern: V2 }) {
  const b = across(g, h.bow), s = across(g, h.stern);
  return b.d >= s.d ? b : s;
}

/** First moment after t0 (and before t1) the hull crosses the gate between its ends, with the
 *  crossing interpolated between fixes. With `clearFirst`, the hull must first be wholly behind. */
function firstCrossing(b: TrackedBoat, g: Gate, t0: number, t1: number, clearFirst: boolean, slackM = 0.5): { t: number; u: number } | null {
  const slack = slackM / (dist(g.a, g.b) || 1);
  let prev: { t: number; d: number; u: number } | null = null;
  let clear = !clearFirst;
  const times = b.fixes.filter(f => f.t >= t0 - 0.5 && f.t <= t1).map(f => f.t);
  if (times.length && times[0] > t0) times.unshift(t0);
  for (const t of times) {
    if (t < t0) continue;
    const h = hullAt(b, t);
    if (!h) continue;
    const c = hullAcross(g, h);
    if (!clear) { if (c.d < 0) clear = true; prev = { t, ...c }; continue; }
    if (prev && prev.d < 0 && c.d >= 0) {
      const k = prev.d / (prev.d - c.d);
      const u = prev.u + (c.u - prev.u) * k;
      if (u >= -slack && u <= 1 + slack) return { t: prev.t + (t - prev.t) * k, u };
    }
    prev = { t, ...c };
  }
  return null;
}

/** First moment after t0 that the whole hull is at least `depth` behind the line. */
function firstDip(b: TrackedBoat, g: Gate, t0: number, t1: number, depth: number): number | null {
  for (const f of b.fixes) {
    if (f.t < t0) continue;
    if (f.t > t1) break;
    const h = hullAt(b, f.t);
    if (h && hullAcross(g, h).d < -depth) return f.t;
  }
  return null;
}

// ── The race ──
export interface StartCall {
  boatId: string;
  /** Hull across the line at the gun (m): positive is over. */
  atGun: number;
  call: 'clear' | 'close' | 'over';
  speedAtGun: number;
  /** When she started (crossed, having been wholly behind the line after the gun if she was over). */
  startedAt: number | null;
  /** Where along the line she crossed (0 pin … 1 other end). */
  lineAt: number | null;
}
export interface RoundingEvent { boatId: string; wp: number; markId: string; t: number; closest: number; side: Side | null; wrongSide: boolean }
export interface FinishCall {
  boatId: string;
  t: number;
  /** Boats she can't be split from: within the accuracy when the first of them crossed. */
  tooClose: string[];
  /** The gap (m) to the next boat home, when she crossed. */
  margin: number | null;
}
export interface Encounter { a: string; b: string; t: number; closest: number; contact: boolean; situation: 'same tack' | 'opposite tacks' | 'crossing' | 'unknown'; turns: { boatId: string; t: number }[] }
export interface PenaltyTurn { boatId: string; t: number; encounter: number | null }
export interface Alert { boatId: string; kind: 'stopped' | 'lost'; since: number }

export interface RaceAnalysis {
  gun: number | null;
  now: number;
  starts: StartCall[];
  roundings: RoundingEvent[];
  finishes: FinishCall[];
  encounters: Encounter[];
  turns: PenaltyTurn[];
  alerts: Alert[];
  /** The next waypoint index for each boat now (waypoints.length: on the way to the finish). */
  nextWp: Record<string, number>;
  missed: { boatId: string; wp: number; t: number }[];
  legLengths: number[];
}

function wpPoint(c: TrackedCourse, wp: number, from: V2): V2 {
  if (wp >= c.waypoints.length) return mid(c.finish);
  const w = c.waypoints[wp];
  if (w.kind === 'gate') return mul(w.marks.reduce((s, m) => add(s, m.p), { x: 0, y: 0 }), 1 / w.marks.length);
  void from;
  return w.marks[0].p;
}
export function legLengths(c: TrackedCourse): number[] {
  const out: number[] = [];
  let prev = mid(c.start);
  for (let i = 0; i <= c.waypoints.length; i++) {
    const p = wpPoint(c, i, prev);
    out.push(dist(prev, p));
    prev = p;
  }
  return out;
}

/** Where a boat passes each waypoint. For a mark: a ray from the mark out to the side boats pass it
 *  on (the outside of the turn the course makes there), crossed within `reach` metres; the way she
 *  crosses it tells which side she left the mark. For a gate: the line between its marks, crossed
 *  the way the course goes. */
interface Passage { kind: 'ray' | 'gate'; a: V2; b: V2; out: V2; wp: number }
function passages(c: TrackedCourse, reach: number): Passage[] {
  const out: Passage[] = [];
  for (let i = 0; i < c.waypoints.length; i++) {
    const w = c.waypoints[i];
    const prev = i === 0 ? mid(c.start) : wpPoint(c, i - 1, mid(c.start));
    const next = i + 1 < c.waypoints.length ? wpPoint(c, i + 1, mid(c.finish)) : mid(c.finish);
    const here = wpPoint(c, i, prev);
    const uin = mul(sub(here, prev), 1 / (dist(here, prev) || 1));
    const uout = mul(sub(next, here), 1 / (dist(next, here) || 1));
    if (w.kind === 'gate' && w.marks.length === 2) {
      out.push({ kind: 'gate', a: w.marks[0].p, b: w.marks[1].p, out: uin, wp: i });
    } else {
      let r = sub(uin, uout);
      if (len(r) < 1e-3) r = { x: -uin.y, y: uin.x };
      r = mul(r, 1 / len(r));
      const m = w.marks[0].p;
      out.push({ kind: 'ray', a: m, b: add(m, mul(r, reach)), out: r, wp: i });
    }
  }
  return out;
}
/** Does the move p→q cross segment a→b? Returns the fraction along p→q and along a→b. */
function segX(p: V2, q: V2, a: V2, b: V2): { k: number; u: number } | null {
  const r = sub(q, p), s = sub(b, a);
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-12) return null;
  const ap = sub(a, p);
  const k = (ap.x * s.y - ap.y * s.x) / den;
  const u = (ap.x * r.y - ap.y * r.x) / den;
  return k >= 0 && k <= 1 && u >= 0 && u <= 1 ? { k, u } : null;
}

function roundingsFor(b: TrackedBoat, c: TrackedCourse, from: number, to: number, set: TrackingSetup, out: RoundingEvent[], missed: { boatId: string; wp: number; t: number }[]): number {
  const ps = passages(c, Math.max(8, set.roundingM * 6));
  let wp = 0;
  let prev: Fix | null = null;
  for (const f of b.fixes) {
    if (f.t < from) { prev = f; continue; }
    if (f.t > to || wp >= ps.length) break;
    if (!prev) { prev = f; continue; }
    // This waypoint, or (if she's skipped it) the next.
    for (const k of [wp, wp + 1]) {
      const pa = ps[k];
      if (!pa) continue;
      const x = segX(prev, f, pa.a, pa.b);
      if (!x) continue;
      const move = sub(f, prev);
      // A gate is crossed going the course's way; a ray either way, the way giving the side.
      const cr = pa.out.x * move.y - pa.out.y * move.x;
      if (pa.kind === 'gate' && dot(move, pa.out) <= 0) continue;
      const w = c.waypoints[pa.wp];
      const t = prev.t + (f.t - prev.t) * x.k;
      const at = { x: prev.x + move.x * x.k, y: prev.y + move.y * x.k };
      let mark = w.marks[0];
      if (pa.kind === 'gate') {
        // She went round the gate mark she passed nearest.
        mark = dist(at, w.marks[0].p) <= dist(at, w.marks[1].p) ? w.marks[0] : w.marks[1];
      }
      const side: Side | null = pa.kind === 'gate' ? mark.rounding : cr > 0 ? 'port' : 'starboard';
      if (k === wp + 1) missed.push({ boatId: b.id, wp, t });
      out.push({ boatId: b.id, wp: pa.wp, markId: mark.id, t, closest: dist(at, mark.p), side, wrongSide: !!(pa.kind === 'ray' && mark.rounding && side !== mark.rounding) });
      wp = k + 1;
      break;
    }
    prev = f;
  }
  return wp;
}

function capsuleGap(p1: V2, p2: V2, q1: V2, q2: V2): number {
  const pd = (p: V2, a: V2, b: V2) => {
    const ab = sub(b, a);
    const u = Math.max(0, Math.min(1, dot(sub(p, a), ab) / (dot(ab, ab) || 1e-9)));
    return dist(p, add(a, mul(ab, u)));
  };
  return Math.min(pd(p1, q1, q2), pd(p2, q1, q2), pd(q1, p1, p2), pd(q2, p1, p2));
}

/** Work out the race up to `now`. `gun` null: before the start (only alerts and positions). */
export function analyseRace(boats: TrackedBoat[], c: TrackedCourse, gun: number | null, now: number, set: TrackingSetup = DEFAULT_SETUP): RaceAnalysis {
  const starts: StartCall[] = [];
  const roundings: RoundingEvent[] = [];
  const finishes: FinishCall[] = [];
  const missed: { boatId: string; wp: number; t: number }[] = [];
  const nextWp: Record<string, number> = {};
  const firstP = c.waypoints.length ? wpPoint(c, 0, mid(c.start)) : mid(c.finish);
  const startGate = lineGate(c.start, firstP);
  const lastP = c.waypoints.length ? wpPoint(c, c.waypoints.length - 1, mid(c.finish)) : mid(c.start);
  // The finish is crossed coming from the last mark's side.
  const fg0 = lineGate(c.finish, lastP);
  const finishGate: Gate = { ...fg0, n: mul(fg0.n, -1) };

  if (gun != null && now >= gun) {
    for (const b of boats) {
      const h = hullAt(b, gun);
      if (!h) { starts.push({ boatId: b.id, atGun: NaN, call: 'clear', speedAtGun: 0, startedAt: null, lineAt: null }); continue; }
      const a = hullAcross(startGate, h);
      const call: StartCall['call'] = a.d > set.accuracy ? 'over' : a.d >= -set.accuracy ? 'close' : 'clear';
      let cross = firstCrossing(b, startGate, gun, now, false);
      if (call !== 'clear') {
        // Did she go back? Then she started when she crossed again, wholly from behind.
        const back = firstDip(b, startGate, gun, Math.min(now, gun + 90), 0.3);
        if (back != null) cross = firstCrossing(b, startGate, back, now, true);
      }
      starts.push({ boatId: b.id, atGun: a.d, call, speedAtGun: h.s.spd, startedAt: cross ? cross.t : null, lineAt: cross ? cross.u : null });
    }
    for (const s of starts) {
      const b = boats.find(x => x.id === s.boatId)!;
      if (s.startedAt == null) { nextWp[b.id] = 0; continue; }
      const wp = roundingsFor(b, c, s.startedAt, now, set, roundings, missed);
      nextWp[b.id] = wp;
      if (wp >= c.waypoints.length) {
        const after = roundings.filter(r => r.boatId === b.id).reduce((m, r) => Math.max(m, r.t), s.startedAt);
        const f = firstCrossing(b, finishGate, after, now, false);
        if (f) finishes.push({ boatId: b.id, t: f.t, tooClose: [], margin: null });
      }
    }
    finishes.sort((x, y) => x.t - y.t);
    // Close finishes: when each boat crossed, how far behind the line was the next one's hull?
    for (let i = 0; i < finishes.length; i++) {
      const f = finishes[i];
      const nx = finishes[i + 1];
      if (!nx) continue;
      const hb = hullAt(boats.find(b => b.id === nx.boatId)!, f.t);
      if (!hb) continue;
      const gap = -hullAcross(finishGate, hb).d;
      f.margin = gap;
      if (gap < set.accuracy) { f.tooClose.push(nx.boatId); nx.tooClose.push(f.boatId); }
    }
  }

  // Close encounters and penalty turns, from the warning (or the first fix) to now.
  const encounters: Encounter[] = [];
  const turns: PenaltyTurn[] = [];
  const tFrom = Math.max(gun != null ? gun - 60 : -Infinity, Math.min(...boats.map(b => b.fixes[0]?.t ?? Infinity)));
  const finishedAt: Record<string, number> = {};
  for (const f of finishes) finishedAt[f.boatId] = f.t;
  if (Number.isFinite(tFrom)) {
    const open: Record<string, Encounter & { last: number }> = {};
    for (let t = tFrom; t <= now; t += 0.2) {
      const hs = boats.map(b => (finishedAt[b.id] != null && t > finishedAt[b.id] + 2 ? null : hullAt(b, t)));
      for (let i = 0; i < boats.length; i++) {
        const hi = hs[i];
        if (!hi || !hi.s.fresh) continue;
        for (let j = i + 1; j < boats.length; j++) {
          const hj = hs[j];
          if (!hj || !hj.s.fresh) continue;
          if (dist(hi.s, hj.s) > (boats[i].length + boats[j].length)) continue;
          const r = 0.1 * (boats[i].length + boats[j].length) / 2;
          const gap = Math.max(0, capsuleGap(hi.bow, hi.stern, hj.bow, hj.stern) - 2 * r);
          const key = `${i}:${j}`;
          if (gap <= set.closeM) {
            const e = open[key];
            if (!e) {
              let situation: Encounter['situation'] = 'unknown';
              if (c.windDeg != null) {
                const ta = angDiff(hi.s.h, c.windDeg), tb = angDiff(hj.s.h, c.windDeg);
                situation = Math.sign(ta) === Math.sign(tb) ? 'same tack' : 'opposite tacks';
              } else if (Math.abs(angDiff(hi.s.h, hj.s.h)) > 60) situation = 'crossing';
              open[key] = { a: boats[i].id, b: boats[j].id, t, closest: gap, contact: gap <= set.accuracy, situation, turns: [], last: t };
            } else {
              e.last = t;
              if (gap < e.closest) { e.closest = gap; e.t = t; e.contact = gap <= set.accuracy; }
            }
          } else if (open[key] && t - open[key].last > 2) {
            const { last, ...e } = open[key];
            void last;
            encounters.push(e);
            delete open[key];
          }
        }
      }
    }
    for (const k of Object.keys(open)) { const { last, ...e } = open[k]; void last; encounters.push(e); }
    encounters.sort((x, y) => x.t - y.t);

    // A penalty turn: once racing, the heading winds 330° or more one way inside 10 s, without
    // turning back more than 45° on the way (tacks and gybes either side of a rounding unwind).
    const startedAt: Record<string, number | null> = {};
    for (const s of starts) startedAt[s.boatId] = s.startedAt;
    for (const b of boats) {
      const t0 = startedAt[b.id];
      if (t0 == null) continue;
      const hs: { t: number; acc: number }[] = [];
      let acc = 0, prevH: number | null = null, blockUntil = -Infinity;
      for (let t = t0; t <= Math.min(now, finishedAt[b.id] ?? now); t += 0.2) {
        const s = stateAt(b, t);
        if (!s || !s.fresh) { prevH = null; hs.length = 0; continue; }
        if (prevH != null) acc += angDiff(s.h, prevH);
        prevH = s.h;
        hs.push({ t, acc });
        while (hs.length && hs[0].t < t - 10) hs.shift();
        if (t < blockUntil) continue;
        let hit = false;
        for (const dirSign of [1, -1]) {
          // Going back from now: the furthest point she has wound from, with no big unwind since.
          let peak = acc, ok = false;
          for (let k = hs.length - 1; k >= 0; k--) {
            const v = hs[k].acc;
            if (dirSign * (v - peak) > 45) break;
            if (dirSign * v < dirSign * peak) peak = v;
            if (dirSign * (acc - peak) >= 330) { ok = true; break; }
          }
          if (ok) { hit = true; break; }
        }
        if (!hit) continue;
        blockUntil = t + 10;
        hs.length = 0;
        // Which encounter it answers: hers, the latest before the turn, within three minutes.
        let ei: number | null = null;
        for (let k = encounters.length - 1; k >= 0; k--) {
          const e = encounters[k];
          if ((e.a === b.id || e.b === b.id) && e.t < t && t - e.t < 180) { ei = k; break; }
        }
        turns.push({ boatId: b.id, t, encounter: ei });
        if (ei != null) encounters[ei].turns.push({ boatId: b.id, t });
      }
    }
    turns.sort((x, y) => x.t - y.t);
  }

  // Alerts: stopped while racing, or silent.
  const alerts: Alert[] = [];
  for (const b of boats) {
    const last = b.fixes[b.fixes.length - 1];
    if (!last) continue;
    if (now - last.t > set.lostS) { alerts.push({ boatId: b.id, kind: 'lost', since: last.t }); continue; }
    const racing = gun != null && now > gun && finishedAt[b.id] == null;
    if (!racing) continue;
    let since: number | null = null;
    for (let t = now; t >= Math.max(gun!, now - set.stoppedS - 1); t -= 1) {
      const s = stateAt(b, t);
      if (!s || s.spd > 0.1) break;
      since = t;
    }
    if (since != null && now - since >= set.stoppedS) alerts.push({ boatId: b.id, kind: 'stopped', since });
  }

  return { gun, now, starts, roundings, finishes, encounters, turns, alerts, nextWp, missed, legLengths: legLengths(c) };
}

// ── Standings at a moment ──
export interface Standing {
  boatId: string;
  place: number;
  /** Metres of the course sailed (by distance to go). */
  progress: number;
  gapM: number;
  gapS: number;
  speed: number;
  vmg: number;
  /** Leg number from 1; legs.length + 1 once finished. */
  leg: number;
  nextName: string;
  toGo: number | null;
  finished: boolean;
  finishT: number | null;
  started: boolean;
}

function legIndexAt(a: RaceAnalysis, boatId: string, t: number): number {
  let n = 0;
  for (const r of a.roundings) if (r.boatId === boatId && r.t <= t) n++;
  for (const m of a.missed) if (m.boatId === boatId && m.t <= t) n++;
  return n;
}

/** Distance to go on the current leg: along the wind for beats and runs when the wind is known
 *  (the ladder), straight to the mark otherwise. */
function toGoOnLeg(c: TrackedCourse, wp: number, p: V2, windDeg: number | null, legs: number[]): number {
  const target = wp >= c.waypoints.length ? mid(c.finish) : wpPoint(c, wp, p);
  const prev = wp === 0 ? mid(c.start) : wpPoint(c, wp - 1, p);
  const legV = sub(target, prev);
  if (windDeg != null && len(legV) > 1) {
    const ax = dir(windDeg);
    const a = Math.abs(angDiff(bearing(legV), windDeg));
    if (a < 40 || a > 140) {
      const l = Math.abs(dot(legV, ax));
      return Math.max(0, Math.min(l + 5, Math.abs(dot(sub(target, p), ax)) * (l > 0 ? legs[wp] / l : 1)));
    }
  }
  return dist(target, p);
}

export function standingsAt(boats: TrackedBoat[], c: TrackedCourse, a: RaceAnalysis, t: number, windDeg: number | null = c.windDeg): Standing[] {
  const legs = a.legLengths;
  const cum = legs.map((_, i) => legs.slice(0, i).reduce((s, x) => s + x, 0));
  const total = legs.reduce((s, x) => s + x, 0);
  const progressOf = (b: TrackedBoat, tt: number): { p: number; leg: number; toGo: number | null } => {
    const st = a.starts.find(s => s.boatId === b.id);
    const fin = a.finishes.find(f => f.boatId === b.id);
    if (fin && fin.t <= tt) return { p: total + 1000 - fin.t * 1e-3, leg: legs.length + 1, toGo: null };
    const s = stateAt(b, tt);
    if (!s) return { p: -1e6, leg: 0, toGo: null };
    if (!st || st.startedAt == null || st.startedAt > tt) {
      return { p: -1 - dist(s, mid(c.start)), leg: 0, toGo: null };
    }
    const wp = Math.min(legIndexAt(a, b.id, tt), legs.length - 1);
    const tg = toGoOnLeg(c, wp, s, windDeg, legs);
    return { p: cum[wp] + Math.max(-5, legs[wp] - tg), leg: wp + 1, toGo: tg };
  };
  const now = boats.map(b => ({ b, ...progressOf(b, t), prev: progressOf(b, t - 5) }));
  now.sort((x, y) => y.p - x.p);
  const lead = now[0];
  // Seconds behind: the distance at the pace boats are making on that leg now.
  const pace: Record<number, number[]> = {};
  for (const n of now) if (n.leg > 0 && n.leg <= legs.length) (pace[n.leg] ||= []).push(Math.max(0, (n.p - n.prev.p) / 5));
  const legPace = (leg: number) => {
    const v = (pace[leg] || []).filter(x => x > 0.05).sort((x, y) => x - y);
    return v.length ? v[Math.floor(v.length / 2)] : 0.6;
  };
  return now.map((n, i) => {
    const fin = a.finishes.find(f => f.boatId === n.b.id);
    const finished = !!fin && fin.t <= t;
    const leadFin = a.finishes.find(f => f.boatId === lead.b.id);
    const s = stateAt(n.b, t);
    let gapM = 0, gapS = 0;
    if (i > 0) {
      if (finished && leadFin) { gapS = fin!.t - leadFin.t; gapM = 0; }
      else {
        const lp = Math.min(lead.p, total);
        gapM = Math.max(0, lp - n.p);
        gapS = gapM / Math.max(0.15, legPace(n.leg));
      }
    }
    const wp = n.leg - 1;
    const nextName = n.leg === 0 ? 'Start' : wp >= c.waypoints.length ? 'Finish' : c.waypoints[wp]?.name ?? 'Finish';
    return {
      boatId: n.b.id, place: i + 1, progress: n.p, gapM, gapS, speed: s?.spd ?? 0, vmg: finished ? 0 : (n.p - n.prev.p) / 5,
      leg: n.leg, nextName, toGo: n.toGo, finished, finishT: fin?.t ?? null, started: n.leg > 0,
    };
  });
}

/** The wind (compass, from) read from the fleet's headings on the beats over the last minute:
 *  halfway between the port and starboard tack headings. Null if there aren't enough of each. */
export function windFromFleet(boats: TrackedBoat[], c: TrackedCourse, a: RaceAnalysis, t: number, guess: number | null = c.windDeg): number | null {
  if (guess == null) return null;
  let w = guess;
  for (let iter = 0; iter < 2; iter++) {
    const port: number[] = [], stbd: number[] = [];
    for (const b of boats) {
      for (let tt = t - 60; tt <= t; tt += 2) {
        const leg = legIndexAt(a, b.id, tt);
        const st = a.starts.find(s => s.boatId === b.id);
        if (!st?.startedAt || st.startedAt > tt) continue;
        const prev = leg === 0 ? mid(c.start) : wpPoint(c, leg - 1, mid(c.start));
        const next = wpPoint(c, leg, prev);
        if (Math.abs(angDiff(bearing(sub(next, prev)), w)) > 40) continue;
        const s = stateAt(b, tt);
        if (!s || s.spd < 0.3) continue;
        const rel = angDiff(s.h, w);
        if (rel > 15 && rel < 75) port.push(rel); else if (rel < -15 && rel > -75) stbd.push(rel);
      }
    }
    if (port.length < 6 || stbd.length < 6) return iter === 0 ? null : w;
    const mp = port.reduce((s, x) => s + x, 0) / port.length, ms = stbd.reduce((s, x) => s + x, 0) / stbd.length;
    w = (w + (mp + ms) / 2 + 360) % 360;
  }
  return w;
}
