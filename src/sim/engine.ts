// The race engine: a fixed 20 Hz step that owns the world. No React in here.
// step(): wind → each boat's local wind → AI decisions → helm/player input → physics →
// collisions → start/rounding/finish progress → referee → recording.

import { AiHost, Helm, LEVELS, PERSONAS, Perceived, Skipper, sharpStarter } from './ai';
import { CLASSES, bestSheet, overpowerEase, rigPower, runPower, vmgAngles } from './classes';
import { Clearing, sailClear, startClearing } from './clear';
import { Course, buildCourse, fromCourse, initialProgress, toCourse } from './course';
import { KN, Rng, V2, bearing, dir, dist, n180, n360, segIntersect } from './math';
import { DT, bank, bankAhead, bow, collide, hullGap, integrate, lineSide, localWind, markContacts, settleHeel, stern } from './physics';
import { Referee, isRacing, keepClear, spellSail } from './referee';
import type { Boat, Incident, PlayerInput, RaceSettings, SimEvent } from './types';
import { WindField } from './wind';
import { Sea, makeSea } from './sea';
import { VenueScene, frameAt, shoreFor, siteFor, venueScene, venueWindFor } from './venue';
import { VENUES } from './venues';
import { dcos, dhypot, dsin } from './dmath';

export const BOAT_COLORS = ['#2A93FF', '#F472B6', '#2DD4BF', '#94A3B8', '#A78BFA', '#34D399', '#FBBF24', '#FB923C', '#F87171', '#60A5FA', '#E879F9', '#4ADE80', '#FCD34D', '#38BDF8', '#C084FC', '#FDA4AF'];

const HIST = 220; // 11 s of history per boat at 20 Hz

/**
 * Everything the player did, step by step. With the race's settings (and so its seed) it sails the
 * race again exactly: the wind, every AI skipper and the referee do the same things again, because
 * they only ever react to what happens on the water. Replays and "sail it from here" use it.
 */
export interface RaceLog {
  /** The player's input when it changed: [step it applies from, rudder, sheet, 0 (no longer used)]. */
  input: [number, number, number, number][];
  /** Tacks, gybes and hails: [step they were made before, what]. */
  acts: [number, PlayerAct][];
  /** The settings it was sailed with, when the log travels on its own (a challenge ghost). */
  settings?: RaceSettings;
}
export type PlayerAct = 'tack' | 'gybe' | 'hail';

/**
 * A person's boat in a live race. Everyone's device sails the whole race; each person's inputs and
 * actions travel to the others stamped with the step they apply from, so every device applies them
 * at the same moment and the races stay identical, boat for boat. A device can only take a step
 * once everyone still racing has sent their inputs for it.
 */
export interface CrewSeat {
  /** Her boat's index in the fleet. */
  boat: number;
  /** Everything they have done, step by step, as it arrives (the same shape as a player's log). */
  log: RaceLog;
  /** Their inputs are known for every step before this one. */
  upTo: number;
  /** From this step an AI skipper sails her (they left the race); Infinity while they're racing. */
  aiFrom: number;
  /** The input in force, and the helm assist through a tack or gybe they asked for. */
  input: PlayerInput;
  assist: { target: number; until: number } | null;
  /** How far through their log the race has got. */
  fi: number;
  fa: number;
}

/** What a hail by the player turned out to be, for the screen to say and show. */
export interface HailResult {
  kind: 'you-tack' | 'protest' | 'room-to-tack' | 'say' | 'none';
  /** What she called out. */
  text?: string;
  /** A note for the screen. */
  note?: string;
  noteTone?: 'good' | 'warn';
}

/** The boat on the same tack close to windward of b (the one a room-to-tack hail goes to). */
export function windwardBoat(race: { boats: Boat[] }, b: Boat, within: number): Boat | null {
  const right = { x: dcos((b.hdg * Math.PI) / 180), y: -dsin((b.hdg * Math.PI) / 180) };
  const side = b.tack === 'stbd' ? 1 : -1;
  let best: Boat | null = null, bg = within;
  for (const o of race.boats) {
    if (o === b || o.finished || o.retired || o.disabled || o.tack !== b.tack) continue;
    if (((o.x - b.x) * right.x + (o.y - b.y) * right.y) * side <= 0) continue;
    const g = hullGap(b, o);
    if (g < bg) { bg = g; best = o; }
  }
  return best;
}

export interface ResultRow {
  boat: Boat;
  place: number;
  time: number | null;
  status: 'finished' | 'dsq' | 'ocs' | 'dnf' | 'racing';
  note?: string;
}

export class Race implements AiHost {
  settings: RaceSettings;
  rng: Rng;
  course: Course;
  wind: WindField;
  /** Waves, or null for flat water. */
  sea: Sea | null;
  /** The real venue the race is at (its water, bank and control area in the race frame), or null on the practice pond. */
  venue: VenueScene | null = null;
  boats: Boat[] = [];
  skippers: (Helm | null)[] = [];
  referee: Referee;
  t = 0;
  gunT: number;
  step_ = 0;
  /** While a frame is being drawn part-way through a step: how far behind the last step it is, s. */
  renderLag = 0;
  events: SimEvent[] = [];
  incidents: Incident[] = [];
  hist: { x: number[]; y: number[]; hdg: number[]; spd: number[]; rot: number[]; heel: number[] }[] = [];
  /** Recorded at 5 Hz for the debrief: per frame, [x, y, hdg, spd, leg] per boat. */
  track: { t: number; d: Float32Array; twd: number }[] = [];
  forgot = new Set<string>();
  input: PlayerInput = { rudder: 0, sheet: 1, autoTrim: true };
  playerIndex = -1;
  finishedAt: number | null = null;
  ended = false;
  /** When true and a skipper is set for the player's boat, that skipper helms her (demos and tests). */
  autopilot = false;
  /** What the player has done so far: see RaceLog. */
  log: RaceLog = { input: [], acts: [] };
  /** Sailing a recorded race again: the log being followed and how far through it we are. */
  private following: { log: RaceLog; i: number; a: number; until: number; cur: RaceLog['input'][number] | null } | null = null;
  private passed: ('tack' | 'gybe' | null)[] = [];
  /** Boats that have finished: where each is sailing clear to and waiting (by boat index). */
  readonly clearing: (Clearing | null)[] = [];
  private lastSignal = Infinity;
  private helmAssist: { target: number; until: number } | null = null;
  /** A live race: the people racing, one seat each (see CrewSeat). Empty for a race on your own. */
  crew: CrewSeat[] = [];
  /** Is this a live race between people on their own devices? */
  get live(): boolean { return this.crew.length > 0; }

