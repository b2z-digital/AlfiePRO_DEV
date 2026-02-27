import { RaceEvent, RaceSeries } from '../types/race';
import { Skipper } from '../types';
import { supabase, forceConnectionRecovery } from './supabase';
import { HeatManagement, HeatResult } from '../types/heat';
import { offlineStorage } from './offlineStorage';
import { protectedQuery, QUERY_TIMEOUTS } from './queryHelpers';

// Local storage keys
const RACE_EVENTS_KEY = 'race-events';
const RACE_SERIES_KEY = 'race-series';
const CURRENT_EVENT_KEY = 'current-event';

// Note: We rely on the global 15s timeout in supabase.ts and the retryQuery helper
// No additional timeout wrappers needed here - they just slow things down

// Get stored race events - OFFLINE-FIRST with timeout protection
export const getStoredRaceEvents = async (): Promise<RaceEvent[]> => {
  try {
    // Get current club from localStorage
    const currentClubId = localStorage.getItem('currentClubId');
    if (!currentClubId) {
      console.warn('No club selected, returning empty events list');
      return [];
    }

    // ALWAYS get cached data first for instant display
    const cachedEvents = await offlineStorage.getEvents(currentClubId);
    console.log('📦 Loaded', cachedEvents.length, 'cached events');

    // Check if we're online
    const isOnline = offlineStorage.getOnlineStatus();

    if (isOnline) {
      // Try to fetch from Supabase - global timeout handles this
      try {
        const { data, error } = await supabase
          .from('quick_races')
          .select('*')
          .eq('club_id', currentClubId)
          .eq('archived', false)
          .is('public_event_id', null) // Exclude quick_races linked to public events
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching quick races from Supabase:', error);
          throw error;
        }

        // Transform the data to match our RaceEvent type
        const events: RaceEvent[] = data.map(race => {
          // Extract skippers from race_results if skippers field is empty but results exist
          let skippers = race.skippers || [];
          const raceResults = race.race_results || [];

          console.log(`[getStoredRaceEvents] Event: ${race.event_name}`, {
            hasSkippers: skippers.length > 0,
            skipperCount: skippers.length,
            hasResults: raceResults.length > 0,
            resultCount: raceResults.length,
            lastCompletedRace: race.last_completed_race
          });

          if (skippers.length === 0 && raceResults.length > 0) {
            console.log(`[getStoredRaceEvents] Extracting skippers for ${race.event_name}`, {
              resultsStructure: raceResults.map((r: any) => ({
                hasSkippers: !!r.skippers,
                skipperCount: r.skippers?.length,
                keys: Object.keys(r)
              }))
            });

            // Extract unique skippers from results
            const skipperMap = new Map();
            raceResults.forEach((result: any) => {
              if (result.skippers && Array.isArray(result.skippers)) {
                result.skippers.forEach((skipper: any) => {
                  if (skipper.name && !skipperMap.has(skipper.name)) {
                    skipperMap.set(skipper.name, skipper);
                  }
                });
              }
            });
            skippers = Array.from(skipperMap.values());
            console.log(`[getStoredRaceEvents] Extracted ${skippers.length} skippers for ${race.event_name}`);
          }

          const raceEvent = {
            id: race.id,
            eventName: race.event_name || undefined,
            clubName: race.club_name,
            date: race.race_date,
            venue: race.race_venue,
            raceClass: race.race_class,
            raceFormat: race.race_format,
            skippers: skippers,
            raceResults: raceResults,
            lastCompletedRace: race.last_completed_race || 0,
            hasDeterminedInitialHcaps: race.has_determined_initial_hcaps || false,
            isManualHandicaps: race.is_manual_handicaps || false,
            completed: race.completed || false,
            media: race.media || [],
            livestreamUrl: race.livestream_url || undefined,
            noticeOfRaceUrl: race.notice_of_race_url || undefined,
            sailingInstructionsUrl: race.sailing_instructions_url || undefined,
            isPaid: race.is_paid || false,
            entryFee: race.entry_fee || undefined,
            isInterclub: race.is_interclub || false,
            otherClubId: race.other_club_id || undefined,
            otherClubName: race.other_club_name || undefined,
            multiDay: race.multi_day || false,
            numberOfDays: race.number_of_days || 1,
            endDate: race.end_date || undefined,
            dayResults: race.day_results || {},
            currentDay: race.current_day || 1,
            heatManagement: race.heat_management || undefined,
            numRaces: race.num_races || undefined,
            dropRules: race.drop_rules || undefined,
            clubId: race.club_id || currentClubId,
            publicEventId: race.public_event_id || undefined,
            show_flag: race.show_flag ?? true,
            show_country: race.show_country ?? true,
            show_club_state: race.show_club_state ?? false,
            show_design: race.show_design ?? false,
            show_category: race.show_category ?? false,
            showFlag: race.show_flag ?? true,
            showCountry: race.show_country ?? true,
            showClubState: race.show_club_state ?? false,
            showDesign: race.show_design ?? false,
            showCategory: race.show_category ?? false,
            enable_observers: race.enable_observers || false,
            observers_per_heat: race.observers_per_heat || undefined,
            enableLiveTracking: race.enable_live_tracking || false,
            enableLiveStream: race.enable_livestream || false
          } as any;

          console.log(`🔍 [raceStorage] Loading event "${race.event_name}":`, {
            show_flag: race.show_flag,
            show_country: race.show_country,
            show_club_state: race.show_club_state,
            show_category: race.show_category
          });

          return raceEvent;
        });

        console.log('✅ Fetched', events.length, 'events from Supabase');

        // Get current cached event IDs
        const cachedIds = new Set(cachedEvents.map(e => e.id));
        const fetchedIds = new Set(events.map(e => e.id));

        // Delete events that are in cache but not in fetched data (they were deleted)
        for (const cachedEvent of cachedEvents) {
          if (!fetchedIds.has(cachedEvent.id)) {
            console.log('🗑️ Removing deleted event from cache:', cachedEvent.id);
            await offlineStorage.deleteEvent(cachedEvent.id, true);
          }
        }

        // Cache events in IndexedDB for offline use (skip sync since they're from Supabase)
        for (const event of events) {
          await offlineStorage.saveEvent(event, true);
        }

        return events;
      } catch (supabaseError) {
        console.warn('🔴 Supabase fetch failed or timed out, using cached data:', supabaseError);
        // Return cached data on error or timeout
        return cachedEvents;
      }
    }

    // Offline mode - use cached data
    console.log('📴 Offline mode: using', cachedEvents.length, 'cached events');
    return cachedEvents;

  } catch (error) {
    console.error('Error in getStoredRaceEvents:', error);
    // Last resort fallback
    try {
      const currentClubId = localStorage.getItem('currentClubId');
      if (currentClubId) {
        return await offlineStorage.getEvents(currentClubId);
      }
    } catch (fallbackError) {
      console.error('Fallback also failed:', fallbackError);
    }
    return [];
  }
};

// Store race events
export const storeRaceEvents = async (events: RaceEvent[]): Promise<void> => {
  try {
    localStorage.setItem(RACE_EVENTS_KEY, JSON.stringify(events));
  } catch (error) {
    console.error('Error storing race events:', error);
  }
};

