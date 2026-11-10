// Race simulator: a race sails again exactly from its log (the player's inputs and actions), and
// you can take over from any moment. Run with: npm test
import { describe, expect, it } from 'vitest';
import { Race } from '@/sim/engine';
import { Rng } from '@/sim/math';
import type { RaceSettings } from '@/sim/types';

const base: RaceSettings = {
  classId: 'IOM', fleetSize: 6, level: 'state', windStrength: 'medium', windCharacter: 'oscillating',
  laps: 1, length: 'short', sequenceSeconds: 30, coach: 'off', autoTrim: false, seed: 321,
};

/** A made-up skipper at the sticks: wanders about, tacks, hails, all from a seeded random stream. */
function sail(r: Race, steps: number, rng: Rng) {
  let rudder = 0, sheet = 0.7;
  for (let k = 0; k < steps && !r.ended; k++) {
    if (k % 7 === 0) { rudder = Math.max(-1, Math.min(1, rudder + rng.range(-0.3, 0.3))); sheet = Math.max(0, Math.min(1, sheet + rng.range(-0.1, 0.1))); }
    r.input = { rudder: rudder * 0.6 + 1e-7 * rng.next(), sheet, autoTrim: false, penaltyAssist: false };
    if (k % 211 === 100) r.act('tack');
    if (k % 333 === 150) r.act('hail');
    r.step();
  }
}

const state = (r: Race) => r.boats.map(b => `${b.x.toFixed(6)},${b.y.toFixed(6)},${b.hdg.toFixed(6)},${b.legIndex}`).join('|');

describe('Race log', () => {
  it('sails the race again exactly', () => {
    const a = new Race(base);
    sail(a, 4000, new Rng(9));
    const b = new Race(base);
    b.followLog(a.log);
    while (b.step_ < a.step_) b.step();
    expect(state(b)).toBe(state(a));
    expect(b.incidents.map(i => `${i.t}:${i.rule}`).join()).toBe(a.incidents.map(i => `${i.t}:${i.rule}`).join());
    expect(b.log.acts).toEqual(a.log.acts);
  }, 60000);

  it('takes over from a moment: the same up to there, then yours', () => {
    const a = new Race(base);
    sail(a, 3000, new Rng(4));
    const at = 1800;
    const b = new Race(base);
    b.followLog(a.log, at);
    while (b.step_ < at) b.step();
    expect(b.replaying).toBe(false);
    // Same as the original at that moment…
    const a2 = new Race(base);
    a2.followLog(a.log, at);
    while (a2.step_ < at) a2.step();
    expect(state(b)).toBe(state(a2));
    // …then the player's new input counts, and is recorded from there.
    b.input = { rudder: 1, sheet: 0.2, autoTrim: false };
    b.step();
    expect(b.log.input[b.log.input.length - 1]).toEqual([at, 1, 0.2, 0]);
    expect(b.act('gybe')).toBeNull();
    expect(b.log.acts[b.log.acts.length - 1]).toEqual([at + 1, 'gybe']);
  }, 60000);
});
