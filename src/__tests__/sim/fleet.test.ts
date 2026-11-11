// How a fleet sails: the approach to the windward mark (on the layline outside the zone, not
// tacking under the mark), prompt penalty turns, and a fleet that's a mix of skippers, each with
// her own strengths.
import { describe, expect, it } from 'vitest';
import { LEVELS, PERSONAS, knownFor, ownLevel, strengthsFor } from '@/sim/ai';
import { Race } from '@/sim/engine';
import { Rng } from '@/sim/math';
import { buildScene } from '@/sim/scene';
import type { RaceSettings, SkipperLevel, Strengths } from '@/sim/types';

const NONE: Strengths = { start: 0, speed: 0, tactics: 0, marks: 0, rules: 0 };
const fleetRace = (level: SkipperLevel, seed: number, fleetSize = 8) =>
  new Race({ classId: 'IOM', fleetSize, level, windStrength: 'medium', windCharacter: 'oscillating', laps: 1, length: 'medium', sequenceSeconds: 60, coach: 'off', autoTrim: true, seed, noPlayer: true } as RaceSettings);

describe("A skipper's own strengths", () => {
  it('move one part of her sailing a level up or down, and leave the rest alone', () => {
    const base = LEVELS.national;
    const sharp = ownLevel('national', { ...NONE, start: 1 });
    // A national skipper who starts like a world one...
    for (const k of ['startMargin', 'startSigma', 'lineSigma', 'startSense'] as const) expect(sharp[k]).toBeCloseTo(LEVELS.world[k], 6);
    // ...and sails the rest of the race like the national skipper she is.
    for (const k of ['noise', 'trimNoise', 'shiftThr', 'layMargin', 'roundIn', 'reaction', 'misjudge'] as const) expect(sharp[k]).toBe(base[k]);
    const loose = ownLevel('national', { ...NONE, marks: -1 });
    expect(loose.roundIn).toBeCloseTo(LEVELS.state.roundIn, 6);
    expect(loose.roundOut).toBeCloseTo(LEVELS.state.roundOut, 6);
    // Half a strength is half the step.
    expect(ownLevel('national', { ...NONE, speed: 0.5 }).noise).toBeCloseTo((base.noise + LEVELS.world.noise) / 2, 6);
    expect(ownLevel('national', NONE)).toEqual(base);
  });

  it('carry on a little past the ends of the ladder, and never into nonsense', () => {
    const best = ownLevel('world', { start: 1.4, speed: 1.4, tactics: 1.4, marks: 1.4, rules: 1.4 });
    const worst = ownLevel('club', { start: -1.4, speed: -1.4, tactics: -1.4, marks: -1.4, rules: -1.4 });
    expect(best.noise).toBeLessThan(LEVELS.world.noise);
    expect(worst.noise).toBeGreaterThan(LEVELS.club.noise);
    for (const lv of [best, worst]) {
      for (const [k, v] of Object.entries(lv)) expect(v, k).toBeGreaterThanOrEqual(0);
      expect(lv.startSense).toBeLessThanOrEqual(1);
      expect(lv.tackRudder).toBeLessThanOrEqual(1);
    }
    // Nobody is given speed: a strength is only ever a skill a skipper has.
    expect(Object.keys(best).some(k => /speed|boost|power/i.test(k))).toBe(false);
  });

  it("come from the kind of skipper she is, with her form on the day", () => {
    const pin = PERSONAS.find(p => p.key === 'pin')!, shifty = PERSONAS.find(p => p.key === 'shifty')!;
    let pinStart = 0, pinTactics = 0, shiftyTactics = 0, shiftyStart = 0;
    const seen = new Set<string>();
    for (let k = 0; k < 40; k++) {
      const a = strengthsFor(pin, new Rng(100 + k)), b = strengthsFor(shifty, new Rng(100 + k));
      pinStart += a.start; pinTactics += a.tactics; shiftyTactics += b.tactics; shiftyStart += b.start;
      for (const v of [...Object.values(a), ...Object.values(b)]) { expect(v).toBeGreaterThanOrEqual(-1.4); expect(v).toBeLessThanOrEqual(1.4); }
      seen.add(JSON.stringify(a));
    }
    // The pin hunter starts better than she reads the shifts; the shift player the other way about.
    expect(pinStart / 40).toBeGreaterThan(pinTactics / 40 + 0.8);
    expect(shiftyTactics / 40).toBeGreaterThan(shiftyStart / 40 + 0.8);
    // No two days the same, and the same day always the same.
    expect(seen.size).toBeGreaterThan(30);
    expect(strengthsFor(pin, new Rng(7))).toEqual(strengthsFor(pin, new Rng(7)));
  });

  it('are said in a few words', () => {
    expect(knownFor({ ...NONE, start: 0.8 })).toBe('Sharp off the line');
    expect(knownFor({ ...NONE, marks: 0.9, tactics: -0.6 })).toBe('Tight at the marks, misses the shifts');
    expect(knownFor({ ...NONE, speed: -0.6 })).toBe('Short of pace');
    // (Not every soft spot is worth a word, and a middling strength isn't a name to live up to.)
    expect(knownFor({ ...NONE, speed: -0.5 })).toBe('Solid all round');
    expect(knownFor({ start: 0.2, speed: 0.1, tactics: -0.2, marks: 0, rules: 0.25 })).toBe('Solid all round');
    expect(knownFor(undefined)).toBe('');
  });
});

