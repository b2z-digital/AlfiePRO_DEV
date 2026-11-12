// Your year in sailing: the year's races, the rating through it, where the lengths went then and lately.
import { describe, expect, it } from 'vitest';
import { yearBounds, yearSummary, type YearRace } from '@/components/race-simulator/year';
import type { TrainingProgress } from '@/components/race-simulator/progress';
import type { Cause } from '@/components/race-simulator/ledger';

const T = (y: number, m: number, d: number) => new Date(y, m, d, 12).getTime();
const led = (start: number, shifts: number) => ({ total: start + shifts, parts: [{ cause: 'start' as Cause, lengths: start }, { cause: 'shifts' as Cause, lengths: shifts }], worst: [], speedUp: 0, tacks: 0, tacksMade: 0, gybesMade: 0, marks: 0, minutes: 6 });
const race = (at: number, place: number, o: Partial<YearRace> = {}): YearRace => ({
  at, mode: 'race', title: 'Quick race', cls: 'IOM', level: 'state', status: 'finished', place, of: 10, time: 360, late: 3, ocs: false, penalties: 0, venue: 'lmryc', ...o,
});
const training: TrainingProgress = {
  drills: { a: { best: 1, stars: 2, tries: 1, at: T(2026, 3, 1) }, b: { best: 1, stars: 3, tries: 1, at: T(2025, 3, 1) } },
  lessons: { r1: { answered: true, correct: true, played: true, at: T(2026, 4, 1) } },
  lab: { m1: { won: true, tries: 1, at: T(2026, 5, 1) }, m2: { won: false, tries: 2, at: T(2026, 5, 2) } },
  updatedAt: 1,
};

describe('Your year in sailing', () => {
  it('counts the year\'s races, time racing, wins and podiums, and where and what you sailed', () => {
    const all = [
      race(T(2025, 11, 20), 1), // last year: only for the rating
      race(T(2026, 0, 5), 1), race(T(2026, 1, 5), 3, { venue: 'kbryc' }), race(T(2026, 2, 5), 6, { cls: 'DF95' }),
      race(T(2026, 3, 5), 0, { status: 'dnf', place: null }), race(T(2026, 4, 5), 2, { mode: 'start' }),
    ];
    const s = yearSummary({ year: 2026, now: T(2026, 10, 12), all, source: 'account', career: null, training, worldResults: null, worldMedals: [] });
    expect(s).toMatchObject({ year: 2026, soFar: true, races: 4, finished: 3, wins: 1, podiums: 2, minutes: 30 });
    expect(s.waters).toEqual([{ venue: 'lmryc', races: 3 }, { venue: 'kbryc', races: 1 }]);
    expect(s.classes[0]).toEqual({ cls: 'IOM', races: 3 });
    expect(s.training).toEqual({ drills: 1, stars: 2, rules: 1, scenarios: 1 });
    // The rating starts from where last year's race left it.
    expect(s.rating!.start).toBeGreaterThan(1000);
    expect(s.rating!.series[0]).toEqual({ at: yearBounds(2026).from, rating: s.rating!.start });
    expect(s.rating!.series).toHaveLength(1 + 4);
  });

  it('compares the lengths given away early in the year with lately, and names the most improved', () => {
    const all = Array.from({ length: 12 }, (_, i) => race(T(2026, i, 10), 4, { ledger: led(i < 4 ? 8 : i >= 8 ? 2 : 5, 6), late: i < 6 ? 6 : 1 }));
    const s = yearSummary({ year: 2026, now: T(2026, 11, 31), all, source: 'account', career: null, training, worldResults: null, worldMedals: [] });
    expect(s.lengths).toMatchObject({ early: 14, late: 8, improved: 'start', still: 'shifts' });
    expect(s.starts).toMatchObject({ earlyLate: 6, lateLate: 1, ocs: 0 });
    expect(s.line).toMatch(/14 lengths a race down to 8/);
  });

  it('says plainly when there is nothing yet', () => {
    const s = yearSummary({ year: 2026, now: T(2026, 1, 1), all: [], source: 'device', career: null, training: { drills: {}, lessons: {}, lab: {}, updatedAt: 0 }, worldResults: null, worldMedals: [] });
    expect(s).toMatchObject({ races: 0, rating: null, lengths: null, starts: null, circuit: null, world: null, line: 'No races yet this year.' });
  });
});
