// The Circuit's real waters: the clubs' sailing waters across Australia and New Zealand, built from
// OpenStreetMap (src/sim/venues). Seasons begun before they came keep the invented waters of
// src/sim/venues/circuit.ts until they finish. Event titles are real-style ("Queensland State
// Championship"), never a real trophy, sponsor or organiser.
import type { Region, VenueDef } from '@/sim/venue';
import { BUILT_IN, VENUES } from '@/sim/venues';

/** What a water is called on the Circuit, and the city its Major is named for. */
export const REAL_WATERS: Record<string, { name: string; city: string; region: Region }> = {
  lmryc: { name: 'Lake Macquarie', city: 'Lake Macquarie', region: 'NSW' },
  kbryc: { name: 'Kogarah Bay', city: 'Sydney', region: 'NSW' },
  plrmyc: { name: 'Patterson Lakes', city: 'Melbourne', region: 'VIC' },
  lillydale: { name: 'Lillydale Lake', city: 'Lilydale', region: 'VIC' },
  paradise: { name: 'Emerald Lakes', city: 'Gold Coast', region: 'QLD' },
  kawana: { name: 'Lake Kawana', city: 'Sunshine Coast', region: 'QLD' },
  gladstone: { name: 'Gladstone Marina', city: 'Gladstone', region: 'QLD' },
  patawalonga: { name: 'The Patawalonga', city: 'Adelaide', region: 'SA' },
  jackadder: { name: 'Jackadder Lake', city: 'Perth', region: 'WA' },
  risdon: { name: 'Risdon Brook', city: 'Hobart', region: 'TAS' },
  taurikura: { name: 'Lake Taurikura', city: 'Tauranga', region: 'NZ' },
};

/** Each region's waters, its main water (where its Championship is sailed) first. */
export const REGION_WATERS: Record<Region, string[]> = {
  NSW: ['lmryc', 'kbryc'],
  VIC: ['plrmyc', 'lillydale'],
  QLD: ['paradise', 'kawana', 'gladstone'],
  SA: ['patawalonga'],
  WA: ['jackadder'],
  TAS: ['risdon'],
  NZ: ['taurikura'],
};
/** Where a region with few waters of its own sails the rest of its regattas, nearest first. */
export const NEIGHBOURS: Record<Region, Region[]> = {
  NSW: ['QLD', 'VIC'],
  VIC: ['NSW', 'SA', 'TAS'],
  QLD: ['NSW'],
  SA: ['VIC', 'WA'],
  WA: ['SA', 'VIC'],
  TAS: ['VIC', 'NSW'],
  NZ: ['NSW', 'QLD'],
};
export const REGION_NAME: Record<Region, string> = {
  NSW: 'New South Wales', VIC: 'Victoria', QLD: 'Queensland', SA: 'South Australia', WA: 'Western Australia', TAS: 'Tasmania', NZ: 'New Zealand',
};
/** The Regional season's last event, in each region. */
export const REGION_TITLE: Record<Region, string> = {
  NSW: 'NSW State Championship', VIC: 'Victorian State Championship', QLD: 'Queensland State Championship',
  SA: 'South Australian State Championship', WA: 'Western Australian State Championship', TAS: 'Tasmanian State Championship',
  NZ: 'New Zealand Championship',
};

/** Where the Australian Championship goes, a season at a time: round the states' main waters. */
export const NATIONAL_ROTATION = ['paradise', 'lmryc', 'plrmyc', 'patawalonga', 'jackadder', 'risdon'];
/** The National season's lead-up regattas move round these (never on the Championship's own water). */
export const NATIONAL_POOL = ['lmryc', 'paradise', 'plrmyc', 'kawana', 'patawalonga', 'lillydale', 'jackadder', 'kbryc', 'risdon', 'gladstone'];
/** The World season: the Oceania Championship in New Zealand, then the World Championship, which moves round these. */
export const OCEANIA_WATER = 'taurikura';
export const WORLD_ROTATION = ['lmryc', 'paradise', 'plrmyc', 'kawana'];

/** The waters a Regional season in `home` is sailed on: its own (main water last), then its neighbours'. */
export function regionalPool(home: Region): string[] {
  const own = REGION_WATERS[home];
  const out = [...own.slice(1), ...NEIGHBOURS[home].flatMap(r => REGION_WATERS[r])];
  return out.filter((w, i) => out.indexOf(w) === i && w !== own[0]);
}

/** A water's name on the Circuit: its real name, or an invented water's own. */
export const waterName = (id: string): string => REAL_WATERS[id]?.name ?? VENUES[id]?.name ?? id;

/**
 * The region a club's water is in: the one it's marked with, or else the region of the nearest of
 * the real waters. Null with no water to go on.
 */
export function regionOf(def: VenueDef | null | undefined): Region | null {
  if (!def || def.invented) return null;
  if (def.region) return def.region;
  let best: Region | null = null, bd = Infinity;
  const k = Math.cos((def.lat * Math.PI) / 180);
  for (const v of BUILT_IN) {
    if (!v.region) continue;
    const d = Math.hypot(v.lat - def.lat, (v.lon - def.lon) * k);
    if (d < bd) { bd = d; best = v.region; }
  }
  return best;
}