// Store a single race event - OFFLINE-FIRST
export const storeRaceEvent = async (event: RaceEvent): Promise<void> => {
  try {
    // Get current club from localStorage
    const currentClubId = localStorage.getItem('currentClubId');
    if (!currentClubId) {
      console.warn('No club selected, cannot store event');
      return;
    }

    // Ensure the event has the club ID
    event.clubId = event.clubId || currentClubId;

    // Always save to IndexedDB first (offline-first)
    await offlineStorage.saveEvent(event);
    console.log('✅ Event saved to offline storage:', event.id);

    // If online, also try to save to Supabase immediately
    if (offlineStorage.getOnlineStatus()) {
      try {
      // For public events, create a local copy with a new ID
      let eventId = event.id;
      if (event.isPublicEvent) {
        eventId = `${currentClubId}-public-${event.id}`;
        event.isPublicEvent = false; // Mark as local copy
      }

      const { error } = await supabase
        .from('quick_races')
        .upsert({
          id: eventId,
          event_name: event.eventName,
          club_name: event.clubName,
          race_date: event.date,
          race_venue: event.venue,
          race_class: event.raceClass,
          race_format: event.raceFormat,
          skippers: event.skippers || [],
          race_results: event.raceResults || [],
          last_completed_race: event.lastCompletedRace || 0,
          has_determined_initial_hcaps: event.hasDeterminedInitialHcaps || false,
          is_manual_handicaps: event.isManualHandicaps || false,
          completed: event.completed || false,
          media: event.media || [],
          livestream_url: event.livestreamUrl,
          notice_of_race_url: event.noticeOfRaceUrl,
          sailing_instructions_url: event.sailingInstructionsUrl,
          is_paid: event.isPaid || false,
          entry_fee: event.entryFee,
          is_interclub: event.isInterclub || false,
          other_club_id: event.otherClubId,
          other_club_name: event.otherClubName,
          multi_day: event.multiDay || false,
          number_of_days: event.numberOfDays || 1,
          end_date: event.endDate,
          day_results: event.dayResults || {},
          current_day: event.currentDay || 1,
          heat_management: event.heatManagement,
          num_races: event.numRaces,
          drop_rules: Array.isArray(event.dropRules) ? event.dropRules : [4, 8, 16, 24, 32, 40], // Default to RRS - Appendix A
          club_id: event.clubId,
          // Display settings for results table
          show_flag: (event as any).showFlag ?? (event as any).show_flag ?? true,
          show_country: (event as any).showCountry ?? (event as any).show_country ?? true,
          show_club_state: (event as any).showClubState ?? (event as any).show_club_state ?? false,
          show_design: (event as any).showDesign ?? (event as any).show_design ?? false,
          show_category: (event as any).showCategory ?? (event as any).show_category ?? false,
          // Live tracking and streaming
          enable_live_tracking: (event as any).enableLiveTracking || false,
          enable_livestream: (event as any).enableLiveStream || false,
          // Observer settings
          enable_observers: (event as any).enable_observers || false,
          observers_per_heat: (event as any).observers_per_heat || undefined
        });

      if (error) {
        console.error('Error storing event in Supabase:', error);
        throw error;
      }

      console.log('Event stored in Supabase successfully');
      } catch (supabaseError) {
        console.warn('Supabase save failed, queued for sync:', supabaseError);
        // Error is logged, but event is already in IndexedDB and sync queue
      }
    }
  } catch (error) {
    console.error('Error in storeRaceEvent:', error);
  }
};

// Delete a race event
export const archiveRaceEvent = async (id: string): Promise<boolean> => {
  try {
    // Get current club from localStorage
    const currentClubId = localStorage.getItem('currentClubId');
    if (!currentClubId) {
      console.warn('No club selected, cannot archive event');
      return false;
    }

    // Archive in quick_races
    const { error: quickRaceError } = await supabase
      .from('quick_races')
      .update({ archived: true })
      .eq('id', id)
      .eq('club_id', currentClubId);

    if (quickRaceError) {
      console.error('Error archiving quick race:', quickRaceError);
      throw quickRaceError;
    }

    // Also archive in public_events if it exists
    const { data: quickRace } = await supabase
      .from('quick_races')
      .select('public_event_id')
      .eq('id', id)
      .single();

    if (quickRace?.public_event_id) {
      const { error: publicEventError } = await supabase
        .from('public_events')
        .update({ archived: true })
        .eq('id', quickRace.public_event_id);

      if (publicEventError) {
        console.error('Error archiving public event:', publicEventError);
      }
    }

    // Update IndexedDB
    await offlineStorage.deleteEvent(id, true);

    console.log('Event archived successfully');
    return true;
  } catch (error) {
    console.error('Error in archiveRaceEvent:', error);
    return false;
  }
};

export const deleteRaceEvent = async (id: string): Promise<boolean> => {
  try {
    // Get current club from localStorage
    const currentClubId = localStorage.getItem('currentClubId');
    if (!currentClubId) {
      console.warn('No club selected, cannot delete event');
      return false;
    }

    // Try to delete from Supabase first
    try {
      // IMPORTANT: Get the public_event_id BEFORE deleting anything
      const { data: quickRace, error: fetchError } = await supabase
        .from('quick_races')
        .select('public_event_id')
        .eq('id', id)
        .eq('club_id', currentClubId)
        .maybeSingle();

      if (fetchError) {
        console.error('[deleteRaceEvent] Error fetching event for deletion:', fetchError);
        throw fetchError;
      }

      const publicEventId = quickRace?.public_event_id;
      console.log('[deleteRaceEvent] Event data:', { id, clubId: currentClubId, publicEventId, hasQuickRace: !!quickRace });

      // Case 1: Event exists in quick_races with a public_event_id
      if (publicEventId) {
        console.log('[deleteRaceEvent] This is a local copy of a public event, deleting from public_events:', publicEventId);

        const { error: publicError } = await supabase
          .from('public_events')
          .delete()
          .eq('id', publicEventId);

        if (publicError) {
          console.error('[deleteRaceEvent] Error deleting public event:', publicError);
          throw publicError;
        }

        console.log('[deleteRaceEvent] Public event deleted successfully - cascade trigger will delete all local copies');
      }
      // Case 2: Event exists in quick_races without a public_event_id (club-only event)
      else if (quickRace) {
        console.log('[deleteRaceEvent] This is a club-only event, deleting from quick_races');

        const { error } = await supabase
          .from('quick_races')
          .delete()
          .eq('id', id)
          .eq('club_id', currentClubId);

        if (error) {
          console.error('[deleteRaceEvent] Error deleting event from quick_races:', error);
          throw error;
        }

        console.log('[deleteRaceEvent] Club event deleted from quick_races successfully');
      }
      // Case 3: Event doesn't exist in quick_races - might be a public event being shown
      else {
        console.log('[deleteRaceEvent] Event not found in quick_races, checking if it is a public event');

        // Check if this ID is actually a public_events ID
        const { data: publicEvent, error: publicFetchError } = await supabase
          .from('public_events')
          .select('id, event_name')
          .eq('id', id)
          .maybeSingle();

        if (publicFetchError) {
          console.error('[deleteRaceEvent] Error checking public_events:', publicFetchError);
          throw publicFetchError;
        }

        if (publicEvent) {
          console.log('[deleteRaceEvent] Found as public event, deleting:', publicEvent);

          const { error: publicError } = await supabase
            .from('public_events')
            .delete()
            .eq('id', id);

          if (publicError) {
            console.error('[deleteRaceEvent] Error deleting public event:', publicError);
            throw publicError;
          }

          console.log('[deleteRaceEvent] Public event deleted successfully - cascade trigger will delete all local copies');
        } else {
          console.error('[deleteRaceEvent] Event not found in quick_races or public_events');
          throw new Error('Event not found');
        }
      }

      // Also delete from IndexedDB (skip sync since we already deleted from Supabase)
      await offlineStorage.deleteEvent(id, true);

      return true;
    } catch (supabaseError) {
      console.warn('Falling back to localStorage for deleting event');

      // Fallback to localStorage
      const events = await getStoredRaceEvents();
      const filteredEvents = events.filter(e => e.id !== id);

      if (events.length === filteredEvents.length) {
        return false; // Event not found
      }

      await storeRaceEvents(filteredEvents);
      return true;
    }
  } catch (error) {
    console.error('Error in deleteRaceEvent:', error);
    return false;
  }
};

