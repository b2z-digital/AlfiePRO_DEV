// The race officer's career: run the racing instead of sailing it. Four duties (set the course, call
// the line, score the racing, hear a protest), each at four standards (Club, Regional, National and
// World race officer, the same levels as the skippers'). A duty is set from a seed, so it can be tried
// again exactly, and marked out of 100; pass a standard's duties to be that standard of race officer.
// This file holds the duties' set-ups and their marking (pure); the screens are in SimRO.tsx.
import { Race } from '@/sim/engine';
import { Rng, n180, n360 } from '@/sim/math';
import { WindField, type WindCharacter } from '@/sim/wind';
import type { ClassId } from '@/sim/classes';
import { toCourse } from '@/sim/course';
import type { RaceSettings, SkipperLevel } from '@/sim/types';

export type RoLevel = SkipperLevel;
export const RO_LEVELS: RoLevel[] = ['club', 'state', 'national', 'world'];
export const RO_NAME: Record<RoLevel, string> = { club: 'Club race officer', state: 'Regional race officer', national: 'National race officer', world: 'World race officer' };
export type DutyId = 'course' | 'line' | 'score' | 'protest';
export const DUTY_NAME: Record<DutyId, string> = { course: 'Set the course', line: 'Call the line', score: 'Score the racing', protest: 'Hear a protest' };
/** The mark a duty needs at each standard to pass. */
export const PASS: Record<RoLevel, number> = { club: 60, state: 70, national: 78, world: 85 };
/** The duties built so far (the others are on their way). */
export const DUTIES_READY: DutyId[] = ['course', 'line'];

/** Your race officer's record: each duty's best mark at each standard. */
export interface RoRecord { best: Partial<Record<`${DutyId}:${RoLevel}`, { score: number; at: number; tries: number }>>; at: number }

/** The standard you hold: the highest whose ready duties are all passed. */
export function roLevel(rec: RoRecord | undefined): RoLevel | null {
  let got: RoLevel | null = null;
  for (const lv of RO_LEVELS) {
    if (DUTIES_READY.every(d => (rec?.best[`${d}:${lv}`]?.score ?? 0) >= PASS[lv])) got = lv; else break;
  }
  return got;
}
/** The standard you're working towards. */
export const roNext = (rec: RoRecord | undefined): RoLevel | null => {
  const now = roLevel(rec);
  return now === null ? 'club' : RO_LEVELS[RO_LEVELS.indexOf(now) + 1] ?? null;
};
export function recordDuty(rec: RoRecord | undefined, duty: DutyId, lv: RoLevel, score: number, now: number): RoRecord {
  const key = `${duty}:${lv}` as const;
  const was = rec?.best[key];
  return { best: { ...(rec?.best ?? {}), [key]: { score: Math.max(score, was?.score ?? 0), at: now, tries: (was?.tries ?? 0) + 1 } }, at: now };
}

// ───────────────────────── Set the course ─────────────────────────

/** The day you're setting a course for. */
export interface CourseTask {
  seed: number; level: RoLevel; classId: ClassId; fleet: number; knots: number; character: WindCharacter;
  /** The wind's base direction (what the forecast says). */
  from: number;
  /** A shift the forecast expects over the first beat (degrees, + = veering, clockwise), 0 for none. */
  shift: number;
  /** The wind readings from the committee boat over the ten minutes before the start: minutes before, direction. */
  readings: { min: number; from: number }[];
  /** The start sequence, seconds. */
  seq: number;
}

/** Your course: the windward mark's bearing from the line's centre, the line square to a bearing, the beat and line lengths in hull lengths. */
export interface CourseSet { mark: number; square: number; beat: number; line: number }

const WIND_OF = (t: CourseTask) => new WindField(
  { strength: t.knots < 7 ? 'light' : t.knots > 13 ? 'fresh' : 'medium', character: t.character, direction: t.from, knots: t.knots, shifts: shiftsOf(t) },
  t.seed, { cx: 0, cy: 0, halfAlong: 50, halfAcross: 50 },
);
const shiftsOf = (t: CourseTask) => (t.shift ? [{ t: t.seq - 20, deg: t.shift, over: 240 }] : undefined);

