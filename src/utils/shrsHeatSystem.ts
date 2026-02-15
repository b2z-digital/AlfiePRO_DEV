/**
 * Simple Heat Racing System (SHRS) Implementation
 * Version 2026-1, 5th February 2026
 *
 * This module implements the SHRS rules for heat racing including:
 * - Heat movement tables (Table 1 and Table 2) for 2-5 heats
 * - Qualifying series and final series logic
 * - SHRS-specific scoring rules (Rule 5.2: scores based on largest heat size)
 * - Progressive and pre-assignment methods
 * - Finals fleet assignments (Gold, Silver, Bronze, Copper)
 */

import { Skipper } from '../types';
import { HeatManagement, HeatConfiguration, HeatRound } from '../types/heat';

export interface SHRSConfig {
  numberOfHeats: number;
  numberOfRaces: number;
  qualifyingRaces: number; // Number of races in qualifying series
  useTable2: boolean; // true for alpha labeling (A, B, C, D), false for numeric (1, 2, 3, 4)
}

/**
 * Heat Movement Table 1 - Numeric Labeling (1, 2, 3, 4)
 * Used when useTable2 = false
 */
const HEAT_MOVEMENT_TABLE_1: Record<number, number[][]> = {
  2: [[1, 2], [2, 1], [1, 2], [2, 1], [1, 2], [2, 1], [1, 2], [2, 1], [1, 2], [2, 1],
      [1, 2], [2, 1], [1, 2], [2, 1], [1, 2], [2, 1], [1, 2], [2, 1], [1, 2], [2, 1]],
  3: [[1, 2, 3], [3, 1, 2], [2, 3, 1], [1, 2, 3], [3, 1, 2], [2, 3, 1], [1, 2, 3], [3, 1, 2],
      [2, 3, 1], [1, 2, 3], [3, 1, 2], [2, 3, 1], [1, 2, 3], [3, 1, 2], [2, 3, 1], [1, 2, 3],
      [3, 1, 2], [2, 3, 1], [1, 2, 3], [3, 1, 2]],
  4: [[1, 2, 3, 4], [4, 1, 2, 3], [3, 4, 1, 2], [2, 3, 4, 1], [1, 2, 3, 4], [4, 1, 2, 3],
      [3, 4, 1, 2], [2, 3, 4, 1], [1, 2, 3, 4], [4, 1, 2, 3], [3, 4, 1, 2], [2, 3, 4, 1],
      [1, 2, 3, 4], [4, 1, 2, 3], [3, 4, 1, 2], [2, 3, 4, 1], [1, 2, 3, 4], [4, 1, 2, 3],
      [3, 4, 1, 2], [2, 3, 4, 1]],
  5: [[1, 2, 3, 4, 5], [5, 1, 2, 3, 4], [4, 5, 1, 2, 3], [3, 4, 5, 1, 2], [2, 3, 4, 5, 1],
      [1, 2, 3, 4, 5], [5, 1, 2, 3, 4], [4, 5, 1, 2, 3], [3, 4, 5, 1, 2], [2, 3, 4, 5, 1],
      [1, 2, 3, 4, 5], [5, 1, 2, 3, 4], [4, 5, 1, 2, 3], [3, 4, 5, 1, 2], [2, 3, 4, 5, 1],
      [1, 2, 3, 4, 5], [5, 1, 2, 3, 4], [4, 5, 1, 2, 3], [3, 4, 5, 1, 2], [2, 3, 4, 5, 1]]
};

/**
 * Heat Movement Table 2 - Alpha Labeling (A, B, C, D)
 * Used when useTable2 = true
 */
