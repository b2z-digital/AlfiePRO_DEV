// Drill instructions in plain words: every Scenario Lab speed and handling drill, and every start
// drill, says what to do step by step and what each stick does, and the sailing words it uses are
// explained.
import { describe, expect, it } from 'vitest';
import { LAB } from '@/sim/training';
import { DRILLS } from '@/sim/training/drills';
import { WORDS, wordsIn } from '@/sim/training/words';

const withSteps = [...LAB.filter(m => m.group === 'speed' || m.group === 'handling'), ...DRILLS];

describe('Drill instructions', () => {
  it('every speed, handling and start drill has steps, stick moves and a one-screen card', () => {
    expect(withSteps.length).toBeGreaterThanOrEqual(21);
    for (const d of withSteps) {
      expect(d.steps?.length, d.id).toBeGreaterThanOrEqual(3);
      expect(d.sticks?.sail, d.id).toBeTruthy();
      expect(d.sticks?.rudder, d.id).toBeTruthy();
      for (const s of d.steps!) expect(s.length, `${d.id}: ${s}`).toBeLessThan(260);
      // The one-screen card: a picture, the sticks, and no more than three short cues.
      expect(d.card, d.id).toBeTruthy();
      expect(d.card!.cues.length, d.id).toBeGreaterThanOrEqual(2);
      expect(d.card!.cues.length, d.id).toBeLessThanOrEqual(3);
      for (const c of d.card!.cues) expect(c.length, `${d.id}: ${c}`).toBeLessThanOrEqual(52);
    }
  });

  it('explains the jargon a drill uses, and not words it doesn\'t', () => {
    const chop = LAB.find(m => m.id === 'speed-up-chop')!;
    const got = wordsIn(chop.brief, chop.goal.text, ...chop.steps!, chop.sticks!.sail, chop.sticks!.rudder).map(w => w.word);
    expect(got).toEqual(expect.arrayContaining(['Close-hauled', 'Footing', 'Header', 'Speed made good', 'Chop', 'Tack']));
    expect(got).not.toContain('Gybe');
    expect(wordsIn('Report the support')).toEqual([]);
    expect(wordsIn('Bear away and gybe').map(w => w.word)).toEqual(['Bear away', 'Gybe']);
  });

  it('says which way to move the rudder stick, by tack, where it matters', () => {
    for (const id of ['tacks', 'speed-up-chop', 'bear-away']) {
      const d = LAB.find(m => m.id === id)!;
      expect(`${d.steps!.join(' ')} ${d.sticks!.rudder}`, id).toMatch(/(left|right) on (starboard|port)/);
    }
  });

  it('keeps every word explained in a sentence or two', () => {
    for (const w of WORDS) expect(w.means.length, w.word).toBeLessThan(240);
  });
});
