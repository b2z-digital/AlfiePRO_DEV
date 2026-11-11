// The skill passport and the race focus: from saved ledgers to grades, trends and one thing to work on.
import { describe, expect, it } from 'vitest';
import { Race } from '@/sim/engine';
import { LEVELS, PERSONAS, Skipper } from '@/sim/ai';
import { Rng } from '@/sim/math';
import type { RaceSettings } from '@/sim/types';
import { WindMemory } from '@/components/race-simulator/coach';
import { focusResult, focusWords, raceFocus } from '@/components/race-simulator/focus';
import { CAUSES, per, rate, versus, type Cause, type Ledger, type Part, type Versus } from '@/components/race-simulator/ledger';
import { gradeFor, passport, trend } from '@/components/race-simulator/passport';
import type { Profile } from '@/components/race-simulator/profile';
import { PlayerLog, summarize, type RaceSummary } from '@/components/race-simulator/stats';

const led = (by: Partial<Record<Cause, number>>, minutes = 10, vs?: Versus, turns = 10, marks = 3): Ledger => {
  const parts = CAUSES.map(c => ({ cause: c, lengths: by[c] ?? 0 }));
  return { total: parts.reduce((s, p) => s + p.lengths, 0), parts, worst: [], speedUp: 0, tacks: 0, tacksMade: turns, gybesMade: 0, marks, minutes, vs };
};
const all = (v: number) => Object.fromEntries([...CAUSES, 'total'].map(c => [c, v])) as Record<Part, number>;
const beat = (v: number, level = 'state'): Versus => ({ level, boats: 7, beat: all(v), mid: all(4) });
let clock = 1_700_000_000_000;
const race = (l: Ledger, level = 'state'): RaceSummary => ({ at: (clock += 86400000), mode: 'race', status: 'finished', level, fleet: 8, ledger: l } as RaceSummary);
/** Newest first, the way the profile keeps them. */
const prof = (...rs: RaceSummary[]): Profile => ({ races: [...rs].reverse() });

describe('Rates', () => {
  it('each part in its own unit: a start, a turn, a rounding, and the rest for every ten minutes', () => {
    const r = rate(led({ start: 3, turns: 4, roundings: 6, speed: 4 }, 5, undefined, 8, 3));
    expect(r.start).toBe(3);
    expect(r.turns).toBe(0.5);
    expect(r.roundings).toBe(2);
    expect(r.speed).toBe(8);
    expect(r.total).toBe(34);
    expect([per('start'), per('turns'), per('roundings'), per('air'), per('total')]).toEqual(['a start', 'a tack or gybe', 'a rounding', 'every ten minutes of racing', 'every ten minutes of racing']);
  });
});

describe('Against the fleet', () => {
  it('counts the boats that gave away more, half for a tie, and all of a tie at nothing', () => {
    const v = versus(led({ start: 2, turns: 5, penalties: 0 }), [led({ start: 1, turns: 5, penalties: 0 }), led({ start: 3, turns: 9, penalties: 0 }), led({ start: 4, turns: 2, penalties: 6 }), led({ start: 6, turns: 7, penalties: 0 })], 'club');
    expect(v.boats).toBe(4);
    expect(v.beat.start).toBe(0.75);
    expect(v.beat.turns).toBe(0.63); // two worse, one level: 2.5 of 4
    expect(v.beat.penalties).toBe(1); // nothing given away can't be beaten
    expect(v.mid.start).toBe(3.5);
    // A boat that has raced half as long with half the loss is level with you, not ahead.
    expect(versus(led({ speed: 6 }, 10), [led({ speed: 3 }, 5)], 'club').beat.speed).toBe(0.5);
  });

  it("is kept with a real race's summary, a share for every part", () => {
    const settings: RaceSettings = { classId: 'IOM', fleetSize: 6, level: 'club', windStrength: 'medium', windCharacter: 'oscillating', laps: 1, length: 'short', sequenceSeconds: 20, coach: 'off', autoTrim: true, seed: 3, seaState: 'flat' };
    const r = new Race(settings);
    const p = r.player!, i = r.boats.indexOf(p);
    p.persona = { ...PERSONAS[2] };
    (r.skippers as (Skipper | null)[])[i] = new Skipper(p, LEVELS.national, p.persona, new Rng(5), i);
    r.autopilot = true;
    const mem = new WindMemory(), log = new PlayerLog();
    while (!r.ended && r.t < 900) { r.step(); mem.update(r.t, r.wind.sample(p.x, p.y, r.t).twd); log.sample(r, p, mem.mean); }
    const sum = summarize(r, log, 'race');
    expect(sum.status).toBe('finished');
    const vs = sum.ledger!.vs!;
    expect(vs.level).toBe('club');
    expect(vs.boats).toBeGreaterThanOrEqual(3);
    for (const c of [...CAUSES, 'total'] as Part[]) { expect(vs.beat[c]).toBeGreaterThanOrEqual(0); expect(vs.beat[c]).toBeLessThanOrEqual(1); expect(vs.mid[c]).toBeGreaterThanOrEqual(0); }
  }, 120000);
});

