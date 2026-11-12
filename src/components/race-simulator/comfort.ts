// Comfort settings: how the Academy reads and races for you. Larger type (the Academy's screens, the
// race's panels and the labels on the water), a calmer race pace, Alfie's words on screen as he says
// them, and Alfie's help stepping down as you improve. Kept with your training, so they follow you to
// every device, and kept when you start again.
import type { SkipperLevel } from '@/sim/types';
import type { CoachMode } from './coach';

export type TextSize = 'standard' | 'large' | 'larger';
export type Pace = 'normal' | 'calm';
export interface Comfort {
  text: TextSize;
  pace: Pace;
  /** Alfie's spoken words (and other skippers' hails) shown on screen as they're said. */
  captions: boolean;
  /** 'steps': Alfie's coaching set from your level, stepping down as you improve; 'mine': as you set it. */
  help: 'steps' | 'mine';
  at: number;
}

export const DEFAULT_COMFORT: Comfort = { text: 'standard', pace: 'normal', captions: false, help: 'mine', at: 0 };

/** How much larger each text size is. */
export const TEXT_ZOOM: Record<TextSize, number> = { standard: 1, large: 1.15, larger: 1.3 };
/** How fast the race runs against the clock (the speed-up button still doubles and a half it). */
export const PACE_RATE: Record<Pace, number> = { normal: 1, calm: 0.7 };

/**
 * Alfie's coaching for your level, when it steps down as you improve: every call while you're
 * learning or at Club level, hints at Regional and National, and off at World level.
 */
export function helpFor(level: SkipperLevel, placed: boolean, newcomer: boolean): CoachMode {
  if (newcomer || !placed || level === 'club') return 'full';
  if (level === 'world') return 'off';
  return 'hints';
}

export const HELP_WORDS: Record<CoachMode, string> = {
  full: 'calls your trim, tacks and start as you sail',
  hints: 'gives hints at the moments that matter',
  off: 'stays quiet and lets you race',
};

/**
 * Whether a spoken line belongs in the captions: Alfie's coaching and the hails, not the start's
 * count (the countdown is on screen already).
 */
export function captionWorthy(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  if (/^(one|two|three|four|five|six|seven|eight|nine|ten|\d+)$/.test(t)) return false;
  if (/^(\w+ )?(seconds?|minutes?)$/.test(t)) return false;
  return true;
}
