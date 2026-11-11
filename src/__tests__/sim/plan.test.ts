// Today's ten minutes: three things, from where the races are going and what's due.
import { describe, expect, it } from 'vitest';
import { lossPerRace, offerFirstSail, todaysPlan } from '@/components/race-simulator/plan';
import { mergeTraining } from '@/components/race-simulator/progress';
import { FIRST } from '@/sim/training/first';
import { CAUSES, type Cause, type Ledger } from '@/components/race-simulator/ledger';
import type { Profile } from '@/components/race-simulator/profile';
import type { TrainingProgress } from '@/components/race-simulator/progress';
import type { RaceSummary } from '@/components/race-simulator/stats';

const NOW = Date.UTC(2026, 10, 11, 3);
const DAY = 86400000;
const led = (by: Partial<Record<Cause, number>>): Ledger => ({ total: 0, parts: CAUSES.map(c => ({ cause: c, lengths: by[c] ?? 0 })), worst: [], speedUp: 0, tacks: 0, tacksMade: 0, gybesMade: 0, marks: 3, minutes: 5 });
const race = (by: Partial<Record<Cause, number>>): RaceSummary => ({ mode: 'race', ledger: led(by) } as RaceSummary);
const none: TrainingProgress = { drills: {}, lessons: {}, lab: {}, updatedAt: 0 };

describe("Today's ten minutes", () => {
  it('for a newcomer: three different things, starting with the start', () => {
    const plan = todaysPlan({ races: [] }, none, NOW);
    expect(plan.length).toBe(3);
    expect(plan[0].cause).toBe('start');
    expect(new Set(plan.map(p => `${p.link.kind}:${p.link.id}`)).size).toBe(3);
    expect(plan.every(p => !p.done && /a good place to start/.test(p.why))).toBe(true);
  });

  it('follows the ledger: the biggest slices of your last races come first', () => {
    const profile: Profile = { races: [race({ turns: 9, air: 4, start: 1 }), race({ turns: 7, air: 6, shifts: 2 })] };
    expect(lossPerRace(profile)!.by.turns).toBe(8);
    const plan = todaysPlan(profile, none, NOW);
    expect(plan.map(p => p.cause)).toEqual(['turns', 'air', 'shifts']);
    expect(plan[0].why).toBe('Tacks and gybes: about 8.0 lengths a race over your last 2 races.');
    expect(['tacks', 'gybes']).toContain(plan[0].link.id);
  });

  it("what you did today stays on the list, ticked; what you've passed comes back later", () => {
    const profile: Profile = { races: [race({ turns: 9 })] };
    const today: TrainingProgress = { ...none, lab: { tacks: { won: true, tries: 2, at: NOW - 3600000 } } };
    const p1 = todaysPlan(profile, today, NOW);
    expect(p1[0]).toMatchObject({ link: { kind: 'lab', id: 'tacks' }, done: true });
    // Two days on: tacks was won (due again after a week), so the other turns drill takes its place.
    const p2 = todaysPlan(profile, today, NOW + 2 * DAY);
    expect(p2[0].link.id).toBe('gybes');
    expect(p2[0].done).toBe(false);
    // Eight days on, tacks is due again, but gybes (never done) still comes first.
    const both: TrainingProgress = { ...none, lab: { tacks: { won: true, tries: 2, at: NOW }, gybes: { won: true, tries: 1, at: NOW + DAY } } };
    expect(todaysPlan(profile, both, NOW + 8 * DAY)[0].link.id).toBe('tacks');
    expect(todaysPlan(profile, both, NOW + 8 * DAY)[0].why).toMatch(/lengths a race|due again/);
  });
});

describe('"New to RC sailing?"', () => {
  const ran = (place: number | null, of = 8, status = 'finished'): RaceSummary => ({ mode: 'race', status, place, of } as RaceSummary);
  it('is offered to someone new, and to someone part-way through learning', () => {
    expect(offerFirstSail({ races: [] }, none)).toBe(true);
    expect(offerFirstSail({ races: [ran(7), ran(null, 8, 'dnf')] }, { ...none, lab: { [FIRST[0].id]: { won: true, tries: 1, at: NOW } } })).toBe(true);
    // A star or two in the Start Trainer is still a beginner having a go.
    expect(offerFirstSail({ races: [] }, { ...none, drills: { a: { best: 1, stars: 2, tries: 3, at: NOW } } })).toBe(true);
  });
  it('stops once they have shown they can sail', () => {
    expect(offerFirstSail({ races: [ran(8), ran(8), ran(8)] }, none)).toBe(false);
    expect(offerFirstSail({ races: [ran(4)] }, none)).toBe(false);
    expect(offerFirstSail({ races: [] }, { ...none, drills: { a: { best: 1, stars: 2, tries: 3, at: NOW }, b: { best: 1, stars: 1, tries: 1, at: NOW } } })).toBe(false);
    expect(offerFirstSail({ races: [] }, { ...none, lessons: { 'm/s': { answered: true, correct: true, played: true, at: NOW } } })).toBe(false);
    expect(offerFirstSail({ races: [] }, { ...none, lab: { 'some-scenario': { won: true, tries: 2, at: NOW } } })).toBe(false);
    expect(offerFirstSail({ races: [] }, { ...none, lab: Object.fromEntries(FIRST.map(m => [m.id, { won: true, tries: 1, at: NOW }])) })).toBe(false);
  });
  it('stays away once dismissed, on every device', () => {
    const gone: TrainingProgress = { ...none, dismissed: { 'first-sail': NOW }, updatedAt: 5 };
    expect(offerFirstSail({ races: [] }, gone)).toBe(false);
    expect(offerFirstSail({ races: [] }, mergeTraining(none, gone))).toBe(false);
    expect(offerFirstSail({ races: [] }, mergeTraining(gone, { ...none, updatedAt: 9 }))).toBe(false);
  });
});
