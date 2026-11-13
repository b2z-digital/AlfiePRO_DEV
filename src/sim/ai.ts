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
import type { Boat, Persona, SkipperLevel, Strengths } from './types';
import type { WindField } from './wind';
import { datan2, dcos, dexp, dhypot, dsin } from './dmath';

export interface LevelParams {
  reaction: number; noise: number; trimNoise: number; shiftThr: number; layMargin: number;
  startMargin: number; misjudge: number; forget: number; roundIn: number; roundOut: number;
  minTack: number; tackRudder: number; margin: number;
  /**
   * The approach to a windward mark. layOut: how many lengths out from the mark she plans to be on
   * the final layline (the best are on it outside the zone with room to settle; a club sailor
   * leaves it late and tacks under the mark). layClear: how far above the layline she tacks, in
   * lengths, to cover what the tack itself costs (a sloppier tack needs more).
   */
  layOut: number; layClear: number;
  /** Start judgement: spread of the clock error (s) and of judging the line from the bank (hull lengths). */
  startSigma: number; lineSigma: number;
  /**
   * Start strategy, 0 to 1: how much she reads the line and goes for the end that pays (the upwind
   * end of a biased line, and on a square one the starboard end, for clear wind over the boats
   * below and the freedom to tack) rather than starting wherever she likes to.
   */
  startSense: number;
  /**
   * How a fleet fights for the line (the same for every level until the third tuning, which sharpens
   * the better fleets). runUp: extra lengths back she waits, so she has the room to be at full speed
   * as she crosses rather than still getting going. endDeg and endStbd: how she weighs the line's
   * bias: the degrees of bias that settle which end pays, and the pull of the starboard end on a
   * square line. rowGap, rowGrow and rowPush: how close the front row packs in from the end that
   * pays (the gap between boats, how much it opens with each boat along, and the room she insists on
   * from the boats beside her, in lengths). lag: the seconds she allows for getting a stopped boat
   * going, on top of the sums (the best know their boat). touch: how small an error in her timing
   * (seconds early) she starts to trim away on the run in. even: how much the fleet's waiting depths
   * differ (1 as they did; less, and the row waits level and goes together). follow: she goes when the
   * boat next to windward goes, if that's within this many seconds of her own moment, rather than sit
   * and be rolled (0: she keeps to her own clock).
   */
  runUp: number; endDeg: number; endStbd: number; rowGap: number; rowGrow: number; rowPush: number; lag: number; touch: number; even: number; follow: number;
}
/** The fight for the line as every fleet had it before the third tuning. */
const ROW = { runUp: 0, endDeg: 10, endStbd: 0.45, rowGap: 1.1, rowGrow: 0.05, rowPush: 1.6, lag: 0, touch: 0.35, even: 1, follow: 0 };

/**
 * The four levels. Every skipper sails the same boat in the same wind: nobody is given speed. A
 * better skipper steers straighter and trims closer (noise, trimNoise), tacks cleanly and only when
 * it pays (tackRudder, shiftThr, minTack: a tack costs over a length, so tacking on every flick of
 * the wind loses), judges laylines and roundings tighter, and starts on time at the right end.
 * Sailed alone round a lap, each level is a little quicker than the one below (see levels.test.ts).
 */
export const LEVELS: Record<SkipperLevel, LevelParams> = {
  club: { layOut: 3.0, layClear: 0.85, reaction: 0.45, noise: 4.2, trimNoise: 0.14, shiftThr: 5.5, layMargin: 7, startMargin: 1.4, misjudge: 0.1, forget: 0.25, roundIn: 1.9, roundOut: 1.15, minTack: 5.5, tackRudder: 0.62, margin: 0.45, startSigma: 0.9, lineSigma: 0.42, startSense: 0.12, ...ROW },
  state: { layOut: 4.2, layClear: 0.6, reaction: 0.32, noise: 3, trimNoise: 0.1, shiftThr: 6.5, layMargin: 4.5, startMargin: 0.8, misjudge: 0.04, forget: 0.1, roundIn: 1.75, roundOut: 0.95, minTack: 6, tackRudder: 0.74, margin: 0.42, startSigma: 0.5, lineSigma: 0.26, startSense: 0.65, ...ROW },
  national: { layOut: 4.8, layClear: 0.45, reaction: 0.22, noise: 1.9, trimNoise: 0.06, shiftThr: 7.5, layMargin: 3.2, startMargin: 0.5, misjudge: 0.015, forget: 0.04, roundIn: 1.65, roundOut: 0.85, minTack: 7, tackRudder: 0.82, margin: 0.4, startSigma: 0.3, lineSigma: 0.16, startSense: 0.88, ...ROW },
  world: { layOut: 5.0, layClear: 0.35, reaction: 0.15, noise: 0.8, trimNoise: 0.015, shiftThr: 10, layMargin: 2.4, startMargin: 0.3, misjudge: 0.005, forget: 0.01, roundIn: 1.55, roundOut: 0.78, minTack: 9, tackRudder: 0.92, margin: 0.38, startSigma: 0.18, lineSigma: 0.1, startSense: 1, ...ROW },
};

/**
 * The second tuning (races set up from 12 Nov 2026: `tune: 2`). In fleets of mixed levels the first
 * tuning's Regional and National skippers finished level, and a World skipper only about four places
 * in twelve ahead of a Club one; a rating needs each level to beat the one below. World is as it was.
 * Below it, each level steers and trims a little looser, turns a little slower and leaves more at the
 * marks and the laylines than it did, most at Club. Still nobody is given speed.
 */
