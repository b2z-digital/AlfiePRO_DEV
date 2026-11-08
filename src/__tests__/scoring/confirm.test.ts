/**
 * Confirming on the phone runs the desktop scoring screen's own steps (utils/scoringConfirm),
 * replayed here race by race through real anonymised rounds, plus an HMS event heat by heat.
 */
import { describe, expect, it } from 'vitest';
import events from '../fixtures/real-events.json';
import type { Skipper } from '../../types';
import type { HeatManagement } from '../../types/heat';
import type { RaceEvent } from '../../types/race';
import { loadFinishOrder, addFinish, type FinishingEntry } from '../../utils/finishOrder';
import { buildHeatSetup } from '../../utils/heatSetup';
import { heatSailingOrder } from '../../utils/raceProgress';
import { DEFAULT_HANDICAP_SETTINGS, advanceToNextRoundIn, confirmTouchRace, handicapsFor, overrideHandicapIn } from '../../utils/scoringConfirm';
import { applyHeatFinish, applyRaceFinish, confirmHeat, confirmRace, editCell, handicapChanges, heatMoves, type ScoringRun } from '../../mobile/confirmRace';

const real = events as unknown as RaceEvent[];
const strip = (rs: any[]) => rs.map(r => ({ skipperIndex: r.skipperIndex, position: r.position ?? null, letterScore: r.letterScore || undefined })).sort((a, b) => a.skipperIndex - b.skipperIndex);
const quirk = (r: any) => (r.position === null && ['RDG', 'DPI', 'ZFP', 'SCP'].includes(r.letterScore) ? { ...r, position: 999 } : r);

