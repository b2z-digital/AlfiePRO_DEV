/**
 * What sails next and each boat's handicap: the phone StartBox uses the same rules the desktop
 * scoring screens use (utils/raceProgress), checked against real anonymised rounds.
 */
import { describe, expect, it } from 'vitest';
import events from '../fixtures/real-events.json';
import type { Skipper } from '../../types';
import type { HeatManagement } from '../../types/heat';
import type { RaceEvent } from '../../types/race';
import { firstIncompleteHeat, handicapForRace, heatProgress, heatSailingOrder, nextRaceNumber, roundLabel } from '../../utils/raceProgress';
import { buildHeatSetup } from '../../utils/heatSetup';
import { handicapGroups, nextUp } from '../../mobile/raceSession';

const real = events as unknown as RaceEvent[];
const fleet = (n: number): Skipper[] => Array.from({ length: n }, (_, i) => ({ name: `Skipper ${i + 1}`, sailNo: String(i + 1), startHcap: 0 } as Skipper));

describe('handicap each boat sails on', () => {
  for (const e of real.filter(x => x.raceFormat === 'handicap')) {
    it(`${e.id}: equals the handicap the desktop recorded for every race`, () => {
      let checked = 0;
      for (const r of e.raceResults as any[]) {
        if (r.handicap === undefined || r.handicap === null || r.handicapOverride) continue;
        expect(handicapForRace(e.skippers, e.raceResults, r.race, r.skipperIndex)).toBe(r.handicap);
        checked++;
      }
      expect(checked).toBeGreaterThan(0);
    });
  }

  it('groups boats by head start, biggest first, scratch boats last', () => {
    const e = real.find(x => x.raceFormat === 'handicap')!;
    const race = e.lastCompletedRace + 1;
    const groups = handicapGroups({ ...e, numRaces: race + 2 }, race, e.skippers.map((_, i) => i));
    const hcaps = groups.map(g => g.hcap);
    expect(hcaps).toEqual([...hcaps].sort((a, b) => b - a));
    expect(groups.flatMap(g => g.skipperIndices).sort((a, b) => a - b)).toEqual(e.skippers.map((_, i) => i));
    for (const g of groups) for (const i of g.skipperIndices) expect(handicapForRace(e.skippers, e.raceResults, race, i)).toBe(g.hcap);
  });
});

describe('next race without heats', () => {
  for (const e of real) {
    it(`${e.id}: the race after the last completed one`, () => {
      const ev = { ...e, numRaces: e.lastCompletedRace + 3 };
      const up = nextUp(ev);
      expect(up.race).toBe(nextRaceNumber(e.lastCompletedRace, ev.numRaces));
      expect(up.race).toBe(e.lastCompletedRace + 1);
      expect(up.heat).toBeNull();
      expect(up.allDone).toBe(false);
    });
  }
  it('is capped at the races planned, and says when every race is scored', () => {
    const e = { ...real[0], numRaces: real[0].lastCompletedRace };
    expect(nextUp(e).race).toBe(real[0].lastCompletedRace);
    expect(nextUp(e).allDone).toBe(true);
  });
});

describe('heat order', () => {
  const choices = { scoringSystem: 'hms' as const, shrsMode: 'progressive' as const, numberOfHeats: 3, promotionCount: 4, seedingMethod: 'random' as const, fleetManagementEnabled: true, heatLabelStyle: 'letters' as const, heatOrder: 'ascending' as const, qualifyingRounds: 1 };

  it('HMS sails the lowest heat first and moves up as heats are scored', () => {
    const skippers = fleet(24);
    const { heatManagement: hm } = buildHeatSetup(skippers, choices);
    expect(heatSailingOrder(hm)).toEqual(['C', 'B', 'A']);
    expect(firstIncompleteHeat(hm, [])).toBe('C');
    const c = hm.rounds[0].heatAssignments.find(a => a.heatDesignation === 'C')!;
    const results = c.skipperIndices.map((skipperIndex, p) => ({ race: 1, skipperIndex, position: p + 1 }));
    expect(heatProgress(hm, results, 'C')).toEqual({ scored: c.skipperIndices.length, total: c.skipperIndices.length });
    expect(firstIncompleteHeat(hm, results)).toBe('B');
    const ev = { ...real[0], skippers, raceResults: results, lastCompletedRace: 0, heatManagement: hm, numRaces: 8, multiDay: false } as RaceEvent;
    const up = nextUp(ev);
    expect(up.heat).toBe('B');
    expect(up.sails).toBe(2);
    expect(up.nextHeat?.heat).toBe('A');
    expect(up.nextHeat?.promoted).toBe(0); // race 1 is the seeding race: no promotion
    const later = nextUp({ ...ev, heatManagement: { ...hm, currentRound: 2, rounds: [hm.rounds[0], { ...hm.rounds[0], round: 2, results: [] }] } as HeatManagement, raceResults: [] });
    expect(later.heat).toBe('C');
    expect(later.nextHeat).toMatchObject({ heat: 'B', promoted: 4, from: 'C' });
  });

  it('SHRS qualifying sails in the heat order chosen, finals from the bottom fleet', () => {
    const skippers = fleet(20);
    const { heatManagement: hm } = buildHeatSetup(skippers, { ...choices, scoringSystem: 'shrs', shrsMode: 'preset', numberOfHeats: 2, qualifyingRounds: 3 });
    expect(heatSailingOrder(hm)).toEqual(['A', 'B']);
    const desc = { ...hm, configuration: { ...hm.configuration, heatOrder: 'descending' as const } };
    expect(heatSailingOrder(desc)).toEqual(['B', 'A']);
    expect(roundLabel(hm, 2)).toBe('Qualifying Rd 2');
    expect(roundLabel(hm, 4, 'A')).toBe('Final 1 - Gold Fleet');
    const finals = { ...hm, currentRound: 4, rounds: [...hm.rounds, { ...hm.rounds[0], round: 4, results: [] }] };
    expect(heatSailingOrder(finals)).toEqual(['B', 'A']);
  });
});
