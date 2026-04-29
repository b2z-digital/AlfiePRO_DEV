/**
 * Structured Heat Racing (SHR) Implementation
 * Version 2026-1, 5th February 2026
 *
 * Implements all SHR rules from the official document:
 * - Section 1: General (Qualifying Series + Final Series)
 * - Section 2: Number and Size of Heats (max 20, as equal as possible)
 * - Section 3: Qualifying Series (Progressive or Balanced Assignment with Movement Tables)
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
 * SHR Rule 3.1.iii / 5.3: Non-finisher ordering for heat assignment and recording.
 * Boats with no finishing position are assigned in this order AFTER all finishers.
 * Rule 5.3 also adds WTH (withdrawn from series) between DNC and UFD.
 */
export const SHRS_NON_FINISHER_ORDER: LetterScore[] = [
  'DNF', 'RET', 'NSC', 'OCS', 'DNS', 'DNC', 'WDN', 'UFD', 'BFD', 'DSQ', 'ZFP', 'SCP', 'DPI', 'DNE'
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
 * SHR Rule 2.1: The number of heats shall be as few as possible.
 * SHR Rule 2.3: The maximum number of boats in a heat shall be 20.
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
 * SHR Rule 2.2: The number of boats in each heat shall be as equal as possible.
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
 * SHR Rule 3.1.i: Seed skippers for Race 1 of Qualifying Series.
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
 * SHR Rule 3.1.iv: Compare sail numbers alphanumerically.
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
 * SHR Rule 3.1.ii: Get next heat assignment using Heat Movement Tables.
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
 * SHR Rule 5.2: Get the number of boats in the largest heat for a given round.
 * Used for calculating non-finisher scores (replaces "boats entered in series").
 */
export function getLargestHeatSize(heatSizes: number[]): number {
  return Math.max(...heatSizes, 0);
}

/**
 * SHR Rule 5.4: Calculate discards for qualifying and final series separately.
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
 * SHR Rule 5.2: Calculate score for a non-finisher.
 * Points = number of boats in the largest heat + 1
 */
export function calculateNonFinisherScore(largestHeatSize: number): number {
  return largestHeatSize + 1;
}

/**
 * SHR Rule 4.1: Calculate fleet sizes for Final Series.
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
 * SHR Rule 4.2 + 4.3: Assign skippers to Final Series fleets.
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
 * SHR Rule 3.2: Balanced Assignments (table-based).
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

function pairKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

function buildPairCounts(allRounds: number[][][]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const round of allRounds) {
    for (const heat of round) {
      for (let i = 0; i < heat.length; i++) {
        for (let j = i + 1; j < heat.length; j++) {
          const key = pairKey(heat[i], heat[j]);
          counts.set(key, (counts.get(key) || 0) + 1);
        }
      }
    }
  }
  return counts;
}

function computeGlobalDuplicateScore(pairCounts: Map<string, number>): number {
  let score = 0;
  for (const count of pairCounts.values()) {
    if (count > 1) score += (count - 1) * (count - 1);
  }
  return score;
}

function computeSwapDelta(
  allRounds: number[][][],
  pairCounts: Map<string, number>,
  roundIdx: number,
  heatA: number,
  posA: number,
  heatB: number,
  posB: number
): number {
  const heatsInRound = allRounds[roundIdx];
  const skipperA = heatsInRound[heatA][posA];
  const skipperB = heatsInRound[heatB][posB];
  if (skipperA === skipperB) return 0;

  let delta = 0;

  for (let i = 0; i < heatsInRound[heatA].length; i++) {
    if (i === posA) continue;
    const other = heatsInRound[heatA][i];
    const oldKeyA = pairKey(skipperA, other);
    const newKeyB = pairKey(skipperB, other);
    const oldCountA = pairCounts.get(oldKeyA) || 0;
    const oldCountB = pairCounts.get(newKeyB) || 0;
    const oldPenaltyA = oldCountA > 1 ? (oldCountA - 1) * (oldCountA - 1) : 0;
    const newPenaltyA = oldCountA > 2 ? (oldCountA - 2) * (oldCountA - 2) : 0;
    const oldPenaltyB = oldCountB > 1 ? (oldCountB - 1) * (oldCountB - 1) : 0;
    const newPenaltyB = (oldCountB) * (oldCountB);
    delta += (newPenaltyA - oldPenaltyA) + (newPenaltyB - oldPenaltyB);
  }

  for (let i = 0; i < heatsInRound[heatB].length; i++) {
    if (i === posB) continue;
    const other = heatsInRound[heatB][i];
    const oldKeyB = pairKey(skipperB, other);
    const newKeyA = pairKey(skipperA, other);
    const oldCountB = pairCounts.get(oldKeyB) || 0;
    const oldCountA = pairCounts.get(newKeyA) || 0;
    const oldPenaltyB = oldCountB > 1 ? (oldCountB - 1) * (oldCountB - 1) : 0;
    const newPenaltyB = oldCountB > 2 ? (oldCountB - 2) * (oldCountB - 2) : 0;
    const oldPenaltyA = oldCountA > 1 ? (oldCountA - 1) * (oldCountA - 1) : 0;
    const newPenaltyA = (oldCountA) * (oldCountA);
    delta += (newPenaltyB - oldPenaltyB) + (newPenaltyA - oldPenaltyA);
  }

  return delta;
}

function applySwap(
  allRounds: number[][][],
  pairCounts: Map<string, number>,
  roundIdx: number,
  heatA: number,
  posA: number,
  heatB: number,
  posB: number
): void {
  const heatsInRound = allRounds[roundIdx];
  const skipperA = heatsInRound[heatA][posA];
  const skipperB = heatsInRound[heatB][posB];

  for (let i = 0; i < heatsInRound[heatA].length; i++) {
    if (i === posA) continue;
    const other = heatsInRound[heatA][i];
    const keyA = pairKey(skipperA, other);
    pairCounts.set(keyA, (pairCounts.get(keyA) || 1) - 1);
    const keyB = pairKey(skipperB, other);
    pairCounts.set(keyB, (pairCounts.get(keyB) || 0) + 1);
  }
  for (let i = 0; i < heatsInRound[heatB].length; i++) {
    if (i === posB) continue;
    const other = heatsInRound[heatB][i];
    const keyB = pairKey(skipperB, other);
    pairCounts.set(keyB, (pairCounts.get(keyB) || 1) - 1);
    const keyA = pairKey(skipperA, other);
    pairCounts.set(keyA, (pairCounts.get(keyA) || 0) + 1);
  }

  heatsInRound[heatA][posA] = skipperB;
  heatsInRound[heatB][posB] = skipperA;
}

/**
 * SHR Rule 3.2: Balanced Assignments.
 * Generates all qualifying round heat assignments before racing using a globally
 * optimized algorithm that maximizes opponent diversity across all rounds:
 * 1. Generates initial round assignments using balanced block rotation
 * 2. Performs global hill-climbing optimization across ALL rounds simultaneously
 * 3. Uses squared-duplicate scoring to aggressively eliminate repeated pairings
 * 4. Every skipper races exactly once per round; heat sizes remain balanced
 */
export function generatePreSetQualifyingAssignments(
  initialAssignments: { heatDesignation: string; skipperIndices: number[] }[],
  numberOfHeats: number,
  qualifyingRounds: number
): { heatDesignation: string; skipperIndices: number[] }[][] {
  const allSkippers: number[] = [];
  for (const a of initialAssignments) {
    allSkippers.push(...a.skipperIndices);
  }
  const N = allSkippers.length;
  const heatLabels = initialAssignments.map(a => a.heatDesignation);
  const targetSizes = initialAssignments.map(a => a.skipperIndices.length);

  if (qualifyingRounds <= 1 || N < numberOfHeats * 2) {
    return [initialAssignments.map(a => ({
      heatDesignation: a.heatDesignation,
      skipperIndices: [...a.skipperIndices]
    }))];
  }

  // Phase 1: Build initial assignments using block rotation for maximum spread
  const allRoundsRaw: number[][][] = [];

  const round1: number[][] = initialAssignments.map(a => [...a.skipperIndices]);
  allRoundsRaw.push(round1);

  for (let r = 1; r < qualifyingRounds; r++) {
    const blockSize = Math.ceil(N / numberOfHeats);
    const offset = r * blockSize;
    const rotated: number[] = allSkippers.map((_, i) => allSkippers[(i + offset) % N]);

    const roundHeats: number[][] = [];
    let idx = 0;
    for (let h = 0; h < numberOfHeats; h++) {
      const heat: number[] = [];
      for (let s = 0; s < targetSizes[h] && idx < N; s++) {
        heat.push(rotated[idx]);
        idx++;
      }
      roundHeats.push(heat);
    }
    allRoundsRaw.push(roundHeats);
  }

  // Phase 2: Global hill-climbing optimization across all rounds simultaneously
  const pairCounts = buildPairCounts(allRoundsRaw);
  let currentScore = computeGlobalDuplicateScore(pairCounts);

  const MAX_PASSES = 20;
  for (let pass = 0; pass < MAX_PASSES && currentScore > 0; pass++) {
    let improved = false;

    for (let r = 1; r < qualifyingRounds; r++) {
      const heatsInRound = allRoundsRaw[r];

      for (let hA = 0; hA < numberOfHeats; hA++) {
        for (let hB = hA + 1; hB < numberOfHeats; hB++) {
          if (heatsInRound[hA].length === 0 || heatsInRound[hB].length === 0) continue;

          let bestDelta = 0;
          let bestPA = -1, bestPB = -1;

          for (let pA = 0; pA < heatsInRound[hA].length; pA++) {
            for (let pB = 0; pB < heatsInRound[hB].length; pB++) {
              const delta = computeSwapDelta(allRoundsRaw, pairCounts, r, hA, pA, hB, pB);
              if (delta < bestDelta) {
                bestDelta = delta;
                bestPA = pA;
                bestPB = pB;
              }
            }
          }

          if (bestDelta < 0) {
            applySwap(allRoundsRaw, pairCounts, r, hA, bestPA, hB, bestPB);
            currentScore += bestDelta;
            improved = true;
          }
        }
      }
    }

    if (!improved) break;
  }

  // Phase 3: Targeted pass to eliminate remaining high-overlap pairs
  if (currentScore > 0) {
    const worstPairs: [number, number][] = [];
    for (const [key, count] of pairCounts.entries()) {
      if (count > 1) {
        const [a, b] = key.split('-').map(Number);
        worstPairs.push([a, b]);
      }
    }

    for (const [skipA, skipB] of worstPairs) {
      if ((pairCounts.get(pairKey(skipA, skipB)) || 0) <= 1) continue;

      let bestDelta = 0;
      let bestR = -1, bestHA = -1, bestPA = -1, bestHB = -1, bestPB = -1;

      for (let r = 1; r < qualifyingRounds; r++) {
        const heatsInRound = allRoundsRaw[r];
        let foundHeat = -1, foundPos = -1;
        let partnerHeat = -1, partnerPos = -1;

        for (let h = 0; h < numberOfHeats; h++) {
          for (let p = 0; p < heatsInRound[h].length; p++) {
            if (heatsInRound[h][p] === skipA) { foundHeat = h; foundPos = p; }
            if (heatsInRound[h][p] === skipB) { partnerHeat = h; partnerPos = p; }
          }
        }

        if (foundHeat === -1 || partnerHeat === -1 || foundHeat !== partnerHeat) continue;

        for (let otherH = 0; otherH < numberOfHeats; otherH++) {
          if (otherH === foundHeat) continue;
          for (let otherP = 0; otherP < heatsInRound[otherH].length; otherP++) {
            const delta = computeSwapDelta(allRoundsRaw, pairCounts, r, foundHeat, foundPos, otherH, otherP);
            if (delta < bestDelta) {
              bestDelta = delta;
              bestR = r; bestHA = foundHeat; bestPA = foundPos;
              bestHB = otherH; bestPB = otherP;
            }
            const delta2 = computeSwapDelta(allRoundsRaw, pairCounts, r, partnerHeat, partnerPos, otherH, otherP);
            if (delta2 < bestDelta) {
              bestDelta = delta2;
              bestR = r; bestHA = partnerHeat; bestPA = partnerPos;
              bestHB = otherH; bestPB = otherP;
            }
          }
        }
      }

      if (bestDelta < 0) {
        applySwap(allRoundsRaw, pairCounts, bestR, bestHA, bestPA, bestHB, bestPB);
        currentScore += bestDelta;
      }
    }
  }

  return allRoundsRaw.map(roundHeats =>
    roundHeats.map((heat, i) => ({
      heatDesignation: heatLabels[i],
      skipperIndices: heat
    }))
  );
}

/**
 * SHR Initial Seeding - Index Based
 * Sorts skippers by sail number, then distributes using SHR snake pattern.
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

  console.log('SHR seeding:', sortedIndices.length, 'skippers into', numberOfHeats, 'heats. Sizes:', heatBuckets.map(b => b.length).join(', '));

  return heatBuckets.map((indices, i) => ({
    heatDesignation: heatLabels[i],
    skipperIndices: indices
  }));
}

/**
 * Add new skippers to existing SHRS heat assignments mid-event.
 * For already-completed rounds, assignments are left untouched (callers give DNS/DNC).
 * For future uncompleted rounds, each new skipper is placed into the smallest heat
 * to maintain balance, rotating the target heat across rounds for opponent variety.
 */
export function addSkippersToSHRSAssignments(
  rounds: { round: number; heatAssignments: { heatDesignation: string; skipperIndices: number[] }[]; results: any[]; completed: boolean }[],
  newSkipperIndices: number[],
  numberOfHeats: number
): { round: number; heatAssignments: { heatDesignation: string; skipperIndices: number[] }[]; results: any[]; completed: boolean }[] {
  if (newSkipperIndices.length === 0) return rounds;

  return rounds.map(round => {
    if (round.completed || (round.results && round.results.length > 0)) {
      return round;
    }

    const updatedAssignments = round.heatAssignments.map(a => ({
      ...a,
      skipperIndices: [...a.skipperIndices]
    }));

    for (const skipperIdx of newSkipperIndices) {
      const alreadyAssigned = updatedAssignments.some(a => a.skipperIndices.includes(skipperIdx));
      if (alreadyAssigned) continue;

      let smallestHeatIdx = 0;
      let smallestSize = updatedAssignments[0].skipperIndices.length;
      for (let h = 1; h < updatedAssignments.length; h++) {
        if (updatedAssignments[h].skipperIndices.length < smallestSize) {
          smallestSize = updatedAssignments[h].skipperIndices.length;
          smallestHeatIdx = h;
        }
      }
      updatedAssignments[smallestHeatIdx].skipperIndices.push(skipperIdx);
    }

    return { ...round, heatAssignments: updatedAssignments };
  });
}

/**
 * Validate SHR configuration
 */
export function validateSHRSConfig(config: SHRSConfig, skipperCount: number): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (config.numberOfHeats < 2 || config.numberOfHeats > 5) {
    errors.push('SHR requires between 2 and 5 heats.');
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

/**
 * Estimates opponent diversity metrics for given SHRS Pre-Assigned parameters.
 * Uses combinatorial analysis without running the full optimization.
 * Returns cumulative diversity stats at each qualifying round checkpoint.
 */
export function estimateDiversityMetrics(
  totalSkippers: number,
  numberOfHeats: number,
  qualifyingRounds: number
): {
  roundStats: { round: number; avgUnique: number; minUnique: number; efficiency: number }[];
  totalPossibleOpponents: number;
  pairsPerRound: number;
  theoreticalMinRounds: number;
  recommendedMinRounds: number;
} {
  const totalPossibleOpponents = totalSkippers - 1;
  const baseSizeArr: number[] = [];
  const baseSize = Math.floor(totalSkippers / numberOfHeats);
  const remainder = totalSkippers % numberOfHeats;
  for (let h = 0; h < numberOfHeats; h++) {
    baseSizeArr.push(baseSize + (h < remainder ? 1 : 0));
  }

  let pairsPerRound = 0;
  for (const sz of baseSizeArr) {
    pairsPerRound += (sz * (sz - 1)) / 2;
  }

  const totalPairings = (totalSkippers * totalPossibleOpponents) / 2;
  const theoreticalMinRounds = totalPairings / pairsPerRound;

  const avgHeatSize = totalSkippers / numberOfHeats;
  const newOpponentsPerRound = avgHeatSize - 1;

  const roundStats: { round: number; avgUnique: number; minUnique: number; efficiency: number }[] = [];

  for (let r = 1; r <= qualifyingRounds; r++) {
    let avgUnique: number;
    if (r === 1) {
      avgUnique = newOpponentsPerRound;
    } else {
      const coverageFraction = 1 - Math.pow(1 - (newOpponentsPerRound / totalPossibleOpponents), r);
      const optimizerBoost = Math.min(0.06, 0.015 * r);
      avgUnique = Math.min(totalPossibleOpponents, totalPossibleOpponents * (coverageFraction + optimizerBoost));
    }
    avgUnique = Math.min(totalPossibleOpponents, Math.round(avgUnique * 10) / 10);
    const minUnique = Math.max(1, Math.round(avgUnique * (0.88 + 0.012 * r)));
    const efficiency = Math.round((avgUnique / totalPossibleOpponents) * 1000) / 10;

    roundStats.push({ round: r, avgUnique, minUnique, efficiency });
  }

  const targetEfficiency = 95;
  let recommendedMinRounds = qualifyingRounds;
  for (let r = 2; r <= 20; r++) {
    const coverageFraction = 1 - Math.pow(1 - (newOpponentsPerRound / totalPossibleOpponents), r);
    const optimizerBoost = Math.min(0.06, 0.015 * r);
    const eff = Math.min(100, (coverageFraction + optimizerBoost) * 100);
    if (eff >= targetEfficiency) {
      recommendedMinRounds = r;
      break;
    }
  }

  return {
    roundStats,
    totalPossibleOpponents,
    pairsPerRound,
    theoreticalMinRounds: Math.round(theoreticalMinRounds * 100) / 100,
    recommendedMinRounds
  };
}
