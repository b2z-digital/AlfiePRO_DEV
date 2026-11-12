// The Circuit's invented waters: each is a sound shape with the skippers on its bank, takes a
// course in each of the winds it's known for, and a full fleet races it without running aground.
import { describe, expect, it } from 'vitest';
import { Race } from '@/sim/engine';
import { BUILT_IN, CIRCUIT_WATERS, VENUES } from '@/sim/venues';
import { creditLine, nearestShore, shoreWet, toGeo, wetIn, windsOf } from '@/sim/venue';
import type { RaceSettings } from '@/sim/types';

const base: RaceSettings = { classId: 'IOM', fleetSize: 16, level: 'state', windStrength: 'medium', windCharacter: 'oscillating', laps: 2, length: 'medium', sequenceSeconds: 30, coach: 'off', autoTrim: true, seed: 11, noPlayer: true, tune: 2 };

describe('The Circuit', () => {
  it("has its own waters, apart from the clubs' real ones", () => {
    expect(CIRCUIT_WATERS.length).toBe(7);
    for (const w of CIRCUIT_WATERS) {
      expect(VENUES[w.id]).toBe(w);
      expect(BUILT_IN.includes(w)).toBe(false);
      expect(w.invented).toBe(true);
      expect(creditLine(w)).toBe('An invented water of the AlfiePRO Circuit');
    }
    expect(creditLine(BUILT_IN[0])).toContain('OpenStreetMap');
  });
});

describe.each(CIRCUIT_WATERS.map(w => w.id))('Circuit water %s', id => {
  const def = VENUES[id];
  const rings = [def.water];

  it('is a sound shape: the shore anticlockwise, the skippers dry and right beside the water', () => {
    let a = 0;
    for (let i = 0, j = def.water.length - 1; i < def.water.length; j = i++) a += def.water[j].x * def.water[i].y - def.water[i].x * def.water[j].y;
    expect(a / 2).toBeGreaterThan(50000);
    for (const p of def.control) expect(wetIn(rings, p.x, p.y)).toBe(false);
    expect(wetIn(rings, 0, 8)).toBe(true);
    expect(windsOf(def)[0].from).toBe(def.usualWind);
    expect(def.traits!.winds.length).toBeGreaterThanOrEqual(2);
    // Woods and buildings stand on the bank, not in the water.
    for (const f of def.features) if (f.kind === 'bld') for (const p of f.pts) expect(wetIn(rings, p.x, p.y), `${f.name ?? 'a building'} at ${p.x},${p.y}`).toBe(false);
  });

  it("lays a course in each of its winds, clear of the shore and in sight of the skippers", () => {
    for (const cfg of [{}, { classId: 'DF65', length: 'short' }, { classId: '10R', length: 'long' }] as Partial<RaceSettings>[]) {
      for (const w of windsOf(def)) {
        const r = new Race({ ...base, ...cfg, venue: id, windFrom: w.from });
        expect(r.venue, `${w.name}`).not.toBeNull();
        const L = r.course.L, f = r.venue!.frame;
        for (const m of r.course.marks) {
          const g = toGeo(f, m.p);
          expect(wetIn(rings, g.x, g.y), `${m.id} in the ${w.name}`).toBe(true);
          expect(nearestShore(r.course.shore!, m.p).d, `${m.id} in the ${w.name}`).toBeGreaterThan(3.5 * L);
        }
        const c = r.venue!.control;
        const far = Math.max(...r.course.marks.map(m => Math.hypot(m.p.x - (c[0].x + c[1].x) / 2, m.p.y - (c[0].y + c[1].y) / 2)));
        expect(far, `${w.name}`).toBeLessThan(90 * L);
      }
    }
  }, 120000);

  it('a fleet of sixteen races its usual breeze without running aground', () => {
    const r = new Race({ ...base, venue: id, seed: 5 });
    let dry = 0;
    while (!r.ended && r.t < 900) {
      r.step();
      if (r.step_ % 10 === 0) for (const b of r.boats) if (!shoreWet(r.course.shore!, b)) dry++;
    }
    expect(dry).toBe(0);
    expect(r.boats.filter(b => b.finished).length).toBe(r.boats.length);
  }, 120000);
});
