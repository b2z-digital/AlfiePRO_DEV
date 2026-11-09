/**
 * Heat set-up shared by the desktop wizard / seeding modals and the phone Race desk
 * (utils/heatSetup). Deterministic paths are locked with snapshots; random seeding is checked
 * for shape (every skipper in exactly one heat, HMS sizes).
 */
import { describe, expect, it } from 'vitest';
import { buildHeatSetup, heatManagementFromAssignments, seedFromImportedRankings, HeatSetupChoices } from '../../utils/heatSetup';
import { calculateHMSHeatSizes } from '../../utils/hmsHeatSystem';
import { normalizeHeatManagementForSave, dedupeSkippers } from '../../utils/raceSetup';

const skippers = Array.from({ length: 22 }, (_, i) => ({
  name: `Skipper ${i + 1}`, sailNo: String(100 + i), club: 'CLUB', hull: 'Design', startHcap: 0,
  ...(i % 3 === 0 ? { national_ranking: 30 - i } : {}),
})) as any[];

const base: HeatSetupChoices = {
  scoringSystem: 'hms', shrsMode: 'preset', numberOfHeats: 2, promotionCount: 4, seedingMethod: 'random',
  fleetManagementEnabled: true, heatLabelStyle: 'letters', heatOrder: 'ascending', qualifyingRounds: 6,
};

const everyoneOnce = (hm: any) => {
  const all = hm.rounds[0].heatAssignments.flatMap((a: any) => a.skipperIndices).sort((a: number, b: number) => a - b);
  expect(all).toEqual(skippers.map((_, i) => i));
};

describe('heat set-up', () => {
  it('HMS random: everyone in one heat, HMS sizes', () => {
    const r = buildHeatSetup(skippers, base);
    expect(r.pendingSeedingAction).toBeUndefined();
    everyoneOnce(r.heatManagement);
    expect(r.heatManagement.rounds[0].heatAssignments.map(a => a.skipperIndices.length)).toEqual(calculateHMSHeatSizes(22, 2));
    expect(r.heatManagement.currentHeat).toBe('B');
  });

  it('HMS with fleet management defers manual and ranking seeding', () => {
    expect(buildHeatSetup(skippers, { ...base, seedingMethod: 'manual' }).pendingSeedingAction).toBe('manual');
    expect(buildHeatSetup(skippers, { ...base, seedingMethod: 'ranking' }).pendingSeedingAction).toBe('ranking');
  });

  it('HMS ranking without fleet management (snapshot)', () => {
    const r = buildHeatSetup(skippers, { ...base, seedingMethod: 'ranking', fleetManagementEnabled: false });
    expect(r.heatManagement).toMatchSnapshot();
  });

  it('SHRS pre-assigned by ranking (snapshot)', () => {
    const r = buildHeatSetup(skippers, { ...base, scoringSystem: 'shrs', seedingMethod: 'ranking', numberOfHeats: 2, qualifyingRounds: 4 });
    expect(r.heatManagement.rounds).toHaveLength(4);
    everyoneOnce(r.heatManagement);
    expect(r.heatManagement).toMatchSnapshot();
  });

  it('ranking seeding from imported rankings, then confirmed (snapshot)', () => {
    const r = buildHeatSetup(skippers, { ...base, seedingMethod: 'ranking' });
    const s = seedFromImportedRankings(skippers, 2);
    if ('error' in s) throw new Error(s.error);
    const hm = heatManagementFromAssignments(r.heatManagement.configuration, s.assignments, s.rankedIndices);
    everyoneOnce(hm);
    expect(hm.configuration.seedingMethod).toBe('manual');
    expect(hm).toMatchSnapshot();
  });

  it('SHRS safety net regenerates missing pre-assigned rounds', () => {
    const r = buildHeatSetup(skippers, { ...base, scoringSystem: 'shrs', seedingMethod: 'ranking', qualifyingRounds: 4 });
    const cut = { ...r.heatManagement, rounds: r.heatManagement.rounds.slice(0, 1) };
    expect(normalizeHeatManagementForSave(cut)!.rounds).toHaveLength(4);
  });

  it('skipper list drops repeated names and sail numbers', () => {
    const list = [skippers[0], { ...skippers[1], sailNo: skippers[0].sailNo }, { ...skippers[2], name: skippers[0].name }, skippers[3]];
    expect(dedupeSkippers(list).map(s => s.name)).toEqual([skippers[0].name, skippers[3].name]);
  });
});
