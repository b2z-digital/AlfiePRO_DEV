// The scoring bench: one fleet sailed as a whole regatta under low point, HMS and SHRS, each run by
// AlfiePRO's own code; measured for how well it finds the best sailors; and exported in a form
// Race Management's simulation import reads back.
import { describe, expect, it } from 'vitest';
import { exportRows, fleetFor, measure, runSystem, spearman, toCsv, type BenchSetup } from '@/components/race-simulator/bench';
import { parseSHRSFromCSV } from '@/utils/shrsParser';
import { parseHMSFromCSV } from '@/utils/hmsParser';

const b: BenchSetup = { fleet: 32, races: 12, mix: 'mixed', letters: true, seed: 7 };

describe('The scoring bench', () => {
  it('the same fleet, three systems: everyone ranked under each', () => {
    const fleet = fleetFor(b);
    expect(fleet.length).toBe(32);
    expect(new Set(fleet.map(f => f.sail)).size).toBe(32);
    for (const s of ['low', 'hms', 'shrs'] as const) {
      const out = runSystem(s, b, fleet);
      expect(out.ran).toBe(true);
      expect(out.rows.length).toBe(32);
      expect(new Set(out.rows.map(r => r.index)).size).toBe(32);
      expect(out.rows.every(r => r.cells.length === 12)).toBe(true);
      // Twelve races: two drops each.
      expect(out.rows.every(r => r.cells.filter(c => c.dropped).length === 2)).toBe(true);
    }
    expect(runSystem('hms', b, fleet)).toMatchObject({ heats: 2, promotion: 4 });
    expect(runSystem('shrs', b, fleet)).toMatchObject({ heats: 2, qualifying: 6 });
  });

  it("heats follow AlfiePRO's own rules for how many: HMS sails one fleet under 16 boats, SHRS still splits 12 in two", () => {
    const small = { ...b, fleet: 12 };
    expect(runSystem('hms', small)).toMatchObject({ ran: false });
    expect(runSystem('hms', small).why).toMatch(/16 or more/);
    expect(runSystem('shrs', small)).toMatchObject({ ran: true, heats: 2 });
    expect(runSystem('low', small).ran).toBe(true);
  });

  it('letter scores turn up at about the rate set, and none when they are off', () => {
    const big = { ...b, fleet: 40, races: 20 };
    const codes = (letters: boolean) => runSystem('low', { ...big, letters }).rows.flatMap(r => r.cells).filter(c => /DNF|OCS|DSQ/.test(c.text)).length;
    const n = codes(true);
    expect(n).toBeGreaterThan(8);
    expect(n).toBeLessThan(50);
    expect(codes(false)).toBe(0);
  });

  it('measures how well each system finds the best sailors', () => {
    expect(spearman([1, 2, 3, 4], [1, 2, 3, 4])).toBe(1);
    expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBe(-1);
    const t0 = Date.now();
    const low = measure('low', { ...b, letters: false }, 6)!, hms = measure('hms', { ...b, letters: false }, 6)!, shrs = measure('shrs', { ...b, letters: false }, 6)!;
    for (const m of [low, hms, shrs]) {
      expect(m.regattas).toBe(6);
      expect(m.rho).toBeGreaterThan(0.5);
      expect(m.rho).toBeLessThanOrEqual(1);
      expect(m.bestRank).toBeGreaterThanOrEqual(1);
    }
    expect(Date.now() - t0).toBeLessThan(30000);
    expect(measure('hms', { ...b, fleet: 12 }, 3)).toBeNull();
  }, 60000);

  it("exports SHRS in Race Management's import template, and it reads back", () => {
    const fleet = fleetFor(b), out = runSystem('shrs', b, fleet);
    const rows = exportRows(out, fleet);
    expect(rows[0]).toEqual(['Name', 'Sail', 'Club', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'Total', 'Net']);
    const parsed = parseSHRSFromCSV(toCsv(rows));
    expect(parsed.skippers.length).toBe(32);
    expect(parsed.qualifyingRounds).toBe(6);
    expect(parsed.finalRounds).toBe(6);
  });

  it('exports low point and HMS as a CSV the HMS paste reads', () => {
    const fleet = fleetFor(b);
    for (const s of ['low', 'hms'] as const) {
      const parsed = parseHMSFromCSV(toCsv(exportRows(runSystem(s, b, fleet), fleet)));
      expect(parsed.skippers.length).toBe(32);
      expect(parsed.numRaces).toBe(12);
    }
  });
});
