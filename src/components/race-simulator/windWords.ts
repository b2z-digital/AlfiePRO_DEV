// The wind in words: its compass point, and what a shift means for the tack you're on.

const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
/** A compass bearing as sailors say it: 160 is "SSE". */
export const compassPoint = (deg: number): string => POINTS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];

/**
 * What a shift means, in words. Looking upwind, a wind that has gone left lifts port tack and
 * heads starboard; gone right, the other way about. Under 3° either way it's on its average.
 */
export function shiftWords(off: number, tack: 'stbd' | 'port' | null): { where: string; means: string; tone: 'good' | 'warn' | 'plain' } {
  const n = Math.round(Math.abs(off));
  if (n < 3) return { where: 'On its average', means: 'Neither tack is favoured', tone: 'plain' };
  const left = off < 0;
  const lifted = left ? 'port' : 'stbd';
  const where = `${n}° ${left ? 'left' : 'right'} of average`;
  if (!tack) return { where, means: `${lifted === 'port' ? 'Port' : 'Starboard'} tack is lifted`, tone: 'plain' };
  return tack === lifted
    ? { where, means: `You're lifted ${n}°: this is the tack to be on`, tone: 'good' }
    : { where, means: `You're headed ${n}°: the other tack is better`, tone: 'warn' };
}