describe('A fleet', () => {
  it('is a mix of skippers: different kinds, different strengths, the same every time for a seed', () => {
    const r = fleetRace('national', 4, 12);
    const all = r.boats.map(b => b.persona!);
    for (const p of all) expect(p.strengths).toBeDefined();
    expect(new Set(all.map(p => p.key)).size).toBeGreaterThanOrEqual(8);
    expect(new Set(all.map(p => knownFor(p.strengths))).size).toBeGreaterThanOrEqual(4);
    // Somebody is clearly good at each part of the race, and the fleet isn't all on form.
    for (const k of ['start', 'tactics', 'marks'] as const) expect(Math.max(...all.map(p => p.strengths![k]))).toBeGreaterThan(0.5);
    const form = all.map(p => (p.strengths!.start + p.strengths!.speed + p.strengths!.tactics + p.strengths!.marks) / 4);
    expect(Math.max(...form) - Math.min(...form)).toBeGreaterThan(0.3);
    // Their skills really are theirs: the skippers aren't all sailing with the level's own numbers.
    const sk = r.skippers.map(s => (s as unknown as { lv: { startSigma: number; roundIn: number } }).lv);
    expect(new Set(sk.map(l => l.startSigma.toFixed(4))).size).toBeGreaterThan(6);
    expect(new Set(sk.map(l => l.roundIn.toFixed(4))).size).toBeGreaterThan(6);
    const again = fleetRace('national', 4, 12);
    expect(again.boats.map(b => b.persona!.strengths)).toEqual(all.map(p => p.strengths));
  });
});

// One boat on her own, a few lengths from the windward mark (left to port), in a steady breeze.
function approach(at: [number, number], tack: 'port' | 'stbd', level: SkipperLevel = 'national') {
  const { race, t0 } = buildScene({ origin: 'W', settings: { flatWind: true, windStrength: 'medium' }, boats: [{ role: 'You', at, hdg: tack === 'stbd' ? 315.5 : 44.5, helm: 'player', persona: 'steady', level }] }, 3, 'ai');
  const p = race.player!, L = p.cls.loa;
  const M = race.course.byId[(race.course.legs[0] as { rounding: { markId: string } }).rounding.markId].p;
  const tacks: number[] = [];
  let last = p.lastHtwT, slowest = 1;
  while (p.legIndex === 0 && race.t - t0 < 90) {
    race.step();
    const d = Math.hypot(p.x - M.x, p.y - M.y) / L;
    if (p.lastHtwT !== last) { last = p.lastHtwT; tacks.push(d); }
    if (d < 4 && race.t - p.lastHtwT > 4) slowest = Math.min(slowest, p.spd / (p.targetSpd || 1));
  }
  return { rounded: p.legIndex > 0, secs: race.t - t0, tacks, slowest, touched: race.incidents.some(i => i.rule === '31') };
}

