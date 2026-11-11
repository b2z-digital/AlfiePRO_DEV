// The four skipper levels: every skipper has the same boat and the same wind, so a level is only
// ever better sailing. Sailed alone up a beat, each level gets there a little sooner than the one
// below, and the best don't waste tacks.
import { describe, expect, it } from 'vitest';
import { LEVELS } from '@/sim/ai';
import { buildScene } from '@/sim/scene';
import type { SkipperLevel } from '@/sim/types';

const ORDER: SkipperLevel[] = ['club', 'state', 'national', 'world'];

/** Mean seconds to mark 1, and tacks made on the way, for a boat alone on a long beat in a shifty breeze and chop. */
function beat(level: SkipperLevel, seeds: number): { secs: number; tacks: number } {
  let secs = 0, tacks = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const { race, t0 } = buildScene({ origin: 'line', settings: { flatWind: false, length: 'long', windCharacter: 'oscillating', windStrength: 'medium', seaState: 'chop' }, boats: [{ role: 'You', at: [0, 1.5], hdg: 317.5, helm: 'player', persona: 'steady', level }] }, seed, 'ai');
    const p = race.player!;
    let last = p.lastHtwT;
    while (p.legIndex === 0 && race.t - t0 < 300) { race.step(); if (p.lastHtwT !== last) { last = p.lastHtwT; tacks++; } }
    secs += race.t - t0;
  }
  return { secs: secs / seeds, tacks: tacks / seeds };
}

describe('Skipper levels', () => {
  it('each level sails a beat a little faster than the one below, with fewer wasted tacks', () => {
    const r = ORDER.map(l => beat(l, 10));
    for (let i = 1; i < ORDER.length; i++) {
      expect(r[i].secs, `${ORDER[i]} against ${ORDER[i - 1]}`).toBeLessThan(r[i - 1].secs);
      expect(r[i].tacks, `${ORDER[i]} tacks`).toBeLessThanOrEqual(r[i - 1].tacks + 0.3);
    }
    // A little: the whole spread from club to world is a few per cent, not a different boat.
    const spread = r[0].secs / r[3].secs - 1;
    expect(spread).toBeGreaterThan(0.025);
    expect(spread).toBeLessThan(0.12);
  }, 120000);

  it('gets better at every skill as the level goes up, and nobody is given speed', () => {
    const lowerIsBetter = ['reaction', 'noise', 'trimNoise', 'layMargin', 'startMargin', 'misjudge', 'forget', 'roundIn', 'roundOut', 'startSigma', 'lineSigma'] as const;
    for (let i = 1; i < ORDER.length; i++) {
      const a = LEVELS[ORDER[i - 1]], b = LEVELS[ORDER[i]];
      for (const k of lowerIsBetter) expect(b[k], `${ORDER[i]} ${k}`).toBeLessThan(a[k]);
      expect(b.tackRudder).toBeGreaterThan(a.tackRudder);
      expect(b.startSense).toBeGreaterThan(a.startSense);
      // The better the skipper, the bigger the shift she waits for before spending a tack on it.
      expect(b.shiftThr).toBeGreaterThan(a.shiftThr);
    }
    expect(Object.keys(LEVELS.world).some(k => /speed|boost|power/i.test(k))).toBe(false);
  });
});
