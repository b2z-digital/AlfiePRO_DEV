/**
 * The phone finish pad records exactly what the desktop Touch mode records: the finish order
 * rules are the desktop's (utils/finishOrder), checked against real anonymised rounds, and
 * typed or spoken sail numbers only ever pick boats in the race.
 */
import { describe, expect, it } from 'vitest';
import events from '../fixtures/real-events.json';
import type { Skipper } from '../../types';
import type { RaceEvent } from '../../types/race';
import {
  addFinish, applyLetterScore, finishOrderToResults, loadFinishOrder, moveFinish, previousResultsFor, redressAverage, removeFinish, sailSortedIndices,
} from '../../utils/finishOrder';
import { keypadMatches, keypadPick, matchCalls, parseSpoken } from '../../mobile/finishPad';

const real = events as unknown as RaceEvent[];
const fleet = (sails: string[]): Skipper[] => sails.map((s, i) => ({ name: `Skipper ${i + 1}`, sailNo: s, startHcap: 0 } as Skipper));
const strip = (rs: any[]) => rs.map(r => ({ race: r.race, skipperIndex: r.skipperIndex, position: r.position ?? null, letterScore: r.letterScore || undefined, customPoints: r.customPoints })).sort((a, b) => a.race - b.race || a.skipperIndex - b.skipperIndex);

describe('finish order, as the desktop records it', () => {
  for (const e of real) {
    it(`${e.id}: every scored race comes back unchanged through the finish order`, () => {
      const races = [...new Set((e.raceResults as any[]).map(r => r.race))];
      expect(races.length).toBeGreaterThan(0);
      for (const race of races) {
        const { entries } = loadFinishOrder(e.skippers, e.raceResults as any, race);
        const back = finishOrderToResults(e.raceResults as any, race, entries).filter(r => r.race === race);
        // Touch mode quirk, kept as is: a redress-type score entered with no place elsewhere
        // (spreadsheet / pro mode) comes back with place 999, which scoring ignores for these codes
        const orig = (e.raceResults as any[]).filter(r => r.race === race && (r.position !== null || r.letterScore))
          .map(r => (r.position === null && ['RDG', 'DPI', 'ZFP', 'SCP'].includes(r.letterScore) ? { ...r, position: 999 } : r));
        expect(strip(back)).toEqual(strip(orig));
      }
    });
  }

  it('taps take the next place; taking a boat out moves the places after it up', () => {
    const s = fleet(['14', '101', '7', '62', '23']);
    let o = addFinish([], s, 0)!;
    o = addFinish(o, s, 1)!;
    o = addFinish(o, s, 2)!;
    expect(addFinish(o, s, 1)).toBeNull();
    expect(o.map(x => [x.skipperIndex, x.position])).toEqual([[0, 1], [1, 2], [2, 3]]);
    o = removeFinish(o, 1);
    expect(o.map(x => [x.skipperIndex, x.position])).toEqual([[0, 1], [2, 2]]);
    o = moveFinish(addFinish(o, s, 3)!, 2, 0);
    expect(o.map(x => [x.skipperIndex, x.position])).toEqual([[3, 1], [0, 2], [2, 3]]);
  });

  it('letter scores: OCS goes after the finishers with no place; redress keeps the place', () => {
    const s = fleet(['14', '101', '7', '62']);
    let o = applyLetterScore([], s, 3, 'OCS');
    o = addFinish(o, s, 0)!;
    o = addFinish(o, s, 1)!;
    expect(o.find(x => x.skipperIndex === 0)!.position).toBe(1);
    o = applyLetterScore(o, s, 1, 'RDG', -1);
    const res = finishOrderToResults([], 1, o);
    expect(res.find(r => r.skipperIndex === 3)).toMatchObject({ position: null, letterScore: 'OCS' });
    expect(res.find(r => r.skipperIndex === 1)).toMatchObject({ position: 2, letterScore: 'RDG', customPoints: -1 });
    o = applyLetterScore(o, s, 0, 'DNF');
    expect(finishOrderToResults([], 1, o).find(r => r.skipperIndex === 0)).toMatchObject({ position: null, letterScore: 'DNF' });
    o = applyLetterScore(o, s, 3, null);
    expect(o.some(x => x.skipperIndex === 3)).toBe(false);
  });

  it('withdrawn boats are WDN from the race they withdrew in, with their handicap', () => {
    const s = fleet(['1', '2', '3']);
    s[2] = { ...s[2], withdrawnFromRace: 2, startHcap: 30 } as Skipper;
    const prior = [{ race: 1, skipperIndex: 2, position: 1, adjustedHcap: 0 }];
    expect(loadFinishOrder(s, prior as any, 1).entries).toEqual([expect.objectContaining({ skipperIndex: 2, position: 1 })]);
    const r2 = loadFinishOrder(s, prior as any, 2);
    expect(r2.entries).toEqual([expect.objectContaining({ skipperIndex: 2, letterScore: 'WDN', customPoints: 4 })]);
    expect(r2.withdrawnResults).toEqual([expect.objectContaining({ race: 2, letterScore: 'WDN', handicap: 30, adjustedHcap: 30 })]);
    expect(loadFinishOrder(s, prior as any, 3).withdrawnResults[0]).toMatchObject({ letterScore: 'WDN' });
  });

  it('redress averages match the letter score sheet (HMS leaves race 1 out)', () => {
    const results = [{ race: 1, skipperIndex: 0, position: 1 }, { race: 2, skipperIndex: 0, position: 4 }, { race: 3, skipperIndex: 0, position: 3 }];
    const prev = previousResultsFor(results as any, 4, 0);
    expect(prev.map(p => p.points)).toEqual([1, 4, 3]);
    expect(redressAverage(prev, false, false, {})).toBe(2.7);
    expect(redressAverage(prev, true, false, { isHeatRacing: true })).toBe(3.5);
    expect(redressAverage(prev, true, false, { isHeatRacing: true, isSHRS: true })).toBe(2.7);
  });

  it('the pad shows boats in sail-number order', () => {
    expect(sailSortedIndices(fleet(['101', '7', 'AUS', '23']))).toEqual([1, 3, 0, 2]);
  });
});

