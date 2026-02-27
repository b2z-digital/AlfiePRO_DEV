import { HeatDesignation, HeatResult, HeatManagement, HeatAssignment, HeatRound } from '../types/heat';
import { Skipper } from '../types';
import { RoundResult } from '../types/race';
import { LetterScore } from '../types/letterScores';

// Type alias for clarity - RoundResult stores individual skipper results per race
type SkipperRaceResult = RoundResult & { race: number; skipperIndex: number };

/**
 * HMS Heat Management System
 * Implements HMS 2007 & HMS 2022 rules for heat racing with promotion/relegation
 */

export type SeedingMethod = 'random' | 'manual' | 'ranking';
export type PromotionSchedule = 'A' | 'B' | 'C';

export interface HMSConfig {
  numberOfHeats: number;
  promotionCount: number; // 4 or 6 typically
  seedingMethod: SeedingMethod;
  maxHeatSize?: number; // Safety limit
}

/**
 * Get the promotion schedule to use based on race number and configuration
 * Race 2: Schedule A (redistribute all skippers based on R1 overall fleet ranking)
 * Race 3+: Schedule B/C (normal 4-up/4-down or 6-up/6-down promotion/relegation)
 */
export function getPromotionSchedule(raceNumber: number, promotionCount: number): PromotionSchedule {
  // Race 2: Apply Schedule A after seeding round to redistribute all skippers
  if (raceNumber === 2) {
    return 'A';
  }
  // Race 3+: Use Schedule B or C for normal promotion/relegation
  return promotionCount === 6 ? 'C' : 'B';
}

/**
 * Calculate tie-break position for skippers with same total score
 * HMS rules: Use all races INCLUDING discards for tie-break
 * Exclude Race 1 from tie-break calculations per HMS
 * Compare: number of 1sts, then 2nds, then 3rds, etc.
 * If still tied, use last race result
 */
export function breakTie(
  skipperIndices: number[],
  allResults: SkipperRaceResult[],
  discardedRaces: Map<number, number[]>
): number[] {
  if (skipperIndices.length <= 1) return skipperIndices;

  // Get all results for these skippers, EXCLUDING Race 1
  const skipperResults = skipperIndices.map(skipperIdx => {
    const results = allResults
      .filter(r => r.skipperIndex === skipperIdx && r.race > 1) // Exclude Race 1
      .sort((a, b) => (a.position || 999) - (b.position || 999));
    return { skipperIdx, results };
  });

  // Compare by counting 1sts, 2nds, 3rds, etc.
  for (let position = 1; position <= 20; position++) {
    const counts = skipperResults.map(sr => ({
      skipperIdx: sr.skipperIdx,
      count: sr.results.filter(r => r.position === position).length
    }));

    // Sort by this position count (descending)
    counts.sort((a, b) => b.count - a.count);

    // If there's a clear winner at this position, use that order
    if (counts[0].count > counts[1]?.count) {
      const sorted = counts.map(c => c.skipperIdx);
      // Return in the order that maintains ties for those still tied
      return sorted;
    }
  }

  // Still tied? Use last race result
  const lastRaceNum = Math.max(...allResults.map(r => r.race));
  const lastRaceResults = allResults.filter(r => r.race === lastRaceNum);

  return skipperIndices.sort((a, b) => {
    const aResult = lastRaceResults.find(r => r.skipperIndex === a);
    const bResult = lastRaceResults.find(r => r.skipperIndex === b);
    const aPos = aResult?.position || 999;
    const bPos = bResult?.position || 999;
    return aPos - bPos;
  });
}

/**
 * Calculate fleet board - overall ranking of all skippers across all heats
 * Returns sorted array of skipper indices with their current overall positions
 */
