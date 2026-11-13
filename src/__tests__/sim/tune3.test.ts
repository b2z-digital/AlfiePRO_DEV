// The third tuning of the computer's skippers: the better the fleet, the harder the start is fought.
// A national or world fleet reads a few degrees of line bias and goes for the end that pays, and
// crosses at speed rather than still getting going. Races set up before it sail exactly as they did.
import { describe, expect, it } from 'vitest';
import { LEVELS2, LEVELS3, levelsFor, ownLevel } from '@/sim/ai';
import { Race } from '@/sim/engine';
import { polarSpeed } from '@/sim/classes';
import type { RaceSettings, SkipperLevel } from '@/sim/types';

const LV: SkipperLevel[] = ['club', 'state', 'national', 'world'];

describe('The third tuning', () => {
  it('leaves earlier tunings exactly as they were, and club fleets starting as they did', () => {
    for (const l of LV) expect(LEVELS2[l]).toMatchObject({ runUp: 0, endDeg: 10, endStbd: 0.45, rowGap: 1.1, rowGrow: 0.05, rowPush: 1.6, lag: 0, touch: 0.35, even: 1, follow: 0 });
    expect(LEVELS3.club).toEqual(LEVELS2.club);
    expect(levelsFor(3)).toBe(LEVELS3);
    expect(levelsFor(2)).toBe(LEVELS2);
  });

  it('each level up fights harder for the line', () => {
    for (let i = 0; i < 3; i++) {
      const lo = LEVELS3[LV[i]], hi = LEVELS3[LV[i + 1]];
      expect(hi.runUp).toBeGreaterThan(lo.runUp);          // waits further back, to cross at speed
      expect(hi.endDeg).toBeLessThan(lo.endDeg);            // reads a smaller bias
      expect(hi.rowGap).toBeLessThanOrEqual(lo.rowGap);     // packs in closer from the end that pays
      expect(hi.touch).toBeLessThan(lo.touch);              // trims a smaller timing error away
      expect(hi.follow).toBeGreaterThan(lo.follow);         // goes with the boat to windward
      expect(hi.startSigma).toBeLessThanOrEqual(lo.startSigma);
      expect(hi.roundOut).toBeLessThan(lo.roundOut);        // and rounds tighter out of the marks
    }
  });

  it('a skipper strong at starts fights like the level above (and only from this tuning)', () => {
    const strong = { start: 1, speed: 0, tactics: 0, marks: 0, rules: 0 };
    expect(ownLevel('state', strong, 3)).toMatchObject({ runUp: LEVELS3.national.runUp, endDeg: LEVELS3.national.endDeg, follow: LEVELS3.national.follow });
    expect(ownLevel('state', strong, 2)).toMatchObject({ runUp: 0, endDeg: 10, follow: 0 });
  });

  it('a national fleet goes for a pin favoured by 3°, and crosses faster, where the second tuning did neither', () => {
    const start = (tune: number) => {
      let fromPin = 0, pinHalf = 0, spd = 0, n = 0;
      for (const seed of [13, 26, 39, 52, 65, 78]) {
        const r = new Race({ classId: 'IOM', fleetSize: 12, level: 'national', windStrength: 'medium', windCharacter: 'oscillating', laps: 1, length: 'short', sequenceSeconds: 60, coach: 'off', autoTrim: true, seed, noPlayer: true, tune, lineBias: 3 } as RaceSettings);
        const P = r.course.start.pin, S = r.course.start.stbd, len = Math.hypot(S.x - P.x, S.y - P.y);
        const seen = new Set<string>(); let gun = false;
        while (r.t < r.gunT + 20) {
          r.step();
          if (!gun && r.t >= r.gunT) { gun = true; for (const b of r.boats) spd += b.spd / polarSpeed(b.cls, b.tws, 45); }
          for (const e of r.events) if (e.type === 'started' && !seen.has(e.boat)) {
            seen.add(e.boat);
            const b = r.boatById(e.boat), u = ((b.x - P.x) * (S.x - P.x) + (b.y - P.y) * (S.y - P.y)) / len / len;
            fromPin += u * len / r.course.L; if (u < 0.5) pinHalf++; n++;
          }
        }
      }
      return { fromPin: fromPin / n, pinHalf: pinHalf / n, spd: spd / (6 * 12) };
    };
    const was = start(2), now = start(3);
    expect(now.fromPin).toBeLessThan(was.fromPin - 1.5);
    expect(now.pinHalf).toBeGreaterThan(0.6);
    expect(was.pinHalf).toBeLessThan(0.6);
    expect(now.spd).toBeGreaterThan(was.spd + 0.05);
  }, 240000);
});
