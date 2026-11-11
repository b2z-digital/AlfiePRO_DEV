// Where the skipper stands in the bank view: sighting down the line for a start or finish, walking
// the bank with the boat between, and never so far down it that the gate is looked back up at.
import { describe, expect, it } from 'vitest';
import { Race } from '@/sim/engine';
import { VENUES } from '@/sim/venues';
import type { RaceSettings } from '@/sim/types';
import { bankStation, followCam, newBankCam } from '@/components/race-simulator/bank';

const base: RaceSettings = {
  classId: 'IOM', fleetSize: 8, level: 'state', windStrength: 'medium', windCharacter: 'oscillating',
  laps: 2, length: 'medium', sequenceSeconds: 60, coach: 'off', autoTrim: true, seed: 3,
};
const WHERE: Partial<RaceSettings>[] = [{}, { classId: 'DF65' }, ...Object.keys(VENUES).flatMap(v => [{ venue: v }, { venue: v, classId: 'DF65' as const }, { venue: v, windFrom: (VENUES[v].usualWind + 180) % 360 }])];

describe('Standing in the control area', () => {
  it.each(WHERE.map(w => [JSON.stringify(w), w] as const))('%s', (_n, w) => {
    const r = new Race({ ...base, ...w });
    const c = r.course, L = c.L, ca = r.controlArea();
    const along = (p: { x: number; y: number }) => (p.x - c.origin.x) * c.up.x + (p.y - c.origin.y) * c.up.y;
    const onStretch = (p: { x: number; y: number }) => {
      const ex = ca.b.x - ca.a.x, ey = ca.b.y - ca.a.y, l2 = ex * ex + ey * ey;
      const u = ((p.x - ca.a.x) * ex + (p.y - ca.a.y) * ey) / l2;
      return u > -1e-6 && u < 1 + 1e-6 && Math.abs((p.x - ca.a.x) * ey - (p.y - ca.a.y) * ex) / Math.sqrt(l2) < 1e-6;
    };
    const gate = c.byId.GP.p, top = c.byId.W.p, P = c.start.pin, S = c.start.stbd;
    const lowest = Math.max(Math.min(along(ca.a), along(ca.b)), along(gate) + 6 * L - 1e-6);

    // With her at the gate, you're still well up the course from it, looking down on the mark.
    const atGate = bankStation(r, gate, false);
    expect(onStretch(atGate)).toBe(true);
    expect(along(atGate)).toBeGreaterThanOrEqual(Math.min(lowest, Math.max(along(ca.a), along(ca.b))) - 1e-6);
    // …and with her at mark 1 you've walked up the bank towards it, but not past it.
    const atTop = bankStation(r, top, false);
    expect(onStretch(atTop)).toBe(true);
    expect(along(atTop)).toBeLessThan(along(top));
    expect(along(atTop)).toBeGreaterThanOrEqual(along(atGate) - 1e-6);

    // Sighting: on the line's extension when the bank crosses it within the control area.
    const st = bankStation(r, { x: (P.x + S.x) / 2, y: (P.y + S.y) / 2 - 3 * L }, true);
    expect(onStretch(st)).toBe(true);
    const off = Math.abs((st.x - P.x) * (S.y - P.y) - (st.y - P.y) * (S.x - P.x)) / Math.hypot(S.x - P.x, S.y - P.y);
    const ends = [ca.a, ca.b].map(q => (q.x - P.x) * (S.y - P.y) - (q.y - P.y) * (S.x - P.x));
    if (ends[0] * ends[1] < 0) expect(off).toBeLessThan(0.01);       // the stretch crosses the line: stand on it
    else expect(off).toBeLessThanOrEqual(Math.min(...ends.map(Math.abs)) / Math.hypot(S.x - P.x, S.y - P.y) + 1e-6); // else as near as the stretch gets
  });

  it('on the practice pond and at LMRYC in its usual breeze, you look straight down the start line', () => {
    for (const w of [{}, { venue: 'lmryc' }] as Partial<RaceSettings>[]) {
      const r = new Race({ ...base, ...w });
      const c = r.course, P = c.start.pin, S = c.start.stbd, p = r.player!;
      const cam = newBankCam();
      followCam(cam, r, p, 0.05, 1, false, true);
      const off = Math.abs((cam.x - P.x) * (S.y - P.y) - (cam.y - P.y) * (S.x - P.x)) / Math.hypot(S.x - P.x, S.y - P.y);
      expect(off, JSON.stringify(w)).toBeLessThan(0.75 * c.L); // (a step back from the water at most)
      // Both ends of the line are in front of you, one behind the other.
      const brg = (q: { x: number; y: number }) => Math.atan2(q.x - cam.x, q.y - cam.y) * 180 / Math.PI;
      expect(Math.abs(((brg(P) - brg(S) + 540) % 360) - 180), JSON.stringify(w)).toBeLessThan(4);
    }
  });
});