export function calculateFleetBoard(
  allResults: SkipperRaceResult[],
  skippers: Skipper[],
  dropRules: number[]
): Array<{ skipperIndex: number; totalScore: number; position: number; discards: number[] }> {
  const skipperScores = new Map<number, { scores: number[]; races: number[] }>();

  // Initialize all skippers
  skippers.forEach((_, idx) => {
    skipperScores.set(idx, { scores: [], races: [] });
  });

  // Collect all scores
  allResults.forEach(result => {
    const skipperData = skipperScores.get(result.skipperIndex);
    if (skipperData && result.position) {
      skipperData.scores.push(result.position);
      skipperData.races.push(result.race);
    }
  });

  // Calculate total scores with discards
  const scoredSkippers = Array.from(skipperScores.entries()).map(([skipperIndex, data]) => {
    const { scores, races } = data;

    // Determine number of discards for this skipper
    const completedRaces = scores.length;
    let numDiscards = 0;
    for (const dropAfter of dropRules) {
      if (completedRaces >= dropAfter) {
        numDiscards++;
      }
    }

    // Sort scores to find worst scores to discard
    const sortedScores = [...scores].sort((a, b) => b - a); // Descending
    const discardedScores = sortedScores.slice(0, numDiscards);
    const discardedRaceIndices: number[] = [];

    // Find which races were discarded
    discardedScores.forEach(score => {
      const idx = scores.findIndex((s, i) => s === score && !discardedRaceIndices.includes(races[i]));
      if (idx !== -1) {
        discardedRaceIndices.push(races[idx]);
      }
    });

    // Calculate total (excluding discards)
    const totalScore = scores.reduce((sum, score, idx) => {
      return discardedRaceIndices.includes(races[idx]) ? sum : sum + score;
    }, 0);

    return {
      skipperIndex,
      totalScore,
      discards: discardedRaceIndices,
      races: completedRaces
    };
  });

  // Sort by total score (ascending)
  scoredSkippers.sort((a, b) => {
    if (a.totalScore === b.totalScore) {
      // Tie-break
      const tied = breakTie([a.skipperIndex, b.skipperIndex], allResults, new Map());
      return tied.indexOf(a.skipperIndex) - tied.indexOf(b.skipperIndex);
    }
    return a.totalScore - b.totalScore;
  });

  // Assign positions
  return scoredSkippers.map((skipper, idx) => ({
    ...skipper,
    position: idx + 1
  }));
}

/**
 * Seed skippers into initial heats for Race 1
 */
export function seedInitialHeats(
  skippers: Skipper[],
  config: HMSConfig,
  rankingData?: Array<{ skipperIndex: number; ranking: number }>
): HeatAssignment[] {
  const { numberOfHeats, seedingMethod } = config;
  const heats: HeatDesignation[] = (['A', 'B', 'C', 'D', 'E', 'F'] as HeatDesignation[]).slice(0, numberOfHeats);

  let orderedSkipperIndices = skippers.map((_, idx) => idx);

  // Apply seeding method
  if (seedingMethod === 'random') {
    // Fisher-Yates shuffle
    for (let i = orderedSkipperIndices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [orderedSkipperIndices[i], orderedSkipperIndices[j]] = [orderedSkipperIndices[j], orderedSkipperIndices[i]];
    }
  } else if (seedingMethod === 'ranking' && rankingData) {
    // Sort by ranking (lower is better)
    orderedSkipperIndices.sort((a, b) => {
      const aRank = rankingData.find(r => r.skipperIndex === a)?.ranking || 999;
      const bRank = rankingData.find(r => r.skipperIndex === b)?.ranking || 999;
      return aRank - bRank;
    });
  }
  // For manual, keep the current order (will be adjusted by UI or already assigned)

  // Distribute skippers into heats
  // Heat A (index 0) = TOP heat with best skippers
  // Heat F (index 5) = BOTTOM heat with lowest skilled skippers
  // HMS 2007: Distribute extras to create BALANCED heat sizes (not all to A)
  const heatAssignments: HeatAssignment[] = heats.map(heat => ({
    heatDesignation: heat,
    skipperIndices: []
  }));

  // Calculate base size per heat and distribute extras evenly
  const heatSizes = calculateHMSHeatSizes(skippers.length, numberOfHeats);

  console.log('HMS Heat Size Distribution:', heatSizes);

  // Assign skippers sequentially to each heat based on calculated sizes
  let skipperIdx = 0;

  for (let heatIndex = 0; heatIndex < numberOfHeats; heatIndex++) {
    const heatSize = heatSizes[heatIndex];

    for (let i = 0; i < heatSize && skipperIdx < orderedSkipperIndices.length; i++) {
      heatAssignments[heatIndex].skipperIndices.push(orderedSkipperIndices[skipperIdx]);
      skipperIdx++;
    }
  }

  return heatAssignments;
}

