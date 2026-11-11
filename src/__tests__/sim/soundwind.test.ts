// The wind card's words, the crack of two hulls meeting, and the StartBox recording's readiness.
import { describe, expect, it } from 'vitest';
import { CLASSES } from '@/sim/classes';
import { compassPoint, shiftWords } from '@/components/race-simulator/windWords';
import { impactNear, impactStrength } from '@/components/race-simulator/impact';
import { SequencePlayer } from '@/components/race-simulator/startbox';

describe('The wind, in words', () => {
  it('names the compass point', () => {
    expect(compassPoint(0)).toBe('N');
    expect(compassPoint(160)).toBe('SSE');
    expect(compassPoint(271)).toBe('W');
    expect(compassPoint(349)).toBe('N');
    expect(compassPoint(-20)).toBe('NNW');
  });
  it('a left shift lifts port tack and heads starboard; a right shift the other way', () => {
    expect(shiftWords(-6, null)).toMatchObject({ where: '6° left of average', means: 'Port tack is lifted', tone: 'plain' });
    expect(shiftWords(8, null).means).toBe('Starboard tack is lifted');
    expect(shiftWords(-6, 'port')).toMatchObject({ tone: 'good' });
    expect(shiftWords(-6, 'port').means).toContain("You're lifted 6°");
    expect(shiftWords(-6, 'stbd')).toMatchObject({ tone: 'warn' });
    expect(shiftWords(-6, 'stbd').means).toContain("You're headed 6°");
    expect(shiftWords(9, 'stbd').tone).toBe('good');
    expect(shiftWords(9, 'port').tone).toBe('warn');
  });
  it("calls it average inside 3°, whatever tack you're on", () => {
    for (const t of [null, 'port', 'stbd'] as const) expect(shiftWords(2.4, t)).toMatchObject({ where: 'On its average', tone: 'plain' });
  });
});

describe('Two hulls meeting', () => {
  const cls = CLASSES.IOM;
  const boat = (hdg: number, share: number) => ({ hdg, spd: share * cls.hullSpeed, cls });
  it('is a soft tick alongside at the same speed, and a loud crack head-on', () => {
    const kiss = impactStrength(boat(45, 0.8), boat(47, 0.78));
    const tbone = impactStrength(boat(315, 0.9), boat(45, 0.9));
    const headOn = impactStrength(boat(0, 1), boat(180, 1));
    expect(kiss).toBeLessThan(0.12);
    expect(tbone).toBeGreaterThan(0.6);
    expect(headOn).toBe(1);
    expect(kiss).toBeLessThan(tbone);
    expect(tbone).toBeLessThanOrEqual(headOn);
  });
  it('is quieter further off, but never silent', () => {
    expect(impactNear(0)).toBe(1);
    expect(impactNear(20)).toBeLessThan(impactNear(5));
    expect(impactNear(200)).toBe(0.2);
  });
});

describe("The club's start recording", () => {
  it("with no recording to wait for, there's nothing to wait for", () => {
    const p = new SequencePlayer({ id: 's', name: 'Sounds', seconds: 60, club: true, sounds: [{ at: 60, url: 'a.mp3', repeat: 1, gapMs: 600 }] });
    p.prepare(60);
    expect(p.ready).toBe(true);
    expect(p.working).toBe(true);
    p.stop();
  });
});
