// Race simulator: Alfie's moments from a whole race (the player's boat sailed by an AI helm), and
// taking over from one of them. Run with: npm test
import { describe, expect, it } from 'vitest';
import { Race } from '@/sim/engine';
import { LEVELS, PERSONAS, Skipper } from '@/sim/ai';
import { Rng } from '@/sim/math';
import { DT } from '@/sim/physics';
import type { RaceSettings } from '@/sim/types';
import { WindMemory } from '@/components/race-simulator/coach';
import { PlayerLog, summarize } from '@/components/race-simulator/stats';
import { findMoments } from '@/components/race-simulator/moments';

const settings: RaceSettings = {
  classId: 'IOM', fleetSize: 8, level: 'club', windStrength: 'medium', windCharacter: 'oscillating',
  laps: 2, length: 'short', sequenceSeconds: 30, coach: 'off', autoTrim: true, seed: 77, venue: 'lmryc',
};

function raced() {
  const race = new Race(settings);
  const p = race.player!;
  const i = race.boats.indexOf(p);
  p.persona = { ...PERSONAS[2] };
  (race.skippers as (Skipper | null)[])[i] = new Skipper(p, LEVELS.club, p.persona, new Rng(5), i);
  race.autopilot = true;
  const mem = new WindMemory(), log = new PlayerLog();
  while (!race.ended && race.t < 900) {
    race.step();
    mem.update(race.t, race.wind.sample(p.x, p.y, race.t).twd);
    log.sample(race, p, mem.mean);
  }
  return { race, log };
}

describe("Alfie's moments", () => {
  it('finds the start, the roundings and the finish, in order, with something to say', () => {
    const { race, log } = raced();
    const sum = summarize(race, log, 'race');
    const ms = findMoments(race, log, sum);
    expect(ms[0].kind).toBe('start');
    expect(ms.some(m => m.kind === 'mark')).toBe(true);
    expect(ms[ms.length - 1].kind).toBe('finish');
    for (let k = 1; k < ms.length; k++) expect(ms[k].t).toBeGreaterThanOrEqual(ms[k - 1].t);
    for (const m of ms) {
      expect(m.text.length).toBeGreaterThan(20);
      expect(m.focus[0]).toBe(race.player!.id);
      expect(m.t).toBeGreaterThanOrEqual(0);
      expect(m.t).toBeLessThanOrEqual(race.t);
      if (m.from !== undefined) expect(m.from).toBeLessThanOrEqual(m.t);
    }
    expect(ms.length).toBeLessThanOrEqual(20);
  }, 120000);

  it('takes over from a moment with every boat where it was', () => {
    // A skipper at the sticks (inputs, not an AI helm), so the log is what sailed her.
    const race = new Race({ ...settings, autoTrim: false });
    const rng = new Rng(3);
    let rudder = 0;
    for (let k = 0; k < 2400; k++) {
      if (k % 9 === 0) rudder = Math.max(-0.7, Math.min(0.7, rudder + rng.range(-0.25, 0.25)));
      race.input = { rudder, sheet: 0.55 + 0.3 * Math.sin(k / 70), autoTrim: false };
      if (k % 400 === 200) race.act('tack');
      race.step();
    }
    const at = Math.round((race.gunT + 40) / DT);
    const again = new Race(race.settings);
    again.followLog(race.log, at);
    while (again.replaying) again.step();
    expect(again.step_).toBe(at);
    // Every boat where the original had her at that moment (the 5 Hz track).
    const fr = race.track.find(f => Math.abs(f.t - again.t) < 1e-6)!;
    expect(fr).toBeTruthy();
    again.boats.forEach((b, i) => {
      expect(b.x).toBeCloseTo(fr.d[i * 5], 3);
      expect(b.y).toBeCloseTo(fr.d[i * 5 + 1], 3);
    });
  }, 120000);
});
