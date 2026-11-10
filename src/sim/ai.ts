// AI skippers. Each one thinks in three layers:
//   strategy (where to go: the start plan, shifts, laylines, gate choice),
//   tactics (what to do now: right of way, mark-room, avoiding a foul it can see coming),
//   helm (steering and trimming like a person: reaction delay, small errors).
// They sail the same physics as you and never get help from the engine.

import { accelTau, noGoAngle, overpowerEase, polarSpeed, trimEfficiency, upAngle, vmgAngles, bestSheet } from './classes';
import { Course, Leg, Rounding, roundingPoint } from './course';
import { Rng, V2, bearing, clamp, dir, dist, lerp, n180, n360, sub, dot, cross } from './math';
import { bankAhead, bow, capsule, closest, hullGap, lineSide, stern } from './physics';
import { keepClear, Referee } from './referee';
import type { Boat, Persona, SkipperLevel } from './types';
import type { WindField } from './wind';
import { datan2, dcos, dexp, dhypot, dsin } from './dmath';

export interface LevelParams {
  reaction: number; noise: number; trimNoise: number; shiftThr: number; layMargin: number;
  startMargin: number; misjudge: number; forget: number; roundIn: number; roundOut: number;
  minTack: number; tackRudder: number; margin: number;
  /** Start judgement: spread of the clock error (s) and of judging the line from the bank (hull lengths). */
  startSigma: number; lineSigma: number;
}

export const LEVELS: Record<SkipperLevel, LevelParams> = {
  club: { reaction: 0.45, noise: 3.5, trimNoise: 0.07, shiftThr: 9, layMargin: 7, startMargin: 1.4, misjudge: 0.1, forget: 0.25, roundIn: 1.9, roundOut: 1.15, minTack: 7, tackRudder: 0.68, margin: 0.45, startSigma: 0.9, lineSigma: 0.42 },
  state: { reaction: 0.32, noise: 2.2, trimNoise: 0.045, shiftThr: 6, layMargin: 4.5, startMargin: 0.8, misjudge: 0.04, forget: 0.1, roundIn: 1.75, roundOut: 0.95, minTack: 5.5, tackRudder: 0.78, margin: 0.42, startSigma: 0.5, lineSigma: 0.26 },
  national: { reaction: 0.22, noise: 1.4, trimNoise: 0.03, shiftThr: 4.5, layMargin: 3.2, startMargin: 0.5, misjudge: 0.015, forget: 0.04, roundIn: 1.65, roundOut: 0.85, minTack: 4.5, tackRudder: 0.85, margin: 0.4, startSigma: 0.3, lineSigma: 0.16 },
  world: { reaction: 0.15, noise: 0.8, trimNoise: 0.015, shiftThr: 3.5, layMargin: 2.4, startMargin: 0.3, misjudge: 0.005, forget: 0.01, roundIn: 1.55, roundOut: 0.78, minTack: 4, tackRudder: 0.9, margin: 0.38, startSigma: 0.18, lineSigma: 0.1 },
};

export const PERSONAS: Persona[] = [
  { key: 'pin', name: 'Pin hunter', aggression: 0.7, risk: 0.6, startEnd: 0.1, startEarly: 0.3, consistency: 0.7, shiftSense: 1, sidePref: -1 },
  { key: 'squeezer', name: 'Squeezer', aggression: 0.85, risk: 0.5, startEnd: 0.9, startEarly: 0.2, consistency: 0.7, shiftSense: 1.1, sidePref: 1 },
  { key: 'steady', name: 'Steady', aggression: 0.4, risk: 0.3, startEnd: 0.5, startEarly: 0.9, consistency: 0.9, shiftSense: 1, sidePref: 0 },
  { key: 'luffer', name: 'Leeward luffer', aggression: 0.9, risk: 0.5, startEnd: 0.62, startEarly: 0.5, consistency: 0.7, shiftSense: 1.2, sidePref: 0 },
  { key: 'gambler', name: 'Gambler', aggression: 0.6, risk: 0.9, startEnd: 0.3, startEarly: 0, consistency: 0.55, shiftSense: 0.9, sidePref: 1 },
  { key: 'builder', name: 'Speed builder', aggression: 0.5, risk: 0.4, startEnd: 0.42, startEarly: 0.6, consistency: 0.8, shiftSense: 1.3, sidePref: 0 },
  { key: 'shifty', name: 'Shift player', aggression: 0.5, risk: 0.5, startEnd: 0.38, startEarly: 0.6, consistency: 0.75, shiftSense: 0.7, sidePref: 0 },
  { key: 'careful', name: 'Conservative', aggression: 0.25, risk: 0.2, startEnd: 0.56, startEarly: 1.4, consistency: 0.85, shiftSense: 1.1, sidePref: 0 },
];

export interface Perceived { x: number; y: number; hdg: number; spd: number; rot: number }

/** Anything that can sail a boat: an AI skipper, or a script in a drill or lesson. */
export interface Helm {
  decide(h: AiHost): void;
  helm(h: AiHost, dt: number): void;
  intent: string;
  lastAvoid: { t: number; hdg: number; tag: string };
  gate?: 0 | 1 | null;
  /** Another boat hailed this one for room to tack, or replied "You tack" (Rule 20). */
  onHail?(h: AiHost, from: Boat, kind: 'room-to-tack' | 'you-tack'): void;
}

export interface AiHost {
  t: number;
  gunT: number;
  course: Course;
  wind: WindField;
  boats: Boat[];
  referee: Referee;
  perceived(i: number, delaySteps: number): Perceived;
  hail(b: Boat, text: string): void;
  forgot: Set<string>;
  /** Rule 20: hail a boat to windward for room to tack. */
  hailRoomToTack(from: Boat, to: Boat): void;
}

interface Plan { hdg: number; sheet: number; intent: string; maneuver?: 'tack' | 'gybe' | 'penalty' | null; rounding?: { mark: V2; side: 'port' | 'stbd' } }

const ANGLES = [0, -7, 7, -14, 14, -24, 24, -38, 38, -55, 55, -80, 80];

export class Skipper implements Helm {
  meanTwd: number;
  private ou = 0;
  private ouTrim = 0;
  lastTackT = -99;
  lastGybeT = -99;
  gate: 0 | 1 | null = null;
  /** Pre-start state: the piece of line they want, how deep they hover, when they set up,
   *  and their personal clock and line-sighting errors for this race. */
  pre = { spot: 0.5, dir: 1 as 1 | -1, triggered: false, settled: false, lastFlip: -99, clockErr: 0, lineErr: 0, setupT: 30, hoverD: 1.4 };
  desHdg: number;
  desSheet: number;
  intent = '';
  private queue: { t: number; hdg: number; sheet: number }[] = [];
  private misjudge = new Map<number, number>();
  private hailed = new Map<string, number>();
  private shadowSince = -1;
  private stuckSince = -1;
  private unstickUntil = -1;
  private penDir = 0;
  private maneuver: { kind: 'tack' | 'gybe'; target: number; t0: number } | null = null;
  /** The last avoiding move, so she commits to it instead of dithering between options. */
  lastAvoid = { t: -99, hdg: 0, tag: '' };
  private pendingAvoid: { t: number; hdg: number; tag: string } | null = null;
  /** Cost the tactics put on simply following the plan last time (contact predicted is 1100+). */
  private planCost = 0;
  /** Rule 20: a boat to leeward hailed us for room to tack, or we hailed one to windward. */
  private giveRoom: { from: Boat; t: number } | null = null;
  private wantRoom: { to: Boat; t: number; go: boolean } | null = null;

  onHail(h: AiHost, from: Boat, kind: 'room-to-tack' | 'you-tack') {
    if (kind === 'room-to-tack') this.giveRoom = { from, t: h.t };
    else if (this.wantRoom && this.wantRoom.to === from) this.wantRoom.go = true;
  }

