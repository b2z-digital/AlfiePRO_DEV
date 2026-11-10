// The referee: judges every pair of nearby boats every step under Part 2 of the Racing Rules of
// Sailing 2025–2028 as changed by Appendix E (radio sailing): zone of four hull lengths,
// One-Turn Penalty for Part 2 and Rule 31. It finds contacts, boats forced to change course,
// mark-room breaches, tacks in the zone and mark touches, and tracks penalties.

import { upAngle, vmgAngles } from './classes';
import { Course, Leg } from './course';
import { V2, bearing, dir, dist, dot, n180 } from './math';
import { ContactPair, hullGap, stern, bow } from './physics';
import type { Boat, Incident, SimEvent } from './types';
import { dhypot } from './dmath';

export interface Relation {
  sameTack: boolean;
  overlap: boolean;
  aAstern: boolean;   // a is clear astern of b
  bAstern: boolean;
  aLeeward: boolean;  // a is the leeward boat (same tack, overlapped)
}

export interface KeepClear {
  keeper: 0 | 1 | -1;  // 0 = a keeps clear, 1 = b keeps clear, -1 = nobody
  rule: string;
  why: string;
}

interface ZoneState {
  state: 'none' | 'on' | 'off' | 'done';
  entitled: number;
  owes: number;
  rule: string;
  since: number;
}

interface PairMem {
  keeper: 0 | 1 | -1;
  rule: string;
  keeperSince: number;
  threat: { t: number; rHdg: number; rSpd: number; keeper: number; row: number; rule: string; would?: number; turnedAt?: number } | null;
  lastIncident: number;
  zones: Record<string, ZoneState>;
  lastRelOverlap: boolean;
  overlapSince: number;
  /** Which boat was clear astern of the other last step (-1: neither). */
  lastAstern: number;
  /** Rule 17: the leeward boat that became overlapped from clear astern within two lengths (-1: none). */
  r17: number;
  /** When that boat started sailing above her proper course. */
  r17Above: number | null;
}

export interface RefereeHost {
  boats: Boat[];
  course: Course;
  t: number;
  gunT: number;
  events: SimEvent[];
  incidents: Incident[];
  hist: { x: number[]; y: number[]; hdg: number[]; spd: number[] }[]; // per boat, newest last, one entry per step
  forgot: Set<string>;
  hail(boat: Boat, text: string): void;
  markRoundingFor(boat: Boat, markId: string): { progress: number; sweep: number } | null;
  /** Did boat i change course to avoid someone since time t? (Always true for the player: we can't know.) */
  avoidingSince(i: number, t: number): boolean;
}

export const isRacing = (b: Boat) => !b.finished && !b.retired;

export function relation(a: Boat, b: Boat): Relation {
  const sameTack = a.tack === b.tack;
  const fb = dir(b.hdg), fa = dir(a.hdg);
  const sb = stern(b), sa = stern(a);
  const aBow = bow(a), aSt = sa, bBow = bow(b), bSt = sb;
  const aAstern = dot({ x: aBow.x - sb.x, y: aBow.y - sb.y }, fb) < 0 && dot({ x: aSt.x - sb.x, y: aSt.y - sb.y }, fb) < 0;
  const bAstern = dot({ x: bBow.x - sa.x, y: bBow.y - sa.y }, fa) < 0 && dot({ x: bSt.x - sa.x, y: bSt.y - sa.y }, fa) < 0;
  const overlap = !aAstern && !bAstern;
  // b's leeward side: away from the wind.
  const lee = b.tack === 'stbd' ? { x: -fb.y, y: fb.x } : { x: fb.y, y: -fb.x };
  const aLeeward = dot({ x: a.x - b.x, y: a.y - b.y }, lee) > 0;
  return { sameTack, overlap, aAstern, bAstern, aLeeward };
}

const keepingClearForPenalty = (b: Boat) => b.penalty.active && Math.abs(b.penalty.rot) > 45;