/**
 * Calculate HMS 2007 compliant heat sizes
 * Distributes extras to create balanced heat sizes where max difference is 1
 *
 * Examples from HMS 2007 document with 29 skippers:
 * - 2 heats: [15, 14] - extra to A
 * - 3 heats: [10, 9, 10] - extras to A and C (balanced)
 * - 4 heats: [7, 8, 7, 7] - extra to B
 */
export function calculateHMSHeatSizes(totalSkippers: number, numberOfHeats: number): number[] {
  const baseSize = Math.floor(totalSkippers / numberOfHeats);
  const remainder = totalSkippers % numberOfHeats;

  // Initialize all heats with base size
  const heatSizes: number[] = Array(numberOfHeats).fill(baseSize);

  if (remainder === 0) {
    return heatSizes;
  }

  // Distribute extras to create balanced heats
  // Strategy: For odd number of heats, extras go to outer heats first (A, then last, alternating)
  // For even number of heats with 1 extra, give to middle-upper heat (B)

  if (numberOfHeats === 2) {
    // 2 heats: extra goes to Heat A
    heatSizes[0] += remainder;
  } else if (numberOfHeats === 3) {
    // 3 heats: distribute to A and C first, then B
    // For remainder 1: give to A
    // For remainder 2: give to A and C
    if (remainder >= 1) heatSizes[0]++;
    if (remainder >= 2) heatSizes[2]++;
  } else if (numberOfHeats === 4) {
    // 4 heats: distribute extras starting from B, then A, then C, then D
    // For remainder 1: give to B (middle-upper)
    // For remainder 2: give to B and C
    // For remainder 3: give to B, C, A
    const distributionOrder = [1, 2, 0, 3]; // B, C, A, D
    for (let i = 0; i < remainder && i < numberOfHeats; i++) {
      heatSizes[distributionOrder[i]]++;
    }
  } else if (numberOfHeats === 5) {
    // 5 heats: distribute to middle heats first, then outer
    const distributionOrder = [2, 1, 3, 0, 4]; // C, B, D, A, E
    for (let i = 0; i < remainder && i < numberOfHeats; i++) {
      heatSizes[distributionOrder[i]]++;
    }
  } else if (numberOfHeats === 6) {
    // 6 heats: distribute to middle heats first
    const distributionOrder = [2, 3, 1, 4, 0, 5]; // C, D, B, E, A, F
    for (let i = 0; i < remainder && i < numberOfHeats; i++) {
      heatSizes[distributionOrder[i]]++;
    }
  } else {
    // Default: distribute evenly starting from middle
    for (let i = 0; i < remainder; i++) {
      const targetIndex = Math.floor(numberOfHeats / 2) + (i % 2 === 0 ? i / 2 : -Math.ceil(i / 2));
      if (targetIndex >= 0 && targetIndex < numberOfHeats) {
        heatSizes[targetIndex]++;
      }
    }
  }

  return heatSizes;
}

/**
 * Apply Schedule A promotion/relegation (for Race 2 only - AFTER SEEDING HEATS)
 * After seeding heats (Round 1): Redistribute all skippers into ranked heats
 * based on OVERALL performance ranking across all heats
 *
 * CRITICAL: Must use overall fleet standings, NOT heat-specific positions
 *
 * Algorithm:
 * 1. Collect all results from all heats
 * 2. Sort by position (overall score) - this gives us the fleet board ranking
 * 3. Fill heats sequentially: Top N skippers → Heat A, Next N → Heat B, etc.
 *
 * Example with 22 skippers total, 2 heats:
 * - Heat A (top 11): Overall positions 1-11
 * - Heat B (next 11): Overall positions 12-22
 */