// Get stored race series - OFFLINE-FIRST with timeout protection
export const getStoredRaceSeries = async (): Promise<RaceSeries[]> => {
  try {
    // Get current club from localStorage
    const currentClubId = localStorage.getItem('currentClubId');
    if (!currentClubId) {
      console.warn('No club selected, returning empty series list');
      return [];
    }

    // ALWAYS get cached data first from localStorage
    const stored = localStorage.getItem(RACE_SERIES_KEY);
    const cachedSeries: RaceSeries[] = stored ? JSON.parse(stored).filter((s: RaceSeries) => s.clubId === currentClubId) : [];
    console.log('📦 Loaded', cachedSeries.length, 'cached series');

    // Check if online
    const isOnline = offlineStorage.getOnlineStatus();

    if (isOnline) {
      // Try to fetch from Supabase with retry logic
      try {
        const { data, error } = await protectedQuery(
          () => supabase
            .from('race_series')
            .select('*')
            .eq('club_id', currentClubId)
            .order('created_at', { ascending: false }),
          { timeout: QUERY_TIMEOUTS.SLOW, queryName: 'fetch race series' }
        );

        if (error) {
          console.error('Error fetching race series from Supabase:', error);
          throw error;
        }

        // Fetch all rounds from race_series_rounds table with retry
        const { data: roundsData, error: roundsError } = await protectedQuery(
          () => supabase
            .from('race_series_rounds')
            .select('*')
            .eq('club_id', currentClubId)
            .order('round_index', { ascending: true }),
          { timeout: QUERY_TIMEOUTS.SLOW, queryName: 'fetch series rounds' }
        );

        if (roundsError) {
          console.error('Error fetching series rounds:', roundsError);
        }

      // Group rounds by series_id
      const roundsBySeriesId: Record<string, any[]> = {};
      if (roundsData) {
        roundsData.forEach(round => {
          if (!roundsBySeriesId[round.series_id]) {
            roundsBySeriesId[round.series_id] = [];
          }
          roundsBySeriesId[round.series_id].push({
            id: round.id,
            name: round.round_name,
            roundName: round.round_name,
            index: round.round_index,
            date: round.date,
            venue: round.venue,
            raceClass: round.race_class,
            raceFormat: round.race_format,
            skippers: round.skippers || [],
            raceResults: round.race_results || [],
            lastCompletedRace: round.last_completed_race || 0,
            hasDeterminedInitialHcaps: round.has_determined_initial_hcaps || false,
            isManualHandicaps: round.is_manual_handicaps || false,
            completed: round.completed || false,
            cancelled: round.cancelled || false,
            cancellationReason: round.cancellation_reason,
            heatManagement: round.heat_management,
            numRaces: round.num_races || 12,
            dropRules: round.drop_rules || [],
            multiDay: round.multi_day || false,
            numberOfDays: round.number_of_days || 1,
            dayResults: round.day_results || {},
            currentDay: round.current_day || 1,
            averagePointsApplied: round.average_points_applied || {},
            manualScoreOverrides: round.manual_score_overrides || {},
            enableLiveStream: round.enable_livestream || false
          });
        });
      }

      // Transform the data to match our RaceSeries type
      const series: RaceSeries[] = data.map(s => {
        // Merge JSONB rounds with table rounds (table rounds take precedence)
        const jsonbRounds = s.rounds || [];
        const tableRounds = roundsBySeriesId[s.id] || [];

        // Merge both sources: start with JSONB rounds, then overlay table rounds
        // This ensures all rounds are visible, with scored rounds getting updated data from the table
        const mergedRounds = [...jsonbRounds];

        // Overlay table rounds on top of JSONB rounds by matching round name
        tableRounds.forEach(tableRound => {
          const existingIndex = mergedRounds.findIndex(r =>
            r.name === tableRound.name || r.roundName === tableRound.name
          );
          if (existingIndex !== -1) {
            // Update existing round with table data
            mergedRounds[existingIndex] = tableRound;
          } else {
            // Add new round from table if not in JSONB
            mergedRounds.push(tableRound);
          }
        });

        return {
          id: s.id,
          clubName: s.club_name || '',
          seriesName: s.series_name,
          raceClass: s.race_class || '',
          raceFormat: s.race_format,
          rounds: mergedRounds,
          skippers: s.skippers || [],
          results: s.results || [],
          completed: s.completed || false,
          lastCompletedRace: s.last_completed_race || 0,
          hasDeterminedInitialHcaps: s.has_determined_initial_hcaps || false,
          isManualHandicaps: s.is_manual_handicaps || false,
          media: s.media || [],
          livestreamUrl: s.livestream_url || undefined,
          noticeOfRaceUrl: s.notice_of_race_url || undefined,
          sailingInstructionsUrl: s.sailing_instructions_url || undefined,
          isPaid: s.is_paid || false,
          entryFee: s.entry_fee || undefined,
          clubId: s.club_id || currentClubId,
          enableLiveTracking: s.enable_live_tracking || false,
          enableLiveStream: s.enable_livestream || false
        };
      });

      console.log('✅ Fetched', series.length, 'series from Supabase');

      // Cache to localStorage
      const allSeries = stored ? JSON.parse(stored) : [];
      const otherClubSeries = allSeries.filter((s: RaceSeries) => s.clubId !== currentClubId);
      const updatedAllSeries = [...otherClubSeries, ...series];
      localStorage.setItem(RACE_SERIES_KEY, JSON.stringify(updatedAllSeries));

      return series;
    } catch (supabaseError) {
      console.warn('🔴 Supabase series fetch failed or timed out, using cached data:', supabaseError);
      // Return cached data on error or timeout
      return cachedSeries;
    }
    }

    // Offline mode - use cached data
    console.log('📴 Offline mode: using', cachedSeries.length, 'cached series');
    return cachedSeries;

  } catch (error) {
    console.error('Error in getStoredRaceSeries:', error);
    // Last resort fallback
    try {
      const currentClubId = localStorage.getItem('currentClubId');
      if (currentClubId) {
        const stored = localStorage.getItem(RACE_SERIES_KEY);
        if (stored) {
          const series: RaceSeries[] = JSON.parse(stored);
          return series.filter(s => s.clubId === currentClubId);
        }
      }
    } catch (fallbackError) {
      console.error('Fallback also failed:', fallbackError);
    }
    return [];
  }
};