/** Section A plus rules 13 and 21: who must keep clear. */
export function keepClear(a: Boat, b: Boat, _t: number): KeepClear {
  // Rule 22 (as changed by Appendix E): if possible, avoid a boat that is disabled.
  if (a.disabled && !b.disabled) return { keeper: 1, rule: '22', why: 'must avoid a disabled boat' };
  if (b.disabled && !a.disabled) return { keeper: 0, rule: '22', why: 'must avoid a disabled boat' };
  if (a.disabled && b.disabled) return { keeper: -1, rule: '', why: '' };
  // Rule 21: a boat returning to start or taking a penalty keeps clear.
  const aR = (a.ocs && !a.started) || keepingClearForPenalty(a);
  const bR = (b.ocs && !b.started) || keepingClearForPenalty(b);
  if (aR && !bR) return { keeper: 0, rule: '21', why: a.ocs ? 'is returning to start' : 'is taking a penalty' };
  if (bR && !aR) return { keeper: 1, rule: '21', why: b.ocs ? 'is returning to start' : 'is taking a penalty' };
  // Rule 13: tacking.
  const aT = a.tackingSince !== null, bT = b.tackingSince !== null;
  if (aT && !bT) return { keeper: 0, rule: '13', why: 'is tacking' };
  if (bT && !aT) return { keeper: 1, rule: '13', why: 'is tacking' };
  const r = relation(a, b);
  if (aT && bT) {
    if (r.aAstern) return { keeper: 0, rule: '13', why: 'is tacking, astern' };
    if (r.bAstern) return { keeper: 1, rule: '13', why: 'is tacking, astern' };
    // The one on the other's port side keeps clear.
    const fb = dir(b.hdg);
    const portSide = { x: -fb.y, y: fb.x };
    const aOnPort = dot({ x: a.x - b.x, y: a.y - b.y }, portSide) > 0;
    return aOnPort ? { keeper: 0, rule: '13', why: 'is tacking, on the port side' } : { keeper: 1, rule: '13', why: 'is tacking, on the port side' };
  }
  if (!r.sameTack) {
    return a.tack === 'port' ? { keeper: 0, rule: '10', why: 'is on port tack' } : { keeper: 1, rule: '10', why: 'is on port tack' };
  }
  if (r.overlap) {
    return r.aLeeward ? { keeper: 1, rule: '11', why: 'is the windward boat' } : { keeper: 0, rule: '11', why: 'is the windward boat' };
  }
  if (r.aAstern) return { keeper: 0, rule: '12', why: 'is clear astern' };
  return { keeper: 1, rule: '12', why: 'is clear astern' };
}

export function ruleTitle(rule: string): string {
  switch (rule) {
    case '10': return 'Port and starboard';
    case '11': return 'Windward and leeward';
    case '12': return 'Clear astern';
    case '13': return 'While tacking';
    case '15': return 'Acquiring right of way';
    case '16.1': return 'Changing course';
    case '17': return 'Above a proper course';
    case '18.2(a)': case '18.2(c)': return 'Mark-room';
    case '18.3': return 'Passing head to wind in the zone';
    case '20.2(c)': return 'Room to tack at an obstruction';
    case '22': return 'Avoiding a disabled boat';
    case '21': return 'Returning or taking a penalty';
    case '31': return 'Touching a mark';
    case '29.1': return 'Over the line at the start';
    default: return `Rule ${rule}`;
  }
}

/** The mark (and its side) a boat is sailing to now, for Rule 18. */
export function currentMark(leg: Leg | undefined, b: Boat, course: Course): { id: string; p: V2 } | null {
  if (!leg || !b.started) return null;
  if (leg.kind === 'mark') return { id: leg.rounding.markId, p: course.byId[leg.rounding.markId].p };
  if (leg.kind === 'gate') {
    const a = course.byId[leg.options[0].markId], c = course.byId[leg.options[1].markId];
    return dist(a.p, b) <= dist(c.p, b) ? { id: a.id, p: a.p } : { id: c.id, p: c.p };
  }
  return null;
}

/** Rule 17: is she clearly above her proper course (the course she'd sail to finish soonest with no other boats about)? */
export function aboveProperCourse(b: Boat, course: Course): boolean {
  const leg = course.legs[b.legIndex];
  if (!leg || !b.started || b.finished) return false;
  const cm = currentMark(leg, b, course);
  // Rounding a mark is part of her proper course: Rule 18 governs there.
  if (cm && dist(cm.p, b) < 4.5 * b.cls.loa) return false;
  const a = Math.abs(b.twa);
  if (leg.upwind) return a < upAngle(b.tws) - 8 && b.tackingSince === null;
  const dn = vmgAngles(b.cls, b.tws).down;
  const toMark = cm ? Math.abs(n180(b.twd - bearing(b, cm.p))) : dn;
  return a < Math.min(dn, toMark) - 20;
}

let incidentSeq = 1;

export class Referee {
  private mem = new Map<string, PairMem>();
  private zoneTack = new Map<number, { markId: string; t: number }>(); // boat index -> tacked from port to starboard in a zone
  /** Rule 20 hails: who hailed whom, when, and whether the hailed boat replied "You tack". */
  private r2t: { from: number; to: number; t: number; repliedAt: number | null; done: boolean }[] = [];

  roomToTack(from: number, to: number) { this.r2t.push({ from, to, t: this.h.t, repliedAt: null, done: false }); }
  /** The open room-to-tack hail made to boat j, if any. */
  pendingRoomToTack(j: number) { return this.r2t.find(r => r.to === j && !r.done && r.repliedAt === null) ?? null; }
  youTack(j: number) { const r = this.pendingRoomToTack(j); if (r) r.repliedAt = this.h.t; }

