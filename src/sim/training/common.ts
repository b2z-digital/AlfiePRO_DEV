// What every drill, lesson and scenario has in common: the spec of a playable scene, goal building
// blocks (fouls, start facts, stars), and the short scripts that sail boats in them, including
// the ones that show "the right way". Pure TypeScript, so every scene is tested headless.
import type { Race } from '../engine';
import type { Boat, Incident, Tack } from '../types';
import { accelTau, noGoAngle, polarSpeed, vmgAngles } from '../classes';
import { easedSheet, lineHit, timeToCover } from '../ai';
import { V2, bearing, dir, dist, dot, n180, n360, sub } from '../math';
import { bankAhead, bow, hullGap, lineSide } from '../physics';
import { keepClear, spellSail } from '../referee';
import { Goal, GoalCtx, Outcome, PlanFn, SceneDef, Step, closeHauled, onTack } from '../scene';
import { dhypot } from '../dmath';

export type SceneKind = 'drill' | 'lesson' | 'lab';

export interface SceneSpec {
  kind: SceneKind;
  id: string;
  title: string;
  /** Who you are and what's going on, in a sentence or two. */
  brief: string;
  /** How to do it well: shown before you go and when you watch it done. */
  tip: string;
  /** What each stick does in this one, when that's the point of it: shown before you watch it done. */
  sticks?: { sail: string; rudder: string };
  scene: (seed: number) => SceneDef;
  goal: Goal;
  /** Sails your boat the right way, for "Watch the right way" (and proves the scene can be won). */
  solution?: PlanFn | 'ai';
  /** For tests: a plan that should fail, and the rule it should break ('' fails without a foul). */
  mistake?: PlanFn;
  mistakeRule?: string;
  /** Seeds the tests try the solution with. */
  testSeeds?: number[];
  /** Seeds the demo is known to win on. "Watch the right way" plays the first one, so the demo
   *  doesn't hang on how the wind and the fleet happened to go in your own try. */
  demoSeeds?: number[];
}

// ───────────────────────── outcomes ─────────────────────────

export const won = (title: string, text: string, extra: Partial<Outcome> = {}): Outcome => ({ pass: true, title, text, ...extra });
export const lost = (title: string, text: string, extra: Partial<Outcome> = {}): Outcome => ({ pass: false, title, text, ...extra });

/** Name the other boats in a referee's sentence: "46" becomes "Orange (46)". */
export function named(race: Race, text: string): string {
  let out = text;
  for (const b of race.boats) {
    if (b.isPlayer || !b.name || b.name === b.sail) continue;
    out = out.replace(new RegExp(`\\b${b.sail}\\b`), `${b.name} (${b.sail})`).replace(new RegExp(`\\b${b.sail}\\b(?![)])`, 'g'), b.name);
  }
  return out;
}

/** The player broke a rule: stop there and explain it. */
export function fouled(g: GoalCtx): Outcome | null {
  const i = g.mine[0];
  if (!i) return null;
  return lost(`Rule ${i.rule}: ${i.title.toLowerCase()}`, named(g.race, `${i.explanation} ${i.nextTime ?? ''}`.trim()), { incident: i });
}

/** Contact involving the player, whoever had right of way. */
export function contact(g: GoalCtx): Incident | null {
  return g.race.incidents.find(i => i.kind === 'contact' && (i.offender === g.player.id || i.victim === g.player.id)) ?? null;
}

/** Rule 14: even with right of way, avoid contact if you reasonably can. */
export function rule14(g: GoalCtx): Outcome | null {
  const c = contact(g);
  if (!c || c.offender === g.player.id) return null;
  return lost('Rule 14: avoiding contact', `You had right of way, but you hit ${g.race.boatById(c.offender).name}. Every boat must avoid contact if reasonably possible, even the one with right of way. Hold your course until it's clear she isn't keeping clear, then change course to avoid her, and protest.`, { incident: c });
}

/** Did the player hail something matching `re` (after time `since`, race time)? */
export function hailed(g: GoalCtx, re: RegExp, since = -Infinity): boolean {
  return g.race.events.some(e => e.type === 'hail' && e.boat === g.player.id && e.t >= since && re.test(e.text));
}

