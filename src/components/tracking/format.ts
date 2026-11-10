// Little formatters for the tracking screens.
import type { Standing } from './core/analyse';

export const KN = 1.9438;
export const kn = (mps: number) => `${(mps * KN).toFixed(1)} kn`;
export const m = (x: number, dp = 1) => `${x.toFixed(dp)} m`;
/** Race time: 3:35, 1:02:07; negative before the gun (−0:20). */
export function rt(s: number): string {
  const neg = s < 0;
  const a = Math.abs(s);
  const h = Math.floor(a / 3600), mm = Math.floor((a % 3600) / 60), ss = Math.floor(a % 60);
  const body = h ? `${h}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${mm}:${String(ss).padStart(2, '0')}`;
  return (neg ? '−' : '') + body;
}
/** 6:44.7 */
export function rt1(s: number): string {
  const mm = Math.floor(s / 60), ss = s - mm * 60;
  return `${mm}:${ss.toFixed(1).padStart(4, '0')}`;
}
export const compass = (deg: number) => `${String(Math.round(((deg % 360) + 360) % 360)).padStart(3, '0')}°`;
export function gapText(s: Standing): { s: string; m: string } {
  if (s.place === 1) return { s: s.finished ? 'Won' : 'Leader', m: '' };
  if (s.finished) return { s: `+${s.gapS.toFixed(1)} s`, m: 'finished' };
  if (!s.started) return { s: 'Not started', m: '' };
  return { s: `+${s.gapS.toFixed(1)} s`, m: `${s.gapM.toFixed(1)} m` };
}