  constructor(settings: RaceSettings) {
    this.settings = settings;
    this.rng = new Rng(settings.seed);
    const cls = CLASSES[settings.classId];
    // At a venue the race frame turns with the wind (the course axis stays 0) and the real
    // direction is kept as course.rot; on the practice pond windFrom is the axis itself.
    const def = settings.venue ? VENUES[settings.venue] : undefined;
    const axis = def ? 0 : settings.windFrom ?? 0;
    const rb = this.rng.range(-3.5, 3.5);
    const bias = settings.lineBias ?? rb;
    const courseOf = (length: RaceSettings['length']) => buildCourse(axis, cls.loa, { laps: settings.laps, length, fleetSize: settings.fleetSize, lineBias: bias });
    let c = courseOf(settings.length);
    let sideBias = 0;
    if (def) {
      const rot = n360(settings.windFrom ?? def.usualWind);
      // The skippers stand on the bank nearest the spot picked on the map, or at the club's own
      // control area, and the course is laid in front of them (a shorter one if that's what fits).
      const spot = settings.venueSpot ? { x: settings.venueSpot[0], y: settings.venueSpot[1] } : null;
      const lengths: RaceSettings['length'][] = settings.length === 'long' ? ['long', 'medium', 'short'] : settings.length === 'medium' ? ['medium', 'short'] : ['short'];
      const laid = siteFor(def, rot, spot, lengths.map(len => (len === settings.length ? c : courseOf(len))));
      const S = laid?.S ?? null, control = laid?.control ?? def.control;
      if (laid) c = laid.course;
      if (S) {
        this.venue = venueScene(def, frameAt(rot, S), control);
        c.rot = rot;
        c.shore = shoreFor(this.venue, c);
        // What the club knows about this wind: more breeze along the skippers' bank, or out away from it.
        const pays = venueWindFor(def, rot)?.pays;
        const bankX = (this.venue.control[0].x + this.venue.control[1].x) / 2;
        if (pays && Math.abs(bankX) > 0.25 * c.bounds.across) sideBias = (bankX > 0 ? 1 : -1) * (pays === 'bank' ? 1 : -1);
      }
    }
    this.course = c;
    const mid = (c.bounds.alongMin + c.bounds.alongMax) / 2;
    this.wind = new WindField(
      { strength: settings.windStrength, character: settings.windCharacter, direction: axis, knots: settings.windKnots, flat: settings.flatWind, shifts: settings.windShifts, sideBias },
      settings.seed,
      { cx: c.origin.x + c.up.x * mid, cy: c.origin.y + c.up.y * mid, halfAlong: (c.bounds.alongMax - c.bounds.alongMin) / 2, halfAcross: c.bounds.across },
    );
    this.sea = makeSea(settings.seaState, axis, settings.seed, this.wind.baseTws / KN);
    this.gunT = settings.sequenceSeconds;
    this.referee = new Referee(this);
    this.makeFleet();
  }