  private checkRoomToTack() {
    const { boats, t } = this.h;
    for (const r of this.r2t) {
      if (r.done) continue;
      const H = boats[r.from], X = boats[r.to];
      if (X.lastHtwT > r.t) { r.done = true; continue; }                 // she tacked: done
      if (r.repliedAt !== null) { if (t - r.repliedAt > 8) r.done = true; continue; }
      const L = X.cls.loa;
      // Rule 20.2(c): tack as soon as possible, or reply "You tack". Four seconds is generous at the pond.
      if (t - r.t > 4) {
        r.done = true;
        if (isRacing(H) && isRacing(X) && hullGap(H, X) < 3 * L) this.addIncident('room-to-tack', '20.2(c)', r.to, r.from, this.memFor(r.from, r.to));
      }
    }
    if (this.r2t.length > 40) this.r2t = this.r2t.filter(r => !r.done);
  }
  private stbdSinceZone = new Map<string, boolean>(); // `${boat}:${mark}` -> on starboard since entering the zone
  private lastMarkTouch = new Map<string, number>();

  constructor(private h: RefereeHost) {}

  /** Start judging boats already in their places (a scene): their right of way isn't new, so no Rule 15 grace. */
  prime() {
    const { boats, t } = this.h;
    for (let i = 0; i < boats.length; i++) for (let j = i + 1; j < boats.length; j++) {
      const m = this.memFor(i, j), kc = keepClear(boats[i], boats[j], t), rel = relation(boats[i], boats[j]);
      m.keeper = kc.keeper; m.rule = kc.rule; m.keeperSince = -99;
      m.lastRelOverlap = rel.overlap; m.overlapSince = -99; m.lastAstern = rel.aAstern ? i : rel.bAstern ? j : -1;
    }
  }

  private key(i: number, j: number) { return i < j ? `${i}-${j}` : `${j}-${i}`; }
  memFor(i: number, j: number): PairMem {
    const k = this.key(i, j);
    let m = this.mem.get(k);
    if (!m) {
      m = { keeper: -1, rule: '', keeperSince: 0, threat: null, lastIncident: -99, zones: {}, lastRelOverlap: false, overlapSince: 0, lastAstern: -1, r17: -1, r17Above: null };
      this.mem.set(k, m);
    }
    return m;
  }

  /** Rule 17: is boat i the leeward boat that came from clear astern within two lengths of boat j? */
  restricted17(i: number, j: number): boolean { const m = this.mem.get(this.key(i, j)); return !!m && m.r17 === i; }

  /** Mark-room state between two boats, as seen from boat i: entitled, owes or none. */
  markRoom(i: number, j: number): { iEntitled: boolean; iOwes: boolean; markId: string; rule: string } | null {
    const m = this.mem.get(this.key(i, j));
    if (!m) return null;
    for (const [zk, z] of Object.entries(m.zones)) {
      if (z.state !== 'on') continue;
      return { iEntitled: z.entitled === i, iOwes: z.owes === i, markId: zk.split('@')[0], rule: z.rule };
    }
    return null;
  }

  private headingChange(i: number, seconds: number): number {
    const H = this.h.hist[i].hdg;
    const n = Math.min(H.length - 1, Math.round(seconds / 0.05));
    if (n <= 0) return 0;
    return n180(H[H.length - 1] - H[H.length - 1 - n]);
  }

