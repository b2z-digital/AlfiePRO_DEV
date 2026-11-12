// The second tuning of the computer's skippers: the four levels further apart, for races set up
// from 12 Nov 2026. A race keeps the tuning it was set up with, so replays and ghosts sail as they did.
import { describe, expect, it } from 'vitest';
import { LEVELS, LEVELS2, levelsFor, ownLevel } from '@/sim/ai';
import { Race } from '@/sim/engine';
import type { RaceSettings, SkipperLevel } from '@/sim/types';
import { SCALE, expected } from '@/components/race-simulator/rating';

const LV: SkipperLevel[] = ['club', 'state', 'national', 'world'];
const base: RaceSettings = { classId: 'IOM', fleetSize: 8, level: 'state', windStrength: 'medium', windCharacter: 'oscillating', laps: 1, length: 'short', sequenceSeconds: 30, coach: 'off', autoTrim: true, seed: 4242, noPlayer: true };

describe('The second tuning', () => {
  it('leaves World as it was and loosens each level below it, most at Club', () => {
    expect(LEVELS2.world).toEqual(LEVELS.world);
    for (const l of ['club', 'state', 'national'] as SkipperLevel[]) {
      expect(LEVELS2[l].noise).toBeGreaterThan(LEVELS[l].noise);
      expect(LEVELS2[l].trimNoise).toBeGreaterThan(LEVELS[l].trimNoise);
      expect(LEVELS2[l].tackRudder).toBeLessThanOrEqual(LEVELS[l].tackRudder);
    }
    // Every skill still improves with each level up.
    for (let i = 0; i < 3; i++) {
      const lo = LEVELS2[LV[i]], hi = LEVELS2[LV[i + 1]];
      expect(hi.noise).toBeLessThan(lo.noise);
      expect(hi.trimNoise).toBeLessThan(lo.trimNoise);
      expect(hi.tackRudder).toBeGreaterThan(lo.tackRudder);
      expect(hi.layMargin).toBeLessThan(lo.layMargin);
      expect(hi.roundIn).toBeLessThan(lo.roundIn);
      expect(hi.startSense).toBeGreaterThan(lo.startSense);
    }
    expect(LEVELS2.club.noise - LEVELS.club.noise).toBeGreaterThan(LEVELS2.national.noise - LEVELS.national.noise);
  });

  it('is chosen by the race: a race without it sails exactly as it always did', () => {
    expect(levelsFor(undefined)).toBe(LEVELS);
    expect(levelsFor(2)).toBe(LEVELS2);
    const none = { start: 0, speed: 0, tactics: 0, marks: 0, rules: 0 };
    expect(ownLevel('club', none)).toEqual(LEVELS.club);
    expect(ownLevel('club', none, 2)).toEqual(LEVELS2.club);
    const sail = (s: RaceSettings) => { const r = new Race(s); while (r.t < r.gunT + 40) r.step(); return r.boats.map(b => [Math.round(b.x * 100), Math.round(b.y * 100)]); };
    const old = sail(base);
    expect(sail({ ...base })).toEqual(old);
    expect(sail({ ...base, tune: 2 })).not.toEqual(old);
  });

  it('the rating expects what was measured: a level beats the one below about 62% of the time', () => {
    expect(SCALE).toBe(1400);
    expect(expected(1500, 1200)).toBeCloseTo(0.62, 2);
    expect(expected(1800, 1200)).toBeCloseTo(0.73, 2);
    expect(expected(1800, 900)).toBeCloseTo(0.81, 2);
  });
});
