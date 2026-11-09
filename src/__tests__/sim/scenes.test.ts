// Every drill, rules lesson and lab moment is a real scene on the engine and referee. These tests
// prove the content works: the right way passes, the classic mistake fails (with the expected rule),
// and doing nothing at all doesn't pass.
import { describe, expect, it } from 'vitest';
import { buildScene, runScene } from '@/sim/scene';
import { DRILLS, LAB, MODULES, lessonSpecs } from '@/sim/training';
import type { SceneSpec } from '@/sim/training';

/** Drills whose demo is an AI skipper rather than a script: it usually wins, so we only ask that it runs. */
const AI_DEMOS = new Set(['favoured-end', 'crowded']);

function expectRule(spec: SceneSpec, rule: string | undefined) {
  if (!spec.mistakeRule) return;
  const allowed = spec.mistakeRule.split('|');
  expect(allowed, `${spec.id}: mistake broke ${rule}, expected ${spec.mistakeRule}`).toContain(rule);
}

describe('Rules Academy', () => {
  const specs = lessonSpecs();

  it('has six modules and about twenty situations, every question with one right answer', () => {
    expect(MODULES).toHaveLength(6);
    const all = MODULES.flatMap(m => m.situations);
    expect(all.length).toBeGreaterThanOrEqual(20);
    for (const s of all) expect(s.answers.filter(a => a.correct), s.id).toHaveLength(1);
  });

  for (const spec of specs) {
    it(`${spec.id}: the right way passes`, () => {
      for (const seed of spec.testSeeds ?? [1, 2, 3]) {
        const r = runScene(spec.scene(seed), spec.goal, seed, spec.solution);
        expect(r.outcome.pass, `${spec.id} seed ${seed}: ${r.outcome.title} ${r.outcome.text}`).toBe(true);
      }
    });
    if (spec.mistake) {
      it(`${spec.id}: the mistake fails${spec.mistakeRule ? ` under Rule ${spec.mistakeRule}` : ''}`, () => {
        const r = runScene(spec.scene(1), spec.goal, 1, spec.mistake);
        expect(r.outcome.pass, `${spec.id}: ${r.outcome.title}`).toBe(false);
        expectRule(spec, r.outcome.incident?.rule);
      });
    }
  }

  it('every diagram scene builds and runs', () => {
    for (const m of MODULES) for (const s of m.situations) {
      const { race } = buildScene(s.scene(1), 1, s.diagram.plan);
      for (let k = 0; k < s.diagram.seconds * 20; k++) race.step();
      expect(race.boats.length, s.id).toBeGreaterThan(0);
    }
  });
});

describe('Start Trainer', () => {
  it('has twelve drills', () => expect(DRILLS).toHaveLength(12));

  for (const d of DRILLS) {
    it(`${d.id}: doing nothing doesn't pass`, () => {
      const r = runScene(d.scene(1), d.goal, 1);
      expect(r.outcome.pass, `${d.id}: ${r.outcome.title}`).toBe(false);
    });
    it(`${d.id}: the demo ${AI_DEMOS.has(d.id) ? 'runs' : 'passes'}`, () => {
      for (const seed of [1, 2, 3]) {
        const r = runScene(d.scene(seed), d.goal, seed, d.solution);
        if (!AI_DEMOS.has(d.id)) expect(r.outcome.pass, `${d.id} seed ${seed}: ${r.outcome.title}`).toBe(true);
        else expect(r.outcome.title.length).toBeGreaterThan(0);
        if (r.outcome.pass) expect(r.outcome.stars ?? 0).toBeGreaterThan(0);
      }
    });
    if (d.mistake) {
      it(`${d.id}: the mistake fails`, () => {
        const r = runScene(d.scene(1), d.goal, 1, d.mistake);
        expect(r.outcome.pass, `${d.id}: ${r.outcome.title}`).toBe(false);
      });
    }
  }
});

describe('Scenario Lab', () => {
  it('has six moments', () => expect(LAB).toHaveLength(6));
  for (const m of LAB) {
    it(`${m.id}: runs to a result and the same seed gives the same result`, () => {
      const a = runScene(m.scene(4), m.goal, 4, m.solution);
      const b = runScene(m.scene(4), m.goal, 4, m.solution);
      expect(a.outcome.title).toBe(b.outcome.title);
      expect(a.t).toBeCloseTo(b.t, 5);
    });
    if (m.mistake) {
      it(`${m.id}: the mistake fails`, () => {
        const r = runScene(m.scene(1), m.goal, 1, m.mistake);
        expect(r.outcome.pass).toBe(false);
        expectRule(m, r.outcome.incident?.rule);
      });
    }
  }
});
