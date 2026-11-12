// The weather on the Circuit's race days: what each water gets, and how it changes. A pond or a
// man-made lake is sheltered: flat water, light to medium breezes. A natural lake gets anything. An
// open bay or a harbour can blow up rough. Each day of an event has its own weather, and through a
// day the breeze can build or ease from race to race, as it does on a real one. The same day always
// has the same weather (it's drawn from the season, the event and the day). Pure.
import { Rng } from '@/sim/math';
import type { RaceSettings } from '@/sim/types';
import type { WindStrength } from '@/sim/wind';

export type SeaState = NonNullable<RaceSettings['seaState']>;

export type WaterKind = 'pond' | 'lake' | 'bay';

/** What kind of water each venue is (the invented Circuit waters by their descriptions). */
export const WATER_KIND: Record<string, WaterKind> = {
  // Real waters
  lmryc: 'lake', // Lake Macquarie: a big coastal lake
  kbryc: 'bay', // Kogarah Bay, off Botany Bay
  plrmyc: 'pond', // the National Water Sports Centre's rowing course
  lillydale: 'pond', // Lillydale Lake: man-made
  paradise: 'pond', // Emerald Lakes: man-made
  kawana: 'pond', // Lake Kawana: man-made
  gladstone: 'bay', // Gladstone Marina, on the harbour
  patawalonga: 'pond', // the Patawalonga basin, behind its weir
  jackadder: 'pond', // a suburban lake
  risdon: 'lake', // Risdon Brook Dam, open to the hills
  taurikura: 'pond', // Lake Taurikura: man-made
  // The invented Circuit waters
  'circuit-lantern-quay': 'bay', // the old harbour basin
  'circuit-heron-reach': 'lake', // a long bend of the river
  'circuit-kestrelwater': 'lake', // a tarn under the fells
  'circuit-aurel-lake': 'pond', // the regatta lake
  'circuit-skerry-sound': 'bay', // a sound between low islands
  'circuit-tamarind-lagoon': 'lake', // a lagoon behind the reef
  'circuit-port-meridian': 'bay', // the great harbour
};
/** A water we know nothing about (the practice pond): sheltered. */
export const kindOf = (venue?: string | null): WaterKind => (venue && WATER_KIND[venue]) || 'pond';
export const KIND_NAME: Record<WaterKind, string> = { pond: 'Sheltered water', lake: 'Open lake', bay: 'Open bay' };
export const KIND_SAY: Record<WaterKind, string> = {
  pond: 'Sheltered water: flat, in a light to medium breeze.',
  lake: 'An open lake: anything from a calm to a fresh breeze and a chop.',
  bay: 'Open water: a breeze off the sea can build all day, up to rough.',
};

const STRENGTHS: WindStrength[] = ['light', 'medium', 'fresh'];
/** The breezes each kind of water gets. */
const RANGE: Record<WaterKind, WindStrength[]> = { pond: ['light', 'medium'], lake: ['light', 'medium', 'fresh'], bay: ['light', 'medium', 'fresh'] };

export interface RaceConditions { wind: WindStrength; sea: SeaState }
export interface DayWeather {
  kind: WaterKind;
  /** Each race (or round) of the day, in order. */
  races: RaceConditions[];
  /** How the breeze goes through the day. */
  trend: 'steady' | 'building' | 'easing';
}

/** The water for a breeze on a kind of water. `rough`: on an open lake in a fresh breeze, a day the waves get up. */
export function seaFor(kind: WaterKind, wind: WindStrength, rough = false): SeaState {
  if (kind === 'pond') return 'flat';
  if (kind === 'lake') return wind === 'light' ? 'flat' : wind === 'fresh' && rough ? 'rough' : 'chop';
  return wind === 'light' ? 'flat' : wind === 'medium' ? 'chop' : 'rough';
}

/**
 * A day's weather on a water: a breeze for the day (more often the one the event's expected in), and
 * through the day it holds, builds a step, or eases a step, from a race part-way through.
 */
export function dayWeather(seed: number, kind: WaterKind, races: number, expected?: WindStrength): DayWeather {
  const rng = new Rng(seed);
  const range = RANGE[kind];
  const weights = range.map(w => (w === expected ? 2.2 : 1));
  let x = rng.next() * weights.reduce((a, b) => a + b, 0), at = 0;
  while (at < range.length - 1 && x > weights[at]) { x -= weights[at]; at++; }
  const r = rng.next();
  let trend: DayWeather['trend'] = r < 0.45 ? 'steady' : r < 0.8 ? 'building' : 'easing';
  // Nowhere to go: a day already at the top of its range can't build, nor one at the bottom ease.
  if (trend === 'building' && at === range.length - 1) trend = 'easing';
  else if (trend === 'easing' && at === 0) trend = 'building';
  const change = races <= 1 ? Infinity : 1 + rng.int(Math.max(1, Math.floor(races / 3)), Math.max(1, races - 1));
  const rough = rng.next() < 0.35;
  const list: RaceConditions[] = [];
  for (let k = 1; k <= races; k++) {
    const step = trend === 'steady' || k < change ? 0 : trend === 'building' ? 1 : -1;
    const wind = range[Math.max(0, Math.min(range.length - 1, at + step))];
    list.push({ wind, sea: seaFor(kind, wind, rough) });
  }
  return { kind, races: list, trend: list[0].wind === list[list.length - 1].wind ? 'steady' : trend };
}

const WIND_WORD: Record<WindStrength, string> = { light: 'Light', medium: 'Medium', fresh: 'Fresh' };
const SEA_WORD: Record<SeaState, string> = { flat: 'flat water', chop: 'a chop', rough: 'rough water' };
/** "Medium breeze, a chop". */
export const conditionsLine = (c: RaceConditions): string => `${WIND_WORD[c.wind]} breeze, ${SEA_WORD[c.sea]}`;
/** "Building through the day" and the like, or nothing for a steady day. */
export function trendLine(d: DayWeather): string | null {
  if (d.trend === 'steady') return null;
  const k = d.races.findIndex(r => r.wind !== d.races[0].wind);
  return `${d.trend === 'building' ? 'Building' : 'Easing'} to ${WIND_WORD[d.races[k].wind].toLowerCase()} from race ${k + 1}`;
}
export const strengthIndex = (w: WindStrength) => STRENGTHS.indexOf(w);