export const LEVELS2: Record<SkipperLevel, LevelParams> = {
  club: { ...LEVELS.club, noise: 7, trimNoise: 0.24, tackRudder: 0.52, layMargin: 9, layClear: 1.05, roundIn: 2.15, roundOut: 1.35, shiftThr: 4.5, minTack: 4.5, startSigma: 1.1 },
  state: { ...LEVELS.state, noise: 4.2, trimNoise: 0.135, tackRudder: 0.66, layMargin: 5.6, layClear: 0.72, roundIn: 1.88, roundOut: 1.05, shiftThr: 5.8, minTack: 5.5 },
  national: { ...LEVELS.national, noise: 2.7, trimNoise: 0.088, tackRudder: 0.78, layMargin: 3.9, layClear: 0.52, roundIn: 1.72, roundOut: 0.9, shiftThr: 7 },
  world: { ...LEVELS.world },
};
/** The levels for a race's tuning. */
/**
 * The third tuning: the better the fleet, the harder the start is fought, as in real competition.
 * A national or world fleet reads even a couple of degrees of line bias and packs in from the end
 * that pays; waits further back so as to cross at full speed, not still accelerating; and judges
 * the gun and the line closely enough to be on it. Club fleets start as they did; a regional fleet
 * is a step towards it. (The rest of their sailing is the second tuning's.)
 */
export const LEVELS3: Record<SkipperLevel, LevelParams> = {
  club: { ...LEVELS2.club },
  state: { ...LEVELS2.state, startMargin: 0.7, runUp: 0.4, endDeg: 7, endStbd: 0.3, rowGap: 1.1, rowGrow: 0.05, rowPush: 1.5, lag: 0.12, touch: 0.3, even: 0.8, follow: 0.6 },
  national: { ...LEVELS2.national, roundIn: 1.66, roundOut: 0.84, startMargin: 0.65, startSigma: 0.2, lineSigma: 0.12, runUp: 1.2, endDeg: 4, endStbd: 0.2, rowGap: 1.05, rowGrow: 0.04, rowPush: 1.3, lag: 0.35, touch: 0.25, even: 0.5, follow: 1.4 },
  world: { ...LEVELS2.world, roundIn: 1.5, roundOut: 0.7, startMargin: 0.55, startSigma: 0.12, lineSigma: 0.08, runUp: 1.6, endDeg: 3, endStbd: 0.2, rowGap: 1.0, rowGrow: 0.03, rowPush: 1.2, lag: 0.45, touch: 0.18, even: 0.35, follow: 1.8 },
};
/** The parts of the fight for the line that a skipper's strength at starts moves (third tuning on). */
const ROW_KEYS = ['runUp', 'endDeg', 'endStbd', 'rowGap', 'rowGrow', 'rowPush', 'lag', 'touch', 'even', 'follow'] as const;

export const levelsFor = (tune?: number): Record<SkipperLevel, LevelParams> => ((tune ?? 0) >= 3 ? LEVELS3 : tune === 2 ? LEVELS2 : LEVELS);

/**
 * A club fleet's sharp starters: every club has two or three who start like state sailors (they
 * read the line, fight for the end that pays and are on it at the gun), while the rest of their
 * sailing is club sailing.
 */
export function sharpStarter(lv: LevelParams, tune?: number): LevelParams {
  const st = levelsFor(tune).state;
  if (lv.startSense >= st.startSense) return lv;
  const row = (tune ?? 0) >= 3 ? { runUp: st.runUp, endDeg: st.endDeg, endStbd: st.endStbd, rowGap: st.rowGap, rowGrow: st.rowGrow, rowPush: st.rowPush, lag: st.lag, touch: st.touch, even: st.even, follow: st.follow } : {};
  return { ...lv, startSense: 0.75, startSigma: st.startSigma, lineSigma: st.lineSigma, startMargin: st.startMargin, ...row };
}

/** Which of a skipper's skills belong to which part of the race. */
const AREAS: Record<keyof Strengths, (keyof LevelParams)[]> = {
  start: ['startMargin', 'startSigma', 'lineSigma', 'startSense'],
  speed: ['noise', 'trimNoise', 'tackRudder'],
  tactics: ['shiftThr', 'minTack', 'layMargin', 'layOut', 'layClear'],
  marks: ['roundIn', 'roundOut'],
  rules: ['reaction', 'misjudge', 'forget', 'margin'],
};
const LEVEL_ORDER: SkipperLevel[] = ['club', 'state', 'national', 'world'];
const NO_STRENGTHS: Strengths = { start: 0, speed: 0, tactics: 0, marks: 0, rules: 0 };

/**
 * One skipper's own skills: her fleet's level, moved in each part of the race towards the level
 * above (a strength) or the level below (a weakness). At +1 she starts, say, like the level above;
 * past the ends of the ladder it's a little over half a step more of the same. Nobody is given
 * speed: a "fast" skipper steers straighter and trims closer, which is all a fast skipper is.
 */