  /** Pinned against the bank on a beat by a boat to windward: hail for room to tack, then tack when she has. */
  private roomToTackPlan(h: AiHost): Plan | null {
    const b = this.b, L = b.cls.loa;
    if (this.wantRoom) {
      const w = this.wantRoom, o = w.to;
      if (w.go || o.lastHtwT > w.t || o.tack !== b.tack || h.t - w.t > 7) {
        this.wantRoom = null;
        return { hdg: this.closeHauled(b.tack === 'stbd' ? 'port' : 'stbd', b.twd, b.tws), sheet: bestSheet(45), intent: 'Tacking away from the bank', maneuver: 'tack' };
      }
      // Waiting for her: pinch and slow down a little.
      const ch = this.closeHauled(b.tack, b.twd, b.tws);
      return { hdg: n360(b.tack === 'stbd' ? ch + 6 : ch - 6), sheet: easedSheet(40, 0.6), intent: `Waiting for room to tack from ${o.sail}` };
    }
    if (!b.started || Math.abs(b.twa) > vmgAngles(b.cls, b.tws).up + 12) return null;
    if (bankAhead(b, h.course) > 3 * L) return null;
    const right = { x: dcos((b.hdg * Math.PI) / 180), y: -dsin((b.hdg * Math.PI) / 180) };
    const wSide = b.tack === 'stbd' ? 1 : -1;
    let blocker: Boat | null = null, bg = 1.8 * L;
    for (const o of h.boats) {
      if (o === b || o.finished || o.retired || o.tack !== b.tack) continue;
      const rel = sub(o, b);
      if (dot(rel, right) * wSide <= 0) continue; // not to windward
      const g = hullGap(b, o);
      if (g < bg) { bg = g; blocker = o; }
    }
    if (!blocker) return null;
    h.hailRoomToTack(b, blocker);
    this.wantRoom = { to: blocker, t: h.t, go: false };
    return null;
  }

  constructor(public b: Boat, public lv: LevelParams, public persona: Persona, private rng: Rng, public idx: number) {
    this.meanTwd = b.twd;
    this.desHdg = b.hdg;
    this.desSheet = b.sheet;
    const pre = this.pre;
    pre.clockErr = clamp(rng.gauss(), -2.5, 2.5) * lv.startSigma;
    pre.lineErr = clamp(rng.gauss(), -2.5, 2.5) * lv.lineSigma;
    pre.setupT = 25 + 9 * (1 - persona.aggression) + rng.range(0, 4);
    pre.hoverD = 0.9 + 0.8 * (1 - persona.aggression) + rng.range(0, 0.35);
  }

  // ───────────────────────── decision (10 Hz) ─────────────────────────
  decide(h: AiHost) {
    const b = this.b;
    if (b.finished || b.retired) { this.desSheet = 0.25; this.intent = 'Finished'; this.push(h.t, b.hdg, 0.2); return; }
    // Running mean of the wind direction this skipper sees.
    const k = 0.1 / 75;
    this.meanTwd = n360(this.meanTwd + n180(b.twd - this.meanTwd) * k * 10);

    let plan: Plan;
    const owes = b.penalty.owed > 0 && !h.forgot.has(b.id);
    // Hailed for room to tack: tack as soon as possible (Rule 20.2(c)).
    if (this.giveRoom && !this.maneuver) {
      const g = this.giveRoom;
      if (b.lastHtwT > g.t || h.t - g.t > 6 || b.tack !== g.from.tack) this.giveRoom = null;
      else if (Math.abs(b.twa) < 100) { this.beginManeuver(h, 'tack'); this.giveRoom = null; this.intent = `Tacking: room to tack for ${g.from.sail}`; }
    }
    const r2t = this.maneuver ? null : this.roomToTackPlan(h);
    const man = this.maneuverPlan(h);
    // Penalty: as soon as she's in clear water (before the start too, if there's time to spare),
    // pausing if someone is coming, since a boat turning must keep clear of everyone (Rule 21).
    const canTurn = h.t >= h.gunT - 0.001 || h.gunT - h.t > 14;
    const L0 = b.cls.loa;
    const clearOfMarks = h.course.marks.every(m => dist(m.p, b) > 2.2 * L0);
    // At a real venue she sails clear of the bank before she starts turning: a turn begun against
    // it gets stuck between turning and keeping off.
    const clearOfBank = () => !h.course.shore || [0, 60, 120, 180, 240, 300].every(a => bankAhead(b, h.course, b.hdg + a) > 2.2 * L0);
    // Well into her turn she carries on unless someone is about to hit her.
    const turning = b.penalty.active && Math.abs(b.penalty.rot) > 60;
    const ok = owes && canTurn && clearOfMarks && (turning ? !this.trafficNear(h, 2 * L0, 3) : this.clearOfOthers(h, 4) && !this.trafficNear(h, 2.5 * L0, 5) && clearOfBank());
    if (ok) { plan = this.penaltyPlan(h); this.maneuver = null; }
    else if (man) plan = man;
    else if (r2t) plan = r2t;
    else if (h.t < h.gunT || !b.started) plan = this.startPlan(h);
    else plan = this.racePlan(h);
    if (plan !== man && (plan.maneuver === 'tack' || plan.maneuver === 'gybe')) this.beginManeuver(h, plan.maneuver);

    // Unstick: stopped for a while outside the pre-start hold.
    if (b.spd < 0.08 * b.cls.hullSpeed && (h.t > h.gunT + 2 || h.gunT - h.t > 30)) {
      if (this.stuckSince < 0) this.stuckSince = h.t;
      if (h.t - this.stuckSince > 3.5) { this.unstickUntil = h.t + 2.2; this.stuckSince = -1; }
    } else this.stuckSince = -1;
    if (h.t < this.unstickUntil) {
      const off = b.tack === 'stbd' ? b.twd - 80 : b.twd + 80;
      plan = { hdg: n360(off), sheet: bestSheet(80), intent: 'Getting out of irons' };
    }

    this.pendingAvoid = null;
    let final = plan.maneuver === 'penalty' ? plan : this.tactics(h, plan);
    if (h.course.shore && !man) final = this.keepOffShore(h, final);
    // Abort a tack to avoid a foul only at its very start; once turning, finish it.
    if (man && this.maneuver && h.t - this.maneuver.t0 < 0.4 && final !== plan && Math.abs(n180(final.hdg - plan.hdg)) > 30) this.maneuver = null;
    else if (man && final !== plan) {
      // Mid-manoeuvre she finishes the turn, unless carrying on means hitting someone (Rule 14).
      if (this.planCost >= 900) this.maneuver = null;
      else { final = { ...final, hdg: plan.hdg, intent: plan.intent }; this.pendingAvoid = null; }
    }
    if (this.pendingAvoid) this.lastAvoid = this.pendingAvoid;
    if (!man && final.maneuver === 'tack' && plan.maneuver !== 'tack') this.beginManeuver(h, 'tack');
    this.intent = final.intent;
    this.push(h.t, final.hdg, final.sheet);
  }

  /** At a real venue: if the course she wants runs onto the bank within a few lengths, bear off or
   *  luff onto the nearest course that's clear (upwind, tack instead if that's the way out). */
  private keepOffShore(h: AiHost, plan: Plan): Plan {
    const b = this.b, L = b.cls.loa;
    if (bankAhead(b, h.course, plan.hdg) > 2.6 * L) return plan;
    const ng = noGoAngle(b.tws);
    for (const a of [15, -15, 30, -30, 45, -45, 60, -60, 80, -80, 100, -100, 130, -130]) {
      const hd = n360(plan.hdg + a);
      const twa = Math.abs(n180(b.twd - hd));
      if (twa < ng + 2) continue;
      if (bankAhead(b, h.course, hd) > 4.5 * L) {
        // Crossing the wind to get there is a tack.
        const flips = Math.sign(n180(b.twd - hd)) !== Math.sign(n180(b.twd - b.hdg)) && twa < 100;
        return { hdg: hd, sheet: bestSheet(twa), intent: 'Keeping off the bank', maneuver: flips ? 'tack' : plan.maneuver };
      }
    }
    return plan;
  }

