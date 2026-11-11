// Your skill passport: for each part of racing, what you've been giving away and which way it's
// going, and a grade for how you stand against the fleets you race. Worked out from the loss
// ledgers saved with your races. Pure: nothing stored here.
//
// Grades are against the other boats in the same race, whose ledgers are kept the same way as
// yours, and not against fixed numbers: measured in ten-boat fleets, a Club skipper and a World
// skipper give away about the same number of lengths at each part of a race (a better fleet arrives
// at every mark together), so no fixed number of lengths means "World class".
import { CAUSES, CAUSE_WORDS, type Part } from './ledger';
import { ledgerRaces, rate } from './focus';
import type { Profile } from './profile';

export type Grade = 'bronze' | 'silver' | 'gold';
/** The share of the fleet you must give away less than, on average, for each grade. */
export const GRADE_AT: Record<Grade, number> = { bronze: 0.25, silver: 0.5, gold: 0.75 };
export const GRADE_NAME: Record<Grade, string> = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' };
/** Races with a fleet to stand against before a grade is given, and the newest that count towards it. */
export const GRADED_MIN = 3, GRADED_OVER = 5;

export interface Skill {
  part: Part; name: string;
  /** Lengths given away (as rates, in the part's own unit: see `rate`), each race, oldest first. */
  series: { at: number; v: number }[];
  /** The average of your newest five races, and of the five before them (null without enough). */
  now: number | null; before: number | null;
  /** The share of the fleet you gave away less than, over the newest graded races (null: none yet). */
  beat: number | null;
  /** What the middle boat of those fleets gave away, as a rate like yours. */
  fleet: number | null;
  grade: Grade | null;
  /** The next grade up and the share of the fleet it takes (null at Gold). */
  next: { grade: Grade; at: number } | null;
}

export interface Passport {
  /** Races with a ledger, and those of them with a fleet to stand against. */
  races: number; graded: number;
  /** Who the grades are against: "Club skippers", or "Club to National skippers" (null: not graded yet). */
  against: string | null;
  total: Skill;
  skills: Skill[];
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const r1 = (x: number | null) => (x === null ? null : Math.round(x * 10) / 10);
const LEVELS = ['club', 'state', 'national', 'world'];
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export function gradeFor(beat: number | null): Grade | null {
  if (beat === null) return null;
  return beat >= GRADE_AT.gold ? 'gold' : beat >= GRADE_AT.silver ? 'silver' : beat >= GRADE_AT.bronze ? 'bronze' : null;
}

/** Your passport (null until you've sailed a race that kept a ledger). */
export function passport(profile: Profile): Passport | null {
  const rs = ledgerRaces(profile);
  if (!rs.length) return null;
  const graded = rs.filter(r => r.ledger!.vs).slice(0, GRADED_OVER);
  const can = graded.length >= GRADED_MIN;
  const of = (part: Part, name: string): Skill => {
    const val = (r: (typeof rs)[number]) => rate(r.ledger!)[part];
    const series = [...rs].reverse().map(r => ({ at: r.at, v: Math.round(val(r) * 10) / 10 }));
    const beat = can ? avg(graded.map(r => r.ledger!.vs!.beat[part])) : null;
    const fleet = can ? avg(graded.map(r => r.ledger!.vs!.mid[part])) : null;
    const grade = gradeFor(beat);
    const up: Grade | null = grade === 'gold' ? null : grade === 'silver' ? 'gold' : grade === 'bronze' ? 'silver' : 'bronze';
    return {
      part, name, series,
      now: r1(avg(rs.slice(0, 5).map(val))), before: rs.length >= 8 ? r1(avg(rs.slice(5, 10).map(val))) : null,
      beat: beat === null ? null : Math.round(beat * 100) / 100, fleet: r1(fleet), grade,
      next: can && up ? { grade: up, at: GRADE_AT[up] } : null,
    };
  };
  const levels = [...new Set(graded.map(r => r.ledger!.vs!.level))].sort((a, z) => LEVELS.indexOf(a) - LEVELS.indexOf(z));
  return {
    races: rs.length, graded: graded.length,
    against: !can ? null : levels.length === 1 ? `${cap(levels[0])} skippers` : `${cap(levels[0])} to ${cap(levels[levels.length - 1])} skippers`,
    total: of('total', 'Everything'),
    skills: CAUSES.map(c => of(c, CAUSE_WORDS[c].name)),
  };
}

/** Which way a skill is going: fewer lengths than the five races before is better. */
export function trend(s: Skill): { dir: 'better' | 'worse' | 'steady'; by: number } | null {
  if (s.now === null || s.before === null) return null;
  const by = Math.round((s.before - s.now) * 10) / 10;
  // (A real change: a tenth of what it was, and at least a tenth of a length.)
  const real = Math.abs(by) >= Math.max(0.1, 0.1 * s.before);
  return { dir: !real ? 'steady' : by > 0 ? 'better' : 'worse', by: Math.abs(by) };
}