const HEAT_MOVEMENT_TABLE_2: Record<number, string[][]> = {
  2: [['A', 'B'], ['B', 'A'], ['A', 'B'], ['B', 'A'], ['A', 'B'], ['B', 'A'], ['A', 'B'], ['B', 'A'],
      ['A', 'B'], ['B', 'A'], ['A', 'B'], ['B', 'A'], ['A', 'B'], ['B', 'A'], ['A', 'B'], ['B', 'A'],
      ['A', 'B'], ['B', 'A'], ['A', 'B'], ['B', 'A']],
  3: [['A', 'B', 'C'], ['C', 'A', 'B'], ['B', 'C', 'A'], ['A', 'B', 'C'], ['C', 'A', 'B'], ['B', 'C', 'A'],
      ['A', 'B', 'C'], ['C', 'A', 'B'], ['B', 'C', 'A'], ['A', 'B', 'C'], ['C', 'A', 'B'], ['B', 'C', 'A'],
      ['A', 'B', 'C'], ['C', 'A', 'B'], ['B', 'C', 'A'], ['A', 'B', 'C'], ['C', 'A', 'B'], ['B', 'C', 'A'],
      ['A', 'B', 'C'], ['C', 'A', 'B']],
  4: [['A', 'B', 'C', 'D'], ['D', 'A', 'B', 'C'], ['C', 'D', 'A', 'B'], ['B', 'C', 'D', 'A'],
      ['A', 'B', 'C', 'D'], ['D', 'A', 'B', 'C'], ['C', 'D', 'A', 'B'], ['B', 'C', 'D', 'A'],
      ['A', 'B', 'C', 'D'], ['D', 'A', 'B', 'C'], ['C', 'D', 'A', 'B'], ['B', 'C', 'D', 'A'],
      ['A', 'B', 'C', 'D'], ['D', 'A', 'B', 'C'], ['C', 'D', 'A', 'B'], ['B', 'C', 'D', 'A'],
      ['A', 'B', 'C', 'D'], ['D', 'A', 'B', 'C'], ['C', 'D', 'A', 'B'], ['B', 'C', 'D', 'A']],
  5: [['A', 'B', 'C', 'D', 'E'], ['E', 'A', 'B', 'C', 'D'], ['D', 'E', 'A', 'B', 'C'], ['C', 'D', 'E', 'A', 'B'], ['B', 'C', 'D', 'E', 'A'],
      ['A', 'B', 'C', 'D', 'E'], ['E', 'A', 'B', 'C', 'D'], ['D', 'E', 'A', 'B', 'C'], ['C', 'D', 'E', 'A', 'B'], ['B', 'C', 'D', 'E', 'A'],
      ['A', 'B', 'C', 'D', 'E'], ['E', 'A', 'B', 'C', 'D'], ['D', 'E', 'A', 'B', 'C'], ['C', 'D', 'E', 'A', 'B'], ['B', 'C', 'D', 'E', 'A'],
      ['A', 'B', 'C', 'D', 'E'], ['E', 'A', 'B', 'C', 'D'], ['D', 'E', 'A', 'B', 'C'], ['C', 'D', 'E', 'A', 'B'], ['B', 'C', 'D', 'E', 'A']]
};

/**
 * Calculate optimal number of heats for SHRS
 * SHRS Rule 2.1: The number of heats shall be as few as possible
 * SHRS Rule 2.3: The maximum number of boats in a heat shall be 20
 */
export function calculateOptimalHeats(totalSkippers: number): number {
  if (totalSkippers <= 20) return 2;
  if (totalSkippers <= 40) return 3;
  if (totalSkippers <= 60) return 4;
  return 5;
}

/**
 * Calculate heat sizes for initial seeding (Race 1)
 * SHRS Rule 2.2: First extra boat will be assigned to Heat 1, second to Heat 2, etc.
 */
export function calculateHeatSizes(totalSkippers: number, numberOfHeats: number): number[] {
  const baseSize = Math.floor(totalSkippers / numberOfHeats);
  const remainder = totalSkippers % numberOfHeats;
  const sizes = new Array(numberOfHeats).fill(baseSize);

  // Add remainder boats starting from Heat 1 (or Heat A)
  for (let i = 0; i < remainder; i++) {
    sizes[i]++;
  }

  return sizes;
}

/**
 * Seed skippers for Race 1 of Qualifying Series
 * SHRS Rule 3.1.1: Assign boats starting from top ranked boat in order 1, 2, 3, 4, 5, 5, 4, 3, 2, 1...
 */