  private beginManeuver(h: AiHost, kind: 'tack' | 'gybe') {
    const b = this.b;
    this.maneuver = { kind, target: b.tack === 'stbd' ? 0 : 1, t0: h.t };
    if (kind === 'tack') this.lastTackT = h.t; else this.lastGybeT = h.t;
  }

  /** Keep turning until a tack or gybe is finished (target: 0 = going to port, 1 = going to starboard). */
  private maneuverPlan(h: AiHost): Plan | null {
    const m = this.maneuver, b = this.b;
    if (!m) return null;
    const to: 'port' | 'stbd' = m.target === 0 ? 'port' : 'stbd';
    const hdg = m.kind === 'tack' ? this.closeHauled(to, b.twd, b.tws) : n360(to === 'stbd' ? b.twd - vmgAngles(b.cls, b.tws).down : b.twd + vmgAngles(b.cls, b.tws).down);
    if ((b.tack === to && Math.abs(n180(b.hdg - hdg)) < 14) || h.t - m.t0 > 7) { this.maneuver = null; return null; }
    return { hdg, sheet: bestSheet(Math.abs(n180(b.twd - hdg))), intent: m.kind === 'tack' ? 'Tacking' : 'Gybing', maneuver: m.kind };
  }

  private push(t: number, hdg: number, sheet: number) {
    this.queue.push({ t, hdg, sheet });
    while (this.queue.length > 40) this.queue.shift();
  }

  // ───────────────────────── helm (every step) ─────────────────────────
  helm(h: AiHost, dt: number) {
    const b = this.b;
    if (b.finished || b.retired) return; // the engine sails her clear (clear.ts)
    const due = h.t - this.lv.reaction * (1.3 - 0.6 * this.persona.consistency);
    let cmd = this.queue[0];
    for (const q of this.queue) { if (q.t <= due) cmd = q; else break; }
    if (!cmd) return;
    // Slowly wandering steering and trim errors.
    const s = this.lv.noise * (1.4 - this.persona.consistency);
    this.ou += (-this.ou * 0.4 + this.rng.gauss() * s * 0.9) * dt;
    this.ouTrim += (-this.ouTrim * 0.3 + this.rng.gauss() * this.lv.trimNoise) * dt;
    if (this.penDir !== 0 && b.penalty.owed > 0 && this.intent === 'Taking a One-Turn Penalty') {
      b.rudder = this.penDir * 0.95;
      b.sheet = clamp(bestSheet(Math.abs(b.twa), b.tws) - overpowerEase(b.heel), 0, 1);
      return;
    }
    const target = cmd.hdg + this.ou;
    let err = n180(target - b.hdg);
    // Too slow to tack through a big turn: go the long way round (bear away and gybe) instead.
    if (Math.abs(err) > 60 && b.spd < 0.3 * b.cls.hullSpeed) {
      const twaEnd = b.twa - err;
      if (Math.sign(twaEnd) !== Math.sign(b.twa) && Math.abs(twaEnd) < 180 && Math.abs(b.twa) > noGoAngle(b.tws)) err = err > 0 ? err - 360 : err + 360;
    }
    let r = err / 22 - b.rot / 260;
    const big = Math.abs(err) > 50 && Math.abs(b.twa) > noGoAngle(b.tws) + 3;
    const lim = big ? this.lv.tackRudder : 1;
    b.rudder = clamp(r, -lim, lim);
    // "Right in" upwind is a touch off in very light air; and overpowered in a gust she eases a touch.
    const want = cmd.sheet >= 0.97 ? bestSheet(Math.abs(b.twa), b.tws) : cmd.sheet;
    b.sheet = clamp(want - overpowerEase(b.heel) + this.ouTrim, 0.05, 1);
  }

  // ───────────────────────── helpers ─────────────────────────
  /** Is anyone within `rad` now, or about to be (straight-line extrapolation over `horizon` seconds)? */
  private trafficNear(h: AiHost, rad: number, horizon: number) {
    const b = this.b, bv = dir(b.hdg);
    for (const o of h.boats) {
      if (o === b || o.finished || o.retired) continue;
      const rx = o.x - b.x, ry = o.y - b.y;
      if (rx * rx + ry * ry > (rad + 4 * horizon) * (rad + 4 * horizon)) continue;
      const ov = dir(o.hdg);
      const vx = ov.x * o.spd - bv.x * b.spd * 0.3, vy = ov.y * o.spd - bv.y * b.spd * 0.3;
      const vv = vx * vx + vy * vy;
      const tc = vv > 1e-9 ? clamp(-(rx * vx + ry * vy) / vv, 0, horizon) : 0;
      if (dhypot(rx + vx * tc, ry + vy * tc) < rad) return true;
    }
    return false;
  }

  private clearOfOthers(h: AiHost, lengths: number) {
    const b = this.b;
    return h.boats.every(o => o === b || o.finished || o.retired || dhypot(o.x - b.x, o.y - b.y) > lengths * b.cls.loa);
  }

  private closeHauled(tack: 'port' | 'stbd', twd: number, tws: number) {
    const a = vmgAngles(this.b.cls, tws).up + 1.5;
    return n360(tack === 'stbd' ? twd - a : twd + a);
  }

  /** Steer as close as possible to `want` without pointing into the wind. */
  private sailable(want: number, prefer: 'port' | 'stbd'): number {
    const b = this.b;
    const twa = n180(b.twd - want);
    const up = vmgAngles(b.cls, b.tws).up + 1.5;
    if (Math.abs(twa) >= up) return want;
    const side = Math.abs(twa) < 4 ? prefer : twa >= 0 ? 'stbd' : 'port';
    return this.closeHauled(side, b.twd, b.tws);
  }

  // ───────────────────────── penalties ─────────────────────────
  private penaltyPlan(_h: AiHost): Plan {
    const b = this.b;
    if (this.penDir === 0) {
      const up = Math.abs(b.twa) < 90;
      this.penDir = up ? (b.tack === 'stbd' ? 1 : -1) : (b.tack === 'stbd' ? -1 : 1);
    }
    return { hdg: b.hdg, sheet: bestSheet(Math.abs(b.twa)), intent: 'Taking a One-Turn Penalty', maneuver: 'penalty' };
  }

