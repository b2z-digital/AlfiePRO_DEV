// Where you begin: below the middle of the line with either end in reach, wherever the fleet is laid out.
import { describe, expect, it } from 'vitest';
import { toCourse } from '@/sim/course';
import { Race } from '@/sim/engine';
import { dist } from '@/sim/math';
import type { RaceSettings } from '@/sim/types';
import { VENUES } from '@/sim/venues';

const base: RaceSettings = { classId: 'IOM', fleetSize: 8, level: 'state', windStrength: 'medium', windCharacter: 'oscillating', laps: 2, length: 'medium', sequenceSeconds: 60, coach: 'off', autoTrim: true, seed: 1, seaState: 'flat' };

/** Every race a member could set up: each venue (and the pond), each course length, small and big fleets. */
function* setups(): Generator<Partial<RaceSettings>> {
  const venues: (string | undefined)[] = [undefined, ...Object.keys(VENUES)];
  for (const venue of venues) for (const length of ['short', 'medium', 'long'] as const) for (const fleetSize of [2, 6, 12, 16]) for (const seed of [1, 7]) {
    yield { venue, windFrom: venue ? VENUES[venue].winds?.[0]?.from : undefined, length, fleetSize, seed };
  }
}

describe('Where you start from', () => {
  it('is below the middle of the line, on starboard, clear of the fleet, in every race you can set up', () => {
    let n = 0;
    for (const s of setups()) {
      const race = new Race({ ...base, ...s });
      const me = race.player!, c = race.course, L = me.cls.loa;
      const half = dist(c.start.pin, c.start.stbd) / 2;
      const at = toCourse(c, me);
      const tag = JSON.stringify(s);
      expect(Math.abs(at.across), tag).toBeLessThanOrEqual(0.75 * half);
      expect(at.along, tag).toBeLessThan(-3 * L);
      expect(at.along, tag).toBeGreaterThan(-9.5 * L);
      expect(me.tack, tag).toBe('stbd');
      for (const b of race.boats) if (b !== me) expect(dist(b, me), tag).toBeGreaterThan(1.5 * L);
      n++;
    }
    expect(n).toBeGreaterThan(40);
  });

  it('leaves time to reach either end, even with a one-minute sequence', () => {
    for (const s of setups()) {
      const race = new Race({ ...base, ...s });
      const me = race.player!, c = race.course;
      // At a gentle 60% of hull speed, with 15 seconds in hand to set up.
      const secs = (p: { x: number; y: number }) => dist(me, p) / (0.6 * me.cls.hullSpeed);
      expect(Math.max(secs(c.start.pin), secs(c.start.stbd)), JSON.stringify(s)).toBeLessThan(45);
    }
  });

  it('the rest of the fleet is laid out as it was, and nobody is on top of anybody', () => {
    const race = new Race({ ...base, fleetSize: 12, seed: 4 });
    const L = race.boats[0].cls.loa;
    for (const a of race.boats) for (const b of race.boats) if (a !== b) expect(dist(a, b)).toBeGreaterThan(1.2 * L);
  });

  it('in a live race every helm starts inside the line, and the layout is the same from every seat', () => {
    const crew = ['A', 'B', 'C', 'D'].map((name, k) => ({ name, sail: String(11 + k) }));
    const from = (seat: number) => new Race({ ...base, fleetSize: 10, seed: 3, crew, seat });
    const r0 = from(0), r3 = from(3);
    const c = r0.course, half = dist(c.start.pin, c.start.stbd) / 2;
    for (let k = 0; k < 4; k++) {
      expect(Math.abs(toCourse(c, r0.boats[k]).across)).toBeLessThanOrEqual(0.75 * half);
      expect(r0.boats[k].tack).toBe('stbd');
    }
    expect(r3.boats.map(b => [b.x, b.y, b.hdg])).toEqual(r0.boats.map(b => [b.x, b.y, b.hdg]));
  });
});
