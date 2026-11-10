// Race simulator: how the boats sit and move. Heel from the breeze (more in a gust, less with a
// smaller rig), weather helm, riding the waves, the waves building with the wind, and where you
// start. Run with: npm test
import { describe, expect, it } from 'vitest';
import { Race } from '@/sim/engine';
import { CLASSES, rigPower, iomRig } from '@/sim/classes';
import { KN } from '@/sim/math';
import { heelStep, settleHeel, weatherHelm } from '@/sim/physics';
import { hullMotion, makeSea } from '@/sim/sea';
import type { Boat, RaceSettings } from '@/sim/types';

/** An IOM close-hauled on starboard at a steady speed in a breeze of `kn` knots. */
function closeHauled(kn: number, rig = 1): Boat {
  const r = new Race({ classId: 'IOM', fleetSize: 2, level: 'state', windStrength: 'medium', windCharacter: 'steady', laps: 1, length: 'short', sequenceSeconds: 30, coach: 'off', autoTrim: true, seed: 3, noPlayer: true } as RaceSettings);
  const b = r.boats[0];
  Object.assign(b, { tws: kn * KN, twd: 0, hdg: 318, twa: 42, tack: 'stbd', spd: 0.9 + 0.012 * kn, sheet: 0.92, rigPower: rig });
  settleHeel(b);
  return b;
}

describe('Heel', () => {
  it('heels an IOM about 20° close-hauled in 9 to 10 knots, and to port on starboard tack', () => {
    const h = closeHauled(9.5).heel;
    expect(h).toBeGreaterThan(15);
    expect(h).toBeLessThan(25);
  });

  it('lays her nearly flat in a gust twice the breeze', () => {
    const b = closeHauled(15, rigPower('IOM', 15));
    b.tws = 30 * KN;
    let peak = 0;
    for (let k = 0; k < 40; k++) { heelStep(b, 0.05, 42); peak = Math.max(peak, Math.abs(b.heel)); }
    expect(peak).toBeGreaterThan(70);
  });

  it('never lays her past flat, however hard it blows', () => {
    const b = closeHauled(15);
    b.tws = 45 * KN;
    let peak = 0;
    for (let k = 0; k < 80; k++) { heelStep(b, 0.05, 42); peak = Math.max(peak, Math.abs(b.heel)); }
    expect(peak).toBeGreaterThan(75);
    expect(peak).toBeLessThanOrEqual(86);
  });

  it('heels her further in a gust, with a small overshoot as it hits, and less with the B rig', () => {
    const b = closeHauled(9.5), before = b.heel;
    b.tws = 9.5 * 1.3 * KN; // a 30% puff
    let peak = 0;
    for (let k = 0; k < 60; k++) { heelStep(b, 0.05, 42); peak = Math.max(peak, b.heel); }
    expect(b.heel - before).toBeGreaterThan(5);
    expect(peak).toBeGreaterThan(b.heel);
    expect(closeHauled(15, rigPower('IOM', 15)).heel).toBeLessThan(closeHauled(15).heel - 5);
  });

  it('changes an IOM down to the B rig from about 12½ knots and the C rig from 20', () => {
    expect([iomRig(9), iomRig(13), iomRig(22)]).toEqual(['A', 'B', 'C']);
    expect(rigPower('10R', 22)).toBe(1);
  });

  it('gives weather helm only once she is heeled past about 20°, and a lot when she is laid over', () => {
    const b = closeHauled(9.5);
    b.heel = 15; b.heelRate = 0;
    expect(weatherHelm(b)).toBe(0);
    b.heel = 26;
    const some = weatherHelm(b);
    b.heel = 40;
    expect(some).toBeGreaterThan(0);
    expect(weatherHelm(b)).toBeGreaterThan(3 * some);
  });
});

