/**
 * Getting an event ready to score: the same steps the desktop Event details "Start scoring"
 * button has always taken (moved here so the phone race desk takes exactly the same ones).
 * Loads the latest saved scoring for a series round, makes sure the round row holds its
 * skippers, picks the day for multi-day events, and leaves the event as the current event
 * for YachtRaceManager.
 */
import type { RaceEvent, RaceSeries } from '../types/race';
import { supabase } from './supabase';
import { setCurrentEvent } from './raceStorage';

export type PrepareResult =
  | { ok: true; event: RaceEvent; refreshed?: RaceEvent }
  | { ok: false; error: string };

function extractDbId(eventId: string): string {
  if (eventId.includes('-round-') || eventId.includes('-day-')) {
    // For series events like "uuid-round-1" or "uuid-day-2"
    const parts = eventId.split('-');
    // Take first 5 parts to reconstruct the UUID (8-4-4-4-12 format)
    return parts.slice(0, 5).join('-');
  }

  // Handle series round format: "uuid-0", "uuid-1", etc.
  // UUID format: 8-4-4-4-12 (5 parts separated by hyphens)
  const parts = eventId.split('-');
  if (parts.length > 5) {
    // If there are more than 5 parts, it's likely a UUID with a suffix (round index)
    // Extract just the UUID (first 5 parts)
    return parts.slice(0, 5).join('-');
  }

  return eventId; // Return as-is if it's already a clean UUID
}

/** For multi-day events: the first day not marked complete (else the last day). */
export function nextDayToScore(event: RaceEvent): number {
  if (!event.multiDay || !event.numberOfDays) return 1;
  const dayResults = event.dayResults || {};
  for (let day = 1; day <= event.numberOfDays; day++) {
    const dayData = dayResults[day];
    if (!dayData || dayData.dayCompleted !== true) return day;
  }
  return event.numberOfDays;
}

