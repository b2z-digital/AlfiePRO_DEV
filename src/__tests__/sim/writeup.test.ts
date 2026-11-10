// Race simulator: the facts Alfie writes a race up from, and his reply tidied. Run with: npm test
import { describe, expect, it } from 'vitest';
import { raceFacts, tidy } from '@/components/race-simulator/writeup';
import type { RaceSummary } from '@/components/race-simulator/stats';
import type { Moment } from '@/components/race-simulator/moments';

const sum = {
  at: 0, mode: 'race', title: 'Quick race', cls: 'IOM', level: 'state', fleet: 8, wind: 'medium wind, oscillating · LMRYC · Booragul',
  status: 'finished', place: 3, of: 8, time: 402.4, behind: 28.2, late: 1.2, spdAtGun: 0.92, fromFavouredL: 3, favoured: 'pin end', ocs: false,
  penalties: 1, incidents: [], placesByLeg: [{ label: 'Start', place: 4 }, { label: 'M1', place: 3 }], upwind: { liftedPct: 0.6, tacks: 4, headerTacks: 2, headers: 3, winnerLiftedPct: null },
  downwind: { spdPct: 0.9, gybes: 2, clearAirPct: 0.8 }, roundings: { gained: 1, count: 1 }, takeaways: [],
} as RaceSummary;
const moments: Moment[] = [{ t: 61, kind: 'start', title: 'The start', text: 'A good start.', tone: 'good', focus: ['b0'] }];

describe("Alfie's write-up", () => {
  it('gives Alfie the facts of the race', () => {
    const f = raceFacts(sum, moments, 60, 'Lake Macquarie RYC, Booragul foreshore, Lake Macquarie');
    expect(f).toContain('Where: Lake Macquarie RYC');
    expect(f).toContain('finished 3rd of 8 in 6:42, 28 s behind the winner');
    expect(f).toContain('1.2 s after the gun at 92% speed; the pin end was favoured and I started 3 lengths from it');
    expect(f).toContain('Places by mark: Start 4, M1 3.');
    expect(f).toContain('- 0:01 The start (went well): A good start.');
  });

  it('drops the greeting Alfie opens a conversation with', () => {
    expect(tidy('Hi Stephen\n\nYou got away cleanly.')).toBe('You got away cleanly.');
    expect(tidy('Hi Stephen, you got away cleanly.')).toBe('You got away cleanly.');
    expect(tidy('You got away cleanly.')).toBe('You got away cleanly.');
  });
});
