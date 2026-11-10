// The venues you can race at. Each one is a club's real water and foreshore from OpenStreetMap.
import type { VenueDef } from '../venue';
import { LMRYC } from './lmryc';
import { KBRYC } from './kbryc';
import { PLRMYC } from './plrmyc';

export const VENUES: Record<string, VenueDef> = { [LMRYC.id]: LMRYC, [KBRYC.id]: KBRYC, [PLRMYC.id]: PLRMYC };

/** The default venue: Lake Macquarie RYC on the Booragul foreshore. */
export const DEFAULT_VENUE = LMRYC.id;

/** A club's home water, if it's one of the venues. */
export function venueForClub(clubId: string | null | undefined): VenueDef | null {
  if (!clubId) return null;
  return Object.values(VENUES).find(v => v.clubs?.includes(clubId)) ?? null;
}
