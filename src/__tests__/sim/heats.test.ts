// Heat racing on the Circuit: the Nationals under HMS and the Worlds under SHRS, run by AlfiePRO's
// own heat systems and scored by its results engine.
import { describe, expect, it } from 'vitest';
import { CAST, ME, NATIONAL_SEASON, WORLD_SEASON, careerRace, dayHeats, dayStandings, dayState, eventAt, finishDay, heatNow, moveUp, myStrength, newCareer, prepareRace, recordRace, simulateRest, type Career, type RowResult } from '@/components/race-simulator/career';
import { heatState, replay } from '@/components/race-simulator/heats';
import { Race } from '@/sim/engine';
import type { RaceSettings } from '@/sim/types';

const NOW = Date.UTC(2026, 10, 12);
const me = { name: 'Sam S', sail: '39' };
const base: RaceSettings = { classId: 'IOM', fleetSize: 6, level: 'club', windStrength: 'medium', windCharacter: 'steady', laps: 1, length: 'short', sequenceSeconds: 30, coach: 'off', autoTrim: true, seed: 1, player: me, tune: 2 };

/** A career in the given tier, at its Championship (the regattas before it done). */
function atChampionship(tier: 'national' | 'world'): Career {
  let c: Career = { ...newCareer('IOM', NOW), ticket: tier };
  c = moveUp(c, NOW);
  const season = tier === 'national' ? NATIONAL_SEASON : WORLD_SEASON;
  return { ...c, done: season.slice(0, -1).map((_, k) => ({ event: k, order: [ME, ...c.fleet.slice(0, 15)], rank: 1, net: 8, at: NOW })) };
}
/** Your heat's result with you in `place` (the others in their order). */
const heatRows = (c: Career, place: number): RowResult[] => {
  const others = heatNow(c)!.ids.filter(id => id !== ME);
  const out: RowResult[] = others.map((id, k) => ({ id, place: k + 1 + (k + 1 >= place ? 1 : 0), code: null }));
  return [{ id: ME, place, code: null }, ...out];
};
/** Sail three rounds a day in `place`, simulate the rest of each day, to the end of the event. */
function sailEvent(c0: Career, place: number): Career {
  let c = c0;
  for (let guard = 0; guard < 400 && !dayState(c).complete; guard++) {
    const st = dayState(c);
    if (st.canSimulate) { c = simulateRest(c, NOW); continue; }
    c = prepareRace(c, NOW);
    c = recordRace(c, heatRows(c, place), NOW);
  }
  return c;
}

describe('The cast for the National and World seasons', () => {
  it('is big enough, and every sail number is its own', () => {
    expect(new Set(CAST.map(m => m.sail)).size).toBe(CAST.length);
    expect(CAST.every(m => /^\d{2}$/.test(m.sail) && m.sail !== '01')).toBe(true);
    const nat = moveUp({ ...newCareer('IOM', NOW), ticket: 'national' }, NOW), world = moveUp({ ...newCareer('IOM', NOW), ticket: 'world' }, NOW);
    expect(nat.fleet.length).toBe(31);
    expect(world.fleet.length).toBe(47);
    expect(new Set(world.fleet).size).toBe(47);
    // The Worlds are mostly the world's and the nations' best.
    expect(world.fleet.filter(id => ['world', 'national'].includes(CAST.find(m => m.id === id)!.level)).length).toBeGreaterThanOrEqual(35);
  });
});