// Store race series array
export const storeRaceSeriesArray = async (series: RaceSeries[]): Promise<void> => {
  try {
    localStorage.setItem(RACE_SERIES_KEY, JSON.stringify(series));
  } catch (error) {
    console.error('Error storing race series:', error);
  }
};

// Store a single race series
export const storeRaceSeries = async (series: RaceSeries): Promise<void> => {
  try {
    // Get current club from localStorage
    const currentClubId = localStorage.getItem('currentClubId');
    if (!currentClubId) {
      console.warn('No club selected, cannot store series');
      return;
    }
    
    // Ensure the series has the club ID
    series.clubId = series.clubId || currentClubId;

    console.log('=== STORING RACE SERIES ===');
    console.log('Current Club ID:', currentClubId);
    console.log('Series Club ID:', series.clubId);
    console.log('Full Series Object:', series);

    // Try to store in Supabase first
    try {
      // Normalize all rounds to use 'results' field for database compatibility
      const normalizedRounds = (series.rounds || []).map(round => {
        const normalized: any = {
          ...round,
          results: round.raceResults || round.results || []
        };
        // Remove fields that came from race_series_rounds table or shouldn't be in JSONB
        delete normalized.raceResults;
        delete normalized.id;
        delete normalized.roundName;
        delete normalized.index;
        return normalized;
      });

      const dataToStore = {
        id: series.id,
        club_name: series.clubName,
        series_name: series.seriesName,
        race_class: series.raceClass,
        race_format: series.raceFormat,
        rounds: normalizedRounds,
        skippers: series.skippers || [],
        results: series.results || [],
        completed: series.completed || false,
        last_completed_race: series.lastCompletedRace || 0,
        has_determined_initial_hcaps: series.hasDeterminedInitialHcaps || false,
        is_manual_handicaps: series.isManualHandicaps || false,
        media: series.media || [],
        livestream_url: series.livestreamUrl,
        notice_of_race_url: series.noticeOfRaceUrl,
        sailing_instructions_url: series.sailingInstructionsUrl,
        is_paid: series.isPaid || false,
        entry_fee: series.entryFee,
        club_id: series.clubId,
        enable_live_tracking: series.enableLiveTracking || false,
        enable_livestream: series.enableLiveStream || false
      };

      console.log('Data being sent to Supabase:', dataToStore);
      console.log('Rounds structure:', JSON.stringify(series.rounds, null, 2));

      const { data, error } = await supabase
        .from('race_series')
        .upsert(dataToStore)
        .select();

      if (error) {
        console.error('=== ERROR STORING SERIES ===');
        console.error('Error details:', error);
        throw error;
      }

      console.log('=== SERIES STORED SUCCESSFULLY ===');
      console.log('Returned data:', data);

      // Sync rounds to race_series_rounds table
      if (series.rounds && series.rounds.length > 0) {
        console.log('=== SYNCING ROUNDS TO race_series_rounds TABLE ===');

        // First, get existing rounds for this series
        const { data: existingRounds } = await supabase
          .from('race_series_rounds')
          .select('id, round_index')
          .eq('series_id', series.id);

        const existingRoundIndices = new Set(existingRounds?.map(r => r.round_index) || []);

        // Prepare rounds for upsert
        const roundsToUpsert = series.rounds.map((round, index) => {
          const roundData: any = {
            series_id: series.id,
            club_id: series.clubId,
            round_name: round.name || `Round ${index + 1}`,
            round_index: index,
            date: round.date,
            venue: round.venue || '',
            race_class: series.raceClass,
            race_format: series.raceFormat,
            skippers: round.skippers || [],
            race_results: round.raceResults || round.results || [],
            last_completed_race: round.lastCompletedRace || 0,
            has_determined_initial_hcaps: round.hasDeterminedInitialHcaps || false,
            is_manual_handicaps: round.isManualHandicaps || false,
            completed: round.completed || false,
            cancelled: round.cancelled || false,
            cancellation_reason: round.cancellationReason || null,
            heat_management: round.heatManagement || null,
            num_races: round.numRaces || 12,
            drop_rules: Array.isArray(round.dropRules) ? round.dropRules : [4, 8, 16, 24, 32, 40], // Default to RRS - Appendix A
            multi_day: round.multiDay || false,
            number_of_days: round.numberOfDays || 1,
            day_results: round.dayResults || null,
            current_day: round.currentDay || 1,
            average_points_applied: round.averagePointsApplied || {},
            manual_score_overrides: round.manualScoreOverrides || {},
            enable_livestream: round.enableLiveStream ?? (series.enableLiveStream || false)
          };

          return roundData;
        });

        // Upsert all rounds
        const { error: roundsError } = await supabase
          .from('race_series_rounds')
          .upsert(roundsToUpsert, {
            onConflict: 'series_id,round_index'
          });

        if (roundsError) {
          console.error('Error syncing rounds:', roundsError);
        } else {
          console.log(`Successfully synced ${roundsToUpsert.length} rounds`);
        }

        // Delete rounds that no longer exist in the series
        const currentRoundIndices = series.rounds.map((_, i) => i);
        const roundsToDelete = existingRounds?.filter(
          r => !currentRoundIndices.includes(r.round_index)
        ) || [];

        if (roundsToDelete.length > 0) {
          const { error: deleteError } = await supabase
            .from('race_series_rounds')
            .delete()
            .in('id', roundsToDelete.map(r => r.id));

          if (deleteError) {
            console.error('Error deleting removed rounds:', deleteError);
          } else {
            console.log(`Deleted ${roundsToDelete.length} removed rounds`);
          }
        }
      }

      console.log('Series stored in Supabase successfully');
    } catch (supabaseError) {
      console.warn('Falling back to localStorage for storing series');
      
      // Fallback to localStorage
      const allSeries = await getStoredRaceSeries();
      const existingIndex = allSeries.findIndex(s => s.id === series.id);
      
      if (existingIndex !== -1) {
        allSeries[existingIndex] = series;
      } else {
        allSeries.push(series);
      }
      
      await storeRaceSeriesArray(allSeries);
    }
  } catch (error) {
    console.error('Error in storeRaceSeries:', error);
  }
};

// Delete a race series
export const deleteRaceSeries = async (id: string): Promise<boolean> => {
  try {
    // Get current club from localStorage
    const currentClubId = localStorage.getItem('currentClubId');
    if (!currentClubId) {
      console.warn('No club selected, cannot delete series');
      return false;
    }
    
    // Try to delete from Supabase first
    try {
      const { error } = await supabase
        .from('race_series')
        .delete()
        .eq('id', id)
        .eq('club_id', currentClubId);
      
      if (error) {
        console.error('Error deleting series from Supabase:', error);
        throw error;
      }
      
      console.log('Series deleted from Supabase successfully');
      return true;
    } catch (supabaseError) {
      console.warn('Falling back to localStorage for deleting series');
      
      // Fallback to localStorage
      const allSeries = await getStoredRaceSeries();
      const filteredSeries = allSeries.filter(s => s.id !== id);
      
      if (allSeries.length === filteredSeries.length) {
        return false; // Series not found
      }
      
      await storeRaceSeriesArray(filteredSeries);
      return true;
    }
  } catch (error) {
    console.error('Error in deleteRaceSeries:', error);
    return false;
  }
};