export function courseTask(level: RoLevel, seed: number): CourseTask {
  const r = new Rng(seed * 7 + 3);
  const fleet = { club: 8, state: 12, national: 16, world: 20 }[level];
  const character: WindCharacter = level === 'club' ? 'steady' : 'oscillating';
  const shift = level === 'national' || level === 'world' ? r.pick([-1, 1]) * Math.round(r.range(6, 11)) : 0;
  const from = Math.round(r.range(0, 360));
  const knots = Math.round(r.range(level === 'world' ? 5 : 7, level === 'world' ? 16 : 13));
  const t: CourseTask = { seed, level, classId: r.pick(['IOM', 'IOM', 'DF95', 'DF65'] as ClassId[]), fleet, knots, character, from, shift, readings: [], seq: 60 };
  // The readings: the mean direction a minute apart, the last one at the start of the sequence.
  const w = WIND_OF(t);
  t.readings = Array.from({ length: 10 }, (_, i) => ({ min: 10 - i, from: Math.round(n360(w.meanTwd(-60 * (10 - i)))) }));
  return t;
}

/** The mean of directions, properly (350° and 010° average to 000°). */
export function meanDir(ds: number[]): number {
  let x = 0, y = 0;
  for (const d of ds) { x += Math.sin((d * Math.PI) / 180); y += Math.cos((d * Math.PI) / 180); }
  return n360((Math.atan2(x, y) * 180) / Math.PI);
}

/** The wind as it really was: at the start, and over the first beat. */
export function courseTruth(t: CourseTask): { start: number; beat: number } {
  const w = WIND_OF(t);
  const at = (a: number, b: number) => meanDir(Array.from({ length: 41 }, (_, i) => w.meanTwd(a + ((b - a) * i) / 40)));
  return { start: at(t.seq - 30, t.seq + 15), beat: at(t.seq, t.seq + 150) };
}

/** What a course should be for this fleet, in hull lengths: a line half as long again as the boats in a row, a beat that spreads them before the mark. */
export function courseGuide(t: CourseTask): { line: number; beat: number } {
  return { line: Math.round(1.5 * t.fleet), beat: Math.round(22 + 0.8 * t.fleet) };
}

/** A sensible first guess to start from: the last reading, a short line, a short beat. */
export function courseStart(t: CourseTask): CourseSet {
  const g = courseGuide(t), last = t.readings[t.readings.length - 1].from;
  return { mark: last, square: last, beat: Math.round(g.beat * 0.7), line: Math.round(g.line * 0.7) };
}

const band = (err: number, full: number, zero: number) => (err <= full ? 1 : err >= zero ? 0 : 1 - (err - full) / (zero - full));

export interface CourseMark {
  score: number;
  parts: { what: string; got: number; of: number; note: string }[];
  truth: { start: number; beat: number };
}

/** Mark a course: the line square to the wind at the start, the mark straight up the beat's wind, the line and beat the right size. */
export function markCourse(t: CourseTask, c: CourseSet): CourseMark {
  const truth = courseTruth(t), g = courseGuide(t);
  const lineErr = Math.abs(n180(c.square - truth.start));
  const markErr = Math.abs(n180(c.mark - truth.beat));
  const lineR = c.line / g.line, beatR = c.beat / g.beat;
  const favoured = n180(c.square - truth.start); // + : the line's square to the right of the wind: the pin's upwind
  const parts = [
    { what: 'The line', of: 30, got: 30 * band(lineErr, 2, 10),
      note: lineErr <= 2 ? 'Square to the wind at the start.' : `${Math.round(lineErr)}° off square at the start: the ${favoured > 0 ? 'pin' : 'boat'} end was favoured.` },
    { what: 'The windward mark', of: 30, got: 30 * band(markErr, 3, 12),
      note: markErr <= 3 ? 'Straight up the wind of the first beat.' : `${Math.round(markErr)}° off the wind of the first beat: the ${n180(c.mark - truth.beat) > 0 ? 'right' : 'left'} paid more than it should.` },
    { what: 'The line\'s length', of: 20, got: 20 * (lineR < 1 ? band(1 - lineR, 0.15, 0.45) : band(lineR - 1, 0.2, 0.7)),
      note: lineR < 0.85 ? `Short for ${t.fleet} boats: about ${g.line} lengths gives them room.` : lineR > 1.2 ? `Long for ${t.fleet} boats: about ${g.line} lengths keeps them together.` : `Right for ${t.fleet} boats.` },
    { what: 'The beat', of: 20, got: 20 * band(Math.abs(1 - beatR), 0.15, 0.45),
      note: beatR < 0.85 ? `Short: about ${g.beat} lengths spreads ${t.fleet} boats out before the mark.` : beatR > 1.15 ? `Long: about ${g.beat} lengths is enough.` : 'Right for the fleet.' },
  ];
  return { score: Math.round(parts.reduce((a, p) => a + p.got, 0)), parts, truth };
}

