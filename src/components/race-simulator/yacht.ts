// Your yachts: the boats you've designed (Design your yacht), each with her class, her name, her
// finish and her number. Kept on this device and, signed in, in your account (they ride with your
// training progress). One of them in each class is the one you race. Looks only.
import { CLASSES, type ClassId } from '@/sim/classes';
import { DEFAULT_LOOK, cleanLook } from '@/sim/look';
import type { BoatLook } from '@/sim/types';
import { sailDigits, type SimIdentity } from './identity';

const KEY = 'alfie-race-sim-yachts-v2';
/** How many yachts one skipper can keep. */
export const MAX_YACHTS = 12;

/** One boat: her class and name, her finish, and a sail number of your own choosing (unset: the one on your boat of that class in Alfie). */
export interface Yacht extends BoatLook { id: string; cls: ClassId; name: string; number?: string }
/** Every boat you've saved, the one you race in each class (an id), and when you last changed anything. */
export interface Yard { yachts: Yacht[]; racing: Partial<Record<ClassId, string>>; at: number }

export interface Paint { name: string; hex: string }
/** Sail tapes and patches: the colours sailmakers offer. */
export const SAIL_COLOURS: Paint[] = [
  { name: 'White', hex: '#FFFFFF' }, { name: 'Black', hex: '#14181F' }, { name: 'Gold yellow', hex: '#FFC51A' },
  { name: 'Red', hex: '#E5262E' }, { name: 'Royal blue', hex: '#2A63F0' }, { name: 'Navy blue', hex: '#182A5C' },
  { name: 'Green', hex: '#1FA34E' }, { name: 'Fluoro orange', hex: '#FF6A1A' }, { name: 'Fluoro pink', hex: '#FF3EA5' },
  { name: 'Fluoro yellow', hex: '#D8F01C' }, { name: 'Alfie blue', hex: '#2A93FF' }, { name: 'Purple', hex: '#8A4DFF' },
];
/** Hulls: gelcoats and paint jobs. */
export const HULL_COLOURS: Paint[] = [
  { name: 'Alfie blue', hex: '#2A93FF' }, { name: 'Gloss white', hex: '#F4F7FB' }, { name: 'Carbon black', hex: '#1B2028' },
  { name: 'Navy', hex: '#182A5C' }, { name: 'Royal blue', hex: '#2A63F0' }, { name: 'Racing red', hex: '#D9262E' },
  { name: 'Fluoro orange', hex: '#FF6A1A' }, { name: 'Gold yellow', hex: '#FFC51A' }, { name: 'Lime', hex: '#B4E61E' },
  { name: 'Racing green', hex: '#157A43' }, { name: 'Teal', hex: '#12B5A6' }, { name: 'Purple', hex: '#7A3FE0' },
  { name: 'Hot pink', hex: '#FF3EA5' }, { name: 'Silver', hex: '#AEB7C4' }, { name: 'Sky', hex: '#7CC4FF' }, { name: 'Maroon', hex: '#7A1F33' },
];
/** Deck patches: the film over the hatches. Charcoal is what most boats carry. */
export const DECK_COLOURS: Paint[] = [{ name: 'Charcoal', hex: '#262C36' }, ...SAIL_COLOURS.filter(p => p.hex !== '#14181F'), { name: 'Silver', hex: '#AEB7C4' }];
export const COUNTRIES = ['AUS', 'NZL', 'GBR', 'USA', 'CAN', 'FRA', 'ITA', 'ESP', 'GER', 'NED', 'CRO', 'BRA', 'RSA', 'JPN'];

/** The name of a colour, for anyone who can't see it. */
/** Colours that can only be won: each season of the AlfiePRO Circuit's Championship has its own (see career.ts). */
export const WON_COLOURS: Paint[] = [
  { name: 'Champion gold', hex: '#C9A227' },
  { name: 'Aurel teal', hex: '#0F8B8D' },
  { name: 'Tamarind red', hex: '#B3261E' },
  { name: 'Meridian midnight', hex: '#16204A' },
];

