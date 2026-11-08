/**
 * Golden scoring tests on real, completed AlfiePRO events (skipper names replaced).
 *
 * 1. The desktop results table's scoring (utils/eventResultsEngine, used by EventResultsDisplay)
 *    is locked to today's answers with snapshots. A change to scoring shows up as a failed test.
 * 2. The phone app's standings (mobile/data eventStandings, used by the event Results tab,
 *    Home "My latest result", Results list and stats) must equal the desktop results exactly.
 */
import { describe, expect, it } from 'vitest';
import events from '../fixtures/real-events.json';
import { computeEventResults } from '../../utils/eventResultsEngine';
import { eventStandings } from '../../mobile/data';
import type { RaceEvent } from '../../types/race';

const fixtures = events as unknown as RaceEvent[];
const round2 = (n: number) => Math.round(n * 100) / 100;

describe('desktop results table (golden)', () => {
  for (const e of fixtures) {
    it(`${e.id}: places, totals and drops`, () => {
      const r = computeEventResults(e);
      const table = (r.displaySkippers as any[]).map((s, i) => ({
        place: i + 1,
        skipper: s.name,
        net: round2(r.totals[s.index]?.net || 0),
        gross: round2(r.totals[s.index]?.gross || 0),
        dropped: r.raceNumbers.filter(race => r.drops[`${s.index}-${race}`]),
      }));
      expect({ races: r.raceNumbers, table }).toMatchSnapshot();
    });
  }
});

describe('phone standings equal desktop results', () => {
  for (const e of fixtures) {
    it(`${e.id}`, () => {
      const r = computeEventResults(e);
      const phone = eventStandings(e)!;
      expect(phone.races).toEqual(r.raceNumbers);
      expect(phone.rows.map(x => x.index)).toEqual((r.displaySkippers as any[]).map(s => s.index));
      expect(phone.rows.map(x => round2(x.net))).toEqual((r.displaySkippers as any[]).map(s => round2(r.totals[s.index]?.net || 0)));
      for (const row of phone.rows) {
        for (const race of r.raceNumbers) {
          expect(phone.isDropped(row.index, race)).toBe(!!r.drops[`${row.index}-${race}`]);
        }
      }
    });
  }
});

describe('dashboards and live pages equal desktop results', () => {
  // standingsCalculator feeds the Recent Results widget, the Live Dashboard, the live race
  // companion and the dashboard podium. They must show the same order as the results table.
  for (const e of fixtures) {
    it(`${e.id}`, async () => {
      const { calculateEventStandings, getTopFinishers } = await import('../../utils/standingsCalculator');
      const r = computeEventResults(e);
      const want = (r.displaySkippers as any[]).map(s => s.index);
      const got = calculateEventStandings(e);
      expect(got.map(x => x.index)).toEqual(want);
      expect(got.map(x => round2(x.netTotal))).toEqual(want.map(i => round2(r.totals[i]?.net || 0)));
      expect(getTopFinishers(e, 3).map(x => x.name)).toEqual((r.displaySkippers as any[]).slice(0, 3).map(s => s.name));
    });
  }
});
