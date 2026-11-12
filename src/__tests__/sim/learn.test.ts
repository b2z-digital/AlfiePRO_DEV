// New to RC sailing: the learn-to-sail path instead of placement races; and starting again.
import { describe, expect, it } from 'vitest';
import { learnPath, FIRST_DRILLS } from '@/components/race-simulator/learn';
import { nextUp } from '@/components/race-simulator/nextup';
import { levelLicence, weekPlan } from '@/components/race-simulator/programme';
import { mergeTraining, type TrainingProgress } from '@/components/race-simulator/progress';
import { standing } from '@/components/race-simulator/rating';
import { newCareer } from '@/components/race-simulator/career';
import { FIRST, MODULES } from '@/sim/training';
import type { Profile } from '@/components/race-simulator/profile';
import type { RaceSummary } from '@/components/race-simulator/stats';

const NOW = new Date(2026, 10, 12, 15).getTime();
const none: TrainingProgress = { drills: {}, lessons: {}, lab: {}, updatedAt: 0 };
const race = (at: number, place = 4): RaceSummary => ({ at, mode: 'race', level: 'club', of: 6, fleet: 6, place, status: 'finished', incidents: [], penalties: 0 } as unknown as RaceSummary);
const won = (ids: string[], at = NOW - 1000) => Object.fromEntries(ids.map(id => [id, { won: true, tries: 1, at }]));
const right = MODULES[0];
const correct = (at = NOW - 1000) => Object.fromEntries(right.situations.map(s => [`${right.id}/${s.id}`, { answered: true, correct: true, played: false, at }]));
const starred = (at = NOW - 1000) => Object.fromEntries(FIRST_DRILLS.map(id => [id, { best: 1, stars: 1, tries: 1, at }]));
const up = (profile: Profile, training: TrainingProgress) => {
  const st = standing(profile, !!training.newcomer);
  return nextUp({ profile, training, standing: st, week: weekPlan(profile, training, NOW, st), licence: levelLicence(st.level, profile, training), next: null, challenges: [], now: NOW });
};

describe('Learning to sail', () => {
  const t0: TrainingProgress = { ...none, newcomer: NOW - 5000 };

  it('four stages in order: the boat, the rules, the starts, a first race', () => {
    const p = learnPath({ races: [] }, t0, t0.newcomer);
    expect(p.stages.map(s => s.id)).toEqual(['boat', 'rules', 'starts', 'race']);
    expect(p.stages.map(s => s.steps.length)).toEqual([FIRST.length, right.situations.length, 2, 1]);
    expect(p.next).toMatchObject({ stage: 'boat', title: FIRST[0].title, link: { kind: 'lab', id: FIRST[0].id } });
    expect(p).toMatchObject({ stage: 0, done: false, progress: { done: 0, of: FIRST.length + right.situations.length + 3 } });
  });

  it('moves through the stages as each is done; a race only counts from when they said they were new', () => {
    let t: TrainingProgress = { ...t0, lab: won(FIRST.map(m => m.id)) };
    expect(learnPath({ races: [] }, t, t.newcomer).next).toMatchObject({ stage: 'rules', link: { kind: 'lesson', id: `${right.id}/${right.situations[0].id}` } });
    t = { ...t, lessons: correct() };
    expect(learnPath({ races: [] }, t, t.newcomer).next).toMatchObject({ stage: 'starts', link: { kind: 'drill', id: 'hold-spot' } });
    t = { ...t, drills: starred() };
    const before = learnPath({ races: [race(NOW - 99999)] }, t, t.newcomer);
    expect(before.next).toMatchObject({ stage: 'race', title: 'Your first race' });
    expect(before.next!.link).toBeUndefined();
    const after = learnPath({ races: [race(NOW - 100)] }, t, t.newcomer);
    expect(after).toMatchObject({ done: true, next: null });
  });

  it('no placement races: their level is known (Club), and the path comes first in Next up', () => {
    expect(standing({ races: [] }).placed).toBe(false);
    expect(standing({ races: [] }, true)).toMatchObject({ placed: true, level: 'club' });
    expect(up({ races: [] }, t0)).toMatchObject({ kind: 'learn', step: { stage: 'boat' } });
    // Not said: the old way (learn to sail offered, then placement).
    expect(up({ races: [] }, none).kind).toBe('first-sail');
    // The path done: on to the programme, still without placement races.
    const done: TrainingProgress = { ...t0, lab: won(FIRST.map(m => m.id)), lessons: correct(), drills: starred() };
    expect(up({ races: [race(NOW - 100)] }, done).kind).not.toMatch(/learn|placement/);
  });
});

describe('Starting again', () => {
  const old: TrainingProgress = { ...none, newcomer: 100, way: { mode: 'full', at: 100 }, lab: won(['first-steer'], 100), drills: starred(100), lessons: correct(100),
    judge: { a: { points: 2, at: 100 } }, dismissed: { 'first-sail': 100 }, career: { ...newCareer('IOM', 100) }, yard: { yachts: [], racing: {}, at: 100 }, updatedAt: 100 };

  it("leaves behind everything older than the reset, whichever side it comes from", () => {
    const fresh: TrainingProgress = { ...none, resetAt: 500, updatedAt: 500 };
    for (const m of [mergeTraining(fresh, old), mergeTraining(old, fresh)]) {
      expect(m.resetAt).toBe(500);
      expect(m.drills).toEqual({}); expect(m.lessons).toEqual({}); expect(m.lab).toEqual({});
      expect(m.judge ?? {}).toEqual({});
      expect(m.dismissed ?? {}).toEqual({});
      expect(m.way).toBeUndefined(); expect(m.career).toBeUndefined(); expect(m.newcomer).toBeUndefined(); expect(m.yard).toBeUndefined();
    }
  });

  it('keeps what happened after it', () => {
    const fresh: TrainingProgress = { ...none, resetAt: 500, way: { mode: 'simple', at: 600 }, newcomer: 600, lab: won(['first-steer'], 700), yard: { yachts: [], racing: {}, at: 500 }, updatedAt: 700 };
    const m = mergeTraining(old, fresh);
    expect(m).toMatchObject({ resetAt: 500, way: { mode: 'simple', at: 600 }, newcomer: 600, lab: { 'first-steer': { at: 700 } }, yard: { at: 500 } });
    expect(m.drills).toEqual({});
  });

  it('without a reset, merging is as it was', () => {
    const m = mergeTraining(old, { ...none, lab: won(['first-trim'], 200) });
    expect(Object.keys(m.lab).sort()).toEqual(['first-steer', 'first-trim']);
    expect(m.resetAt).toBeUndefined();
    expect(m.newcomer).toBe(100);
  });
});