// Get current event
export const getCurrentEvent = (): RaceEvent | null => {
  try {
    const eventJson = localStorage.getItem(CURRENT_EVENT_KEY);
    if (!eventJson) {
      console.log('📋 No current event in localStorage');
      return null;
    }

    const event = JSON.parse(eventJson);

    // Ensure dayResults is properly initialized for multi-day events
    if (event.multiDay && event.numberOfDays > 1 && !event.dayResults) {
      event.dayResults = {};
    }

    // Ensure dayResults is an object, not an array
    if (event.dayResults && Array.isArray(event.dayResults)) {
      const fixedDayResults = {};
      event.dayResults.forEach((dayData, index) => {
        if (dayData) {
          fixedDayResults[index + 1] = dayData;
        }
      });
      event.dayResults = fixedDayResults;
    }

    console.log('📖 [getCurrentEvent] Returning event:', {
      eventName: event.eventName,
      skippersCount: event.skippers?.length || 0,
      firstSkipper: event.skippers?.[0] || null,
      lastCompletedRace: event.lastCompletedRace
    });

    return event;
  } catch (error) {
    console.error('❌ CRITICAL: Error getting current event:', error);
    console.error('This could cause the scoring session to terminate!');
    console.error('Error details:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    return null;
  }
};

// Set current event
export const setCurrentEvent = (event: RaceEvent): void => {
  try {
    console.log('💾 [setCurrentEvent] Saving event:', {
      eventName: event.eventName,
      skippersCount: event.skippers?.length || 0,
      firstSkipper: event.skippers?.[0] || null,
      lastCompletedRace: event.lastCompletedRace,
      enable_observers: event.enable_observers,
      observers_per_heat: event.observers_per_heat
    });
    localStorage.setItem(CURRENT_EVENT_KEY, JSON.stringify(event));

    // Verify what was actually saved
    const saved = localStorage.getItem(CURRENT_EVENT_KEY);
    const parsed = saved ? JSON.parse(saved) : null;
    console.log('💾 [setCurrentEvent] Verified saved data:', {
      skippersCount: parsed?.skippers?.length || 0,
      hasSkippers: !!parsed?.skippers,
      isArray: Array.isArray(parsed?.skippers),
      enable_observers: parsed?.enable_observers,
      observers_per_heat: parsed?.observers_per_heat
    });
  } catch (error) {
    console.error('Error setting current event:', error);
  }
};

/**
 * Reload the current event from the database to pick up any changes
 * This is useful after saving settings that update database fields
 */
export const reloadCurrentEventFromDatabase = async (): Promise<RaceEvent | null> => {
  try {
    const currentEvent = getCurrentEvent();
    if (!currentEvent || !currentEvent.id) {
      console.warn('⚠️ No current event to reload');
      return null;
    }

    // Use the club_id from the current event
    const currentClubId = currentEvent.clubId || currentEvent.club_id;
    if (!currentClubId) {
      console.error('❌ No club ID found in current event');
      return null;
    }

    console.log('🔄 Reloading event from database:', currentEvent.id);

    const { data, error } = await supabase
      .from('quick_races')
      .select('*')
      .eq('id', currentEvent.id)
      .eq('club_id', currentClubId)
      .single();

    if (error) {
      console.error('❌ Error reloading event:', error);
      return null;
    }

    if (!data) {
      console.warn('⚠️ Event not found in database');
      return null;
    }

    // Convert database format back to RaceEvent format
    const reloadedEvent: RaceEvent = {
      ...currentEvent, // Keep existing in-memory data
      ...data, // Overlay with fresh database data
      eventName: data.event_name,
      clubName: data.club_name || currentEvent.clubName,
      date: data.race_date,
      endDate: data.end_date,
      venue: data.race_venue,
      raceClass: data.race_class,
      raceFormat: data.race_format,
      skippers: data.skippers || currentEvent.skippers || [],
      raceResults: data.race_results || currentEvent.raceResults || [],
      lastCompletedRace: data.last_completed_race || 0,
      hasDeterminedInitialHcaps: data.has_determined_initial_hcaps || false,
      isManualHandicaps: data.is_manual_handicaps || false,
      completed: data.completed || false,
      multiDay: data.multi_day || false,
      numberOfDays: data.number_of_days || 1,
      dayResults: data.day_results || currentEvent.dayResults || {},
      currentDay: data.current_day || 1,
      heatManagement: data.heat_management || currentEvent.heatManagement || null,
      numRaces: data.num_races || 12,
      dropRules: data.drop_rules || [4, 8, 16, 24, 32, 40],
      show_flag: data.show_flag,
      show_country: data.show_country,
      enable_observers: data.enable_observers,
      observers_per_heat: data.observers_per_heat,
      enable_livestream: data.enable_livestream
    };

    console.log('✅ Event reloaded successfully:', {
      eventName: reloadedEvent.eventName,
      enable_observers: reloadedEvent.enable_observers,
      observers_per_heat: reloadedEvent.observers_per_heat,
      heatManagement: reloadedEvent.heatManagement,
      scoringSystem: reloadedEvent.heatManagement?.configuration?.scoringSystem,
      dropRules: reloadedEvent.dropRules
    });

    // Update localStorage with fresh data
    setCurrentEvent(reloadedEvent);

    return reloadedEvent;
  } catch (error) {
    console.error('❌ Error reloading event from database:', error);
    return null;
  }
};

// Clear current event
export const clearCurrentEvent = (): void => {
  try {
    localStorage.removeItem(CURRENT_EVENT_KEY);
  } catch (error) {
    console.error('Error clearing current event:', error);
  }
};

// Update event results
export const updateEventResults = async (
  eventId: string,
  raceResults: any[],
  skippers: Skipper[],
  lastCompletedRace: number,
  hasDeterminedInitialHcaps: boolean,
  isManualHandicaps: boolean,
  completed: boolean = false,
  currentDay: number = 1,
  heatManagement: HeatManagement | null = null,
  numRaces: number = 12,
  dropRules: number[] = [],
  dayResults?: Record<number, any>
): Promise<void> => {
  console.log('updateEventResults called with:', {
    eventId,
    raceResults: raceResults.length,
    skippers: skippers.length,
    lastCompletedRace,
    hasDeterminedInitialHcaps,
    isManualHandicaps,
    completed,
    currentDay,
    heatManagement: !!heatManagement
  });
  
  try {
    // Get current club from localStorage
    const currentClubId = localStorage.getItem('currentClubId');
    if (!currentClubId) {
      console.error('❌ No club selected, cannot update event results');
      throw new Error('No club selected');
    }

    // Get the current event
    const currentEvent = getCurrentEvent();
    if (!currentEvent) {
      console.error('❌ No current event found');
      throw new Error('No current event found');
    }

    if (currentEvent.id !== eventId && (!currentEvent.seriesId || currentEvent.seriesId !== eventId)) {
      console.error('❌ Event ID mismatch:', {
        expectedId: eventId,
        currentEventId: currentEvent.id,
        currentEventSeriesId: currentEvent.seriesId
      });
      throw new Error(`Event not found: ${eventId}`);
    }
    
    console.log('Found event:', currentEvent.eventName, 'multiDay:', currentEvent.multiDay);
    
    console.log('Updating event results:', {
      eventId,
      raceResultsLength: raceResults.length,
      skippersLength: skippers.length,
      lastCompletedRace,
      hasDeterminedInitialHcaps,
      isManualHandicaps,
      completed,
      currentDay,
      heatManagement: heatManagement ? 'present' : 'null',
      numRaces,
      dropRules
    });
    
    // Update the event
    const updatedEvent: RaceEvent = {
      ...currentEvent,
      skippers,
      completed,
      currentDay,
      heatManagement: heatManagement || undefined,
      numRaces,
      dropRules
    };

    // For multi-day events, store results in dayResults ONLY (not in raceResults)
    if (updatedEvent.multiDay) {
      console.log('Updating multi-day event for day:', currentDay);

      // Use provided dayResults if available, otherwise use existing from event
      const eventDayResults = dayResults || updatedEvent.dayResults || {};

      console.log(`Updating day ${currentDay} results:`, {
        raceResults,
        lastCompletedRace,
        hasDeterminedInitialHcaps,
        isManualHandicaps,
        heatManagement,
        providedDayResults: !!dayResults
      });

      // If dayResults were provided (e.g., from handleCompleteScoring), use them directly
      // Otherwise, preserve existing day data and merge with new results
      if (dayResults) {
        // Use the complete dayResults object as provided
        updatedEvent.dayResults = dayResults;
      } else {
        // Preserve existing day data (especially dayCompleted flag) and merge with new results
        eventDayResults[currentDay] = {
          ...(eventDayResults[currentDay] || {}), // Preserve existing properties like dayCompleted
          raceResults,
          lastCompletedRace: lastCompletedRace,
          hasDeterminedInitialHcaps,
          isManualHandicaps,
          heatManagement
        };
        updatedEvent.dayResults = eventDayResults;
      }

      // For multi-day events, do NOT store combined results in raceResults field
      // They should ONLY be in dayResults to prevent duplication issues
      updatedEvent.raceResults = [];
      updatedEvent.lastCompletedRace = 0;
      updatedEvent.hasDeterminedInitialHcaps = false;
      updatedEvent.isManualHandicaps = false;

      console.log('Updated day results:', updatedEvent.dayResults[currentDay]);

      // Only mark event as complete if explicitly requested via the completed parameter
      // Don't auto-complete just because all days have some results - the user must explicitly complete
      // Check if all days have the dayCompleted flag set to true
      if (completed) {
        // If the caller explicitly requested completion, respect that
        updatedEvent.completed = true;
      } else {
        // Otherwise, check if all days are explicitly marked as completed
        const totalDays = updatedEvent.numberOfDays || 1;
        let allDaysCompleted = true;

        for (let day = 1; day <= totalDays; day++) {
          const dayData = updatedEvent.dayResults[day];
          // A day is only considered completed if it has the dayCompleted flag set
          if (!dayData || dayData.dayCompleted !== true) {
            allDaysCompleted = false;
            break;
          }
        }

        updatedEvent.completed = allDaysCompleted;
      }
      console.log('Event completion status:', updatedEvent.completed);
    } else {
      // For single-day events, store results normally
      console.log('Updating single-day event');
      updatedEvent.raceResults = raceResults;
      updatedEvent.lastCompletedRace = lastCompletedRace;
      updatedEvent.hasDeterminedInitialHcaps = hasDeterminedInitialHcaps;
      updatedEvent.isManualHandicaps = isManualHandicaps;
    }
    
    // Update the current event in localStorage
    setCurrentEvent(updatedEvent);
    console.log('Saved event to localStorage:', updatedEvent);

    // ALWAYS save to IndexedDB (offline-first)
    await offlineStorage.saveEvent(updatedEvent);
    console.log('✅ Event saved to IndexedDB:', updatedEvent.id);

    // Declare actualEventId in outer scope so it's available in catch block
    let actualEventId = eventId;

    // Try to update in Supabase if online
    try {
      // Prepare the update data with explicit field mapping
      const updateData = {
        skippers: skippers,
        race_results: raceResults,
        last_completed_race: lastCompletedRace,
        has_determined_initial_hcaps: hasDeterminedInitialHcaps,
        is_manual_handicaps: isManualHandicaps,
        completed: completed,
        current_day: currentDay,
        heat_management: heatManagement
      };
      
      // For series rounds, update in race_series_rounds table
      if (updatedEvent.isSeriesEvent && updatedEvent.seriesId && updatedEvent.roundName) {
        console.log('[saveEventResults] Updating series round in race_series_rounds table:', {
          seriesId: updatedEvent.seriesId,
          roundName: updatedEvent.roundName
        });

        // Check if round already exists in race_series_rounds table
        const { data: existingRound, error: fetchError } = await supabase
          .from('race_series_rounds')
          .select('id, round_index')
          .eq('series_id', updatedEvent.seriesId)
          .eq('round_name', updatedEvent.roundName)
          .eq('club_id', currentClubId)
          .maybeSingle();

        if (fetchError) {
          console.error('Error fetching series round:', fetchError);
          throw fetchError;
        }

        // Prepare round data based on whether it's multi-day or single-day
        const roundData: any = {
          series_id: updatedEvent.seriesId,
          club_id: currentClubId,
          round_name: updatedEvent.roundName,
          date: updatedEvent.date,
          venue: updatedEvent.venue,
          race_class: updatedEvent.raceClass,
          race_format: updatedEvent.raceFormat,
          skippers: skippers,
          completed: completed,
          heat_management: heatManagement,
          num_races: numRaces,
          drop_rules: Array.isArray(dropRules) ? dropRules : [4, 8, 16, 24, 32, 40], // Default to RRS - Appendix A
          multi_day: updatedEvent.multiDay || false,
          number_of_days: updatedEvent.numberOfDays || 1,
          current_day: currentDay
        };

        // For multi-day series rounds, store results in day_results ONLY
        if (updatedEvent.multiDay) {
          console.log('[saveEventResults] Multi-day series round - storing in day_results');
          roundData.day_results = dayResults || updatedEvent.dayResults || {};
          roundData.race_results = []; // Empty for multi-day
          roundData.last_completed_race = 0;
          roundData.has_determined_initial_hcaps = false;
          roundData.is_manual_handicaps = false;
        } else {
          // For single-day series rounds, store results normally
          console.log('[saveEventResults] Single-day series round - storing in race_results');
          console.log('[saveEventResults] raceResults parameter:', raceResults);
          console.log('[saveEventResults] raceResults length:', raceResults?.length);
          console.log('[saveEventResults] lastCompletedRace:', lastCompletedRace);
          roundData.race_results = raceResults;
          roundData.last_completed_race = lastCompletedRace;
          roundData.has_determined_initial_hcaps = hasDeterminedInitialHcaps;
          roundData.is_manual_handicaps = isManualHandicaps;
          roundData.day_results = null;
          console.log('[saveEventResults] roundData.race_results after assignment:', roundData.race_results?.length);
        }

        if (existingRound) {
          // Update existing round
          console.log('[saveEventResults] About to update round with data:', {
            id: existingRound.id,
            skippers: roundData.skippers?.length || 0,
            raceResults: roundData.race_results?.length || 0,
            lastCompletedRace: roundData.last_completed_race,
            completed: roundData.completed
          });

          const { error: updateError } = await supabase
            .from('race_series_rounds')
            .update(roundData)
            .eq('id', existingRound.id);

          if (updateError) {
            console.error('Error updating series round:', updateError);
            throw updateError;
          }

          console.log('[saveEventResults] Updated existing series round');
        } else {
          // Create new round - need to determine round_index
          // Get max round_index for this series and add 1
          const { data: maxIndexData } = await supabase
            .from('race_series_rounds')
            .select('round_index')
            .eq('series_id', updatedEvent.seriesId)
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
            throw insertError;
          }

          console.log('[saveEventResults] Created new series round with index:', nextIndex);
        }

        console.log('[saveEventResults] Series round saved to race_series_rounds table successfully');
        return; // Exit early for series rounds
      }

      // For public events, create a local copy in quick_races so scoring persists in database
      actualEventId = eventId; // Use existing variable from outer scope
      let originalPublicEventId: string | null = null;

      if (updatedEvent.isPublicEvent) {
        // Store the original public event ID before we change anything
        originalPublicEventId = eventId;

        // Check if we already have a local copy for this public event
        const { data: existingCopies } = await supabase
          .from('quick_races')
          .select('id, public_event_id')
          .eq('club_id', currentClubId)
          .eq('public_event_id', eventId)
          .limit(1);

        if (existingCopies && existingCopies.length > 0) {
          // Use existing local copy
          actualEventId = existingCopies[0].id;
          console.log('[saveEventResults] Using existing local copy:', actualEventId);
        } else {
          // Create new local copy with a fresh UUID
          const { v4: uuidv4 } = await import('uuid');
          const newLocalId = uuidv4();

          console.log('[saveEventResults] Creating new local copy for public event:', newLocalId, 'Original:', originalPublicEventId);

          const { error: insertError } = await supabase
            .from('quick_races')
            .insert({
              id: newLocalId,
              club_id: currentClubId,
              public_event_id: originalPublicEventId, // Track the original public event
              event_name: updatedEvent.eventName,
              club_name: updatedEvent.clubName,
              race_date: updatedEvent.date,
              end_date: updatedEvent.endDate,
              race_venue: updatedEvent.venue,
              race_class: updatedEvent.raceClass,
              race_format: updatedEvent.raceFormat,
              multi_day: updatedEvent.multiDay || false,
              number_of_days: updatedEvent.numberOfDays || 1,
              is_paid: updatedEvent.isPaid || false,
              entry_fee: updatedEvent.entryFee,
              notice_of_race_url: updatedEvent.noticeOfRaceUrl,
              sailing_instructions_url: updatedEvent.sailingInstructionsUrl,
              is_interclub: updatedEvent.isInterclub || false,
              other_club_name: updatedEvent.otherClubName,
              media: updatedEvent.media || [],
              skippers: skippers,
              race_results: [],
              last_completed_race: 0,
              has_determined_initial_hcaps: false,
              is_manual_handicaps: false,
              completed: false,
              heat_management: heatManagement,
              num_races: numRaces,
              drop_rules: Array.isArray(dropRules) ? dropRules : [4, 8, 16, 24, 32, 40] // Default to RRS - Appendix A
            });

          if (insertError) {
            console.error('[saveEventResults] Error creating local copy:', insertError);
            throw insertError;
          }

          actualEventId = newLocalId;
          console.log('[saveEventResults] Created local copy successfully:', actualEventId);
        }

        // Update the event object to use local copy ID
        updatedEvent.id = actualEventId;
        updatedEvent.isPublicEvent = false; // Now it's a local event
        setCurrentEvent(updatedEvent); // Update localStorage with new ID
      }

      // For multi-day events, include dayResults
      if (updatedEvent.multiDay) {
        updateData['day_results'] = updatedEvent.dayResults;

        const updatePayload = {
          skippers: skippers, // Save skippers for multi-day events
          day_results: updatedEvent.dayResults,
          current_day: currentDay,
          completed: updatedEvent.completed,
          heat_management: heatManagement,
          num_races: numRaces,
          drop_rules: Array.isArray(dropRules) ? dropRules : [4, 8, 16, 24, 32, 40], // Default to RRS - Appendix A
          // Preserve observer settings
          enable_observers: updatedEvent.enable_observers,
          observers_per_heat: updatedEvent.observers_per_heat
        };

        console.log('📤 Updating multi-day event in database:', {
          eventId: actualEventId,
          clubId: currentClubId,
          skippersCount: skippers.length,
          currentDay,
          completed: updatedEvent.completed,
          dayResultsKeys: Object.keys(updatedEvent.dayResults || {}),
          heatManagement: !!heatManagement
        });

        const { error } = await supabase
          .from('quick_races')
          .update(updatePayload)
          .eq('id', actualEventId)
          .eq('club_id', currentClubId);

        if (error) {
          console.error('❌ Error updating multi-day event in Supabase:', error);
          console.error('Update payload was:', JSON.stringify(updatePayload, null, 2));
          throw error;
        }
      } else {
        const updatePayload = {
          race_results: raceResults,
          skippers,
          last_completed_race: lastCompletedRace,
          has_determined_initial_hcaps: hasDeterminedInitialHcaps,
          is_manual_handicaps: isManualHandicaps,
          completed,
          heat_management: heatManagement,
          num_races: numRaces,
          drop_rules: Array.isArray(dropRules) ? dropRules : [4, 8, 16, 24, 32, 40], // Default to RRS - Appendix A
          // Preserve observer settings
          enable_observers: updatedEvent.enable_observers,
          observers_per_heat: updatedEvent.observers_per_heat
        };

        console.log('📤 Updating single-day event in database:', {
          eventId: actualEventId,
          clubId: currentClubId,
          raceResultsCount: raceResults.length,
          skippersCount: skippers.length,
          lastCompletedRace,
          completed,
          heatManagement: !!heatManagement
        });

        const { error } = await supabase
          .from('quick_races')
          .update(updatePayload)
          .eq('id', actualEventId)
          .eq('club_id', currentClubId);

        if (error) {
          console.error('❌ Error updating single-day event in Supabase:', error);
          console.error('Update payload was:', JSON.stringify(updatePayload, null, 2));
          throw error;
        }
      }
      
      console.log('✅ Event results updated in Supabase successfully');
    } catch (supabaseError) {
      console.error('❌ CRITICAL: Failed to save to Supabase:', supabaseError);
      console.error('Error details:', {
        error: supabaseError,
        eventId: actualEventId,
        clubId: currentClubId,
        isMultiDay: updatedEvent.multiDay
      });

      // IMPORTANT: Re-throw the error instead of silently falling back
      // This ensures the UI knows the save failed and can retry
      throw new Error(`Failed to save to database: ${supabaseError instanceof Error ? supabaseError.message : String(supabaseError)}`);
    }
    
    console.log('Event saved successfully');
  } catch (error) {
    console.error('Error in updateEventResults:', error);
    throw error; // Re-throw to allow caller to handle
  }
};