  step(contacts: ContactPair[], markTouches: { boat: number; mark: string }[], passed: ('tack' | 'gybe' | null)[]) {
    const { boats, course, t } = this.h;
    const n = boats.length;

    // Zones: starboard-since-entering and tacks in the zone (Rule 18.3).
    for (let i = 0; i < n; i++) {
      const b = boats[i];
      if (!isRacing(b) || !b.started || b.disabled) continue;
      const cm = currentMark(course.legs[b.legIndex], b, course);
      if (!cm) continue;
      const inZone = dist(cm.p, b) <= 4 * b.cls.loa;
      const k = `${i}:${cm.id}`;
      if (!inZone) { this.stbdSinceZone.delete(k); continue; }
      if (!this.stbdSinceZone.has(k)) this.stbdSinceZone.set(k, b.tack === 'stbd');
      else if (b.tack !== 'stbd') this.stbdSinceZone.set(k, false);
      if (passed[i] === 'tack' && b.lastTackFrom === 'port' && b.tack === 'stbd') {
        const leg = course.legs[b.legIndex];
        if (leg && leg.kind === 'mark' && leg.rounding.side === 'port') this.zoneTack.set(i, { markId: cm.id, t });
      }
    }

    const contactSet = new Set(contacts.map(c => this.key(c.a, c.b)));

    for (let i = 0; i < n; i++) {
      const A = boats[i];
      if (!isRacing(A)) continue;
      for (let j = i + 1; j < n; j++) {
        const B = boats[j];
        if (!isRacing(B)) continue;
        const d = dhypot(A.x - B.x, A.y - B.y);
        const L = Math.max(A.cls.loa, B.cls.loa);
        const m = this.memFor(i, j);
        if (d > 9 * L) { m.threat = null; continue; }

        const kc = keepClear(A, B, t);
        if (kc.keeper !== m.keeper) { m.keeper = kc.keeper; m.keeperSince = t; }
        m.rule = kc.rule;
        const rel = relation(A, B);
        const wasOverlap = m.lastRelOverlap, wasAstern = m.lastAstern;
        if (rel.overlap && !wasOverlap) m.overlapSince = t;
        m.lastRelOverlap = rel.overlap;
        m.lastAstern = rel.aAstern ? i : rel.bAstern ? j : -1;
        this.track17(i, j, m, rel, wasOverlap, wasAstern);

        if (!A.disabled && !B.disabled) this.updateZones(i, j, m, rel);

        // New contact?
        const k = this.key(i, j);
        if (contactSet.has(k)) {
          const was = A.contactWith[B.id];
          if (was === undefined) {
            A.contactWith[B.id] = t; B.contactWith[A.id] = t;
            this.judgeContact(i, j, m, kc);
            m.threat = null;
          }
          continue;
        } else if (A.contactWith[B.id] !== undefined && hullGap(A, B) > 0.08 * L) {
          delete A.contactWith[B.id]; delete B.contactWith[A.id];
        }

        // Forced to change course (no contact).
        if (kc.keeper !== -1 && kc.rule !== '22' && d < 4 * L) this.watchThreat(i, j, m, kc);
        if (m.r17 >= 0) this.watch17(i, j, m);
      }
    }

    // Rule 18.3: a boat that tacked in the zone makes a starboard boat sail above close-hauled.
    for (const [x, zt] of [...this.zoneTack.entries()]) {
      if (t - zt.t > 6) { this.zoneTack.delete(x); continue; }
      const X = boats[x];
      // 18.3 only binds her while she is on starboard after that tack.
      if (X.tack !== 'stbd' || !isRacing(X)) { this.zoneTack.delete(x); continue; }
      for (let y = 0; y < n; y++) {
        if (y === x) continue;
        const Y = boats[y];
        if (!isRacing(Y) || Y.tack !== 'stbd' || Y.disabled) continue;
        if (!this.stbdSinceZone.get(`${y}:${zt.markId}`)) continue;
        const near = hullGap(X, Y) < 1.2 * Y.cls.loa;
        const above = Math.abs(Y.twa) < upAngle(Y.tws) - 7 && Y.tackingSince === null;
        const luffed = this.headingChange(y, 2) > 8 && this.h.avoidingSince(y, t - 2); // luffed to avoid her
        const m = this.memFor(x, y);
        if (near && above && luffed && t - m.lastIncident > 6) {
          this.addIncident('zone-tack', '18.3', x, y, m, zt.markId);
          this.zoneTack.delete(x);
          break;
        }
      }
    }

    // Rule 31: touching a mark.
    for (const mt of markTouches) {
      const b = boats[mt.boat];
      if (b.disabled) continue;
      const k = `${mt.boat}:${mt.mark}`;
      if ((this.lastMarkTouch.get(k) ?? -99) > t - 5) continue;
      this.lastMarkTouch.set(k, t);
      if (!b.started && t < this.h.gunT) {
        // Touching a starting mark before starting still breaks Rule 31.
      }
      this.addIncident('mark-touch', '31', mt.boat, null, null, mt.mark);
    }

    this.checkRoomToTack();
    this.trackPenalties(passed);
  }

  private updateZones(i: number, j: number, m: PairMem, rel: Relation) {
    const { boats, course, t } = this.h;
    const A = boats[i], B = boats[j];
    if (!A.started || !B.started || A.legIndex !== B.legIndex) return;
    const leg = course.legs[A.legIndex];
    if (!leg || leg.kind === 'finish') return;
    const ca = currentMark(leg, A, course), cb = currentMark(leg, B, course);
    if (!ca || !cb || ca.id !== cb.id) return;
    // Not between boats on opposite tacks on a beat to windward.
    if (leg.upwind && A.tack !== B.tack) return;
    const markP = ca.p;
    const dA = dist(markP, A), dB = dist(markP, B);
    const nearer = dA <= dB ? A : B;
    const zone = 4 * nearer.cls.loa;
    const zk = `${ca.id}@${A.legIndex}`;
    let z = m.zones[zk];
    if (!z) { z = { state: 'none', entitled: -1, owes: -1, rule: '', since: t }; m.zones[zk] = z; }
    if (z.state === 'done') return;
    const inA = dA <= zone, inB = dB <= zone;
    if (z.state === 'none' && (inA || inB)) {
      if (rel.overlap) {
        const insideA = dA < dB;
        z.entitled = insideA ? i : j; z.owes = insideA ? j : i;
      } else {
        // The boat clear ahead (first into the zone) is entitled.
        z.entitled = rel.aAstern ? j : i; z.owes = rel.aAstern ? i : j;
      }
      z.state = 'on'; z.rule = '18.2(a)'; z.since = t;
      const ent = boats[z.entitled];
      if (rel.overlap && !ent.human && Math.min(dA, dB) < zone) this.h.hail(ent, 'Room!');
      return;
    }
    if (z.state === 'on') {
      const ent = boats[z.entitled];
      const entD = z.entitled === i ? dA : dB;
      // 18.2(b): she passes head to wind or leaves the zone.
      if (ent.lastHtwT > z.since && ent.lastHtwT <= t) { z.state = 'off'; return; }
      if (entD > zone * 1.15) { z.state = 'off'; return; }
      const r = this.h.markRoundingFor(ent, ca.id);
      if (r && r.progress > r.sweep * 0.45) { z.state = 'done'; return; }
    }
    const rA = this.h.markRoundingFor(A, ca.id), rB = this.h.markRoundingFor(B, ca.id);
    const rounded = (rA && rA.progress > rA.sweep * 0.3) || (rB && rB.progress > rB.sweep * 0.3);
    if (z.state === 'off' && rel.overlap && inA && inB && !rounded) {
      // 18.2(c): overlapped later, the outside boat gives the inside boat mark-room.
      const insideA = dA < dB;
      z.entitled = insideA ? i : j; z.owes = insideA ? j : i; z.rule = '18.2(c)'; z.state = 'on'; z.since = t;
    }
  }

