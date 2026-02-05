import type { Skipper } from '../types';
import type { NationalRanking, HMSSeeding } from '../types/rankings';

/**
 * HMS Seeding Algorithm
 *
 * For seeding rounds, skippers are assigned to heats based on their national ranking
 * using a snake pattern:
 *
 * Example with 3 heats:
 * Rank 1 → Heat A
 * Rank 2 → Heat B
 * Rank 3 → Heat C
 * Rank 4 → Heat C (snake back)
 * Rank 5 → Heat B
 * Rank 6 → Heat A
 * Rank 7 → Heat A (start forward again)
 * Rank 8 → Heat B
 * ...
 */

export interface SkipperWithRanking extends Skipper {
  rank?: number;
  ranking?: NationalRanking;
}

/**
 * Assign skippers to heats using HMS seeding rules
 */
export function assignSkippersUsingHMSSeeding(
  skippers: SkipperWithRanking[],
  numberOfHeats: number,
  heatNames: string[] = []
): HMSSeeding[] {
  if (numberOfHeats < 1) {
    throw new Error('Number of heats must be at least 1');
  }

  // Generate heat names if not provided (A, B, C, ...)
  const finalHeatNames = heatNames.length === numberOfHeats
    ? heatNames
    : generateHeatNames(numberOfHeats);

  // Separate ranked and unranked skippers
  const rankedSkippers = skippers
    .filter(s => s.rank !== undefined && s.rank > 0)
    .sort((a, b) => (a.rank || 999) - (b.rank || 999));

  const unrankedSkippers = skippers.filter(s => !s.rank || s.rank <= 0);

  // Initialize heats
  const heats: HMSSeeding[] = finalHeatNames.map(name => ({
    heatName: name,
    skippers: []
  }));

  // Assign ranked skippers using snake pattern
  rankedSkippers.forEach((skipper, index) => {
    const heatIndex = getSnakePatternHeatIndex(index, numberOfHeats);
    heats[heatIndex].skippers.push({
      id: skipper.id,
      name: skipper.name,
      sailNumber: skipper.sailNumber || skipper.sailNo,
      rank: skipper.rank,
      ranking: skipper.ranking
    });
  });

  // Distribute unranked skippers evenly across heats
  unrankedSkippers.forEach((skipper, index) => {
    const heatIndex = index % numberOfHeats;
    heats[heatIndex].skippers.push({
      id: skipper.id,
      name: skipper.name,
      sailNumber: skipper.sailNumber || skipper.sailNo
    });
  });

  return heats;
}

/**
 * Calculate which heat a skipper should be in based on snake pattern
 *
 * @param skipperIndex 0-based index of the skipper
 * @param numberOfHeats Total number of heats
 * @returns 0-based heat index
 */
function getSnakePatternHeatIndex(skipperIndex: number, numberOfHeats: number): number {
  // Calculate which "cycle" we're in
  const cycleLength = numberOfHeats * 2;
  const positionInCycle = skipperIndex % cycleLength;

  // First half of cycle: go forward (0, 1, 2, ...)
  if (positionInCycle < numberOfHeats) {
    return positionInCycle;
  }

  // Second half of cycle: go backward (n-1, n-2, ..., 0)
  return cycleLength - positionInCycle - 1;
}

/**
 * Generate heat names (A, B, C, ... Z, AA, AB, ...)
 */
function generateHeatNames(count: number): string[] {
  const names: string[] = [];

  for (let i = 0; i < count; i++) {
    if (i < 26) {
      // A-Z
      names.push(String.fromCharCode(65 + i));
    } else {
      // AA, AB, AC, ...
      const firstLetter = String.fromCharCode(65 + Math.floor(i / 26) - 1);
      const secondLetter = String.fromCharCode(65 + (i % 26));
      names.push(firstLetter + secondLetter);
    }
  }

  return names;
}

/**
 * Preview HMS seeding assignment
 * Shows how skippers will be distributed before applying
 */
export function previewHMSSeeding(
  skippers: SkipperWithRanking[],
  numberOfHeats: number
): {
  heats: HMSSeeding[];
  summary: {
    totalSkippers: number;
    rankedSkippers: number;
    unrankedSkippers: number;
    skippersPerHeat: number[];
  };
} {
  const heats = assignSkippersUsingHMSSeeding(skippers, numberOfHeats);

  const rankedCount = skippers.filter(s => s.rank && s.rank > 0).length;
  const unrankedCount = skippers.length - rankedCount;

  return {
    heats,
    summary: {
      totalSkippers: skippers.length,
      rankedSkippers: rankedCount,
      unrankedSkippers: unrankedCount,
      skippersPerHeat: heats.map(h => h.skippers.length)
    }
  };
}

/**
 * Validate HMS seeding requirements
 */
export function validateHMSSeeding(
  skippers: SkipperWithRanking[],
  numberOfHeats: number
): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (skippers.length === 0) {
    errors.push('No skippers to assign');
  }

  if (numberOfHeats < 1) {
    errors.push('Number of heats must be at least 1');
  }

  if (skippers.length < numberOfHeats) {
    warnings.push(`You have ${skippers.length} skippers but ${numberOfHeats} heats. Some heats may be empty.`);
  }

  const rankedCount = skippers.filter(s => s.rank && s.rank > 0).length;
  const unrankedCount = skippers.length - rankedCount;

  if (rankedCount === 0) {
    warnings.push('No skippers have national rankings. HMS seeding will not be applied.');
  }

  if (unrankedCount > 0) {
    warnings.push(`${unrankedCount} skipper(s) do not have rankings and will be distributed evenly.`);
  }

  // Check for duplicate ranks
  const ranks = skippers
    .filter(s => s.rank && s.rank > 0)
    .map(s => s.rank as number);

  const duplicateRanks = ranks.filter((rank, index) => ranks.indexOf(rank) !== index);

  if (duplicateRanks.length > 0) {
    warnings.push(`Duplicate rankings found: ${[...new Set(duplicateRanks)].join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Get statistics about HMS seeding
 */
export function getHMSSeedingStats(heats: HMSSeeding[]): {
  totalSkippers: number;
  rankedSkippers: number;
  unrankedSkippers: number;
  skippersPerHeat: { heatName: string; count: number; rankedCount: number }[];
  averageSkippersPerHeat: number;
} {
  const totalSkippers = heats.reduce((sum, heat) => sum + heat.skippers.length, 0);
  const rankedSkippers = heats.reduce(
    (sum, heat) => sum + heat.skippers.filter(s => s.rank).length,
    0
  );
  const unrankedSkippers = totalSkippers - rankedSkippers;

  const skippersPerHeat = heats.map(heat => ({
    heatName: heat.heatName,
    count: heat.skippers.length,
    rankedCount: heat.skippers.filter(s => s.rank).length
  }));

  return {
    totalSkippers,
    rankedSkippers,
    unrankedSkippers,
    skippersPerHeat,
    averageSkippersPerHeat: totalSkippers / heats.length
  };
}