/** The race on your course: the fleet sails it, every boat with a skipper of the task's standard. */
export function courseRaceSettings(t: CourseTask, c: CourseSet): RaceSettings {
  return {
    classId: t.classId, fleetSize: t.fleet, level: t.level === 'club' ? 'state' : t.level, windStrength: t.knots < 7 ? 'light' : t.knots > 13 ? 'fresh' : 'medium',
    windCharacter: t.character, windKnots: t.knots, windFrom: t.from, windShifts: shiftsOf(t), laps: 1, length: 'medium', sequenceSeconds: t.seq,
    coach: 'off', autoTrim: true, seed: t.seed, noPlayer: true, tune: 2,
    roCourse: { axis: c.mark, beat: c.beat, half: c.line / 2 }, lineBias: n180(c.square - c.mark),
  } as RaceSettings;
}

export interface CourseOutcome {
  /** Where the fleet crossed the line: pin third, middle, boat third. */
  thirds: [number, number, number];
  /** Over the line at the gun, and incidents in the start. */
  ocs: number; startIncidents: number;
  /** The first beat: how many of the first three round mark 1 from each side, and the first beat's time. */
  topLeft: number; topRight: number; beatTime: number | null;
}

/** Sail the fleet up the first beat of your course (headless) and see how it went. */
export function sailCourse(s: RaceSettings): CourseOutcome {
  const run = courseRun(s);
  while (!run.step(1e9)) { /* all at once */ }
  return run.result()!;
}

/**
 * The same, a slice at a time (a few seconds of work in all), so a page can show it going.
 * `step(n)` sails n more steps and says whether it's done; `progress` runs 0 to 1.
 */
export function courseRun(s: RaceSettings): { step: (n: number) => boolean; progress: () => number; result: () => CourseOutcome | null } {
  const r = new Race(s);
  const crossed = new Map<string, number>();
  const side = new Map<string, number>();
  let beatTime: number | null = null;
  const rounded: string[] = [];
  const lineLen = Math.hypot(r.course.start.stbd.x - r.course.start.pin.x, r.course.start.stbd.y - r.course.start.pin.y);
  const going = () => r.t < r.gunT + 420 && rounded.length < Math.min(3, r.boats.length);
  let out: CourseOutcome | null = null;
  const step = (n: number): boolean => {
  for (let k = 0; k < n && going(); k++) {
    r.step();
    for (const b of r.boats) {
      if (b.started && !crossed.has(b.id)) {
        const u = ((b.x - r.course.start.pin.x) * (r.course.start.stbd.x - r.course.start.pin.x) + (b.y - r.course.start.pin.y) * (r.course.start.stbd.y - r.course.start.pin.y)) / (lineLen * lineLen);
        crossed.set(b.id, Math.max(0, Math.min(0.999, u)));
      }
      if (b.started && b.legIndex === 0) side.set(b.id, (side.get(b.id) ?? 0) + toCourse(r.course, { x: b.x, y: b.y }).across);
      if (b.legIndex >= 1 && !rounded.includes(b.id)) { rounded.push(b.id); if (beatTime === null) beatTime = r.t - r.gunT; }
    }
  }
  if (going()) return false;
  out = finish();
  return true;
  };
  const finish = (): CourseOutcome => {
  const thirds: [number, number, number] = [0, 0, 0];
  for (const u of crossed.values()) thirds[Math.floor(u * 3)]++;
  const top = rounded.slice(0, 3);
  return {
    thirds, ocs: r.incidents.filter(i => i.kind === 'ocs').length,
    startIncidents: r.incidents.filter(i => i.kind !== 'ocs' && Math.abs(i.t - r.gunT) < 15).length,
    topLeft: top.filter(id => (side.get(id) ?? 0) < 0).length, topRight: top.filter(id => (side.get(id) ?? 0) >= 0).length, beatTime,
  };
  };
  return { step, progress: () => Math.min(1, r.t / (r.gunT + 90)), result: () => out };
}

