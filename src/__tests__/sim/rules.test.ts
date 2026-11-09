// Race simulator: scripted rule situations with the ruling we expect, plus fleet sanity checks.
// Boats here are steered by scripts (not the AI) in a steady 4 m/s northerly, so each situation
// plays out the same way every time. Run with: npm test
import { describe, expect, it } from 'vitest';
import { Race } from '@/sim/engine';
import { bestSheet } from '@/sim/classes';
import { initialProgress } from '@/sim/course';
import { bearing, clamp, dir, n180 } from '@/sim/math';
import { lineSide } from '@/sim/physics';
import type { Boat, Incident, RaceSettings } from '@/sim/types';

const TWS = 4; // m/s from the north (0°): starboard close-hauled is about 317°, port about 43°

type PlanFn = (t: number, b: Boat) => { hdg: number; sheet?: number };

/** Steers one boat by script; counts as "changing course to avoid" for the referee, like the player. */
class Scripted {
  lastAvoid = { t: 1e9, hdg: 0, tag: 'script' };
  intent = 'Scripted';
  constructor(public b: Boat, private plan: PlanFn, private t0 = 0) {}
  decide() { /* scripted */ }
  helm(h: Race) {
    const want = this.plan(h.t - this.t0, this.b);
    const err = n180(want.hdg - this.b.hdg);
    this.b.rudder = clamp(err / 15 - this.b.rot / 200, -1, 1);
    this.b.sheet = want.sheet ?? bestSheet(Math.abs(this.b.twa));
  }
}

interface Spec { x: number; y: number; hdg: number; spd?: number; plan?: PlanFn; leg?: number }

const base: RaceSettings = {
  classId: 'IOM', fleetSize: 2, level: 'state', windStrength: 'medium', windCharacter: 'steady',
  laps: 1, length: 'medium', sequenceSeconds: 0.1, coach: 'off', autoTrim: true, seed: 42, noPlayer: true,
};

function steadyWind(race: Race, twd = 0) {
  race.wind.sample = () => ({ twd, tws: TWS });
  race.wind.step = () => { /* steady */ };
}

/** Boats placed after the start, racing, each following its script. Script time 0 = setup. */
function scenario(specs: Spec[], twd = 0): Race {
  const race = new Race({ ...base, fleetSize: specs.length });
  steadyWind(race, twd);
  while (race.t < race.gunT + 0.1) race.step();
  const t0 = race.t;
  specs.forEach((sp, i) => {
    const b = race.boats[i];
    Object.assign(b, { x: sp.x, y: sp.y, hdg: sp.hdg, spd: sp.spd ?? 0.8, rot: 0, rudder: 0, started: true, ocs: false, returning: false });
    b.twd = twd; b.tws = TWS; b.twa = n180(twd - sp.hdg); b.tack = b.twa >= 0 ? 'stbd' : 'port'; b.tackingSince = null;
    b.legIndex = sp.leg ?? 0;
    const leg = race.course.legs[b.legIndex];
    if (leg && leg.kind === 'mark') { const m = race.course.byId[leg.rounding.markId].p; b.progress = initialProgress(leg.rounding, m, b); b.lastBearing = bearing(m, b); }
    if (leg && leg.kind === 'gate') {
      const m0 = race.course.byId[leg.options[0].markId].p, m1 = race.course.byId[leg.options[1].markId].p;
      b.progress = initialProgress(leg.options[0], m0, b); b.lastBearing = bearing(m0, b);
      b.progress2 = initialProgress(leg.options[1], m1, b); b.lastBearing2 = bearing(m1, b);
    }
    race.hist[i] = { x: [], y: [], hdg: [], spd: [], rot: [] };
    (race.skippers as unknown[])[i] = new Scripted(b, sp.plan ?? (() => ({ hdg: sp.hdg })), t0);
  });
  race.events.length = 0;
  race.incidents.length = 0;
  return race;
}

function run(race: Race, seconds: number): Incident[] {
  const end = race.t + seconds;
  while (race.t < end && !race.ended) race.step();
  return race.incidents.filter(i => i.kind !== 'ocs');
}

const sail = (race: Race, i: number) => race.boats[i].id;
/** Point `d` metres along heading `h` from p. */
const along = (p: { x: number; y: number }, h: number, d: number) => ({ x: p.x + dir(h).x * d, y: p.y + dir(h).y * d });

