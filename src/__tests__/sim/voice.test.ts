// Race simulator: Alfie's spoken coaching and the sound of the pond. Run with: npm test
import { describe, expect, it } from 'vitest';
import { Race } from '@/sim/engine';
import { KN } from '@/sim/math';
import type { Boat, RaceSettings } from '@/sim/types';
import { CoachVoice, cueCall, handlingCall } from '@/components/race-simulator/coach';
import { ambienceMix } from '@/components/race-simulator/ambience';

function boat(over: Partial<Boat>): Boat {
  const r = new Race({ classId: 'IOM', fleetSize: 2, level: 'state', windStrength: 'medium', windCharacter: 'steady', laps: 1, length: 'short', sequenceSeconds: 30, coach: 'off', autoTrim: false, seed: 3, noPlayer: true } as RaceSettings);
  return Object.assign(r.boats[0], { started: true, tws: 10 * KN, twd: 0, hdg: 318, twa: 42, tack: 'stbd', spd: 1, sheet: 1, heel: 20, dive: 0 }, over);
}

describe("Alfie's calls", () => {
  it('calls the handling, as it happens', () => {
    expect(handlingCall(boat({}), false)).toBeNull();                                   // sailing well: nothing to say
    expect(handlingCall(boat({ twa: 10, hdg: 350 }), false)?.say).toMatch(/irons/);
    expect(handlingCall(boat({ twa: 30, hdg: 330 }), false)?.say).toMatch(/Bear away/);
    expect(handlingCall(boat({ sheet: 0.6 }), false)?.say).toBe('Sheet right in.');
    expect(handlingCall(boat({ twa: 100, hdg: 260, sheet: 0.95 }), false)?.say).toBe('Ease the sails.');
    expect(handlingCall(boat({ heel: 50 }), false)?.say).toMatch(/Ease through the gust/);
    expect(handlingCall(boat({ twa: 175, hdg: 185, sheet: 0.16, dive: 0.5 }), false)?.say).toMatch(/Weave/);
    expect(handlingCall(boat({ twa: 175, hdg: 185, sheet: 0.16, dive: 1 }), false)?.urgent).toBe(true);
  });

  it("leaves the trim alone when the boat trims herself, and says nothing before you've started", () => {
    expect(handlingCall(boat({ sheet: 0.6 }), true)).toBeNull();
    expect(handlingCall(boat({ sheet: 0.6, started: false }), false)).toBeNull();
  });

  it('turns a coaching line into a call: urgent ones at once, the same words the same call', () => {
    const go = cueCall({ topic: 'The start', text: '', watch: null, tone: 'plain', say: 'Go now! Bear away and sheet in.' })!;
    expect(go.urgent).toBe(true);
    const a = cueCall({ topic: 'The start', text: '', watch: null, tone: 'plain', say: 'Hold. Go in 4.' })!, b = cueCall({ topic: 'The start', text: '', watch: null, tone: 'plain', say: 'Hold. Go in 3.' })!;
    expect(a.key).toBe(b.key);
    expect(cueCall({ topic: 'x', text: 'no spoken form', watch: null, tone: 'plain' })).toBeNull();
  });

  it("doesn't chatter: a call must hold for a second, calls are spaced out, and aren't repeated at once", () => {
    const v = new CoachVoice();
    const pinch = { key: 'pinch', say: 'Pinching. Bear away a touch.', again: 9 }, sheet = { key: 'sheet', say: 'Sheet right in.', again: 9 };
    expect(v.pick(0, pinch, false)).toBeNull();                 // just come up
    expect(v.pick(0.5, pinch, false)).toBeNull();
    expect(v.pick(1.1, pinch, false)).toBe(pinch.say);          // still true a second on: said
    expect(v.pick(2, pinch, false)).toBeNull();                 // not again straight away
    expect(v.pick(2.5, sheet, false)).toBeNull();
    expect(v.pick(3.6, sheet, false)).toBeNull();               // too soon after the last call
    expect(v.pick(5, sheet, false)).toBe(sheet.say);
    expect(v.pick(8, pinch, false)).toBeNull();                 // the pinch again, back within its nine seconds
    expect(v.pick(9, pinch, false)).toBeNull();
    expect(v.pick(11, pinch, false)).toBe(pinch.say);
  });

  it("waits for a hail to finish, but an urgent call goes straight out", () => {
    const v = new CoachVoice();
    const sheet = { key: 'sheet', say: 'Sheet right in.' }, go = { key: 'go', say: 'Go now! Bear away and sheet in.', urgent: true };
    v.pick(0, sheet, true);
    expect(v.pick(2, sheet, true)).toBeNull();
    expect(v.pick(2.1, go, true)).toBe(go.say);
  });
});

describe('The sound of the pond', () => {
  it('has no wind to hear in light airs, only the water and the birds', () => {
    const m = ambienceMix({ kn: 4, fast: 0.4, sea: 0 });
    expect(m.wind).toBe(0);
    expect(m.whistle).toBe(0);
    expect(m.lap).toBeGreaterThan(0.3);
    expect(m.birds).toBe(1);
  });

  it('brings the wind and water up through a medium breeze to a fresh one, and quietens the birds', () => {
    const light = ambienceMix({ kn: 4, fast: 0.4, sea: 0 }), medium = ambienceMix({ kn: 10, fast: 0.8, sea: 0.5 }), fresh = ambienceMix({ kn: 17, fast: 1, sea: 1 });
    expect(medium.wind).toBeGreaterThan(0.15);
    expect(fresh.wind).toBeGreaterThan(2 * medium.wind);
    expect(medium.lap).toBeGreaterThan(light.lap);
    expect(fresh.lap).toBeGreaterThan(medium.lap);
    expect(fresh.whistle).toBeGreaterThan(0);
    expect(medium.whistle).toBe(0);
    expect(fresh.birds).toBeLessThan(0.5);
    expect(fresh.wash).toBeGreaterThan(light.wash);
  });
});
