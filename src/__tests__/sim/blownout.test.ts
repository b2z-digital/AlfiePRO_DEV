// "Blown out? Race it here", and a Circuit race that's left after the gun.
import { describe, expect, it } from 'vitest';
import { pickBlownOut, type CalendarRace } from '@/components/race-simulator/rehearse';
import { blownOutEvent, type SimEvent } from '@/components/race-simulator/events';
import { STANDARD_DROPS } from '@/components/race-simulator/series';
import { ME, NATIONAL_SEASON, abandonRace, careerRace, dayState, heatNow, newCareer, prepareRace, type Career } from '@/components/race-simulator/career';
import { heatState } from '@/components/race-simulator/heats';
import { nextUp } from '@/components/race-simulator/nextup';
import { standing } from '@/components/race-simulator/rating';
import { levelLicence, weekPlan } from '@/components/race-simulator/programme';
import type { RaceSettings } from '@/sim/types';
import { FIRST } from '@/sim/training';
import type { Profile } from '@/components/race-simulator/profile';
import type { TrainingProgress } from '@/components/race-simulator/progress';
import type { RaceSummary } from '@/components/race-simulator/stats';

const NOW = new Date(2026, 10, 12, 15, 0);
const cal = (id: string, date: string, o: Partial<CalendarRace> = {}): CalendarRace => ({ id, name: `Race day ${id}`, date, venue: 'Lake', raceClass: 'IOM', ...o });

describe('which race day can be raced here', () => {
  it("is today's, or one cancelled in the last two days; today's first", () => {
    expect(pickBlownOut([cal('a', '2026-11-12')], NOW)).toMatchObject({ id: 'a', days: 0, cancelled: false, classId: 'IOM' });
    expect(pickBlownOut([cal('a', '2026-11-11', { cancelled: true })], NOW)).toMatchObject({ id: 'a', days: -1, cancelled: true });
    expect(pickBlownOut([cal('a', '2026-11-10', { cancelled: true })], NOW)).toMatchObject({ id: 'a', days: -2 });
    expect(pickBlownOut([cal('a', '2026-11-09', { cancelled: true })], NOW)).toBeNull();
    expect(pickBlownOut([cal('a', '2026-11-11')], NOW)).toBeNull();
    expect(pickBlownOut([cal('a', '2026-11-12', { completed: true })], NOW)).toBeNull();
    expect(pickBlownOut([cal('a', '2026-11-13')], NOW)).toBeNull();
    expect(pickBlownOut([cal('old', '2026-11-11', { cancelled: true }), cal('today', '2026-11-12', { cancelled: true })], NOW)?.id).toBe('today');
  });
});

describe('the event it makes', () => {
  const base: RaceSettings = { classId: 'IOM', fleetSize: 8, level: 'state', windStrength: 'fresh', windCharacter: 'puffy', windFrom: 200, venue: 'lmryc', laps: 2, length: 'medium', sequenceSeconds: 60, coach: 'hints', autoTrim: false, seed: 9, player: { name: 'Sam S', sail: '39' }, tune: 2 };
  it('is the day, raced here: its races open now and close at midnight after the days chosen; first tries count', () => {
    let s = 100;
    const ev = blownOutEvent({ name: 'Pointscore 7', date: '2026-11-12' }, base, 6, 2, NOW, () => s++);
    expect(ev.title).toBe('Pointscore 7: raced here');
    expect(ev.description).toMatch(/Thursday 12 November was blown out/);
    expect(ev.description).toMatch(/nothing goes on the club's results/);
    expect(ev.tries).toBe('first');
    expect(ev.drops).toEqual(STANDARD_DROPS);
    expect(ev.races).toHaveLength(6);
    expect(ev.races.every(r => r.opens.getTime() === NOW.getTime() && r.closes.getTime() === new Date(2026, 10, 14).getTime())).toBe(true);
    expect(new Set(ev.races.map(r => r.settings.seed)).size).toBe(6);
    expect(ev.races.every(r => !r.settings.player && r.settings.venue === 'lmryc' && r.settings.windFrom === 200 && r.settings.windStrength === 'fresh')).toBe(true);
  });
});

describe('leaving a Circuit race after the gun', () => {
  it('a race day: you DNF and everyone else finishes', () => {
    const c = prepareRace(newCareer('IOM', 0), 1);
    const cast = careerRace(c, { classId: 'IOM', fleetSize: 6, level: 'club', windStrength: 'medium', windCharacter: 'steady', laps: 1, length: 'short', sequenceSeconds: 30, coach: 'off', autoTrim: true, seed: 1 } as RaceSettings).cast!.map(m => m.id!);
    const after = abandonRace(c, cast, 2);
    const rows = after.day!.races[0].rows;
    expect(rows.find(r => r.id === ME)).toEqual({ id: ME, place: null, code: 'DNF' });
    expect(rows.filter(r => r.id !== ME).map(r => r.place).sort((a, z) => a! - z!)).toEqual(cast.map((_, k) => k + 1));
    expect(dayState(after).raced).toBe(1);
    // The same race left again comes out the same way.
    expect(abandonRace(c, cast, 2).day!.races[0].rows).toEqual(rows);
  });
  it('a heat: you DNF in your heat and the round goes on', () => {
    const at: Career = { ...newCareer('IOM', 0), tier: 'national', done: NATIONAL_SEASON.slice(0, -1).map((_, k) => ({ event: k, order: [], rank: 5, net: 20, at: 0 })) };
    const c = prepareRace(at, 1);
    const hn = heatNow(c)!;
    const after = abandonRace(c, hn.ids.filter(id => id !== ME), 2);
    const log = after.day!.heat!;
    const mine = log.sails.find(s => s.me)!;
    expect(mine.x).toEqual([[log.ids.indexOf(ME), 'DNF']]);
    expect(mine.o).toHaveLength(hn.ids.length - 1);
    expect(heatState(NATIONAL_SEASON[2].heat!, log).complete).toBeGreaterThanOrEqual(0);
  });
});

describe('Next up', () => {
  it("puts your club's event first once you're placed, until you've sailed its open races", () => {
    let clock = Date.UTC(2026, 10, 1);
    const race = (place: number): RaceSummary => ({ at: (clock += 3600000), mode: 'race', level: 'club', of: 10, fleet: 10, place, status: 'finished', incidents: [], penalties: 0 } as unknown as RaceSummary);
    const profile: Profile = { races: [race(6), race(7), race(6)].reverse() };
    const training: TrainingProgress = { drills: {}, lessons: {}, lab: Object.fromEntries(FIRST.map(m => [m.id, { won: true, tries: 1, at: 1 }])), updatedAt: 0 };
    const st = standing(profile);
    const event = { id: 'e', title: 'Pointscore 7: raced here' } as SimEvent;
    const base = { profile, training, standing: st, week: weekPlan(profile, training, Date.now(), st), licence: levelLicence(st.level, profile, training), challenges: [], now: Date.now() };
    const day = { id: 'r', name: 'Next week', date: '2026-11-14', days: 2, startTime: null, venue: '', className: 'IOM', classId: 'IOM' as const, wind: null };
    expect(nextUp({ ...base, next: day, clubEvent: { event, left: 4, hours: 30 } })).toMatchObject({ kind: 'club-event', left: 4, hours: 30 });
    expect(nextUp({ ...base, next: day, clubEvent: { event, left: 0, hours: 30 } }).kind).toBe('rehearse');
  });
});
