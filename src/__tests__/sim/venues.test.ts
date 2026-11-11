// Every venue: the course is laid on its real water for any wind, clear of the shore and the piers,
// close to where the skippers stand; AI fleets race it without running aground; you can pick where
// on the water to sail; and what the club knows about its winds reaches the wind and Alfie.
import { describe, expect, it } from 'vitest';
import { Race } from '@/sim/engine';
import { VENUES, venueForClub } from '@/sim/venues';
import { controlAt, cutEdge, nearestShore, shoreWet, toGeo, venueWindFor, wetIn, windAt, windsOf } from '@/sim/venue';
import type { RaceSettings } from '@/sim/types';
import { localKnowledge } from '@/components/race-simulator/coach';

const base: RaceSettings = {
  classId: 'IOM', fleetSize: 8, level: 'state', windStrength: 'medium', windCharacter: 'oscillating',
  laps: 2, length: 'medium', sequenceSeconds: 60, coach: 'off', autoTrim: true, seed: 11, noPlayer: true,
};

describe.each(Object.keys(VENUES))('Venue %s', id => {
  const def = VENUES[id];
  const rings = [def.water, ...def.islands];

  it('is a sound shape: the shore anticlockwise, islands clockwise, the skippers on the bank', () => {
    const area = (r: { x: number; y: number }[]) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j].x * r[i].y - r[i].x * r[j].y; return a / 2; };
    expect(area(def.water)).toBeGreaterThan(20000);
    for (const isl of def.islands) expect(area(isl)).toBeLessThan(0);
    for (const p of def.control) expect(wetIn(rings, p.x, p.y)).toBe(false);
    // …and right beside the water: within a few metres of it.
    const m = { x: (def.control[0].x + def.control[1].x) / 2, y: (def.control[0].y + def.control[1].y) / 2 };
    let near = false;
    for (let a = 0; a < 360; a += 20) if (wetIn(rings, m.x + 6 * Math.sin((a * Math.PI) / 180), m.y + 6 * Math.cos((a * Math.PI) / 180))) near = true;
    expect(near).toBe(true);
    expect(def.credit).toContain('OpenStreetMap');
    expect(windsOf(def)[0].from).toBe(def.usualWind);
  });

  it('lays a course for every wind, clear of the shore and the piers, in sight of the skippers', () => {
    for (const cfg of [{}, { classId: 'DF65', length: 'short' }, { classId: '10R', length: 'long', fleetSize: 16 }] as Partial<RaceSettings>[]) {
      for (let wf = 0; wf < 360; wf += 22.5) {
        const r = new Race({ ...base, ...cfg, venue: id, windFrom: wf });
        expect(r.venue, `wind ${wf}`).not.toBeNull();
        const L = r.course.L, f = r.venue!.frame;
        for (const m of r.course.marks) {
          const g = toGeo(f, m.p);
          expect(wetIn(rings, g.x, g.y), `${m.id} at ${wf}°`).toBe(true);
          expect(nearestShore(r.course.shore!, m.p).d, `${m.id} at ${wf}°`).toBeGreaterThan(3.5 * L);
          for (const ft of def.features) if (ft.kind === 'pier') for (const q of ft.pts) expect(Math.hypot(q.x - g.x, q.y - g.y), `${m.id} by a pier at ${wf}°`).toBeGreaterThan(2 * L);
        }
        const c = r.venue!.control;
        const far = Math.max(...r.course.marks.map(m => Math.hypot(m.p.x - (c[0].x + c[1].x) / 2, m.p.y - (c[0].y + c[1].y) / 2)));
        expect(far, `wind ${wf}`).toBeLessThan(90 * L);
      }
    }
  }, 120000);

  it('AI fleets race its usual breeze without running aground, the same every time', () => {
    const run = () => {
      const r = new Race({ ...base, venue: id, seed: 5 });
      let dry = 0;
      while (!r.ended && r.t < 800) {
        r.step();
        if (r.step_ % 10 === 0) for (const b of r.boats) if (!shoreWet(r.course.shore!, b)) dry++;
      }
      return { dry, done: r.boats.filter(b => b.finished).length, n: r.boats.length, order: r.results().map(x => x.boat.sail).join(',') };
    };
    const a = run();
    expect(a.dry).toBe(0);
    expect(a.done).toBe(a.n);
    expect(run().order).toBe(a.order);
  }, 120000);

  it('lets you pick where to sail: you stand on the nearest bank and the course is laid off it', () => {
    // A spot on the water a couple of hundred metres along from the club.
    const open = cutEdge(def);
    let spot: [number, number] | null = null;
    for (let d = 150; d <= 400 && !spot; d += 25) for (let a = 0; a < 360 && !spot; a += 15) {
      const x = Math.round(d * Math.sin((a * Math.PI) / 180)), y = Math.round(d * Math.cos((a * Math.PI) / 180));
      if (!wetIn(rings, x, y)) continue;
      const ctl = controlAt(def, { x, y });
      if (ctl === def.control) continue;
      const r = new Race({ ...base, venue: id, venueSpot: [x, y] });
      // Not every bank has room for a course in this wind; one that has is what we're after.
      if (r.venue && Math.hypot(toGeo(r.venue.frame, r.venue.control[0]).x - def.control[0].x, toGeo(r.venue.frame, r.venue.control[0]).y - def.control[0].y) > 60) spot = [x, y];
    }
    expect(spot, 'somewhere else on this water to sail').not.toBeNull();
    const r = new Race({ ...base, venue: id, venueSpot: spot! });
    const g0 = toGeo(r.venue!.frame, r.venue!.control[0]), g1 = toGeo(r.venue!.frame, r.venue!.control[1]);
    // On the bank (not on the cut), a stretch to stand along, near the spot rather than the club.
    expect(wetIn(rings, g0.x, g0.y) || wetIn(rings, g1.x, g1.y)).toBe(false);
    expect(open(g0, g1)).toBe(false);
    expect(Math.hypot(g1.x - g0.x, g1.y - g0.y)).toBeGreaterThan(15);
    expect(Math.hypot((g0.x + g1.x) / 2 - spot![0], (g0.y + g1.y) / 2 - spot![1])).toBeLessThan(Math.hypot(spot![0], spot![1]) + 60);
    for (const m of r.course.marks) expect(nearestShore(r.course.shore!, m.p).d).toBeGreaterThan(3.5 * r.course.L);
    // The same spot is the same race on every device.
    const again = new Race({ ...base, venue: id, venueSpot: spot! });
    expect(again.venue!.frame.S).toEqual(r.venue!.frame.S);
  }, 60000);

  it('knows its winds, and Alfie passes the local knowledge on', () => {
    for (const w of windsOf(def)) {
      expect(venueWindFor(def, w.from)?.name).toBe(w.name);
      const r = new Race({ ...base, venue: id, windFrom: w.from });
      const lk = localKnowledge(r);
      if (w.note) expect(lk?.text).toContain(w.note);
      if (!w.pays) continue;
      const bankX = (r.venue!.control[0].x + r.venue!.control[1].x) / 2, across = r.course.bounds.across;
      if (Math.abs(bankX) <= 0.25 * across) {
        // The bank is dead up or down the course in this wind: neither side of the beat is the bank side.
        expect(lk?.say, `${w.name}`).toBeUndefined();
        continue;
      }
      // The side the club says pays carries more breeze across the course, whatever the day's puffs do.
      const good = (bankX > 0 ? 1 : -1) * (w.pays === 'bank' ? 1 : -1);
      let more = 0, less = 0;
      for (let seed = 1; seed <= 8; seed++) {
        const q = new Race({ ...base, venue: id, windFrom: w.from, seed });
        for (const y of [-12, 8, 28]) { more += q.wind.sample(good * 0.9 * across, y, 0).tws; less += q.wind.sample(-good * 0.9 * across, y, 0).tws; }
      }
      expect(more / less, `${w.name}`).toBeGreaterThan(1.15);
      expect(lk?.say, `${w.name}`).toContain(good > 0 ? 'right' : 'left');
      // A flat wind (rules lessons) has no sides.
      const flat = new Race({ ...base, venue: id, windFrom: w.from, flatWind: true });
      expect(flat.wind.sample(20, 15, 0).tws).toBe(flat.wind.sample(-20, 15, 0).tws);
    }
    expect(windAt(def, 99).name).toBe(windsOf(def)[0].name);
    for (const c of def.clubs ?? []) expect(venueForClub(c)).toBe(def);
  });
});