export function starsFor(v: number, steps: [number, number, number]): 0 | 1 | 2 | 3 {
  return v <= steps[0] ? 3 : v <= steps[1] ? 2 : v <= steps[2] ? 1 : 0;
}

// ───────────────────────── the start ─────────────────────────

export interface StartFacts {
  /** Seconds after the gun she crossed. */
  late: number;
  /** Speed as a share of target when she crossed. */
  spd: number;
  /** Hull lengths from the pin and from the starboard end where she crossed. */
  fromPin: number;
  fromStbd: number;
  lineL: number;
  tack: Tack;
}

/** Call every step: notes the moment the player starts. */
export function startFacts(g: GoalCtx): StartFacts | null {
  const m = g.memo, p = g.player, race = g.race;
  if (m.late === undefined && p.started) {
    const c = race.course, P = c.start.pin, S = c.start.stbd, len = dist(P, S);
    const ev = race.events.find(e => e.type === 'started' && e.boat === p.id) as { late: number } | undefined;
    m.late = ev ? ev.late : race.t - race.gunT;
    m.spd = p.targetSpd > 0 ? Math.min(1.2, p.spd / p.targetSpd) : 0;
    const along = dot(sub(p, P), { x: (S.x - P.x) / len, y: (S.y - P.y) / len });
    m.fromPin = along / c.L;
    m.fromStbd = (len - along) / c.L;
    m.lineL = len / c.L;
    m.tack = p.tack;
  }
  if (m.late === undefined) return null;
  return { late: m.late as number, spd: m.spd as number, fromPin: m.fromPin as number, fromStbd: m.fromStbd as number, lineL: m.lineL as number, tack: m.tack as Tack };
}

export const pctText = (v: number) => `${Math.round(v * 100)}%`;
export const secText = (v: number) => `${v.toFixed(1)} s`;

/** Over the line at the gun: an early end to any start drill. */
export function overEarly(g: GoalCtx): Outcome | null {
  if (!g.player.ocs || g.race.t < g.race.gunT) return null;
  return lost('Over early', 'You were on the course side of the line at the gun, so the race officer hailed "Recall" with your sail number. Judge it by time to the line: at full speed from where you are, how long will it take? Go only when that matches the clock.');
}

/** A point on the start line: u = 0 at the pin, 1 at the starboard end, `below` hull lengths back from it. */
export function linePoint(race: Race, u: number, below: number): V2 {
  const c = race.course, P = c.start.pin, S = c.start.stbd;
  const len = dist(P, S);
  const n = { x: -(S.y - P.y) / len, y: (S.x - P.x) / len }; // towards the course side
  return { x: P.x + (S.x - P.x) * u - n.x * below * c.L, y: P.y + (S.y - P.y) * u - n.y * below * c.L };
}

/** Seconds to reach the start line close-hauled on a tack at full speed from here, with the turn. */
export function timeToLine(race: Race, b: Boat, tack: Tack): { ttl: number; hdg: number } {
  const c = race.course, L = b.cls.loa;
  const hdg = onTack(b, tack, vmgAngles(b.cls, b.tws).up + 1.5);
  const gd = dir(hdg);
  const bowGo = { x: b.x + gd.x * L / 2, y: b.y + gd.y * L / 2 };
  const below = -lineSide(c, bowGo);
  if (below <= 0) return { ttl: 0, hdg };
  const P = c.start.pin, S = c.start.stbd, len = dist(P, S);
  const n = { x: -(S.y - P.y) / len, y: (S.x - P.x) / len };
  const hit = lineHit(c, bowGo, hdg);
  const D = hit && hit.u > -0.15 && hit.u < 1.15 ? hit.d : below / Math.max(0.3, dot(gd, n));
  const turn = Math.abs(n180(hdg - b.hdg)) / Math.max(12, b.cls.maxRot * 0.6);
  return { ttl: 0.45 * turn + timeToCover(D, b.spd, polarSpeed(b.cls, b.tws, Math.abs(n180(b.twd - hdg))), accelTau(b.tws)), hdg };
}