  // ───────────────────────── the start ─────────────────────────
  // Like a real skipper: circulate below the line, set up on starboard below the piece of line they
  // want, hover there with the sail luffing, and pull the trigger when the time to reach the line at
  // full speed matches the clock. Each skipper misjudges the clock and the line by a little (more at
  // club level), so most are on time, some are late and the odd one is over.
  private startPlan(h: AiHost): Plan {
    const b = this.b, c = h.course, L = b.cls.loa, pre = this.pre;
    if (this.penDir !== 0 && b.penalty.owed === 0) this.penDir = 0;
    const T = h.gunT - h.t;
    const Tp = T + pre.clockErr;                     // the clock as this skipper reads it
    const P = c.start.pin, S = c.start.stbd;
    const line = sub(S, P), len = dhypot(line.x, line.y);
    const ld = { x: line.x / len, y: line.y / len };
    const n = { x: -ld.y, y: ld.x };                 // towards the course side
    const over = Math.max(lineSide(c, bow(b)), lineSide(c, stern(b))); // most-forward point, + = over
    const room = -over + pre.lineErr * L;            // room to the line as they judge it
    const twd = b.twd, tws = b.tws;
    const va = vmgAngles(b.cls, tws), ng = noGoAngle(tws);
    const stbdCH = this.closeHauled('stbd', twd, tws);
    const along = dot(sub(b, P), ld);

    // ── After the gun ──
    if (T <= 0) {
      if ((b.ocs && !b.returning) || over > 0) {
        const tgt = { x: b.x - n.x * 2.5 * L, y: b.y - n.y * 2.5 * L };
        const go = bearing(b, tgt);
        return { hdg: go, sheet: bestSheet(Math.abs(n180(twd - go))), intent: b.ocs ? 'Over early: returning' : 'Going back to start' };
      }
      // Start: close-hauled towards the line, tacking if that course misses the line.
      const ch = this.closeHauled(b.tack, twd, tws);
      const hit = lineHit(c, bow(b), ch);
      const u = clamp(hit ? hit.u : dot(sub(b, P), ld) / len, 0.06, 0.94);
      const tgt = { x: P.x + line.x * u + n.x * 0.6 * L, y: P.y + line.y * u + n.y * 0.6 * L };
      const f = this.headFor(tgt);
      return { hdg: f.hdg, sheet: bestSheet(Math.abs(n180(twd - f.hdg))), intent: b.ocs ? 'Restarting' : 'Starting', maneuver: f.tack ? 'tack' : null };
    }

    // ── Which piece of line: personality, line bias and room from the others ──
    if (!pre.triggered && !pre.settled) {
      const sq = n360(bearing(P, S) - 90);
      const bias = n180(twd - sq); // + = starboard end favoured
      let f = clamp(this.persona.startEnd + clamp(bias, -10, 10) * 0.012 + ((this.idx % 3) - 1) * 0.05, 0.1, 0.9);
      const mine = f * len;
      let push = 0;
      for (const o of h.boats) {
        if (o === b || o.finished) continue;
        if (-lineSide(c, o) > 6 * L) continue;
        const dd = mine - dot(sub(o, P), ld);
        if (Math.abs(dd) < 1.6 * L) push += (dd >= 0 ? 1 : -1) * (1.6 * L - Math.abs(dd)) * 0.5;
      }
      f = clamp((mine + push) / len, 0.08, 0.92);
      pre.spot = lerp(pre.spot, f, 0.03);
    }
    // Where we cross (X), and the hover spot back down the starboard close-hauled course from it.
    const X = { x: P.x + line.x * pre.spot, y: P.y + line.y * pre.spot };
    const back = dir(stbdCH + 180);
    const hd = pre.hoverD * L / Math.max(0.3, dot(dir(stbdCH), n));
    const H = { x: X.x + back.x * (hd + L / 2), y: X.y + back.y * (hd + L / 2) }; // where the hull centre hovers

    // ── Time to the line from here at full speed on starboard ──
    // Measured from where the bow will be once she has turned onto the course (turning up swings the bow forward).
    const goHdg = stbdCH;
    const goTwa = Math.abs(n180(twd - goHdg));
    const cosT = Math.max(0.25, dot(dir(goHdg), n));
    const gd = dir(goHdg);
    const bowGo = { x: b.x + gd.x * L / 2, y: b.y + gd.y * L / 2 };
    const D = Math.max(0, -lineSide(c, bowGo) + pre.lineErr * L) / cosT;
    const vT = polarSpeed(b.cls, tws, goTwa);
    const auth = clamp(b.spd / (0.35 * b.cls.hullSpeed), Math.abs(b.twa) < ng + 4 ? 0.32 : 0.16, 1);
    const turnDeg = b.tack === 'stbd' ? Math.abs(n180(goHdg - b.hdg)) : Math.abs(n180(goHdg - b.hdg)) + 25;
    const turnT = turnDeg / Math.max(10, b.cls.maxRot * 0.7 * auth);
    const react = this.lv.reaction * (1.3 - 0.6 * this.persona.consistency);
    const ttl = react + 0.5 * turnT + timeToCover(D, b.spd, vT, accelTau(tws));
    const margin = 0.15 + this.lv.startMargin * (0.5 + 0.5 * this.persona.startEarly);
    const setupT = Math.min(pre.setupT, Math.max(8, h.gunT - 4));

    // ── Over the line, or too close with time to spare ──
    if (!pre.triggered || Tp > 4) {
      if (room < -0.3 * L && Tp > 2) {
        const go = n360(twd + 180 + (along < len / 2 ? -25 : 25));
        return { hdg: go, sheet: bestSheet(155), intent: 'Back below the line' };
      }
      if (room < 0.15 * L && Tp > 2.5) {
        const hdg = b.tack === 'stbd' ? n360(twd - (ng - 12)) : n360(twd + (ng - 12));
        return { hdg, sheet: 0.05, intent: 'Backing off the line' };
      }
    }

    // Go when the time to the line at full speed reaches the time until we want to cross (just after the gun).
    if (!pre.triggered && Tp <= setupT && ttl >= Tp + margin) pre.triggered = true;

    // ── Triggered: go, and control the speed so we cross just after the gun ──
    if (pre.triggered) {
      if (b.tack === 'port' && Math.abs(b.twa) < 100) return { hdg: stbdCH, sheet: bestSheet(goTwa), intent: 'Tacking onto starboard', maneuver: 'tack' };
      const early = (Tp + margin) - ttl; // + = we'd cross before we mean to
      let hdg = goHdg, sheet = bestSheet(goTwa), intent = 'Accelerating to the line';
      if (early > 1.0) { sheet = easedSheet(goTwa, early > 2.5 ? 0.15 : 0.5); hdg = n360(goHdg + 5); intent = 'Burning time'; }
      else if (early > 0.35) { sheet = easedSheet(goTwa, 0.75); intent = 'Controlling speed'; }
      else if (early < -0.8) { hdg = n360(goHdg - 5); intent = 'Late: footing for speed'; }
      // If we'd reach the line before the gun and can only just stop, stop now.
      if (Tp > 0.05 && D < b.spd * Tp && D < b.spd * (1.55 + react) + 0.25 * L) { hdg = n360(twd - (ng + 2)); sheet = 0.05; intent = 'Stopping on the line'; }
      return { hdg, sheet, intent };
    }

    // ── Plenty of time: circulate below our piece of line ──
    // Anticlockwise, like a real fleet: towards the pin on starboard in the near lane, back on port in
    // the far lane, so boats on opposite tacks pass in different lanes instead of meeting head-on.
    if (Tp > setupT) {
      const below = -over;
      const onS = b.tack === 'stbd';
      if (dist(b, X) > 12 * L || below < 2 * L && !onS) {
        const Y = { x: X.x - n.x * 5 * L, y: X.y - n.y * 5 * L };
        const f = this.headFor(Y);
        return { hdg: f.hdg, sheet: easedSheet(Math.abs(n180(twd - f.hdg)), 0.8), intent: 'Moving to the start area', maneuver: f.tack ? 'tack' : null };
      }
      const al = dot(sub(b, X), ld); // + = towards the starboard end
      const west = n360(datan2(-ld.x, -ld.y) * 180 / Math.PI);
      if (onS && Math.abs(b.twa) < 125 && al < -3 * L) return { hdg: n360(twd + va.down), sheet: bestSheet(va.down), intent: 'Turning back', maneuver: 'gybe' };
      if (!onS && Math.abs(b.twa) > 55 && al > 3 * L) return { hdg: stbdCH, sheet: bestSheet(goTwa), intent: 'Turning back', maneuver: 'tack' };
      const base = onS ? west : n360(west + 180);
      const lane = (onS ? 4 : 6.5) * L;
      const corr = clamp(((below - lane) / L) * 14, -28, 28); // + = steer up towards the line
      const towardsWind = n180(twd - base) > 0 ? 1 : -1;
      const hdg = this.sailable(n360(base + towardsWind * corr), b.tack);
      return { hdg, sheet: easedSheet(Math.abs(n180(twd - hdg)), 0.7), intent: 'Timing the start' };
    }

    // ── Set up: sail to the hover spot and arrive on starboard ──
    const dH = dist(b, H);
    if (dH < 1.3 * L) pre.settled = true;
    else if (dH > 3 * L) pre.settled = false;
    if (dH > 1.3 * L && !(pre.settled && dH < 3 * L)) {
      const f = this.headFor(H);
      const a = Math.abs(n180(twd - f.hdg));
      return { hdg: f.hdg, sheet: dH < 4 * L ? easedSheet(a, 0.55) : bestSheet(a), intent: 'Setting up', maneuver: f.tack ? 'tack' : null };
    }
    if (b.tack === 'port' && Math.abs(b.twa) < 100) return { hdg: stbdCH, sheet: easedSheet(goTwa, 0.5), intent: 'Tacking onto starboard', maneuver: 'tack' };
    // Hover: hold the distance to the line with the sail luffing. Too close: sit head to wind and drift back.
    const e = room - pre.hoverD * L;
    if (e > 0.5 * L) return { hdg: n360(stbdCH + 3), sheet: easedSheet(goTwa, 0.45), intent: 'Creeping up to the line' };
    if (e < -0.35 * L && Math.abs(b.twa) > ng - 14) return { hdg: n360(twd - (ng - 10)), sheet: 0.05, intent: 'Holding back' };
    if (Math.abs(b.twa) < ng - 3) return { hdg: n360(twd - (va.up + 8)), sheet: 0.3, intent: 'Bearing away out of irons' };
    return { hdg: n360(twd - (ng + 3)), sheet: 0.08, intent: this.holdName() };
  }

