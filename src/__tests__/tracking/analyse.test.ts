import { describe, expect, it } from 'vitest';
import { DemoRace } from '@/components/tracking/core/demo';
import { analyseRace, standingsAt, windFromFleet, DEFAULT_SETUP } from '@/components/tracking/core/analyse';

// One simulated race, sailed once: 12 IOMs at Booragul, two laps.
const demo = new DemoRace({ seed: 5 });
demo.sailToEnd();
const r = demo.race;
const a = analyseRace(demo.boats, demo.course, demo.gun, demo.t, DEFAULT_SETUP);

describe('tracking analysis against the simulator', () => {
  it('finds every finish in the engine\'s order', () => {
    const engine = r.results().filter(x => x.time != null).map(x => x.boat.id);
    expect(a.finishes.map(f => f.boatId)).toEqual(engine);
    for (const f of a.finishes) {
      const ev = r.events.find(e => e.type === 'finish' && e.boat === f.boatId) as { t: number } | undefined;
      expect(Math.abs(f.t - ev!.t)).toBeLessThan(0.15);
    }
  });
  it('rounds every mark', () => {
    for (const b of demo.boats) expect(a.roundings.filter(x => x.boatId === b.id).length).toBe(demo.course.waypoints.length);
    expect(a.missed).toEqual([]);
    expect(a.roundings.filter(x => x.wrongSide)).toEqual([]);
  });
  it('calls the boats the engine recalled', () => {
    const recall = (r.events.find(e => e.type === 'recall') as { boats: string[] } | undefined)?.boats ?? [];
    const flagged = a.starts.filter(s => s.call !== 'clear').map(s => s.boatId);
    expect(new Set(flagged)).toEqual(new Set(recall));
    for (const s of a.starts.filter(x => x.call !== 'close')) {
      const ev = r.events.find(e => e.type === 'started' && e.boat === s.boatId) as { late: number } | undefined;
      expect(Math.abs((s.startedAt! - demo.gun) - ev!.late)).toBeLessThan(0.3);
    }
  });
  it('spots the penalty turns and the contacts they answer', () => {
    const done = r.events.filter(e => e.type === 'penalty-done') as unknown as { boat: string; t: number }[];
    const found = done.filter(d => a.turns.some(t => t.boatId === d.boat && Math.abs(t.t - d.t) < 8));
    expect(found.length).toBe(done.length);
    expect(a.turns.length).toBeLessThanOrEqual(done.length + 1);
    const contacts = r.events.filter(e => e.type === 'incident' && (e as { incident: { kind: string } }).incident.kind === 'contact') as unknown as { t: number; incident: { offender: string; victim: string } }[];
    for (const c of contacts) {
      expect(a.encounters.some(e => Math.abs(e.t - c.t) < 3 && [e.a, e.b].includes(c.incident.offender) && [e.a, e.b].includes(c.incident.victim))).toBe(true);
    }
  });
  it('ranks the fleet mid-race and reads the wind', () => {
    const t = demo.gun + 215;
    const st = standingsAt(demo.boats, demo.course, analyseRace(demo.boats, demo.course, demo.gun, t), t);
    expect(st[0].leg).toBeGreaterThan(1);
    expect(st.every((s, i) => i === 0 || s.gapM >= 0)).toBe(true);
    const w = windFromFleet(demo.boats, demo.course, a, t);
    const twd = r.track.find(f => Math.abs(f.t - t) < 0.11)!.twd;
    expect(w).not.toBeNull();
    expect(Math.abs(((w! - twd + 540) % 360) - 180)).toBeLessThan(10);
  });

  it('only calls finishes too close when the boats crossed together', () => {
    // The finish is mid-course: boats still on their way to the last mark pass near it from the far
    // side, and must not be counted as close to a boat finishing.
    for (const f of a.finishes) for (const id of f.tooClose) {
      const o = a.finishes.find(x => x.boatId === id)!;
      expect(Math.abs(o.t - f.t)).toBeLessThan(3);
    }
    for (const f of a.finishes) if (f.margin != null) expect(f.margin).toBeGreaterThanOrEqual(0);
  });
});