/**
 * Combines all day results into a single array of race results
 * @param event The race event containing day results
 * @returns Combined array of race results from all days
 */
export const combineAllDayResults = (event: RaceEvent): any[] => {
  if (!event.multiDay || !event.dayResults) {
    return event.raceResults || [];
  }

  let combinedResults: any[] = [];
  const totalDays = event.numberOfDays || 1;
  let cumulativeRaceCount = 0;

  // Iterate through each day and add its results to the combined array
  for (let day = 1; day <= totalDays; day++) {
    const dayData = event.dayResults[day];
    if (dayData && dayData.raceResults && dayData.raceResults.length > 0) {
      // For each race result, adjust the race number based on actual races completed in previous days
      // This ensures race numbers continue sequentially (e.g., if day 1 had races 1-4, day 2 starts at 5)
      const results = dayData.raceResults;
      const adjustedResults = results.map(result => {
        const absoluteRaceNumber = cumulativeRaceCount + result.race;
        return {
          ...result,
          race: absoluteRaceNumber,
          originalDay: day,
          originalRace: result.race
        };
      });

      combinedResults = [...combinedResults, ...adjustedResults];

      // Update cumulative count with the actual number of races completed this day
      cumulativeRaceCount += dayData.lastCompletedRace || 0;
    }
  }

  return combinedResults;
};