  private holdName() {
    const s = this.pre.spot;
    return s < 0.25 ? 'Holding at the pin' : s > 0.75 ? 'Holding at the starboard end' : 'Holding mid-line';
  }

  /** Heading to a point: straight there if it can be sailed, otherwise close-hauled on this tack
   *  until the other tack is clearly better (so shifts don't make it tack back and forth). */
  private headFor(target: V2): { hdg: number; tack: boolean } {
    const b = this.b;
    const brg = bearing(b, target);
    const twa = n180(b.twd - brg); // + = reached on starboard
    const up = vmgAngles(b.cls, b.tws).up + 1.5;
    if (Math.abs(twa) >= up) return { hdg: brg, tack: Math.abs(b.twa) < 90 && Math.abs(twa) < 90 && Math.sign(twa) !== Math.sign(b.twa) };
    const stay = b.tack === 'stbd' ? twa > -10 : twa < 10;
    if (stay) return { hdg: this.closeHauled(b.tack, b.twd, b.tws), tack: false };
    return { hdg: this.closeHauled(b.tack === 'stbd' ? 'port' : 'stbd', b.twd, b.tws), tack: true };
  }

  // ───────────────────────── racing ─────────────────────────
  private racePlan(h: AiHost): Plan {
    const b = this.b, c = h.course, L = b.cls.loa;
    if (this.penDir !== 0 && b.penalty.owed === 0) this.penDir = 0;
    const leg = c.legs[b.legIndex];
    if (!leg) return { hdg: b.hdg, sheet: 0.3, intent: 'Finished' };
    if (leg.kind === 'finish') {
      // Crossed outside the line? Come back below it and finish properly.
      if (lineSide(c, b) > 0.4 * L) {
        const mid = { x: (c.finish.pin.x + c.finish.stbd.x) / 2 - c.up.x * 2 * L, y: (c.finish.pin.y + c.finish.stbd.y) / 2 - c.up.y * 2 * L };
        const go = this.sailable(bearing(b, mid), b.tack);
        return { hdg: go, sheet: bestSheet(Math.abs(n180(b.twd - go))), intent: 'Back round to finish' };
      }
      return this.upwindTo(h, this.finishTarget(h), null);
    }
    if (leg.kind === 'mark') {
      const M = c.byId[leg.rounding.markId].p;
      if (this.shouldRound(h, leg, leg.rounding, M)) return this.round(h, leg.rounding, M, b.progress);
      if (leg.upwind && Math.abs(n180(b.twd - bearing(b, M))) > 95) {
        // Overstood: the mark is behind us now. Go back round it the right way.
        if (dist(b, M) < 7 * L) return this.round(h, leg.rounding, M, b.progress);
        return this.downwindTo(h, M, leg.rounding, `Back to ${c.byId[leg.rounding.markId].name}`);
      }
      if (leg.upwind) return this.upwindTo(h, M, leg.rounding);
      return this.downwindTo(h, M, leg.rounding, `To ${c.byId[leg.rounding.markId].name}`);
    }
    // Gate: choose a mark.
    const [o0, o1] = leg.options;
    const m0 = c.byId[o0.markId].p, m1 = c.byId[o1.markId].p;
    const gc = { x: (m0.x + m1.x) / 2, y: (m0.y + m1.y) / 2 };
    if (this.gate === null && dist(b, gc) < 16 * L) this.gate = this.chooseGate(h, m0, m1);
    if (this.gate === null) return this.downwindTo(h, gc, null, 'Running to the gate');
    const opt = this.gate === 0 ? o0 : o1, M = this.gate === 0 ? m0 : m1;
    const prog = this.gate === 0 ? b.progress : b.progress2;
    if ((dist(b, M) < 5 * L && prog > -150) || (prog <= -150 && dist(b, M) < 6 * L)) return this.round(h, opt, M, prog);
    return this.downwindTo(h, M, opt, this.gate === 0 ? 'Heading for the right-hand gate' : 'Heading for the left-hand gate');
  }

  private chooseGate(h: AiHost, m0: V2, m1: V2): 0 | 1 {
    const b = this.b, L = b.cls.loa;
    const traffic = (m: V2) => h.boats.filter(o => o !== b && !o.finished && dist(o, m) < 4 * L).length;
    const s0 = dist(b, m0) / L + traffic(m0) * 1.6 - this.persona.sidePref * 0.8 + this.rng.range(-1, 1);
    const s1 = dist(b, m1) / L + traffic(m1) * 1.6 + this.persona.sidePref * 0.8 + this.rng.range(-1, 1);
    return s0 <= s1 ? 0 : 1;
  }

  private finishTarget(h: AiHost): V2 {
    const c = h.course, b = this.b;
    const up = dir(b.twd);
    const P = c.finish.pin, S = c.finish.stbd;
    const pinFav = dot(P, up) < dot(S, up); // the end further downwind is closer
    const t = pinFav ? 0.15 : 0.85;
    return { x: P.x + (S.x - P.x) * t, y: P.y + (S.y - P.y) * t };
  }

  private shouldRound(_h: AiHost, leg: Leg, r: Rounding, M: V2): boolean {
    const b = this.b, L = b.cls.loa;
    const d = dist(b, M);
    if (b.progress < -150) return d < 6 * L; // went the wrong way round: unwind
    if (d > (leg.upwind ? 4 : 5.5) * L) return false;
    if (!leg.upwind) return true;
    // Upwind: only once we can fetch (or we're very close).
    const want = bearing(b, roundingPoint(r, M, b.progress + 40, this.lv.roundIn * L));
    const up = vmgAngles(b.cls, b.tws).up;
    return Math.abs(n180(b.twd - want)) >= up - 2 || d < 2.2 * L || b.progress > -10;
  }