describe('confirming a race, replayed through real rounds', () => {
  for (const e of real) {
    it(`${e.id}: every race confirms to the same results`, () => {
      for (let race = 1; race <= e.lastCompletedRace; race++) {
        const run: ScoringRun = {
          skippers: e.skippers,
          raceResults: (e.raceResults as any[]).filter(r => r.race < race),
          heatManagement: null,
          lastCompletedRace: race - 1,
          numRaces: 12,
          dropRules: [4, 8, 16, 24, 32, 40],
          hasDeterminedInitialHcaps: !!e.hasDeterminedInitialHcaps || race > 1,
          isManualHandicaps: !!e.isManualHandicaps,
          currentDay: 1,
          raceType: e.raceFormat,
        };
        const entries = loadFinishOrder(e.skippers, e.raceResults as any, race).entries;
        const c = confirmRace(applyRaceFinish(run, race, entries, DEFAULT_HANDICAP_SETTINGS), race, DEFAULT_HANDICAP_SETTINGS);
        const orig = (e.raceResults as any[]).filter(r => r.race === race && (r.position !== null || r.letterScore)).map(quirk);
        expect(strip(c.after.raceResults.filter(r => r.race === race))).toEqual(strip(orig));
        expect(c.after.lastCompletedRace).toBe(race);
        expect(c.advanced).toBe(true);
      }
    });
  }

  it('handicaps after each race match the desktop (recorded rounds, and a full recalculation)', () => {
    for (const e of real.filter(x => x.raceFormat === 'handicap')) {
      // the seeded event starts from scratch, as it did before race 1
      const fromScratch = !e.isManualHandicaps;
      const skippers0 = fromScratch ? e.skippers.map(s => ({ ...s, startHcap: 0 })) : e.skippers;
      let run: ScoringRun = { skippers: skippers0, raceResults: [], heatManagement: null, lastCompletedRace: 0, numRaces: 12, dropRules: [4, 8, 16, 24, 32, 40], hasDeterminedInitialHcaps: !!e.isManualHandicaps, isManualHandicaps: !!e.isManualHandicaps, currentDay: 1, raceType: 'handicap' };
      for (let race = 1; race <= e.lastCompletedRace; race++) {
        const entries = loadFinishOrder(run.skippers, e.raceResults as any, race).entries;
        const c = confirmRace(applyRaceFinish(run, race, entries, DEFAULT_HANDICAP_SETTINGS), race, DEFAULT_HANDICAP_SETTINGS);
        // Races scored before the current rules (did-not-race boats no longer get the scratch-win +30) can't be compared with what was recorded then
        if (e.id === 'handicap-dns-13-boats' && race <= 6) {
          for (const ch of handicapChanges(c.after, race)) {
            const rec = (e.raceResults as any[]).find(r => r.race === race && r.skipperIndex === ch.skipperIndex);
            expect([ch.from, ch.to]).toEqual([rec.handicap, rec.adjustedHcap]);
          }
        }
        run = c.after;
      }
      // the desktop working the whole event out again on load gives the same handicaps
      const full = handicapsFor(run.skippers, run.raceResults, run.numRaces, DEFAULT_HANDICAP_SETTINGS, run.isManualHandicaps);
      expect(full.updatedResults.map((r: any) => [r.race, r.skipperIndex, r.handicap, r.adjustedHcap])).toEqual(run.raceResults.map(r => [r.race, r.skipperIndex, r.handicap, r.adjustedHcap]));
      if (fromScratch) expect(run.hasDeterminedInitialHcaps).toBe(true);
    }
  });

  it('an override is kept when handicaps are worked out again', () => {
    const results = [{ race: 1, skipperIndex: 0, position: 1, handicap: 40, adjustedHcap: 10 }, { race: 1, skipperIndex: 1, position: 2, handicap: 0, adjustedHcap: 0 }];
    const o = overrideHandicapIn(results, 0, 25)!;
    expect(o[0]).toMatchObject({ adjustedHcap: 25, handicapOverride: true });
    expect(overrideHandicapIn([], 0, 25)).toBeNull();
  });

  it('a race is only complete when every boat has a result (handicap: half the fleet and two boats)', () => {
    const skippers = Array.from({ length: 4 }, (_, i) => ({ name: `S${i}`, sailNo: String(i + 1), startHcap: 0 } as Skipper));
    const two = [{ race: 1, skipperIndex: 0, position: 1 }, { race: 1, skipperIndex: 1, position: 2 }];
    const ctx = { skippers, numRaces: 12, lastCompletedRace: 0, isManualHandicaps: false, hasDeterminedInitialHcaps: false };
    expect(confirmTouchRace(two, { ...ctx, raceType: 'scratch' }).advanced).toBe(false);
    const h = confirmTouchRace(two, { ...ctx, raceType: 'handicap' });
    expect(h.advanced).toBe(true);
    expect(h.skippers).toBe(skippers); // race 1 isn't complete for every boat: no seeding yet
    const all = [...two, { race: 1, skipperIndex: 2, position: 3 }, { race: 1, skipperIndex: 3, position: 4 }];
    expect(confirmTouchRace(all, { ...ctx, raceType: 'handicap' }).skippers.map(s => s.startHcap)).toEqual([0, 10, 20, 30]);
  });
});

