// "Watch Alfie's way": the words say what the sticks are doing, when they're doing it.
import { describe, expect, it } from 'vitest';
import { buildScene } from '@/sim/scene';
import { LAB } from '@/sim/training';
import type { Race } from '@/sim/engine';
import type { Boat } from '@/sim/types';
import { DemoTalk, rudderWords, sailWords, type DemoCue } from '@/components/race-simulator/demoTalk';

function nextMark(race: Race, p: Boat) {
  const c = race.course, leg = c.legs[p.started ? p.legIndex : 0];
  if (!leg || p.finished) return null;
  if (leg.kind === 'mark') { const m = c.byId[leg.rounding.markId]; return { x: m.p.x, y: m.p.y, upwind: leg.upwind, isMark: true }; }
  if (leg.kind === 'gate') { const [a, b] = leg.options.map(o => c.byId[o.markId]); const m = Math.hypot(a.p.x - p.x, a.p.y - p.y) <= Math.hypot(b.p.x - p.x, b.p.y - p.y) ? a : b; return { x: m.p.x, y: m.p.y, upwind: false, isMark: true }; }
  return { x: (c.finish.pin.x + c.finish.stbd.x) / 2, y: (c.finish.pin.y + c.finish.stbd.y) / 2, upwind: true, isMark: false };
}

/** Watch a lab scenario sailed Alfie's way for `secs`, listening twice a step-pair (10 times a second). */
function watch(id: string, secs: number) {
  const m = LAB.find(x => x.id === id)!;
  const seed = m.demoSeeds?.[0] ?? 1;
  const { race } = buildScene(m.scene(seed), seed, m.solution);
  const p = race.player!, i = race.boats.indexOf(p);
  const talk = new DemoTalk(m.tip);
  const said: { t: number; cue: DemoCue; rudder: number; sheet: number; twa: number }[] = [];
  let last: DemoCue | null = null;
  const tacks: number[] = [], gybes: number[] = [];
  let ht = p.lastHtwT, gt = p.lastGybeT;
  for (let k = 0; k < secs * 20 && !race.ended && !p.finished; k++) {
    race.step();
    if (p.lastHtwT !== ht) { ht = p.lastHtwT; tacks.push(race.t); }
    if (p.lastGybeT !== gt) { gt = p.lastGybeT; gybes.push(race.t); }
    if (k % 2) continue;
    const cue = talk.update(race, p, race.skippers[i]?.intent, nextMark(race, p));
    if (cue !== last) { said.push({ t: race.t, cue, rudder: p.rudder, sheet: p.sheet, twa: p.twa }); last = cue; }
  }
  return { said, tacks, gybes, tip: m.tip };
}
const keys = (w: ReturnType<typeof watch>) => w.said.map(s => s.cue.key);

describe("Watching Alfie's way", () => {
  it('reads the sticks in plain words', () => {
    expect(sailWords(1)).toBe('Right in');
    expect(sailWords(0.62)).toBe('62% in');
    expect(rudderWords(0.02)).toBe('Centred');
    expect(rudderWords(-0.4)).toBe('40% left');
    expect(rudderWords(1)).toBe('100% right');
  });

  it('opens with the plan, then talks through every tack: rudder over, then back to the middle', () => {
    const w = watch('tacks', 60);
    expect(w.said[0].cue.key).toBe('plan');
    expect(w.said[0].cue.text).toBe(w.tip);
    expect(w.tacks.length).toBeGreaterThanOrEqual(5);
    for (const t of w.tacks) {
      // Called as she goes into it (within a second and a half either side of head to wind)…
      const into = w.said.find(s => s.cue.key === 'tack-in' && Math.abs(s.t - t) < 1.6);
      expect(into, `the tack at ${t.toFixed(1)} s`).toBeTruthy();
      expect(into!.cue.stick === 'rudder' || into!.cue.stick === 'both').toBe(true);
      expect(into!.cue.text).toMatch(/rudder stick (right over|well over|about \d0% over) to the (left|right)/);
      // …and as she comes out of it.
      const out = w.said.find(s => s.cue.key === 'tack-out' && s.t > t - 0.2 && s.t < t + 4);
      expect(out, `out of the tack at ${t.toFixed(1)} s`).toBeTruthy();
    }
  });

  it('says which way the rudder really went', () => {
    const w = watch('tacks', 40);
    for (const s of w.said.filter(x => x.cue.key === 'tack-in')) {
      if (Math.abs(s.rudder) < 0.3) continue;
      expect(s.cue.text).toContain(`to the ${s.rudder > 0 ? 'right' : 'left'}`);
    }
  });

  it('talks through the gybes on the run', () => {
    const w = watch('gybes', 70);
    expect(w.gybes.length).toBeGreaterThanOrEqual(4);
    // (The drill's five gybes, down the run.)
    for (const t of w.gybes.slice(0, 5)) expect(w.said.some(s => (s.cue.key === 'gybe-in' || s.cue.key === 'gybe-out') && s.t > t - 2 && s.t < t + 3.5), `the gybe at ${t.toFixed(1)} s`).toBe(true);
    expect(keys(w)).toContain('down-sticks');
  });

  it('at the gate: heading up with the sail coming in; at mark 1: bearing away with it going out', () => {
    const gate = watch('gate-exit', 40);
    const up = gate.said.find(s => s.cue.key === 'head-up');
    expect(up, keys(gate).join(' ')).toBeTruthy();
    expect(gate.said.some(s => s.cue.key === 'head-up' && s.cue.stick === 'both' && /sail stick coming in/.test(s.cue.text)), gate.said.filter(s => s.cue.key === 'head-up').map(s => s.cue.text).join(' | ')).toBe(true);
    const top = watch('bear-away', 40);
    expect(top.said.some(s => s.cue.key === 'bear-away' && s.cue.stick === 'both' && /sail stick let out/.test(s.cue.text)), keys(top).join(' ')).toBe(true);
  });

  it('sailing steadily, it says where the sticks are and moves on to something new every few seconds', () => {
    for (const id of ['speed-up-chop', 'speed-down-chop', 'speed-light']) {
      const w = watch(id, 45);
      const k = keys(w);
      expect(k.some(x => x === 'up-sticks' || x === 'down-sticks'), `${id}: ${k.join(' ')}`).toBe(true);
      expect(new Set(k).size, `${id}: ${k.join(' ')}`).toBeGreaterThanOrEqual(4);
    }
    // What it says about the sail is where the sail is.
    for (const id of ['speed-light', 'speed-up-blow']) {
      for (const s of watch(id, 45).said.filter(x => x.cue.key === 'up-sticks')) {
        if (s.sheet >= 0.97) expect(s.cue.text).toContain('sail stick right in');
        else expect(s.cue.text).toContain(`almost right in (${Math.round(s.sheet * 100)}% in)`);
      }
    }
  });

  it('never changes its mind faster than you can read, and never says nonsense', () => {
    for (const m of LAB.filter(x => x.solution)) {
      const w = watch(m.id, 50);
      // (A steady line gives way at once to something she's doing; everything else gets its second.)
      for (let i = 1; i < w.said.length; i++) if (!/^(up|down|reach|plan|pre)-/.test(w.said[i - 1].cue.key)) expect(w.said[i].t - w.said[i - 1].t, `${m.id}: ${w.said[i - 1].cue.key} then ${w.said[i].cue.key}`).toBeGreaterThanOrEqual(0.95);
      for (const s of w.said) {
        expect(s.cue.text, m.id).not.toMatch(/undefined|NaN|null|Infinity| {2}/);
        expect(s.cue.text.length).toBeGreaterThan(20);
      }
    }
  });
});