  private round(h: AiHost, r: Rounding, M: V2, prog: number): Plan {
    const b = this.b, L = b.cls.loa;
    const frac = clamp((prog + 25) / (r.sweep + 25), 0, 1);
    const rad = lerp(this.lv.roundIn, this.lv.roundOut, frac) * L;
    // Owe mark-room to an inside boat? Go wider.
    let extra = 0;
    h.boats.forEach((o, j) => {
      if (o === b) return;
      const mr = h.referee.markRoom(this.idx, j);
      if (mr && mr.iOwes) extra = Math.max(extra, 1.2 * L);
    });
    const Q = roundingPoint(r, M, prog + 42, rad + extra);
    const want = bearing(b, Q);
    const hdg = this.sailable(want, b.tack);
    const twa = Math.abs(n180(b.twd - hdg));
    return { hdg, sheet: bestSheet(twa), intent: prog < -150 ? `Going back round ${h.course.byId[r.markId].name}` : `Rounding ${h.course.byId[r.markId].name}`, rounding: { mark: M, side: r.side } };
  }

  private upwindTo(h: AiHost, T: V2, r: Rounding | null): Plan {
    const b = this.b, L = b.cls.loa;
    const twd = b.twd, tws = b.tws;
    const hs = this.closeHauled('stbd', twd, tws), hp = this.closeHauled('port', twd, tws);
    const d = dist(b, T);
    // Near a mark, lay the point beside it where the rounding starts, not the mark itself.
    const Tl = r && d < 10 * L ? roundingPoint(r, T, 0, 0.8 * this.lv.roundIn * L) : T;
    const brg = bearing(b, Tl);
    const onStbd = b.tack === 'stbd';
    // Can we simply reach there? Then no beating.
    const twaT = n180(twd - brg);
    if (Math.abs(twaT) >= vmgAngles(b.cls, tws).up + 20 && Math.abs(twaT) < 100 && (Math.sign(twaT) === Math.sign(b.twa) || Math.abs(b.twa) > 60)) {
      return { hdg: brg, sheet: bestSheet(Math.abs(twaT)), intent: r ? 'Reaching to the mark' : 'Reaching to the finish' };
    }
    // Coming in on port to a mark left to port: get onto the starboard layline before the zone
    // (tacking inside it risks Rule 18.3), so tack as soon as starboard lays it.
    const lay = this.lv.layMargin * (0.8 + 0.4 * (1 - this.persona.risk)) * (r && r.side === 'port' && !onStbd && d < 7 * L ? 0.3 : 1);
    const fetchOther = onStbd ? n180(brg - hp) >= lay : n180(hs - brg) >= lay;
    const fetchThis = onStbd ? n180(hs - brg) >= 0 : n180(brg - hp) >= 0;
    const shift = n180(twd - this.meanTwd);
    const lift = onStbd ? shift : -shift;
    const sinceTack = h.t - this.lastTackT;
    let tack = false, why = '';
    if (!fetchThis && fetchOther) { tack = true; why = 'Tacking on the layline'; }
    const thr = this.lv.shiftThr * this.persona.shiftSense;
    const curOff = Math.abs(n180((onStbd ? hs : hp) - brg)), othOff = Math.abs(n180((onStbd ? hp : hs) - brg));
    if (!tack && !fetchThis && curOff - othOff > 2 * thr + 8) { tack = true; why = 'Tacking towards the mark'; }
    if (!tack && !fetchThis && -lift > thr && d > 6 * L && curOff - othOff > -12) { tack = true; why = 'Tacking on a header'; }
    if (!tack && b.shadow > 0.14) {
      if (this.shadowSince < 0) this.shadowSince = h.t;
      if (h.t - this.shadowSince > 3.5 - 2 * this.persona.risk && d > 5 * L && !fetchThis) { tack = true; why = 'Tacking for clear air'; }
    } else if (b.shadow < 0.06) this.shadowSince = -1;
    // Course boundaries.
    const B = h.course.bounds;
    const off = dot(sub(b, h.course.origin), h.course.right);
    const outward = (onStbd ? dot(dir(hs), h.course.right) : dot(dir(hp), h.course.right));
    if (!tack && Math.abs(off) > B.across * 0.82 && Math.sign(outward) === Math.sign(off)) { tack = true; why = 'Tacking away from the bank'; }
    // At a real venue the shore can come first.
    if (!tack && h.course.shore && bankAhead(b, h.course, onStbd ? hs : hp) < 3.6 * L && bankAhead(b, h.course, onStbd ? hp : hs) > 4 * L) { tack = true; why = 'Tacking away from the bank'; }
    if (tack && sinceTack < this.lv.minTack * (1.2 - 0.4 * this.persona.risk)) tack = false;
    if (tack) {
      this.lastTackT = h.t;
      return { hdg: onStbd ? hp : hs, sheet: bestSheet(45), intent: why, maneuver: 'tack' };
    }
    let hdg = onStbd ? hs : hp;
    let intent = -lift > 2 ? 'On the headed tack' : lift > 2 ? 'On the lifted tack' : 'Beating';
    if (fetchThis) {
      const aim = onStbd ? n360(brg + 2.5) : n360(brg - 2.5);
      // Bear away to the mark only if it's below close-hauled.
      if (onStbd ? n180(hs - aim) > 0 : n180(aim - hp) > 0) hdg = aim;
      intent = r ? 'On the layline' : 'Laying the finish';
    }
    if (b.spd < b.targetSpd * 0.8 && !fetchThis) { hdg = n360(onStbd ? hdg - 4 : hdg + 4); intent = 'Building speed'; }
    return { hdg, sheet: bestSheet(Math.abs(n180(twd - hdg))), intent };
  }

  private downwindTo(h: AiHost, T: V2, r: Rounding | null, label: string): Plan {
    const b = this.b, L = b.cls.loa;
    const twd = b.twd, tws = b.tws;
    const dn = vmgAngles(b.cls, tws).down;
    const brg = bearing(b, T);
    const twaT = Math.abs(n180(twd - brg));
    if (twaT < 75) return this.upwindTo(h, T, r); // the target is upwind of us now: beat to it
    if (twaT <= dn - 2) {
      return { hdg: brg, sheet: bestSheet(twaT), intent: label };
    }
    const hs = n360(twd - dn), hp = n360(twd + dn);
    const onStbd = b.tack === 'stbd';
    const cur = onStbd ? hs : hp, oth = onStbd ? hp : hs;
    const margin = 6 + 6 * (1 - this.persona.risk);
    const sinceGybe = h.t - this.lastGybeT;
    const dCur = Math.abs(n180(cur - brg)), dOth = Math.abs(n180(oth - brg));
    if (dOth + margin < dCur && sinceGybe > this.lv.minTack && dist(b, T) > 2.5 * L) {
      this.lastGybeT = h.t;
      return { hdg: oth, sheet: bestSheet(dn), intent: 'Gybing', maneuver: 'gybe' };
    }
    return { hdg: cur, sheet: bestSheet(dn), intent: label };
  }

