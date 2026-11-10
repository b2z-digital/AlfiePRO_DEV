// Virtual race events: when each race opens and closes, the breeze each race gets, where the event
// stands, and its standings from the races' entries.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { RaceSettings } from '@/sim/types';
import type { ChallengeEntry } from '@/components/race-simulator/challenges';
import { EventRace, SimEvent, breezeText, eventLine, eventRaceSettings, eventState, eventStatusText, raceWindows, seriesRaces } from '@/components/race-simulator/events';
import { STANDARD_DROPS, scoreText, standings } from '@/components/race-simulator/series';

const base: RaceSettings = { classId: 'IOM', fleetSize: 8, level: 'state', windStrength: 'medium', windCharacter: 'oscillating', laps: 2, length: 'medium', sequenceSeconds: 60, coach: 'full', autoTrim: false, seed: 1, venue: 'lmryc', windFrom: 75, player: { name: 'Sam S', sail: '23' } };
const DAY = 864e5;
beforeAll(() => { vi.spyOn(console, 'log').mockImplementation(() => undefined); });
const T0 = Date.parse('2026-11-16T09:00:00Z');

function event(tries: 'first' | 'best' = 'best'): SimEvent {
  const ws = raceWindows(3, 'weekly', new Date(T0));
  const races: EventRace[] = ws.map((w, k) => ({
    id: `r${k + 1}`, club_id: 'club', title: `Race ${k + 1}`, description: null, settings: { ...base, seed: 100 + k },
    opens_at: w.opens.toISOString(), closes_at: w.closes.toISOString(), created_at: '', event_id: 'ev', race_no: k + 1,
  }));
  return { id: 'ev', club_id: 'club', title: 'Winter series', description: null, tries, drops: STANDARD_DROPS, created_at: '', races };
}

const entry = (race: string, who: string, status: ChallengeEntry['status'], t: number | null): ChallengeEntry => ({
  id: `${race}-${who}`, challenge_id: race, user_id: who, display_name: who, sail_number: null, place: null, status, elapsed_s: t, summary: null, sailed_at: new Date(T0).toISOString(),
});

describe('Virtual race events', () => {
  it('opens the races together, one a week or one a day', () => {
    const start = new Date(T0);
    const together = raceWindows(3, 'together', start);
    expect(together.every(w => w.opens.getTime() === T0 && w.closes.getTime() === T0 + 14 * DAY)).toBe(true);
    const weekly = raceWindows(3, 'weekly', start);
    expect(weekly.map(w => (w.opens.getTime() - T0) / DAY)).toEqual([0, 7, 14]);
    expect(weekly.map(w => (w.closes.getTime() - w.opens.getTime()) / DAY)).toEqual([7, 7, 7]);
    const daily = raceWindows(3, 'daily', start);
    expect(daily.map(w => [(w.opens.getTime() - T0) / DAY, (w.closes.getTime() - T0) / DAY])).toEqual([[0, 2], [1, 3], [2, 4]]);
  });

  it("gives each race its own shifts and, for a mix, its own breeze, with no one's name in it", () => {
    let n = 0;
    const same = eventRaceSettings(base, 3, false, () => ++n);
    expect(same.map(s => s.seed)).toEqual([1, 2, 3]);
    expect(same.every(s => s.windStrength === 'medium' && s.windFrom === 75 && s.player === undefined)).toBe(true);
    const mixed = eventRaceSettings(base, 4, true, () => 7);
    expect(mixed.map(s => s.windStrength)).toEqual(['medium', 'light', 'fresh', 'medium']);
    // At the venue, the breeze comes from around the club's usual direction (75°).
    expect(mixed.map(s => s.windFrom)).toEqual([75, 55, 90, 65]);
    expect(mixed.every(s => s.classId === 'IOM' && s.fleetSize === 8 && s.laps === 2)).toBe(true);
    expect(breezeText(mixed[1])).toBe('Light, puffy');
    expect(eventLine(event())).toBe('3 races · IOM · 8 boats · State skippers · LMRYC · Booragul · 2 laps');
  });

  it('knows which race is open and what comes next', () => {
    const ev = event();
    expect(eventStatusText(ev, T0 - DAY)).toBe('Race 1 opens in 1 day');
    expect(eventState(ev, T0 + DAY)).toMatchObject({ started: true, done: false });
    expect(eventStatusText(ev, T0 + DAY)).toBe('Race 1 open · closes in 6 days');
    expect(eventStatusText(ev, T0 + 8 * DAY).startsWith('Race 2 open')).toBe(true);
    expect(eventStatusText(ev, T0 + 30 * DAY)).toBe('Finished');
  });

  it('scores the event from its races, with races still open counting for now', () => {
    const ev = event();
    const now = T0 + 8 * DAY; // race 1 closed, race 2 open, race 3 not yet
    const es = [
      entry('r1', 'ann', 'finished', 400), entry('r1', 'bob', 'finished', 410), entry('r1', 'cat', 'dnf', null),
      entry('r2', 'bob', 'finished', 390),
    ];
    const races = seriesRaces(ev, es, now);
    expect(races.map(r => [r.no, r.opened, r.open, r.entries.length])).toEqual([[1, true, false, 3], [2, true, true, 1], [3, false, false, 0]]);
    const rows = standings(races, ev.drops);
    // Race 2 doesn't count yet (only Bob has sailed it), as the results engine counts a race.
    expect(rows.map(r => `${r.rank} ${r.userId} ${r.scores.map(scoreText).join(' ')} = ${r.net}`)).toEqual([
      '1 ann 1 –  = 1',
      '2 bob 2 1  = 2',
      '3 cat DNF 4 –  = 4',
    ]);
  });
});
