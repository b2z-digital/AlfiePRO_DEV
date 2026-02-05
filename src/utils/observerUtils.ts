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
 * @returns Array of selected observers
 */
export async function selectObservers(
  eventId: string,
  heatNumber: number,
  raceNumber: number,
  racingSkipperIndices: number[],
  allSkippers: Skipper[],
  observersNeeded: number
): Promise<ObserverAssignment[]> {
  try {
    console.log(`    🔧 selectObservers called for heat ${heatNumber}, race ${raceNumber}`);
    console.log(`    🚫 Excluding racing skippers (indices):`, racingSkipperIndices);
    console.log(`    👥 Total skippers available:`, allSkippers.length);
    console.log(`    🎯 Observers needed:`, observersNeeded);

    // Get observer history for this event
    const { data: existingObservers, error } = await supabase
      .from('heat_observers')
      .select('*')
      .eq('event_id', eventId)
      .order('times_served', { ascending: true });

    if (error) {
      console.error('Error fetching observer history:', error);
      return [];
    }

    // Create a map of times each skipper has served as observer
    const timesServedMap = new Map<number, number>();
    existingObservers?.forEach(observer => {
      timesServedMap.set(observer.skipper_index, observer.times_served);
    });

    // Filter out skippers who are racing in this heat
    const availableSkippers = allSkippers
      .map((skipper, index) => ({
        ...skipper,
        index,
        timesServed: timesServedMap.get(index) || 0
      }))
      .filter(skipper => {
        const isRacing = racingSkipperIndices.includes(skipper.index);
        return !isRacing;
      });

    console.log(`    ✅ Available skippers after filtering:`, availableSkippers.length);
    console.log(`    📋 Available skipper indices:`, availableSkippers.map(s => s.index).slice(0, 10));

    // Sort by times served (ascending) and then by random to add fairness
    // Add a small random factor to break ties fairly
    const sortedAvailable = availableSkippers.sort((a, b) => {
      if (a.timesServed !== b.timesServed) {
        return a.timesServed - b.timesServed; // Prioritize those who have served least
      }
      // Random tie-breaker for skippers with same times served
      return Math.random() - 0.5;
    });

    // Select the required number of observers
    const selectedObservers = sortedAvailable.slice(0, observersNeeded);

    console.log(`    🎯 Selected ${selectedObservers.length} observers:`);
    selectedObservers.forEach(obs => {
      console.log(`       - ${obs.name} (index ${obs.index}, #${obs.sailNo || obs.sailNumber})`);
    });

    // Map to observer assignments
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
          skipper_index: observer.skipper_index || null,
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
