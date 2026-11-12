import { describe, expect, it } from 'vitest';
import { clubPeriod, isoWeek, nameProblem, nextMajor, worldMedals, worldNow, worldPoints, type WorldEvent, type WorldResult } from '@/components/race-simulator/world';
import { CAST } from '@/components/race-simulator/career';
import { Race } from '@/sim/engine';
import { alpha2, countryName } from '@/components/race-simulator/flags';
import { VENUES } from '@/sim/venues';
import { regionOf } from '@/components/race-simulator/circuitWaters';
import { calendarOf, defending, finishDay, moveUp, newCareer, seasonOf, REGIONAL_SEASON, type Career } from '@/components/race-simulator/career';

const at = (iso: string) => Date.parse(iso);

describe('world points', () => {
  it('match the database (the dry run: two entrants)', () => {
    expect(worldPoints('daily', 1, 2)).toBe(3);
    expect(worldPoints('daily', 2, 2)).toBe(1);
    expect(worldPoints('regatta', 1, 2)).toBe(28);
    expect(worldPoints('regatta', 2, 2)).toBe(10);
  });
  it('pay in full at fifty entrants, fall away down the field, and never go below 1', () => {
    expect(worldPoints('major', 1, 50)).toBe(400);
    expect(worldPoints('major', 1, 200)).toBe(400);
    expect(worldPoints('regatta', 25, 50)).toBeLessThan(worldPoints('regatta', 10, 50));
    expect(worldPoints('daily', 50, 50)).toBe(1);
    expect(worldPoints('daily', 1, 0)).toBe(0);
  });
});

describe('the calendar', () => {
  it('finds ISO weeks and their Mondays (UTC)', () => {
    expect(isoWeek(at('2026-11-12T06:00:00Z'))).toMatchObject({ week: 46, monday: at('2026-11-09T00:00:00Z') });
    expect(isoWeek(at('2026-12-02T03:00:00Z'))).toMatchObject({ week: 49, monday: at('2026-11-30T00:00:00Z') });
    expect(isoWeek(at('2027-01-01T12:00:00Z')).week).toBe(53);
  });
  it('knows the next Major', () => {
    expect(nextMajor(at('2026-11-12T06:00:00Z'))).toMatchObject({ name: 'The Melbourne Major', opens: at('2026-11-30T00:00:00Z'), now: false });
    expect(nextMajor(at('2026-12-02T06:00:00Z'))).toMatchObject({ name: 'The Melbourne Major', now: true });
    expect(nextMajor(at('2026-12-08T06:00:00Z'))).toMatchObject({ name: 'The Gold Coast Major', opens: at('2027-03-08T00:00:00Z') });
  });
});

describe('racing names', () => {
  it('takes what the database takes', () => {
    expect(nameProblem('Blue Heron')).toBeNull();
    expect(nameProblem("O'Neill-Smith Jr.")).toBeNull();
    expect(nameProblem('x')).toMatch(/three/);
    expect(nameProblem('A very long racing name indeed')).toMatch(/Twenty/);
    expect(nameProblem('-dash')).toMatch(/start/);
    expect(nameProblem('emoji ⛵ boat')).toMatch(/Letters/);
  });
});

describe('flags', () => {
  it('turn sail letters into ISO codes', () => {
    expect(alpha2('AUS')).toBe('AU');
    expect(alpha2('nz')).toBe('NZ');
    expect(alpha2('GBR')).toBe('GB');
    expect(alpha2('ZZZ')).toBeNull();
    expect(alpha2(null)).toBeNull();
    expect(countryName('AU')).toBe('Australia');
  });
});

const race = (id: string, opens: string, closes: string) => ({ id, club_id: null, title: 'Race', description: null, settings: { classId: 'IOM' } as never, opens_at: opens, closes_at: closes, created_at: opens, event_id: 'e', race_no: 1 });
const ev = (id: string, kind: WorldEvent['kind'], cls: WorldEvent['class_id'], opens: string, closes: string): WorldEvent =>
  ({ id, club_id: null, title: id, description: null, tries: 'first', drops: [], created_at: opens, kind, class_id: cls, world_key: id, final_at: null, races: [race(id + 'r', opens, closes)] });

