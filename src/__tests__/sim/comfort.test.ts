// Comfort settings: Alfie's help by level, what goes in the captions, and keeping the settings.
import { beforeEach, describe, expect, it } from 'vitest';
import { captionWorthy, helpFor, DEFAULT_COMFORT } from '@/components/race-simulator/comfort';
import { loadTraining, mergeTraining, resetTraining, saveComfort } from '@/components/race-simulator/progress';

describe('Comfort', () => {
  beforeEach(() => { try { localStorage.clear(); } catch { /* none */ } });

  it("steps Alfie's help down as you improve", () => {
    expect(helpFor('club', true, false)).toBe('full');
    expect(helpFor('state', false, false)).toBe('full');
    expect(helpFor('national', true, true)).toBe('full');
    expect(helpFor('state', true, false)).toBe('hints');
    expect(helpFor('national', true, false)).toBe('hints');
    expect(helpFor('world', true, false)).toBe('off');
  });

  it("captions Alfie's coaching and the hails, not the start's count", () => {
    for (const t of ['Ten', 'nine', '30 seconds', 'One minute', 'four minutes', '5']) expect(captionWorthy(t), t).toBe(false);
    for (const t of ['Tack on the header', 'Starboard', 'Ease the sheet, bear away']) expect(captionWorthy(t), t).toBe(true);
  });

  it('keeps the settings, takes the newest from another device, and keeps them when you start again', () => {
    const saved = saveComfort({ ...DEFAULT_COMFORT, text: 'larger', captions: true });
    expect(loadTraining().comfort).toMatchObject({ text: 'larger', captions: true });
    const other = { ...saved, comfort: { ...saved.comfort!, text: 'large' as const, at: saved.comfort!.at + 10 } };
    expect(mergeTraining(saved, other).comfort?.text).toBe('large');
    expect(mergeTraining(other, saved).comfort?.text).toBe('large');
    const after = resetTraining(true, saved.comfort!.at + 100);
    expect(after.comfort).toMatchObject({ text: 'larger', captions: true });
    expect(after.comfort!.at).toBeGreaterThanOrEqual(saved.comfort!.at + 100);
  });
});
