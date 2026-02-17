/**
 * Simple Heat Racing System (SHRS) Implementation
 * Version 2026-1, 5th February 2026
 *
 * Implements all SHRS rules from the official document:
 * - Section 1: General (Qualifying Series + Final Series)
 * - Section 2: Number and Size of Heats (max 20, as equal as possible)
 * - Section 3: Qualifying Series (Progressive Assignment with Movement Tables)
 * - Section 4: Final Series (Gold, Silver, Bronze, Copper fleets)
 * - Section 5: Scoring (Low Point, largest heat size for penalties, discards)
 * - Heat Movement Tables 1 (numeric) and 2 (alpha) for 2-5 heats
 */

import { Skipper } from '../types';
import { LetterScore } from '../types/letterScores';

export interface SHRSConfig {
  numberOfHeats: number;
  numberOfRaces: number;
  qualifyingRaces: number;
  useTable2: boolean;
}

/**
 * SHRS Rule 3.1.iii / 5.3: Non-finisher ordering for heat assignment and recording.
 * Boats with no finishing position are assigned in this order AFTER all finishers.
 * Rule 5.3 also adds WTH (withdrawn from series) between DNC and UFD.
 */
export const SHRS_NON_FINISHER_ORDER: LetterScore[] = [
  'DNF', 'RET', 'NSC', 'OCS', 'DNS', 'DNC', 'WDN', 'BFD', 'DSQ', 'DNE'
];

export function getNonFinisherPriority(letterScore: LetterScore): number {
  const idx = SHRS_NON_FINISHER_ORDER.indexOf(letterScore);
  return idx === -1 ? SHRS_NON_FINISHER_ORDER.length : idx;
}

/**
 * Heat Movement Table 1 - Numeric Labeling (1, 2, 3, 4, 5)
 * PDF Page 3: Table 1
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
 * Heat Movement Table 2 - Alpha Labeling (A, B, C, D, E)
 * PDF Page 4: Table 2
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
 * SHRS Rule 2.1: The number of heats shall be as few as possible.
 * SHRS Rule 2.3: The maximum number of boats in a heat shall be 20.
 * Minimum fleet size target: 12 boats per heat.
 * Maximum: 5 heats.
 */
export function calculateOptimalHeats(totalSkippers: number): number {
  const MAX_FLEET = 20;
  const MAX_HEATS = 5;

  for (let h = 2; h <= MAX_HEATS; h++) {
    if (Math.ceil(totalSkippers / h) <= MAX_FLEET) return h;
  }
  return MAX_HEATS;
}

/**
 * SHRS Rule 2.2: The number of boats in each heat shall be as equal as possible.
 * Extra boats assigned starting from Heat 1/A.
 */
export function calculateHeatSizes(totalSkippers: number, numberOfHeats: number): number[] {
  const baseSize = Math.floor(totalSkippers / numberOfHeats);
  const remainder = totalSkippers % numberOfHeats;
  const sizes = new Array(numberOfHeats).fill(baseSize);
  for (let i = 0; i < remainder; i++) {
    sizes[i]++;
  }
  return sizes;
}

/**
 * SHRS Rule 3.1.i: Seed skippers for Race 1 of Qualifying Series.
 * Assign boats starting from top ranked boat in order 1, 2, 3, 4, 5, 5, 4, 3, 2, 1...
 * If no ranking/seeding list: alphabetical by national letter, then numerical by sail number.
 */