// ───────────────────────── scripts ─────────────────────────

/** Sit still: just above head to wind with the sail out, so she neither moves on nor drifts back. */
export const luffing = (tack: Tack = 'stbd'): PlanFn => (_t, b) => ({ hdg: onTack(b, tack, noGoAngle(b.tws) + 3), sheet: 0.05, intent: 'Holding' });

/** A starboard-tack boat (not us) close by on our right, where creeping right on port would take us. */
function stbdToRight(race: Race, b: Boat, withinL: number): boolean {
  const L = b.cls.loa;
  return race.boats.some(o => o !== b && !o.finished && o.tack === 'stbd' && hullGap(b, o) < withinL * L && dot(sub(o, b), race.course.right) > -0.5 * L);
}

/** A boat we must keep clear of that we'll hit within a few seconds if nothing changes. */
export function mustDuck(race: Race, b: Boat, horizon = 2.6): Boat | null {
  const L = b.cls.loa;
  for (const o of race.boats) {
    if (o === b || o.finished) continue;
    if (hullGap(b, o) > 4 * L || keepClear(b, o, race.t).keeper !== 0) continue;
    const ahead = dot(sub(o, b), dir(b.hdg));
    if (ahead < -0.3 * L) continue;
    if (closing(b, o, horizon) < 1.1 * L) return o;
  }
  return null;
}

/** Hold station at a point, the way skippers hover before the start: sail there, then luff to stop,
 *  creep forward with the sail eased, sit head to wind to drift back, and nip onto port to move right. */
export const hoverAt = (spot: V2): PlanFn => (_t, b, race) => {
  const c = race.course, L = b.cls.loa;
  const d = sub(spot, b);
  const ahead = dot(d, c.up) / L, side = dot(d, c.right) / L;
  const ng = noGoAngle(b.tws);
  const far = dhypot(ahead, side);
  if (far > 2.5) {
    // Sail to it, eased, on whichever tack points there.
    const brg = bearing(b, spot), twa = n180(b.twd - brg);
    if (Math.abs(twa) >= 48) return { hdg: brg, sheet: easedSheet(Math.abs(twa), 0.6), intent: 'Moving to my spot' };
    return { hdg: onTack(b, twa >= 0 ? 'stbd' : 'port', 50), sheet: easedSheet(50, 0.6), intent: 'Moving to my spot' };
  }
  if (side > 0.9 || (b.tack === 'port' && side > 0.25 && Math.abs(b.twa) < 90)) return { hdg: onTack(b, 'port', 55), sheet: easedSheet(55, 0.45), intent: 'Creeping right' };
  if (b.tack === 'port' && Math.abs(b.twa) < 90) return { hdg: onTack(b, 'stbd', ng + 6), sheet: 0.2, intent: 'Back onto starboard' };
  if (ahead < -0.35) return { hdg: onTack(b, 'stbd', 6), sheet: 0, intent: 'Drifting back' };
  if (ahead > 0.45 || side < -0.6) return { hdg: onTack(b, 'stbd', 52), sheet: easedSheet(52, 0.45), intent: 'Creeping up' };
  return { hdg: onTack(b, 'stbd', ng + 3), sheet: 0.05, intent: 'Holding' };
};

/** Wait on starboard for a start at a point on the line (`uTarget`, 0 at the pin, 1 at the starboard
 *  end): hold where your close-hauled course would cross the line. A luffing boat drifts back and so
 *  slides that point towards the pin, so set up to the right of it and let the drift bring it down. */
