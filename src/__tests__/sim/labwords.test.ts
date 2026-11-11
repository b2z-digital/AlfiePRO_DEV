// The handling drills are scored on what you lose (lengths, seconds), so less is better. A result
// has to say so in words nobody can read the wrong way round, and judge the figure it shows.
import { describe, expect, it } from 'vitest';
import { runScene, type PlanFn } from '@/sim/scene';
import { LAB } from '@/sim/training';

/** Sloppy tacks: every 7 s, swung well past close-hauled onto a reach, so each one costs a lot. */
const sloppy: PlanFn = (t, b) => {
  const side = Math.floor(t / 7) % 2 === 0 ? 1 : -1;
  return { hdg: (b.twd + side * 68 + 360) % 360 };
};

describe('Speed through the tacks: the result', () => {
  const m = LAB.find(x => x.id === 'tacks')!;
  it('a fail says how many lengths you lost, that it was too many, and the mark to get under', () => {
    const o = runScene(m.scene(1), m.goal, 1, sloppy).outcome;
    expect(o.pass).toBe(false);
    const lostL = Number(/^You lost (\d+\.\d) lengths a tack$/.exec(o.title)?.[1]);
    expect(lostL, o.title).toBeGreaterThan(1.7);
    expect(o.text).toContain(`That's ${(lostL - 1.7).toFixed(1)} too many`);
    expect(o.text).toContain('to pass, lose 1.7 lengths or fewer on each tack');
    expect(o.text).toContain('The fewer the better');
    expect(o.score).toBe(lostL);
  });
  it('a pass says the same figure, and what the next star takes', () => {
    const o = runScene(m.scene(1), m.goal, 1, m.solution).outcome;
    expect(o.pass).toBe(true);
    expect(o.title).toMatch(/^You lost \d+\.\d lengths a tack$/);
  });
  it('the goal says "no more than"', () => {
    expect(m.goal.text).toBe('Make six tacks, losing no more than 1.7 lengths on each');
    expect(LAB.find(x => x.id === 'gybes')!.goal.text).toBe('Make five gybes, losing no more than 0.8 lengths on each');
  });
});
