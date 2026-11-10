// The venues you can race at. Each one is a club's real water and foreshore from OpenStreetMap.
import type { VenueDef } from '../venue';
import { LMRYC } from './lmryc';

export const VENUES: Record<string, VenueDef> = { [LMRYC.id]: LMRYC };

/** The default venue: Lake Macquarie RYC on the Booragul foreshore. */
export const DEFAULT_VENUE = LMRYC.id;