describe('keypad', () => {
  const s = fleet(['2', '21', '24', '270', '88', '215']);
  const open = s.map((_, i) => i);
  it('lists the boats still racing that start with what is typed', () => {
    expect(keypadMatches('2', s, open).map(i => s[i].sailNo)).toEqual(['2', '21', '24', '215', '270']);
    expect(keypadMatches('21', s, open.filter(i => i !== 1)).map(i => s[i].sailNo)).toEqual(['215']);
  });
  it('adds a boat by itself only when nothing else could follow', () => {
    expect(keypadPick('2', s, open)).toBeNull();
    expect(keypadPick('21', s, open)).toBeNull(); // 215 could follow
    expect(keypadPick('24', s, open)).toBe(2);
    expect(keypadPick('88', s, open)).toBe(4);
    expect(keypadPick('9', s, open)).toBeNull();
  });
});

describe('voice', () => {
  const s = fleet(['14', '101', '7', '62', '23', '31', '36', '5', '58', '90']);
  const all = s.map((_, i) => i);
  const boats = (text: string, finished: number[] = []) => matchCalls(parseSpoken(text), s, all, new Set(finished))
    .map(c => (c.kind === 'boat' ? s[c.index].sailNo : c.kind === 'seen' ? `=${s[c.index].sailNo}` : c.kind === 'ask' ? `?${c.options.map(i => s[i].sailNo).join('/')}` : 'undo'));

  it('hears whole numbers and digit-by-digit numbers', () => {
    expect(boats('twenty-three')).toEqual(['23']);
    expect(boats('twenty three ninety')).toEqual(['23', '90']);
    expect(boats('one oh one')).toEqual(['101']);
    expect(boats('one hundred and one')).toEqual(['101']);
    expect(boats('14 7')).toEqual(['14', '7']);
    expect(boats('fourteen, seven')).toEqual(['14', '7']);
    expect(boats('number 62')).toEqual(['62']);
    expect(boats('3 6')).toEqual(['36']);
    expect(boats('for')).toEqual(['?']); // "for" on its own is 4: not in this race, nothing to offer
  });

  it('asks when a number is not a boat in this race', () => {
    expect(boats('fifty')).toEqual(['?5/58/90']);
    expect(boats('sixty three')).toEqual(['?23/62']);
  });

  it('leaves boats that already finished where they are, and understands "scratch that"', () => {
    expect(boats('fourteen', [0])).toEqual(['=14']);
    expect(boats('seven scratch that')).toEqual(['7', 'undo']);
  });

  it('only ever picks boats in the race', () => {
    for (const text of ['four four four', 'twelve', 'oh', 'hundred']) {
      for (const c of matchCalls(parseSpoken(text), s, all, new Set())) if (c.kind === 'boat') expect(all).toContain(c.index);
    }
  });
});

describe('finish pad order', () => {
  it('reads back like Touch mode: finishers by place, then letter scores', () => {
    const s = fleet(['14', '101', '7', '62']);
    let o = applyLetterScore([], s, 3, 'OCS');
    o = addFinish(o, s, 0)!;
    o = addFinish(o, s, 1)!;
    const back = loadFinishOrder(s, finishOrderToResults([], 1, o), 1).entries;
    expect(back.map(x => x.skipperIndex)).toEqual([0, 1, 3]);
    // taking out the winner moves 101 up to 1st, as it does on the desktop sheet
    expect(removeFinish(back, 0).map(x => [x.skipperIndex, x.position])).toEqual([[1, 1], [3, 999]]);
  });
});
