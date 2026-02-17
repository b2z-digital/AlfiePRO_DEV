import { supabase } from './supabase';
import { Skipper } from '../types';

export interface ObserverAssignment {
  id?: string;
  skipper_index?: number; // Optional - null for custom observers
  skipper_name: string;
  skipper_sail_number?: string;
  times_served: number;
  is_manual_assignment?: boolean;
  is_custom_observer?: boolean; // True for non-competing observers (volunteers, etc.)
}

/**
 * Select observers for a heat race using a fair rotation algorithm
 * @param eventId - The event/race ID
 * @param heatNumber - The current heat number (1 = Heat A, 2 = Heat B, etc.)
 * @param raceNumber - The race/round number
 * @param racingSkipperIndices - Indices of skippers racing in this heat
 * @param allSkippers - All skippers in the event
 * @param observersNeeded - Number of observers needed
 * @param nextHeatSkipperIndices - Indices of skippers racing in the next heat (excluded so they can prepare)
 * @returns Array of selected observers
 */
export async function selectObservers(
  eventId: string,
  heatNumber: number,
  raceNumber: number,
  racingSkipperIndices: number[],
  allSkippers: Skipper[],
  observersNeeded: number,
  nextHeatSkipperIndices?: number[]
): Promise<ObserverAssignment[]> {
  try {
    const { data: existingObservers, error } = await supabase
      .from('heat_observers')
      .select('*')
      .eq('event_id', eventId)
      .order('times_served', { ascending: true });

    if (error) {
      console.error('Error fetching observer history:', error);
      return [];
    }

    const timesServedMap = new Map<number, number>();
    existingObservers?.forEach(observer => {
      timesServedMap.set(observer.skipper_index, observer.times_served);
    });

    const excludedSet = new Set(racingSkipperIndices);
    if (nextHeatSkipperIndices) {
      nextHeatSkipperIndices.forEach(idx => excludedSet.add(idx));
    }

    const availableSkippers = allSkippers
      .map((skipper, index) => ({
        ...skipper,
        index,
        timesServed: timesServedMap.get(index) || 0
      }))
      .filter(skipper => !excludedSet.has(skipper.index));

    const sortedAvailable = availableSkippers.sort((a, b) => {
      if (a.timesServed !== b.timesServed) {
        return a.timesServed - b.timesServed;
      }
      return Math.random() - 0.5;
    });

    const selectedObservers = sortedAvailable.slice(0, observersNeeded);

    const observers: ObserverAssignment[] = selectedObservers.map(skipper => ({
      skipper_index: skipper.index,
      skipper_name: skipper.name,
      skipper_sail_number: skipper.sailNumber || skipper.sailNo,
      times_served: skipper.timesServed,
      is_manual_assignment: false
    }));

    return observers;
  } catch (err) {
    console.error('Error selecting observers:', err);
    return [];
  }
}

/**
 * Save observer assignments to the database
 * @param eventId - The event/race ID
 * @param heatNumber - The heat number
 * @param raceNumber - The race/round number
 * @param observers - Array of observer assignments
 */
export async function saveObserverAssignments(
  eventId: string,
  heatNumber: number,
  raceNumber: number,
  observers: ObserverAssignment[]
): Promise<boolean> {
  try {
    // Delete existing assignments for this heat/race (including any stale data)
    console.log(`  🗑️ Deleting existing observers for heat ${heatNumber}, race ${raceNumber}`);
    const { error: deleteError } = await supabase
      .from('heat_observers')
      .delete()
      .eq('event_id', eventId)
      .eq('heat_number', heatNumber)
      .eq('race_number', raceNumber);

    if (deleteError) {
      console.error('Error deleting existing observers:', deleteError);
      return false;
    }
    console.log(`  ✅ Deleted stale observers`);

    // Upsert new assignments (handles race conditions in dev mode)
    console.log(`  💾 Upserting ${observers.length} new observers`);
    const { error: upsertError } = await supabase
      .from('heat_observers')
      .upsert(
        observers.map(observer => ({
          event_id: eventId,
          heat_number: heatNumber,
          race_number: raceNumber,
          skipper_index: observer.skipper_index ?? null,
          skipper_name: observer.skipper_name,
          skipper_sail_number: observer.skipper_sail_number,
          is_manual_assignment: observer.is_manual_assignment || false,
          is_custom_observer: observer.is_custom_observer || false,
          times_served: observer.is_custom_observer ? 0 : (observer.times_served + 1) // Don't track times served for custom observers
        })),
        {
          onConflict: 'event_id,heat_number,race_number,skipper_index',
          ignoreDuplicates: false  // Update if exists
        }
      );

    if (upsertError) {
      console.error('Error upserting observers:', upsertError);
      return false;
    }

    console.log(`  ✅ Successfully saved ${observers.length} observers`);
    return true;
  } catch (err) {
    console.error('Error saving observer assignments:', err);
    return false;
  }
}

