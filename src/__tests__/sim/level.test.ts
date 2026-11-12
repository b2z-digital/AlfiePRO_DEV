// Skipper rating and level, the training programme by level, and "Next up".
import { describe, expect, it } from 'vitest';
import { FLEET_RATING, LEVEL_NAME, START_RATING, cleanSailing, expected, levelOf, standing } from '@/components/race-simulator/rating';
import { SYLLABUS, levelLicence, weekPlan, weekStart, weakest } from '@/components/race-simulator/programme';
import { nextUp } from '@/components/race-simulator/nextup';
import { newCareer, recordRace } from '@/components/race-simulator/career';
import { mergeTraining } from '@/components/race-simulator/progress';
import { DRILLS, FIRST, LAB, MODULES } from '@/sim/training';
import { CAUSES, type Cause, type Ledger } from '@/components/race-simulator/ledger';
import type { Profile } from '@/components/race-simulator/profile';
import type { TrainingProgress } from '@/components/race-simulator/progress';
import type { RaceSummary } from '@/components/race-simulator/stats';
import type { Challenge } from '@/components/race-simulator/challenges';

const NOW = new Date(2026, 10, 12, 12).getTime(); // a Thursday
const DAY = 86400000;
const led = (by: Partial<Record<Cause, number>>): Ledger => ({ total: 0, parts: CAUSES.map(c => ({ cause: c, lengths: by[c] ?? 0 })), worst: [], speedUp: 0, tacks: 0, tacksMade: 0, gybesMade: 0, marks: 3, minutes: 5 });
let clock = NOW - 60 * DAY;
const race = (level: string, place: number | null, of = 10, o: Partial<RaceSummary> = {}): RaceSummary =>
  ({ at: (clock += 3600000), mode: 'race', level, of, fleet: of, place, status: place ? 'finished' : 'dnf', incidents: [], penalties: 0, ...o } as RaceSummary);
const none: TrainingProgress = { drills: {}, lessons: {}, lab: {}, updatedAt: 0 };
const prof = (...rs: RaceSummary[]): Profile => ({ races: [...rs].reverse() });

describe('Skipper rating', () => {
  it('starts everyone in the same place, at Club level, not yet placed', () => {
    const s = standing({ races: [] });
    expect(s).toMatchObject({ rating: START_RATING, races: 0, placed: false, level: 'club', last: null });
    expect(s.next).toEqual({ level: 'state', at: 1100, gap: 100 });
    expect(LEVEL_NAME.state).toBe('Regional');
  });

  it('goes up for beating more of a fleet than expected, and down for fewer', () => {
    expect(expected(1200, 1200)).toBeCloseTo(0.5);
    const mid = standing(prof(race('state', 5), race('state', 5), race('state', 6)));
    const win = standing(prof(race('state', 1), race('state', 1), race('state', 1)));
    const last = standing(prof(race('club', 10), race('club', 10), race('club', 10)));
    expect(win.rating).toBeGreaterThan(mid.rating);
    expect(mid.rating).toBeGreaterThan(last.rating);
    expect(last.rating).toBeLessThan(START_RATING);
    expect(win.placed).toBe(true);
  });

  it('settles near the fleet you sail level with', () => {
    // Mid-fleet against National skippers, race after race.
    const s = standing(prof(...Array.from({ length: 40 }, (_, i) => race('national', i % 2 ? 5 : 6))));
    expect(Math.abs(s.rating - FLEET_RATING.national)).toBeLessThan(60);
    expect(s.level).toBe('national');
    expect(levelOf(1099)).toBe('club');
    expect(levelOf(1700)).toBe('world');
  });

  it('moves fast for the first five races, then steadily; and both ways', () => {
    const rs = Array.from({ length: 8 }, () => race('world', 1));
    const s = standing(prof(...rs));
    const steps = s.series.map((p, i) => p.rating - (i ? s.series[i - 1].rating : START_RATING));
    expect(steps[0]).toBeGreaterThan(150);
    expect(steps[6]).toBeLessThan(40);
    const down = standing(prof(...rs, race('club', 10)));
    expect(down.last).toBeLessThan(0);
    expect(down.rating).toBeLessThan(s.rating);
  });

  it("counts races against a fleet only: not start practice, not one abandoned, and a DNF beats nobody", () => {
    const start = { ...race('club', 1), mode: 'start' } as RaceSummary;
    const left = { ...race('club', null), status: 'racing' } as RaceSummary;
    expect(standing(prof(start, left)).races).toBe(0);
    expect(standing(prof(race('club', null))).rating).toBeLessThan(START_RATING);
  });

  it('clean sailing: your fouls a race over the newest ten', () => {
    expect(cleanSailing({ races: [] })).toBeNull();
    const foul = { t: 1, rule: '10', title: '', mine: true, victim: false, text: '', next: '' };
    const rs = [race('club', 3, 10, { incidents: [foul, foul, { ...foul, mine: false }] }), race('club', 3), race('club', 3), race('club', 3)];
    expect(cleanSailing(prof(...rs))).toEqual({ races: 4, fouls: 0.5 });
  });
});

