// A boat's finish (her colours and corner patches), made safe to draw. A look can come from this
// device, from the account, or from someone else in a live race, so every colour is checked before
// it gets near a canvas.
import type { BoatLook } from './types';

const HEX = /^#[0-9a-f]{6}$/i;
const hex = (v: unknown, fallback: string): string => (typeof v === 'string' && HEX.test(v) ? v.toUpperCase() : fallback);

/** The player's boat before anyone has designed one: the blue she has always been. */
export const DEFAULT_LOOK: BoatLook = { hull: '#2A93FF', jibLuff: '#2A93FF', patch: { style: 'fingers', one: '#2A93FF', two: null }, deckPatch: '#262C36', country: 'AUS' };

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
    patch: { style: p.style === 'solid' ? 'solid' : 'fingers', one, two },
    deckPatch: hex(o.deckPatch, base.deckPatch ?? '#262C36'),
    country: country.length === 3 ? country : base.country,
  };
}

/**
 * The number a radio yacht carries on her sails: the last two digits of her registered (or her
 * skipper's personal) number, with a 0 in front of a single digit. "123" and "AUS 2023" both sail
 * as 23; "7" as 07.
 */
export function sailNumber(raw: string): string {
  return raw.replace(/\D/g, '').slice(-2).padStart(2, '0');
}

/**
 * Two boats in one race with the same two digits: the later one carries a 1 in front of hers (the
 * space for it is left on every sail), then a 2, and so on.
 */
export function clearOf(sail: string, taken: ReadonlySet<string>): string {
  let s = sail;
  for (let pre = 1; taken.has(s) && pre <= 9; pre++) s = String(pre) + sail.slice(-2);
  for (let n = 2; taken.has(s); n++) s = String(n).padStart(2, '0');
  return s;
}