describe('Race simulator: right of way', () => {
  it('Rule 10: port hits starboard, port is penalised', () => {
    const C = { x: 0, y: 12 };
    const B = along(C, 317 + 180, 2.4), A = along(C, 43 + 180, 2.4);
    const race = scenario([{ ...A, hdg: 43 }, { ...B, hdg: 317 }]);
    const inc = run(race, 5);
    expect(inc.length).toBeGreaterThan(0);
    expect(inc[0]).toMatchObject({ kind: 'contact', rule: '10', offender: sail(race, 0), victim: sail(race, 1) });
  });

  it('Rule 10 without contact: starboard has to bear away to miss port, port is penalised', () => {
    const C = { x: 0, y: 12 };
    const B = along(C, 317 + 180, 3.2), A = along(C, 43 + 180, 3.2);
    const race = scenario([
      { ...A, hdg: 43 },
      { ...B, hdg: 317, plan: t => ({ hdg: t < 2.4 ? 317 : 250 }) },
    ]);
    const inc = run(race, 6);
    expect(inc.length).toBeGreaterThan(0);
    expect(inc[0]).toMatchObject({ kind: 'forced', rule: '10', offender: sail(race, 0) });
  });

  it('Rule 11: windward boat bears away onto the leeward boat', () => {
    const Lb = { x: 0, y: 12 };
    const Wb = along(Lb, 47, 0.62);
    const race = scenario([
      { ...Wb, hdg: 317, plan: t => ({ hdg: t < 0.8 ? 317 : 296 }) },
      { ...Lb, hdg: 317 },
    ]);
    const inc = run(race, 5);
    expect(inc.length).toBeGreaterThan(0);
    expect(inc[0]).toMatchObject({ rule: '11', offender: sail(race, 0), victim: sail(race, 1) });
  });

  it('Rule 12: a boat clear astern sails into the one ahead', () => {
    const ahead = { x: 0, y: 12 };
    const astern = along(ahead, 317 + 180, 1.35);
    const race = scenario([
      { ...astern, hdg: 317, spd: 0.85 },
      { ...ahead, hdg: 317, spd: 0.5, plan: () => ({ hdg: 317, sheet: 0.25 }) },
    ]);
    const inc = run(race, 6);
    expect(inc.length).toBeGreaterThan(0);
    expect(inc[0]).toMatchObject({ rule: '12', offender: sail(race, 0), victim: sail(race, 1) });
  });

  it('Rule 13 (or 15): tacking right in front of a starboard boat', () => {
    const B = { x: 0, y: 12 };
    const A = { x: along(B, 317, 1.5).x - 0.35, y: along(B, 317, 1.5).y - 0.2 };
    const race = scenario([
      { ...A, hdg: 43, spd: 0.75, plan: t => ({ hdg: t < 0.15 ? 43 : 317 }) },
      { ...B, hdg: 317, spd: 0.85 },
    ]);
    const inc = run(race, 5);
    expect(inc.length).toBeGreaterThan(0);
    expect(inc[0].offender).toBe(sail(race, 0));
    expect(['13', '15']).toContain(inc[0].rule);
  });

  it('Rule 16.1: starboard bears away into a port boat that was keeping clear', () => {
    // Reaching past each other with half a length to spare, until starboard turns into port.
    const B = { x: 2, y: 12 }, A = { x: -2, y: 11.2 };
    const race = scenario([
      { ...A, hdg: 90 },
      { ...B, hdg: 270, plan: t => ({ hdg: t < 1.3 ? 270 : 215 }) },
    ]);
    const inc = run(race, 5);
    expect(inc.length).toBeGreaterThan(0);
    expect(inc[0]).toMatchObject({ rule: '16.1', offender: sail(race, 1), victim: sail(race, 0) });
  });
});