describe('Gusts', () => {
  /** The strongest wind any boat feels on the beat (as a share of the breeze), and the most heel. */
  const felt = (windStrength: RaceSettings['windStrength'], windCharacter: RaceSettings['windCharacter'], seed: number) => {
    const r = new Race({ classId: 'IOM', fleetSize: 8, level: 'state', windStrength, windCharacter, laps: 1, length: 'medium', sequenceSeconds: 30, coach: 'off', autoTrim: true, seed, noPlayer: true } as RaceSettings);
    let gust = 0, heel = 0;
    while (!r.ended && r.t < r.gunT + 200) {
      r.step();
      if (r.t < r.gunT) continue;
      for (const b of r.boats) {
        if (b.finished || Math.abs(b.twa) > 55) continue;
        gust = Math.max(gust, b.tws / r.wind.baseTws); heel = Math.max(heel, Math.abs(b.heel));
      }
    }
    return { gust, heel };
  };

  it('brings big gusts through the fleet on a fresh, puffy day, and they lay boats nearly flat', () => {
    const f = felt('fresh', 'puffy', 12);
    expect(f.gust).toBeGreaterThan(1.7);
    expect(f.heel).toBeGreaterThan(65);
  });

  it('keeps them on their feet in a moderate, shifty breeze', () => {
    expect(felt('medium', 'oscillating', 12).heel).toBeLessThan(50);
  });
});

describe('Waves', () => {
  const amp = (sea: NonNullable<ReturnType<typeof makeSea>>, hdg: number, spd: number, L = 1) => {
    let pitch = 0, heave = 0;
    for (let t = 0; t < 30; t += 0.05) {
      const m = hullMotion(sea, 0.3 * t, 0.2 * t, t, hdg, spd, L);
      pitch = Math.max(pitch, Math.abs(m.pitch)); heave = Math.max(heave, Math.abs(m.heave));
    }
    return { pitch, heave };
  };

  it('bounces her lightly punching into chop, and rides her longer and higher over rolling waves', () => {
    const chop = makeSea('chop', 0, 1, 9.5)!, rough = makeSea('rough', 0, 1, 15)!;
    const upChop = amp(chop, 40, 1), upRough = amp(rough, 40, 1.1);
    expect(upChop.pitch).toBeLessThan(4.5);
    expect(upRough.pitch).toBeLessThan(7);
    expect(upRough.heave).toBeGreaterThan(upChop.heave * 1.8);
  });

  it("can't follow waves much shorter than she is", () => {
    const short = { ...makeSea('chop', 0, 1, 9.5)! };
    short.trains = short.trains.slice(2); // just the short chop, half a metre long
    expect(amp(short, 0, 1, 1).pitch).toBeLessThan(0.8);
  });

  it('builds the waves with the breeze', () => {
    const light = makeSea('chop', 0, 1, 6)!, fresh = makeSea('chop', 0, 1, 16)!;
    expect(fresh.height).toBeGreaterThan(light.height * 2);
    expect(fresh.length).toBeGreaterThan(light.length);
    expect(makeSea('flat', 0, 1, 16)).toBeNull();
  });
});

describe('The start', () => {
  it('puts your boat nearest the bank, in front of the fleet as you look out', () => {
    for (const seed of [1, 2, 3, 4]) {
      const r = new Race({ classId: 'IOM', fleetSize: 8, level: 'state', windStrength: 'medium', windCharacter: 'oscillating', laps: 1, length: 'short', sequenceSeconds: 30, coach: 'off', autoTrim: true, seed, venue: 'lmryc' } as RaceSettings);
      const ca = r.controlArea();
      const ex = ca.b.x - ca.a.x, ey = ca.b.y - ca.a.y, el2 = ex * ex + ey * ey;
      const toBank = (b: Boat) => {
        const u = Math.max(0, Math.min(1, ((b.x - ca.a.x) * ex + (b.y - ca.a.y) * ey) / el2));
        return Math.hypot(b.x - (ca.a.x + ex * u), b.y - (ca.a.y + ey * u));
      };
      const me = r.player!;
      expect(r.boats.every(b => toBank(me) <= toBank(b))).toBe(true);
      expect(CLASSES[r.settings.classId].loa).toBe(me.cls.loa);
    }
  });
});