  private judgeContact(i: number, j: number, m: PairMem, kc: KeepClear) {
    const { boats, t } = this.h;
    // Boats still tangled from the last incident: one incident, one penalty.
    if (t - m.lastIncident < 8) return;
    // After replying "You tack", the hailed boat must give the hailing boat room to tack and avoid her.
    const rep = this.r2t.find(r => r.repliedAt !== null && t - r.repliedAt < 8 && ((r.from === i && r.to === j) || (r.from === j && r.to === i)));
    if (rep) { this.addIncident('room-to-tack', '20.2(c)', rep.to, rep.from, m); return; }
    // Rule 22: hitting a disabled boat.
    if (kc.rule === '22') { this.addIncident('contact', '22', kc.keeper === 0 ? i : j, kc.keeper === 0 ? j : i, m); return; }
    // Mark-room first: the outside boat that squeezed breaks 18.2.
    const mr = Object.entries(m.zones).find(([, z]) => z.state === 'on');
    if (mr) {
      const markId = mr[0].split('@')[0], z = mr[1];
      const ent = boats[z.entitled];
      const mark = this.h.course.byId[markId];
      if (mark && dist(mark.p, ent) < 2.4 * ent.cls.loa) {
        this.addIncident('mark-room', z.rule, z.owes, z.entitled, m, markId);
        return;
      }
    }
    // A boat that tacked in the zone.
    for (const [x, zt] of this.zoneTack) {
      if ((x === i || x === j) && t - zt.t < 6) {
        const y = x === i ? j : i;
        if (boats[y].tack === 'stbd' && this.stbdSinceZone.get(`${y}:${zt.markId}`)) {
          this.addIncident('zone-tack', '18.3', x, y, m, zt.markId);
          this.zoneTack.delete(x);
          return;
        }
      }
    }
    if (kc.keeper === -1) return;
    const K = kc.keeper === 0 ? i : j, R = kc.keeper === 0 ? j : i;
    // Rule 17: a leeward boat that overlapped from clear astern within two lengths sailed above her proper course into her.
    if (kc.rule === '11' && m.r17 === R && aboveProperCourse(boats[R], this.h.course)) { this.addIncident('contact', '17', R, K, m); return; }
    // Rule 15: she acquired right of way by her own tack or gybe moments ago and gave no room to keep clear.
    const Rb0 = boats[R];
    if (t - m.keeperSince < 3 && (Rb0.lastHtwT > m.keeperSince - 3 || Rb0.lastGybeT > m.keeperSince - 3) && kc.rule !== '13' && kc.rule !== '21') {
      this.addIncident('contact', '15', R, K, m);
      return;
    }
    // Rule 16.1: the right-of-way boat changed course towards her without giving room.
    const turn = this.headingChange(R, 1.2);
    const rMark = currentMark(this.h.course.legs[boats[R].legIndex], boats[R], this.h.course);
    const nearMark = rMark ? dist(rMark.p, boats[R]) < 4.5 * boats[R].cls.loa : false;
    if (Math.abs(turn) > 14 && kc.rule !== '13' && kc.rule !== '21' && !nearMark) {
      const Rb = boats[R], Kb = boats[K];
      const towards = dot(dir(Rb.hdg), { x: Kb.x - Rb.x, y: Kb.y - Rb.y }) > 0;
      // Had she held her course from 1.2 s ago, would she be clear of the other boat now?
      const H = this.h.hist[R], k = Math.max(0, H.hdg.length - 1 - 24);
      const oh = H.hdg[k], v = dir(oh), back = (H.hdg.length - 1 - k) * 0.05;
      const px = H.x[k] + v.x * H.spd[k] * back, py = H.y[k] + v.y * H.spd[k] * back;
      const wasClear = hullGap(Rb, Kb, px, py, oh) > 0.1 * Rb.cls.loa;
      if (towards && wasClear) { this.addIncident('contact', '16.1', R, K, m); return; }
    }
    this.addIncident('contact', kc.rule, K, R, m);
  }