describe('The approach to the windward mark', () => {
  it('from the left on port: one tack, on the layline, and round', () => {
    const r = approach([-3, -9], 'port');
    expect(r.rounded).toBe(true);
    expect(r.touched).toBe(false);
    expect(r.tacks).toHaveLength(1);
  });

  it('on starboard well under the layline: out to it and back, with both tacks made outside the zone', () => {
    const r = approach([1, -9], 'stbd');
    expect(r.rounded).toBe(true);
    expect(r.touched).toBe(false);
    expect(r.tacks).toHaveLength(2);
    for (const d of r.tacks) expect(d).toBeGreaterThan(4);
  });

  it('on starboard a touch short, close in: she squeezes round without a tack', () => {
    // (Laying the mark itself by a little, but not the room she'd choose to round with.)
    const r = approach([2.9, -2.6], 'stbd');
    expect(r.rounded).toBe(true);
    expect(r.touched).toBe(false);
    expect(r.tacks).toHaveLength(0);
    expect(r.slowest).toBeGreaterThan(0.45);
  });

  it('is sailed that way at every level', () => {
    for (const level of ['club', 'state', 'national', 'world'] as SkipperLevel[]) {
      const r = approach([-3, -9], 'port', level);
      expect(r.rounded, level).toBe(true);
      expect(r.tacks.length, level).toBeLessThanOrEqual(2);
    }
  });

  it('in a fleet: few tacks in the zone, few boats tacking three times on the way in, turns taken promptly', () => {
    let approaches = 0, inZone = 0, three = 0, r183 = 0;
    const waits: number[] = [];
    for (const seed of [1, 2, 3]) {
      const r = fleetRace('national', seed);
      const L = r.boats[0].cls.loa;
      const M = r.course.byId[(r.course.legs[0] as { rounding: { markId: string } }).rounding.markId].p;
      const st = r.boats.map(b => ({ last: b.lastHtwT, in8: 0, in4: 0, done: false, owedAt: -1 }));
      while (!r.ended && r.t < r.gunT + 240 && r.boats.some(b => b.legIndex === 0)) {
        r.step();
        r.boats.forEach((b, i) => {
          const z = st[i];
          if (b.penalty.owed > 0 && z.owedAt < 0) z.owedAt = r.t;
          if (b.penalty.owed === 0 && z.owedAt >= 0) { waits.push(r.t - Math.max(z.owedAt, r.gunT)); z.owedAt = -1; }
          if (z.done) return;
          if (b.legIndex > 0) { z.done = true; approaches++; inZone += z.in4; if (z.in8 >= 3) three++; return; }
          const d = Math.hypot(b.x - M.x, b.y - M.y) / L;
          if (b.lastHtwT !== z.last) { z.last = b.lastHtwT; if (!b.penalty.active && b.started) { if (d < 8) z.in8++; if (d < 4) z.in4++; } }
        });
      }
      r183 += r.incidents.filter(i => i.rule === '18.3').length;
    }
    expect(approaches).toBeGreaterThanOrEqual(22);
    // (Before this was put right: 1.3 tacks in the zone an approach, and 44% of boats tacking three times or more.)
    expect(inZone / approaches).toBeLessThan(0.6);
    expect(three / approaches).toBeLessThan(0.3);
    expect(r183).toBeLessThanOrEqual(1);
    // A turn owed is taken when there's room, and she makes room: half of them inside a minute, and
    // nobody carries one for half the race. (Before: half took a minute and a half, the slowest four minutes.)
    waits.sort((a, b) => a - b);
    if (waits.length) {
      expect(waits[Math.floor(waits.length / 2)]).toBeLessThan(60);
      expect(waits[waits.length - 1]).toBeLessThan(150);
    }
  }, 180000);
});
