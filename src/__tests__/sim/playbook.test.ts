// The Playbook: every play is complete and points at practice that exists.
import { describe, expect, it } from 'vitest';
import { DRILLS, LAB, MODULES } from '@/sim/training';
import { CHAPTERS, PLAYS, READING, playsFor } from '@/components/race-simulator/playbook';
import { CAUSES } from '@/components/race-simulator/ledger';

const exists = (l: { kind: string; id: string }) => {
  if (l.kind === 'drill') return DRILLS.some(d => d.id === l.id);
  if (l.kind === 'lab') return LAB.some(m => m.id === l.id);
  const [mod, sit] = l.id.split('/');
  return MODULES.some(m => m.id === mod && m.situations.some(s => s.id === sit && !!s.play));
};

describe('The Playbook', () => {
  it('has plays in every chapter, each one complete', () => {
    expect(PLAYS.length).toBeGreaterThanOrEqual(24);
    expect(new Set(PLAYS.map(p => p.id)).size).toBe(PLAYS.length);
    for (const c of CHAPTERS) expect(PLAYS.filter(p => p.chapter === c.id).length, c.title).toBeGreaterThanOrEqual(2);
    for (const p of PLAYS) {
      expect(p.how.length, p.id).toBeGreaterThanOrEqual(2);
      for (const t of [p.title, p.when, p.why, p.mistake, p.remember, ...p.how]) expect(t.trim().length, p.id).toBeGreaterThan(8);
      expect(p.remember.length, `${p.id}: a line to carry onto the water is short`).toBeLessThan(60);
    }
  });
  it('every play can be practised, and every link is a drill, lesson or scenario you can sail', () => {
    for (const p of PLAYS) {
      expect(p.practise.length, p.id).toBeGreaterThanOrEqual(1);
      for (const l of p.practise) expect(exists(l), `${p.id} → ${l.kind} ${l.id}`).toBe(true);
    }
  });
  it('most of the drills and scenarios are reached from a play', () => {
    const used = new Set(PLAYS.flatMap(p => p.practise.map(l => `${l.kind}:${l.id}`)));
    const all = [...DRILLS.map(d => `drill:${d.id}`), ...LAB.map(m => `lab:${m.id}`)];
    const missing = all.filter(x => !used.has(x));
    expect(missing, missing.join(', ')).toEqual([]);
  });
  it('every slice of the loss ledger has a play that shrinks it', () => {
    for (const c of CAUSES) expect(playsFor(c).length, c).toBeGreaterThanOrEqual(1);
  });
  it('says where to read more', () => {
    expect(READING.length).toBeGreaterThanOrEqual(4);
  });
});
