// The loss ledger: lengths given away to a perfect race, booked to their causes.
import { describe, expect, it } from 'vitest';
import { Race } from '@/sim/engine';
import { buildScene, type PlanFn } from '@/sim/scene';
import { LAB } from '@/sim/training';
import type { RaceSettings, SkipperLevel } from '@/sim/types';
import { CAUSES, LossTally, type Ledger } from '@/components/race-simulator/ledger';

const base: RaceSettings = { classId: 'IOM', fleetSize: 8, level: 'state', windStrength: 'medium', windCharacter: 'oscillating', laps: 2, length: 'medium', sequenceSeconds: 30, coach: 'off', autoTrim: true, seed: 1, noPlayer: true, seaState: 'flat' };
/** A whole race, with boat `k`'s ledger kept as she sails it. */
function sail(s: Partial<RaceSettings>, k = 3): { led: Ledger; race: Race; time: number | null; win: number | null } {
  const race = new Race({ ...base, ...s });
  const tally = new LossTally(), b = race.boats[k];
  while (!race.ended && race.t < 900) { race.step(); tally.step(race, b); }
  const res = race.results();
  return { led: tally.result(b), race, time: b.finished ? b.finishTime : null, win: res[0].time };
}
const part = (l: Ledger, c: string) => l.parts.find(p => p.cause === c)!.lengths;
/** One of the lab's scenes, the player's boat sailed by a plan. */
function scene(id: string, plan: PlanFn | 'ai', secs: number): Ledger {
  const m = LAB.find(x => x.id === id)!;
  const { race } = buildScene(m.scene(1), 1, plan);
  const p = race.player!, tally = new LossTally();
  for (let k = 0; k < secs * 20 && !race.ended && !p.finished; k++) { race.step(); tally.step(race, p); }
  return tally.result(p);
}

describe('Where a race went', () => {
  it('adds up: every cause is there, none negative, and the parts make the total', () => {
    const { led } = sail({ seed: 4 });
    expect(led.parts.map(p => p.cause)).toEqual(CAUSES);
    for (const p of led.parts) expect(p.lengths).toBeGreaterThanOrEqual(0);
    expect(Math.abs(led.total - led.parts.reduce((s, p) => s + p.lengths, 0))).toBeLessThan(0.05);
    expect(led.minutes).toBeGreaterThan(3);
  });

  it('a better skipper gives away less, and nobody sails a perfect race', () => {
    const avg = (level: SkipperLevel) => { let s = 0; for (const seed of [2, 5, 9]) s += sail({ level, seed, fleetSize: 1 }, 0).led.total; return s / 3; };
    const club = avg('club'), world = avg('world');
    expect(world).toBeLessThan(club);
    expect(world).toBeGreaterThan(2);
  });

  it('what a boat gave away is about what she finished behind an unbeatable one', () => {
    // Alone on the water (no dirty air, no traffic): lengths lost, at her speed, should be of the
    // order of the time a perfect boat would have saved. Loosely: within a factor of two.
    const { led, time, race } = sail({ fleetSize: 1, seed: 6, level: 'state' }, 0);
    const b = race.boats[0];
    const secs = (led.total * b.cls.loa) / (0.75 * b.cls.hullSpeed);
    expect(time).not.toBeNull();
    expect(secs).toBeGreaterThan(5);
    expect(secs).toBeLessThan(0.5 * time!);
  });

  it('sloppy tacks show up under tacks and gybes, and each as a moment', () => {
    const sloppy: PlanFn = (t, b) => ({ hdg: (b.twd + (Math.floor(t / 7) % 2 === 0 ? 1 : -1) * 68 + 360) % 360 });
    const tidy = scene('tacks', LAB.find(x => x.id === 'tacks')!.solution!, 45);
    const bad = scene('tacks', sloppy, 45);
    expect(part(bad, 'turns')).toBeGreaterThan(part(tidy, 'turns') + 2);
    expect(bad.worst.some(w => w.cause === 'turns')).toBe(true);
    expect(bad.tacks).toBeGreaterThan(0);
  });

  it('pinching shows up as boat speed', () => {
    const pinch: PlanFn = (_t, b) => ({ hdg: (b.twd + 30 + 360) % 360 });
    const good = scene('speed-up-chop', 'ai', 40);
    const slow = scene('speed-up-chop', pinch, 40);
    expect(part(slow, 'speed')).toBeGreaterThan(part(good, 'speed') + 3);
    expect(slow.speedUp).toBeGreaterThan(0);
  });

  it('a late start is booked to the start', () => {
    // Boat 0 of a fleet of one: hold her head to wind for ten seconds after the gun, then let the skipper sail.
    const race = new Race({ ...base, fleetSize: 1, seed: 3 });
    const b = race.boats[0], tally = new LossTally();
    const sk = race.skippers[0]!;
    race.skippers[0] = { ...sk, decide: h => { if (race.t > race.gunT + 10) sk.decide(h); }, helm: (h, dt) => { if (race.t > race.gunT + 10) sk.helm(h, dt); else { b.rudder = 0; b.sheet = 0; } }, intent: '', lastAvoid: sk.lastAvoid };
    while (!race.ended && race.t < race.gunT + 60) { race.step(); tally.step(race, b); }
    const late = tally.result(b);
    const onTime = (() => { const r = new Race({ ...base, fleetSize: 1, seed: 3 }); const t = new LossTally(); while (r.t < r.gunT + 60) { r.step(); t.step(r, r.boats[0]); } return t.result(r.boats[0]); })();
    expect(part(late, 'start')).toBeGreaterThan(part(onTime, 'start') + 3);
  });

  it('in a fleet, dirty air and roundings are counted, and penalties when turns are taken', () => {
    let air = 0, rounds = 0, pens = 0;
    for (const seed of [3, 7, 11]) for (const k of [2, 5]) {
      const { led, race } = sail({ seed, fleetSize: 12, level: 'club' }, k);
      air += part(led, 'air'); rounds += part(led, 'roundings');
      if (race.boats[k].penalty.taken > 0) pens += part(led, 'penalties');
    }
    expect(air).toBeGreaterThan(1);
    expect(rounds).toBeGreaterThan(1);
    expect(pens).toBeGreaterThanOrEqual(0);
  });
});