export function seedInitialHeatsForSHRS(
  skippers: Skipper[],
  numberOfHeats: number,
  seedingList?: string[]
): Map<string | number, Skipper[]> {
  const heats = new Map<string | number, Skipper[]>();
  for (let i = 1; i <= numberOfHeats; i++) {
    heats.set(i, []);
  }

  let sortedSkippers = [...skippers];
  if (seedingList && seedingList.length > 0) {
    sortedSkippers.sort((a, b) => {
      const aSail = a.sailNo || a.sailNumber || '';
      const bSail = b.sailNo || b.sailNumber || '';
      const aIndex = seedingList.indexOf(aSail);
      const bIndex = seedingList.indexOf(bSail);
      if (aIndex === -1 && bIndex === -1) return compareSailNumbers(aSail, bSail);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  } else {
    sortedSkippers.sort((a, b) => compareSailNumbers(a.sailNo || a.sailNumber || '', b.sailNo || b.sailNumber || ''));
  }

  const baseSize = Math.floor(sortedSkippers.length / numberOfHeats);
  const extras = sortedSkippers.length % numberOfHeats;
  const targetSizes = Array.from({ length: numberOfHeats }, (_, i) =>
    baseSize + (i < extras ? 1 : 0)
  );

  // Snake pattern: 1,2,3,3,2,1,1,2,3...
  let pos = 1;
  let dir = 1;
  const filled = Array.from({ length: numberOfHeats + 1 }, () => 0);

  for (const skipper of sortedSkippers) {
    let heatIdx = pos;
    if (filled[heatIdx] >= targetSizes[heatIdx - 1]) {
      for (let j = 1; j <= numberOfHeats; j++) {
        if (filled[j] < targetSizes[j - 1]) {
          heatIdx = j;
          break;
        }
      }
    }
    heats.get(heatIdx)!.push(skipper);
    filled[heatIdx]++;

    pos += dir;
    if (pos > numberOfHeats) {
      pos = numberOfHeats;
      dir = -1;
    } else if (pos < 1) {
      pos = 1;
      dir = 1;
    }
  }

  return heats;
}

/**
 * SHRS Rule 3.1.iv: Compare sail numbers alphanumerically.
 * First by national letter(s), then by numerical part of sail number.
 */
export function compareSailNumbers(a: string, b: string): number {
  const aLetters = a.replace(/[0-9]/g, '').trim();
  const bLetters = b.replace(/[0-9]/g, '').trim();
  if (aLetters !== bLetters) return aLetters.localeCompare(bLetters);
  const aNum = parseInt(a.replace(/[^0-9]/g, ''), 10) || 0;
  const bNum = parseInt(b.replace(/[^0-9]/g, ''), 10) || 0;
  return aNum - bNum;
}

/**
 * SHRS Rule 3.1.ii: Get next heat assignment using Heat Movement Tables.
 * Position is the boat's finishing position (or virtual position for non-finishers).
 * lastRaceHeat is the heat the boat was in for the last race.
 *
 * The tables extend beyond 20 positions using the same cyclical pattern.
 */
export function getNextHeat(
  position: number,
  lastRaceHeat: number | string,
  numberOfHeats: number,
  useTable2: boolean
): number | string {
  if (position < 1) return lastRaceHeat;

  const effectivePosition = position <= 20 ? position : ((position - 1) % numberOfHeats) + 1;

  if (useTable2) {
    const heatLabel = lastRaceHeat as string;
    const heatIndex = ['A', 'B', 'C', 'D', 'E'].indexOf(heatLabel);
    if (heatIndex === -1 || !HEAT_MOVEMENT_TABLE_2[numberOfHeats]) return heatLabel;
    const clampedPos = Math.min(effectivePosition, 20);
    const movementRow = HEAT_MOVEMENT_TABLE_2[numberOfHeats][clampedPos - 1];
    return movementRow[heatIndex];
  } else {
    const heatNumber = lastRaceHeat as number;
    if (!HEAT_MOVEMENT_TABLE_1[numberOfHeats] || heatNumber < 1 || heatNumber > numberOfHeats) return heatNumber;
    const clampedPos = Math.min(effectivePosition, 20);
    const movementRow = HEAT_MOVEMENT_TABLE_1[numberOfHeats][clampedPos - 1];
    return movementRow[heatNumber - 1];
  }
}

/**
 * SHRS Rule 5.2: Get the number of boats in the largest heat for a given round.
 * Used for calculating non-finisher scores (replaces "boats entered in series").
 */
export function getLargestHeatSize(heatSizes: number[]): number {
  return Math.max(...heatSizes, 0);
}

/**
 * SHRS Rule 5.4: Calculate discards for qualifying and final series separately.
 * After 4 races: exclude 1 worst score
 * After 8 races: exclude 2 worst scores
 * +1 additional exclusion for every 8 additional races completed
 */
export function calculateSHRSDiscards(racesCompleted: number): number {
  if (racesCompleted < 4) return 0;
  if (racesCompleted < 8) return 1;
  return 2 + Math.floor((racesCompleted - 8) / 8);
}

/**
 * SHRS Rule 5.2: Calculate score for a non-finisher.
 * Points = number of boats in the largest heat + 1
 */
export function calculateNonFinisherScore(largestHeatSize: number): number {
  return largestHeatSize + 1;
}

/**
 * SHRS Rule 4.1: Calculate fleet sizes for Final Series.
 * Same number of fleets as heats in qualifying.
 * Fleet sizes as equal as possible.
 * Silver <= Gold, Bronze <= Silver, Copper <= Bronze.
 * This means extra boats go to UPPER fleets first (Gold gets extras first).
 */
export function calculateFinalFleetSizes(totalBoats: number, numberOfFleets: number): number[] {
  const baseSize = Math.floor(totalBoats / numberOfFleets);
  const remainder = totalBoats % numberOfFleets;
  const sizes = new Array(numberOfFleets).fill(baseSize);
  for (let i = 0; i < remainder; i++) {
    sizes[i]++;
  }
  return sizes;
}

/**
 * SHRS Rule 4.2 + 4.3: Assign skippers to Final Series fleets.
 * Best ranked boats to Gold Fleet. Withdrawn boats to lowest fleet.
 * Rule 4.3: If qualifying has 5-7 completed races, temporarily exclude
 * 2nd worst score for the purpose of fleet ranking only.
 */
export function assignToFinalFleets(
  skippers: Skipper[],
  qualifyingScores: Map<string, number>,
  numberOfFleets: number,
  qualifyingRacesCompleted?: number,
  allRaceScores?: Map<string, number[]>,
  withdrawnSailNumbers?: Set<string>
): Map<string, Skipper[]> {
  const fleets = new Map<string, Skipper[]>();
  const fleetNames = ['Gold', 'Silver', 'Bronze', 'Copper'];
  for (let i = 0; i < numberOfFleets; i++) {
    fleets.set(fleetNames[i], []);
  }

  let rankingScores = new Map(qualifyingScores);

  if (
    qualifyingRacesCompleted !== undefined &&
    qualifyingRacesCompleted > 5 &&
    qualifyingRacesCompleted < 8 &&
    allRaceScores
  ) {
    rankingScores = new Map<string, number>();
    allRaceScores.forEach((scores, sailNumber) => {
      const sorted = [...scores].sort((a, b) => b - a);
      const excluded = sorted.length >= 2 ? sorted.slice(2) : sorted;
      rankingScores.set(sailNumber, excluded.reduce((sum, s) => sum + s, 0));
    });
  }

  const activeSkippers = skippers.filter(s => {
    const sail = s.sailNo || s.sailNumber || '';
    return !withdrawnSailNumbers || !withdrawnSailNumbers.has(sail);
  });
  const withdrawnSkippers = skippers.filter(s => {
    const sail = s.sailNo || s.sailNumber || '';
    return withdrawnSailNumbers && withdrawnSailNumbers.has(sail);
  });

  const sortedActive = [...activeSkippers].sort((a, b) => {
    const scoreA = rankingScores.get(a.sailNo || a.sailNumber || '') || 999999;
    const scoreB = rankingScores.get(b.sailNo || b.sailNumber || '') || 999999;
    if (scoreA !== scoreB) return scoreA - scoreB;
    return compareSailNumbers(a.sailNo || a.sailNumber || '', b.sailNo || b.sailNumber || '');
  });

  const fleetSizes = calculateFinalFleetSizes(skippers.length, numberOfFleets);

  let skipperIndex = 0;
  for (let fleetIndex = 0; fleetIndex < numberOfFleets; fleetIndex++) {
    const fleetName = fleetNames[fleetIndex];
    const size = fleetSizes[fleetIndex];
    for (let i = 0; i < size && skipperIndex < sortedActive.length; i++) {
      fleets.get(fleetName)!.push(sortedActive[skipperIndex]);
      skipperIndex++;
    }
  }

  const lowestFleet = fleetNames[numberOfFleets - 1];
  withdrawnSkippers.forEach(s => {
    fleets.get(lowestFleet)!.push(s);
  });

  return fleets;
}

/**
 * SHRS Rule 3.2: Pre-Assignments.
 * Generate all heat assignments for the entire qualifying series before racing starts.
 * Uses Heat Movement Tables to determine each skipper's heat for every qualifying round.
 * Position within the heat (slot order) determines movement, not race results.
 */
export function generateAllSHRSQualifyingRoundAssignments(
  initialAssignments: { heatDesignation: string; skipperIndices: number[] }[],
  numberOfHeats: number,
  qualifyingRounds: number
): { heatDesignation: string; skipperIndices: number[] }[][] {
  const allRounds: { heatDesignation: string; skipperIndices: number[] }[][] = [];

  const targetSizes = initialAssignments.map(a => a.skipperIndices.length);

  allRounds.push(initialAssignments.map(a => ({
    heatDesignation: a.heatDesignation,
    skipperIndices: [...a.skipperIndices]
  })));

  const heatLabels = initialAssignments.map(a => a.heatDesignation);

  for (let round = 2; round <= qualifyingRounds; round++) {
    const prevRound = allRounds[round - 2];
    const newAssignments = heatLabels.map(label => ({
      heatDesignation: label,
      skipperIndices: [] as number[]
    }));

    for (const prevHeat of prevRound) {
      prevHeat.skipperIndices.forEach((skipperIndex, positionZeroBased) => {
        const position = positionZeroBased + 1;
        const nextHeatLabel = getNextHeat(
          position,
          prevHeat.heatDesignation,
          numberOfHeats,
          true
        );

        const targetIdx = heatLabels.indexOf(nextHeatLabel as string);
        if (targetIdx >= 0) {
          newAssignments[targetIdx].skipperIndices.push(skipperIndex);
        }
      });
    }

    const overflow: number[] = [];
    for (let i = 0; i < newAssignments.length; i++) {
      while (newAssignments[i].skipperIndices.length > targetSizes[i]) {
        overflow.push(newAssignments[i].skipperIndices.pop()!);
      }
    }
    for (let i = 0; i < newAssignments.length; i++) {
      while (newAssignments[i].skipperIndices.length < targetSizes[i] && overflow.length > 0) {
        newAssignments[i].skipperIndices.push(overflow.shift()!);
      }
    }

    allRounds.push(newAssignments);
  }

  return allRounds;
}

/**
 * SHRS Initial Seeding - Index Based
 * Sorts skippers by sail number, then distributes using SHRS snake pattern.
 * Explicitly calculates exact heat sizes first, then fills using snake order.
 * First heats (A, B...) get any extra skippers beyond the base size.
 * Example: 50 skippers, 3 heats -> [17, 17, 16]
 * Example: 50 skippers, 4 heats -> [13, 13, 12, 12]
 */
export function seedSHRSHeatsByIndex(
  skippers: Skipper[],
  numberOfHeats: number
): { heatDesignation: string; skipperIndices: number[] }[] {
  const heatLabels = ['A', 'B', 'C', 'D', 'E', 'F'];

  const sortedIndices = skippers
    .map((_, i) => i)
    .sort((a, b) => compareSailNumbers(
      skippers[a].sailNo || skippers[a].sailNumber || '',
      skippers[b].sailNo || skippers[b].sailNumber || ''
    ));

  const baseSize = Math.floor(sortedIndices.length / numberOfHeats);
  const extras = sortedIndices.length % numberOfHeats;
  const targetSizes = Array.from({ length: numberOfHeats }, (_, i) =>
    baseSize + (i < extras ? 1 : 0)
  );

  const heatBuckets: number[][] = Array.from({ length: numberOfHeats }, () => []);

  // Build snake-order sequence: A,B,C,C,B,A,A,B,C...
  const snakeOrder: number[] = [];
  let pos = 0;
  let dir = 1;
  for (let i = 0; i < sortedIndices.length; i++) {
    snakeOrder.push(pos);
    pos += dir;
    if (pos >= numberOfHeats) {
      pos = numberOfHeats - 1;
      dir = -1;
    } else if (pos < 0) {
      pos = 0;
      dir = 1;
    }
  }

  // Count how many skippers each heat gets in the snake order
  const snakeCounts = Array.from({ length: numberOfHeats }, () => 0);
  for (const h of snakeOrder) {
    snakeCounts[h]++;
  }

  // Assign skippers using snake order, but enforce exact target sizes
  const filled = Array.from({ length: numberOfHeats }, () => 0);
  for (let i = 0; i < sortedIndices.length; i++) {
    let heatIdx = snakeOrder[i];
    if (filled[heatIdx] >= targetSizes[heatIdx]) {
      // This heat is full, find next available heat
      for (let j = 0; j < numberOfHeats; j++) {
        if (filled[j] < targetSizes[j]) {
          heatIdx = j;
          break;
        }
      }
    }
    heatBuckets[heatIdx].push(sortedIndices[i]);
    filled[heatIdx]++;
  }

  console.log('SHRS seeding:', sortedIndices.length, 'skippers into', numberOfHeats, 'heats. Sizes:', heatBuckets.map(b => b.length).join(', '));

  return heatBuckets.map((indices, i) => ({
    heatDesignation: heatLabels[i],
    skipperIndices: indices
  }));
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
  return { isValid: errors.length === 0, errors };
}