describe('The Nationals, under HMS', () => {
  it('opens with 32 boats seeded into three heats; the heats below yours are sailed first', () => {
    const c = prepareRace(atChampionship('national'), NOW);
    expect(eventAt(c).event.name).toBe('Australian Championship');
    const log = c.day!.heat!;
    expect(log.ids.length).toBe(32);
    expect(new Set(log.ids).size).toBe(32);
    const hn = heatNow(c)!;
    expect(hn.ids).toContain(ME);
    expect(hn.round).toBe(1);
    // Your heat is next: every heat sailed so far is below it (lowest first).
    for (const s of log.sails) expect(s.h > hn.heat!).toBe(true);
    const s = careerRace(c, base);
    expect(s.fleetSize).toBe(hn.ids.length);
    expect(s.fleetSize).toBeLessThanOrEqual(16);
    expect(s.cast!.every(x => x.id && hn.ids.includes(x.id))).toBe(true);
    expect(s).toMatchObject({ venue: 'paradise', level: 'national' });
    const race = new Race(s);
    expect(race.boats.length).toBe(hn.ids.length);
  });

  it("finish in the top four of a lower heat and you're promoted to sail the heat above in the same round", () => {
    // Round 1 seeds; promotion starts in round 2. Sail round 1 mid-fleet, then win your heat in round 2.
    let c = prepareRace(atChampionship('national'), NOW);
    c = recordRace(c, heatRows(c, 6), NOW);
    c = prepareRace(c, NOW);
    let hn = heatNow(c)!;
    expect(hn.round).toBe(2);
    // (If you're in the top heat already, the bottom of it is relegated instead: find a round where you're below A.)
    let guard = 0;
    while (hn.heat === 'A' && guard++ < 10) { c = prepareRace(recordRace(c, heatRows(c, heatNow(c)!.ids.length), NOW), NOW); hn = heatNow(c)!; }
    expect(hn.heat).not.toBe('A');
    const before = hn;
    c = recordRace(c, heatRows(c, 1), NOW);
    const after = heatNow(c)!;
    expect(after.round).toBe(before.round);
    expect(after.heat! < before.heat!).toBe(true);
    expect(after.ids).toContain(ME);
    // The heat you've been promoted into is bigger by the four who came up.
    const st = heatState(eventAt(c).event.heat!, c.day!.heat!);
    expect(st.assignments.find(a => a.heatDesignation === after.heat)!.skipperIndices.length).toBeGreaterThan(before.ids.length - 4);
  });

  it('three days: sail three rounds a day, simulate the rest; scored by AlfiePRO with a title for the winner', () => {
    const t0 = Date.now();
    const c = sailEvent(atChampionship('national'), 1);
    const st = dayState(c);
    expect(st).toMatchObject({ complete: true, raced: 18, days: 3 });
    expect(st.sailed).toBeGreaterThanOrEqual(9);
    const rows = dayStandings(c, me);
    expect(rows.length).toBe(32);
    expect(rows[0].scores.length).toBe(18);
    // Sixteen races or more: three drops.
    expect(rows[0].scores.filter(s => s.dropped).length).toBe(3);
    const heats = dayHeats(c, me)!;
    expect(heats[ME].length).toBe(18);
    expect(new Set(Object.values(heats).flat())).toEqual(new Set(['A', 'B', 'C']));
    const fin = finishDay(c, me, NOW)!;
    expect(fin.result.rank).toBeLessThanOrEqual(rows.length);
    // Winning every heat you sail at the Nationals: on the podium, and top five takes you to the Worlds.
    expect(fin.result.rank).toBeLessThanOrEqual(5);
    expect(fin.career.ticket).toBe('world');
    if (fin.medal?.kind === 'gold') expect(fin.medal).toMatchObject({ trophy: true, event: 'Australian Championship' });
    expect(Date.now() - t0).toBeLessThan(20000);
  }, 60000);

  it('your strength follows how you sail: win heats and the simulated rounds put you near the front', () => {
    const c = prepareRace(atChampionship('national'), NOW);
    const win = recordRace(c, heatRows(c, 1), NOW), lose = recordRace(c, heatRows(c, heatNow(c)!.ids.length), NOW);
    expect(myStrength(win)).toBeGreaterThan(myStrength(lose));
  });
});

describe('The Worlds, under SHRS', () => {
  it('48 boats in four heats of twelve; twelve rounds of qualifying, then finals in four fleets that stay together', () => {
    const c = sailEvent(atChampionship('world'), 2);
    const ev = eventAt(c).event;
    expect(ev).toMatchObject({ name: 'World Championship', heat: { system: 'shrs', heats: 4, qualifying: 12 } });
    const hm = replay(ev.heat!, c.day!.heat!);
    expect(hm.rounds.filter(r => r.completed).length).toBe(24);
    const sizes = (r: number) => hm.rounds.find(x => x.round === r)!.heatAssignments.map(a => a.skipperIndices.length);
    expect(sizes(1)).toEqual([12, 12, 12, 12]);
    expect(sizes(13)).toEqual([12, 12, 12, 12]);
    // In the finals, the fleets don't change from round to round.
    const fleets = (r: number) => hm.rounds.find(x => x.round === r)!.heatAssignments.map(a => [...a.skipperIndices].sort((p, q) => p - q).join(','));
    expect(fleets(20)).toEqual(fleets(13));
    const rows = dayStandings(c, me);
    expect(rows.length).toBe(48);
    // The final order is by fleet: the top twelve all sailed the finals in Gold.
    const heats = dayHeats(c, me)!;
    for (const r of rows.slice(0, 12)) expect(heats[r.userId][23]).toBe('A');
    for (const r of rows.slice(36)) expect(heats[r.userId][23]).toBe('D');
    expect(finishDay(c, me, NOW)!.career.ticket ?? 'world').toBe('world');
  }, 120000);
});
