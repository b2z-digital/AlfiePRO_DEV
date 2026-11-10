// Scenes: a race set up at one moment, for drills, rules lessons and the scenario lab.
// Boats are placed in hull lengths around a mark or the start line (the wind blows from the top,
// 0°), each sailed by the player, an AI skipper or a short script, and a goal decides pass or fail.
// Scenes run on the same engine and referee as a race, so what you learn is what happens in a race.
import { Race, windwardBoat } from './engine';
import { AiHost, Helm, LEVELS, PERSONAS, Skipper } from './ai';
import { bestSheet, polarSpeed, vmgAngles } from './classes';
import { initialProgress } from './course';
import { Rng, bearing, clamp, dir, dot, n180, n360, sub } from './math';
import { Referee, spellSail } from './referee';
import type { Boat, Incident, RaceSettings, SkipperLevel } from './types';

/** What a script wants this instant. */
export interface Step {
  hdg: number;
  sheet?: number;
  /** This change of course is to avoid another boat (for the referee's "forced" test). */
  avoid?: boolean;
  /** Say this once. */
  hail?: string;
  /** Hail the boat to windward for room to tack (once). */
  roomToTack?: boolean;
  /** Reply "You tack" to a room-to-tack hail (once). */
  youTack?: boolean;
  intent?: string;
  /** Hand the boat to an AI skipper from now on (the heading is ignored). */
  ai?: { level?: SkipperLevel; persona?: string; gate?: 0 | 1 };
}
export type PlanFn = (t: number, b: Boat, race: Race, me: ScriptedHelm) => Step;

/** Sails a boat by script. Scripts can read the whole race, so they can react (duck, tack when hailed). */
export class ScriptedHelm implements Helm {
  intent = '';
  lastAvoid = { t: -99, hdg: 0, tag: '' };
  gate: 0 | 1 | null = null;
  /** A boat hailed us for room to tack. */
  hailedBy: { from: Boat; t: number } | null = null;
  /** The boat we hailed replied "You tack". */
  toldToTack: { from: Boat; t: number } | null = null;
  /** Free memory for the script. */
  memo: Record<string, number> = {};
  private said = new Set<string>();
  /** After a hand-over, the AI skipper sailing her. */
  private sk: Skipper | null = null;
  private skLeg = -1;

  constructor(public b: Boat, private plan: PlanFn, private race: Race, private t0: number, private level: SkipperLevel = 'state') {}

  decide() { /* scripted: everything happens in helm() */ }

  onHail(h: AiHost, from: Boat, kind: 'room-to-tack' | 'you-tack') {
    if (kind === 'room-to-tack') this.hailedBy = { from, t: h.t };
    else this.toldToTack = { from, t: h.t };
    this.sk?.onHail(h, from, kind);
  }

  helm(h: AiHost, dt: number) {
    const b = this.b;
    if (b.finished || b.retired || b.disabled) return;
    if (this.sk) { this.sail(h, dt); return; }
    const st = this.plan(h.t - this.t0, b, this.race, this);
    if (st.ai) {
      const idx = this.race.boats.indexOf(b);
      const persona = { ...(PERSONAS.find(p => p.key === st.ai!.persona) ?? PERSONAS[2]) };
      b.persona = b.persona ?? persona;
      this.sk = new Skipper(b, LEVELS[st.ai.level ?? this.level], persona, new Rng(this.race.settings.seed * 7 + idx * 53), idx);
      this.sk.gate = st.ai.gate ?? null;
      this.skLeg = b.legIndex;
      this.sail(h, dt);
      return;
    }
    const err = n180(st.hdg - b.hdg);
    b.rudder = clamp(err / 15 - b.rot / 200, -1, 1);
    b.sheet = st.sheet ?? bestSheet(Math.abs(b.twa));
    if (st.avoid) this.lastAvoid = { t: h.t, hdg: st.hdg, tag: 'script' };
    if (st.intent) this.intent = st.intent;
    if (st.hail && !this.said.has(st.hail)) { this.said.add(st.hail); this.race.hail(b, st.hail); }
    if (st.roomToTack && !this.said.has('#r2t')) {
      const w = windwardBoat(this.race, b, 2.5 * b.cls.loa);
      if (w) { this.said.add('#r2t'); this.race.hailRoomToTack(b, w); }
    }
    if (st.youTack && !this.said.has('#youtack')) { if (this.race.replyYouTack(b)) this.said.add('#youtack'); }
  }

  private sail(h: AiHost, dt: number) {
    const sk = this.sk!, b = this.b;
    if (b.legIndex !== this.skLeg) { this.skLeg = b.legIndex; sk.gate = null; }
    if ((this.race.step_ + this.race.boats.indexOf(b)) % 2 === 0) sk.decide(h);
    sk.helm(h, dt);
    this.intent = sk.intent;
    this.lastAvoid = sk.lastAvoid;
  }
}

