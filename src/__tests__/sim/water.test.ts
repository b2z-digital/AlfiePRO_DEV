// Race simulator: the water's ripples only ever drift downwind. Run with: npm test
import { describe, expect, it } from 'vitest';
import { Race } from '@/sim/engine';
import type { RaceSettings } from '@/sim/types';
import { rippleDrift } from '@/components/race-simulator/bankWater';

describe('The ripples on the water', () => {
  it('drift downwind all race long, however the breeze builds, eases and swings', () => {
    const r = new Race({ classId: 'IOM', fleetSize: 4, level: 'club', windStrength: 'medium', windCharacter: 'puffy', laps: 1, length: 'short', sequenceSeconds: 30, coach: 'off', autoTrim: true, seed: 4, noPlayer: true } as RaceSettings);
    const pivot = { x: 5, y: 12 };
    let last = rippleDrift(r, pivot), eased = 0, swung = 0, kn0 = last.kn, twd0 = r.wind.meanTwd(r.t);
    // The pattern as it sits on the water at the point you're looking at: along the wind, and across it.
    const at = (d: ReturnType<typeof rippleDrift>) => ({ v: (pivot.x - d.O.x) * d.down.x + (pivot.y - d.O.y) * d.down.y, u: (pivot.x - d.O.x) * d.across.x + (pivot.y - d.O.y) * d.across.y });
    for (let k = 0; k < 20 * 240 && !r.ended; k++) {
      r.step();
      const d = rippleDrift(r, pivot), a = at(last), b = at(d);
      // Downwind is the pattern's v falling at the water you're watching: every step, never back.
      expect(b.v).toBeLessThan(a.v);
      expect(a.v - b.v).toBeLessThan(0.12);
      // And it doesn't slide sideways there when the wind swings.
      expect(Math.abs(b.u - a.u)).toBeLessThan(1e-6);
      expect(d.dist).toBeGreaterThan(last.dist);
      if (d.kn < kn0 - 0.3) eased++;
      if (Math.abs(r.wind.meanTwd(r.t) - twd0) > 3) swung++;
      last = d;
    }
    // (The breeze did ease and swing during the race: the old way ran the ripples backwards then.)
    expect(eased).toBeGreaterThan(0);
    expect(swung).toBeGreaterThan(0);
  });
});
