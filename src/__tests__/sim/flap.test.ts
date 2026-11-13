// Sails flogging: both sails flap when the wind's pressure comes off them (head to wind, or sheeted
// out further than the wind fills), in time with the sound of the film cracking, and a sail that's
// sheeted in and full does neither.
import { describe, expect, it } from 'vitest';
import { Race } from '@/sim/engine';
import type { RaceSettings } from '@/sim/types';
import { sailSet } from '@/components/race-simulator/boat3d';
import { flapForce, flapHz, flapLoud, flapNear, flapSeed, flapWave } from '@/components/race-simulator/flap';
import { flapCracks } from '@/components/race-simulator/flapSound';

const settings = { classId: 'IOM', fleetSize: 6, level: 'state', windStrength: 'medium', windCharacter: 'steady', laps: 1, length: 'short', sequenceSeconds: 30, coach: 'off', autoTrim: true, seed: 5, player: { name: 'Sam S' } } as RaceSettings;

describe('The flap clock', () => {
  it('flaps faster as it blows, and a jib faster than a main', () => {
    expect(flapHz(7)).toBeGreaterThan(flapHz(2));
    expect(flapHz(4, 'jib')).toBeGreaterThan(flapHz(4, 'main'));
    expect(flapForce(8)).toBeGreaterThan(flapForce(1.5));
    // Light airs: a slow, gentle sway and barely a sound, well short of a medium breeze's flapping.
    expect(flapHz(2.2)).toBeLessThan(1.5);
    expect(flapForce(2.2)).toBeLessThan(0.3 * flapForce(4.3) + 0.05);
    expect(flapLoud(1, 2.2)).toBeLessThan(0.25 * flapLoud(1, 4.3));
  });

  it('pops across about twice a cycle, unevenly, and no two boats in step', () => {
    const hz = flapHz(4), seed = flapSeed('39', 'main');
    let cross = 0, was = flapWave(0, hz, seed);
    const gaps: number[] = []; let last = 0;
    for (let t = 0.001; t < 10; t += 0.001) {
      const w = flapWave(t, hz, seed);
      expect(Math.abs(w)).toBeLessThanOrEqual(1);
      if (w >= 0 !== was >= 0) { cross++; gaps.push(t - last); last = t; }
      was = w;
    }
    expect(cross).toBeGreaterThan(2 * hz * 10 - 3); expect(cross).toBeLessThan(2 * hz * 10 + 3);
    expect(Math.max(...gaps.slice(1)) / Math.min(...gaps.slice(1))).toBeGreaterThan(1.3);
    expect(flapSeed('39', 'main')).not.toBe(flapSeed('52', 'main'));
    expect(flapSeed('39', 'main')).not.toBe(flapSeed('39', 'jib'));
  });

  it('is silent from a full sail, sharp from one flogging in a breeze, and fades with distance', () => {
    expect(flapLoud(0.1, 6)).toBe(0);
    expect(flapLoud(1, 7)).toBeGreaterThan(0.8);
    expect(flapLoud(1, 1.5)).toBeLessThan(0.3);
    expect(flapNear(0)).toBe(1);
    expect(flapNear(6)).toBeLessThan(0.5);
    expect(flapNear(20)).toBe(0);
  });
});

describe('When the sails flog', () => {
  it('both sails are full sheeted in on the wind, and reaching with the sheet set right', () => {
    expect(sailSet(45, 1, 4, false)).toMatchObject({ luff: 0, luffJib: 0 });
    const reach = sailSet(90, 0.05, 4, false);
    expect(reach.luff).toBe(0); expect(reach.luffJib).toBe(0);
  });

  it('head to wind both flog, the jib letting go a touch before the main as she comes up', () => {
    expect(sailSet(5, 1, 4, false)).toMatchObject({ luff: 1, luffJib: 1 });
    // Somewhere on the way up from close-hauled, the jib has started and the main hasn't.
    const steps = Array.from({ length: 40 }, (_, k) => sailSet(45 - k, 1, 4, false));
    expect(steps.some(s => s.luffJib > 0.05 && s.luff < 0.02)).toBe(true);
    for (const s of steps) expect(s.luffJib).toBeGreaterThanOrEqual(s.luff - 1e-9);
  });

  it('sheeted right out on the wind, they stream and flog', () => {
    expect(sailSet(45, 0, 4, false)).toMatchObject({ luff: 1, luffJib: 1 });
  });
});

describe('The cracks', () => {
  const boat = (r: Race, over: Partial<Race['boats'][number]>) => ({ ...r.boats[0], ...over });

  it('none from a boat sailing full; a steady rattle from one head to wind, each as a sail pops across', () => {
    const r = new Race(settings);
    const p = r.boats[0];
    const full = boat(r, { hdg: (p.twd + 45) % 360, sheet: 1, tws: 4 });
    const side = new Map<string, number>();
    let n = 0;
    for (let t = 0; t < 5; t += 1 / 60) n += flapCracks([full], t, full, side).due.length;
    expect(n).toBe(0);
    const stalled = boat(r, { hdg: p.twd, sheet: 0.4, tws: 4 });
    const side2 = new Map<string, number>();
    let main = 0, jib = 0, shake = 0;
    for (let t = 0; t < 5; t += 1 / 60) {
      const c = flapCracks([stalled], t, stalled, side2);
      main += c.due.filter(x => x.kind === 'main').length; jib += c.due.filter(x => x.kind === 'jib').length; shake = Math.max(shake, c.shake);
    }
    // About two a cycle for each sail, the jib's quicker.
    expect(main).toBeGreaterThan(2 * flapHz(4) * 5 - 4); expect(main).toBeLessThan(2 * flapHz(4) * 5 + 4);
    expect(jib).toBeGreaterThan(main);
    expect(shake).toBeGreaterThan(0.3);
  });

  it('your own boat is loud, one across the pond is not heard, and a finished boat is left out', () => {
    const r = new Race(settings);
    const p = r.boats[0];
    const me = boat(r, { id: 'me', hdg: p.twd, sheet: 0.4, tws: 5, x: 0, y: 0 });
    const far = boat(r, { id: 'far', sail: '77', hdg: p.twd, sheet: 0.4, tws: 5, x: 40 * p.cls.loa, y: 0 });
    const done = boat(r, { id: 'done', sail: '78', hdg: p.twd, sheet: 0.4, tws: 5, x: 1, y: 0, finished: true });
    const side = new Map<string, number>();
    let heard = 0;
    for (let t = 0; t < 4; t += 1 / 60) for (const c of flapCracks([me, far, done], t, me, side).due) { heard++; expect(c.gain).toBeGreaterThan(0.2); }
    expect(heard).toBeGreaterThan(20);
    expect([...side.keys()].every(k => k.startsWith('me:'))).toBe(true);
  });
});