// ───────────────────────── Call the line ─────────────────────────

export interface LineTask { seed: number; level: RoLevel; classId: ClassId; fleet: number; eager: Record<string, number> }

/** A start to call: some of the fleet mean to be early, more of them and closer to the line at higher standards. */
export function lineTask(level: RoLevel, seed: number): LineTask {
  const r = new Rng(seed * 13 + 5);
  const fleet = { club: 8, state: 10, national: 14, world: 16 }[level];
  // A world race officer sometimes faces a start too big to call boat by boat.
  const general = level === 'world' && r.chance(0.35);
  const n = general ? Math.round(fleet * 0.5) : { club: r.pick([1, 2]), state: r.pick([1, 2, 3]), national: r.pick([2, 3, 4]), world: r.pick([3, 4, 5]) }[level];
  const by = { club: [1.6, 2.6], state: [1.0, 1.9], national: [0.6, 1.3], world: [0.5, 1.2] }[level] as [number, number];
  const base: LineTask = { seed, level, classId: 'IOM', fleet, eager: {} };
  const sails = new Race(lineRaceSettings(base)).boats.map(b => b.sail);
  const eager: Record<string, number> = {};
  const order = [...Array(fleet).keys()].map(i => ({ i, k: r.next() })).sort((a, b) => a.k - b.k).map(x => x.i);
  for (const i of order.slice(0, n)) eager[sails[i]] = r.range(by[0], by[1]);
  return { ...base, eager };
}

export function lineRaceSettings(t: LineTask): RaceSettings {
  return {
    classId: t.classId, fleetSize: t.fleet, level: 'national', windStrength: 'medium', windCharacter: 'steady', laps: 1, length: 'short', sequenceSeconds: 40,
    coach: 'off', autoTrim: true, seed: t.seed, noPlayer: true, tune: 2, lineBias: 0, eager: t.eager,
  } as RaceSettings;
}

/** When a start is past calling boat by boat: a third of the fleet over, or six boats. */
export const generalDue = (over: number, fleet: number) => over >= Math.max(5, Math.ceil(fleet / 3));

export interface LineMark { score: number; hits: string[]; missed: string[]; wrong: string[]; over: string[]; decisionRight: boolean; general: boolean }

/** Mark your call against the boats really over at the gun. */
export function markLine(over: string[], called: string[], general: boolean, fleet: number): LineMark {
  const due = generalDue(over.length, fleet);
  const hits = called.filter(s => over.includes(s)), wrong = called.filter(s => !over.includes(s)), missed = over.filter(s => !called.includes(s));
  const decisionRight = general === due;
  let score: number;
  if (due) score = general ? 100 : Math.round(40 * hits.length / Math.max(1, over.length));
  else if (general) score = 25;
  else score = over.length === 0 ? (wrong.length ? Math.max(0, 100 - 40 * wrong.length) : 100) : Math.round(Math.max(0, 100 * (hits.length - 0.6 * wrong.length) / over.length));
  return { score, hits, missed, wrong, over, decisionRight, general };
}

/** Rough: a random seed for a new try. */
export const freshSeed = () => Math.floor(Math.random() * 1e9);