  private makeFleet() {
    const s = this.settings, c = this.course;
    const cls = CLASSES[s.classId];
    const L = cls.loa;
    const n = Math.max(2, Math.min(16, s.fleetSize));
    const personas = [...PERSONAS];
    for (let i = personas.length - 1; i > 0; i--) { const j = this.rng.int(0, i); [personas[i], personas[j]] = [personas[j], personas[i]]; }
    // Numbers are drawn as if the player were 01, so the rest of the race (positions, personas)
    // comes out the same whatever her real number: everyone in a challenge sails the same race.
    // Then she gets her own, and an AI boat that drew it takes 01, which no AI boat ever draws.
    const mySail = s.player?.sail && /^\d{1,4}$/.test(s.player.sail) ? s.player.sail : '01';
    // A live race: the crew take the first boats, in seat order, with their own numbers (two people
    // with the same number: the later one gets the next free one). The AI boats keep clear of them.
    const crew = s.crew && s.crew.length ? s.crew.slice(0, n) : null;
    const crewSails: string[] = [];
    if (crew) {
      const taken = new Set<string>();
      crew.forEach((m, k) => {
        let sail = /^\d{1,4}$/.test(m.sail) ? m.sail : String(k + 1).padStart(2, '0');
        let num = Number(sail);
        while (taken.has(sail)) { num = (num + 1) % 10000; sail = String(num).padStart(2, '0'); }
        taken.add(sail);
        crewSails.push(sail);
      });
    }
    const numbers = new Set<string>(crewSails);
    for (let i = 0; i < n; i++) {
      const isCrew = !!crew && i < crew.length;
      const isPlayer = crew ? isCrew && i === (s.seat ?? 0) : !s.noPlayer && i === 0;
      let sail: string;
      if (isCrew) sail = crewSails[i];
      else {
        sail = isPlayer ? '01' : String(this.rng.int(2, 98)).padStart(2, '0');
        while (numbers.has(sail)) sail = String(this.rng.int(2, 98)).padStart(2, '0');
      }
      numbers.add(sail);
      if (!crew) {
        if (isPlayer) sail = mySail;
        else if (!s.noPlayer && sail === mySail) sail = '01';
      }
      // Start sailing round below the line like a fleet does: half reaching towards the pin on
      // starboard in a nearer lane, half back on port in a farther one, spread along the line.
      const frac = (i + 0.5) / n;
      const near = i % 2 === 0;
      const along = -(near ? 3.5 + this.rng.range(0, 2.5) : 6.5 + this.rng.range(0, 2.5)) * L;
      const across = (frac - 0.5) * 2 * (c.bounds.across * 0.45);
      const p = { x: c.origin.x + c.up.x * along + c.right.x * across, y: c.origin.y + c.up.y * along + c.right.y * across };
      const hdg = n360(c.axis + (near ? -95 : 95) + this.rng.range(-8, 8));
      const persona = isPlayer || isCrew ? undefined : { ...personas[i % personas.length] };
      if (persona && i >= personas.length) persona.startEnd = Math.max(0.05, Math.min(0.95, persona.startEnd + this.rng.range(-0.15, 0.15)));
      const b: Boat = {
        id: `b${i}`, sail, name: isCrew ? crew![i].name : isPlayer ? s.player?.name || 'You' : persona!.name, color: BOAT_COLORS[i % BOAT_COLORS.length], isPlayer, human: isPlayer || isCrew, cls, persona,
        x: p.x, y: p.y, hdg, spd: 0.3 * cls.hullSpeed, rot: 0, rudder: 0, sheet: 0.6, heel: 0, heelRate: 0, luffUp: 0, rigPower: rigPower(cls.id, this.wind.baseTws / KN), sheetFelt: 0.6, runPower: runPower(this.wind.baseTws / KN), dive: 0, pitch: 0,
        twd: c.axis, tws: this.wind.baseTws, twa: n180(c.axis - hdg), tack: n180(c.axis - hdg) >= 0 ? 'stbd' : 'port', targetSpd: 0, shadow: 0,
        tackingSince: null, lastHtwT: -99, lastTackFrom: null, lastGybeT: -99,
        started: false, ocs: false, returning: false, legIndex: 0, progress: 0, progress2: 0, lastBearing: 0, lastBearing2: 0,
        finished: false, finishTime: 0, dsq: false, retired: false,
        penalty: { owed: 0, active: false, rot: 0, passedHtw: false, passedDdw: false, taken: 0 },
        contactWith: {}, roundedAt: [], placeAtLeg: [], distSailed: 0, hail: null,
      };
      settleHeel(b);
      this.boats.push(b);
      this.hist.push({ x: [], y: [], hdg: [], spd: [], rot: [], heel: [] });
      if (isCrew) {
        if (isPlayer) this.playerIndex = i;
        this.skippers.push(null);
        this.crew.push({ boat: i, log: { input: [], acts: [] }, upTo: 0, aiFrom: Infinity, input: { rudder: 0, sheet: 1, autoTrim: crew![i].autoTrim ?? s.autoTrim }, assist: null, fi: 0, fa: 0 });
      } else if (isPlayer) { this.playerIndex = i; this.skippers.push(null); }
      else {
        // (Every fourth skipper of a club fleet is one of its sharp starters.)
        const lv = i % 4 === 1 ? sharpStarter(LEVELS[s.level]) : LEVELS[s.level];
        persona!.startSense = lv.startSense;
        const sk = new Skipper(b, lv, persona!, new Rng(s.seed * 31 + i * 977), i);
        if (s.forgetfulSkippers && this.rng.chance(lv.forget * 2)) this.forgot.add(b.id);
        this.skippers.push(sk);
      }
    }
    this.fairStarts();
    if (this.live) this.log = this.crew[Math.max(0, this.crew.findIndex(c => c.boat === this.playerIndex))].log;
  }