describe('Race simulator: marks', () => {
  it('Rule 18.2: the outside leeward boat squeezes the inside boat at the gate', () => {
    // Leg 2 is the run to the gate; GP (rounded to port) is at (3.2, -17) for an IOM.
    const I = { x: 2.62, y: -11.6 }, O = { x: 2.05, y: -11.6 };
    const race = scenario([
      { ...I, hdg: 178, leg: 2, plan: (t, b) => ({ hdg: b.y > -16.6 ? 178 : 70 }) },
      { ...O, hdg: 178, leg: 2, plan: t => ({ hdg: t < 5.4 ? 178 : 115 }) },
    ]);
    const gp = race.course.byId.GP.p;
    expect(gp.x).toBeCloseTo(3.2, 1);
    const inc = run(race, 9);
    const mr = inc.find(i => i.kind === 'mark-room');
    expect(mr).toBeTruthy();
    expect(mr).toMatchObject({ offender: sail(race, 1), victim: sail(race, 0) });
  });

  it('Rule 31: touching a mark', () => {
    const W = { x: 0, y: 30 };
    // Wind from the west, so sailing north at the mark is a beam reach.
    const race = scenario([{ x: W.x, y: W.y - 3, hdg: 0, spd: 0.8, plan: (t, b) => ({ hdg: bearing(b, W) }) }], 270);
    const inc = run(race, 6);
    expect(inc.some(i => i.kind === 'mark-touch' && i.rule === '31')).toBe(true);
  });

  it('Rule 18.3: tacking onto starboard in the zone in front of a starboard boat', () => {
    const W = { x: 0, y: 30 };
    const Y = { x: W.x + 2.5, y: W.y - 3.1 };
    const X = { x: Y.x - 0.95, y: Y.y + 1.05 };
    const race = scenario([
      { ...X, hdg: 43, spd: 0.6, plan: t => ({ hdg: t < 0.1 ? 43 : 317 }) },
      { ...Y, hdg: 317, spd: 0.85, plan: t => ({ hdg: t < 1.5 ? 317 : 352 }) },
    ]);
    const inc = run(race, 5);
    const zt = inc.find(i => i.rule === '18.3');
    expect(zt).toBeTruthy();
    expect(zt).toMatchObject({ offender: sail(race, 0), victim: sail(race, 1) });
  });
});

describe('Race simulator: start and penalties', () => {
  it('Rule 29.1: over the line at the gun is recalled', () => {
    const race = new Race({ ...base, sequenceSeconds: 3 });
    steadyWind(race);
    race.step();
    const b = race.boats[0];
    Object.assign(b, { x: 0, y: 0.8, hdg: 345, spd: 0.05 });
    (race.skippers as unknown[])[0] = new Scripted(b, () => ({ hdg: 345, sheet: 0.05 }));
    (race.skippers as unknown[])[1] = new Scripted(race.boats[1], () => ({ hdg: race.boats[1].hdg, sheet: 0.05 }));
    while (race.t < race.gunT + 0.2) race.step();
    expect(lineSide(race.course, b)).toBeGreaterThan(0);
    expect(race.incidents.some(i => i.kind === 'ocs' && i.rule === '29.1' && i.offender === b.id)).toBe(true);
    expect(race.events.some(e => e.type === 'recall')).toBe(true);
  });

  it('One-Turn Penalty: a 360 with a tack and a gybe clears what she owes', () => {
    const race = scenario([{ x: 0, y: 12, hdg: 317, spd: 0.85, plan: (t, b) => ({ hdg: n180(b.hdg + 60) }) }]);
    race.boats[0].penalty.owed = 1;
    run(race, 12);
    expect(race.boats[0].penalty.owed).toBe(0);
    expect(race.boats[0].penalty.taken).toBe(1);
    expect(race.events.some(e => e.type === 'penalty-done')).toBe(true);
  });
});

describe('Race simulator: AI fleet', () => {
  const fleet = (seed: number, extra: Partial<RaceSettings> = {}) => {
    const race = new Race({ ...base, fleetSize: 8, windCharacter: 'oscillating', laps: 2, sequenceSeconds: 60, seed, ...extra });
    let steps = 0;
    while (!race.ended && steps < 20 * 60 * 15) { race.step(); steps++; }
    return race;
  };

  it('every boat sails the course and finishes', () => {
    for (const seed of [11, 23]) {
      const race = fleet(seed);
      expect(race.boats.every(b => b.finished)).toBe(true);
      // Every boat rounded the marks in order: one rounding per leg before finishing.
      for (const b of race.boats) expect(b.roundedAt.length).toBe(race.course.legs.length);
    }
  }, 120000);

  it('replays exactly from the same seed', () => {
    const a = fleet(31, { windStrength: 'light' }), b = fleet(31, { windStrength: 'light' });
    expect(a.boats.map(x => x.finishTime)).toEqual(b.boats.map(x => x.finishTime));
  }, 120000);
});