export function ownLevel(level: SkipperLevel, s: Strengths, tune?: number): LevelParams {
  const L = levelsFor(tune);
  const i = LEVEL_ORDER.indexOf(level), base = L[level], out = { ...base };
  const up = i < 3 ? L[LEVEL_ORDER[i + 1]] : null, down = i > 0 ? L[LEVEL_ORDER[i - 1]] : null;
  for (const area of Object.keys(AREAS) as (keyof Strengths)[]) {
    const v = clamp(s[area], -1.4, 1.4);
    if (!v) continue;
    for (const k of AREAS[area]) {
      const b = base[k];
      const to = v > 0 ? (up ? up[k] : b + (b - down![k]) * 0.6) : (down ? down[k] : b + (b - up![k]) * 0.6);
      out[k] = Math.max(k === 'misjudge' || k === 'forget' ? 0.001 : 0.004, b + (to - b) * Math.abs(v));
    }
  }
  // (From the third tuning, her strength at starts moves the fight for the line too.)
  const sv = clamp(s.start, -1.4, 1.4);
  if ((tune ?? 0) >= 3 && sv) for (const k of ROW_KEYS) {
    const b = base[k];
    const to = sv > 0 ? (up ? up[k] : b + (b - down![k]) * 0.6) : (down ? down[k] : b + (b - up![k]) * 0.6);
    out[k] = b + (to - b) * Math.abs(sv);
  }
  out.runUp = Math.max(0, out.runUp); out.endDeg = Math.max(2, out.endDeg); out.rowGap = Math.max(0.8, out.rowGap); out.rowGrow = Math.max(0, out.rowGrow); out.rowPush = Math.max(0.85, out.rowPush); out.lag = Math.max(0, out.lag); out.touch = clamp(out.touch, 0.08, 0.35); out.even = clamp(out.even, 0.2, 1); out.follow = Math.max(0, out.follow);
  out.startSense = clamp(out.startSense, 0, 1);
  out.tackRudder = clamp(out.tackRudder, 0.5, 1);
  return out;
}

/**
 * A skipper's strengths for one race: what her kind is good at, her form on the day (the same
 * across the board: every fleet has boats that are on it and boats that aren't), and a little
 * of each part of the race going better or worse than usual.
 */
export function strengthsFor(p: Persona, rng: Rng): Strengths {
  const kind = p.strengths ?? NO_STRENGTHS;
  const form = rng.range(-0.35, 0.35);
  // (Form doesn't reach her manners: someone having a bad day is slow, not suddenly a danger to the fleet.)
  const of = (k: keyof Strengths) => Math.round(clamp(kind[k] + (k === 'rules' ? rng.range(-0.12, 0.12) : form + rng.range(-0.25, 0.25)), -1.4, 1.4) * 100) / 100;
  return { start: of('start'), speed: of('speed'), tactics: of('tactics'), marks: of('marks'), rules: of('rules') };
}

const KNOWN: Record<keyof Strengths, [string, string]> = {
  start: ['Sharp off the line', 'slow off the line'],
  speed: ['Quick in a straight line', 'short of pace'],
  tactics: ['Reads the shifts', 'misses the shifts'],
  marks: ['Tight at the marks', 'wide at the marks'],
  rules: ['Keeps out of trouble', 'gets into tangles'],
};
/** What a skipper is known for, in a few words: her best part of the race, and her worst if it's a real weakness. */
export function knownFor(s: Strengths | undefined): string {
  if (!s) return '';
  const ks = Object.keys(KNOWN) as (keyof Strengths)[];
  const best = ks.reduce((a, k) => (s[k] > s[a] ? k : a)), worst = ks.reduce((a, k) => (s[k] < s[a] ? k : a));
  // (A strength is worth saying sooner than a weakness: it's what you plan your race round.)
  const good = s[best] >= 0.3 ? KNOWN[best][0] : null, bad = s[worst] <= -0.55 ? KNOWN[worst][1] : null;
  if (good && bad) return `${good}, ${bad}`;
  if (good) return good;
  if (bad) return bad[0].toUpperCase() + bad.slice(1);
  return 'Solid all round';
}