describe('what is open now', () => {
  it('picks today\'s daily race and this week\'s regatta for your class, and lists the closed', () => {
    const now = at('2026-11-12T06:00:00Z');
    const evs = [
      ev('d-today', 'daily', 'IOM', '2026-11-12T00:00:00Z', '2026-11-13T00:00:00Z'),
      ev('d-yday', 'daily', 'IOM', '2026-11-11T00:00:00Z', '2026-11-12T00:00:00Z'),
      ev('d-df', 'daily', 'DF95', '2026-11-12T00:00:00Z', '2026-11-13T00:00:00Z'),
      ev('r-week', 'regatta', 'IOM', '2026-11-09T00:00:00Z', '2026-11-16T00:00:00Z'),
    ];
    const w = worldNow(evs, 'IOM', now);
    expect(w.daily?.id).toBe('d-today');
    expect(w.regatta?.id).toBe('r-week');
    expect(w.major).toBeNull();
    expect(w.closed.map(e => e.id)).toEqual(['d-yday']);
  });
});

describe('the Circuit renews', () => {
  it('redraws a tier\'s lead-up regattas each new season, keeping the Championship', () => {
    expect(calendarOf('state', 0)).toBe(REGIONAL_SEASON);
    const next = calendarOf('state', 1);
    expect(next.map(e => e.name)).toEqual(['Heron Reach Regatta', 'Kestrelwater Regatta', 'Skerry Sound Regatta', 'Regional Championship']);
    expect(next[3]).toEqual(REGIONAL_SEASON[3]);
    expect(new Set(next.slice(0, 3).map(e => e.water)).size).toBe(3);
    expect(calendarOf('world', 1)[0].name).toBe('Tamarind Lagoon Pre-Worlds');
    expect(calendarOf('club', 1).map(e => e.wind)).not.toEqual(calendarOf('club', 0).map(e => e.wind));
    expect(calendarOf('club', 1)).toHaveLength(7);
  });
  it('starts a season in a new tier on its first calendar', () => {
    const c: Career = { ...newCareer('IOM', 0), calendar: 2, ticket: 'state', done: [{ event: 6, order: [], rank: 1, net: 1, at: 0 }] };
    const up = moveUp(c, 1);
    expect(up.calendar).toBe(0);
    expect(seasonOf(up)).toEqual(calendarOf('state', 0, { real: true }));
  });
  it('keeps a season begun on the invented waters there until it ends, then moves to the real ones', () => {
    const old: Career = { ...newCareer('IOM', 0), tier: 'state' };
    delete old.real;
    expect(seasonOf(old)).toBe(REGIONAL_SEASON);
    const up = moveUp({ ...old, tier: 'club', ticket: 'state' }, 1, 'QLD');
    expect(up).toMatchObject({ real: true, home: 'QLD' });
    expect(seasonOf(up)[3]).toMatchObject({ name: 'Queensland State Championship', water: 'paradise' });
  });
  it('sails the Regional season in your home state, borrowing a neighbour\'s waters when it has few', () => {
    const qld = calendarOf('state', 0, { real: true, home: 'QLD' });
    expect(qld.map(e => e.name)).toEqual(['Lake Kawana Regatta', 'Gladstone Marina Regatta', 'Lake Macquarie Regatta', 'Queensland State Championship']);
    expect(qld[3].water).toBe('paradise');
    const wa = calendarOf('state', 0, { real: true, home: 'WA' });
    expect(wa.map(e => e.water)).toEqual(['patawalonga', 'plrmyc', 'lillydale', 'jackadder']);
    expect(wa[3].name).toBe('Western Australian State Championship');
    // Every region: three different regattas off its main water, then its Championship on it.
    for (const home of ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NZ'] as const) {
      for (let r = 0; r < 4; r++) {
        const s = calendarOf('state', r, { real: true, home });
        const lead = s.slice(0, 3).map(e => e.water!);
        expect(new Set(lead).size).toBe(3);
        expect(lead).not.toContain(s[3].water);
        for (const e of s) expect(VENUES[e.water!]?.invented).toBeFalsy();
      }
    }
    // No home to go on: New South Wales.
    expect(calendarOf('state', 0, { real: true })[3].name).toBe('NSW State Championship');
  });
  it('moves the Australian and World Championships round the main waters, the Oceania Championship in New Zealand', () => {
    const champs = [0, 1, 2, 3, 4, 5].map(r => calendarOf('national', r, { real: true }));
    expect(champs.map(s => s[2].water)).toEqual(['paradise', 'lmryc', 'plrmyc', 'patawalonga', 'jackadder', 'risdon']);
    for (const s of champs) {
      expect(s[2]).toMatchObject({ name: 'Australian Championship', heat: { system: 'hms' } });
      expect(s.slice(0, 2).map(e => e.water)).not.toContain(s[2].water);
      expect(s[0].water).not.toBe(s[1].water);
    }
    const w = calendarOf('world', 1, { real: true });
    expect(w.map(e => [e.name, e.water])).toEqual([['Oceania Championship', 'taurikura'], ['World Championship', 'paradise']]);
  });
  it('works out your home state from your club\'s water', () => {
    expect(regionOf(VENUES.jackadder)).toBe('WA');
    // A club's own water, not marked: the state of the nearest real water (here Canberra, so NSW).
    expect(regionOf({ ...VENUES.lmryc, region: undefined, lat: -35.28, lon: 149.13 })).toBe('NSW');
    expect(regionOf({ ...VENUES.lmryc, region: undefined, lat: -37.68, lon: 176.17 })).toBe('NZ');
    expect(regionOf(null)).toBeNull();
    expect(regionOf(VENUES['circuit-aurel-lake'])).toBeNull();
  });
  it('knows a title to defend', () => {
    const c = newCareer('IOM', 0);
    expect(defending(c)).toBe(false);
    expect(defending({ ...c, season: 2, history: [{ season: 1, pointscore: 2, championship: 1, of: 10, tier: 'club' }] })).toBe(true);
    expect(defending({ ...c, tier: 'state', season: 2, history: [{ season: 1, pointscore: 2, championship: 1, of: 10, tier: 'club' }] })).toBe(false);
    void finishDay;
  });
});