describe('The skill passport', () => {
  it('is nothing until a race has kept a ledger', () => {
    expect(passport({ races: [] })).toBeNull();
    expect(passport({ races: [{ mode: 'start', status: 'finished' } as RaceSummary] })).toBeNull();
  });

  it('grades by the share of the fleet you gave away less than, once three races have a fleet', () => {
    expect([0.1, 0.25, 0.5, 0.74, 0.75, 1].map(gradeFor)).toEqual([null, 'bronze', 'silver', 'silver', 'gold', 'gold']);
    const two = passport(prof(race(led({ turns: 5 }, 10, beat(0.8))), race(led({ turns: 5 }, 10, beat(0.8)))))!;
    expect(two.graded).toBe(2);
    expect(two.skills.every(s => s.grade === null && s.beat === null)).toBe(true);
    expect(two.against).toBeNull();
    const three = passport(prof(race(led({ turns: 5 }, 10, beat(0.9, 'club')), 'club'), race(led({ turns: 5 }, 10, beat(0.6, 'national')), 'national'), race(led({ turns: 5 }, 10, beat(0.6)))))!;
    const turns = three.skills.find(s => s.part === 'turns')!;
    expect(turns.beat).toBe(0.7);
    expect(turns.grade).toBe('silver');
    expect(turns.next).toEqual({ grade: 'gold', at: 0.75 });
    expect(turns.fleet).toBe(4);
    expect(three.against).toBe('Club to National skippers');
    expect(three.total.grade).toBe('silver');
  });

  it('shows each skill race by race, oldest first, and which way it is going', () => {
    const rs = [9, 9, 8, 9, 8, 6, 5, 5, 4, 5].map(t => race(led({ speed: t, start: 2 }, 10)));
    const pp = passport(prof(...rs))!;
    const speed = pp.skills.find(s => s.part === 'speed')!;
    expect(speed.series.map(s => s.v)).toEqual([9, 9, 8, 9, 8, 6, 5, 5, 4, 5]);
    expect(speed.now).toBe(5);
    expect(speed.before).toBe(8.6);
    expect(trend(speed)).toEqual({ dir: 'better', by: 3.6 });
    expect(trend(pp.skills.find(s => s.part === 'start')!)).toEqual({ dir: 'steady', by: 0 });
    expect(pp.total.now).toBe(7);
    // Too few races for a trend yet.
    expect(trend(passport(prof(...rs.slice(0, 4)))!.skills[0])).toBeNull();
  });
});

describe('The race focus', () => {
  it('is the part that cost most lengths over the last five races, with a target a fifth better', () => {
    expect(raceFocus({ races: [] })).toBeNull();
    const f = raceFocus(prof(race(led({ speed: 9, start: 3 }, 10)), race(led({ speed: 11, air: 4 }, 10))))!;
    expect(f).toEqual({ cause: 'speed', was: 10, target: 8 });
    const w = focusWords(f);
    expect(w.title).toBe('This race: boat speed');
    expect(w.line).toBe('Boat speed has been your biggest leak: about 10 lengths every ten minutes of racing. Get under 8.');
    expect(w.say).toMatch(/^Your focus this race: boat speed\. /);
    expect(w.result).toBeNull();
    // Nothing worth chasing: no focus.
    expect(raceFocus(prof(race(led({ turns: 1, start: 1 }, 10))))).toBeNull();
  });

  it('speaks in the unit of the part: lengths a turn, a rounding', () => {
    // Twelve lengths over ten turns: 1.2 a turn, to get under 1.
    const t = raceFocus(prof(race(led({ turns: 12, speed: 5 }, 6, undefined, 10))))!;
    expect(t).toEqual({ cause: 'turns', was: 1.2, target: 1 });
    expect(focusWords(t).line).toBe('Tacks and gybes have been your biggest leak: about 1.2 lengths a tack or gybe. Get under 1.');
    const r = raceFocus(prof(race(led({ roundings: 9 }, 4, undefined, 10, 3))))!;
    expect(r).toEqual({ cause: 'roundings', was: 3, target: 2.5 });
    expect(focusWords(r).line).toBe('Mark roundings have been your biggest leak: about 3 lengths a rounding. Get under 2.5.');
  });

  it('is scored on the race you sail, in the same unit', () => {
    const f = { cause: 'speed' as Cause, was: 10, target: 8 };
    const met = focusResult(f, led({ speed: 3.5 }, 5));
    expect(met).toMatchObject({ got: 7, met: true });
    expect(focusWords(met).result).toBe('Met. You gave away 7 lengths every ten minutes of racing, against a target of 8 (you had been at 10).');
    const not = focusResult(f, led({ speed: 6 }, 5));
    expect(not).toMatchObject({ got: 12, met: false });
    expect(focusWords(not).result).toMatch(/^Not this time\. You gave away 12 lengths/);
    // A short race with three marks is judged a rounding at a time, not by the clock.
    expect(focusResult({ cause: 'roundings', was: 3, target: 2.5 }, led({ roundings: 6 }, 2.2, undefined, 6, 3)).got).toBe(2);
    expect(focusResult({ cause: 'start', was: 5, target: 4 }, led({ start: 3 }, 5)).got).toBe(3);
    expect(focusWords({ cause: 'start', was: 5, target: 4 }).line).toBe('The start has been your biggest leak: about 5 lengths a start. Get under 4.');
    expect(focusWords({ cause: 'turns', was: 1, target: 0.8 }).line).toBe('Tacks and gybes have been your biggest leak: about 1 length a tack or gybe. Get under 0.8.');
  });
});
