// Race simulator: you race under your own name and sail number. Run with: npm test
import { describe, expect, it } from 'vitest';
import { Race } from '@/sim/engine';
import { sailDigits } from '@/components/race-simulator/identity';
import type { RaceSettings } from '@/sim/types';

const base: RaceSettings = {
  classId: 'IOM', fleetSize: 16, level: 'state', windStrength: 'medium', windCharacter: 'steady',
  laps: 1, length: 'short', sequenceSeconds: 30, coach: 'off', autoTrim: true, seed: 8,
};

describe('Sailing as yourself', () => {
  it('reads a sail number the way it goes on the sail: the last two digits', () => {
    expect(sailDigits('AUS 123')).toBe('23');
    expect(sailDigits('7')).toBe('07');
    expect(sailDigits('0042')).toBe('42');
    expect(sailDigits('AUS-2024')).toBe('24');
    expect(sailDigits('100')).toBe('00');
    expect(sailDigits('')).toBeNull();
    expect(sailDigits('123456')).toBeNull();
  });

  it('puts your name and number on your boat, and no one else has your number', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const r = new Race({ ...base, seed, player: { name: 'Sam Skipper', sail: '23' } });
      expect(r.player!.sail).toBe('23');
      expect(r.player!.name).toBe('Sam Skipper');
      expect(r.boats.filter(b => b.sail === '23')).toHaveLength(1);
    }
    // Without one, the same fleet as always.
    const a = new Race(base), b = new Race(base);
    expect(a.boats.map(x => x.sail)).toEqual(b.boats.map(x => x.sail));
    expect(a.player!.sail).toBe('01');
  });

  it("sails the same race whatever your number, so a challenge is fair", () => {
    const plain = new Race(base);
    const taken = plain.boats[3].sail; // a number an AI boat draws
    const mine = new Race({ ...base, player: { name: 'Sam Skipper', sail: taken } });
    expect(mine.player!.sail).toBe(taken);
    expect(mine.boats[3].sail).toBe('01');
    // Everything else is the same: where every boat starts, and how.
    expect(mine.boats.map(b => `${b.x},${b.y},${b.hdg},${b.persona?.key ?? ''}`)).toEqual(plain.boats.map(b => `${b.x},${b.y},${b.hdg},${b.persona?.key ?? ''}`));
    for (let k = 0; k < 400; k++) { plain.step(); mine.step(); }
    expect(mine.boats.map(b => b.x.toFixed(6)).join()).toBe(plain.boats.map(b => b.x.toFixed(6)).join());
  });
});