function applyScheduleA(
  currentHeatAssignments: HeatAssignment[],
  heatResults: Map<HeatDesignation, HeatResult[]>,
  config: HMSConfig
): HeatAssignment[] {
  const { numberOfHeats, promotionCount } = config;
  const heats: HeatDesignation[] = (['A', 'B', 'C', 'D', 'E', 'F'] as HeatDesignation[]).slice(0, numberOfHeats);

  console.log('\n\n========================================');
  console.log('=== Apply Schedule A (Seeding → Ranked Heats) ===');
  console.log('Number of heats:', numberOfHeats);
  console.log('Available heats:', heats);

  // Log ALL heat results to debug
  console.log('\n=== Raw Heat Results Data ===');
  heats.forEach(heat => {
    const results = heatResults.get(heat) || [];
    console.log(`\nHeat ${heat} (${results.length} results):`);
    results.forEach(r => {
      console.log(`  Skipper #${r.skipperIndex}: position=${r.position}, race=${r.race}, round=${r.round}, letterScore=${r.letterScore || 'none'}`);
    });
  });

  const newAssignments: HeatAssignment[] = heats.map(heat => ({
    heatDesignation: heat,
    skipperIndices: []
  }));

  // Collect ALL results from ALL heats
  const allResults: Array<{ skipperIndex: number; position: number; heat: HeatDesignation }> = [];

  heats.forEach(heat => {
    const results = heatResults.get(heat) || [];

    results
      .filter(r => r.position !== null && !r.letterScore)
      .forEach(r => {
        allResults.push({
          skipperIndex: r.skipperIndex,
          position: r.position!,
          heat
        });
      });
  });

  console.log(`Total results collected: ${allResults.length}`);

  // Calculate overall positions using NET SCORE logic (same as Overall Results modal)
  // During Round 1 (seeding heats), all heats are EQUAL - we need to rank by actual finish position
  // which is the position within their heat (1st in any heat = 1 point, 2nd = 2 points, etc.)
  console.log('\n=== Overall Fleet Ranking (by finish position) ===');

  // Collect all skipper results
  const skipperScores = new Map<number, { position: number; heat: HeatDesignation }>();

  heats.forEach(heat => {
    const heatResultsArray = heatResults.get(heat) || [];
    heatResultsArray.forEach(result => {
      if (result.position !== null && !result.letterScore) {
        skipperScores.set(result.skipperIndex, {
          position: result.position,
          heat
        });
      }
    });
  });

  // HMS SCHEDULE A: Complete redistribution based on overall fleet ranking
  // After seeding round, ALL skippers are re-ranked by their finish position and redistributed
  // CRITICAL: Leave P promotion slots OPEN in upper heats (A, B, etc.) for mid-round promotions
  // - Heat A: Gets (target - P) top skippers + P empty slots (filled when B completes)
  // - Heat B: Gets (target - P) next skippers + P empty slots (filled when C completes)
  // - Heat C (bottom): Gets ALL remaining skippers (no P slots)
  console.log(`\n=== Schedule A: Full Redistribution with P=${promotionCount} Promotion Slots ===`);

  // Collect all skippers with their finish positions from ALL heats
  const allSkipperResults: Array<{
    skipperIndex: number;
    position: number;
    heat: HeatDesignation;
    hasLetterScore: boolean;
    letterScore?: LetterScore;
    originalHeatIndex: number;
  }> = [];

  heats.forEach((heat, heatIdx) => {
    const heatResultsArray = heatResults.get(heat) || [];
    heatResultsArray.forEach(result => {
      allSkipperResults.push({
        skipperIndex: result.skipperIndex,
        position: result.position || 999,
        heat,
        hasLetterScore: !!result.letterScore,
        letterScore: result.letterScore,
        originalHeatIndex: heatIdx
      });
    });
  });

  // Separate RDG/DPI from other letter scores
  // RDG/DPI: drop down ONE heat (handled separately)
  // Other letter scores (DNF, DNS, etc.): go to bottom heat
  const validResults = allSkipperResults.filter(r => !r.hasLetterScore && r.position !== 999);
  const rdgResults = allSkipperResults.filter(r => r.letterScore === 'RDG' || r.letterScore === 'DPI');
  const letterScoreResults = allSkipperResults.filter(r =>
    (r.hasLetterScore || r.position === 999) &&
    r.letterScore !== 'RDG' &&
    r.letterScore !== 'DPI'
  );

  console.log(`\nSkipper categorization:`);
  console.log(`  Valid results: ${validResults.length}`);
  console.log(`  RDG/DPI (drop 1 heat): ${rdgResults.length}`);
  if (rdgResults.length > 0) {
    rdgResults.forEach(r => {
      console.log(`    🔽 Skipper #${r.skipperIndex} in Heat ${r.heat} will drop to Heat ${heats[r.originalHeatIndex + 1] || r.heat} (RDG/DPI)`);
    });
  }
  console.log(`  Other letter scores (bottom heat): ${letterScoreResults.length}`);

  // Sort valid results by position to get overall fleet ranking
  // Lower position = better (1st place is position 1)
  validResults.sort((a, b) => a.position - b.position);

  console.log(`\nOverall Fleet Ranking (${validResults.length} valid results):`);
  validResults.forEach((r, idx) => {
    console.log(`  Rank ${idx + 1}: Skipper #${r.skipperIndex} (pos ${r.position} in Heat ${r.heat})`);
  });

  // Calculate target heat sizes (what each heat races with AFTER promotions)
  // Include RDG/DPI skippers in the total count
  const totalSkippers = validResults.length + rdgResults.length + letterScoreResults.length;
  const targetHeatSizes = calculateHMSHeatSizes(totalSkippers, numberOfHeats);

  console.log(`\nTotal skippers for next round: ${totalSkippers} (${validResults.length} valid + ${rdgResults.length} RDG/DPI + ${letterScoreResults.length} other letter scores)`);
  console.log(`Target Heat Sizes (after promotions): ${targetHeatSizes.join(', ')}`);

  // HMS SCHEDULE A: Full redistribution based on overall fleet ranking
  //
  // Key rules for mid-round promotions (P = promotion count, typically 4):
  // - Heat A: target - P (leaves P slots for promotions from Heat B)
  // - Middle heats (B, D, etc.): target (gains P from lower heat, loses P to higher heat, net 0)
  // - Bottom heat (C or F): remaining skippers (will lose P to the heat above)
  //
  // Example with 46 skippers, 3 heats, targets [16, 15, 15], P=4:
  // - Heat A: 16 - 4 = 12 skippers (top 12 overall) + 4 P slots
  // - Heat B: 15 skippers (positions 13-27) + 4 P slots (will gain 4 from C, lose 4 to A)
  // - Heat C: 19 skippers (positions 28-46) - bottom heat (will lose 4 to B)
  // - Total: 12 + 15 + 19 = 46

  const initialHeatSizes: number[] = new Array(numberOfHeats).fill(0);

  // Heat A: target - P (leaves room for promotions from Heat B)
  initialHeatSizes[0] = Math.max(0, targetHeatSizes[0] - promotionCount);

  // Middle heats (B, D, etc.): use target size
  // They gain P from below and lose P to above, so net change is 0
  for (let i = 1; i < numberOfHeats - 1; i++) {
    initialHeatSizes[i] = targetHeatSizes[i];
  }

  // Bottom heat: gets all remaining skippers
  const upperHeatsTotal = initialHeatSizes.slice(0, -1).reduce((sum, size) => sum + size, 0);
  initialHeatSizes[numberOfHeats - 1] = totalSkippers - upperHeatsTotal;

  console.log(`\nSchedule A Initial Assignment Sizes:`);
  console.log(`  Heat A: ${initialHeatSizes[0]} skippers + ${promotionCount} P slots (top performers)`);
  for (let i = 1; i < numberOfHeats; i++) {
    const heatLetter = heats[i];
    const isBottom = i === numberOfHeats - 1;
    const pSlotInfo = isBottom ? ' (bottom heat, no P slots)' : ` + ${promotionCount} P slots`;
    console.log(`  Heat ${heatLetter}: ${initialHeatSizes[i]} skippers${pSlotInfo}`);
  }
  console.log(`  Total: ${initialHeatSizes.reduce((a, b) => a + b, 0)} skippers`);

  // Distribute skippers to new heats based on overall ranking
  let currentRank = 0;

  for (let heatIdx = 0; heatIdx < numberOfHeats; heatIdx++) {
    const skipperIndices: number[] = [];
    const heatSize = initialHeatSizes[heatIdx];

    // Fill this heat with the next N skippers by rank
    for (let i = 0; i < heatSize && currentRank < validResults.length; i++) {
      skipperIndices.push(validResults[currentRank].skipperIndex);
      currentRank++;
    }

    // Add RDG/DPI skippers who drop down TO this heat (from heat above)
    // They move from heatIdx-1 to heatIdx
    if (heatIdx > 0) {
      const rdgDropToThisHeat = rdgResults.filter(r => r.originalHeatIndex === heatIdx - 1);
      rdgDropToThisHeat.forEach(r => {
        skipperIndices.push(r.skipperIndex);
        console.log(`  RDG/DPI relegation: Skipper #${r.skipperIndex} from Heat ${heats[heatIdx - 1]} → Heat ${heats[heatIdx]}`);
      });
    }

    // RDG/DPI in the lowest heat stay in the lowest heat (can't go lower)
    if (heatIdx === numberOfHeats - 1) {
      const rdgInLowestHeat = rdgResults.filter(r => r.originalHeatIndex === heatIdx);
      rdgInLowestHeat.forEach(r => {
        skipperIndices.push(r.skipperIndex);
        console.log(`  RDG/DPI in lowest heat: Skipper #${r.skipperIndex} stays in Heat ${heats[heatIdx]}`);
      });
    }

    // Add other letter scores to bottom heat only
    if (heatIdx === numberOfHeats - 1) {
      letterScoreResults.forEach(r => {
        skipperIndices.push(r.skipperIndex);
      });
    }

    newAssignments[heatIdx].skipperIndices = skipperIndices;
    // All non-bottom heats have P slots for mid-round promotions
    const isBottomHeat = heatIdx === numberOfHeats - 1;
    const pSlotInfo = !isBottomHeat ? ` + ${promotionCount} P slots` : '';
    console.log(`\nHeat ${heats[heatIdx]} (Round 2): ${skipperIndices.length} skippers${pSlotInfo} - [${skipperIndices.join(', ')}]`);
  }

  // Log final assignments
  console.log('\n=== Final Heat Assignments ===');
  newAssignments.forEach((assignment, idx) => {
    console.log(`Heat ${heats[idx]}: ${assignment.skipperIndices.length} skippers - [${assignment.skipperIndices.join(', ')}]`);
  });

  return newAssignments;
}

