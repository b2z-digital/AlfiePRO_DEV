// The Circuit's club season: the cast, race days, simulating the rest, scoring and medals.
import { describe, expect, it } from 'vitest';
import { CAST, CLUB_SEASON, FLEET, ME, careerRace, dayStandings, dayState, eventAt, finishDay, fleetOf, medalCount, newCareer, newerCareer, recordRace, rival, seasonStandings, simulateRest, type Career, type RowResult } from '@/components/race-simulator/career';
import { mergeTraining, type TrainingProgress } from '@/components/race-simulator/progress';
import { Race } from '@/sim/engine';
import type { RaceSettings } from '@/sim/types';

const NOW = Date.UTC(2026, 10, 12);
const me = { name: 'Sam S', sail: '39' };
const base: RaceSettings = { classId: 'IOM', fleetSize: 6, level: 'national', windStrength: 'fresh', windCharacter: 'steady', laps: 1, length: 'short', sequenceSeconds: 30, coach: 'off', autoTrim: true, seed: 1, player: me };
/** A race with you in `place` and the cast in their season order around you. */
const rows = (career: Career, place: number | null, code: RowResult['code'] = null): RowResult[] => {
  const others = [...career.fleet];
  const out: RowResult[] = others.map((id, k) => ({ id, place: k + 1 + (place !== null && k + 1 >= place ? 1 : 0), code: null }));
  return [{ id: ME, place, code }, ...out];
};
/** Sail three races in these places, simulate the rest, and close the day. */
const day = (career: Career, places: number[], at = NOW) => {
  let c = career;
  for (const p of places) c = recordRace(c, rows(c, p), at);
  return finishDay(simulateRest(c, at), me, at)!;
};