  private watchThreat(i: number, j: number, m: PairMem, kc: KeepClear) {
    const { boats, t } = this.h;
    // Closest approach over the next few seconds: the keep-clear boat on her course (with her turn
    // easing off), the right-of-way boat from where she is now on heading rh at speed rs.
    let tMin = 99;
    const predict = (Kb: Boat, Rb: Boat, rh: number, rs: number, horizon = 2.5) => {
      let min = 99;
      const rv = dir(rh);
      let kx = Kb.x, ky = Kb.y, kh = Kb.hdg;
      for (let s = 0.25; s <= horizon; s += 0.25) {
        kh = kh + Kb.rot * 0.25 * Math.max(0, 1 - s / 1.2);
        const kv = dir(kh);
        kx += kv.x * Kb.spd * 0.25; ky += kv.y * Kb.spd * 0.25;
        const g = hullGap(Kb, Rb, kx, ky, kh, Rb.x + rv.x * rs * s, Rb.y + rv.y * rs * s, rh);
        if (g < min) { min = g; tMin = s; }
      }
      return min;
    };
    if (!m.threat) {
      const K = kc.keeper === 0 ? i : j, R = kc.keeper === 0 ? j : i;
      const Kb = boats[K], Rb = boats[R];
      if (t - m.lastIncident < 6) return;
      // Rule 15: a boat that has just become the one keeping clear gets time to respond.
      if (t - m.keeperSince < 2.5) return;
      // Mark-room owed by the right-of-way boat: not a keep-clear breach.
      const mr = this.markRoom(K, R);
      if (mr && mr.iEntitled) return;
      if (predict(Kb, Rb, Rb.hdg, Rb.spd, 2.6) < 0.02 * Rb.cls.loa) m.threat = { t, rHdg: Rb.hdg, rSpd: Rb.spd, keeper: K, row: R, rule: kc.rule };
      return;
    }
    const th = m.threat;
    if (t - th.t > 4) { m.threat = null; return; }
    const Kb = boats[th.keeper], Rb = boats[th.row];
    const L = Rb.cls.loa;
    // The roles changed: fine if it's the right-of-way boat tacking or gybing to get out of the way.
    const nowKeeper = kc.keeper === 0 ? i : j;
    if (nowKeeper !== th.keeper && !(Rb.lastHtwT > th.t || Rb.lastGybeT > th.t)) { m.threat = null; return; }
    // Only a change of course made to avoid her counts, not one the right-of-way boat made for her own reasons.
    // A boat tacking close ahead often only makes the other luff or slow a little: that counts too.
    const tackingK = th.rule === '13';
    const turned = (Math.abs(n180(Rb.hdg - th.rHdg)) > (tackingK ? 8 : 15) || Rb.spd < th.rSpd * (tackingK ? 0.75 : 0.6)) && this.h.avoidingSince(th.row, th.t - 0.3);
    if (!turned) return;
    // Judge the "what if she had held her course" when she first turned, while it still means something.
    // A right-of-way boat that gave way early, with contact still well off, wasn't forced to.
    if (th.would === undefined) { th.would = predict(Kb, Rb, th.rHdg, th.rSpd); th.turnedAt = t; if (tMin > 2.4) th.would = 99; }
    if (t - (th.turnedAt ?? t) > 1.5) return;
    const nowGap = predict(Kb, Rb, Rb.hdg, Rb.spd);
    const H = this.h.hist[th.keeper].hdg;
    const kTurn = Math.abs(n180(Kb.hdg - H[Math.max(0, H.length - 1 - Math.round((t - th.t) / 0.05))]));
    if (nowGap > 0.03 * L && th.would < 0.02 * L && hullGap(Kb, Rb) < 2 * L && kTurn < 25) {
      this.addIncident('forced', th.rule, th.keeper, th.row, m);
      m.threat = null;
    }
  }

  /** Rule 17: a boat that becomes overlapped from clear astern within two hull lengths to leeward of a boat on the
   *  same tack must not sail above her proper course while they stay that way (RRS 2025–2028: no Rule 13 exception). */
  private track17(i: number, j: number, m: PairMem, rel: Relation, wasOverlap: boolean, wasAstern: number) {
    const { boats, t, gunT } = this.h;
    const A = boats[i], B = boats[j];
    const L = Math.max(A.cls.loa, B.cls.loa);
    const lee = rel.aLeeward ? i : j;
    if (rel.sameTack && rel.overlap && !wasOverlap && wasAstern === lee && t > gunT && A.started && B.started && hullGap(A, B) < 2 * L) {
      m.r17 = lee; m.r17Above = null;
    }
    if (m.r17 >= 0 && (!rel.sameTack || !rel.overlap || lee !== m.r17 || hullGap(A, B) > 2 * L)) { m.r17 = -1; m.r17Above = null; }
  }