describe('HMS heat by heat', () => {
  const choices = { scoringSystem: 'hms' as const, shrsMode: 'progressive' as const, numberOfHeats: 3, promotionCount: 4, seedingMethod: 'random' as const, fleetManagementEnabled: true, heatLabelStyle: 'letters' as const, heatOrder: 'ascending' as const, qualifyingRounds: 1 };
  const skippers = Array.from({ length: 24 }, (_, i) => ({ name: `Skipper ${i + 1}`, sailNo: String(i + 1), startHcap: 0 } as Skipper));
  const order = (hm: HeatManagement, heat: string, sk: Skipper[]): FinishingEntry[] => {
    const a = hm.rounds.find(r => r.round === hm.currentRound)!.heatAssignments.find(x => x.heatDesignation === heat)!;
    let o: FinishingEntry[] = [];
    for (const i of [...a.skipperIndices].sort((x, y) => x - y)) o = addFinish(o, sk, i)!;
    return o;
  };
  const sail = (run: ScoringRun) => {
    for (const heat of heatSailingOrder(run.heatManagement!)) {
      const a = run.heatManagement!.rounds.find(r => r.round === run.heatManagement!.currentRound)!.heatAssignments.find(x => x.heatDesignation === heat)!;
      const c = confirmHeat(applyHeatFinish(run, heat, a.skipperIndices, order(run.heatManagement!, heat, run.skippers)), heat);
      run = c.after;
      if (c.roundCompleted) return { run, last: c };
    }
    throw new Error('round did not complete');
  };

  it('race 1: every heat confirmed completes the race and builds race 2 heats', () => {
    const { heatManagement } = buildHeatSetup(skippers, choices);
    const start: ScoringRun = { skippers, raceResults: [], heatManagement, lastCompletedRace: 0, numRaces: 8, dropRules: 'hms', hasDeterminedInitialHcaps: false, isManualHandicaps: false, currentDay: 1, raceType: 'scratch' };
    const { run, last } = sail(start);
    expect(run.lastCompletedRace).toBe(1);
    expect(run.raceResults.filter(r => r.race === 1)).toHaveLength(24);
    expect(run.heatManagement!.rounds.find(r => r.round === 2)?.heatAssignments.length).toBe(3);
    expect(heatMoves(last).now).toEqual([]); // race 1 is the seeding race: nobody moves mid-race

    // "Advance to Race 2" (the scoring screen's step)
    const adv = advanceToNextRoundIn(run.heatManagement!, heatSailingOrder(run.heatManagement!).slice(-1)[0], 'hms', skippers);
    expect(adv.heatManagement.currentRound).toBe(2);
    expect(adv.lastCompletedRace).toBe(1);

    // race 2: the lowest heat's top 4 promote into the next heat up as soon as it's confirmed
    const r2: ScoringRun = { ...run, heatManagement: adv.heatManagement, raceResults: adv.convertedResults, lastCompletedRace: 1 };
    const lowest = heatSailingOrder(r2.heatManagement!)[0];
    const a = r2.heatManagement!.rounds.find(r => r.round === 2)!.heatAssignments.find(x => x.heatDesignation === lowest)!;
    const c = confirmHeat(applyHeatFinish(r2, lowest, a.skipperIndices, order(r2.heatManagement!, lowest, skippers)), lowest);
    const moves = heatMoves(c).now;
    expect(moves).toHaveLength(4);
    expect(moves.map(m => m.place)).toEqual([1, 2, 3, 4]);
    expect(new Set(moves.map(m => m.to)).size).toBe(1);
    expect(c.roundCompleted).toBe(false);
  });
});

describe('correcting a result on the full sheet', () => {
  const runOfReal = (e: RaceEvent): ScoringRun => ({ skippers: e.skippers, raceResults: e.raceResults as any[], heatManagement: null, lastCompletedRace: e.lastCompletedRace, numRaces: 12, dropRules: [4, 8, 16, 24, 32, 40], hasDeterminedInitialHcaps: true, isManualHandicaps: !!e.isManualHandicaps, currentDay: 1, raceType: e.raceFormat });

  it('changing a place and changing it back leaves every result as it was', () => {
    for (const e of real) {
      const run = runOfReal(e);
      const r = (e.raceResults as any[]).find(x => x.race === 2 && x.position && !x.letterScore);
      const changed = editCell(run, 2, r.skipperIndex, null, 'DNF', undefined, DEFAULT_HANDICAP_SETTINGS).run;
      expect(changed.raceResults.find(x => x.race === 2 && x.skipperIndex === r.skipperIndex)).toMatchObject({ position: null, letterScore: 'DNF' });
      const back = editCell(changed, 2, r.skipperIndex, r.position, undefined, undefined, DEFAULT_HANDICAP_SETTINGS).run;
      expect(strip(back.raceResults.filter(x => x.race === 2))).toEqual(strip((e.raceResults as any[]).filter(x => x.race === 2)));
      expect(back.lastCompletedRace).toBe(e.lastCompletedRace);
    }
  });

  it('correcting race 1 of a handicap round later keeps the races already scored', () => {
    const e = real.find(x => x.raceFormat === 'handicap')!;
    const r1 = (e.raceResults as any[]).find(x => x.race === 1 && x.position)!;
    const after = editCell(runOfReal(e), 1, r1.skipperIndex, r1.position, undefined, undefined, DEFAULT_HANDICAP_SETTINGS).run;
    expect(after.lastCompletedRace).toBe(e.lastCompletedRace);
  });
});
