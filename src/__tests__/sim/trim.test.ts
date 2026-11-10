// Trim the way radio sailors sail: right in upwind, a touch off in very light air, eased a touch when
// a gust lays her over, and eased progressively as she bears away. Alfie's trim line says the same.
import { describe, expect, it } from 'vitest';
import { bestSheet, lightEase, overpowerEase, trimEfficiency } from '@/sim/classes';
import { trimAdvice } from '@/components/race-simulator/coach';
import { CLASSES } from '@/sim/classes';
import type { Boat } from '@/sim/types';

const KN = 0.514444;
const boat = (o: Partial<Boat>): Boat => ({ cls: CLASSES.IOM, twa: 42, tws: 10 * KN, sheet: 1, heel: 18, ...o } as Boat);

describe('Trim', () => {
  it('is right in close-hauled, and eases off the wind', () => {
    expect(bestSheet(40)).toBe(1);
    expect(bestSheet(45, 10 * KN)).toBe(1);
    expect(trimEfficiency(1, 42, 10 * KN)).toBe(1);
    expect(bestSheet(90)).toBeCloseTo(0.5, 5);
    expect(bestSheet(70)).toBeLessThan(0.8);
    expect(bestSheet(170)).toBeLessThan(0.2);
  });
  it('is a touch off fully in only in very light air', () => {
    expect(lightEase(10 * KN)).toBe(0);
    expect(lightEase(5 * KN)).toBe(0);
    expect(lightEase(2 * KN)).toBeGreaterThan(0.04);
    expect(bestSheet(42, 2 * KN)).toBeLessThan(0.96);
  });
  it('eases a touch only when a gust lays her over', () => {
    expect(overpowerEase(30)).toBe(0); // a fresh breeze, sailing well
    expect(overpowerEase(-35)).toBe(0);
    expect(overpowerEase(48)).toBeGreaterThan(0.07);
    expect(overpowerEase(80)).toBeLessThanOrEqual(0.14);
  });
});

describe("Alfie's trim line", () => {
  it('says right in is right upwind, in a normal breeze and a fresh one', () => {
    expect(trimAdvice(boat({}))).toBe('Trim: good');
    expect(trimAdvice(boat({ tws: 15 * KN, heel: 31 }))).toBe('Trim: good');
  });
  it('says sheet right in when she is eased upwind', () => {
    expect(trimAdvice(boat({ sheet: 0.84 }))).toBe('Upwind: sheet right in');
  });
  it('says ease a touch when a gust lays her over, and in very light air', () => {
    expect(trimAdvice(boat({ tws: 16 * KN, heel: 50 }))).toBe('Overpowered: ease a touch through the gust');
    expect(trimAdvice(boat({ tws: 2 * KN, heel: 3 }))).toBe('Very light: ease a touch for power');
  });
  it('says ease on a reach when the sail is right in', () => {
    expect(trimAdvice(boat({ twa: 80 }))).toBe('Trim: ease the sail a touch');
  });
});
