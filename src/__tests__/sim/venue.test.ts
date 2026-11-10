// Race simulator at a real venue (LMRYC, Booragul): the course is laid on the real water for any
// wind, clear of the shore, and AI fleets race it without ever running aground. Run with: npm test
import { describe, expect, it } from 'vitest';
import { Race } from '@/sim/engine';
import { VENUES } from '@/sim/venues';
import { nearestShore, shoreWet, toGeo, wetIn } from '@/sim/venue';
import type { RaceSettings } from '@/sim/types';

const base: RaceSettings = {
  classId: 'IOM', fleetSize: 8, level: 'state', windStrength: 'medium', windCharacter: 'oscillating',
  laps: 2, length: 'medium', sequenceSeconds: 60, coach: 'off', autoTrim: true, seed: 11, noPlayer: true, venue: 'lmryc',
};

const def = VENUES.lmryc;
const rings = [def.water, ...def.islands];

describe('LMRYC venue', () => {
  it('lays the course on open water for every wind direction, close to the control area', () => {
    for (const cfg of [{}, { classId: '10R', length: 'long', fleetSize: 16 }] as Partial<RaceSettings>[]) {
      for (let wf = 0; wf < 360; wf += 22.5) {
        const r = new Race({ ...base, ...cfg, windFrom: wf });
        expect(r.venue, `wind ${wf}`).not.toBeNull();
        const L = r.course.L;
        for (const m of r.course.marks) {
          const g = toGeo(r.venue!.frame, m.p);
          expect(wetIn(rings, g.x, g.y), `${m.id} at ${wf}°`).toBe(true);
          expect(nearestShore(r.course.shore!, m.p).d, `${m.id} at ${wf}°`).toBeGreaterThan(3.5 * L);
        }
        // The skippers stand on the bank, within sight of the whole course.
        const c = r.venue!.control;
        expect(shoreWet(r.course.shore!, c[0]) || shoreWet(r.course.shore!, c[1])).toBe(false);
        const far = Math.max(...r.course.marks.map(m => Math.hypot(m.p.x - (c[0].x + c[1].x) / 2, m.p.y - (c[0].y + c[1].y) / 2)));
        expect(far, `wind ${wf}`).toBeLessThan(90 * L);
        expect(r.course.rot).toBeCloseTo(wf, 5);
      }
    }
  }, 60000);

  it('uses the club breeze by default', () => {
    const r = new Race(base);
    expect(r.course.rot).toBe(def.usualWind);
    expect(r.course.axis).toBe(0);
  });

  it('AI fleets finish without running aground, and replay exactly', () => {
    const results: string[] = [];
    for (const windFrom of [75, 200]) {
      const r = new Race({ ...base, windFrom, seed: 5 });
      let dry = 0;
      while (!r.ended && r.t < 800) {
        r.step();
        if (r.step_ % 10 === 0) for (const b of r.boats) if (!shoreWet(r.course.shore!, b)) dry++;
      }
      expect(dry, `wind ${windFrom}`).toBe(0);
      expect(r.boats.filter(b => b.finished).length, `wind ${windFrom}`).toBe(r.boats.length);
      results.push(r.results().map(x => x.boat.sail).join(','));
    }
    const again = new Race({ ...base, windFrom: 75, seed: 5 });
    while (!again.ended && again.t < 800) again.step();
    expect(again.results().map(x => x.boat.sail).join(',')).toBe(results[0]);
  }, 120000);
});