/**
 * Get observer assignments for a specific heat/race
 * @param eventId - The event/race ID
 * @param heatNumber - The heat number
 * @param raceNumber - The race/round number
 * @returns Array of observer assignments
 */
export async function getObserverAssignments(
  eventId: string,
  heatNumber: number,
  raceNumber: number
): Promise<ObserverAssignment[]> {
  try {
    console.log(`[getObserverAssignments] Querying for eventId=${eventId}, heatNumber=${heatNumber}, raceNumber=${raceNumber}`);

    const { data, error } = await supabase
      .from('heat_observers')
      .select('*')
      .eq('event_id', eventId)
      .eq('heat_number', heatNumber)
      .eq('race_number', raceNumber);

    if (error) {
      console.error('[getObserverAssignments] Error fetching observers:', error);
      return [];
    }

    console.log(`[getObserverAssignments] Found ${data?.length || 0} observers:`, data);

    return data?.map(observer => ({
      id: observer.id,
      skipper_index: observer.skipper_index,
      skipper_name: observer.skipper_name,
      skipper_sail_number: observer.skipper_sail_number,
      times_served: observer.times_served,
      is_manual_assignment: observer.is_manual_assignment,
      is_custom_observer: observer.is_custom_observer
    })) || [];
  } catch (err) {
    console.error('[getObserverAssignments] Error getting observers:', err);
    return [];
  }
}

export async function getAllObserversForEvent(
  eventId: string
): Promise<Map<string, { skipperName: string; sailNumber: string }[]>> {
  const obsMap = new Map<string, { skipperName: string; sailNumber: string }[]>();
  try {
    const { data, error } = await supabase
      .from('heat_observers')
      .select('*')
      .eq('event_id', eventId);

    if (error || !data) return obsMap;

    const heatLabels = ['A', 'B', 'C', 'D', 'E', 'F'];
    for (const row of data) {
      const designation = heatLabels[row.heat_number - 1];
      if (!designation) continue;
      const key = `${row.race_number}-${designation}`;
      if (!obsMap.has(key)) obsMap.set(key, []);
      obsMap.get(key)!.push({
        skipperName: row.skipper_name || '',
        sailNumber: row.skipper_sail_number || '',
      });
    }
  } catch {
    // ignore
  }
  return obsMap;
}

export async function preAllocateObserversForAllRounds(
  eventId: string,
  rounds: Array<{ round: number; heatAssignments: Array<{ heatDesignation: string; skipperIndices: number[] }> }>,
  allSkippers: Skipper[],
  observersPerHeat: number
): Promise<boolean> {
  try {
    console.log(`🔄 Pre-allocating observers for ${rounds.length} rounds, ${observersPerHeat} per heat`);

    const { data: allExisting } = await supabase
      .from('heat_observers')
      .select('race_number, heat_number')
      .eq('event_id', eventId);

    if (allExisting && allExisting.length > 0) {
      const validRoundNumbers = new Set(rounds.map(r => r.round));
      const roundsToInvalidate = new Set<number>();

      for (const roundData of rounds) {
        const currentHeatCount = roundData.heatAssignments.length;
        const existingForRound = allExisting.filter(r => r.race_number === roundData.round);
        if (existingForRound.length === 0) continue;
        const maxHeatInDB = Math.max(...existingForRound.map(r => r.heat_number));
        if (maxHeatInDB > currentHeatCount) {
          roundsToInvalidate.add(roundData.round);
        }
      }

      for (const row of allExisting) {
        if (!validRoundNumbers.has(row.race_number)) {
          roundsToInvalidate.add(row.race_number);
        }
      }

      for (const roundNum of roundsToInvalidate) {
        console.log(`  🗑️ Cleaning stale Q${roundNum} observers (structure changed)`);
        await supabase
          .from('heat_observers')
          .delete()
          .eq('event_id', eventId)
          .eq('race_number', roundNum);
      }
    }

    for (const roundData of rounds) {
      const sortedHeats = [...roundData.heatAssignments].sort((a, b) =>
        a.heatDesignation.localeCompare(b.heatDesignation)
      );

      for (let i = 0; i < sortedHeats.length; i++) {
        const heat = sortedHeats[i];
        const heatNumber = i + 1;
        const nextHeatToScore = i - 1 >= 0 ? sortedHeats[i - 1] : null;
        const nextHeatIndices = nextHeatToScore ? nextHeatToScore.skipperIndices : undefined;

        const existing = await getObserverAssignments(eventId, heatNumber, roundData.round);
        if (existing && existing.length === observersPerHeat) {
          const hasConflict = existing.some(obs => {
            if (obs.skipper_index === undefined || obs.skipper_index === null) return false;
            if (heat.skipperIndices.includes(obs.skipper_index)) return true;
            if (nextHeatIndices && nextHeatIndices.includes(obs.skipper_index)) return true;
            return false;
          });
          if (!hasConflict) {
            continue;
          }
        }

        const observers = await selectObservers(
          eventId, heatNumber, roundData.round,
          heat.skipperIndices, allSkippers, observersPerHeat,
          nextHeatIndices
        );

        if (observers.length > 0) {
          await saveObserverAssignments(eventId, heatNumber, roundData.round, observers);
        }
      }
    }

    console.log(`✅ Pre-allocation complete for ${rounds.length} rounds`);
    return true;
  } catch (err) {
    console.error('Error pre-allocating observers:', err);
    return false;
  }
}

