// A rival who remembers, and Alfie's report on each event of the Circuit.
import { describe, expect, it } from 'vitest';
import { ME, castOf, dayStandings, dayState, finishDay, keepReport, meet, newCareer, noteRace, pickRival, recordRace, rival, simulateRest, type Career, type RowResult } from '@/components/race-simulator/career';
import { regattaReport } from '@/components/race-simulator/report';

const NOW = Date.UTC(2026, 10, 12);
const me = { name: 'Sam S', sail: '39' };
/** A race with you in `place` and the cast in their season order around you. */
const rows = (c: Career, place: number | null): RowResult[] => [
  { id: ME, place, code: null },
  ...c.fleet.map((id, k) => ({ id, place: k + 1 + (place !== null && k + 1 >= place ? 1 : 0), code: null })),
];
/** Sail three races in these places (with a note on each), simulate the rest, and close the event with its report. */
const event = (career: Career, places: number[]) => {
  let c = career;
  for (const p of places) {
    c = recordRace(c, rows(c, p), NOW);
    c = noteRace(c, { place: p, of: 10, status: 'finished', late: 4, ocs: false, penalties: 0, parts: [{ cause: 'start', lengths: 5 }, { cause: 'speed', lengths: 2 }], speedUp: 1, tacks: 0 });
  }
  c = simulateRest(c, NOW);
  const table = dayStandings(c, me);
  const fin = finishDay(c, me, NOW)!;
  const report = regattaReport(c, fin.career, table, fin.result, fin.medal);
  return { before: c, fin, report, career: keepReport(fin.career, report) };
};

describe('A rival who remembers', () => {
  it('keeps a record against each of the cast: who finished ahead, and the last time', () => {
    const h = meet(undefined, ['a', ME, 'b'], 'Pointscore 1', 1);
    expect(h).toEqual({ a: { w: 0, l: 1, last: { event: 'Pointscore 1', season: 1, me: 2, them: 1 } }, b: { w: 1, l: 0, last: { event: 'Pointscore 1', season: 1, me: 2, them: 3 } } });
    const h2 = meet(h, [ME, 'a', 'b'], 'Pointscore 2', 1);
    expect(h2.a).toMatchObject({ w: 1, l: 1, last: { event: 'Pointscore 2', me: 1, them: 2 } });
    expect(meet(h2, ['a', 'b'], 'x', 1)).toEqual(h2);
  });

  it('chooses a rival from the history once there is one, and keeps them from event to event', () => {
    const c0 = newCareer('IOM', NOW);
    expect(pickRival(c0, me)).toBeNull();
    const one = event(c0, [2, 3, 2]).career;
    expect(one.rivalId).toBeTruthy();
    expect(one.fleet).toContain(one.rivalId);
    const rv = rival(one, me)!;
    expect(rv.skipper.id).toBe(one.rivalId);
    expect(rv.record).toMatchObject({ last: { event: 'Pointscore 1', season: 1 } });
    expect(rv.record!.w + rv.record!.l).toBe(1);
    // The rival stays while nobody else is clearly closer.
    const two = event(one, [2, 3, 2]).career;
    expect(two.rivalId).toBe(one.rivalId);
    expect(two.h2h![one.rivalId!].w + two.h2h![one.rivalId!].l).toBe(2);
  });

  it('remembers across seasons: the record carries on', () => {
    let c = newCareer('IOM', NOW);
    for (let k = 0; k < 7; k++) c = event(c, [3, 2, 4]).career;
    expect(c.season).toBe(2);
    const met = Object.values(c.h2h!).reduce((a, r) => a + r.w + r.l, 0);
    expect(met).toBe(7 * 9);
    const next = event(c, [3, 2, 4]).career;
    expect(Object.values(next.h2h!).reduce((a, r) => a + r.w + r.l, 0)).toBe(8 * 9);
  });
});

describe("Alfie's report", () => {
  it('says how it went, your races, where the lengths went, your rival and what is next', () => {
    const { report, fin } = event(newCareer('IOM', NOW), [1, 2, 1]);
    expect(report).toMatchObject({ season: 1, tier: 'club', event: 'Pointscore 1', rank: fin.result.rank, of: 10 });
    const text = report.paras.join(' ');
    expect(report.paras[0]).toMatch(/Pointscore 1/);
    expect(text).toMatch(/You sailed three of the six races: 1st, 2nd and 1st\. The other three were simulated from those\./);
    expect(text).toMatch(/Most of what you gave away was the start: about 5 lengths a race\./);
    expect(text).toMatch(/seconds after the gun on average/);
    expect(text).toMatch(/Clean racing: no penalties\./);
    expect(text).toMatch(/Your meetings stand/);
    expect(report.paras[report.paras.length - 1]).toBe('Next: Pointscore 2.');
    expect(report.work).toMatchObject({ cause: 'start', link: { kind: 'drill', id: 'time-distance' } });
    expect(report.paras.join(' ')).not.toMatch(/undefined|NaN/);
  });

  it('heads a win as a win and a Championship as a title, and keeps the last dozen reports', () => {
    let c = newCareer('IOM', NOW);
    let last = event(c, [1, 1, 1]);
    expect(last.report.headline).toBe('A win at Pointscore 1');
    c = last.career;
    for (let k = 0; k < 5; k++) c = event(c, [1, 1, 1]).career;
    last = event(c, [1, 1, 1]);
    expect(last.report.headline).toBe('Club Champion');
    expect(last.report.paras[last.report.paras.length - 1]).toMatch(/season done/);
    c = last.career;
    for (let k = 0; k < 8; k++) c = event(c, [5, 6, 5]).career;
    expect(c.reports!.length).toBe(12);
    // Seven events of season 2, then the first of season 3.
    expect(c.reports![0]).toMatchObject({ event: 'Pointscore 1', season: 3 });
  });

  it('works for a day sailed without notes, and names nobody it shouldn\'t', () => {
    let c = newCareer('IOM', NOW);
    for (const p of [4, 5, 6]) c = recordRace(c, rows(c, p), NOW);
    c = simulateRest(c, NOW);
    expect(dayState(c).complete).toBe(true);
    const table = dayStandings(c, me);
    const fin = finishDay(c, me, NOW)!;
    const r = regattaReport(c, fin.career, table, fin.result, fin.medal);
    expect(r.work).toBeUndefined();
    expect(r.paras.join(' ')).not.toMatch(/undefined|NaN|lengths a race/);
    for (const id of c.fleet) expect(castOf(id)).toBeTruthy();
  });
});