export const holdForLine = (uTarget: number, maxBelowL = 2.6, tack: Tack = 'stbd'): PlanFn => (_t, b, race) => {
  const c = race.course, L = b.cls.loa;
  const ng = noGoAngle(b.tws);
  const other: Tack = tack === 'stbd' ? 'port' : 'stbd';
  const ch = onTack(b, tack, vmgAngles(b.cls, b.tws).up + 1.5);
  const hit = lineHit(c, b, ch);
  const u = hit ? hit.u : 0;
  const below = -lineSide(c, b) / L;
  const T = race.gunT - race.t;
  if (b.tack === other && Math.abs(b.twa) < 90) return { hdg: onTack(b, tack, ng + 6), sheet: 0.2, intent: `Back onto ${tack === 'stbd' ? 'starboard' : 'port'}` };
  if (tack === 'stbd' && u < uTarget - 0.05 && T > 12 && !stbdToRight(race, b, 3.5)) return { hdg: onTack(b, 'port', 55), sheet: easedSheet(55, 0.45), intent: 'Creeping right' };
  // Too far back: creep up the line you'll start on (that keeps the crossing point where it is).
  if (below > maxBelowL) return { hdg: ch, sheet: easedSheet(45, 0.35), intent: 'Creeping up' };
  return { hdg: onTack(b, tack, ng + 3), sheet: 0.05, intent: 'Holding' };
};

/** Time-on-distance start: hold (or hover at a spot) until going now would cross `margin` seconds
 *  after the gun, then go close-hauled on `tack`, easing if early. After the start, `after` takes over. */
export const timedStart = (opts: { tack?: Tack; margin?: number; hover?: V2 | ((race: Race) => V2); before?: PlanFn; after?: PlanFn; duck?: boolean } = {}): PlanFn => {
  const tack = opts.tack ?? 'stbd', margin = opts.margin ?? 0.6;
  return (t, b, race, me) => {
    if (b.started) return (opts.after ?? closeHauled(tack))(t, b, race, me);
    const T = race.gunT - race.t;
    const go = timeToLine(race, b, tack);
    if (!me.memo.go && go.ttl >= T - margin) me.memo.go = 1;
    if (me.memo.go) {
      const early = T + margin - go.ttl;
      const up = vmgAngles(b.cls, b.tws).up + 1.5;
      // About to cross before the gun: stop dead.
      const toLine = -lineSide(race.course, bow(b));
      if (T > 0.05 && toLine < 1.5 * b.cls.loa && toLine < b.spd * T + 0.1 * b.cls.loa) return { hdg: b.twd, sheet: 0, intent: 'Stopping on the line' };
      if (early > 1.2) return { hdg: onTack(b, tack, up - 4), sheet: easedSheet(up, 0.4), intent: 'Burning time' };
      if (early > 0.5) return { hdg: go.hdg, sheet: easedSheet(up, 0.8), intent: 'Controlling speed' };
      // On the way in, keep clear of any boat with right of way: duck behind her (Rules 10 and 11).
      const ro = opts.duck ? mustDuck(race, b) : null;
      if (ro) {
        // Aim a length behind her stern.
        const astern = { x: ro.x - dir(ro.hdg).x * 1.25 * b.cls.loa, y: ro.y - dir(ro.hdg).y * 1.25 * b.cls.loa };
        return { hdg: bearing(b, astern), intent: `Ducking ${ro.sail}` };
      }
      return { hdg: early < -0.8 ? onTack(b, tack, up + 5) : go.hdg, intent: 'Going for the line' };
    }
    if (opts.before) return opts.before(t, b, race, me);
    if (opts.hover) { const s = typeof opts.hover === 'function' ? opts.hover(race) : opts.hover; return hoverAt(s)(t, b, race, me); }
    return luffing(tack)(t, b, race, me);
  };
};

/** Over early: dip back below the line (keeping clear, Rule 21) and start again. */
export const recallAndRestart = (after?: PlanFn): PlanFn => (t, b, race, me) => {
  if (b.started) return (after ?? closeHauled('stbd'))(t, b, race, me);
  const c = race.course, L = b.cls.loa;
  const away = { hdg: n360(b.twd + 180 + 25), sheet: 0.3, intent: 'Returning to start' };
  if (race.t < race.gunT) {
    // Before the gun: get back below the line if over, otherwise wait just below it.
    if (Math.max(lineSide(c, bow(b)), lineSide(c, b)) > -0.2 * L) return away;
    return luffing('stbd')(t, b, race, me);
  }
  if (b.ocs && !b.returning) return away;
  return { hdg: onTack(b, 'stbd', vmgAngles(b.cls, b.tws).up + 1.5), intent: 'Starting again' };
};

