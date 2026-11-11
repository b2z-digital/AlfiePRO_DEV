// Race simulator: how the boats sit and move. Heel from the breeze (more in a gust, less with a
// smaller rig), weather helm, riding the waves, the waves building with the wind, and where you
// start. Run with: npm test
import { describe, expect, it } from 'vitest';
import { Race } from '@/sim/engine';
import { rigPower, iomRig } from '@/sim/classes';
import { KN } from '@/sim/math';
import { divePress, heelStep, integrate, settleHeel, weatherHelm } from '@/sim/physics';
import { twaOf } from '@/sim/math';
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
    expect(peak).toBeGreaterThan(66);
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

  it('rounds her up only once she is heeled past about 25°, a few degrees in a puff and a lot when she is laid over', () => {
    const b = closeHauled(9.5);
    b.heel = 22; b.heelRate = 0;
    expect(weatherHelm(b)).toBe(0);
    b.heel = 40;
    const some = weatherHelm(b);
    b.heel = 60;
    expect(some).toBeGreaterThan(2);
    expect(some).toBeLessThan(8);
    expect(weatherHelm(b)).toBeGreaterThan(3 * some);
  });

  it('keeps sailing with the rudder left alone: a gust luffs her a little, then she bears away again', () => {
    const b = closeHauled(15, rigPower('IOM', 15));
    let before = b.twa, maxLuff = 0;
    for (let k = 0; k < 240; k++) {
      b.tws = (k >= 60 && k < 120 ? 22 : 15) * KN; // a 3-second gust of 22 knots
      b.rudder = 0;
      integrate(b, 0.05, k * 0.05);
      b.twa = twaOf(b.hdg, b.twd);
      if (k === 59) before = b.twa;
      if (k >= 60) maxLuff = Math.max(maxLuff, before - b.twa);
    }
    expect(maxLuff).toBeGreaterThan(2);               // she luffed in the gust
    expect(maxLuff).toBeLessThan(15);                 // but not into irons
    expect(Math.abs(before - b.twa)).toBeLessThan(1.5); // and came back down afterwards
    expect(b.spd).toBeGreaterThan(0.6);
  });
});

/** A boat running square on starboard in `kn` knots, settled, on the rig for a base breeze of `base` knots. */
function running(kn: number, base = kn, cls: 'IOM' | '10R' = 'IOM'): Boat {
  const r = new Race({ classId: cls, fleetSize: 2, level: 'state', windStrength: 'medium', windCharacter: 'steady', laps: 1, length: 'short', sequenceSeconds: 30, coach: 'off', autoTrim: true, seed: 3, noPlayer: true } as RaceSettings);
  const b = r.boats[0];
  const rp = base >= 20 ? 0.5 : base >= 12.5 ? 0.72 : 1;
  Object.assign(b, { tws: kn * KN, twd: 0, hdg: 178, twa: -178, tack: 'port', spd: 1.1, sheet: 0.16, rudder: 0, rot: 0, runPower: rp, rigPower: cls === 'IOM' ? rp : 1, dive: 0, pitch: 0 });
  settleHeel(b);
  return b;
}
/** Sail her for `s` seconds with a helm; returns the most she dived, heeled and turned off her course. */
function sail(b: Boat, s: number, helm: (t: number, b: Boat) => number) {
  let dive = 0, heel = 0, off = 0, minSpd = 99;
  const h0 = b.hdg;
  for (let k = 0; k < s / 0.05; k++) {
    b.rudder = helm(k * 0.05, b);
    integrate(b, 0.05, k * 0.05);
    b.twa = twaOf(b.hdg, b.twd);
    dive = Math.max(dive, b.dive); heel = Math.max(heel, Math.abs(b.heel)); off = Math.max(off, Math.abs(((b.hdg - h0 + 540) % 360) - 180));
    if (k * 0.05 > 2) minSpd = Math.min(minSpd, b.spd);
  }
  return { dive, heel, off, minSpd };
}

describe('Sheeting in', () => {
  it("leans her into it in a strong breeze: no snapping over past where she'll settle", () => {
    // Stopped on the line in 18 knots with the sails right out, then sheeted hard in.
    const b = closeHauled(18);
    b.spd = 0.2; b.sheet = 0.2; settleHeel(b);
    b.sheet = 1;
    let peak = 0, at1 = 0;
    for (let k = 0; k < 120; k++) { heelStep(b, 0.05, 42); peak = Math.max(peak, b.heel); if (k === 5) at1 = b.heel; }
    expect(at1).toBeLessThan(0.45 * b.heel);      // a third of a second in, she's under half way over
    expect(peak).toBeLessThan(b.heel * 1.06);     // and she never throws herself past it
    // Dumping the sheet still stands her up at once.
    const was = b.heel;
    b.sheet = 0.15;
    for (let k = 0; k < 12; k++) heelStep(b, 0.05, 42);
    expect(b.heel).toBeLessThan(0.55 * was);
  });
});