  // ───────────────────────── tactics (rules-aware) ─────────────────────────
  // Try a fan of headings around the plan, predict 3 s ahead for each against where the others
  // are going, and pick the cheapest: keep clear when we must (with a margin), hold course when we
  // have right of way (Rule 16.1), avoid contact whatever the rights (Rule 14), and commit to a move.
  private tactics(h: AiHost, plan: Plan): Plan {
    const b = this.b, L = b.cls.loa;
    this.planCost = 0;
    const delay = Math.round(this.lv.reaction / 0.05);
    const others: { j: number; p: Perceived; o: Boat; px: Float64Array; py: Float64Array; ph: Float64Array; g0: number; reach: number }[] = [];
    for (let j = 0; j < h.boats.length; j++) {
      const o = h.boats[j];
      if (o === b || o.finished || o.retired) continue;
      const dx = o.x - b.x, dy = o.y - b.y;
      if (dx * dx + dy * dy > 49 * L * L) continue;
      const p = h.perceived(j, delay);
      const px = new Float64Array(12), py = new Float64Array(12), ph = new Float64Array(12);
      let ox = p.x, oy = p.y, oh = p.hdg;
      for (let k = 0; k < 12; k++) {
        const s = (k + 1) * 0.25;
        oh = n360(oh + p.rot * 0.25 * Math.max(0, 1 - s / 1.2));
        const od = dir(oh);
        ox += od.x * p.spd * 0.25; oy += od.y * p.spd * 0.25;
        px[k] = ox; py[k] = oy; ph[k] = oh;
      }
      const g0 = hullGap(b, o, b.x, b.y, b.hdg, p.x, p.y, p.hdg);
      others.push({ j, p, o, px, py, ph, g0, reach: (L + o.cls.loa) / 2 });
    }
    const marks = h.course.marks;
    const nearMarks = marks.filter(m => dist(m.p, b) < 6 * L);
    if (!others.length && !nearMarks.length) return plan;

    const turnRate = b.cls.maxRot * 0.8 * clamp(b.spd / (0.35 * b.cls.hullSpeed), 0.25, 1);
    const ngA = noGoAngle(b.tws);
    // Each candidate keeps the plan's trim intent (eased or full) at its own wind angle.
    const ease = plan.sheet - bestSheet(Math.abs(n180(b.twd - plan.hdg)));
    const sheetAt = (hdg: number) => clamp(bestSheet(Math.abs(n180(b.twd - hdg))) + ease, 0.05, 1);
    const cands: { hdg: number; sheet: number; extra: number; tag: string }[] = [];
    // Cost of steering off the plan: small for a few degrees, steep for big swerves (lost progress),
    // steeper still while rounding a mark.
    const devK = plan.rounding ? 1.5 : 1;
    for (const a of ANGLES) {
      const hd = n360(plan.hdg + a);
      const extra = (80 * (1 - dcos(a * Math.PI / 180)) + 0.25 * Math.abs(a)) * devK;
      cands.push({ hdg: hd, sheet: a === 0 ? plan.sheet : sheetAt(hd), extra, tag: a === 0 ? '' : a > 0 ? 'right' : 'left' });
    }
    // Slow down: ease off upwind and reaching; downwind the sail is already out, so over-sheet instead.
    const planA = Math.abs(n180(b.twd - plan.hdg));
    cands.push({ hdg: plan.hdg, sheet: planA < 100 ? easedSheet(planA, 0.35) : clamp(bestSheet(planA) + 0.5, 0, 1), extra: 12, tag: 'slow' });
    // Hold the present course: what a right-of-way boat should do while another keeps clear of her.
    const committed = h.t - this.lastAvoid.t < 1.2;
    const holdHdg = committed && this.lastAvoid.tag === 'hold' ? this.lastAvoid.hdg : b.hdg;
    const offPlan = Math.abs(n180(holdHdg - plan.hdg));
    const rowNear = !plan.rounding && others.some(ot => ot.g0 < 2.5 * L && keepClear(b, ot.o, h.t).keeper === 1);
    if (rowNear && offPlan > 4 && Math.abs(n180(b.twd - holdHdg)) > ngA + 2) cands.push({ hdg: holdHdg, sheet: sheetAt(holdHdg), extra: offPlan * 0.55, tag: 'hold' });
    // Rule 18.3: don't tack from port to starboard in the zone when a starboard boat is coming.
    const legNow = h.course.legs[b.legIndex];
    const zoneMark = legNow && legNow.kind === 'mark' && legNow.upwind && b.started ? h.course.byId[legNow.rounding.markId] : null;
    const inZone = zoneMark ? dist(zoneMark.p, b) < 4.6 * L : false;
    const stbdNear = inZone && b.tack === 'port' && others.some(ot => ot.o.tack === 'stbd' && dhypot(ot.p.x - b.x, ot.p.y - b.y) < 5.5 * L && dist(zoneMark!.p, ot.o) < 6 * L);
    if (plan.maneuver !== 'tack' && Math.abs(b.twa) < 90 && h.t > h.gunT) {
      const other = this.closeHauled(b.tack === 'stbd' ? 'port' : 'stbd', b.twd, b.tws);
      // Tacking gives up right of way (Rule 13), so a boat with right of way near her doesn't tack to dodge.
      cands.push({ hdg: other, sheet: bestSheet(45), extra: (b.spd < 0.3 * b.cls.hullSpeed ? 220 : 26) + (rowNear ? 90 : 0), tag: 'tack' });
    }

    let best = cands[0], bestCost = Infinity, bestNote = '';
    for (const c of cands) {
      let cost = c.extra;
      let note = '';
      if (committed) cost += Math.abs(n180(c.hdg - this.lastAvoid.hdg)) * 0.35;
      // Don't dodge into irons: a boat head to wind can't keep clear of anything.
      const ca = Math.abs(n180(b.twd - c.hdg));
      if (ca < ngA + 1 && Math.abs(n180(c.hdg - plan.hdg)) > 3) cost += 45 + 4 * (ngA + 1 - ca);
      const path = this.predictSelf(c.hdg, c.sheet, turnRate);
      // Rounding: never take a line that goes round the mark the wrong way.
      if (plan.rounding) {
        const M = plan.rounding.mark;
        let last = bearing(M, b), pr = 0;
        for (const q of path) { const br = bearing(M, q); const d = n180(br - last); pr += plan.rounding.side === 'port' ? -d : d; last = br; }
        if (pr < -15) cost += 250 + (-15 - pr) * 5;
      }
      const crosses = Math.abs(b.twa) < 90 && Math.sign(n180(b.twd - c.hdg)) !== Math.sign(b.twa) && Math.abs(n180(b.twd - c.hdg)) < 90;
      if (crosses && stbdNear) cost += 420;
      const ghost = crosses ? null : { ...b, hdg: c.hdg, twa: n180(b.twd - c.hdg), tack: (n180(b.twd - c.hdg) >= 0 ? 'stbd' : 'port') as 'stbd' | 'port' };
      for (const ot of others) {
        const kc = ghost ? keepClear(ghost as Boat, ot.o, h.t) : { keeper: 0 as const, rule: '13', why: 'is tacking' };
        const mr = h.referee.markRoom(this.idx, ot.j);
        const iKeep = kc.keeper === 0;
        let mis = this.misjudge.get(ot.j) ?? -1;
        if (iKeep && mis < 0 && ot.g0 < 4 * L) {
          mis = this.rng.chance(this.lv.misjudge) ? h.t + 6 : 0;
          this.misjudge.set(ot.j, mis);
        }
        const fooled = iKeep && mis > h.t;
        // Closest approach along the two predicted paths (cheap bound first, exact gap when close),
        // and how much of the next 3 s is spent inside the margin (so opening a gap beats holding it).
        const margin = this.lv.margin * (1.25 - 0.5 * this.persona.aggression) * L * (fooled ? 0.5 : 1);
        let min = 99, tMin = 99, g1 = 99, viol = 0;
        const sc = fooled ? 0.8 : 1;
        for (let k = 0; k < path.length; k++) {
          const ox = ot.p.x + (ot.px[k] - ot.p.x) * sc, oy = ot.p.y + (ot.py[k] - ot.p.y) * sc;
          const cd = dhypot(path[k].x - ox, path[k].y - oy) - ot.reach;
          const g = cd > 0.7 * L ? cd : hullGap(b, ot.o, path[k].x, path[k].y, path[k].h, ox, oy, ot.ph[k]);
          if (k === 3) g1 = g;
          if (g < min) { min = g; tMin = (k + 1) * 0.25; }
          if (g < margin) viol += margin - g;
        }
        // Already touching: what matters is getting apart, so judge by the gap a second from now.
        if (ot.g0 < 0.05 * L) { min = g1; tMin = 1; }
        const urgency = tMin <= 1.5 ? 1 : 0.45;
        // Rule 14: avoid contact whatever the rights (a skipper who misjudged it only sees it late). A
        // right-of-way boat need not act until it's clear the other isn't keeping clear: against you
        // she holds her course until about 2 s out; with each other the AI skippers give way early.
        if (min < 0.03 * L && (iKeep || (mr && mr.iOwes) ? (!fooled || tMin <= 0.75) : (!ot.o.human || tMin <= 2.0))) cost += 1100;
        if (mr && mr.iOwes) {
          if (min < 0.6 * L) cost += 300 * (0.6 * L - min) / L + 60;
          continue;
        }
        if (iKeep && !(mr && mr.iEntitled)) {
          if (min < margin) { cost += (90 + 500 * (margin - min) / L + 120 * viol / L) * urgency; note = `keep clear of ${ot.o.sail}`; }
        } else {
          // Right of way: hold course and let her keep clear; act only when contact is close (Rule 14),
          // and any change of course near her must leave her room (Rule 16.1).
          const dh = Math.abs(n180(c.hdg - b.hdg));
          if (min < 0.02 * L) cost += tMin <= 1.4 ? (dh < 4 ? 1400 : 1600) : tMin <= 2.4 || !ot.o.human ? 140 : 0;
          else if (!plan.rounding && dh > 6 && ot.g0 < 2.5 * L && min < 0.6 * L) cost += 60 + 200 * (1 - min / (0.6 * L));
        }
      }
      for (const m of nearMarks) {
        let mm = 99;
        for (const q of path) {
          if (Math.abs(q.x - m.p.x) > L || Math.abs(q.y - m.p.y) > L) continue;
          const [s0, s1, r] = capsule(b, q.x, q.y, q.h);
          const dd = pointSeg(m.p, s0, s1) - r - m.r;
          if (dd < mm) mm = dd;
        }
        if (mm < 0.25 * L) cost += 500 * (0.25 * L - mm) / L + 40 + (mm < 0.02 * L ? 900 : 0);
      }
      // Stay in the pond: keep off the banks.
      const end = path[path.length - 1];
      const ec = sub(end, h.course.origin), B = h.course.bounds;
      const off = dot(ec, h.course.right), alongE = dot(ec, h.course.up);
      const bankGap = Math.min(B.across - Math.abs(off), B.alongMax - alongE, alongE - B.alongMin);
      if (bankGap < 2 * L) cost += 60 + 90 * (2 * L - bankGap) / L;
      if (c === cands[0]) this.planCost = cost;
      if (cost < bestCost) { bestCost = cost; best = c; bestNote = note; }
    }
    this.maybeHail(h, others);
    if (best.tag === '') return plan;
    this.pendingAvoid = { t: h.t, hdg: best.hdg, tag: best.tag };
    const intent = best.tag === 'slow' ? 'Slowing to keep clear' : best.tag === 'tack' ? 'Tacking to keep clear' : best.tag === 'hold' ? 'Holding my course' : bestNote ? `Keeping clear of ${bestNote.split(' ').pop()}` : plan.intent;
    if (best.tag === 'tack') this.lastTackT = h.t;
    return { hdg: best.hdg, sheet: best.sheet, intent, maneuver: best.tag === 'tack' ? 'tack' : plan.maneuver };
  }