/** The nearest boat on the same tack to windward of b, within `within` metres (hull gap). */
export { windwardBoat };

/** Where positions are measured from: a mark, the middle of the start line, or one of its ends. */
export type Origin = 'W' | 'F' | 'GP' | 'GS' | 'pin' | 'stbd' | 'line';

export interface SceneBoat {
  /** Name used in the lesson's words ("Blue", "Orange"). */
  role: string;
  sail?: string;
  color?: string;
  /** Hull lengths from the origin: x to the right looking upwind, y upwind. */
  at: [number, number];
  /** Compass heading; the wind blows from 0°. */
  hdg: number;
  /** Speed as a share of target speed on that heading (default 0.95). */
  spd?: number;
  /** Which leg she's on (default 0, the first beat). */
  leg?: number;
  helm: 'player' | 'ai' | PlanFn;
  level?: SkipperLevel;
  persona?: string;
  /** Penalty turns she owes at the start of the scene. */
  owes?: number;
  /** She'll forget to take a penalty until protested. */
  forgets?: boolean;
  /** Out of control and drifting (Rule 22). */
  disabled?: boolean;
  /** For an AI boat on the run: the gate mark she goes for (0 = 2p, the right-hand one looking upwind). */
  gate?: 0 | 1;
}

/** Teaching marks drawn on the water: a target ring, or a line between two points. */
export type SceneOverlay =
  | { kind: 'ring'; at: [number, number]; r: number; label?: string; tone?: 'blue' | 'orange' | 'green' }
  | { kind: 'segment'; from: [number, number]; to: [number, number]; label?: string; tone?: 'blue' | 'orange' | 'green' };

export type WorldOverlay =
  | { kind: 'ring'; x: number; y: number; r: number; label?: string; tone: 'blue' | 'orange' | 'green' }
  | { kind: 'segment'; x1: number; y1: number; x2: number; y2: number; label?: string; tone: 'blue' | 'orange' | 'green' };

export interface SceneDef {
  origin: Origin;
  boats: SceneBoat[];
  settings?: Partial<RaceSettings>;
  /** Start the scene this many seconds before the gun (drills); omit for a scene already racing. */
  preStart?: number;
  overlays?: SceneOverlay[];
}

export interface Built { race: Race; t0: number; ids: Record<string, string>; overlays: WorldOverlay[]; origin: { x: number; y: number } }

const SCENE_COLORS = ['#2A93FF', '#FB923C', '#34D399', '#F472B6', '#A78BFA', '#FBBF24', '#94A3B8', '#2DD4BF'];