describe('The cast', () => {
  it('is invented skippers with their own numbers, colours and countries', () => {
    expect(new Set(CAST.map(m => m.id)).size).toBe(CAST.length);
    expect(new Set(CAST.map(m => m.sail)).size).toBe(CAST.length);
    expect(CAST.every(m => /^\d{2}$/.test(m.sail) && m.sail !== '01' && /^[A-Z]{3}$/.test(m.country) && /^#[0-9A-F]{6}$/i.test(m.hull))).toBe(true);
    expect(new Set(CAST.map(m => m.country)).size).toBeGreaterThan(6);
  });

  it('sails the race under their own names and numbers, and yours stays yours', () => {
    const career = newCareer('IOM', NOW);
    const s = careerRace(career, base);
    expect(s).toMatchObject({ fleetSize: FLEET, level: 'club', windStrength: CLUB_SEASON[0].wind, classId: 'IOM' });
    const race = new Race(s);
    expect(race.boats.length).toBe(FLEET);
    expect(race.boats[0]).toMatchObject({ isPlayer: true, sail: '39', name: 'Sam S' });
    const cast = fleetOf(career);
    expect(race.boats.slice(1).map(b => b.name)).toEqual(cast.map(m => m.name));
    expect(race.boats.slice(1).map(b => b.sail)).toEqual(cast.map(m => m.sail));
    expect(race.boats.slice(1).map(b => b.color)).toEqual(cast.map(m => m.hull));
    expect(new Set(race.boats.map(b => b.sail)).size).toBe(FLEET);
    // Each race of the day is its own race; the same race is always the same.
    expect(careerRace(recordRace(career, rows(career, 1), NOW), base).seed).not.toBe(s.seed);
    expect(careerRace(career, base).seed).toBe(s.seed);
  });

  it('a skipper with your number carries a 1 in front of hers', () => {
    const career = newCareer('IOM', NOW);
    const clash = fleetOf(career)[2];
    const race = new Race(careerRace(career, { ...base, player: { name: 'Sam S', sail: clash.sail } }));
    expect(race.boats[0].sail).toBe(clash.sail);
    expect(race.boats[3].sail).toBe(`1${clash.sail}`);
  });
});

describe('A race day', () => {
  it('sail at least three, then the rest can be simulated', () => {
    let c = newCareer('IOM', NOW);
    expect(dayState(c)).toMatchObject({ sailed: 0, raced: 0, left: 6, canSimulate: false, complete: false });
    c = recordRace(recordRace(c, rows(c, 2), NOW), rows(c, 4), NOW);
    expect(dayState(c).canSimulate).toBe(false);
    expect(simulateRest(c, NOW)).toBe(c);
    c = recordRace(c, rows(c, 3), NOW);
    expect(dayState(c)).toMatchObject({ sailed: 3, left: 3, canSimulate: true });
    const sim = simulateRest(c, NOW);
    expect(dayState(sim)).toMatchObject({ sailed: 3, raced: 6, left: 0, complete: true });
    expect(sim.day!.races.slice(3).every(r => !r.sailed && r.rows.length === FLEET && new Set(r.rows.map(x => x.place)).size === FLEET)).toBe(true);
    // The same day simulates the same way.
    expect(simulateRest(c, NOW + 5).day!.races).toEqual(sim.day!.races);
  });

  it('simulated races follow the ones you sailed: win yours and you stay near the front', () => {
    let front = newCareer('IOM', NOW), back = newCareer('IOM', NOW);
    for (let i = 0; i < 3; i++) { front = recordRace(front, rows(front, 1), NOW); back = recordRace(back, rows(back, 10), NOW); }
    const mine = (c: Career) => simulateRest(c, NOW).day!.races.slice(3).map(r => r.rows.find(x => x.id === ME)!.place!);
    const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(avg(mine(front))).toBeLessThan(4);
    expect(avg(mine(back))).toBeGreaterThan(7);
  });

  it("is scored by AlfiePRO's results engine: low point, a drop once four count, letter scores as fleet + 1", () => {
    let c = newCareer('IOM', NOW);
    for (const p of [1, 1, 1]) c = recordRace(c, rows(c, p), NOW);
    c = recordRace(c, rows(c, null, 'DSQ'), NOW);
    const t = dayStandings(c, me);
    expect(t.length).toBe(FLEET);
    const row = t.find(r => r.userId === ME)!;
    expect(row).toMatchObject({ name: 'Sam S', sail: '39', total: 3 + FLEET + 1, net: 3, rank: 1 });
    expect(row.scores[3]).toMatchObject({ code: 'DSQ', dropped: true });
    expect(t[1].name).toBe(fleetOf(c)[0].name);
  });

  it('a day stops at its number of races', () => {
    let c = newCareer('IOM', NOW);
    for (let i = 0; i < 8; i++) c = recordRace(c, rows(c, 2), NOW);
    expect(c.day!.races.length).toBe(6);
    expect(finishDay(newCareer('IOM', NOW), me, NOW)).toBeNull();
  });
});

describe('The season', () => {
  it('a podium earns a medal; the day goes into the pointscore; the next event is next', () => {
    const c0 = newCareer('IOM', NOW);
    const d1 = day(c0, [1, 1, 1]);
    expect(d1.result).toMatchObject({ event: 0, rank: 1 });
    expect(d1.medal).toMatchObject({ kind: 'gold', event: 'Pointscore 1', season: 1 });
    expect(d1.career).toMatchObject({ day: null, season: 1 });
    expect(eventAt(d1.career).event.name).toBe('Pointscore 2');
    const d2 = day(d1.career, [10, 10, 10]);
    expect(d2.medal).toBeNull();
    expect(medalCount(d2.career.medals)).toEqual({ gold: 1, silver: 0, bronze: 0 });
    const ps = seasonStandings(d2.career, me);
    expect(ps.length).toBe(FLEET);
    expect(ps.find(r => r.userId === ME)!.total).toBe(d1.result.rank + d2.result.rank);
    const rv = rival(d2.career, me)!;
    expect(rv.skipper.name.length).toBeGreaterThan(0);
    expect(rival(c0, me)).toBeNull();
  });

  it('six race days, then the Championship: winning it is a title, and a new season begins', () => {
    let c = newCareer('IOM', NOW);
    for (let i = 0; i < 6; i++) c = day(c, [2, 1, 2]).career;
    expect(eventAt(c).event).toMatchObject({ kind: 'championship', races: 12 });
    const last = day(c, [1, 1, 1]);
    expect(last.medal).toMatchObject({ kind: 'gold', trophy: true, event: 'Club Championship' });
    expect(last.career).toMatchObject({ season: 2, done: [], day: null });
    expect(last.career.history).toEqual([{ season: 1, pointscore: expect.any(Number), championship: 1, of: FLEET }]);
    expect(last.career.medals.length).toBeGreaterThanOrEqual(1);
    expect(last.career.fleet.length).toBe(FLEET - 1);
  });

  it('follows you between devices: the season further on is kept', () => {
    const a = newCareer('IOM', NOW), b = day(a, [3, 3, 3], NOW + 10).career;
    expect(newerCareer(a, b)).toBe(b);
    expect(newerCareer(b, a)).toBe(b);
    expect(newerCareer(undefined, a)).toBe(a);
    const none: TrainingProgress = { drills: {}, lessons: {}, lab: {}, updatedAt: 0 };
    expect(mergeTraining({ ...none, career: a }, { ...none, career: b }).career).toBe(b);
  });
});
