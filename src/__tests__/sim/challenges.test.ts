// Race simulator challenges: the leaderboard order, what counts as a better result, and the ghost
// sailing true from its log. Run with: npm test
import { describe, expect, it } from 'vitest';
import { Race } from '@/sim/engine';
import { Rng } from '@/sim/math';
import type { RaceSettings } from '@/sim/types';
import { ChallengeEntry, better, closesText, isOpen, rankEntries } from '@/components/race-simulator/challenges';

const entry = (id: string, status: ChallengeEntry['status'], elapsed: number | null, at = '2026-11-10T00:00:00Z'): ChallengeEntry => ({
  id, challenge_id: 'c', user_id: id, display_name: id, sail_number: null, place: null, status, elapsed_s: elapsed, summary: null, sailed_at: at,
});

describe('Challenges', () => {
  it('ranks finishers by time, then everyone else', () => {
    const order = rankEntries([entry('dnf', 'dnf', null), entry('slow', 'finished', 320), entry('ocs', 'ocs', null), entry('fast', 'finished', 290), entry('dsq', 'dsq', 300)]);
    expect(order.map(e => e.id)).toEqual(['fast', 'slow', 'dnf', 'ocs', 'dsq']);
    // A tie goes to whoever sailed it first.
    expect(rankEntries([entry('b', 'finished', 300, '2026-11-10T02:00:00Z'), entry('a', 'finished', 300, '2026-11-10T01:00:00Z')]).map(e => e.id)).toEqual(['a', 'b']);
  });

  it('keeps your best', () => {
    expect(better({ status: 'finished', elapsed_s: 300 }, null)).toBe(true);
    expect(better({ status: 'finished', elapsed_s: 300 }, { status: 'finished', elapsed_s: 310 })).toBe(true);
    expect(better({ status: 'finished', elapsed_s: 320 }, { status: 'finished', elapsed_s: 310 })).toBe(false);
    expect(better({ status: 'finished', elapsed_s: 500 }, { status: 'dnf', elapsed_s: null })).toBe(true);
    expect(better({ status: 'dnf', elapsed_s: null }, { status: 'finished', elapsed_s: 500 })).toBe(false);
  });

  it('knows when a challenge is open', () => {
    const now = Date.parse('2026-11-10T00:00:00Z');
    const c = { id: 'c', club_id: null, title: 't', description: null, settings: {} as RaceSettings, opens_at: '2026-11-09T00:00:00Z', closes_at: '2026-11-13T00:00:00Z', created_at: '' };
    expect(isOpen(c, now)).toBe(true);
    expect(closesText(c, now)).toBe('Closes in 3 days');
    expect(isOpen({ ...c, closes_at: '2026-11-09T12:00:00Z' }, now)).toBe(false);
    expect(closesText({ ...c, closes_at: null }, now)).toBe('Open');
  });

  it("sails a ghost true from its log and settings, alongside someone else's race", () => {
    const base: RaceSettings = { classId: 'IOM', fleetSize: 8, level: 'state', windStrength: 'medium', windCharacter: 'oscillating', laps: 1, length: 'short', sequenceSeconds: 30, coach: 'off', autoTrim: false, seed: 4242, venue: 'lmryc' };
    // The leader sails it with her number and her own trim.
    const leader = new Race({ ...base, player: { name: 'Lee D', sail: '7' }, autoTrim: true });
    const rng = new Rng(11);
    let rudder = 0;
    for (let k = 0; k < 1500; k++) {
      if (k % 11 === 0) rudder = Math.max(-0.6, Math.min(0.6, rudder + rng.range(-0.2, 0.2)));
      leader.input = { rudder, sheet: 1, autoTrim: true };
      leader.step();
    }
    const log = { ...leader.log, settings: leader.settings };
    // Later, someone else races her ghost: the ghost's own race runs beside theirs.
    const mine = new Race({ ...base, player: { name: 'Sam S', sail: '23' } });
    const ghost = new Race(log.settings);
    ghost.followLog(log);
    for (let k = 0; k < 1500; k++) { mine.input = { rudder: 0, sheet: 0.6, autoTrim: false }; mine.step(); ghost.step(); }
    expect(ghost.player!.x).toBeCloseTo(leader.player!.x, 6);
    expect(ghost.player!.y).toBeCloseTo(leader.player!.y, 6);
    expect(ghost.player!.sail).toBe('7');
    expect(ghost.player!.name).toBe('Lee D');
  }, 60000);
});
