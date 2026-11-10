// Virtual race events are scored by the club's own results engine, exactly as real racing is in
// AlfiePRO: place points, letter scores at the skippers in the event + 1, DNC for a race not
// sailed, drops on the event's drop rules, and countback. These check the hand-over to it.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { STANDARD_DROPS, SeriesEntry, SeriesRace, dropsText, raceResults, scoreText, standings } from '@/components/race-simulator/series';

// The results engine explains itself on the console; not needed here.
beforeAll(() => { vi.spyOn(console, 'log').mockImplementation(() => undefined); });

let clock = 0;
const fin = (who: string, t: number): SeriesEntry => ({ userId: who, name: who, sail: null, status: 'finished', elapsed: t, sailedAt: new Date(Date.UTC(2026, 10, 10) + 6e4 * clock++).toISOString() });
const out = (who: string, status: SeriesEntry['status']): SeriesEntry => ({ userId: who, name: who, sail: null, status, elapsed: null, sailedAt: new Date(Date.UTC(2026, 10, 10) + 6e4 * clock++).toISOString() });
const race = (no: number, entries: SeriesEntry[], open = false, opened = true): SeriesRace => ({ no, opened, open, entries });
const table = (rows: ReturnType<typeof standings>) => rows.map(r => `${r.rank} ${r.userId} ${r.scores.map(scoreText).join(' ')} = ${r.net}`);

describe('Virtual race events: scoring with the club results engine', () => {
  it('places each race by time', () => {
    const r = raceResults([fin('a', 300), fin('b', 290), out('d', 'dnf'), fin('e', 310)]);
    expect(r.map(x => [x.entry.userId, x.place])).toEqual([['b', 1], ['a', 2], ['e', 3], ['d', null]]);
  });

  it('scores a race not finished, or not sailed, as the skippers in the event + 1', () => {
    const rows = standings([
      race(1, [fin('ann', 300), fin('bob', 310), out('cat', 'ocs')]),
      race(2, [fin('bob', 280), fin('ann', 290)]),
    ], []);
    // Three in the event, so OCS and DNC are 4 points. Ann and Bob tie on 3: one win each, so the
    // last race decides it, and Bob won that.
    expect(table(rows)).toEqual(['1 bob 2 1 = 3', '2 ann 1 2 = 3', '3 cat OCS 4 DNC 4 = 8']);
  });

  it("drops the worst race on the event's drop rules", () => {
    expect(dropsText(STANDARD_DROPS)).toBe('One drop after 4 races, two after 8');
    expect(dropsText(STANDARD_DROPS, 5)).toBe('One drop after 4 races');
    expect(dropsText(STANDARD_DROPS, 3)).toBe('Every race counts');
    expect(dropsText([])).toBe('Every race counts');
    const four = [
      race(1, [fin('ann', 300), fin('bob', 310), fin('cat', 320)]),
      race(2, [fin('bob', 300), fin('cat', 305), out('ann', 'dsq')]),
      race(3, [fin('ann', 300), fin('bob', 310), fin('cat', 320)]),
      race(4, [fin('ann', 300), fin('bob', 310), fin('cat', 320)]),
    ];
    expect(table(standings(four, STANDARD_DROPS))).toEqual(['1 ann 1 (DSQ 4) 1 1 = 3', '2 bob (2) 1 2 2 = 5', '3 cat (3) 2 3 3 = 8']);
    // No drops: Ann and Bob both on 7, and Ann's three wins put her ahead on countback.
    expect(table(standings(four, []))).toEqual(['1 ann 1 DSQ 4 1 1 = 7', '2 bob 2 1 2 2 = 7', '3 cat 3 2 3 3 = 11']);
  });

  it('breaks a tie on countback: the most wins, then seconds, and so on, then the last race', () => {
    // Ann and Bob both on 7: Ann has a win. Cat and Dan both on 8, with a win, a 3rd and a 4th
    // each: Dan won the last race.
    const rows = standings([
      race(1, [fin('ann', 300), fin('bob', 305), fin('cat', 310), fin('dan', 315)]),
      race(2, [fin('cat', 300), fin('bob', 305), fin('dan', 310), fin('ann', 315)]),
      race(3, [fin('dan', 300), fin('ann', 305), fin('bob', 310), fin('cat', 315)]),
    ], []);
    expect(rows.map(r => [r.userId, r.net, r.rank])).toEqual([['ann', 7, 1], ['bob', 7, 2], ['dan', 8, 3], ['cat', 8, 4]]);
  });

  it('counts a race still open once enough have sailed it, and leaves out one not opened', () => {
    // Race 2 is open and only Bob has finished it: it doesn't count yet, and shows his place.
    const early = standings([
      race(1, [fin('ann', 300), fin('bob', 310)]),
      race(2, [fin('bob', 300), out('ann', 'started')], true),
      race(3, [], false, false),
    ], []);
    expect(table(early)).toEqual(['1 ann 1 –  = 1', '2 bob 2 1  = 2']);
    expect(early[1].scores[1]).toMatchObject({ counted: false, place: 1 });
    // Once both have finished it, it counts.
    const both = standings([
      race(1, [fin('ann', 300), fin('bob', 310)]),
      race(2, [fin('bob', 300), fin('ann', 310)], true),
    ], []);
    expect(table(both)).toEqual(['1 bob 2 1 = 3', '2 ann 1 2 = 3']);
  });

  it('makes a try that never finished a DNF once the race closes, and a race not sailed a DNC', () => {
    const rows = standings([
      race(1, [fin('ann', 300), fin('bob', 310), fin('cat', 320)]),
      race(2, [fin('bob', 300), fin('cat', 310), out('ann', 'started')]),
      race(3, [fin('ann', 300), fin('bob', 310)]),
    ], []);
    expect(table(rows)).toEqual(['1 bob 2 1 2 = 5', '2 ann 1 DNF 4 1 = 6', '3 cat 3 2 DNC 4 = 9']);
  });

  it("takes each skipper's name and number from her latest race", () => {
    const a = { ...fin('ann', 300), name: 'Ann B', sail: '12' };
    const b = { ...fin('ann', 290), name: 'Ann Brown', sail: '21' };
    const rows = standings([race(1, [a, fin('bob', 320)]), race(2, [b, fin('bob', 310)])], []);
    expect(rows[0]).toMatchObject({ userId: 'ann', name: 'Ann Brown', sail: '21' });
  });
});
