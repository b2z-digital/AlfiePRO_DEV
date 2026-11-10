// After the finish: boats sail on through the line, turn away to the nearer end and wait beyond it,
// each in a spot of her own, out of the way of the boats still racing, instead of stopping on the
// line. And none of it changes anyone's result.
import { describe, expect, it } from 'vitest';
import { LEVELS, PERSONAS, Skipper } from '@/sim/ai';
import { Race } from '@/sim/engine';
import { toCourse } from '@/sim/course';
import { Rng, dist } from '@/sim/math';
import { hullGap, lineSide } from '@/sim/physics';
import { shoreWet } from '@/sim/venue';
import type { RaceSettings } from '@/sim/types';

const settings: RaceSettings = {
  classId: 'IOM', fleetSize: 12, level: 'state', windStrength: 'fresh', windCharacter: 'oscillating',
  laps: 1, length: 'short', sequenceSeconds: 30, coach: 'off', autoTrim: true, seed: 31, venue: 'lmryc',
};

/** A whole race, the player sailed by an AI skipper too; `each` runs after every step. */
function race(s: RaceSettings, each?: (r: Race) => void): Race {
  const r = new Race(s);
  const p = r.player!, i = r.boats.indexOf(p);
  p.persona = { ...PERSONAS[2] };
  (r.skippers as (Skipper | null)[])[i] = new Skipper(p, LEVELS.club, p.persona, new Rng(5), i);
  r.autopilot = true;
  while (!r.ended && r.t < 1500) { r.step(); each?.(r); }
  return r;
}

// One race, watched as it goes: where each boat finished, how long she hung about on the line
// after it, and how close any two boats that had finished came to each other.
const fin = new Map<string, { t: number; x: number; y: number }>();
const onLine = new Map<string, number>();
let closest = Infinity;
const sailed = race(settings, r => {
  const half = Math.abs(toCourse(r.course, r.course.finish.stbd).across);
  const done = r.boats.filter(b => b.finished);
  for (const b of done) {
    if (!fin.has(b.id)) fin.set(b.id, { t: r.t, x: b.x, y: b.y });
    const L = b.cls.loa;
    if (r.t - fin.get(b.id)!.t > 6 && lineSide(r.course, b) < L && Math.abs(toCourse(r.course, b).across) < half + L) onLine.set(b.id, (onLine.get(b.id) ?? 0) + 0.05);
  }
  for (let i = 0; i < done.length; i++) for (let j = i + 1; j < done.length; j++) closest = Math.min(closest, hullGap(done[i], done[j]) / done[i].cls.loa);
});

describe('After the finish', () => {
  it('every boat sails clear of the line instead of stopping on it', () => {
    expect(fin.size).toBeGreaterThan(8);
    for (const [id, f] of fin) {
      expect(onLine.get(id) ?? 0, `${id} hung about on the line`).toBeLessThan(2);
      const b = sailed.boats.find(x => x.id === id)!;
      if (sailed.t - f.t > 20) expect(dist(b, f) / b.cls.loa, `${id} didn't get far from where she finished`).toBeGreaterThan(4);
    }
  });

  it('waits off the end of the line, beyond it, each boat in a spot of her own on the water', () => {
    const c = sailed.course;
    const half = Math.abs(toCourse(c, c.finish.stbd).across);
    const waiting = sailed.boats.map((b, i) => ({ b, w: sailed.clearing[i]! })).filter(x => x.b.finished);
    expect(waiting.length).toBeGreaterThan(8);
    for (const { b, w } of waiting) {
      const L = b.cls.loa, at = toCourse(c, w.spot);
      expect(at.along, `${b.id}'s spot is beyond the line`).toBeGreaterThan(2 * L);
      expect(Math.abs(at.across), `${b.id}'s spot is off the end of the line`).toBeGreaterThan(half + 2 * L);
      expect(shoreWet(c.shore!, w.spot), `${b.id}'s spot is on the water`).toBe(true);
      for (const o of waiting) if (o.b !== b) expect(dist(o.w.spot, w.spot), `${b.id} and ${o.b.id} share a spot`).toBeGreaterThan(1.5 * L);
      // Those that finished a good while before the end are there, or near it.
      if (sailed.t - (b.finishTime + sailed.gunT) > 35) expect(dist(b, w.spot) / L, `${b.id} isn't at her spot`).toBeLessThan(3.5);
    }
  });

  it("keeps out of the way: boats that have finished don't sail through each other", () => {
    expect(closest).toBeGreaterThan(-0.03);
  });

  it("changes nothing for the boats still racing: their results are the same as if she'd stopped dead", () => {
    // The same race with every boat frozen where she finished, as it used to be.
    const at = new Map<string, { x: number; y: number; hdg: number }>();
    const frozen = race(settings, r => {
      for (const b of r.boats) {
        if (!b.finished) continue;
        if (!at.has(b.id)) at.set(b.id, { x: b.x, y: b.y, hdg: b.hdg });
        Object.assign(b, at.get(b.id)!, { spd: 0 });
      }
    });
    const results = (x: Race) => x.results().map(row => `${row.boat.id}:${row.status}:${row.time?.toFixed(3)}`);
    expect(results(sailed)).toEqual(results(frozen));
    const incidents = (x: Race) => x.incidents.map(i => `${i.t}:${i.rule}:${i.offender}`);
    expect(incidents(sailed)).toEqual(incidents(frozen));
  });

  it('is the same on every screen: the same race ends with every boat in the same place', () => {
    const again = race(settings);
    expect(again.boats.map(b => [b.x, b.y, b.hdg])).toEqual(sailed.boats.map(b => [b.x, b.y, b.hdg]));
  });
});
