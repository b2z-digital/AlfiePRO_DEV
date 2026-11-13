// The debrief says one thing about your start: the ledger's start row and Alfie's advice agree. On
// time but slow across the line is not a "good start"; on time and at speed is.
import { describe, expect, it } from 'vitest';
import { startWords, takeaways, type RaceSummary } from '@/components/race-simulator/stats';

const base = { late: 0, spdAtGun: 0.97, fromFavouredL: 1, favoured: 'pin end', ocs: false };
const tk = (s: Partial<RaceSummary>) => takeaways({ incidents: [], mode: 'start', upwind: { liftedPct: null }, downwind: { spdPct: null }, roundings: { gained: 0 }, ...base, ...s } as unknown as RaceSummary)[0];

describe('What the start cost, in words', () => {
  it('on time but slow: says so in the ledger and Alfie agrees (no "good start")', () => {
    const s = { ...base, late: 0, spdAtGun: 0.78 };
    expect(startWords(s)).toBe('On time (0.0 s after the gun), but at 78% speed, still getting going.');
    const t = tk(s);
    expect(t.tone).not.toBe('good');
    expect(t.text).toMatch(/^On time at the gun \(0\.0 s after it\), but at only 78% speed/);
    expect(t.link).toMatchObject({ kind: 'drill', id: 'speed' });
  });

  it('on time and at speed: a good start, and the ledger says what little it cost was getting up to speed', () => {
    expect(startWords(base)).toMatch(/^On time \(0\.0 s after the gun\) at 97% speed: what's here is the first seconds/);
    expect(tk(base)).toMatchObject({ tone: 'good', text: 'Good start: 0.0 s after the gun at 97% speed.' });
  });

  it('late, far from the favoured end, or over: each in its own words', () => {
    expect(startWords({ ...base, late: 5.2, spdAtGun: 0.6 })).toBe('You crossed 5.2 s after the gun, and at 60% speed, still getting going.');
    expect(startWords({ ...base, fromFavouredL: 9 })).toBe('On time (0.0 s after the gun), but 9 lengths from the favoured pin end.');
    expect(tk({ fromFavouredL: 9 })).toMatchObject({ tone: 'plain', link: { id: 'favoured-end' } });
    expect(startWords({ ...base, ocs: true })).toMatch(/^Over the line at the gun/);
    expect(tk({ late: 5 }).tone).toBe('warn');
  });
});
