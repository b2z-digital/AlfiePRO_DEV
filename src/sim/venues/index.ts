// The venues you can race at. Each one is a club's real water and foreshore from OpenStreetMap.
import type { VenueDef } from '../venue';
import { LMRYC } from './lmryc';
import { KBRYC } from './kbryc';
import { PLRMYC } from './plrmyc';
import { PARADISE } from './paradise';
import { KAWANA } from './kawana';
import { LILLYDALE } from './lillydale';
import { JACKADDER } from './jackadder';
import { RISDON } from './risdon';
import { GLADSTONE } from './gladstone';
import { PATAWALONGA } from './patawalonga';
import { TAURIKURA } from './taurikura';
import { CIRCUIT_WATERS } from './circuit';

export const VENUES: Record<string, VenueDef> = { [LMRYC.id]: LMRYC, [KBRYC.id]: KBRYC, [PLRMYC.id]: PLRMYC, [PARADISE.id]: PARADISE, [KAWANA.id]: KAWANA, [LILLYDALE.id]: LILLYDALE, [JACKADDER.id]: JACKADDER, [RISDON.id]: RISDON, [GLADSTONE.id]: GLADSTONE, [PATAWALONGA.id]: PATAWALONGA, [TAURIKURA.id]: TAURIKURA, ...Object.fromEntries(CIRCUIT_WATERS.map(w => [w.id, w])) };
export { CIRCUIT_WATERS };

/** The default venue: Lake Macquarie RYC on the Booragul foreshore. */
export const DEFAULT_VENUE = LMRYC.id;

/** A club's home water, if it's one of the venues. */
export function venueForClub(clubId: string | null | undefined): VenueDef | null {
  if (!clubId) return null;
  return Object.values(VENUES).find(v => v.clubs?.includes(clubId)) ?? null;
}

/** The venues that come with the app (the rest are clubs' own, from the database). */
export const BUILT_IN: VenueDef[] = [LMRYC, KBRYC, PLRMYC, PARADISE, KAWANA, LILLYDALE, JACKADDER, RISDON, GLADSTONE, PATAWALONGA, TAURIKURA];

/**
 * Add a club's own water (from the database) to the venues the engine can race at. A venue never
 * changes under an id: a changed shape is a new version, and so a new id.
 */
export function registerVenue(def: VenueDef, as: string = def.id): void {
  if (!VENUES[as]) VENUES[as] = as === def.id ? def : { ...def, id: as };
}
