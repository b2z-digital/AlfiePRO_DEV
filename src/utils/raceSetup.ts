/**
 * Saving an event's race set-up (skippers, handicaps, heats, race settings), shared by the
 * desktop scoring screen (YachtRaceManager) and the phone Race desk. The save steps are moved
 * verbatim from YachtRaceManager.handleSaveRaceSettings so both write exactly the same data.
 *
 * Both work on the "current event" (raceStorage.setCurrentEvent), as the desktop does.
 */
import type { Skipper } from '../types';
import type { HeatManagement } from '../types/heat';
import type { RaceEvent } from '../types/race';
import { getCurrentEvent, reloadCurrentEventFromDatabase, setCurrentEvent, updateEventResults } from './raceStorage';
import { generatePreSetQualifyingAssignments } from './shrsHeatSystem';
import { supabase } from './supabase';

export interface RaceSettingsInput {
  numRaces: number;
  dropRules: number[] | string;
  heatManagement: HeatManagement | null;
  displaySettings?: {
    show_flag?: boolean;
    show_country?: boolean;
  };
  observerSettings?: {
    enable_observers?: boolean;
    observers_per_heat?: number;
    enable_roll_call?: boolean;
    auto_complete_sail?: boolean;
  };
}

/** The scoring state that is saved alongside settings (unchanged by a settings save). */
export interface ScoringState {
  raceResults: any[];
  skippers: Skipper[];
  lastCompletedRace: number;
  hasDeterminedInitialHcaps: boolean;
  isManualHandicaps: boolean;
  currentDay: number;
}

/** SHRS safety net from handleSaveRaceSettings: makes sure pre-assigned qualifying rounds exist. */
export function normalizeHeatManagementForSave(heatManagement: HeatManagement | null): HeatManagement | null {
  let finalHM = heatManagement;
  if (finalHM && finalHM.configuration.scoringSystem === 'shrs') {
    const qRounds = finalHM.configuration.shrsQualifyingRounds || 1;
    const isPreset = finalHM.configuration.shrsAssignmentMode === 'preset';
    if (isPreset && qRounds > 1 && finalHM.rounds.length < qRounds) {
      const hasAnyResults = finalHM.rounds.some(r => r.results && r.results.length > 0);
      if (hasAnyResults) {
        console.log('⚠️ SHRS safety net (balanced): rounds missing but results exist - preserving existing rounds');
      } else {
        console.log('⚠️ SHRS safety net (balanced): rounds.length', finalHM.rounds.length, 'but need', qRounds, '- regenerating');
        const firstRoundAssignments = finalHM.rounds[0]?.heatAssignments || [];
        const numHeats = finalHM.configuration.numberOfHeats;
        const allQR = generatePreSetQualifyingAssignments(
          firstRoundAssignments.map(a => ({ heatDesignation: a.heatDesignation as string, skipperIndices: [...a.skipperIndices] })),
          numHeats,
          qRounds
        );
        finalHM = {
          ...finalHM,
          rounds: allQR.map((ra, idx) => ({
            round: idx + 1,
            heatAssignments: ra.map(a => ({ heatDesignation: a.heatDesignation as any, skipperIndices: a.skipperIndices })),
            results: [] as any[],
            completed: false
          }))
        };
      }
    } else if (!isPreset && finalHM.rounds.length > 1) {
      console.log('⚠️ SHRS safety net (progressive): trimming to round 1 only');
      finalHM = {
        ...finalHM,
        rounds: [finalHM.rounds[0]]
      };
    }
  }
  return finalHM;
}

/**
 * Writes race settings for the current event (handleSaveRaceSettings' database steps).
 * Returns the event reloaded from the database when display or observer settings were saved.
 */
