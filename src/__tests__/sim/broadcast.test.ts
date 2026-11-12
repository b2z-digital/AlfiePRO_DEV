// Broadcast the final: a race kept as a tape sails again exactly, the highlights are cut from it,
// and tapes are kept (titles first).
import { beforeEach, describe, expect, it } from 'vitest';
import { Race } from '@/sim/engine';
import type { RaceSettings } from '@/sim/types';
import { boatName, cut, deleteTape, loadTapes, MAX_TAPES, playTape, saveTape, tapeOf, tapeSub, type Tape } from '@/components/race-simulator/broadcast';

const settings: RaceSettings = { classId: 'IOM', fleetSize: 6, level: 'state', windStrength: 'medium', windCharacter: 'oscillating', laps: 1, length: 'short',
  sequenceSeconds: 30, coach: 'off', autoTrim: true, seed: 21, cast: [{ name: 'Ari Solberg', sail: '52', country: 'NOR' }], player: { name: 'Sam S' } } as RaceSettings;

describe('Broadcast the final', () => {
  beforeEach(() => { try { localStorage.clear(); } catch { /* none */ } });

  it('sails a tape again exactly: the same boats in the same places', () => {
    const r = new Race(settings);
    // Some helm from the player along the way, so the log has something in it.
    for (let k = 0; k < 2400; k++) {
      if (k % 200 === 0 && r.player) r.input = { rudder: k % 400 === 0 ? 0.3 : -0.2, sheet: 0.8, autoTrim: true };
      r.step();
    }
    const tape = tapeOf(r, { title: 'Quick race', sub: 'x', kind: 'kept', at: 1 });
    const again = playTape(tape);
    while (again.step_ < r.step_) again.step();
    for (let i = 0; i < r.boats.length; i++) {
      expect(again.boats[i].x).toBeCloseTo(r.boats[i].x, 6);
      expect(again.boats[i].y).toBeCloseTo(r.boats[i].y, 6);
    }
    expect(boatName(again, again.boats.find(b => b.isPlayer)!)).toBe('Sam S');
    expect(boatName(again, again.boats.find(b => b.sail === '52')!)).toBe('Ari Solberg');
    expect(boatName(again, again.boats.find(b => !b.isPlayer && b.sail !== '52')!)).toMatch(/^Sail \d+/);
  });

  it('cuts the start, the last change of lead, and the finish, in order and apart', () => {
    const samples = Array.from({ length: 300 }, (_, i) => ({ t: 60 + i, leader: i < 120 ? 'a' : i < 200 ? 'b' : 'c', mine: 4 }));
    const s = cut(60, samples, 330, 334);
    expect(s.map(x => x.label)).toEqual(['The start', 'A change of lead', 'The finish']);
    expect(s[1]).toMatchObject({ from: 254, to: 264 });
    expect(s[2]).toMatchObject({ from: 323, to: 336 });
    for (let i = 1; i < s.length; i++) expect(s[i].from).toBeGreaterThan(s[i - 1].to);
    const total = s.reduce((a, x) => a + (x.to - x.from), 0);
    expect(total).toBeGreaterThan(25); expect(total).toBeLessThan(45);
  });

  it('cuts your biggest gain when the lead never changed', () => {
    const samples = Array.from({ length: 200 }, (_, i) => ({ t: 60 + i, leader: 'a', mine: i < 90 ? 6 : i < 100 ? 6 - Math.floor((i - 90) / 3) : 3 }));
    const s = cut(60, samples, 250, null);
    expect(s[1].label).toMatch(/^Up \d places$/);
    expect(s[2]).toMatchObject({ label: 'The finish', to: 253 });
  });

  it('keeps titles before the rest, newest first, up to the limit; and removes one', () => {
    const r = new Race(settings);
    const mk = (i: number, kind: Tape['kind']) => tapeOf(r, { title: `T${i}`, sub: tapeSub(settings, () => 'x', i), kind, at: 1000 + i });
    saveTape(mk(0, 'title'));
    for (let i = 1; i <= MAX_TAPES + 2; i++) saveTape(mk(i, 'podium'));
    const all = loadTapes();
    expect(all).toHaveLength(MAX_TAPES);
    expect(all[0]).toMatchObject({ kind: 'title', title: 'T0' });
    expect(all[1].title).toBe(`T${MAX_TAPES + 2}`);
    expect(deleteTape(all[0].id)).toHaveLength(MAX_TAPES - 1);
  });
});
