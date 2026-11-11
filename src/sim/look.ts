// A boat's finish (her colours and corner patches), made safe to draw. A look can come from this
// device, from the account, or from someone else in a live race, so every colour is checked before
// it gets near a canvas.
import type { BoatLook } from './types';

const HEX = /^#[0-9a-f]{6}$/i;
const hex = (v: unknown, fallback: string): string => (typeof v === 'string' && HEX.test(v) ? v.toUpperCase() : fallback);

/** The player's boat before anyone has designed one: the blue she has always been. */
export const DEFAULT_LOOK: BoatLook = { hull: '#2A93FF', jibLuff: '#2A93FF', leech: '#2A93FF', patch: { style: 'fingers', one: '#2A93FF', two: null }, deckPatch: '#262C36', country: 'AUS' };

/** A look with every part valid (a missing or bad part takes the default's), or undefined for nothing usable. */
export function cleanLook(x: unknown, base: BoatLook = DEFAULT_LOOK): BoatLook | undefined {
  if (!x || typeof x !== 'object') return undefined;
  const o = x as Record<string, unknown>, p = (o.patch && typeof o.patch === 'object' ? o.patch : {}) as Record<string, unknown>;
  const country = typeof o.country === 'string' ? o.country.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() : '';
  const one = hex(p.one, base.patch.one);
  // (A second colour that isn't one, or is the first again, is no second colour.)
  const two = typeof p.two === 'string' && HEX.test(p.two) && p.two.toUpperCase() !== one ? p.two.toUpperCase() : null;
  return {
    hull: hex(o.hull, base.hull),
    jibLuff: hex(o.jibLuff, base.jibLuff),
    leech: o.leech === null ? null : hex(o.leech, base.leech ?? base.jibLuff),
    patch: { style: p.style === 'solid' ? 'solid' : 'fingers', one, two },
    deckPatch: hex(o.deckPatch, base.deckPatch ?? '#262C36'),
    country: country.length === 3 ? country : base.country,
  };
}