/**
 * Toggle an observer assignment (add or remove manually)
 * @param eventId - The event/race ID
 * @param heatNumber - The heat number
 * @param raceNumber - The race/round number
 * @param skipperIndex - The skipper index to toggle
 * @param skipperName - The skipper name
 * @param skipperSailNumber - The skipper sail number
 * @param timesServed - Current times served count
 * @returns Success boolean
 */
export async function toggleObserver(
  eventId: string,
  heatNumber: number,
  raceNumber: number,
  skipperIndex: number,
  skipperName: string,
  skipperSailNumber: string | undefined,
  timesServed: number
): Promise<boolean> {
  try {
    // Check if observer already exists
    const { data: existing } = await supabase
      .from('heat_observers')
      .select('*')
      .eq('event_id', eventId)
      .eq('heat_number', heatNumber)
      .eq('race_number', raceNumber)
      .eq('skipper_index', skipperIndex)
      .maybeSingle();

    if (existing) {
      // Remove the observer
      const { error } = await supabase
        .from('heat_observers')
        .delete()
        .eq('id', existing.id);

      if (error) {
        console.error('Error removing observer:', error);
        return false;
      }
    } else {
      // Add the observer
      const { error } = await supabase
        .from('heat_observers')
        .insert({
          event_id: eventId,
          heat_number: heatNumber,
          race_number: raceNumber,
          skipper_index: skipperIndex,
          skipper_name: skipperName,
          skipper_sail_number: skipperSailNumber,
          is_manual_assignment: true,
          times_served: timesServed + 1
        });

      if (error) {
        console.error('Error adding observer:', error);
        return false;
      }
    }

    return true;
  } catch (err) {
    console.error('Error toggling observer:', err);
    return false;
  }
}

/**
 * Get all observer assignments for an event
 * @param eventId - The event/race ID
 * @returns Map of heat/race to observers
 */
export async function getAllObserverAssignments(
  eventId: string
): Promise<Map<string, ObserverAssignment[]>> {
  try {
    const { data, error } = await supabase
      .from('heat_observers')
      .select('*')
      .eq('event_id', eventId)
      .order('race_number', { ascending: true })
      .order('heat_number', { ascending: true });

    if (error) {
      console.error('Error fetching all observers:', error);
      return new Map();
    }

    const observerMap = new Map<string, ObserverAssignment[]>();
    data?.forEach(observer => {
      const key = `${observer.heat_number}-${observer.race_number}`;
      if (!observerMap.has(key)) {
        observerMap.set(key, []);
      }
      observerMap.get(key)!.push({
        id: observer.id,
        skipper_index: observer.skipper_index,
        skipper_name: observer.skipper_name,
        skipper_sail_number: observer.skipper_sail_number,
        times_served: observer.times_served,
        is_manual_assignment: observer.is_manual_assignment
      });
    });

    return observerMap;
  } catch (err) {
    console.error('Error getting all observers:', err);
    return new Map();
  }
}