describe('The programme', () => {
  const allStars = (n: number): TrainingProgress['drills'] => Object.fromEntries(DRILLS.map(d => [d.id, { best: 1, stars: n, tries: 1, at: NOW - 30 * DAY }]));

  it('a syllabus for each level, with a bar that rises', () => {
    expect([SYLLABUS.club.stars, SYLLABUS.state.stars, SYLLABUS.national.stars, SYLLABUS.world.stars]).toEqual([1, 2, 3, 3]);
    expect(SYLLABUS.world.licence).toBeNull();
  });

  it('the licence to the next level: what you have, what it takes', () => {
    const lic = levelLicence('club', { races: [] }, none)!;
    expect(lic.to).toBe('state');
    expect(lic.reqs.map(r => r.id)).toEqual(['rules', 'starts', 'clean']);
    expect(lic.ready).toBe(false);
    const lessons = Object.fromEntries(MODULES.slice(0, 2).flatMap(m => m.situations.map(s => [`${m.id}/${s.id}`, { answered: true, correct: true, played: false, at: 1 }])));
    const done = levelLicence('club', prof(race('club', 2), race('club', 3), race('club', 4)), { ...none, lessons, drills: allStars(1) })!;
    expect(done.reqs.map(r => r.met)).toEqual([true, true, true]);
    expect(done.ready).toBe(true);
    expect(levelLicence('state', { races: [] }, none)!.reqs.map(r => r.id)).toContain('scenarios');
    expect(levelLicence('world', { races: [] }, none)).toBeNull();
  });

  it('a newcomer gets three different sessions, starting with the start', () => {
    const w = weekPlan({ races: [] }, none, NOW, { level: 'club' });
    expect(w.sessions.length).toBe(3);
    expect(w.sessions[0].cause).toBe('start');
    expect(new Set(w.sessions.map(s => `${s.link.kind}:${s.link.id}`)).size).toBe(3);
    expect(w).toMatchObject({ weakest: null, bar: 1, done: 0 });
    expect(w.sessions.every(s => s.play.title.length > 0)).toBe(true);
  });

  it('two sessions on where the lengths go, and one to keep something passed', () => {
    const profile: Profile = { races: [{ ...race('club', 4), ledger: led({ roundings: 9, start: 2 }) }, { ...race('club', 5), ledger: led({ roundings: 7, air: 3 }) }] };
    expect(weakest(profile)).toBe('roundings');
    const w = weekPlan(profile, { ...none, drills: allStars(1) }, NOW, { level: 'club' });
    expect(w.sessions.slice(0, 2).every(s => s.cause === 'roundings' && s.kind === 'work')).toBe(true);
    expect(w.sessions[0].why).toBe('Mark roundings is where you give away most: about 8.0 lengths a race.');
    expect(w.sessions[2].kind).toBe('keep');
  });

  it('the bar rises with the level, and what you did this week stays on the list, ticked', () => {
    // One star on everything passes at Club; at Regional the same drills are still to do.
    const club = weekPlan({ races: [] }, { ...none, drills: allStars(1) }, NOW, { level: 'club' });
    const regional = weekPlan({ races: [] }, { ...none, drills: allStars(1) }, NOW, { level: 'state' });
    expect(regional.bar).toBe(2);
    expect(regional.sessions.filter(s => s.kind === 'work' && s.link.kind === 'drill').length).toBeGreaterThan(club.sessions.filter(s => s.kind === 'work' && s.link.kind === 'drill').length);
    const first = weekPlan({ races: [] }, none, NOW, { level: 'club' }).sessions[0];
    const did: TrainingProgress = first.link.kind === 'drill'
      ? { ...none, drills: { [first.link.id]: { best: 1, stars: 1, tries: 1, at: NOW - 3600000 } } }
      : { ...none, lab: { [first.link.id]: { won: true, tries: 1, at: NOW - 3600000 } } };
    const after = weekPlan({ races: [] }, did, NOW, { level: 'club' });
    expect(after.sessions.find(s => s.link.id === first.link.id)).toMatchObject({ done: true });
    expect(after.done).toBe(1);
    // Next Monday it's a new list.
    expect(weekPlan({ races: [] }, did, weekStart(NOW) + 7 * DAY + 1, { level: 'club' }).done).toBe(0);
    expect(new Date(weekStart(NOW)).getDay()).toBe(1);
  });
});