/**
 * Apply Schedule B or C (for Race 3+)
 *
 * HMS Schedule B/C for BETWEEN-ROUND assignments:
 * - PRESERVE the FINAL heat composition from the previous round
 * - After all mid-round promotions/relegations, each heat has its final roster
 * - These rosters carry forward to the next round
 * - Mid-round promotions/relegations happen DURING the round (handled separately in completeHeat)
 *
 * CRITICAL: Do NOT recalculate "top P from each heat" - that would undo the mid-round movements!
 */
function applyScheduleBC(
  currentHeatAssignments: HeatAssignment[],
  heatResults: Map<HeatDesignation, HeatResult[]>,
  config: HMSConfig
): HeatAssignment[] {
  const { numberOfHeats } = config;
  const heats: HeatDesignation[] = (['A', 'B', 'C', 'D', 'E', 'F'] as HeatDesignation[]).slice(0, numberOfHeats);

  console.log('\n========================================');
  console.log('=== Apply Schedule B/C (Between-Round Assignments) ===');
  console.log(`Number of heats: ${numberOfHeats}`);
  console.log('PRESERVING final heat composition from previous round (after all mid-round movements)');

  // Simply preserve the current heat assignments
  // The mid-round promotions/relegations have already been applied
  // We just need to copy them forward to the next round
  const newAssignments: HeatAssignment[] = currentHeatAssignments.map(assignment => ({
    heatDesignation: assignment.heatDesignation,
    skipperIndices: [...assignment.skipperIndices] // Copy the array
  }));

  // Log final assignments
  console.log('\n=== PRESERVED HEAT ASSIGNMENTS FOR NEXT ROUND ===');
  newAssignments.forEach((assignment) => {
    console.log(`Heat ${assignment.heatDesignation}: ${assignment.skipperIndices.length} skippers - [${assignment.skipperIndices.join(', ')}]`);
  });

  return newAssignments;
}