export function paintName(hex: string | null): string {
  if (!hex) return 'None';
  const h = hex.toUpperCase();
  return [...SAIL_COLOURS, ...HULL_COLOURS, ...DECK_COLOURS, ...WON_COLOURS].find(p => p.hex === h)?.name ?? h;
}

const CLASS_IDS = Object.keys(CLASSES) as ClassId[];
const EMPTY: Yard = { yachts: [], racing: {}, at: 0 };

function clean(x: unknown): Yacht | null {
  const look = cleanLook(x);
  if (!look) return null;
  const o = x as { id?: unknown; cls?: unknown; name?: unknown; number?: unknown };
  if (typeof o.id !== 'string' || !/^[\w-]{1,40}$/.test(o.id) || !CLASS_IDS.includes(o.cls as ClassId)) return null;
  const cls = o.cls as ClassId;
  const name = cleanName(typeof o.name === 'string' ? o.name : '') || `My ${CLASSES[cls].name}`;
  const number = sailDigits(typeof o.number === 'string' ? o.number : null);
  return number ? { ...look, id: o.id, cls, name, number } : { ...look, id: o.id, cls, name };
}

/** A yacht's name as it's kept: plain words, no more than 24 characters. */
export function cleanName(s: string): string {
  return [...s].filter(ch => ch.charCodeAt(0) >= 32 && ch !== '<' && ch !== '>').join('').replace(/\s+/g, ' ').trim().slice(0, 24);
}

/** A yard read from this device or the account, with anything that isn't a yacht left out. */
export function cleanYard(x: unknown): Yard {
  if (!x || typeof x !== 'object') return { ...EMPTY, yachts: [], racing: {} };
  const o = x as { yachts?: unknown; racing?: Record<string, unknown>; at?: unknown };
  const yachts: Yacht[] = [];
  for (const y of Array.isArray(o.yachts) ? o.yachts : []) {
    const c = clean(y);
    if (c && !yachts.some(z => z.id === c.id) && yachts.length < MAX_YACHTS) yachts.push(c);
  }
  const racing: Yard['racing'] = {};
  for (const c of CLASS_IDS) { const id = o.racing?.[c]; if (typeof id === 'string' && yachts.some(y => y.id === id && y.cls === c)) racing[c] = id; }
  return { yachts, racing, at: typeof o.at === 'number' && Number.isFinite(o.at) ? o.at : 0 };
}

export function loadYard(): Yard {
  try { const s = localStorage.getItem(KEY); if (s) return cleanYard(JSON.parse(s)); } catch { /* storage unavailable */ }
  return { yachts: [], racing: {}, at: 0 };
}

export function saveYard(y: Yard): Yard {
  try { localStorage.setItem(KEY, JSON.stringify(y)); } catch { /* storage unavailable */ }
  return y;
}

/** The newer of two yards (this device's and the account's): one whole yard, never a mixture, so a yacht deleted stays deleted. */
export function newerYard(a: Yard | undefined, b: Yard | undefined): Yard {
  const x = cleanYard(a), y = cleanYard(b);
  return y.at > x.at ? y : x;
}

/** A new yacht of a class, in the blue every boat starts in, named for her class ("My IOM", "My IOM 2"). */
export function newYacht(yard: Yard, cls: ClassId, rnd: () => number = Math.random): Yacht {
  const base = `My ${CLASSES[cls].name}`;
  let name = base;
  for (let n = 2; yard.yachts.some(y => y.name === name); n++) name = `${base} ${n}`;
  const id = `y${Date.now().toString(36)}${Math.floor(rnd() * 1e9).toString(36)}`;
  return { ...DEFAULT_LOOK, patch: { ...DEFAULT_LOOK.patch }, id, cls, name };
}

