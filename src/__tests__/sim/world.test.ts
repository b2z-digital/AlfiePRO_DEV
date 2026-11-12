import { describe, expect, it } from 'vitest';
import { isoWeek, nameProblem, nextMajor, worldNow, worldPoints, type WorldEvent } from '@/components/race-simulator/world';
import { alpha2, countryName } from '@/components/race-simulator/flags';
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
    expect(nextMajor(at('2026-11-12T06:00:00Z'))).toMatchObject({ name: 'The Port Meridian Major', opens: at('2026-11-30T00:00:00Z'), now: false });
    expect(nextMajor(at('2026-12-02T06:00:00Z'))).toMatchObject({ name: 'The Port Meridian Major', now: true });
    expect(nextMajor(at('2026-12-08T06:00:00Z'))).toMatchObject({ name: 'The Aurel Lake Major', opens: at('2027-03-08T00:00:00Z') });
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
    expect(seasonOf(up)).toBe(REGIONAL_SEASON);
  });
  it('knows a title to defend', () => {
    const c = newCareer('IOM', 0);
    expect(defending(c)).toBe(false);
    expect(defending({ ...c, season: 2, history: [{ season: 1, pointscore: 2, championship: 1, of: 10, tier: 'club' }] })).toBe(true);
    expect(defending({ ...c, tier: 'state', season: 2, history: [{ season: 1, pointscore: 2, championship: 1, of: 10, tier: 'club' }] })).toBe(false);
    void finishDay;
  });
});