export async function persistRaceSettings(
  state: ScoringState,
  settings: RaceSettingsInput,
  finalHM: HeatManagement | null,
  hooks: { onExtraSettingsSaved?: () => void } = {}
): Promise<RaceEvent | null> {
  const { raceResults, skippers, lastCompletedRace, hasDeterminedInitialHcaps, isManualHandicaps, currentDay } = state;
  const currentEvent = getCurrentEvent();
  if (currentEvent) {
    if (settings.observerSettings) {
      currentEvent.enable_observers = settings.observerSettings.enable_observers;
      currentEvent.observers_per_heat = settings.observerSettings.observers_per_heat;
      currentEvent.enable_roll_call = settings.observerSettings.enable_roll_call;
      currentEvent.auto_complete_sail = settings.observerSettings.auto_complete_sail;
    }
    if (settings.displaySettings) {
      (currentEvent as any).show_flag = settings.displaySettings.show_flag;
      (currentEvent as any).show_country = settings.displaySettings.show_country;
    }
    setCurrentEvent(currentEvent);

    console.log('💾 Explicitly saving heat management to database...');
    try {
      await updateEventResults(
        (currentEvent.isSeriesEvent ? currentEvent.seriesId : currentEvent.id) as string,
        raceResults,
        skippers,
        lastCompletedRace,
        hasDeterminedInitialHcaps,
        isManualHandicaps,
        false,
        currentDay,
        finalHM,
        settings.numRaces,
        settings.dropRules
      );
      console.log('✅ Heat management saved to database successfully');

      const freshEvent = getCurrentEvent() || currentEvent;

      if ((settings.displaySettings || settings.observerSettings) && freshEvent.id) {
        const updateData: any = {};

        if (settings.displaySettings) {
          updateData.show_flag = settings.displaySettings.show_flag;
          updateData.show_country = settings.displaySettings.show_country;
        }

        if (settings.observerSettings) {
          updateData.enable_observers = settings.observerSettings.enable_observers;
          updateData.observers_per_heat = settings.observerSettings.observers_per_heat;
          updateData.enable_roll_call = settings.observerSettings.enable_roll_call;
          updateData.auto_complete_sail = settings.observerSettings.auto_complete_sail;
          console.log('💾 Saving observer settings:', settings.observerSettings);
        }

        let saveError = null;
        if (freshEvent.isSeriesEvent && freshEvent.seriesId) {
          let roundId = freshEvent.seriesRoundId;
          if (!roundId && freshEvent.roundName) {
            const { data: roundRow } = await supabase
              .from('race_series_rounds')
              .select('id')
              .eq('series_id', freshEvent.seriesId)
              .eq('round_name', freshEvent.roundName)
              .maybeSingle();
            roundId = roundRow?.id;
            if (roundId) {
              freshEvent.seriesRoundId = roundId;
              setCurrentEvent(freshEvent);
            }
          }
          if (roundId) {
            const { error } = await supabase
              .from('race_series_rounds')
              .update(updateData)
              .eq('id', roundId);
            saveError = error;

            if (!saveError && settings.observerSettings && freshEvent.seriesId) {
              const observerData: any = {
                enable_observers: settings.observerSettings.enable_observers,
                observers_per_heat: settings.observerSettings.observers_per_heat,
                enable_roll_call: settings.observerSettings.enable_roll_call,
                auto_complete_sail: settings.observerSettings.auto_complete_sail
              };
              await supabase
                .from('race_series_rounds')
                .update(observerData)
                .eq('series_id', freshEvent.seriesId)
                .neq('id', roundId);
            }
          } else {
            console.error('Could not find series round ID for observer settings save');
          }
        } else {
          const { error } = await supabase
            .from('quick_races')
            .update(updateData)
            .eq('id', freshEvent.id);
          saveError = error;
        }

        if (saveError) {
          console.error('❌ Error saving display/observer settings:', saveError);
        } else {
          console.log('✅ Display/Observer settings saved successfully to database');
          const updatedEvent = {
            ...freshEvent,
            ...(settings.displaySettings && {
              show_flag: settings.displaySettings.show_flag,
              show_country: settings.displaySettings.show_country
            }),
            ...(settings.observerSettings && {
              enable_observers: settings.observerSettings.enable_observers,
              observers_per_heat: settings.observerSettings.observers_per_heat,
              enable_roll_call: settings.observerSettings.enable_roll_call,
              auto_complete_sail: settings.observerSettings.auto_complete_sail
            })
          };
          setCurrentEvent(updatedEvent as RaceEvent);
          hooks.onExtraSettingsSaved?.();

          // Reload event from database to pick up all updated fields
          return await reloadCurrentEventFromDatabase();
        }
      }
    } catch (error) {
      console.error('❌ Error saving heat management to database:', error);
      throw error;
    }
  }
  return null;
}

/**
 * Saves skippers and handicaps for the current event the way the scoring screen does when its
 * skipper list changes (YachtRaceManager: updateEventResults with the event's scoring state).
 */