  /** The restricted leeward boat sails above her proper course and the windward boat has to luff to keep clear. */
  private watch17(i: number, j: number, m: PairMem) {
    const { boats, t, course } = this.h;
    const Ri = m.r17, Wi = Ri === i ? j : i;
    const R = boats[Ri], W = boats[Wi];
    const above = aboveProperCourse(R, course) && (R.human || !this.h.avoidingSince(Ri, t - 1));
    if (!above) { m.r17Above = null; return; }
    if (m.r17Above === null) m.r17Above = t;
    if (t - m.r17Above < 1.2 || t - m.lastIncident < 6 || hullGap(R, W) > 1.5 * W.cls.loa) return;
    const H = this.h.hist[Wi].hdg;
    const k = Math.max(0, H.length - 1 - 40);
    const luffed = Math.abs(n180(W.twd - H[k])) - Math.abs(W.twa);
    if (luffed > 10) this.addIncident('forced', '17', Ri, Wi, m);
  }

  addIncident(kind: Incident['kind'], rule: string, offender: number, victim: number | null, m: PairMem | null, markId?: string) {
    const { boats, t, incidents, events } = this.h;
    const O = boats[offender], V = victim !== null ? boats[victim] : null;
    if (m) m.lastIncident = t;
    const inc: Incident = {
      id: incidentSeq++, t, kind, rule,
      title: ruleTitle(rule),
      offender: O.id, victim: V ? V.id : null,
      explanation: '', nextTime: '',
      at: V ? { x: (O.x + V.x) / 2, y: (O.y + V.y) / 2 } : { x: O.x, y: O.y },
      markId,
      resolved: 'pending',
    };
    explain(inc, O, V, this.h.course);
    incidents.push(inc);
    events.push({ type: 'incident', t, incident: inc });
    if (kind !== 'ocs') {
      O.penalty.owed += 1;
      O.penalty.since = t;
      O.penalty.reason = rule;
    }
    if (V && !V.human && kind !== 'mark-touch') this.h.hail(V, `${spellSail(V.sail)} protest ${spellSail(O.sail)}`);
  }

  private trackPenalties(passed: ('tack' | 'gybe' | null)[]) {
    const { boats, t, events } = this.h;
    boats.forEach((b, i) => {
      const p = b.penalty;
      if (p.owed <= 0 || !isRacing(b)) { p.active = false; p.rot = 0; p.passedHtw = false; p.passedDdw = false; return; }
      const r = b.rot * 0.05;
      if (Math.abs(b.rot) < 6) {
        if (p.active && Math.abs(p.rot) < 40) { p.active = false; p.rot = 0; p.passedHtw = false; p.passedDdw = false; }
        return;
      }
      if (p.active && Math.sign(r) !== Math.sign(p.rot) && Math.abs(p.rot) > 25) {
        p.rot = 0; p.passedHtw = false; p.passedDdw = false;
      }
      p.active = true;
      p.rot += r;
      if (passed[i] === 'tack') p.passedHtw = true;
      if (passed[i] === 'gybe') p.passedDdw = true;
      if (p.passedHtw && p.passedDdw && Math.abs(p.rot) >= 300) {
        p.owed -= 1; p.taken += 1;
        p.active = false; p.rot = 0; p.passedHtw = false; p.passedDdw = false;
        events.push({ type: 'penalty-done', t, boat: b.id });
        const inc = [...this.h.incidents].reverse().find(x => x.offender === b.id && x.resolved === 'pending' && x.kind !== 'ocs');
        if (inc) inc.resolved = 'penalty-taken';
      }
    });
  }
}

export function spellSail(s: string): string {
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
  return s.split('').map(c => words[Number(c)] ?? c).join(' ');
}

const who = (b: Boat | null) => (b ? (b.isPlayer ? 'you' : b.sail) : '');
const Who = (b: Boat | null) => (b ? (b.isPlayer ? 'You' : b.sail) : '');