/** Build the race for a scene. `playerPlan` sails the player's boat for "watch it done right" and for tests. */
export function buildScene(def: SceneDef, seed: number, playerPlan?: PlanFn | 'ai'): Built {
  const boats = [...def.boats].sort((a, b) => (a.helm === 'player' ? -1 : b.helm === 'player' ? 1 : 0));
  const hasPlayer = boats[0]?.helm === 'player';
  const settings: RaceSettings = {
    classId: 'IOM', fleetSize: boats.length, level: 'state', windStrength: 'medium', windCharacter: 'steady',
    laps: 1, length: 'medium', sequenceSeconds: def.preStart ?? 0.1, coach: 'full', autoTrim: true, seed,
    flatWind: def.preStart === undefined, noPlayer: !hasPlayer, lineBias: 0,
    ...def.settings,
  };
  settings.fleetSize = boats.length;
  settings.sequenceSeconds = def.preStart ?? 0.1;
  const race = new Race(settings);
  // The engine always makes at least two boats: drop any the scene doesn't use.
  if (race.boats.length > boats.length) { race.boats.length = boats.length; race.skippers.length = boats.length; race.hist.length = boats.length; }
  const c = race.course, L = c.L;
  // Already racing: let the gun go with everyone still well below the line.
  if (def.preStart === undefined) while (race.t < race.gunT + 0.1) race.step();
  const t0 = race.t;
  const o = def.origin === 'line' ? { x: (c.start.pin.x + c.start.stbd.x) / 2, y: (c.start.pin.y + c.start.stbd.y) / 2 }
    : def.origin === 'pin' ? c.start.pin : def.origin === 'stbd' ? c.start.stbd : c.byId[def.origin].p;
  const at = (p: [number, number]) => ({ x: o.x + c.right.x * p[0] * L + c.up.x * p[1] * L, y: o.y + c.right.y * p[0] * L + c.up.y * p[1] * L });
  const ids: Record<string, string> = {};
  const used = new Set<string>();
  boats.forEach((sb, i) => {
    const b = race.boats[i];
    const { x, y } = at(sb.at);
    const w = race.wind.sample(x, y, race.t);
    const twa = n180(w.twd - sb.hdg);
    Object.assign(b, {
      x, y, hdg: n360(sb.hdg), rot: 0, rudder: 0, twd: w.twd, tws: w.tws, twa,
      tack: twa >= 0 ? 'stbd' : 'port', tackingSince: null, lastHtwT: -99, lastTackFrom: null, lastGybeT: -99,
      started: def.preStart === undefined, ocs: false, returning: false, finished: false, retired: false, dsq: false,
      shadow: 0, contactWith: {}, roundedAt: [], placeAtLeg: [], hail: null, disabled: !!sb.disabled,
    });
    b.spd = sb.disabled ? 0 : (sb.spd ?? 0.95) * polarSpeed(b.cls, w.tws, Math.abs(twa));
    b.sheet = sb.disabled ? 0 : bestSheet(Math.abs(twa));
    b.penalty = { owed: sb.owes ?? 0, active: false, rot: 0, passedHtw: false, passedDdw: false, taken: 0 };
    b.color = sb.color ?? SCENE_COLORS[i % SCENE_COLORS.length];
    if (sb.sail) b.sail = sb.sail;
    while (used.has(b.sail)) b.sail = String((Number(b.sail) + 7) % 98 + 2).padStart(2, '0');
    used.add(b.sail);
    if (!b.isPlayer) b.name = sb.role;
    ids[sb.role] = b.id;
    b.legIndex = sb.leg ?? 0;
    const leg = c.legs[b.legIndex];
    if (leg?.kind === 'mark') { const m = c.byId[leg.rounding.markId].p; b.progress = initialProgress(leg.rounding, m, b); b.lastBearing = bearing(m, b); }
    if (leg?.kind === 'gate') {
      const m0 = c.byId[leg.options[0].markId].p, m1 = c.byId[leg.options[1].markId].p;
      b.progress = initialProgress(leg.options[0], m0, b); b.lastBearing = bearing(m0, b);
      b.progress2 = initialProgress(leg.options[1], m1, b); b.lastBearing2 = bearing(m1, b);
    }
    race.hist[i] = { x: [], y: [], hdg: [], spd: [], rot: [] };
    if (sb.forgets) race.forgot.add(b.id); else race.forgot.delete(b.id);
    // Helm.
    const helm = b.isPlayer ? playerPlan : sb.helm;
    if (sb.disabled || helm === 'player' || helm === undefined) { race.skippers[i] = null; return; }
    if (helm === 'ai') {
      const persona = { ...(PERSONAS.find(p => p.key === sb.persona) ?? PERSONAS[2]) };
      b.persona = persona;
      const sk = new Skipper(b, LEVELS[sb.level ?? settings.level], persona, new Rng(seed * 13 + i * 101), i);
      if (sb.gate !== undefined) sk.gate = sb.gate;
      race.skippers[i] = sk;
    } else {
      race.skippers[i] = new ScriptedHelm(b, helm, race, t0, sb.level ?? settings.level);
    }
    if (b.isPlayer) race.autopilot = true;
  });
  // A fresh referee, so nothing from the set-up steps carries over.
  race.referee = new Referee(race);
  race.referee.prime();
  race.events.length = 0;
  race.incidents.length = 0;
  race.track.length = 0;
  // Appendix E2.3: a boat that loses radio control hails "(sail number) out of control".
  for (const b of race.boats) if (b.disabled) race.hail(b, `${spellSail(b.sail)} out of control`);
  const overlays: WorldOverlay[] = (def.overlays ?? []).map(ov => {
    if (ov.kind === 'ring') { const p = at(ov.at); return { kind: 'ring', x: p.x, y: p.y, r: ov.r * L, label: ov.label, tone: ov.tone ?? 'blue' }; }
    const a = at(ov.from), b2 = at(ov.to);
    return { kind: 'segment', x1: a.x, y1: a.y, x2: b2.x, y2: b2.y, label: ov.label, tone: ov.tone ?? 'blue' };
  });
  return { race, t0, ids, overlays, origin: o };
}

// ───────────────────────── goals ─────────────────────────

export interface Outcome {
  pass: boolean;
  title: string;
  text: string;
  /** 1 to 3 for drills. */
  stars?: number;
  /** A number to keep as a personal best (smaller is better unless the drill says otherwise). */
  score?: number;
  /** The incident that ended it, to explain. */
  incident?: Incident;
}

export interface GoalCtx {
  race: Race;
  /** Seconds since the scene began. */
  t: number;
  player: Boat;
  /** Incidents where the player broke a rule (not OCS), and where another boat broke one against her. */
  mine: Incident[];
  against: Incident[];
  /** Scratch space for a goal to remember things. */
  memo: Record<string, number | boolean | string>;
}