/**
 * Cleans and validates series data for Supabase storage
 * @param seriesData The race series data to clean
 * @returns Cleaned series data
 */
export const cleanSeriesDataForSupabase = (seriesData: any): any => {
  // Validate and clean the rounds data
  let cleanedRounds = [];
  if (Array.isArray(seriesData.rounds)) {
    cleanedRounds = seriesData.rounds
      .filter((round: any) => round && typeof round === 'object')
      .map((round: any) => ({
        name: String(round.name || ''),
        date: String(round.date || ''),
        venue: String(round.venue || ''),
        completed: Boolean(round.completed),
        cancelled: Boolean(round.cancelled),
        results: Array.isArray(round.results) ? round.results
          .filter(result => result && typeof result === 'object')
          .map(result => ({
            skipperIndex: Number(result.skipperIndex) || 0,
            position: result.position !== null && result.position !== undefined ? Number(result.position) : null,
            race: Number(result.race) || 1,
            handicap: Number(result.handicap) || 0,
            adjustedHcap: Number(result.adjustedHcap) || 0,
            letterScore: result.letterScore || null
          })) : []
      }));
  }

  // Clean and validate the data structure to match database expectations
  const cleanedSeriesData = {
    club_id: seriesData.clubId,
    club_name: seriesData.clubName,
    series_name: seriesData.seriesName,
    race_class: seriesData.raceClass,
    race_format: seriesData.raceFormat,
    completed: Boolean(seriesData.completed),
    last_completed_race: Number(seriesData.lastCompletedRace) || 0,
    has_determined_initial_hcaps: Boolean(seriesData.hasDeterminedInitialHcaps),
    is_manual_handicaps: Boolean(seriesData.isManualHandicaps),
    skippers: Array.isArray(seriesData.skippers) ? seriesData.skippers : [],
    rounds: Array.isArray(seriesData.rounds) ? seriesData.rounds.map(round => ({
      name: String(round.name || ''),
      date: String(round.date || ''),
      venue: String(round.venue || ''),
      completed: Boolean(round.completed),
      cancelled: Boolean(round.cancelled),
      results: Array.isArray(round.results) ? round.results
        .filter(result => result && typeof result === 'object')
        .map(result => ({
          skipperIndex: Number(result.skipperIndex) || 0,
          position: result.position !== null && result.position !== undefined ? Number(result.position) : null,
          race: Number(result.race) || 1,
          handicap: Number(result.handicap) || 0,
          adjustedHcap: Number(result.adjustedHcap) || 0,
          letterScore: result.letterScore || null
        })) : []
    })) : [],
    results: Array.isArray(seriesData.results) ? seriesData.results
      .filter(result => result && typeof result === 'object')
      .map(result => ({
        skipperIndex: Number(result.skipperIndex) || 0,
        position: result.position !== null && result.position !== undefined ? Number(result.position) : null,
        race: Number(result.race) || 1,
        handicap: Number(result.handicap) || 0,
        adjustedHcap: Number(result.adjustedHcap) || 0,
        letterScore: result.letterScore || null
      })) : []
  };

  console.log('Cleaned series data for Supabase:', cleanedSeriesData);

  return cleanedSeriesData;
};

