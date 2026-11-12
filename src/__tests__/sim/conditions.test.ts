// The weather on the Circuit: each kind of water gets its own conditions, each day of an event its
// own weather, and the breeze can change through a day.
import { describe, expect, it } from 'vitest';
import { dayWeather, kindOf, seaFor, trendLine, type WaterKind } from '@/components/race-simulator/conditions';
import { NATIONAL_SEASON, ME, careerRace, dayWeatherOf, moveUp, newCareer, raceConditions, type Career } from '@/components/race-simulator/career';
import type { RaceSettings } from '@/sim/types';

const days = (kind: WaterKind, n = 400, races = 6) => Array.from({ length: n }, (_, k) => dayWeather(1000 + k * 7919, kind, races));

describe('Conditions by water', () => {
  it('a pond or man-made lake: always flat, light to medium, never fresh', () => {
    for (const d of days('pond')) for (const r of d.races) {
      expect(r.sea).toBe('flat');
      expect(r.wind).not.toBe('fresh');
    }
    expect(kindOf('lillydale')).toBe('pond');
    expect(kindOf(undefined)).toBe('pond');
  });

  it('an open lake gets anything: light to fresh, flat to rough', () => {
    const all = days('lake').flatMap(d => d.races);
    expect(new Set(all.map(r => r.wind))).toEqual(new Set(['light', 'medium', 'fresh']));
    expect(new Set(all.map(r => r.sea))).toEqual(new Set(['flat', 'chop', 'rough']));
    expect(kindOf('lmryc')).toBe('lake');
  });

  it('an open bay or harbour blows up rough in a fresh breeze', () => {
    expect(seaFor('bay', 'fresh')).toBe('rough');
    expect(seaFor('bay', 'medium')).toBe('chop');
    expect(new Set(days('bay').flatMap(d => d.races).map(r => r.sea))).toContain('rough');
    expect(kindOf('kbryc')).toBe('bay');
  });

  it('the breeze changes through some days, by a step, and holds through others', () => {
    const all = days('lake');
    const changing = all.filter(d => d.trend !== 'steady');
    expect(changing.length).toBeGreaterThan(all.length * 0.3);
    expect(all.length - changing.length).toBeGreaterThan(all.length * 0.25);
    for (const d of changing) {
      const ws = d.races.map(r => ['light', 'medium', 'fresh'].indexOf(r.wind));
      expect(Math.abs(ws[ws.length - 1] - ws[0])).toBe(1);
      expect(trendLine(d)).toMatch(/^(Building|Easing) to (light|medium|fresh) from race \d$/);
    }
  });

  it('the same day always has the same weather', () => {
    expect(dayWeather(42, 'bay', 8, 'medium')).toEqual(dayWeather(42, 'bay', 8, 'medium'));
  });
});

describe('Conditions on the Circuit', () => {
  const NOW = Date.UTC(2026, 10, 13);
  const base = { classId: 'IOM', fleetSize: 6, level: 'club', windStrength: 'medium', windCharacter: 'steady', laps: 1, length: 'short', sequenceSeconds: 30, coach: 'off', autoTrim: true, seed: 1, player: { name: 'Sam S' }, seaState: 'rough' } as RaceSettings;
  const atNationals = (): Career => {
    let c: Career = { ...newCareer('IOM', NOW), ticket: 'national' };
    c = moveUp(c, NOW);
    return { ...c, done: NATIONAL_SEASON.slice(0, -1).map((_, k) => ({ event: k, order: [ME, ...c.fleet.slice(0, 15)], rank: 1, net: 8, at: NOW })) };
  };

  it('each day of a multi-day event has its own weather, and a race is sailed in it', () => {
    const c = atNationals();
    const ds = [0, 1, 2].map(d => dayWeatherOf(c, d));
    expect(new Set(ds.map(d => JSON.stringify(d.races))).size).toBeGreaterThan(1);
    const s = careerRace(c, base);
    expect({ wind: s.windStrength, sea: s.seaState }).toEqual(raceConditions(c, 1));
  });

  it('the club season on the practice pond is flat, whatever the set-up said', () => {
    const c = newCareer('IOM', NOW);
    for (let no = 1; no <= 6; no++) expect(raceConditions(c, no, 'pond').sea).toBe('flat');
    expect(careerRace(c, base).seaState).toBe('flat');
  });
});