describe('Next up', () => {
  const sailor: TrainingProgress = { ...none, lab: Object.fromEntries(FIRST.map(m => [m.id, { won: true, tries: 1, at: 1 }])) };
  const three = prof(race('club', 4), race('club', 5), race('club', 3));
  const args = (profile: Profile, training: TrainingProgress, o: Partial<Parameters<typeof nextUp>[0]> = {}) => {
    const st = standing(profile);
    return { profile, training, standing: st, week: weekPlan(profile, training, NOW, st), licence: levelLicence(st.level, profile, training), next: null, challenges: [], now: NOW, ...o };
  };
  const day = { id: 'r', name: 'Pointscore 4', date: '2026-11-14', days: 2, startTime: null, venue: '', className: 'IOM', classId: 'IOM' as const, wind: null };

  it('a newcomer learns to sail first; then three races to be placed', () => {
    expect(nextUp(args({ races: [] }, none)).kind).toBe('first-sail');
    expect(nextUp(args({ races: [] }, sailor))).toEqual({ kind: 'placement', sailed: 0, of: 3 });
    expect(nextUp(args(prof(race('club', 4)), sailor, { next: day }))).toMatchObject({ kind: 'placement', sailed: 1 });
  });

  it("then the club's race day when it's near, a licence one short, a challenge closing, the week's session", () => {
    expect(nextUp(args(three, sailor, { next: day })).kind).toBe('rehearse');
    expect(nextUp(args(three, sailor, { next: { ...day, days: 9 } })).kind).toBe('session');
    const ch = (o: Partial<Challenge>): Challenge => ({ id: 'c1', club_id: 'club', title: 'Friday dash', description: null, settings: {} as Challenge['settings'], opens_at: new Date(NOW - DAY).toISOString(), closes_at: new Date(NOW + DAY).toISOString(), created_at: '', ...o });
    expect(nextUp(args(three, sailor, { challenges: [ch({})] }))).toMatchObject({ kind: 'challenge', hours: 24 });
    expect(nextUp(args(three, sailor, { challenges: [ch({})], sailed: new Set(['c1']) })).kind).toBe('session');
    expect(nextUp(args(three, sailor, { challenges: [ch({ closes_at: new Date(NOW + 5 * DAY).toISOString() })] })).kind).toBe('session');
    // Rules and clean sailing met, the stars not: one requirement short.
    const lessons = Object.fromEntries(MODULES.slice(0, 2).flatMap(m => m.situations.map(s => [`${m.id}/${s.id}`, { answered: true, correct: true, played: false, at: 1 }])));
    expect(nextUp(args(three, { ...sailor, lessons }))).toMatchObject({ kind: 'licence', to: 'state', req: { id: 'starts' } });
  });

  it('the Circuit: a race day under way comes first; the next one is offered once you have trained this week', () => {
    const fresh = newCareer('IOM', NOW);
    // Out of sight in the simple way of using it (no career passed).
    expect(nextUp(args(three, sailor)).kind).toBe('session');
    // Not trained yet this week: the session first.
    expect(nextUp(args(three, sailor, { career: null })).kind).toBe('session');
    const first = weekPlan(three, sailor, NOW, { level: 'club' }).sessions[0];
    const trained: TrainingProgress = first.link.kind === 'drill'
      ? { ...sailor, drills: { [first.link.id]: { best: 1, stars: 1, tries: 1, at: NOW - 3600000 } } }
      : { ...sailor, lab: { ...sailor.lab, [first.link.id]: { won: true, tries: 1, at: NOW - 3600000 } } };
    expect(nextUp(args(three, trained, { career: null }))).toEqual({ kind: 'career-next', event: 'Pointscore 1', season: 1, started: false });
    expect(nextUp(args(three, trained, { career: fresh }))).toMatchObject({ kind: 'career-next', started: true });
    const row = [{ id: 'me', place: 1, code: null }, ...fresh.fleet.map((id, k) => ({ id, place: k + 2, code: null }))];
    const under = recordRace(fresh, row, NOW);
    expect(nextUp(args(three, sailor, { career: under, next: day }))).toEqual({ kind: 'career-day', event: 'Pointscore 1', race: 2, of: 6, canSimulate: false });
  });

  it("with the week's sessions done, a race", () => {
    const all: TrainingProgress = { ...sailor, drills: Object.fromEntries(DRILLS.map(d => [d.id, { best: 1, stars: 3, tries: 1, at: NOW - 3600000 }])), lab: { ...sailor.lab, ...Object.fromEntries(LAB.map(m => [m.id, { won: true, tries: 1, at: NOW - 3600000 }])) } };
    const a = args(three, all);
    expect(a.week.sessions.every(s => s.done)).toBe(true);
    expect(nextUp({ ...a, licence: null }).kind).toBe('race');
  });
});

describe('How you use the Academy', () => {
  it('the choice made last wins, on every device', () => {
    const a: TrainingProgress = { ...none, way: { mode: 'simple', at: 10 } }, b: TrainingProgress = { ...none, way: { mode: 'full', at: 20 } };
    expect(mergeTraining(a, b).way).toEqual({ mode: 'full', at: 20 });
    expect(mergeTraining(b, a).way).toEqual({ mode: 'full', at: 20 });
    expect(mergeTraining(none, none).way).toBeUndefined();
  });
});