/**
 * Calculates the overall last completed race across all days
 * @param event The race event containing day results
 * @returns The highest race number completed across all days
 */
export const calculateOverallLastCompletedRace = (event: RaceEvent): number => {
  if (!event.multiDay || !event.dayResults) {
    return event.lastCompletedRace || 0;
  }

  let overallLastCompleted = 0;
  const totalDays = event.numberOfDays || 1;

  for (let day = 1; day <= totalDays; day++) {
    const dayData = event.dayResults[day];
    if (dayData && dayData.lastCompletedRace) {
      // Add this day's completed races to the cumulative total
      overallLastCompleted += dayData.lastCompletedRace;
    }
  }

  return overallLastCompleted;
};

// Update event media
export const updateEventMedia = async (
  eventId: string,
  media: any[]
): Promise<void> => {
  try {
    // Get current club from localStorage
    const currentClubId = localStorage.getItem('currentClubId');
    if (!currentClubId) {
      console.warn('No club selected, cannot update event media');
      return;
    }
    
    // Try to update in Supabase
    try {
      const { error } = await supabase
        .from('quick_races')
        .update({
          media
        })
        .eq('id', eventId)
        .eq('club_id', currentClubId);
      
      if (error) {
        console.error('Error updating event media in Supabase:', error);
        console.error('Supabase error details:', error);
        throw error;
      }
      
      console.log('Event media updated in Supabase successfully');
      
      // Also update the current event if it matches
      const currentEvent = getCurrentEvent();
      if (currentEvent && currentEvent.id === eventId) {
        setCurrentEvent({
          ...currentEvent,
          media
        });
      }
    } catch (supabaseError) {
      console.warn('Falling back to localStorage for updating event media');
      
      // Fallback to localStorage
      const events = await getStoredRaceEvents();
      const existingIndex = events.findIndex(e => e.id === eventId);
      
      if (existingIndex !== -1) {
        events[existingIndex] = {
          ...events[existingIndex],
          media
        };
        await storeRaceEvents(events);
        
        // Also update the current event if it matches
        const currentEvent = getCurrentEvent();
        if (currentEvent && currentEvent.id === eventId) {
          setCurrentEvent({
            ...currentEvent,
            media
          });
        }
      }
    }
  } catch (error) {
    console.error('Error in updateEventMedia:', error);
  }
};