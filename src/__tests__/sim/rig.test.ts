// Choosing your rig for the day (IOM): the right one is quickest, too little is slow in light air,
// too much is slow and hard work in a blow, and nobody else's boat is changed by your choice.
import { describe, expect, it } from 'vitest';
import { Race } from '@/sim/engine';
import { LEVELS, PERSONAS, Skipper } from '@/sim/ai';
import { RIG_POWER, iomRig, rigDrive } from '@/sim/classes';
import { Rng } from '@/sim/math';
import type { RaceSettings } from '@/sim/types';
import { rigTakeaway, type RaceSummary } from '@/components/race-simulator/stats';

const base: RaceSettings = { classId: 'IOM', fleetSize: 2, level: 'world', windStrength: 'medium', windCharacter: 'steady', laps: 1, length: 'medium', sequenceSeconds: 20, coach: 'off', autoTrim: true, seed: 2, seaState: 'flat' };

/** Your boat sailed round by a World skipper: her time, and how far she heeled on average. */
function sail(s: Partial<RaceSettings>): { time: number; heel: number; race: Race } {
  const r = new Race({ ...base, ...s });
  const p = r.player!, i = r.boats.indexOf(p);
  p.persona = { ...PERSONAS[2] };
  (r.skippers as (Skipper | null)[])[i] = new Skipper(p, LEVELS.world, p.persona, new Rng(5), i);
  r.autopilot = true;
  let heel = 0, n = 0;
  while (!p.finished && r.t < 700) { r.step(); if (p.started) { heel += Math.abs(p.heel); n++; } }
  return { time: p.finished ? p.finishTime : 700, heel: heel / n, race: r };
}

describe('Your rig for the day', () => {
  it('the breeze picks the rig when you do not: A, then B from 12½ knots, then C from 20', () => {
    expect([5, 12, 12.5, 19.9, 20, 25].map(iomRig)).toEqual(['A', 'A', 'B', 'B', 'C', 'C']);
    expect(rigDrive('A', 9)).toBe(1);
    expect(rigDrive('B', 9)).toBeCloseTo(Math.sqrt(0.72), 6);
    expect(rigDrive('A', 15)).toBeCloseTo(Math.sqrt(1 / 0.72), 6);
    expect(RIG_POWER.C).toBeLessThan(RIG_POWER.B);
  });

  it('choosing the rig the breeze would have picked changes nothing', () => {
    const auto = sail({ windKnots: 9 }), a = sail({ windKnots: 9, rig: 'A' });
    expect(a.time).toBe(auto.time);
    expect(a.race.player!.rig).toBe('A');
    expect(a.race.player!.rigDrive).toBe(1);
  });

  it('too small a rig in light air is slow: the B loses a tenth, the C a third', () => {
    const a = sail({ windKnots: 5, rig: 'A' }), b = sail({ windKnots: 5, rig: 'B' }), c = sail({ windKnots: 5, rig: 'C' });
    expect(b.time).toBeGreaterThan(a.time * 1.06);
    expect(c.time).toBeGreaterThan(b.time * 1.08);
    expect(b.heel).toBeLessThan(a.heel);
  });

  it('too big a rig in a blow heels her hard and is slower than the right one', () => {
    // (Over three races: one race turns on a tack more or less, which is worth more than a rig size.)
    const over = (rig?: 'A' | 'B') => { const rs = [3, 4, 5].map(seed => sail({ windKnots: 21, rig, seed })); return { time: rs.reduce((s, r) => s + r.time, 0) / 3, heel: rs.reduce((s, r) => s + r.heel, 0) / 3, race: rs[0].race }; };
    const c = over(), a = over('A'), b = over('B');
    expect(c.race.player!.rig).toBe('C');
    expect(a.heel).toBeGreaterThan(c.heel + 6);
    expect(a.time).toBeGreaterThan(c.time * 1.05);
    expect(b.time).toBeGreaterThan(c.time);
    expect(b.time).toBeLessThan(a.time);
  });

  it("only your boat carries your choice: the fleet's rigs are the breeze's, and other classes have none to choose", () => {
    const r = new Race({ ...base, fleetSize: 4, windKnots: 9, rig: 'C' });
    expect(r.player!.rig).toBe('C');
    expect(r.player!.rigPower).toBe(RIG_POWER.C);
    for (const b of r.boats) if (b !== r.player) { expect(b.rig).toBe('A'); expect(b.rigPower).toBe(1); expect(b.rigDrive).toBe(1); }
    const df = new Race({ ...base, classId: 'DF95', windKnots: 9, rig: 'C' });
    expect(df.player!.rig).toBeUndefined();
    expect(df.player!.rigPower).toBe(1);
    expect(df.player!.rigDrive).toBe(1);
  });
});

describe('The debrief on your rig', () => {
  const sum = (rig: RaceSummary['rig']) => ({ rig } as RaceSummary);
  it('says nothing when you left it to Alfie, or chose what the fleet carried', () => {
    expect(rigTakeaway(sum(undefined))).toBeNull();
    expect(rigTakeaway(sum({ mine: 'B', fleet: 'B', knots: 15 }))).toBeNull();
  });
  it('says what too much sail did, and what too little did', () => {
    const big = rigTakeaway(sum({ mine: 'A', fleet: 'B', knots: 16 }))!;
    expect(big.tone).toBe('warn');
    expect(big.text).toMatch(/^You carried the A rig in 16 knots; the fleet was on the B\. With too much sail/);
    expect(rigTakeaway(sum({ mine: 'C', fleet: 'A', knots: 8 }))!.text).toMatch(/With too little sail/);
  });
});
