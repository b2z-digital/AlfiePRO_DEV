// Your skipper rating and level: one number worked out from the races you've sailed against the
// computer's skippers, and the level it puts you at (Club, Regional, National, World). Every race
// is a comparison with each boat in it: beat more of a fleet than your rating says you should and
// it goes up; fewer, and it comes down. Your first few races move it quickly, to place you.
// Pure: nothing stored here. It's worked out from the races already saved with your profile.
import type { SkipperLevel } from '@/sim/types';
import type { Profile } from './profile';
import type { RaceSummary } from './stats';

export const LEVELS: SkipperLevel[] = ['club', 'state', 'national', 'world'];
/** The names of the levels as they're shown ("state" is the Regional level, for any country). */
export const LEVEL_NAME: Record<SkipperLevel, string> = { club: 'Club', state: 'Regional', national: 'National', world: 'World' };
export const levelName = (l: string): string => LEVEL_NAME[l as SkipperLevel] ?? `${l.slice(0, 1).toUpperCase()}${l.slice(1)}`;

/** What the computer's skippers are rated at each level, and the rating each level starts at. */
export const FLEET_RATING: Record<SkipperLevel, number> = { club: 900, state: 1200, national: 1500, world: 1800 };
export const LEVEL_FROM: Record<SkipperLevel, number> = { club: 0, state: 1100, national: 1400, world: 1700 };
/** Where everyone starts, the races it takes to be placed, and the races that move the rating fast. */
export const START_RATING = 1000, PLACED_AFTER = 3, FAST_RACES = 5;
const K_FAST = 400, K = 110, FLOOR = 600, CEILING = 2400;
/**
 * How many rating points make the odds of beating a boat ten to one. Set from the computer's
 * skippers as measured: over twenty twelve-boat races with three boats at each level (the second
 * tuning, 12 Nov 2026), a level beat the level below it 62% of the time (64%, 60%, 62%), two below
 * 71% and three below 80%. With the levels 300 points apart, 1,400 gives 62%, 73% and 81%.
 */
export const SCALE = 1400;

export const levelOf = (rating: number): SkipperLevel => (rating >= LEVEL_FROM.world ? 'world' : rating >= LEVEL_FROM.national ? 'national' : rating >= LEVEL_FROM.state ? 'state' : 'club');

/** Does this race count towards the rating? A race against a fleet, sailed to a result. */
export const rated = (r: RaceSummary): boolean => r.mode === 'race' && r.status !== 'racing' && r.of >= 2 && r.level in FLEET_RATING;

/** The share of the fleet you beat (0 to 1). Not finishing, or being disqualified, beats nobody. */
export function beat(r: RaceSummary): number {
  if (r.status !== 'finished' || r.place == null) return 0;
  return Math.max(0, Math.min(1, (r.of - r.place) / (r.of - 1)));
}

/** The share of a fleet at `fleet` rating that a skipper rated `mine` should beat. */
export const expected = (mine: number, fleet: number): number => 1 / (1 + 10 ** ((fleet - mine) / SCALE));

export interface Standing {
  rating: number;
  /** Races that have counted, and whether that's enough to be placed. */
  races: number; placed: boolean;
  level: SkipperLevel;
  /** What your newest race did to it (null before one). */
  last: number | null;
  /** The level above, where it starts, and how far off it is (null at World). */
  next: { level: SkipperLevel; at: number; gap: number } | null;
  /** How far through your own level you are (0 to 1). */
  through: number;
  /** After each race, oldest first. */
  series: { at: number; rating: number }[];
}

export function standing(profile: Profile): Standing {
  const rs = profile.races.filter(rated).sort((a, z) => a.at - z.at);
  let rating = START_RATING, last: number | null = null;
  const series: Standing['series'] = [];
  rs.forEach((r, i) => {
    const d = (i < FAST_RACES ? K_FAST : K) * (beat(r) - expected(rating, FLEET_RATING[r.level as SkipperLevel]));
    const next = Math.max(FLOOR, Math.min(CEILING, rating + d));
    last = Math.round(next) - Math.round(rating);
    rating = next;
    series.push({ at: r.at, rating: Math.round(rating) });
  });
  const shown = Math.round(rating);
  const level = levelOf(shown);
  const up = LEVELS[LEVELS.indexOf(level) + 1] as SkipperLevel | undefined;
  const from = level === 'club' ? FLOOR : LEVEL_FROM[level];
  const to = up ? LEVEL_FROM[up] : LEVEL_FROM.world + 300;
  return {
    rating: shown, races: rs.length, placed: rs.length >= PLACED_AFTER, level, last,
    next: up ? { level: up, at: LEVEL_FROM[up], gap: LEVEL_FROM[up] - shown } : null,
    through: Math.max(0, Math.min(1, (shown - from) / (to - from))),
    series,
  };
}

/** Clean sailing: the rules you broke a race, over your newest races against a fleet (null before one). */
export function cleanSailing(profile: Profile, over = 10): { races: number; fouls: number } | null {
  const rs = profile.races.filter(rated).sort((a, z) => z.at - a.at).slice(0, over);
  if (!rs.length) return null;
  const n = rs.reduce((s, r) => s + r.incidents.filter(i => i.mine).length, 0);
  return { races: rs.length, fouls: Math.round((n / rs.length) * 10) / 10 };
}
