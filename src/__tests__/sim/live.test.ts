// Live races: several people, each on their own device, sail one race. Every device sails the whole
// race from everyone's inputs (stamped with the step they apply from), so the races must come out
// identical boat for boat, whichever seat a device is, and however the inputs arrive.
import { describe, expect, it } from 'vitest';
import { Race, type PlayerAct } from '@/sim/engine';
import { Rng } from '@/sim/math';
import type { CrewMember, RaceSettings } from '@/sim/types';

const crew: CrewMember[] = [
  { id: 'u1', name: 'Ann', sail: '12' },
  { id: 'u2', name: 'Ben', sail: '12' },
  { id: 'u3', name: 'Cal', sail: '7', autoTrim: false },
];
const base = {
  classId: 'IOM', fleetSize: 8, level: 'state', windStrength: 'medium', windCharacter: 'oscillating',
  laps: 1, length: 'short', sequenceSeconds: 30, coach: 'off', autoTrim: true, seed: 9, venue: 'lmryc', seaState: 'chop', crew,
} as RaceSettings;

/** One person's helm for a race: a course that changes now and then, a tack or two, a hail. */
function helmOf(seat: number, steps: number) {
  const r = new Rng(100 + seat);
  const input: [number, number, number][] = [[0, 0, 1]];
  const acts: [number, PlayerAct][] = [];
  for (let st = 10; st < steps; st += 10) {
    if (r.chance(0.15)) input.push([st, Math.round(r.range(-0.5, 0.5) * 1000) / 1000, Math.round(r.range(0.6, 1) * 1000) / 1000]);
    if (r.chance(0.01)) acts.push([st, r.chance(0.5) ? 'tack' : 'hail']);
  }
  return { input, acts };
}

/** How often each person's device sends a tick of inputs, in steps. */
const TICKS = [3, 2, 5];

/**
 * A device's race. Each person's device sends their inputs in ticks, 8 steps ahead of its own clock
 * (the input delay); they reach this device `lag[seat]` steps later. The clocks run on regardless
 * (n is real time, in steps), and this device steps whenever it has everyone's inputs for the next
 * step. When someone leaves (`leave`), the host hands her boat to an AI skipper from the first step
 * she sent nothing for; the notice reaches every device a little later.
 */
function sail(seat: number, steps: number, lag = [0, 0, 0], leave?: { seat: number; at: number }) {
  const race = new Race({ ...base, seat });
  const helms = crew.map((_, k) => helmOf(k, steps));
  const sent = crew.map(() => 0);
  const upToAt = (k: number, n: number) => Math.min(steps, Math.max(0, Math.floor((n + 8) / TICKS[k]) * TICKS[k]));
  const last = leave ? upToAt(leave.seat, leave.at - 1) : Infinity;
  let stalls = 0;
  for (let n = 0; n < steps * 3 && race.step_ < steps && !race.ended; n++) {
    crew.forEach((_, k) => {
      if (n < lag[k]) return;
      const upTo = Math.min(upToAt(k, n - lag[k]), leave && k === leave.seat ? last : Infinity);
      if (upTo > sent[k]) {
        const h = helms[k];
        race.feed(k, upTo, h.input.filter(e => e[0] >= sent[k] && e[0] < upTo), h.acts.filter(e => e[0] >= sent[k] && e[0] < upTo));
        sent[k] = upTo;
      }
    });
    if (leave && n >= leave.at + 6 + seat && race.crew[leave.seat].aiFrom === Infinity) race.handOver(leave.seat, last);
    const before = race.step_;
    race.step();
    if (race.step_ === before) stalls++;
  }
  return { race, stalls, last };
}

const state = (r: Race) => r.boats.map(b => [b.x, b.y, b.hdg, b.spd, b.heel, b.legIndex, b.penalty.owed, b.finished ? b.finishTime : -1].join(',')).join('|');

describe('Live races', () => {
  it('seats the crew in the first boats with their own numbers, the AI boats clear of them', () => {
    const r = new Race({ ...base, seat: 1 });
    expect(r.boats.slice(0, 3).map(b => [b.name, b.sail, b.human])).toEqual([['Ann', '12', true], ['Ben', '13', true], ['Cal', '7', true]]);
    expect(r.player?.name).toBe('Ben');
    expect(r.boats.slice(3).every(b => !b.human && !['12', '13', '7'].includes(b.sail))).toBe(true);
    expect(r.live).toBe(true);
  });

  it('waits for everyone: no step until every seat has sent its inputs for it', () => {
    const r = new Race({ ...base, seat: 0 });
    expect(r.canStep()).toBe(false);
    r.step();
    expect(r.step_).toBe(0);
    r.feed(0, 5, [[0, 0, 1]], []); r.feed(1, 5, [], []);
    expect(r.waitingFor()).toEqual([2]);
    r.feed(2, 3, [], []);
    for (let k = 0; k < 10; k++) r.step();
    expect(r.step_).toBe(3);
  });

  it('sails the same race on every device, whichever seat it is and however the inputs arrive', () => {
    const steps = 2400; // two minutes: through the start and up the first beat
    const a = sail(0, steps, [0, 0, 0]);
    const b = sail(1, steps, [0, 3, 1]);
    const c = sail(2, steps, [2, 0, 4]);
    expect(a.race.step_).toBe(steps);
    expect(state(b.race)).toBe(state(a.race));
    expect(state(c.race)).toBe(state(a.race));
    expect(b.race.incidents.map(i => `${i.t}:${i.rule}:${i.offender}`)).toEqual(a.race.incidents.map(i => `${i.t}:${i.rule}:${i.offender}`));
  }, 120000);

  it('hands a boat to an AI skipper at the same step on every device when her person leaves', () => {
    const steps = 2400;
    const a = sail(0, steps, [0, 0, 0], { seat: 2, at: 900 });
    const b = sail(1, steps, [1, 0, 2], { seat: 2, at: 900 });
    expect(a.race.step_).toBe(steps);
    expect(state(b.race)).toBe(state(a.race));
    expect(a.race.crew[2].aiFrom).toBe(a.last);
    expect(b.race.crew[2].aiFrom).toBe(a.last);
    expect(a.race.boats[2].persona).toBeDefined(); // an AI skipper has her now
  }, 120000);
});