/** Sail close-hauled; tack (Rule 20.2) as soon as you're hailed for room to tack. */
export const answersHail = (tack: Tack, delay = 0.6): PlanFn => (t, b, race, me) => {
  const other: Tack = tack === 'stbd' ? 'port' : 'stbd';
  if (me.hailedBy && race.t - me.hailedBy.t >= delay) return { ...closeHauled(other)(t, b, race, me), intent: `Tacking: room to tack for ${me.hailedBy.from.sail}` };
  return closeHauled(tack)(t, b, race, me);
};

/** Pinned at the bank: hail for room to tack when it gets close, tack once she has (or told us to). */
export const hailsRoomToTack = (tack: Tack, atL = 2.6): PlanFn => (t, b, race, me) => {
  const other: Tack = tack === 'stbd' ? 'port' : 'stbd';
  if (!me.memo.hailedAt && bankAhead(b, race.course) < atL * b.cls.loa) { me.memo.hailedAt = race.t; return { ...closeHauled(tack)(t, b, race, me), roomToTack: true }; }
  if (me.memo.hailedAt) {
    const w = race.boats.find(o => o !== b && o.lastHtwT > (me.memo.hailedAt as number));
    if (w || me.toldToTack || me.memo.tacked) { me.memo.tacked = 1; return { ...closeHauled(other)(t, b, race, me), intent: 'Tacking away from the bank' }; }
    return { hdg: onTack(b, tack, vmgAngles(b.cls, b.tws).up - 4), sheet: easedSheet(40, 0.6), intent: 'Waiting for room to tack' };
  }
  return closeHauled(tack)(t, b, race, me);
};

/** Keep turning the same way until the One-Turn Penalty is done, then carry on with `after`. */
export const penaltyTurn = (after: PlanFn, startAt = 0, dirn: 1 | -1 = 1): PlanFn => (t, b, race, me) => {
  if (t < startAt || b.penalty.owed === 0) return after(t, b, race, me);
  return { hdg: n360(b.hdg + dirn * 70), sheet: 0.5, intent: 'Taking a One-Turn Penalty' };
};

/** Hail a protest the way Appendix E sets it: own sail number, "protest", the other boat's number. */
export const protestHail = (me: Boat, other: Boat) => `${spellSail(me.sail)} protest ${spellSail(other.sail)}`;

/** Bear away round another boat's stern if she'd otherwise hit us within `horizon` seconds. */
export function closing(b: Boat, o: Boat, horizon = 3): number {
  const rv = sub(o, b), bv = dir(b.hdg), ov = dir(o.hdg);
  const rel = { x: ov.x * o.spd - bv.x * b.spd, y: ov.y * o.spd - bv.y * b.spd };
  const vv = rel.x * rel.x + rel.y * rel.y;
  const tc = vv > 1e-9 ? Math.max(0, Math.min(horizon, -(rv.x * rel.x + rv.y * rel.y) / vv)) : 0;
  return dhypot(rv.x + rel.x * tc, rv.y + rel.y * tc);
}

export const gapTo = (race: Race, b: Boat, role: string) => hullGap(b, race.boats.find(o => o.name === role)!);
export const byRole = (race: Race, role: string) => race.boats.find(o => o.name === role)!;
export const bearingTo = (b: Boat, p: V2) => bearing(b, p);

/** Step with an intent, for scripts that build their own. */
export const step = (hdg: number, intent: string, extra: Partial<Step> = {}): Step => ({ hdg, intent, ...extra });

/** A goal that just asks you to sail for a while without breaking a rule. */
export function cleanFor(text: string, seconds: number, win: Outcome, extra?: (g: GoalCtx) => Outcome | null): Goal {
  return {
    text, seconds,
    check: g => fouled(g) ?? rule14(g) ?? extra?.(g) ?? null,
    final: () => win,
    progress: g => `${Math.max(0, Math.ceil(seconds - g.t))} s to go`,
  };
}

export type { Outcome, Goal, GoalCtx, SceneDef, PlanFn };
