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
  it('reads sail numbers the way clubs write them', () => {
    expect(sailDigits('AUS 123')).toBe('123');
    expect(sailDigits('7')).toBe('07');
    expect(sailDigits('0042')).toBe('42');
    expect(sailDigits('AUS-2024')).toBe('2024');
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
});