export const PERSONAS: Persona[] = [
  { key: 'pin', name: 'Pin hunter', aggression: 0.7, risk: 0.6, startEnd: 0.1, startEarly: 0.3, consistency: 0.7, shiftSense: 1, sidePref: -1, strengths: { start: 0.8, speed: 0, tactics: -0.4, marks: 0.1, rules: -0.1 } },
  { key: 'squeezer', name: 'Squeezer', aggression: 0.85, risk: 0.5, startEnd: 0.9, startEarly: 0.2, consistency: 0.7, shiftSense: 1.1, sidePref: 1, strengths: { start: 0.6, speed: -0.2, tactics: -0.2, marks: 0.6, rules: -0.2 } },
  { key: 'steady', name: 'Steady', aggression: 0.4, risk: 0.3, startEnd: 0.5, startEarly: 0.9, consistency: 0.9, shiftSense: 1, sidePref: 0, strengths: { start: 0.1, speed: 0.1, tactics: 0.1, marks: 0, rules: 0.5 } },
  { key: 'luffer', name: 'Leeward luffer', aggression: 0.9, risk: 0.5, startEnd: 0.62, startEarly: 0.5, consistency: 0.7, shiftSense: 1.2, sidePref: 0, strengths: { start: 0, speed: 0.3, tactics: -0.3, marks: 0.3, rules: -0.1 } },
  { key: 'gambler', name: 'Gambler', aggression: 0.6, risk: 0.9, startEnd: 0.3, startEarly: 0, consistency: 0.55, shiftSense: 0.9, sidePref: 1, strengths: { start: 0.2, speed: 0.2, tactics: -0.7, marks: 0.2, rules: -0.3 } },
  { key: 'builder', name: 'Speed builder', aggression: 0.5, risk: 0.4, startEnd: 0.42, startEarly: 0.6, consistency: 0.8, shiftSense: 1.3, sidePref: 0, strengths: { start: -0.4, speed: 1, tactics: 0, marks: -0.3, rules: 0.1 } },
  { key: 'shifty', name: 'Shift player', aggression: 0.5, risk: 0.5, startEnd: 0.38, startEarly: 0.6, consistency: 0.75, shiftSense: 0.7, sidePref: 0, strengths: { start: -0.3, speed: -0.1, tactics: 1, marks: 0, rules: 0.1 } },
  { key: 'careful', name: 'Conservative', aggression: 0.25, risk: 0.2, startEnd: 0.56, startEarly: 1.4, consistency: 0.85, shiftSense: 1.1, sidePref: 0, strengths: { start: -0.6, speed: 0, tactics: 0.3, marks: -0.6, rules: 0.8 } },
  { key: 'rounder', name: 'Inside-line hunter', aggression: 0.85, risk: 0.8, startEnd: 0.7, startEarly: 0.5, consistency: 0.65, shiftSense: 1, sidePref: 0, strengths: { start: 0, speed: 0, tactics: -0.2, marks: 1, rules: -0.25 } },
  { key: 'allround', name: 'All-rounder', aggression: 0.55, risk: 0.45, startEnd: 0.6, startEarly: 0.7, consistency: 0.85, shiftSense: 1, sidePref: 0, strengths: { start: 0.3, speed: 0.3, tactics: 0.3, marks: 0.3, rules: 0.3 } },
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

/** How far above close-hauled a skipper will squeeze for the last lengths to a mark (degrees). */
const PINCH = 9;
/** With a boat keeping clear of her close by, she comes back to her course this much at a time (degrees a decision: about 9 a second). */
const COME_UP = 0.9;
/** A tack she has just made is finished, and she's sailing again, after this long (s). */
const TACK_SETTLE = 2.6;

/** How long a skipper's sense of the average wind direction reaches back, and of the wind now (s). */
export const WIND_SENSE = { mean: 60, felt: 4 };

export class Skipper implements Helm {
  meanTwd: number;
  feltTwd: number;
  private ou = 0;
  private ouTrim = 0;
  lastTackT = -99;
  lastGybeT = -99;
  /** When she first knew she owed the turn she owes now. */
  private owedSince = -1;
  /** When a tack she needed was last called off for traffic. */
  private tackBlockedT = -99;
  gate: 0 | 1 | null = null;
  /** Pre-start state: the piece of line they want, how deep they hover, when they set up,
   *  and their personal clock and line-sighting errors for this race. */
  pre = { spot: 0.5, dir: 1 as 1 | -1, triggered: false, settled: false, lastFlip: -99, clockErr: 0, lineErr: 0, setupT: 30, hoverD: 1.4, lineShift: 0 };
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

  /** Seconds early this skipper means to cross the line (set for a race officer's drill: she'll be over). */
  eager = 0;
  constructor(public b: Boat, public lv: LevelParams, public persona: Persona, private rng: Rng, public idx: number) {
    this.meanTwd = b.twd;
    this.feltTwd = b.twd;
    this.desHdg = b.hdg;
    this.desSheet = b.sheet;
    const pre = this.pre;
    pre.clockErr = clamp(rng.gauss(), -2.5, 2.5) * lv.startSigma;
    pre.lineErr = clamp(rng.gauss(), -2.5, 2.5) * lv.lineSigma;
    pre.setupT = 25 + 9 * (1 - persona.aggression) + rng.range(0, 4);
    // (The sums in the order they always were for a fleet that waits as fleets did: a race keeps the tuning it was set up with, to the last decimal place.)
    const own = 0.8 * (1 - persona.aggression), chance = rng.range(0, 0.35);
    pre.hoverD = lv.even === 1 && lv.runUp === 0 ? 0.9 + own + chance : 0.9 + lv.even * (own + chance) + lv.runUp;
  }

  // ───────────────────────── decision (10 Hz) ─────────────────────────
  decide(h: AiHost) {
    const b = this.b;
    if (b.finished || b.retired) { this.desSheet = 0.25; this.intent = 'Finished'; this.push(h.t, b.hdg, 0.2); return; }
    // The wind as this skipper reads it: where it has been coming from on average over the last
    // minute or so, and where it's settled now (a few seconds' worth, so a puff's passing flick
    // isn't taken for a shift). A header is the second against the first.
    this.meanTwd = n360(this.meanTwd + n180(b.twd - this.meanTwd) * (0.1 / WIND_SENSE.mean));
    this.feltTwd = n360(this.feltTwd + n180(b.twd - this.feltTwd) * (0.1 / WIND_SENSE.felt));

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
    // She wants four clear lengths round her to begin with. In a fleet that can be a long wait,
    // and the rule is "as soon as possible": the longer she has owed it, the smaller the gap she'll
    // take (down to two and a half lengths, twenty-odd seconds on), as a skipper does who can see
    // the fleet isn't going to open up for her.
    if (!owes) this.owedSince = -1; else if (this.owedSince < 0) this.owedSince = h.t;
    const owedFor = owes ? h.t - Math.max(this.owedSince, h.gunT - 14) : 0;
    const press = clamp((owedFor - 5) / 18, 0, 1);
    const ok = owes && canTurn && clearOfMarks && (turning ? !this.trafficNear(h, 2 * L0, 3) : this.clearOfOthers(h, lerp(4, 2.5, press)) && !this.trafficNear(h, lerp(2.5, 1.9, press) * L0, lerp(5, 3.4, press)) && clearOfBank());
    if (ok) { plan = this.penaltyPlan(h); this.maneuver = null; }
    else if (man) plan = man;
    else if (r2t) plan = r2t;
    else if (h.t < h.gunT || !b.started) plan = this.startPlan(h);
    else plan = this.racePlan(h);
    // Owing a turn with boats all round her, she doesn't sail on in the pack waiting for it to
    // open up: she eases off and lets them sail away from her, and turns in the water they leave.
    // (Two boats that both owe one don't both drop back, or they'd stay in each other's way for good: the one behind does.)
    const otherOwing = h.boats.some((o, j) => j < this.idx && !o.finished && !o.retired && o.penalty.owed > 0 && dist(o, b) < 6 * L0);
    if (!ok && owes && canTurn && b.started && owedFor > 3 && !otherOwing && !plan.maneuver && !plan.rounding && h.course.marks.every(m => dist(m.p, b) > 3 * L0)) {
      const a = Math.abs(n180(b.twd - plan.hdg));
      plan = { ...plan, sheet: a < 100 ? easedSheet(a, 0.35) : clamp(bestSheet(a) + 0.5, 0, 1), intent: 'Dropping back to take a penalty' };
    }
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
    if (man && this.maneuver && h.t - this.maneuver.t0 < 0.4 && final !== plan && Math.abs(n180(final.hdg - plan.hdg)) > 30) this.blocked(h);
    else if (man && final !== plan) {
      // Mid-manoeuvre she finishes the turn, unless carrying on means hitting someone (Rule 14).
      if (this.planCost >= 900) this.blocked(h);
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

  /** A tack or gybe she had begun is called off: someone was in the way. She can try again in a moment. */
  private blocked(h: AiHost) {
    if (this.maneuver?.kind === 'tack') { this.tackBlockedT = h.t; this.lastTackT = h.t - (TACK_SETTLE - 0.8); }
    this.maneuver = null;
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
    let target = cmd.hdg + this.ou;
    // Pressed on a run, with the bow starting to go down: weave gently from side to side to keep it
    // up, as you do. The best skippers feel it early; a club sailor sits there until it buries.
    const feel = 0.08 + 0.85 * this.lv.reaction;
    const weave = clamp((b.dive - feel) / 0.25, 0, 1);
    if (weave > 0 && !this.maneuver) target += 11 * weave * dsin(h.t * 2.5 + this.idx * 1.9);
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
    // (And pressed on a run she sheets in a little, to show the wind less sail.)
    b.sheet = clamp(want - overpowerEase(b.heel) + 0.14 * weave + this.ouTrim, 0.05, 1);
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

  /**
   * Close-hauled and wanting to point a little higher (the last lengths to a windward mark): squeeze
   * up to it on the tack she's on, by no more than a good skipper can pinch without stopping. She
   * never crosses the wind this way: a tack is a decision made where room has been looked for.
   */
  private squeeze(want: number): number {
    const b = this.b;
    const up = vmgAngles(b.cls, b.tws).up + 1.5;
    const twa = n180(b.twd - want); // + = on starboard
    const mine = b.tack === 'stbd' ? twa : -twa;
    if (mine >= up) return want;
    const a = Math.max(mine, up - PINCH);
    return n360(b.tack === 'stbd' ? b.twd - a : b.twd + a);
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
      // The line's bias as a sailor judges it: from the wind's average over the sequence, not the
      // puff of the moment (a fleet that chased every swing of the wind would stampede from end to
      // end and nobody would be set up at the gun). The course was laid to the wind, so that's
      // where the average starts.
      // (A skipper in a drill or lesson starts where her part says, and reads the wind as it is.)
      const sense = this.persona.startSense ?? 0;
      pre.lineShift += (n180(twd - c.axis) - pre.lineShift) * (0.1 / 240);
      const sq = n360(bearing(P, S) - 90);
      const bias = n180((sense > 0 ? c.axis + pre.lineShift : twd) - sq); // + = starboard end favoured
      let f = clamp(this.persona.startEnd + clamp(bias, -10, 10) * 0.012 + ((this.idx % 3) - 1) * 0.05, 0.1, 0.9);
      // A skipper who reads the line goes for the end that pays: the upwind end of a biased line
      // (and it takes a good few degrees of pin bias to outweigh the starboard end's pull), and on a square line the starboard end, for clear wind over everyone
      // below and the freedom to tack away. They can't all have the end: the boldest take it and
      // the rest line up along from it, a little over a length apart and spreading out down the
      // line, so the front row fills from the end that pays.
      const pays = clamp(bias / this.lv.endDeg + this.lv.endStbd, -1, 1);
      if (sense > 0.3 && Math.abs(pays) > 0.05) {
        const claim = (o: Boat) => (o.persona ? 0.6 * o.persona.aggression + 0.4 * o.persona.risk : 0) + (Number(o.id.slice(1)) % 7) * 0.013;
        let ahead = 0;
        for (const o of h.boats) if (o !== b && !o.human && (o.persona?.startSense ?? 0) > 0.3 && claim(o) > claim(b)) ahead++;
        // The boldest sets up a length in from the mark (a sharp fleet's, with its longer run in on
        // starboard, a little further in from the pin, so as not to be carried past it).
        let along = (pays < 0 && this.lv.runUp > 0 ? 0.9 + 0.5 * this.lv.runUp : 0.9) * L;
        for (let k = 0; k < ahead; k++) along += (this.lv.rowGap + this.lv.rowGrow * k) * L;
        const slot = clamp(along / len, 0.9 * L / len, 0.94);
        f = lerp(f, pays > 0 ? 1 - slot : slot, Math.min(1, sense * 1.15) * clamp(Math.abs(pays) / 0.2, 0, 1));
      }
      const mine = f * len;
      let push = 0;
      for (const o of h.boats) {
        if (o === b || o.finished) continue;
        if (-lineSide(c, o) > 6 * L) continue;
        const dd = mine - dot(sub(o, P), ld);
        if (Math.abs(dd) < this.lv.rowPush * L) push += (dd >= 0 ? 1 : -1) * (this.lv.rowPush * L - Math.abs(dd)) * 0.5;
      }
      f = sense > 0 ? clamp((mine + push) / len, Math.min(0.06, 0.9 * L / len), Math.max(0.94, 1 - 0.9 * L / len)) : clamp((mine + push) / len, 0.08, 0.92);
      pre.spot = lerp(pre.spot, f, sense > 0 ? 0.04 : 0.03);
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
    // (A sharp skipper allows for how slowly a stopped boat gets going, and more so packed in a row,
    // where every sail to windward takes some of her wind once they all sheet in.)
    let crowd = 0;
    if (this.lv.lag > 0) for (const o of h.boats) {
      if (o === b || o.finished) continue;
      const al = dot(sub(o, b), ld);
      if (al > 0.2 * L && al < 3.2 * L && Math.abs(lineSide(c, o) - lineSide(c, b)) < 2 * L) crowd++;
    }
    // (That allowance decides when she goes. Once she's going she steers by the sums alone, which err
    // towards her being early: better to trim a little speed off than be over.)
    const ttl0 = react + 0.5 * turnT + timeToCover(D, b.spd, vT, accelTau(tws));
    const ttl = ttl0 + this.lv.lag * (1 + 1.5 * Math.min(2, crowd)) * clamp(1 - b.spd / (0.6 * vT), 0, 1);
    const margin = 0.15 + this.lv.startMargin * (0.5 + 0.5 * this.persona.startEarly) - this.eager;
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
    // A sharp fleet's front row goes together: when the boat next to windward sheets in and goes, she
    // goes with her (if it's nearly her time anyway) rather than sit, be sailed over and start in that
    // boat's dirty wind. She then trims off the time she's early on the way in.
    if (!pre.triggered && this.lv.follow > 0 && pre.settled && b.tack === 'stbd' && Tp <= setupT && ttl >= Tp + margin - this.lv.follow) {
      for (const o of h.boats) {
        if (o === b || o.finished || o.tack !== 'stbd' || o.spd < 0.45 * vT) continue;
        const al = dot(sub(o, b), ld), dp = lineSide(c, o) - lineSide(c, b);
        if (al > 0.2 * L && al < 2.4 * L && Math.abs(dp) < 1.8 * L && Math.abs(n180(o.hdg - goHdg)) < 25) { pre.triggered = true; break; }
      }
    }

    // ── Triggered: go, and control the speed so we cross just after the gun ──
    if (pre.triggered) {
      if (b.tack === 'port' && Math.abs(b.twa) < 100) return { hdg: stbdCH, sheet: bestSheet(goTwa), intent: 'Tacking onto starboard', maneuver: 'tack' };
      const early = (Tp + margin) - ttl0; // + = we'd cross before we mean to
      let hdg = goHdg, sheet = bestSheet(goTwa), intent = 'Accelerating to the line';
      if (early > 1.0) { sheet = easedSheet(goTwa, early > 2.5 ? 0.15 : 0.5); hdg = n360(goHdg + 5); intent = 'Burning time'; }
      else if (early > this.lv.touch) { sheet = easedSheet(goTwa, this.lv.touch < 0.35 ? clamp(0.95 - 0.45 * early, 0.55, 0.9) : 0.75); intent = 'Controlling speed'; }
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
    const off = n180(b.twd - want);
    // Beating on the tack that doesn't lead there, she has a tack to make first: that's the beat's
    // business (it looks for the layline, and for room), not the rounding's.
    const beating = Math.abs(b.twa) < up + 14;
    if (beating && Math.abs(off) < 80 && (off >= 0 ? b.tack !== 'stbd' : b.tack !== 'port')) return false;
    if (b.progress > -10) return true;
    if (Math.abs(off) >= up - 2) return true;
    // Close under it: only if she can squeeze round on the tack she's on. (Close under the mark on
    // the wrong side of the wind she has a tack to make first, which is the beat's business: begun
    // as a "rounding" it was a tack nobody had looked for room to make.)
    return d < 2.2 * L && Math.abs(off) >= up - PINCH;
  }

  private round(h: AiHost, r: Rounding, M: V2, prog: number): Plan {
    const b = this.b, L = b.cls.loa;
    const frac = clamp((prog + 25) / (r.sweep + 25), 0, 1);
    // (The pushier the skipper, the closer she shaves it.)
    const rad = lerp(this.lv.roundIn, this.lv.roundOut, frac) * (1.08 - 0.16 * this.persona.aggression) * L;
    // Owe mark-room to an inside boat? Go wider.
    let extra = 0;
    h.boats.forEach((o, j) => {
      if (o === b) return;
      const mr = h.referee.markRoom(this.idx, j);
      if (mr && mr.iOwes) extra = Math.max(extra, 1.2 * L);
    });
    const Q = roundingPoint(r, M, prog + 42, rad + extra);
    const want = bearing(b, Q);
    let hdg: number;
    if (h.course.legs[b.legIndex]?.upwind && Math.abs(b.twa) < 90) {
      const wTwa = n180(b.twd - want);
      const otherTack = wTwa >= 0 ? b.tack !== 'stbd' : b.tack !== 'port';
      // (Decidedly on the other tack: a point she's about to sweep past, a few degrees the other side of the wind, isn't a reason to tack.)
      if (otherTack && Math.abs(wTwa) > vmgAngles(b.cls, b.tws).up - 12 && Math.abs(wTwa) + Math.abs(b.twa) < 180) {
        // The way round is on the other tack (she came in on port, or was kept from tacking by a
        // boat on the layline and has sailed past it). That's a tack, and it's asked for as one,
        // so room is looked for and Rule 18.3 kept; until there's room she holds her course.
        if (h.t - this.lastTackT > TACK_SETTLE) {
          this.lastTackT = h.t;
          return { hdg: this.closeHauled(b.tack === 'stbd' ? 'port' : 'stbd', b.twd, b.tws), sheet: bestSheet(45), intent: 'Tacking round the mark', maneuver: 'tack', rounding: { mark: M, side: r.side } };
        }
        hdg = this.closeHauled(b.tack, b.twd, b.tws);
      } else hdg = this.squeeze(want);
    } else hdg = this.sailable(want, b.tack);
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
    // Tacking for a mark's final layline she allows for the tack itself: enough above the layline
    // that she still lays it once she's round and sailing again. (Close in, the point she's laying
    // is already the room she rounds with, so there's nothing more to add.)
    const inTack: 'port' | 'stbd' | null = r ? (r.side === 'port' ? 'stbd' : 'port') : null;
    const lay = this.lv.layMargin * (0.8 + 0.4 * (1 - this.persona.risk)) + (inTack && b.tack !== inTack ? datan2(this.lv.layClear * L * clamp((d - 2 * L) / (3 * L), 0, 1), Math.max(d, L)) * 180 / Math.PI : 0);
    const fetchOther = onStbd ? n180(brg - hp) >= lay : n180(hs - brg) >= lay;
    const fetchThis = onStbd ? n180(hs - brg) >= 0 : n180(brg - hp) >= 0;
    const shift = n180(this.feltTwd - this.meanTwd);
    const lift = onStbd ? shift : -shift;
    const sinceTack = h.t - this.lastTackT;
    let tack = false, why = '', must = false;
    let squeeze: number | null = null;
    // The least room she can round with: half a length off the mark.
    const Tm = r ? roundingPoint(r, T, 0, 0.5 * L) : T;
    let laysMark = false, shooting = false;
    // The approach to a windward mark is sailed to a plan: be on the final layline a few lengths
    // out, with one tack to get there. Nothing else is worth a tack this close (a header here is
    // gone before it pays, and every extra tack is a length and a boat or two).
    const approach = !!inTack && d < clamp(0.3 * h.course.beat, 6 * L, 9 * L);
    if (approach) {
      const settled = sinceTack > TACK_SETTLE;
      if (b.tack !== inTack) {
        // On the other tack: straight on to the layline, and tack on it. (With boats coming up the
        // layline in the way she sails on and tacks in the first gap. Slowing to wait for one was
        // tried, and measured: it cost her more than the lengths she overstands by.)
        if (fetchOther && settled) { tack = true; must = true; why = 'Tacking on the layline'; }
      } else if (!fetchThis && !(laysMark = onStbd ? n180(hs - bearing(b, Tm)) >= 0 : n180(bearing(b, Tm) - hp) >= 0)) {
        // On the final tack and not even laying the mark with half a length to spare (laying it
        // closer than she'd choose to is still laying it: she carries on). Where would a hitch on
        // the other tack meet the layline?
        const brgM = bearing(b, Tm);
        const dIn = dir(onStbd ? hs : hp), dOut = dir(onStbd ? hp : hs), v = sub(Tm, b);
        const den = cross(dOut, dIn);
        const out = Math.abs(den) > 1e-6 ? cross(v, dOut) / -den : 0; // lengths out from the mark, along the layline
        const hitch = Math.abs(den) > 1e-6 ? cross(v, dIn) / den : 0; // how far she'd sail on the other tack to get there
        const short = onStbd ? n180(brgM - hs) : n180(hp - brgM);     // degrees above close-hauled the mark bears
        const plan = this.lv.layOut + 2.4 * (0.5 - this.persona.risk);
        if (d < 1.8 * L && short <= 26 && b.spd > 0.6 * b.targetSpd) {
          // A length or so short, with way on: luff and carry her round on what speed she has.
          squeeze = n360(onStbd ? hs + short + 1.5 : hp - short - 1.5);
          shooting = true;
        } else if (d < 3.4 * L && short <= PINCH + 3 && b.spd > 0.4 * b.targetSpd) {
          // Nearly laying it, close in: squeeze up the last few lengths instead of two tacks in the zone.
          squeeze = n360(onStbd ? hs + Math.min(PINCH, short + 1.5) : hp - Math.min(PINCH, short + 1.5));
        } else if (settled && (d < 3.4 * L || (out <= plan * L && hitch > 1.2 * L))) {
          tack = true; must = true; why = 'Tacking out to the layline';
        } else if (d < 3.4 * L && h.t - this.tackBlockedT < 2.2) {
          // Under the mark with boats in the way of her tack: slow down and let them through,
          // instead of sailing on past the mark.
          return { hdg: onStbd ? hs : hp, sheet: easedSheet(45, 0.3), intent: 'Waiting for room to tack' };
        }
      }
    } else {
      if (!fetchThis && fetchOther) { tack = true; must = !!r; why = 'Tacking on the layline'; }
      const thr = this.lv.shiftThr * this.persona.shiftSense;
      const curOff = Math.abs(n180((onStbd ? hs : hp) - brg)), othOff = Math.abs(n180((onStbd ? hp : hs) - brg));
      if (!tack && !fetchThis && curOff - othOff > 2 * thr + 8) { tack = true; why = 'Tacking towards the mark'; }
      if (!tack && !fetchThis && -lift > thr && d > 6 * L && curOff - othOff > -12) { tack = true; why = 'Tacking on a header'; }
      if (!tack && b.shadow > 0.14) {
        if (this.shadowSince < 0) this.shadowSince = h.t;
        if (h.t - this.shadowSince > 3.5 - 2 * this.persona.risk && d > 5 * L && !fetchThis) { tack = true; why = 'Tacking for clear air'; }
      } else if (b.shadow < 0.06) this.shadowSince = -1;
    }
    // Course boundaries.
    const B = h.course.bounds;
    const off = dot(sub(b, h.course.origin), h.course.right);
    const outward = (onStbd ? dot(dir(hs), h.course.right) : dot(dir(hp), h.course.right));
    if (!tack && Math.abs(off) > B.across * 0.82 && Math.sign(outward) === Math.sign(off)) { tack = true; why = 'Tacking away from the bank'; }
    // At a real venue the shore can come first.
    if (!tack && h.course.shore && bankAhead(b, h.course, onStbd ? hs : hp) < 3.6 * L && bankAhead(b, h.course, onStbd ? hp : hs) > 4 * L) { tack = true; why = 'Tacking away from the bank'; }
    // Not tacking again straight after a tack is for shifts and lanes: a layline doesn't wait.
    if (tack && sinceTack < (must ? TACK_SETTLE : this.lv.minTack * (1.2 - 0.4 * this.persona.risk))) tack = false;
    if (tack) {
      this.lastTackT = h.t;
      return { hdg: onStbd ? hp : hs, sheet: bestSheet(45), intent: why, maneuver: 'tack' };
    }
    if (squeeze != null) return { hdg: squeeze, sheet: bestSheet(Math.abs(n180(twd - squeeze))), intent: shooting ? 'Shooting the mark' : 'Squeezing up to the mark' };
    let hdg = onStbd ? hs : hp;
    let intent = -lift > 2 ? 'On the headed tack' : lift > 2 ? 'On the lifted tack' : 'Beating';
    if (fetchThis) {
      const aim = onStbd ? n360(brg + 2.5) : n360(brg - 2.5);
      // Bear away to the mark only if it's below close-hauled.
      if (onStbd ? n180(hs - aim) > 0 : n180(aim - hp) > 0) hdg = aim;
      intent = r ? 'On the layline' : 'Laying the finish';
    } else if (laysMark) intent = 'On the layline';
    if (b.spd < b.targetSpd * 0.8 && !fetchThis && !laysMark) { hdg = n360(onStbd ? hdg - 4 : hdg + 4); intent = 'Building speed'; }
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
    if (rowNear && offPlan > 4 && Math.abs(n180(b.twd - holdHdg)) > ngA + 2) {
      cands.push({ hdg: holdHdg, sheet: sheetAt(holdHdg), extra: offPlan * 0.55, tag: 'hold' });
      // Or come back to her course slowly, a little at a time, so the boat keeping clear of her
      // always has room to (Rule 16.1). Held off her course by a boat to windward, this is how she
      // gets back up to it instead of being carried off below it for as long as that boat is there.
      const back = n360(b.hdg + clamp(n180(plan.hdg - b.hdg), -COME_UP, COME_UP));
      if (Math.abs(n180(b.twd - back)) > ngA + 2) cands.push({ hdg: back, sheet: sheetAt(back), extra: Math.max(0, Math.abs(n180(back - plan.hdg))) * 0.4, tag: 'back' });
    }
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
    const intent = best.tag === 'slow' ? 'Slowing to keep clear' : best.tag === 'tack' ? 'Tacking to keep clear' : best.tag === 'hold' ? 'Holding my course' : best.tag === 'back' ? plan.intent : bestNote ? `Keeping clear of ${bestNote.split(' ').pop()}` : plan.intent;
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