export async function prepareEventForScoring(
  event: RaceEvent,
  clubId: string | undefined,
  nextDay: number,
): Promise<PrepareResult> {
  const currentClub = clubId ? { clubId } : null;
  let refreshed: RaceEvent | undefined;
    let latestEvent = event;
    let dbHasSavedScoring = false;

    // The details view may still hold a stale or blank copy if its background refetch hasn't finished
    if (latestEvent.isSeriesEvent && latestEvent.seriesId && latestEvent.roundName && currentClub?.clubId) {
      const { data: freshRound, error: freshError } = await supabase
        .from('race_series_rounds')
        .select('id, skippers, race_results, last_completed_race, has_determined_initial_hcaps, is_manual_handicaps, heat_management, num_races, drop_rules, multi_day, number_of_days, day_results, current_day')
        .eq('series_id', latestEvent.seriesId)
        .eq('round_name', latestEvent.roundName)
        .eq('club_id', currentClub.clubId)
        .maybeSingle();

      if (freshError) {
        return { ok: false, error: 'Could not load the latest scoring for this round. Please check your connection and try again.' };
      }

      if (freshRound) {
        const dbSkippers = Array.isArray(freshRound.skippers) ? freshRound.skippers : [];
        const dbResults = Array.isArray(freshRound.race_results) ? freshRound.race_results : [];
        const hasSavedScoring = dbSkippers.length > 0 && (dbResults.length > 0 || (freshRound.last_completed_race || 0) > 0 || !!freshRound.day_results);
        dbHasSavedScoring = hasSavedScoring;
        const localIsBlank = !latestEvent.skippers?.length;
        if (hasSavedScoring || localIsBlank) {
          latestEvent = {
            ...latestEvent,
            seriesRoundId: freshRound.id,
            skippers: dbSkippers.length > 0 ? dbSkippers : latestEvent.skippers || [],
            raceResults: dbResults,
            lastCompletedRace: freshRound.last_completed_race || 0,
            hasDeterminedInitialHcaps: freshRound.has_determined_initial_hcaps || false,
            isManualHandicaps: freshRound.is_manual_handicaps || false,
            heatManagement: freshRound.heat_management || latestEvent.heatManagement || null,
            numRaces: freshRound.num_races || latestEvent.numRaces,
            dropRules: freshRound.drop_rules || latestEvent.dropRules,
            multiDay: freshRound.multi_day ?? latestEvent.multiDay,
            numberOfDays: freshRound.number_of_days || latestEvent.numberOfDays,
            dayResults: freshRound.day_results || latestEvent.dayResults || {},
            currentDay: freshRound.current_day || latestEvent.currentDay || 1
          };
          refreshed = latestEvent;
        }
      }
    }

    console.log('🎯 [EventDetails handleStartScoring] Called with:');
    console.log('  - eventName:', latestEvent.eventName);
    console.log('  - isSeriesEvent:', latestEvent.isSeriesEvent);
    console.log('  - seriesId:', latestEvent.seriesId);
    console.log('  - roundName:', latestEvent.roundName);
    console.log('  - skippers:', latestEvent.skippers?.length || 0);
    console.log('  - nextDay:', nextDay);
    console.log('  - multiDay:', latestEvent.multiDay);
    console.log('  - Full skippers array:', latestEvent.skippers);

    // For series rounds, ensure skippers are saved to race_series_rounds table before starting scoring
    // Skip when the round already holds saved scoring: latestEvent was just loaded from it, so re-saving only adds delay
    if (!dbHasSavedScoring && latestEvent.isSeriesEvent && latestEvent.seriesId && latestEvent.roundName && latestEvent.skippers && latestEvent.skippers.length > 0 && currentClub?.clubId) {
      console.log('🎯 [handleStartScoring] Saving series round skippers to race_series_rounds table before scoring');
      try {
        // Check if round already exists
        const { data: existingRound, error: fetchError } = await supabase
          .from('race_series_rounds')
          .select('id, round_index')
          .eq('series_id', latestEvent.seriesId)
          .eq('round_name', latestEvent.roundName)
          .eq('club_id', currentClub.clubId)
          .maybeSingle();

        if (fetchError) {
          console.error('Error fetching series round:', fetchError);
        } else {
          const roundData = {
            series_id: latestEvent.seriesId,
            club_id: currentClub.clubId,
            round_name: latestEvent.roundName,
            date: latestEvent.date,
            venue: latestEvent.venue,
            race_class: latestEvent.raceClass,
            race_format: latestEvent.raceFormat,
            skippers: latestEvent.skippers,
            race_results: latestEvent.raceResults || [],
            last_completed_race: latestEvent.lastCompletedRace || 0,
            has_determined_initial_hcaps: latestEvent.hasDeterminedInitialHcaps || false,
            is_manual_handicaps: latestEvent.isManualHandicaps || false,
            heat_management: latestEvent.heatManagement || null,
            num_races: latestEvent.numRaces || 12,
            drop_rules: latestEvent.dropRules || [4, 8, 16, 24, 32, 40]
          };

          if (existingRound) {
            // Update existing round
            const { error: updateError } = await supabase
              .from('race_series_rounds')
              .update(roundData)
              .eq('id', existingRound.id);

            if (updateError) {
              console.error('Error updating series round:', updateError);
            } else {
              console.log('✅ [handleStartScoring] Successfully updated skippers in race_series_rounds');
            }
          } else {
            // Create new round
            const { data: maxIndexData } = await supabase
              .from('race_series_rounds')
              .select('round_index')
              .eq('series_id', latestEvent.seriesId)
              .order('round_index', { ascending: false })
              .limit(1)
              .maybeSingle();

            const nextIndex = (maxIndexData?.round_index || 0) + 1;

            const { error: insertError } = await supabase
              .from('race_series_rounds')
              .insert({
                ...roundData,
                round_index: nextIndex
              });

            if (insertError) {
              console.error('Error inserting series round:', insertError);
            } else {
              console.log('✅ [handleStartScoring] Successfully created round in race_series_rounds with skippers');
            }
          }
        }
      } catch (err) {
        console.error('Error saving series round skippers:', err);
      }
    }

    // For multi-day events, update the currentDay to the next day that needs scoring
    const eventToStart = latestEvent.multiDay ? {
      ...latestEvent,
      currentDay: nextDay
    } : latestEvent;

    console.log('🎯 Setting currentEvent with currentDay:', eventToStart.currentDay);
    console.log('🎯 EventDetails: Saving to localStorage:', {
      eventName: eventToStart.eventName,
      skippers: eventToStart.skippers?.length || 0,
      hasSkippersArray: Array.isArray(eventToStart.skippers),
      lastCompletedRace: eventToStart.lastCompletedRace
    });

    // Save the current event to localStorage so YachtRaceManager can load it
    setCurrentEvent(eventToStart);

    // Also update the database with the new currentDay for multi-day events
    if (event.multiDay && currentClub?.clubId) {
      try {
        const dbId = extractDbId(event.id);

        // Determine the correct table based on event type
        let tableName = 'quick_races';
        if (event.isSeriesEvent) {
          tableName = 'race_series';
        } else if (event.isPublicEvent) {
          tableName = 'public_events';
        }

        console.log('🎯 Updating database table:', tableName, 'with current_day:', nextDay, 'for id:', dbId);

        const { data, error } = await supabase
          .from(tableName)
          .update({ current_day: nextDay })
          .eq('id', dbId)
          .eq('club_id', currentClub.clubId);

        if (error) {
          console.error('🎯 Database update error:', error);
        } else {
          console.log('🎯 Database updated successfully');
        }
      } catch (error) {
        console.error('Error updating current day in database:', error);
        // Continue anyway - localStorage update is sufficient for immediate use
      }
    }

    return { ok: true, event: eventToStart, refreshed };
  }

/** A series round as a RaceEvent: the same mapping the desktop Race Management page uses. */
export function seriesRoundToEvent(seriesItem: RaceSeries, roundIndex: number): RaceEvent {
  const round = seriesItem.rounds[roundIndex];
  return {
    id: `${seriesItem.id}-${roundIndex}`,
    eventName: `${round.name} - ${seriesItem.seriesName}`,
    clubName: seriesItem.clubName,
    date: round.date,
    venue: round.venue,
    startTime: round.startTime,
    raceClass: seriesItem.raceClass,
    raceFormat: seriesItem.raceFormat,
    isSeriesEvent: true,
    seriesId: seriesItem.id,
    roundName: round.name,
    skippers: round.skippers?.length ? round.skippers : seriesItem.skippers || [],
    raceResults: round.raceResults || round.results || [],
    lastCompletedRace: round.lastCompletedRace || 0,
    hasDeterminedInitialHcaps: round.hasDeterminedInitialHcaps || false,
    isManualHandicaps: round.isManualHandicaps || false,
    completed: round.completed || false,
    cancelled: round.cancelled || false,
    cancellationReason: round.cancellationReason,
    media: seriesItem.media || [],
    livestreamUrl: seriesItem.livestreamUrl,
    clubId: seriesItem.clubId,
    heatManagement: round.heatManagement || null,
    numRaces: round.numRaces,
    dropRules: round.dropRules || [4, 8, 16, 24, 32, 40],
    enableLiveTracking: seriesItem.enableLiveTracking,
    enableLiveStream: round.enableLiveStream || seriesItem.enableLiveStream,
    enable_observers: round.enable_observers || false,
    observers_per_heat: round.observers_per_heat || 2
  };
}
