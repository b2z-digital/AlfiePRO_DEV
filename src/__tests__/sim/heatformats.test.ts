// How Championships are sailed: the Regional in one fleet or in heats, the Nationals and Worlds under
// HMS or SHRS, as you choose; run by AlfiePRO's own heat systems. A Championship already under way
// keeps the format it opened with.
import { describe, expect, it } from 'vitest';
import {
  HEAT_DEFAULT, ME, NATIONAL_SEASON, REGIONAL_SEASON, WORLD_SEASON, dayHeats, dayStandings, dayState, eventAt, heatNow, heatPick, moveUp, newCareer, prepareRace, recordRace,
  seasonOf, setHeats, simulateRest, withHeats, type Career, type HeatChoice, type RowResult,
} from '@/components/race-simulator/career';
import { replay } from '@/components/race-simulator/heats';

const NOW = Date.UTC(2026, 10, 13);
const me = { name: 'Sam S', sail: '39' };

function atChampionship(tier: 'state' | 'national' | 'world', pick?: HeatChoice): Career {
  let c: Career = { ...newCareer('IOM', NOW), ticket: tier };
  c = moveUp(c, NOW);
  if (pick) c = setHeats(c, tier, pick, NOW);
  const season = tier === 'state' ? REGIONAL_SEASON : tier === 'national' ? NATIONAL_SEASON : WORLD_SEASON;
  return { ...c, done: season.slice(0, -1).map((_, k) => ({ event: k, order: [ME, ...c.fleet.slice(0, 15)], rank: 1, net: 8, at: NOW })) };
}
const heatRows = (c: Career, place: number): RowResult[] => {
  const others = heatNow(c)!.ids.filter(id => id !== ME);
  return [{ id: ME, place, code: null }, ...others.map((id, k) => ({ id, place: k + 1 + (k + 1 >= place ? 1 : 0), code: null }))];
};
function sailEvent(c0: Career, place: number): Career {
  let c = c0;
  for (let guard = 0; guard < 400 && !dayState(c).complete; guard++) {
    if (dayState(c).canSimulate) { c = simulateRest(c, NOW); continue; }
    c = prepareRace(c, NOW);
    c = recordRace(c, heatRows(c, place), NOW);
  }
  return c;
}

describe('How Championships are sailed', () => {
  it('defaults to the Circuit as it was: Regional one fleet, Nationals HMS, Worlds SHRS', () => {
    expect(HEAT_DEFAULT).toEqual({ state: 'fleet', national: 'hms', world: 'shrs' });
    expect(eventAt(atChampionship('state')).event.heat).toBeUndefined();
    expect(eventAt(atChampionship('national')).event.heat).toMatchObject({ system: 'hms', heats: 3 });
    expect(eventAt(atChampionship('world')).event.heat).toMatchObject({ system: 'shrs', heats: 4, qualifying: 12 });
  });

  it('only changes Championships, and never offers 32 or 48 boats in one fleet', () => {
    const c = setHeats(atChampionship('national'), 'national', 'fleet', NOW);
    expect(heatPick(c, 'national')).toBe('hms');
    const regatta = NATIONAL_SEASON[0];
    expect(withHeats(regatta, 'national', 'shrs')).toBe(regatta);
  });

  it('a Regional Championship in two heats under SHRS: qualifying, then finals', () => {
    const c = sailEvent(atChampionship('state', 'shrs'), 2);
    const ev = eventAt(c).event;
    expect(ev.heat).toMatchObject({ system: 'shrs', heats: 2, qualifying: 8 });
    const hm = replay(ev.heat!, c.day!.heat!);
    expect(hm.rounds.filter(r => r.completed).length).toBe(16);
    expect(hm.rounds.find(x => x.round === 1)!.heatAssignments.map(a => a.skipperIndices.length)).toEqual([8, 8]);
    expect(dayStandings(c, me).length).toBe(16);
  }, 60000);

  it('a Regional Championship in two heats under HMS', () => {
    const c = sailEvent(atChampionship('state', 'hms'), 1);
    expect(eventAt(c).event.heat).toMatchObject({ system: 'hms', heats: 2, promotion: 4 });
    expect(dayState(c)).toMatchObject({ complete: true, raced: 16 });
    expect(new Set(Object.values(dayHeats(c, me)!).flat())).toEqual(new Set(['A', 'B']));
  }, 60000);

  it('the Nationals under SHRS and the Worlds under HMS', () => {
    const n = sailEvent(atChampionship('national', 'shrs'), 3);
    expect(eventAt(n).event.heat).toMatchObject({ system: 'shrs', heats: 3, qualifying: 9 });
    expect(dayState(n)).toMatchObject({ complete: true, raced: 18 });
    expect(dayStandings(n, me).length).toBe(32);
    const w = sailEvent(atChampionship('world', 'hms'), 3);
    expect(eventAt(w).event.heat).toMatchObject({ system: 'hms', heats: 4 });
    expect(dayState(w)).toMatchObject({ complete: true, raced: 24 });
    expect(dayStandings(w, me).length).toBe(48);
  }, 120000);

  it('a Championship under way keeps its format when you change your mind', () => {
    let c = prepareRace(atChampionship('national'), NOW);
    c = recordRace(c, heatRows(c, 1), NOW);
    expect(c.day!.pick).toBe('hms');
    c = setHeats(c, 'national', 'shrs', NOW);
    expect(eventAt(c).event.heat!.system).toBe('hms');
    expect(heatPick(c, 'national')).toBe('shrs');
    expect(seasonOf({ ...c, day: null }).at(-1)!.heat!.system).toBe('shrs');
  });
});