/** Plain-English explanation and how to avoid it next time. */
export function explain(inc: Incident, O: Boat, V: Boat | null, course: Course) {
  const o = who(O), O_ = Who(O), v = who(V), V_ = Who(V);
  const verbO = O.isPlayer ? 'were' : 'was';
  const markName = inc.markId ? course.byId[inc.markId]?.name ?? 'the mark' : 'the mark';
  switch (inc.rule) {
    case '10':
      inc.explanation = `${O_} ${verbO} on port tack and ${v} ${V?.isPlayer ? 'were' : 'was'} on starboard. A port-tack boat must keep clear of a starboard-tack boat.`;
      inc.nextTime = `Decide early: cross only with a clear length to spare, otherwise bear away and duck behind ${v}, or tack before you get close.`;
      break;
    case '11':
      inc.explanation = `${O_} ${verbO} overlapped to windward of ${v} on the same tack. The windward boat must keep clear, and the leeward boat may luff.`;
      inc.nextTime = `When you're the windward boat, keep at least half a length of space and be ready to head up when the leeward boat luffs.`;
      break;
    case '12':
      inc.explanation = `${O_} ${verbO} clear astern of ${v} on the same tack. A boat clear astern must keep clear of the boat clear ahead.`;
      inc.nextTime = `Steer round the boat ahead early, or slow down; don't sail into her transom.`;
      break;
    case '13':
      inc.explanation = `${O_} ${verbO} still tacking: after passing head to wind a boat must keep clear of other boats until she is close-hauled.`;
      inc.nextTime = `Tack where you have room to complete it before the other boat arrives, or wait until she has passed.`;
      break;
    case '15':
      inc.explanation = `${O_} gained right of way by tacking or turning close to ${v}, and didn't give ${v} room to keep clear first.`;
      inc.nextTime = `When you gain right of way, leave the other boat time and space to respond before you insist on it.`;
      break;
    case '16.1':
      inc.explanation = `${O_} had right of way but changed course into ${v} without giving room to keep clear.`;
      inc.nextTime = `You may luff or bear away with right of way, but only slowly enough that the other boat can keep clear.`;
      break;
    case '17':
      inc.explanation = `${O_} became overlapped to leeward of ${v} from clear astern, within two lengths, and then sailed above ${O.isPlayer ? 'your' : 'her'} proper course. A boat that gets her overlap that way may not luff above her proper course while the overlap lasts.`;
      inc.nextTime = `When you overtake to leeward from behind, sail your proper course to the mark: you can pass, but you can't luff the windward boat. Overlap from further than two lengths away if you want to be free to luff.`;
      break;
    case '22':
      inc.explanation = `${V_} ${V?.isPlayer ? 'were' : 'was'} disabled: out of control and unable to carry on. Appendix E changes Rule 22 so that, if possible, every boat avoids a disabled boat, whatever the right of way.`;
      inc.nextTime = `Give a drifting boat a wide berth: she can't steer out of your way, and she may drift into your path.`;
      break;
    case '18.2(a)':
    case '18.2(c)':
      inc.explanation = `${V_} ${V?.isPlayer ? 'were' : 'was'} entitled to mark-room at ${markName}. ${O_} ${verbO} the outside boat and didn't give room to sail to the mark and round it. In radio sailing the zone is 4 hull lengths.`;
      inc.nextTime = `When you're outside at the zone, slow down or sail wide so the inside boat can round. Get inside before the zone next time.`;
      break;
    case '18.3':
      inc.explanation = `${O_} passed head to wind from port to starboard inside the zone of ${markName}. That gives no mark-room, and ${v}, on starboard since entering the zone, had to sail above close-hauled to avoid ${o}.`;
      inc.nextTime = `Tack onto the starboard layline before you reach the zone, or duck the starboard boat and tack once she has passed.`;
      break;
    case '20.2(c)':
      inc.explanation = `${V_} ${V?.isPlayer ? 'were' : 'was'} close-hauled at the bank and hailed for room to tack. ${O_} had to respond: tack as soon as possible, or reply "You tack" and then give ${v} room to tack and keep clear.`;
      inc.nextTime = `When a boat to leeward hails "Room to tack" with her sail number, tack straight away (press T), or reply "You tack" (press H) and keep clear while she tacks.`;
      break;
    case '21':
      inc.explanation = `${O_} ${verbO} ${O.ocs ? 'returning to start' : 'taking a penalty'}, and a boat doing that must keep clear of boats that are not.`;
      inc.nextTime = `Before you turn back or start your penalty turn, check there's clear water around you.`;
      break;
    case '31':
      inc.explanation = `${O_} touched ${markName}. A boat that touches a mark while racing takes a One-Turn Penalty.`;
      inc.nextTime = `Approach wide and leave the mark a boat's width as you round.`;
      break;
    case '29.1':
      inc.explanation = `${O_} ${verbO} on the course side of the line at the starting signal. The race committee hailed "Recall" with ${O.isPlayer ? 'your' : 'the'} sail number. Return to the pre-start side and start again.`;
      inc.nextTime = `Use time-to-line: at full speed from where you are, how long to the line? Trigger only when that matches the clock.`;
      break;
    default:
      inc.explanation = `${O_} broke Rule ${inc.rule}.`;
  }
  if (inc.kind === 'forced') inc.explanation += ` ${V_} had to change course to avoid ${o}, which counts even without contact.`;
}

export function startRuleExplain(b: Boat): string {
  return b.isPlayer ? 'You' : b.sail;
}

export function bearingTo(a: V2, b: V2) { return bearing(a, b); }