describe('Running pressed', () => {
  it('stays on her feet and level in an ordinary breeze', () => {
    const r = sail(running(10), 12, () => 0);
    expect(r.dive).toBe(0);
    expect(r.heel).toBeLessThan(8);
    expect(r.off).toBeLessThan(6);
  });

  it("in a gust too strong for her rig she buries her bow instead of rolling over, slows, and darts off to one side", () => {
    const b = running(19, 10);
    const r = sail(b, 12, () => 0);
    expect(r.dive).toBeGreaterThan(0.85);          // bow under
    expect(r.heel).toBeLessThan(30);               // she didn't just roll onto her side
    expect(r.minSpd).toBeLessThan(0.85);           // and it stopped her
    expect(r.off).toBeGreaterThan(30);             // then she broached
  });

  it('pitches bow down as she dives', () => {
    const b = running(19, 10);
    sail(b, 2.5, () => 0);
    expect(b.pitch).toBeLessThan(-6);
  });

  it('keeps her bow up if you weave her gently from side to side', () => {
    const straight = sail(running(17, 10), 10, () => 0);
    const weaving = sail(running(17, 10), 10, t => 0.32 * Math.sin((2 * Math.PI * t) / 2.6));
    expect(straight.dive).toBeGreaterThan(0.6);
    expect(weaving.dive).toBeLessThan(0.75 * straight.dive);
    expect(weaving.off).toBeLessThan(40);
  });

  it('presses a smaller rig and a longer hull less, and a boat that has come up onto a reach not at all', () => {
    const a = running(19, 10), bRig = running(19, 19), ten = running(19, 10, '10R');
    expect(divePress(bRig, 178)).toBeLessThan(divePress(a, 178) - 0.3);
    expect(divePress(ten, 178)).toBeLessThan(divePress(a, 178) - 0.2);
    expect(divePress(a, 110)).toBe(0);
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
    expect(f.heel).toBeGreaterThan(60); // (she eases a touch when overpowered, so a little less)
  });

  it('keeps them on their feet in a moderate, shifty breeze', () => {
    expect(felt('medium', 'oscillating', 12).heel).toBeLessThan(60);
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
  /** Sail a 16-boat fleet's start: where along the line each boat crossed (0 pin, 1 starboard end) and when. */
  const startOf = (level: 'club' | 'national', seed: number) => {
    const r = new Race({ classId: 'IOM', fleetSize: 16, level, windStrength: 'medium', windCharacter: 'oscillating', laps: 1, length: 'long', sequenceSeconds: 60, coach: 'off', autoTrim: true, seed, noPlayer: true, venue: 'lmryc' } as RaceSettings);
    const P = r.course.start.pin, S = r.course.start.stbd, len = Math.hypot(S.x - P.x, S.y - P.y);
    const at = (b: Boat) => ((b.x - P.x) * (S.x - P.x) + (b.y - P.y) * (S.y - P.y)) / (len * len);
    const u: number[] = [], when: number[] = [], spots: number[][] = [[], []];
    const done = new Set<string>();
    while (r.t < r.gunT + 14) {
      r.step();
      for (const [k, T] of [[0, 30], [1, 5]] as const) {
        if (!spots[k].length && r.gunT - r.t <= T) spots[k] = r.skippers.map(sk => (sk as unknown as { pre: { spot: number } } | null)?.pre.spot ?? 0);
      }
      for (const b of r.boats) if (b.started && !done.has(b.id)) { done.add(b.id); u.push(at(b)); when.push(r.t - r.gunT); }
    }
    when.sort((a, b) => a - b);
    return { r, u, median: when[Math.floor(when.length / 2)], lenL: len / r.boats[0].cls.loa, moved: spots[0].map((x, i) => Math.abs(spots[1][i] - x)) };
  };

  it('has a national fleet fight for the starboard end of a square line, and be on the line at the gun', () => {
    let atEnd = 0, top = 0, n = 0;
    const medians: number[] = [];
    for (const seed of [1, 2, 7, 8]) {
      const s = startOf('national', seed);
      // Somebody takes the end itself (within about two and a half lengths of the mark)...
      atEnd += s.u.some(x => x > 1 - 2.7 / s.lenL) ? 1 : 0;
      // ...and the front row is fuller towards it than towards the pin.
      top += s.u.filter(x => x > 0.75).length; n += s.u.length;
      medians.push(s.median);
      // They pick their piece of line and hold it: no chasing every swing of the wind from end to end.
      expect(s.moved.filter(d => d > 0.15).length).toBeLessThanOrEqual(2);
    }
    expect(atEnd).toBeGreaterThanOrEqual(3);
    expect(top / n).toBeGreaterThan(0.22);
    expect(medians.sort((a, b) => a - b)[1]).toBeLessThan(1.6);
  }, 120000);

  it('gives a club fleet two or three sharp starters, and they go for the end too', () => {
    const s = startOf('club', 3);
    const sharp = s.r.boats.filter(b => (b.persona?.startSense ?? 0) > 0.6);
    expect(sharp.length).toBeGreaterThanOrEqual(2);
    expect(sharp.length).toBeLessThanOrEqual(4);
    expect(s.r.boats.filter(b => b.persona && (b.persona.startSense ?? 0) < 0.2).length).toBeGreaterThanOrEqual(11);
    expect(s.u.filter(x => x > 0.85).length).toBeGreaterThanOrEqual(1);
  }, 60000);
});