/**
 * Generate heat assignments for next race based on current results
 */
export function generateHeatAssignmentsForNextRace(
  currentRace: number,
  currentRound: HeatRound,
  config: HMSConfig
): HeatAssignment[] {
  const schedule = getPromotionSchedule(currentRace + 1, config.promotionCount);

  // Group results by heat
  const heatResults = new Map<HeatDesignation, HeatResult[]>();
  currentRound.results.forEach(result => {
    if (!heatResults.has(result.heatDesignation)) {
      heatResults.set(result.heatDesignation, []);
    }
    heatResults.get(result.heatDesignation)!.push(result);
  });

  if (schedule === 'A') {
    // Schedule A: Redistribute all skippers based on overall fleet ranking
    return applyScheduleA(currentRound.heatAssignments, heatResults, config);
  } else {
    // Schedule B/C: Normal promotion/relegation (4 or 6 up/down)
    return applyScheduleBC(currentRound.heatAssignments, heatResults, config);
  }
}

/**
 * Check if a skipper should be marked as "UP" (promoted to higher heat, doesn't score in current)
 */
export function shouldMarkAsUP(
  skipperIndex: number,
  heat: HeatDesignation,
  nextRoundAssignments: HeatAssignment[]
): boolean {
  // Find current heat index
  const heats: HeatDesignation[] = ['A', 'B', 'C', 'D', 'E', 'F'] as HeatDesignation[];
  const currentHeatIdx = heats.indexOf(heat);

  // Check if skipper is in a higher heat in next round
  for (let i = 0; i < currentHeatIdx; i++) {
    const higherHeat = nextRoundAssignments.find(a => a.heatDesignation === heats[i]);
    if (higherHeat?.skipperIndices.includes(skipperIndex)) {
      return true;
    }
  }

  return false;
}