  private predictSelf(hdg: number, sheet: number, rate: number): { x: number; y: number; h: number }[] {
    const b = this.b;
    const out: { x: number; y: number; h: number }[] = [];
    let x = b.x, y = b.y, hh = b.hdg, v = b.spd;
    const dt = 0.25;
    for (let s = dt; s <= 3.0001; s += dt) {
      const err = n180(hdg - hh);
      const step = clamp(err, -rate * dt, rate * dt);
      hh = n360(hh + step);
      const a = Math.abs(n180(b.twd - hh));
      const target = a < noGoAngle(b.tws) ? 0 : polarSpeed(b.cls, b.tws, a) * trimEfficiency(sheet, a);
      v += (target - v) * (1 - dexp(-dt / 1.6));
      const d = dir(hh);
      x += d.x * v * dt; y += d.y * v * dt;
      out.push({ x, y, h: hh });
    }
    return out;
  }

  private maybeHail(h: AiHost, others: { j: number; p: Perceived; o: Boat }[]) {
    const b = this.b, L = b.cls.loa;
    for (const ot of others) {
      const d = dhypot(ot.p.x - b.x, ot.p.y - b.y);
      if (d > 4 * L) continue;
      const kc = keepClear(b, ot.o, h.t);
      if (kc.keeper !== 1) continue;
      const key = ot.o.id;
      if ((this.hailed.get(key) ?? -99) > h.t - 6) continue;
      // Is she on a collision course with us?
      const rv = sub({ x: ot.p.x, y: ot.p.y }, b);
      const ov = dir(ot.p.hdg), bv = dir(b.hdg);
      const relV = { x: ov.x * ot.p.spd - bv.x * b.spd, y: ov.y * ot.p.spd - bv.y * b.spd };
      const closing = -dot(rv, relV);
      if (closing <= 0) continue;
      const tca = closing / Math.max(1e-6, dot(relV, relV));
      const miss = Math.abs(cross(rv, relV)) / Math.max(1e-6, dhypot(relV.x, relV.y));
      if (tca < 3.5 && miss < 0.7 * L) {
        this.hailed.set(key, h.t);
        h.hail(b, kc.rule === '10' ? 'Starboard!' : kc.rule === '11' ? 'Up, up!' : 'Keep clear!');
      }
    }
  }
}

function pointSeg(p: V2, a: V2, b: V2): number {
  const r = closest(p, p, a, b);
  return r.d;
}

/** Where a ray from a point on a heading meets the start line: u = 0 at the pin, 1 at the starboard end. */
export function lineHit(c: Course, from: V2, hdg: number): { u: number; d: number } | null {
  const P = c.start.pin, S = c.start.stbd;
  const v = dir(hdg), l = sub(S, P);
  const den = cross(v, l);
  if (Math.abs(den) < 1e-6) return null;
  const t = cross(sub(P, from), l) / den;
  if (t < 0) return null;
  const hit = { x: from.x + v.x * t, y: from.y + v.y * t };
  return { u: dot(sub(hit, P), l) / dot(l, l), d: t };
}

/** Sheet that gives a chosen share of full drive by easing (letting the sail luff). */
export function easedSheet(absTwa: number, eff: number): number {
  return clamp(bestSheet(absTwa) - Math.sqrt(Math.max(0, 1 - eff) / 3.6), 0.05, 1);
}

/** Distance to the line along a heading (or straight down to it if the heading misses). */
export function distanceToLine(b: V2, hdg: number, P: V2, S: V2, n: V2): number {
  const v = dir(hdg);
  const l = sub(S, P);
  const den = cross(v, l);
  const side = -dot(sub(b, P), n); // metres below the line
  if (Math.abs(den) > 1e-6) {
    const t = cross(sub(P, b), l) / den;
    if (t > 0) return t;
  }
  const c = Math.max(0.2, dot(v, n));
  return Math.max(0, side) / c;
}

/** Seconds to cover distance D starting at v0 and accelerating towards vT with time constant tau. */
export function timeToCover(D: number, v0: number, vT: number, tau: number): number {
  if (D <= 0) return 0;
  let lo = 0, hi = 120;
  for (let k = 0; k < 40; k++) {
    const t = (lo + hi) / 2;
    const d = vT * t - (vT - v0) * tau * (1 - dexp(-t / tau));
    if (d >= D) hi = t; else lo = t;
  }
  return hi;
}

export function upwindNote(b: Boat) { return upAngle(b.tws); }
