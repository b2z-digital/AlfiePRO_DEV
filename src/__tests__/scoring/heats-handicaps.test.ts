/**
 * Heat systems and handicaps: the rules the phone race desk will rely on, checked against the
 * worked examples in the code and locked with snapshots on real handicap events.
 */
import { describe, expect, it } from 'vitest';
import { calculateHMSHeatSizes, calculateScheduleBHeatSizes, getPromotionSchedule } from '../../utils/hmsHeatSystem';
import { calculateHeatSizes, calculateNonFinisherScore, calculateSHRSDiscards, getLargestHeatSize } from '../../utils/shrsHeatSystem';

describe('HMS 2022', () => {
  it('Schedule B sizes: the bottom heat takes the most boats', () => {
    expect(calculateScheduleBHeatSizes(34, 3, 4)).toEqual([10, 10, 14]);
    expect(calculateScheduleBHeatSizes(29, 3, 4)).toEqual([8, 8, 13]);
  });
  it('initial sizes and schedules (locked)', () => {
    const table: Record<string, unknown> = {};
    for (const [n, h] of [[16, 2], [20, 2], [24, 3], [34, 3], [41, 4]]) table[`${n}/${h}`] = calculateHMSHeatSizes(n, h);
    for (const race of [1, 2, 3, 6]) for (const p of [4, 6]) table[`schedule r${race} p${p}`] = getPromotionSchedule(race, p);
    expect(table).toMatchSnapshot();
  });
});

describe('SHRS 2026-1', () => {
  it('heat sizes, largest heat, non-finisher score and discards (locked)', () => {
    const table: Record<string, unknown> = {};
    for (const [n, h] of [[21, 2], [38, 2], [41, 3], [60, 3]]) {
      const sizes = calculateHeatSizes(n, h);
      table[`${n}/${h}`] = { sizes, largest: getLargestHeatSize(sizes), nonFinisher: calculateNonFinisherScore(getLargestHeatSize(sizes)) };
    }
    table.discards = [1, 3, 4, 7, 8, 15, 16, 24].map(r => [r, calculateSHRSDiscards(r)]);
    expect(table).toMatchSnapshot();
  });
  it('discards follow the rule: none before 4 races, 1 from 4, 2 from 8, +1 each 8', () => {
    expect(calculateSHRSDiscards(3)).toBe(0);
    expect(calculateSHRSDiscards(4)).toBe(1);
    expect(calculateSHRSDiscards(8)).toBe(2);
    expect(calculateSHRSDiscards(16)).toBe(3);
  });
});

// Handicaps: the desktop uses the club's handicap ruleset when it has one (calculateHandicapsWithRuleset)
// and calculateHandicaps otherwise. Real-event handicap tests come with the phone handicap scorer,
// replaying each event with its own club's ruleset.