export function seedInitialHeatsForSHRS(
  skippers: Skipper[],
  numberOfHeats: number,
  seedingList?: string[] // Optional pre-seeding by sail number
): Map<string | number, Skipper[]> {
  const heats = new Map<string | number, Skipper[]>();

  // Initialize heats
  for (let i = 1; i <= numberOfHeats; i++) {
    heats.set(i, []);
  }

  // Sort skippers by seeding list if provided, otherwise alphabetically by sail number
  let sortedSkippers = [...skippers];
  if (seedingList && seedingList.length > 0) {
    sortedSkippers.sort((a, b) => {
      const aSail = a.sailNumber || '';
      const bSail = b.sailNumber || '';
      const aIndex = seedingList.indexOf(aSail);
      const bIndex = seedingList.indexOf(bSail);
      if (aIndex === -1 && bIndex === -1) {
        return aSail.localeCompare(bSail);
      }
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  } else {
    // Default: alphabetical by national letter, then numerical by sail number
    sortedSkippers.sort((a, b) => {
      const aSail = a.sailNumber || '';
      const bSail = b.sailNumber || '';
      return aSail.localeCompare(bSail);
    });
  }

  // Assign using the zigzag pattern: 1, 2, 3, 4, 5, 5, 4, 3, 2, 1...
  let currentHeat = 1;
  let direction = 1; // 1 for forward, -1 for backward

  for (const skipper of sortedSkippers) {
    heats.get(currentHeat)!.push(skipper);

    // Move to next heat
    if (direction === 1) {
      currentHeat++;
      if (currentHeat > numberOfHeats) {
        currentHeat = numberOfHeats;
        direction = -1;
      }
    } else {
      currentHeat--;
      if (currentHeat < 1) {
        currentHeat = 1;
        direction = 1;
      }
    }
  }

  return heats;
}

/**
 * Get next heat assignment based on current position and last race's heat
 * Uses Heat Movement Tables (SHRS Rules 3.1.2)
 */
export function getNextHeat(
  position: number,
  lastRaceHeat: number | string,
  numberOfHeats: number,
  useTable2: boolean
): number | string {
  if (useTable2) {
    // Table 2: Alpha labeling
    const heatLabel = lastRaceHeat as string;
    const heatIndex = ['A', 'B', 'C', 'D', 'E'].indexOf(heatLabel);
    if (heatIndex === -1 || !HEAT_MOVEMENT_TABLE_2[numberOfHeats]) {
      return heatLabel; // Return same heat if not found
    }

    // Position is 1-indexed, array is 0-indexed
    if (position < 1 || position > 20) return heatLabel;

    const movementRow = HEAT_MOVEMENT_TABLE_2[numberOfHeats][position - 1];
    return movementRow[heatIndex];
  } else {
    // Table 1: Numeric labeling
    const heatNumber = lastRaceHeat as number;
    if (!HEAT_MOVEMENT_TABLE_1[numberOfHeats] || heatNumber < 1 || heatNumber > numberOfHeats) {
      return heatNumber; // Return same heat if invalid
    }

    // Position is 1-indexed, array is 0-indexed
    if (position < 1 || position > 20) return heatNumber;

    const movementRow = HEAT_MOVEMENT_TABLE_1[numberOfHeats][position - 1];
    return movementRow[heatNumber - 1];
  }
}

/**
 * Calculate SHRS discards
 * SHRS Rule 5.4: 1 discard after 4 races, 2 after 8 races, +1 for every 8 additional races
 */
export function calculateSHRSDiscards(racesCompleted: number): number {
  if (racesCompleted < 4) return 0;
  if (racesCompleted < 8) return 1;

  // After 8 races: 2 discards, then +1 for every additional 8 races
  const additionalSets = Math.floor((racesCompleted - 8) / 8);
  return 2 + additionalSets;
}

/**
 * Assign skippers to Final Series fleets
 * SHRS Rule 4.1-4.2: Gold, Silver, Bronze, Copper fleets
 */
export function assignToFinalFleets(
  skippers: Skipper[],
  qualifyingScores: Map<string, number>,
  numberOfFleets: number
): Map<string, Skipper[]> {
  const fleets = new Map<string, Skipper[]>();
  const fleetNames = ['Gold', 'Silver', 'Bronze', 'Copper'];

  // Initialize fleets
  for (let i = 0; i < numberOfFleets; i++) {
    fleets.set(fleetNames[i], []);
  }

  // Sort skippers by qualifying score (lowest score = best)
  const sortedSkippers = [...skippers].sort((a, b) => {
    const scoreA = qualifyingScores.get(a.sailNumber || '') || 999999;
    const scoreB = qualifyingScores.get(b.sailNumber || '') || 999999;
    return scoreA - scoreB;
  });

  // Calculate fleet sizes (as equal as possible)
  const baseSize = Math.floor(sortedSkippers.length / numberOfFleets);
  const remainder = sortedSkippers.length % numberOfFleets;
  const fleetSizes = new Array(numberOfFleets).fill(baseSize);

  // Add remainder to lower fleets (Silver > Bronze > Copper)
  // This ensures Gold fleet is not largest
  for (let i = numberOfFleets - 1; i >= numberOfFleets - remainder; i--) {
    if (i > 0) fleetSizes[i]++;
  }

  // Assign skippers to fleets
  let skipperIndex = 0;
  for (let fleetIndex = 0; fleetIndex < numberOfFleets; fleetIndex++) {
    const fleetName = fleetNames[fleetIndex];
    const size = fleetSizes[fleetIndex];

    for (let i = 0; i < size && skipperIndex < sortedSkippers.length; i++) {
      fleets.get(fleetName)!.push(sortedSkippers[skipperIndex]);
      skipperIndex++;
    }
  }

  return fleets;
}

/**
 * Validate SHRS configuration
 */
export function validateSHRSConfig(config: SHRSConfig, skipperCount: number): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (config.numberOfHeats < 2 || config.numberOfHeats > 5) {
    errors.push('SHRS requires between 2 and 5 heats.');
  }

  if (skipperCount < config.numberOfHeats * 2) {
    errors.push(`At least ${config.numberOfHeats * 2} skippers required for ${config.numberOfHeats} heats.`);
  }

  if (config.qualifyingRaces < 1) {
    errors.push('At least 1 race is required for the Qualifying Series.');
  }

  if (config.qualifyingRaces >= config.numberOfRaces) {
    errors.push('Qualifying series must be shorter than total races.');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Create initial SHRS heat management structure
 */
export function createSHRSHeatManagement(
  skippers: Skipper[],
  config: SHRSConfig
): HeatManagement {
  const heatConfig: HeatConfiguration = {
    enabled: true,
    numberOfHeats: config.numberOfHeats,
    isManualAssignment: false,
    systemType: 'shrs'
  };

  // Seed initial heats for Race 1
  const initialHeats = seedInitialHeatsForSHRS(skippers, config.numberOfHeats);

  const rounds: HeatRound[] = [];

  // Create qualifying series rounds
  for (let i = 1; i <= config.qualifyingRaces; i++) {
    rounds.push({
      roundNumber: i,
      roundName: `Qualifying Race ${i}`,
      heats: Array.from(initialHeats.entries()).map(([heatId, skippers]) => ({
        heatId: config.useTable2 ? String.fromCharCode(64 + Number(heatId)) : heatId,
        heatName: config.useTable2 ? `Heat ${String.fromCharCode(64 + Number(heatId))}` : `Heat ${heatId}`,
        skippers: skippers.map(s => s.sailNumber || '')
      })),
      results: [],
      completed: false,
      isQualifying: true
    });
  }

  // Create final series rounds (will be populated after qualifying)
  for (let i = config.qualifyingRaces + 1; i <= config.numberOfRaces; i++) {
    rounds.push({
      roundNumber: i,
      roundName: `Final Race ${i - config.qualifyingRaces}`,
      heats: [],
      results: [],
      completed: false,
      isQualifying: false
    });
  }

  return {
    configuration: heatConfig,
    rounds,
    currentRound: 1,
    isPromotionRelegation: false // SHRS doesn't use promotion/relegation
  };
}