export async function persistSkippers(state: ScoringState, event: RaceEvent, heatManagement: HeatManagement | null = heatManagementOf(event)): Promise<void> {
  await updateEventResults(
    event.id,
    state.raceResults,
    state.skippers,
    state.lastCompletedRace,
    state.hasDeterminedInitialHcaps,
    state.isManualHandicaps,
    false,
    state.currentDay,
    heatManagement,
    event.numRaces || 12,
    event.dropRules || [4, 8, 16, 24, 32, 40]
  );
}

/** The scoring state of an event as the scoring screen loads it (multi-day: the current day). */
export function scoringStateOf(event: RaceEvent): ScoringState {
  const day = event.currentDay || 1;
  const d: any = event.multiDay ? (event.dayResults || {})[day] || {} : event;
  return {
    raceResults: d.raceResults || [],
    skippers: event.skippers || [],
    lastCompletedRace: d.lastCompletedRace || 0,
    hasDeterminedInitialHcaps: !!d.hasDeterminedInitialHcaps,
    isManualHandicaps: !!d.isManualHandicaps,
    currentDay: day,
  };
}

/** The heat management the scoring screen works with (multi-day: the current day's). */
export function heatManagementOf(event: RaceEvent): HeatManagement | null {
  if (event.multiDay) {
    const d: any = (event.dayResults || {})[event.currentDay || 1];
    return d?.heatManagement || event.heatManagement || null;
  }
  return event.heatManagement || null;
}

/** YachtRaceManager.handleUpdateSkippers: drops repeated names and sail numbers, keeping the first. */
export function dedupeSkippers<T extends { name: string; sailNo: string }>(newSkippers: T[]): T[] {
  const uniqueSkippers: T[] = [];
  const nameSet = new Set();
  const sailNoSet = new Set<string>();

  for (const skipper of newSkippers) {
    if (nameSet.has(skipper.name) || sailNoSet.has(skipper.sailNo)) {
      continue;
    }
    nameSet.add(skipper.name);
    sailNoSet.add(skipper.sailNo);
    uniqueSkippers.push(skipper);
  }
  return uniqueSkippers;
}

/** SkipperModal.handleAddSelectedMembers: an event skipper from a club member's boat. */
export function skipperFromMemberBoat(
  member: { id: string; first_name: string; last_name: string; club?: string | null; country_code?: string; country?: string; category?: string; state?: string },
  boat: { id: string; sail_number?: string | null; hull?: string | null; boat_type?: string | null; handicap?: number | null },
  avatarUrl?: string
): Skipper {
  return {
    name: `${member.first_name} ${member.last_name}`,
    sailNo: boat.sail_number || '',
    hull: boat.hull || '',
    club: member.club || '',
    boatModel: boat.hull || boat.boat_type,
    startHcap: boat.handicap || 0,
    avatarUrl: avatarUrl || undefined,
    memberId: member.id,
    boatId: boat.id,
    country_code: member.country_code,
    country: member.country,
    category: member.category,
    state: member.state
  } as any;
}

/** Whether a member's boat type is the event's class (moved from SkipperModal). */
export function boatTypeMatchesClass(boatType: string | undefined | null, raceClass: string | undefined | null): boolean {
  if (!boatType || !raceClass) return false;
  if (boatType === raceClass) return true;
  const boatLower = boatType.toLowerCase();
  const classLower = raceClass.toLowerCase();
  if (boatLower === classLower) return true;
  const classAbbr = raceClass.match(/\(([^)]+)\)/)?.[1];
  if (classAbbr && classAbbr.toLowerCase() === boatLower) return true;
  const boatAbbr = boatType.match(/\(([^)]+)\)/)?.[1];
  if (boatAbbr && boatAbbr.toLowerCase() === classLower) return true;
  return false;
}

/** Discard options offered by the desktop Race Settings (moved from RaceSettingsModal). */
export const DROP_RULE_OPTIONS = [
  { label: 'No Discards', value: [], forHeatRacing: false },
  { label: 'Low Point System (1 after 4, 2 after 8, 3 after 12 and then every 4 races after)', value: [4, 8, 12, 16, 20, 24, 28, 32, 36, 40], forHeatRacing: false },
  { label: 'RRS - Appendix A Scoring System (1 after 4, 2 after 8, 3 after 16 and then every 8 races after)', value: [4, 8, 16, 24, 32, 40], forHeatRacing: false },
  { label: 'HMS Heat System', value: 'hms', forHeatRacing: true },
  { label: 'SHRS - Simple Heat Race System (1 after 4, 2 after 8, +1 per 8 races)', value: 'shrs', forHeatRacing: true },
  { label: 'Custom', value: 'custom', forHeatRacing: false }
];
