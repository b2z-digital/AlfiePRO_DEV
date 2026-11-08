/**
 * Race day set-up on the phone (Race Management board, "Race day set-up" page).
 * Every save goes through the code the desktop scoring screen uses: utils/raceSetup (skippers,
 * race settings), utils/heatSetup (heats) and utils/raceSignOnStorage (sign on).
 */
import { useCallback, useEffect, useState } from 'react';
import type { Skipper } from '../types';
import type { HeatManagement } from '../types/heat';
import type { RaceEvent } from '../types/race';
import { getCurrentEvent, reloadCurrentEventFromDatabase, setCurrentEvent } from '../utils/raceStorage';
import {
  RaceSettingsInput, dedupeSkippers, heatManagementOf, normalizeHeatManagementForSave, persistRaceSettings, persistSkippers, scoringStateOf,
} from '../utils/raceSetup';
import { DeskItem, loadDesk } from './raceDesk';

/** Opens an event for set-up the way the scoring screen does: it becomes the current event, fresh from the database. */
export async function openForSetup(event: RaceEvent): Promise<RaceEvent> {
  setCurrentEvent(event);
  const fresh = await reloadCurrentEventFromDatabase().catch(() => null);
  return fresh || getCurrentEvent() || event;
}

/** Racing has started once any race (or heat) has a result; scored-result settings lock then. */
export function racingStarted(e: RaceEvent): boolean {
  const st = scoringStateOf(e);
  const hm = heatManagementOf(e);
  return st.lastCompletedRace > 0 || st.raceResults.length > 0 || !!hm?.rounds?.some(r => r.completed || (r.results && r.results.length > 0));
}

/**
 * Saves the skipper list (YachtRaceManager.handleUpdateSkippers before racing): duplicates dropped,
 * saved with the event's scoring state. Removing skippers clears seeded heats, as on desktop.
 */
export async function saveSkippers(e: RaceEvent, next: Skipper[]): Promise<RaceEvent> {
  const unique = dedupeSkippers(next);
  setCurrentEvent(e);
  let hm = heatManagementOf(e);
  if (hm?.configuration.enabled && unique.length < (e.skippers?.length || 0)) hm = null;
  await persistSkippers({ ...scoringStateOf(e), skippers: unique }, e, hm);
  return getCurrentEvent() || { ...e, skippers: unique, heatManagement: hm || undefined };
}

/** Saves race settings and heats (YachtRaceManager.handleSaveRaceSettings). */
export async function saveRaceSettings(e: RaceEvent, settings: RaceSettingsInput): Promise<RaceEvent> {
  setCurrentEvent(e);
  const finalHM = normalizeHeatManagementForSave(settings.heatManagement);
  const reloaded = await persistRaceSettings(scoringStateOf(e), settings, finalHM);
  return reloaded || getCurrentEvent() || { ...e, heatManagement: finalHM || undefined, numRaces: settings.numRaces, dropRules: settings.dropRules as any };
}

/** The observer settings the event has now (kept as-is when other settings are saved). */
export function observerSettingsOf(e: RaceEvent): NonNullable<RaceSettingsInput['observerSettings']> {
  const x: any = e;
  return {
    enable_observers: !!x.enable_observers,
    observers_per_heat: x.observers_per_heat || 2,
    enable_roll_call: x.enable_roll_call ?? false,
    auto_complete_sail: x.auto_complete_sail ?? true,
  };
}

export function currentHeats(e: RaceEvent): HeatManagement | null {
  const hm = heatManagementOf(e);
  return hm?.configuration?.enabled ? hm : null;
}

/** Loads a Race desk item and opens its event for set-up. */
export function useSetupEvent(key: string) {
  const [item, setItem] = useState<DeskItem | null | undefined>(undefined);
  const [event, setEvent] = useState<RaceEvent | null>(null);
  const reload = useCallback(async () => {
    const d = await loadDesk().catch(() => null);
    const it = d?.items.find(i => i.key === key) || null;
    setItem(it);
    if (it) setEvent(await openForSetup(it.event));
  }, [key]);
  useEffect(() => { void reload(); }, [reload]);
  return { item, event, setEvent, reload };
}