describe('World medals and club against club', () => {
  const res = (event_id: string, kind: WorldResult['kind'], place: number, closed_at: string, title?: string): WorldResult => ({ event_id, kind, class_id: 'IOM', place, of_n: 30, points: 50, closed_at, title });
  it('gives a medal for a podium in a World Regatta or a Major, and a title for winning a Major; none for the daily race', () => {
    const m = worldMedals([
      res('d', 'daily', 1, '2026-11-12T00:00:00Z'),
      res('r', 'regatta', 2, '2026-11-09T00:07:00Z', 'World Regatta: Lake Kawana'),
      res('m', 'major', 1, '2026-11-10T00:07:00Z', 'The Perth Major'),
      res('r4', 'regatta', 4, '2026-11-02T00:07:00Z'),
    ]);
    expect(m.map(x => [x.eventId, x.kind, x.trophy])).toEqual([['m', 'gold', true], ['r', 'silver', false]]);
    expect(m[0].event).toBe('The Perth Major');
    expect(worldMedals(null)).toEqual([]);
  });
  it('shows the club table for last week (scored this Monday), this month, last month and a year, in UTC', () => {
    const now = Date.parse('2026-11-12T06:00:00Z');
    expect(clubPeriod('week', now)).toEqual({ from: Date.parse('2026-11-09T00:00:00Z'), to: Date.parse('2026-11-16T00:00:00Z') });
    expect(clubPeriod('month', now)).toEqual({ from: Date.parse('2026-11-01T00:00:00Z'), to: Date.parse('2026-12-01T00:00:00Z') });
    expect(clubPeriod('lastMonth', now)).toEqual({ from: Date.parse('2026-10-01T00:00:00Z'), to: Date.parse('2026-11-01T00:00:00Z') });
    expect(clubPeriod('lastMonth', Date.parse('2027-01-03T00:00:00Z')).from).toBe(Date.parse('2026-12-01T00:00:00Z'));
  });
  it('puts each of the cast\'s own country letters on her sail', () => {
    const r = new Race({ classId: 'IOM', fleetSize: 4, level: 'club', windStrength: 'medium', windCharacter: 'steady', laps: 1, length: 'short', sequenceSeconds: 60, coach: 'off', autoTrim: true, seed: 3,
      cast: [{ name: 'Ari Solberg', sail: '52', country: 'NOR' }, { name: 'Mia Castellan', sail: '27', country: 'ESP' }, { name: 'X', sail: '9' }] });
    expect(r.boats.map(b => b.country ?? null)).toEqual([null, 'NOR', 'ESP', null]);
  });
  it('draws a flag for every country in the Circuit\'s cast', () => {
    for (const m of CAST) expect(alpha2(m.country) ?? '', m.country).toMatch(/^[A-Z]{2}$/);
  });
});

