// You be the judge: every case sails, the referee gives the verdict, and the marking is fair.
import { describe, expect, it } from 'vitest';
import { judgeCases, mark, ruleChoices, runCase, todaysCases, type Verdict } from '@/components/race-simulator/judge';
import { ruleText } from '@/components/race-simulator/rulesText';

describe('You be the judge', () => {
  const clips = judgeCases().map(c => ({ c, clip: runCase(c) }));

  it('has a couple of dozen cases, and every one sails to a verdict', () => {
    expect(clips.length).toBeGreaterThanOrEqual(24);
    for (const { c, clip } of clips) {
      expect(clip, c.id).not.toBeNull();
      expect(clip!.seconds, c.id).toBeGreaterThanOrEqual(4);
      expect(clip!.seconds, c.id).toBeLessThanOrEqual(60);
      expect(clip!.boats.length, c.id).toBeGreaterThanOrEqual(1);
      // Nobody in a clip is "you".
      expect(clip!.boats, c.id).not.toContain('You');
      expect(clip!.verdict.text, c.id).not.toMatch(/\bYou (were|are|had|broke|touched)\b/);
    }
  });

  it('some clips have a foul and some have none, and a foul names a boat in the clip and a rule in the book', () => {
    const fouls = clips.filter(x => x.clip!.verdict.offender), clean = clips.filter(x => !x.clip!.verdict.offender);
    expect(fouls.length).toBeGreaterThanOrEqual(10);
    expect(clean.length).toBeGreaterThanOrEqual(8);
    for (const { c, clip } of fouls) {
      const v = clip!.verdict;
      expect(clip!.boats, c.id).toContain(v.offender);
      expect(ruleText(v.rule!), `${c.id}: rule ${v.rule}`).not.toBeNull();
      expect(v.text.length, c.id).toBeGreaterThan(40);
      expect(v.at, c.id).not.toBeNull();
    }
  });

  it('the two ways of sailing a situation never come to the same call', () => {
    const seen = new Map<string, string>();
    for (const { c, clip } of clips) {
      const call = `${c.lesson}|${clip!.verdict.offender}|${clip!.verdict.rule}`;
      expect(seen.get(call), `${c.id} repeats ${seen.get(call)}`).toBeUndefined();
      seen.set(call, c.id);
    }
  });

  it('the same clip gives the same verdict every time', () => {
    const c = judgeCases()[0];
    expect(runCase(c)!.verdict).toEqual(runCase(c)!.verdict);
  });

  it("offers four rules with the right one among them, the same four each time", () => {
    const v: Verdict = { offender: 'Purple', rule: '18.2(a)', ruleTitle: 'Mark-room', text: '', at: 3 };
    const ch = ruleChoices(v, 7);
    expect(ch).toHaveLength(4);
    expect(ch.filter(x => x.rule === '18.2(a)')).toHaveLength(1);
    expect(new Set(ch.map(x => x.rule.split('(')[0])).size).toBe(4);
    expect(ruleChoices(v, 7)).toEqual(ch);
    expect(ch.every(x => x.title.length > 3)).toBe(true);
    // With no foul there's still a list (it's asked only if you name a boat).
    expect(ruleChoices({ offender: null, rule: null, ruleTitle: null, text: '', at: null }, 7)).toHaveLength(4);
  });

  it('marks the boat and the rule: two points for both, one for the boat alone, none for the wrong boat', () => {
    const foul: Verdict = { offender: 'Purple', rule: '18.2(a)', ruleTitle: 'Mark-room', text: '', at: 3 };
    expect(mark(foul, 'Purple', '18.2(c)')).toEqual({ who: true, rule: true, points: 2 });
    expect(mark(foul, 'Purple', '10')).toEqual({ who: true, rule: false, points: 1 });
    expect(mark(foul, 'Orange', '18.2(a)')).toEqual({ who: false, rule: false, points: 0 });
    expect(mark(foul, null, null)).toEqual({ who: false, rule: false, points: 0 });
    const none: Verdict = { offender: null, rule: null, ruleTitle: null, text: '', at: null };
    expect(mark(none, null, null)).toEqual({ who: true, rule: true, points: 2 });
    expect(mark(none, 'Purple', '10')).toEqual({ who: false, rule: false, points: 0 });
  });

  it("today's cases are the same for everyone today, and different tomorrow", () => {
    const a = todaysCases('2026-11-11'), b = todaysCases('2026-11-11'), c = todaysCases('2026-11-12');
    expect(a).toHaveLength(5);
    expect(a.map(x => x.id)).toEqual(b.map(x => x.id));
    expect(a.map(x => x.id)).not.toEqual(c.map(x => x.id));
    expect(new Set(a.map(x => x.id)).size).toBe(5);
  });
});