/**
 * Calculate the optimal number of heats based on skipper count
 * Rules:
 * - Each heat should have 8 boats
 * - Minimum promotion/relegation is 2 boats (though 4 or 6 is recommended per HMS rules)
 * - Remaining boats (if any) go to the bottom heat
 *
 * Examples:
 * - 16 skippers = 2 heats (8 each)
 * - 24 skippers = 3 heats (8 each)
 * - 26 skippers = 3 heats (8, 8, 10 - extra 2 go to heat C)
 * - 32 skippers = 4 heats (8 each)
 */
export function calculateOptimalHeats(totalSkippers: number): {
  numberOfHeats: number;
  heatSizes: number[];
  promotionCount: number;
} {
  const MIN_FLEET_SIZE = 12;
  const MAX_FLEET_SIZE = 20;
  const MAX_HEATS = 5;
  const MIN_PROMOTION = 4;

  if (totalSkippers < 16) {
    return {
      numberOfHeats: 0,
      heatSizes: [],
      promotionCount: MIN_PROMOTION
    };
  }

  let numberOfHeats = 2;
  for (let h = 2; h <= MAX_HEATS; h++) {
    const avgSize = Math.ceil(totalSkippers / h);
    if (avgSize <= MAX_FLEET_SIZE && avgSize >= MIN_FLEET_SIZE) {
      numberOfHeats = h;
      break;
    }
    if (avgSize > MAX_FLEET_SIZE) {
      numberOfHeats = h + 1;
    }
  }

  numberOfHeats = Math.max(2, Math.min(numberOfHeats, MAX_HEATS));

  const baseSize = Math.floor(totalSkippers / numberOfHeats);
  const remainder = totalSkippers % numberOfHeats;
  const heatSizes = new Array(numberOfHeats).fill(baseSize);

  if (remainder > 0) {
    heatSizes[0] += remainder;
  }

  return {
    numberOfHeats,
    heatSizes,
    promotionCount: MIN_PROMOTION
  };
}

/**
 * Validate heat configuration
 */
export function validateHeatConfig(
  config: HMSConfig,
  totalSkippers: number
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (config.numberOfHeats < 2 || config.numberOfHeats > 6) {
    errors.push('Number of heats must be between 2 and 6');
  }

  // Enforce minimum promotion count of 2
  if (config.promotionCount < 2) {
    errors.push('Promotion count must be at least 2 boats');
  }

  // Warn if not using standard promotion counts
  if (config.promotionCount !== 4 && config.promotionCount !== 6) {
    warnings.push(`HMS rules recommend promotion count of 4 or 6. You have selected ${config.promotionCount}. This is permitted at the discretion of the race committee and as per the sailing instructions.`);
  }

  if (config.maxHeatSize && config.maxHeatSize < config.promotionCount * 2) {
    errors.push('Max heat size must be at least twice the promotion count');
  }

  const minSkippersPerHeat = config.promotionCount * 2;
  if (totalSkippers < minSkippersPerHeat * config.numberOfHeats) {
    errors.push(`Need at least ${minSkippersPerHeat * config.numberOfHeats} skippers for ${config.numberOfHeats} heats with ${config.promotionCount} promotions`);
  }

  // Minimum skippers for heat racing
  if (totalSkippers < 12) {
    errors.push('Need at least 12 skippers to enable heat racing');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