export interface Goal {
  /** What to do, shown on screen. */
  text: string;
  /** Time limit in seconds. */
  seconds: number;
  /** Checked every step: return an outcome to end the scene early. */
  check?: (g: GoalCtx) => Outcome | null;
  /** At the time limit. */
  final: (g: GoalCtx) => Outcome;
  /** A short live progress line ("In the ring: 12 s of 20"). */
  progress?: (g: GoalCtx) => string | null;
}

export function goalCtx(race: Race, t0: number, memo: GoalCtx['memo']): GoalCtx {
  const p = race.player!;
  return {
    race, t: race.t - t0, player: p, memo,
    mine: race.incidents.filter(i => i.offender === p.id && i.kind !== 'ocs'),
    against: race.incidents.filter(i => i.victim === p.id),
  };
}

/** Run a scene headless until the goal decides (tests, and checking that content works). */
export function runScene(def: SceneDef, goal: Goal, seed: number, playerPlan?: PlanFn | 'ai'): { outcome: Outcome; race: Race; t: number } {
  const { race, t0 } = buildScene(def, seed, playerPlan);
  const memo: GoalCtx['memo'] = {};
  for (;;) {
    race.step();
    const g = goalCtx(race, t0, memo);
    const early = goal.check?.(g);
    if (early) return { outcome: early, race, t: g.t };
    if (g.t >= goal.seconds || race.ended) return { outcome: goal.final(g), race, t: g.t };
  }
}

// ───────────────────────── script helpers ─────────────────────────

/** Heading for a true wind angle on a tack. */
export const onTack = (b: Boat, tack: 'port' | 'stbd', twa: number) => n360(tack === 'stbd' ? b.twd - twa : b.twd + twa);

/** Hold a compass heading. */
export const hold = (hdg: number, sheet?: number): PlanFn => () => ({ hdg, sheet });

/** Sail close-hauled on a tack, following the wind. `extra` sails that much lower (+) or higher (−). */
export const closeHauled = (tack: 'port' | 'stbd', extra = 0): PlanFn => (_t, b) => ({ hdg: onTack(b, tack, vmgAngles(b.cls, b.tws).up + 1.5 + extra) });

/** Sail a fixed true wind angle on a tack. */
export const atAngle = (tack: 'port' | 'stbd', twa: number, sheet?: number): PlanFn => (_t, b) => ({ hdg: onTack(b, tack, twa), sheet });

/** Run at the best downwind angle on a gybe. */
export const running = (tack: 'port' | 'stbd'): PlanFn => (_t, b) => ({ hdg: onTack(b, tack, vmgAngles(b.cls, b.tws).down) });

/** Head to wind with the sail out: stop and stay put. */
export const stopped = (): PlanFn => (_t, b) => ({ hdg: b.twd, sheet: 0 });

/** One plan until time t, another after it. */
export const until = (t: number, a: PlanFn, b: PlanFn): PlanFn => (tt, bb, r, me) => (tt < t ? a : b)(tt, bb, r, me);

let planSeq = 0;

/** One plan until a condition first holds, then another for good. */
export const when = (cond: (t: number, b: Boat, race: Race) => boolean, a: PlanFn, b: PlanFn): PlanFn => {
  const key = `when${++planSeq}`;
  return (tt, bb, r, me) => {
    if (!me.memo[key] && cond(tt, bb, r)) me.memo[key] = 1;
    return (me.memo[key] ? b : a)(tt, bb, r, me);
  };
};

/** Steer straight at a point. */
export const toward = (p: { x: number; y: number }, sheet?: number): PlanFn => (_t, b) => ({ hdg: bearing(b, p), sheet });

/** Steer to pass `gapL` lengths astern of another boat (ducking), then carry on with `after`. */
export const duck = (id: string, after: PlanFn, gapL = 1.1): PlanFn => {
  const key = `duck${++planSeq}`;
  return (t, b, race, me) => {
    const o = race.boatById(id);
    const rel = sub(o, b);
    // Once she's clearly past our bow (behind our beam), carry on.
    if (me.memo[key] || dot(rel, dir(b.hdg)) < -0.2 * b.cls.loa) { me.memo[key] = 1; return after(t, b, race, me); }
    const back = dir(o.hdg + 180);
    const aim = { x: o.x + back.x * gapL * b.cls.loa, y: o.y + back.y * gapL * b.cls.loa };
    return { hdg: bearing(b, aim), avoid: true, intent: `Ducking ${o.sail}` };
  };
};

/** Tack (once) when a test first holds, then sail close-hauled on the new tack. */
export const tackWhen = (from: 'port' | 'stbd', cond: (t: number, b: Boat, race: Race) => boolean): PlanFn =>
  when(cond, closeHauled(from), closeHauled(from === 'port' ? 'stbd' : 'port'));
