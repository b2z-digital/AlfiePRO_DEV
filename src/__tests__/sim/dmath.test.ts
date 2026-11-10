// The engine's deterministic maths: as accurate as the browser's own, and built only from
// arithmetic every browser rounds the same way, so a live race comes out the same on every device.
import { describe, expect, it } from 'vitest';
import { datan, datan2, dcos, dexp, dhypot, dlog, dpow, dsin, dtan } from '@/sim/dmath';
import { Rng } from '@/sim/math';

const close = (a: number, b: number, tol = 4e-16) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

describe('Deterministic maths', () => {
  const r = new Rng(7);
  const xs = [0, 1e-9, -1e-9, 0.5, -0.5, 1, Math.PI / 4, Math.PI / 2, Math.PI, -Math.PI, 2 * Math.PI, 3.7, -12.9, 100.25, 6283.1];
  for (let i = 0; i < 2000; i++) xs.push(r.range(-50, 50), r.range(-7000, 7000), r.range(-1, 1));

  it('sin, cos and tan match the built-ins to the last place or two', () => {
    for (const x of xs) {
      expect(close(dsin(x), Math.sin(x), 2e-15), `sin ${x}`).toBe(true);
      expect(close(dcos(x), Math.cos(x), 2e-15), `cos ${x}`).toBe(true);
      if (Math.abs(Math.cos(x)) > 1e-3) expect(close(dtan(x), Math.tan(x), 1e-12), `tan ${x}`).toBe(true);
    }
  });

  it('atan and atan2 match, in every quadrant', () => {
    for (const x of xs) expect(close(datan(x), Math.atan(x)), `atan ${x}`).toBe(true);
    for (let i = 0; i < 3000; i++) {
      const y = r.range(-100, 100), x = r.range(-100, 100);
      expect(close(datan2(y, x), Math.atan2(y, x), 1e-15), `atan2 ${y} ${x}`).toBe(true);
    }
    expect(datan2(1, 0)).toBeCloseTo(Math.PI / 2, 15);
    expect(datan2(-1, 0)).toBeCloseTo(-Math.PI / 2, 15);
    expect(datan2(0, -1)).toBeCloseTo(Math.PI, 15);
    expect(datan2(0, 1)).toBe(0);
  });

  it('exp, log and pow match', () => {
    for (let i = 0; i < 3000; i++) {
      const x = r.range(-40, 40);
      expect(close(dexp(x), Math.exp(x), 1e-15), `exp ${x}`).toBe(true);
      const p = r.range(1e-6, 1e4);
      expect(Math.abs(dlog(p) - Math.log(p)) <= 1e-15 * Math.max(1, Math.abs(Math.log(p))), `log ${p}`).toBe(true);
      const b = r.range(-3, 3);
      expect(close(dpow(p, b), Math.pow(p, b), 1e-13), `pow ${p} ${b}`).toBe(true);
    }
    expect(dexp(0)).toBe(1);
    expect(dlog(1)).toBe(0);
    expect(dpow(1.7, 4)).toBe(1.7 * 1.7 * 1.7 * 1.7);
    expect(dpow(0, 2)).toBe(0);
  });

  it('hypot is the square root of the sum of squares', () => {
    expect(dhypot(3, 4)).toBe(5);
    for (let i = 0; i < 100; i++) { const a = r.range(-10, 10), b = r.range(-10, 10); expect(close(dhypot(a, b), Math.hypot(a, b), 1e-15)).toBe(true); }
  });
});
