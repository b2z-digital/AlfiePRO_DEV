// Rehearse your next race: picking the next race day off the calendar, its forecast, and the words.
import { describe, expect, it } from 'vitest';
import { classFor, pickNext, rehearseWords, windOn, type CalendarRace, type NextRace } from '@/components/race-simulator/rehearse';
import { VENUES } from '@/sim/venues';

const NOW = new Date(2026, 10, 11, 17, 40); // Wednesday 11 November 2026, local time
const r = (id: string, date: string, extra: Partial<CalendarRace> = {}): CalendarRace => ({ id, name: `Race ${id}`, date, venue: 'The pond', raceClass: 'IOM', ...extra });

describe('The next race day', () => {
  it('is the soonest that is not over, cancelled or in the past (today counts)', () => {
    const races = [r('past', '2026-11-07'), r('done', '2026-11-11', { completed: true }), r('off', '2026-11-12', { cancelled: true }), r('sat', '2026-11-14', { startTime: '13:00' }), r('later', '2026-11-21'), r('bad', 'next week')];
    const n = pickNext(races, NOW)!;
    expect(n).toMatchObject({ id: 'sat', date: '2026-11-14', days: 3, startTime: '13:00', classId: 'IOM' });
    expect(pickNext([r('today', '2026-11-11T00:00:00')], NOW)!.days).toBe(0);
    expect(pickNext([r('past', '2026-11-07')], NOW)).toBeNull();
    // Two on the same day: the earlier start.
    expect(pickNext([r('pm', '2026-11-14', { startTime: '14:00' }), r('am', '2026-11-14', { startTime: '09:30' })], NOW)!.id).toBe('am');
  });

  it("knows the simulator's class for the club's name for it", () => {
    expect(['IOM', 'DF 95', 'DragonForce 65', '10 Rater', '10R', 'Marblehead', 'M'].map(classFor)).toEqual(['IOM', 'DF95', 'DF65', '10R', '10R', 'M', 'M']);
    expect(classFor('A Class')).toBeNull();
    expect(classFor('RC Laser')).toBeNull();
  });

  it("reads the day's wind from the forecast, kept to what a radio yacht races in", () => {
    const daily = [{ date: '2026-11-13', windSpeedMin: 3, windSpeedMax: 6, windDirection: 200 }, { date: '2026-11-14', windSpeedMin: 8.4, windSpeedMax: 15.2, windDirection: 44.6 }];
    expect(windOn(daily, '2026-11-14')).toEqual({ from: 45, kn: 12, lo: 8, hi: 15 });
    expect(windOn(daily, '2026-11-20')).toBeNull();
    expect(windOn([{ date: '2026-11-14', windSpeedMin: 25, windSpeedMax: 35, windDirection: -10 }], '2026-11-14')).toEqual({ from: 350, kn: 22, lo: 25, hi: 35 });
    expect(windOn([{ date: '2026-11-14', windSpeedMin: NaN, windSpeedMax: 9, windDirection: 10 }], '2026-11-14')).toBeNull();
  });

  it('says it plainly: the day, the forecast, where and in what', () => {
    const at = Object.values(VENUES)[0];
    const n: NextRace = { ...pickNext([r('sat', '2026-11-14', { name: 'Spring Series: Round 4' })], NOW)!, wind: { from: 45, kn: 12, lo: 8, hi: 15 } };
    const w = rehearseWords(n, at);
    expect(w.when).toBe('Saturday');
    expect(w.title).toBe('Spring Series: Round 4');
    expect(w.wind).toBe('Forecast: 8 to 15 knots from the NE.');
    expect(w.where).toBe(`IOM on ${at.name}'s water.`);
    expect(w.button).toBe('Rehearse Saturday');
    // Too far off for a forecast, and a class the simulator hasn't got.
    const far: NextRace = { ...pickNext([r('far', '2026-11-28', { raceClass: 'A Class' })], NOW)!, wind: null };
    const f = rehearseWords(far, at);
    expect(f.when).toBe('Sat, 28 Nov');
    expect(f.wind).toMatch(/^Too far off for a forecast yet/);
    expect(f.where).toMatch(/the simulator has no A Class/);
    expect(f.button).toBe('Rehearse it');
    expect(rehearseWords({ ...n, days: 0 }, at).button).toBe('Rehearse today');
    expect(rehearseWords({ ...n, days: 1 }, at).when).toBe('Tomorrow');
  });
});