/** The yard with a yacht added, or changed if she's already in it. Your first yacht in a class is the one you race there. */
export function putYacht(yard: Yard, y: Yacht, at = Date.now()): Yard {
  const had = yard.yachts.some(z => z.id === y.id);
  if (!had && yard.yachts.length >= MAX_YACHTS) return yard;
  const yachts = had ? yard.yachts.map(z => (z.id === y.id ? y : z)) : [...yard.yachts, y];
  const racing = { ...yard.racing };
  // (Moved to another class, she no longer races in her old one.)
  for (const c of CLASS_IDS) if (racing[c] === y.id && c !== y.cls) delete racing[c];
  for (const c of CLASS_IDS) if (!racing[c]) { const first = yachts.find(z => z.cls === c); if (first) racing[c] = first.id; }
  return { yachts, racing, at };
}

/** The yard without a yacht. If she was the one you raced, another of her class takes over (or nobody does). */
export function dropYacht(yard: Yard, id: string, at = Date.now()): Yard {
  const yachts = yard.yachts.filter(y => y.id !== id);
  const racing: Yard['racing'] = {};
  for (const c of CLASS_IDS) {
    const keep = yard.racing[c] !== id ? yard.racing[c] : undefined;
    const pick = keep && yachts.some(y => y.id === keep) ? keep : yachts.find(y => y.cls === c)?.id;
    if (pick) racing[c] = pick;
  }
  return { yachts, racing, at };
}

/** The yard with this yacht as the one you race in her class. */
export function raceYacht(yard: Yard, id: string, at = Date.now()): Yard {
  const y = yard.yachts.find(z => z.id === id);
  return y ? { ...yard, racing: { ...yard.racing, [y.cls]: id }, at } : yard;
}

/** The yacht you race in a class (null: you haven't designed one, so it's the plain blue boat). */
export function yachtFor(yard: Yard, cls: ClassId): Yacht | null {
  return yard.yachts.find(y => y.id === yard.racing[cls] && y.cls === cls) ?? yard.yachts.find(y => y.cls === cls) ?? null;
}

/** Her finish in a class, as the race wants it. */
export function lookFor(yard: Yard, cls: ClassId): BoatLook {
  const y = yachtFor(yard, cls);
  return y ? lookOf(y) : { ...DEFAULT_LOOK, patch: { ...DEFAULT_LOOK.patch } };
}

/** The number a yacht carries: her own, else the one on your boat of her class in Alfie, else 01. */
export function sailOf(y: { cls: ClassId; number?: string }, me: SimIdentity | null): { sail: string; from: 'yours' | 'alfie' | 'none' } {
  if (y.number) return { sail: y.number, from: 'yours' };
  const alfie = me?.sails[y.cls];
  return alfie ? { sail: alfie, from: 'alfie' } : { sail: '01', from: 'none' };
}

/** The number on your sail in a class: the yacht you race there, or your boat's in Alfie. */
export function sailFor(yard: Yard, cls: ClassId, me: SimIdentity | null): { sail: string; from: 'yours' | 'alfie' | 'none' } {
  return sailOf(yachtFor(yard, cls) ?? { cls }, me);
}

/** The finish alone, as the race wants it. */
export function lookOf(y: BoatLook): BoatLook {
  return { hull: y.hull, jibLuff: y.jibLuff, patch: { ...y.patch }, deckPatch: y.deckPatch, country: y.country, ...(y.deck ? { deck: y.deck } : {}), ...(y.bottom ? { bottom: y.bottom } : {}) };
}

/** A finish out of the paint locker: colours that go together, picked by chance. */
export function surprise(rnd: () => number = Math.random): BoatLook {
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const hull = pick(HULL_COLOURS).hex;
  const bright = SAIL_COLOURS.filter(c => c.hex !== '#FFFFFF' && c.hex !== '#14181F');
  const one = pick(bright).hex;
  const two = rnd() < 0.6 ? pick(SAIL_COLOURS.filter(c => c.hex !== one)).hex : null;
  return { hull, jibLuff: pick([one, one, pick(bright).hex]), patch: { style: rnd() < 0.72 ? 'fingers' : 'solid', one, two }, deckPatch: rnd() < 0.5 ? '#262C36' : one, country: 'AUS' };
}