  /**
   * Everyone at a helm gets a fair place to start from: below the middle of the line, on starboard,
   * with either end in reach, however the rest of the fleet is spread. (Laid out along the whole
   * width of the course, a boat could begin well outside one end of the line and never get back
   * across for the end she wanted.) The first helm is a little towards the starboard end, the
   * others either side of her, three lengths apart. Each takes the place of the boat lying nearest
   * her spot, and that boat's place goes back to the fleet. Worked out from the settings alone, so
   * a live race is laid out the same on every device.
   */
  private fairStarts() {
    const helms = this.boats.filter(b => b.human);
    if (!helms.length) return;
    const c = this.course, L = helms[0].cls.loa;
    const half = dist(c.start.pin, c.start.stbd) / 2;
    type Slot = { x: number; y: number; hdg: number };
    const free: Slot[] = this.boats.map(b => ({ x: b.x, y: b.y, hdg: b.hdg }));
    const put = (b: Boat, s: Slot) => { b.x = s.x; b.y = s.y; b.hdg = s.hdg; b.twa = n180(c.axis - b.hdg); b.tack = b.twa >= 0 ? 'stbd' : 'port'; settleHeel(b); };
    const far = (a: Slot, b: Slot) => dhypot(a.x - b.x, a.y - b.y);
    const mine: Slot[] = [];
    helms.forEach((_, k) => {
      const step = k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2);
      const want = 0.15 * half + step * 3 * L;
      const hdg = n360(c.axis - 95);
      const at = (along: number, across: number): Slot => ({ ...fromCourse(c, along * L, Math.max(-0.7 * half, Math.min(0.7 * half, across))), hdg });
      // She takes the place of the boat laid out nearest her spot, so the fleet stays the same size around her...
      const spot = at(-4.5, want);
      let near = 0;
      for (let j = 1; j < free.length; j++) if (far(free[j], spot) < far(free[near], spot)) near = j;
      free.splice(near, 1);
      // ...and sails from the spot itself, or the nearest place to it with clear water round it.
      const room = (p: Slot) => Math.min(...free.map(f => far(f, p)), ...mine.map(f => far(f, p) - 0.5 * L), 99 * L);
      let best = spot, bestRoom = room(spot);
      for (const along of [-4.5, -6.2, -3.2, -7.8]) {
        for (const off of [0, 1.5, -1.5, 3, -3]) {
          if (bestRoom > 2 * L) break;
          const p = at(along, want + off * L), r = room(p);
          if (r > bestRoom) { best = p; bestRoom = r; }
        }
      }
      mine.push(best);
    });
    // The rest of the fleet keeps the places left, in the order it was laid out.
    let j = 0;
    for (const b of this.boats) if (!b.human) put(b, free[j++]);
    helms.forEach((b, k) => put(b, mine[k]));
  }

  get player(): Boat | null { return this.playerIndex >= 0 ? this.boats[this.playerIndex] : null; }

  /** The control area, the stretch of bank the skippers stand on: at a venue, the club's own; on the
   *  practice pond, the right-hand bank (looking upwind) either side of the start line. */
  controlArea(): { a: V2; b: V2 } {
    if (this.venue) return { a: this.venue.control[0], b: this.venue.control[1] };
    const c = this.course, B = c.bounds, L = c.L;
    const at = (along: number, across: number): V2 => ({ x: c.origin.x + c.up.x * along + c.right.x * across, y: c.origin.y + c.up.y * along + c.right.y * across });
    return { a: at(-8 * L, B.across + 1.2 * L), b: at(14 * L, B.across + 1.2 * L) };
  }

  perceived(i: number, delaySteps: number): Perceived {
    const H = this.hist[i];
    const n = H.x.length;
    if (!n) { const b = this.boats[i]; return { x: b.x, y: b.y, hdg: b.hdg, spd: b.spd, rot: b.rot }; }
    const k = Math.max(0, n - 1 - delaySteps);
    return { x: H.x[k], y: H.y[k], hdg: H.hdg[k], spd: H.spd[k], rot: H.rot[k] };
  }

  hail(b: Boat, text: string) {
    b.hail = { text, t: this.t };
    this.events.push({ type: 'hail', t: this.t, boat: b.id, text });
  }

  /** Rule 20: hail for room to tack. Appendix E1.3(b): the hail includes "room", "tack" and the hailing boat's sail number. */
  hailRoomToTack(from: Boat, to: Boat) {
    this.hail(from, `Room to tack, ${spellSail(from.sail)}`);
    const i = this.boats.indexOf(from), j = this.boats.indexOf(to);
    this.referee.roomToTack(i, j);
    this.events.push({ type: 'room-to-tack', t: this.t, from: from.id, to: to.id });
    this.skippers[j]?.onHail?.(this, from, 'room-to-tack');
  }

  /** Rule 20.2(c): the hailed boat replies "You tack" instead of tacking, then must give the hailer room. */
  replyYouTack(by: Boat): boolean {
    const j = this.boats.indexOf(by);
    const r = this.referee.pendingRoomToTack(j);
    if (!r) return false;
    const from = this.boats[r.from];
    this.hail(by, 'You tack');
    this.referee.youTack(j);
    this.events.push({ type: 'you-tack', t: this.t, from: by.id, to: from.id });
    this.skippers[r.from]?.onHail?.(this, by, 'you-tack');
    return true;
  }

  markRoundingFor(b: Boat, markId: string) {
    const leg = this.course.legs[b.legIndex];
    if (!leg) return null;
    if (leg.kind === 'mark' && leg.rounding.markId === markId) return { progress: b.progress, sweep: leg.rounding.sweep };
    if (leg.kind === 'gate') {
      if (leg.options[0].markId === markId) return { progress: b.progress, sweep: leg.options[0].sweep };
      if (leg.options[1].markId === markId) return { progress: b.progress2, sweep: leg.options[1].sweep };
    }
    return null;
  }

  /**
   * Sail the race again from a log: the player's boat does exactly what was recorded, up to step
   * `until` (all of it by default). Then the player has her again.
   */
  followLog(log: RaceLog, until = Infinity) { this.following = { log, i: 0, a: 0, until, cur: null }; }
  /** Still following a log? */
  get replaying(): boolean { return !!this.following; }

  /** The player tacks, gybes or hails. Between steps; recorded, so a replay does the same. (In a live
   *  race her actions go out with her inputs instead, and come back in through feed().) */
  act(a: PlayerAct): HailResult | null {
    if (this.following || this.live) return null; // the log decides what she does
    this.log.acts.push([this.step_, a]);
    return this.doAct(a);
  }
  private doAct(a: PlayerAct, seat?: CrewSeat): HailResult | null {
    const b = seat ? this.boats[seat.boat] : this.player;
    if (!b) return null;
    if (a === 'hail') return this.hailFor(b);
    const assist = this.assistFor(b, a);
    if (assist) { if (seat) seat.assist = assist; else this.helmAssist = assist; }
    return null;
  }

  /**
   * A person hails. What she calls depends on what's going on, in the order a skipper thinks of
   * it: answer a room-to-tack hail ("You tack"), protest a foul, ask for room to tack at the bank,
   * claim mark-room, then right of way.
   */
  private hailFor(p: Boat): HailResult {
    const L = p.cls.loa;
    // Rule 20.2(c): reply "You tack" to a boat hailing us for room to tack.
    if (this.referee.pendingRoomToTack(this.boats.indexOf(p))) {
      return this.replyYouTack(p) ? { kind: 'you-tack', text: 'You tack', note: 'You replied "You tack": now give her room to tack and keep clear of her', noteTone: 'warn' } : { kind: 'none' };
    }
    // Protest (Appendix E): own sail number, "protest", the other boat's sail number.
    const recent = [...this.incidents].reverse().find(i => i.victim === p.id && this.t - i.t < 12);
    let other: Boat | null = recent ? this.boatById(recent.offender) : null;
    if (!other) {
      // A near miss with a boat that had to keep clear of us.
      for (const o of this.boats) {
        if (o === p || o.finished) continue;
        if (hullGap(p, o) < 1.2 * L && keepClear(p, o, this.t).keeper === 1) { other = o; break; }
      }
    }
    if (other && (recent || hullGap(p, other) < 1.2 * L)) {
      const text = `${spellSail(p.sail)} protest ${spellSail(other.sail)}`;
      this.hail(p, text);
      let note: string | undefined;
      if (this.forgot.has(other.id)) { this.forgot.delete(other.id); note = `${other.sail} heard your protest and will take her turn`; }
      if (recent && recent.resolved === 'pending') recent.resolved = 'protested';
      return { kind: 'protest', text, note, noteTone: 'good' };
    }
    // Rule 20.1: close-hauled at the bank with a boat to windward: hail for room to tack.
    const up = vmgAngles(p.cls, p.tws).up;
    if (p.started && Math.abs(p.twa) <= up + 12 && bankAhead(p, this.course) <= 3.2 * L) {
      const w = windwardBoat(this, p, 2.2 * L);
      if (w) { this.hailRoomToTack(p, w); return { kind: 'room-to-tack', text: `Room to tack, ${spellSail(p.sail)}` }; }
    }
    const say = (text: string): HailResult => { this.hail(p, text); return { kind: 'say', text }; };
    const pi = this.boats.indexOf(p);
    for (let j = 0; j < this.boats.length; j++) {
      const mr = this.referee.markRoom(pi, j);
      if (mr?.iEntitled) return say('Room!');
    }
    let best: Boat | null = null, bg = 3 * L;
    for (const o of this.boats) { if (o === p || o.finished) continue; const g = hullGap(p, o); if (g < bg) { bg = g; best = o; } }
    if (best) {
      const kc = keepClear(p, best, this.t);
      if (kc.keeper === 1) return say(kc.rule === '10' ? 'Starboard!' : kc.rule === '11' ? 'Up, up!' : 'Keep clear!');
    }
    return { kind: 'none', note: 'Nothing to hail: you hail when you have right of way, need room, or protest' };
  }

  /** The log being followed: do what it did at this step, and take its input. */
  private followStep() {
    const f = this.following!;
    if (this.step_ >= f.until) { this.following = null; return; }
    const { acts, input } = f.log;
    while (f.a < acts.length && acts[f.a][0] <= this.step_) {
      const a = acts[f.a++][1];
      this.log.acts.push([this.step_, a]);
      this.doAct(a);
    }
    // Whatever the screen sets meanwhile, the log's input it is. Past the end of the log she
    // carries on with the last input, as she did then.
    while (f.i < input.length && input[f.i][0] <= this.step_) f.cur = input[f.i++];
    if (f.cur) this.input = { rudder: f.cur[1], sheet: f.cur[2], autoTrim: this.settings.autoTrim };
  }

  /** Quantise the input (so a replay is exact to the bit) and record it when it changes. */
  private recordInput() {
    const q = (v: number) => Math.round(v * 1000) / 1000;
    const rudder = q(this.input.rudder), sheet = q(this.input.sheet);
    this.input = { ...this.input, rudder, sheet };
    const last = this.log.input[this.log.input.length - 1];
    if (!last || last[1] !== rudder || last[2] !== sheet) this.log.input.push([this.step_, rudder, sheet, 0]);
  }

  /** Helm assist for the player: turn through a tack or gybe at a good rate. */
  requestManeuver(kind: 'tack' | 'gybe') {
    const p = this.player;
    if (!p) return;
    const a = this.assistFor(p, kind);
    if (a) this.helmAssist = a;
  }
  private assistFor(p: Boat, kind: 'tack' | 'gybe'): { target: number; until: number } | null {
    const twa = p.twa;
    if (kind === 'tack' && Math.abs(twa) < 100) {
      const up = vmgAngles(p.cls, p.tws).up + 1.5;
      return { target: n360(twa >= 0 ? p.twd + up : p.twd - up), until: this.t + 3 };
    }
    if (kind === 'gybe' && Math.abs(twa) > 80) {
      const dn = vmgAngles(p.cls, p.tws).down;
      return { target: n360(twa >= 0 ? p.twd + dn : p.twd - dn), until: this.t + 3 };
    }
    return null;
  }

  /** A person's helm and sheet onto her boat: the helm assist through a tack or gybe, and auto-trim. */
  private steer(p: Boat, input: PlayerInput, assist: { target: number; until: number } | null): { target: number; until: number } | null {
    let rudder = input.rudder;
    if (assist && this.t < assist.until) {
      const err = n180(assist.target - p.hdg);
      if (Math.abs(err) < 4) assist = null;
      else rudder = Math.max(-0.82, Math.min(0.82, err / 22));
      if (Math.abs(input.rudder) > 0.5) assist = null; // she took over
    }
    // Penalties are the skipper's own: she sails her turn herself (the referee sees it done).
    p.rudder = rudder;
    // Auto-trim: right in upwind (a touch off in very light air), and eased a touch when a gust lays her over.
    const best = bestSheet(Math.abs(p.twa), p.tws) - overpowerEase(p.heel);
    p.sheet = input.autoTrim ? Math.min(best, input.sheet >= 0.98 ? best : input.sheet) : input.sheet;
    return assist && this.t < assist.until ? assist : null;
  }

  // ───────────────────────── live races ─────────────────────────

  /** Live race: can the race take its next step? Only once everyone still racing has sent their
   *  inputs for it. */
  canStep(): boolean {
    for (const c of this.crew) if (this.holding(c)) return false;
    return true;
  }
  /** Is this seat holding the race up? Not once her boat has finished (nothing she does matters
   *  then, so she can leave), nor once an AI skipper has her. */
  private holding(c: CrewSeat): boolean {
    return c.aiFrom > this.step_ && c.upTo <= this.step_ && !this.boats[c.boat].finished;
  }

  /** Live race: the seats holding the race up (their inputs for the next step haven't arrived). */
  waitingFor(): number[] {
    const out: number[] = [];
    this.crew.forEach((c, k) => { if (this.holding(c)) out.push(k); });
    return out;
  }

  /**
   * Live race: what one seat has done, now known up to (but not including) step `upTo`: her input
   * changes and actions, each stamped with the step it applies from. Arrives from her device (or
   * this one, for the player), and may repeat what's already known: only the new part is taken.
   */
  feed(seat: number, upTo: number, input: [number, number, number][], acts: [number, PlayerAct][]) {
    const c = this.crew[seat];
    if (!c || upTo <= c.upTo) return;
    for (const [st, rudder, sheet] of input) if (st >= c.upTo && st < upTo) c.log.input.push([st, rudder, sheet, 0]);
    for (const [st, a] of acts) if (st >= c.upTo && st < upTo) c.log.acts.push([st, a]);
    c.upTo = upTo;
  }

  /**
   * Live race: from step `at` an AI skipper sails this seat's boat (they left the race, or lost
   * their connection). Every device must hand over at the same step: the host picks it, no earlier
   * than any device has got to (none can pass the first step her inputs are missing for).
   */
  handOver(seat: number, at: number) {
    const c = this.crew[seat];
    if (!c || at >= c.aiFrom) return;
    c.aiFrom = Math.max(at, this.step_);
    if (c.upTo > c.aiFrom) c.upTo = c.aiFrom;
  }

  /** Sail a whole live race again from everyone's logs (the debrief's replay). */
  followCrew(logs: RaceLog[]) {
    logs.forEach((l, k) => { const c = this.crew[k]; if (!c) return; c.log = { input: l.input.slice(), acts: l.acts.slice() }; c.upTo = Infinity; });
    const me = this.crew.find(c => c.boat === this.playerIndex);
    if (me) this.log = me.log;
  }

  /** Before the skippers decide: an AI skipper takes over any seat whose person has left. */
  private crewTakeovers() {
    for (const c of this.crew) {
      if (this.step_ < c.aiFrom || this.skippers[c.boat]) continue;
      const b = this.boats[c.boat];
      const persona = { ...(PERSONAS.find(p => p.key === 'steady') ?? PERSONAS[0]) };
      b.persona = persona;
      this.skippers[c.boat] = new Skipper(b, LEVELS[this.settings.level], persona, new Rng(this.settings.seed * 31 + c.boat * 977), c.boat);
    }
  }

  /** Each person's actions and input for this step, onto their boat. */
  private crewInputs() {
    for (const c of this.crew) {
      const b = this.boats[c.boat];
      if (this.step_ >= c.aiFrom || b.finished) continue;
      const L = c.log;
      while (c.fa < L.acts.length && L.acts[c.fa][0] <= this.step_) this.doAct(L.acts[c.fa++][1], c);
      while (c.fi < L.input.length && L.input[c.fi][0] <= this.step_) { const e = L.input[c.fi++]; c.input = { rudder: e[1], sheet: e[2], autoTrim: c.input.autoTrim }; }
      c.assist = this.steer(b, c.input, c.assist);
    }
  }

  step() {
    if (this.ended) return;
    if (this.live && !this.canStep()) return; // waiting for someone's inputs
    if (this.following) this.followStep();
    if (this.player && !this.live) this.recordInput();
    const dt = DT;
    const t = this.t;
    this.wind.step(dt, t);
    const racing = this.boats;
    localWind(racing, this.wind, t);
    if (this.live) this.crewTakeovers();

    // AI decisions at 10 Hz, staggered.
    this.skippers.forEach((s, i) => {
      if (!s) return;
      if ((this.step_ + i) % 2 === 0) s.decide(this);
      s.helm(this, dt);
    });

    // The people's input: everyone in a live race, or the player.
    const p = this.player;
    if (this.live) this.crewInputs();
    else if (p && !p.finished && !this.autopilot) this.helmAssist = this.steer(p, this.input, this.helmAssist);
    // Boats that have finished sail clear of the line and wait out of everyone's way (clear.ts).
    this.boats.forEach((b, i) => { const c = this.clearing[i]; if (b.finished && c) sailClear(b, i, c, this.boats, this.course, t); });

    // Physics. A boat that has finished still sails, but she's out of the race: no collisions,
    // shadow, marks or rule-keeping for her.
    this.passed = this.boats.map(b => {
      if (b.retired) return null;
      const passed = integrate(b, dt, t, this.sea);
      return b.finished ? null : passed;
    });
    const contacts = collide(this.boats);
    const touches = markContacts(this.boats, this.course);
    for (const b of this.boats) if (bank(b, this.course) && b.isPlayer && !b.finished) this.events.push({ type: 'bank', t, boat: b.id });

    this.signals(t);
    this.progressAll(t);
    this.recordHist();
    this.referee.step(contacts, touches, this.passed); // (it only judges boats racing)

    this.t = Math.round((t + dt) * 1000) / 1000;
    this.step_++;
    if (this.following && this.step_ >= this.following.until) this.following = null; // yours from here
    if (this.step_ % 4 === 0) this.recordTrack();
    this.checkEnd();
  }

  private recordHist() {
    this.boats.forEach((b, i) => {
      const H = this.hist[i];
      H.x.push(b.x); H.y.push(b.y); H.hdg.push(b.hdg); H.spd.push(b.spd); H.rot.push(b.rot); H.heel.push(b.heel);
      if (H.x.length > HIST) { H.x.shift(); H.y.shift(); H.hdg.shift(); H.spd.shift(); H.rot.shift(); H.heel.shift(); }
    });
  }

  private recordTrack() {
    const d = new Float32Array(this.boats.length * 5);
    this.boats.forEach((b, i) => { d[i * 5] = b.x; d[i * 5 + 1] = b.y; d[i * 5 + 2] = b.hdg; d[i * 5 + 3] = b.spd; d[i * 5 + 4] = b.finished ? -1 : b.legIndex; });
    const c = this.course;
    this.track.push({ t: this.t, d, twd: this.wind.sample(c.origin.x + c.up.x * c.beat * 0.5, c.origin.y + c.up.y * c.beat * 0.5, this.t).twd });
  }

  /** Start sequence calls (Appendix E timing): each minute, every 10 s in the last minute, every second in the last 10. */
  private signals(t: number) {
    const rem = this.gunT - t;
    if (rem < -0.001) return;
    const sec = Math.ceil(rem - 1e-6);
    if (sec !== this.lastSignal) {
      const s = sec;
      const call = s > 0 && ((s % 60 === 0) || (s <= 60 && s % 10 === 0) || s <= 10);
      if (call) this.events.push({ type: 'signal', t, remaining: s });
      this.lastSignal = s;
    }
    if (rem <= 0.001 && rem > -0.05) this.gun(t);
  }

  private gun(t: number) {
    this.events.push({ type: 'gun', t });
    const over: string[] = [];
    for (const b of this.boats) {
      const side = Math.max(lineSide(this.course, bow(b)), lineSide(this.course, stern(b)));
      if (side > 0) {
        b.ocs = true; b.returning = false; b.started = false;
        over.push(b.id);
        const inc: Incident = {
          id: 1000 + this.incidents.length, t, kind: 'ocs', rule: '29.1', title: 'Over the line at the start', offender: b.id, victim: null,
          explanation: '', nextTime: '', at: { x: b.x, y: b.y }, resolved: 'pending',
        };
        inc.explanation = `${b.isPlayer ? 'You were' : `${b.sail} was`} on the course side of the line at the starting signal. The race committee hailed "Recall" with ${b.isPlayer ? 'your' : 'the'} sail number. Return to the pre-start side and start again.`;
        inc.nextTime = 'Use time-to-line: at full speed from where you are, how long to the line? Trigger only when that matches the clock.';
        this.incidents.push(inc);
        this.events.push({ type: 'incident', t, incident: inc });
      }
    }
    if (over.length) this.events.push({ type: 'recall', t, boats: over });
  }

  private progressAll(t: number) {
    const c = this.course;
    const P = c.start.pin, S = c.start.stbd;
    this.boats.forEach((b, i) => {
      if (b.finished || b.retired || b.disabled) return;
      const H = this.hist[i];
      const prevX = H.x.length ? H.x[H.x.length - 1] : b.x, prevY = H.y.length ? H.y[H.y.length - 1] : b.y;
      const prevBow = { x: prevX + dir(H.hdg.length ? H.hdg[H.hdg.length - 1] : b.hdg).x * b.cls.loa / 2, y: prevY + dir(H.hdg.length ? H.hdg[H.hdg.length - 1] : b.hdg).y * b.cls.loa / 2 };
      const nowBow = bow(b);
      if (!b.started) {
        if (t < this.gunT - 1e-6) return;
        if (b.ocs && !b.returning) {
          const side = Math.max(lineSide(c, bow(b)), lineSide(c, stern(b)));
          if (side < 0) {
            b.returning = true;
            const inc = this.incidents.find(x => x.kind === 'ocs' && x.offender === b.id && x.resolved === 'pending');
            if (inc) inc.resolved = 'returned';
          }
          return;
        }
        // Start: the bow crosses the line between the marks from the pre-start side.
        if (segIntersect(prevBow, nowBow, P, S) >= 0 && lineSide(c, nowBow) > 0 && lineSide(c, prevBow) <= 0) {
          b.started = true;
          b.ocs = false;
          this.events.push({ type: 'started', t, boat: b.id, late: t - this.gunT });
          this.beginLeg(b, 0);
        }
        return;
      }
      const leg = c.legs[b.legIndex];
      if (!leg) return;
      if (leg.kind === 'finish') {
        // Back wholly on the course side after crossing with a penalty owed: she may finish again.
        if (b.reFinish && Math.max(lineSide(c, nowBow), lineSide(c, stern(b))) < 0) b.reFinish = false;
        if (segIntersect(prevBow, nowBow, c.finish.pin, c.finish.stbd) >= 0 && lineSide(c, nowBow) > 0 && lineSide(c, prevBow) <= 0) {
          // A boat can't finish with a penalty hanging over her: she takes her turn, gets her hull
          // wholly back on the course side of the line, and then finishes (RRS 44.2). (A skipper
          // who has forgotten her penalty sails on through, to be disqualified if she's protested.)
          if ((b.penalty.owed > 0 && !this.forgot.has(b.id)) || b.reFinish) {
            if (!b.reFinish) this.events.push({ type: 'no-finish', t, boat: b.id });
            b.reFinish = true;
            return;
          }
          b.finished = true;
          b.finishTime = t - this.gunT;
          const place = this.boats.filter(o => o.finished).length;
          b.roundedAt.push(t); b.placeAtLeg.push(place);
          this.events.push({ type: 'finish', t, boat: b.id, place });
          if (b.isPlayer) this.finishedAt = t;
          this.clearing[i] = startClearing(c, b, t, this.clearing.flatMap(x => (x ? [x.spot] : [])));
        }
        return;
      }
      const upd = (r: { markId: string; side: 'port' | 'stbd' }, last: number, prog: number) => {
        const m = c.byId[r.markId].p;
        const br = bearing(m, b);
        const d = n180(br - last);
        return { prog: prog + (r.side === 'port' ? -d : d), last: br };
      };
      if (leg.kind === 'mark') {
        const u = upd(leg.rounding, b.lastBearing, b.progress);
        b.progress = u.prog; b.lastBearing = u.last;
        if (b.progress >= leg.rounding.sweep) this.completeLeg(b, t);
      } else {
        const u0 = upd(leg.options[0], b.lastBearing, b.progress);
        const u1 = upd(leg.options[1], b.lastBearing2, b.progress2);
        b.progress = u0.prog; b.lastBearing = u0.last; b.progress2 = u1.prog; b.lastBearing2 = u1.last;
        if (b.progress >= leg.options[0].sweep || b.progress2 >= leg.options[1].sweep) this.completeLeg(b, t);
      }
    });
  }

  private completeLeg(b: Boat, t: number) {
    const next = b.legIndex + 1;
    b.roundedAt.push(t);
    const place = 1 + this.boats.filter(o => o !== b && (o.legIndex > b.legIndex || o.finished)).length;
    b.placeAtLeg.push(place);
    this.events.push({ type: 'rounded', t, boat: b.id, leg: b.legIndex, place });
    this.beginLeg(b, next);
    const sk = this.skippers[this.boats.indexOf(b)];
    if (sk && 'gate' in sk) sk.gate = null;
  }

  private beginLeg(b: Boat, idx: number) {
    b.legIndex = idx;
    const leg = this.course.legs[idx];
    if (!leg) return;
    if (leg.kind === 'mark') {
      const m = this.course.byId[leg.rounding.markId].p;
      b.progress = initialProgress(leg.rounding, m, b);
      b.lastBearing = bearing(m, b);
    } else if (leg.kind === 'gate') {
      const m0 = this.course.byId[leg.options[0].markId].p, m1 = this.course.byId[leg.options[1].markId].p;
      b.progress = initialProgress(leg.options[0], m0, b); b.lastBearing = bearing(m0, b);
      b.progress2 = initialProgress(leg.options[1], m1, b); b.lastBearing2 = bearing(m1, b);
    }
  }

  private checkEnd() {
    const all = this.boats.every(b => b.finished || b.retired || b.disabled);
    const p = this.player;
    const leaderDone = this.boats.some(b => b.finished);
    const firstFinish = leaderDone ? Math.min(...this.boats.filter(b => b.finished).map(b => b.finishTime + this.gunT)) : Infinity;
    const timeLimit = leaderDone && this.t > firstFinish + Math.max(90, (firstFinish - this.gunT) * 0.6);
    // On your own: 45 s after you finish. In a live race (the same on every device, whoever's watching):
    // 30 s after the last person still racing finishes.
    let peopleDone = !!(p && p.finished && this.finishedAt !== null && this.t > this.finishedAt + 45);
    if (this.live) {
      const racing = this.crew.filter(c => c.aiFrom > this.step_).map(c => this.boats[c.boat]);
      const last = Math.max(0, ...racing.map(b => (b.finished ? b.finishTime + this.gunT : Infinity)));
      peopleDone = racing.length > 0 && racing.every(b => b.finished || b.retired || b.disabled) && this.t > last + 30;
    }
    if (all || timeLimit || peopleDone || this.t > this.gunT + 1800) this.end();
  }

  end() {
    if (this.ended) return;
    this.ended = true;
    // Unserved penalties after a protest: disqualified.
    for (const b of this.boats) {
      const owed = this.incidents.filter(x => x.offender === b.id && x.kind !== 'ocs' && x.resolved === 'pending');
      if (owed.length && b.penalty.owed > 0) {
        b.dsq = true;
        owed.forEach(x => (x.resolved = 'dsq'));
      }
    }
  }

  results(): ResultRow[] {
    const rows: ResultRow[] = this.boats.map(b => {
      let status: ResultRow['status'] = b.finished ? 'finished' : this.ended || b.disabled ? 'dnf' : 'racing';
      if (b.dsq) status = 'dsq';
      if (!b.started && this.t > this.gunT) status = b.ocs ? 'ocs' : status;
      return { boat: b, place: 0, time: b.finished ? b.finishTime : null, status };
    });
    const score = (r: ResultRow) => {
      if (r.status === 'finished') return r.time!;
      if (r.status === 'racing' || r.status === 'dnf') return 1e6 - this.progressScore(r.boat);
      return 1e9;
    };
    rows.sort((a, b) => score(a) - score(b));
    rows.forEach((r, i) => (r.place = i + 1));
    return rows;
  }

  /** Bigger is further round the course; used for live positions. */
  progressScore(b: Boat): number {
    if (b.finished) return 1e6 - b.finishTime;
    if (!b.started) return -1e3 + toCourse(this.course, b).along / 100;
    const leg = this.course.legs[b.legIndex];
    let into = 0;
    if (leg) {
      const target = leg.kind === 'mark' ? this.course.byId[leg.rounding.markId].p
        : leg.kind === 'gate' ? { x: (this.course.byId[leg.options[0].markId].p.x + this.course.byId[leg.options[1].markId].p.x) / 2, y: (this.course.byId[leg.options[0].markId].p.y + this.course.byId[leg.options[1].markId].p.y) / 2 }
        : this.course.origin;
      into = -dist(b, target) / (this.course.L * 100);
    }
    return b.legIndex * 10 + into;
  }

  livePlace(b: Boat): number {
    const s = this.progressScore(b);
    return 1 + this.boats.filter(o => o !== b && this.progressScore(o) > s).length;
  }

  avoidingSince(i: number, t: number): boolean {
    const s = this.skippers[i];
    if (!s) return true;
    return s.lastAvoid.t >= t - 0.05 && s.lastAvoid.tag !== 'hold';
  }

  sailName(b: Boat) { return b.isPlayer ? 'You' : b.sail; }
  spoken(b: Boat) { return spellSail(b.sail); }
  isRacing(b: Boat) { return isRacing(b); }
  boatById(id: string) { return this.boats.find(b => b.id === id)!; }
  leg(b: Boat) { return this.course.legs[b.legIndex]; }
  distTo(b: Boat, p: V2) { return dist(b, p); }
}
