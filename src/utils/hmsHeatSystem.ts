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
  promotionCountOverrides?: Record<number, number>; // Per-race promotion count overrides
  seedingMethod: SeedingMethod;
  maxHeatSize?: number; // Safety limit
}

/**
 * Get the promotion schedule to use based on race number and configuration
 * Race 1: No promotion (seeding round)
 * Race 2+: Schedule B (promote 4) or Schedule C (promote 6)
 * Per HMS VBA reference: Race 2 uses the SAME promotion/relegation as Race 3+
 */
export function getPromotionSchedule(raceNumber: number, promotionCount: number): PromotionSchedule {
  if (raceNumber <= 1) {
    return 'A'; // Not used for Race 1 (Promote=0), but return a value
  }
  return promotionCount === 6 ? 'C' : 'B';
}

/**
 * Calculate tie-break for skippers with same total score per HMS VBA rules.
 *
 * Algorithm (matches VBA exactly):
 * 1. Collect all race scores excluding Race 1 (when useHMS=true).
 *    Include discards -- all race scores are used for tie-breaking.
 * 2. Sort each skipper's scores from WORST to BEST (descending by value).
 * 3. Compare column by column: lowest value wins each column.
 * 4. If best-scores comparison fails, compare race finishes in REVERSE
 *    chronological order (last race first, working backwards). Per RRS A8.2.
 * 5. If still tied, return original order (unbreakable tie).
 */
export function breakTie(
  skipperIndices: number[],
  allResults: SkipperRaceResult[],
  discardedRaces: Map<number, number[]>,
  useHMS: boolean = true,
  manualTieBreaks?: Map<number, number>
): number[] {
  if (skipperIndices.length <= 1) return skipperIndices;

  const minRace = useHMS ? 2 : 1; // Exclude Race 1 when HMS mode

  // Phase 1: Best scores comparison (sorted worst-to-best, compared column by column)
  const skipperBestScores = skipperIndices.map(skipperIdx => {
    const scores = allResults
      .filter(r => r.skipperIndex === skipperIdx && r.race >= minRace && r.position)
      .map(r => Math.round((r.position || 999) * 10) / 10); // Round to 1 decimal like VBA
    scores.sort((a, b) => b - a); // Descending (worst first, best last) -- matches VBA LARGE()
    return { skipperIdx, scores };
  });

  // Find the maximum number of score columns to compare
  const maxCols = Math.max(...skipperBestScores.map(s => s.scores.length));

  // Compare column by column (VBA iterates through sorted scores)
  for (let col = 0; col < maxCols; col++) {
    const colValues = skipperBestScores.map(s => ({
      skipperIdx: s.skipperIdx,
      value: col < s.scores.length ? s.scores[col] : 999
    }));

    colValues.sort((a, b) => a.value - b.value); // Lowest wins

    // Check if first is uniquely best
    if (colValues.length >= 2 && colValues[0].value < colValues[1].value) {
      return colValues.map(c => c.skipperIdx);
    }
  }

  // Phase 2: Reverse chronological order of ALL race finishes (RRS A8.2)
  const allRaceNums = [...new Set(allResults
    .filter(r => r.race >= minRace)
    .map(r => r.race))]
    .sort((a, b) => b - a); // Last race first

  for (const raceNum of allRaceNums) {
    const raceResults = allResults.filter(r => r.race === raceNum);
    const racePositions = skipperIndices.map(skipperIdx => ({
      skipperIdx,
      position: raceResults.find(r => r.skipperIndex === skipperIdx)?.position || 999
    }));

    racePositions.sort((a, b) => a.position - b.position);

    if (racePositions.length >= 2 && racePositions[0].position < racePositions[1].position) {
      return racePositions.map(r => r.skipperIdx);
    }
  }

  // Phase 3: Manual tie-break values (race officer assigned)
  if (manualTieBreaks && manualTieBreaks.size > 0) {
    const withManual = skipperIndices
      .map(idx => ({ idx, tieBreak: manualTieBreaks.get(idx) ?? 999 }))
      .sort((a, b) => a.tieBreak - b.tieBreak);

    if (withManual.length >= 2 && withManual[0].tieBreak < withManual[1].tieBreak) {
      return withManual.map(m => m.idx);
    }
  }

  // Unbreakable tie -- return original order
  return skipperIndices;
}

/**
 * Calculate fleet board - overall ranking of all skippers across all heats
 * Returns sorted array of skipper indices with their current overall positions
 */
export function calculateFleetBoard(
  allResults: SkipperRaceResult[],
  skippers: Skipper[],
  dropRules: number[],
  numberOfHeats: number = 2,
  manualTieBreaks?: Map<number, number>
): Array<{ skipperIndex: number; totalScore: number; position: number; discards: number[] }> {
  const useHMS = numberOfHeats > 1;
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
      const tied = breakTie([a.skipperIndex, b.skipperIndex], allResults, new Map(), useHMS, manualTieBreaks);
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
 * Calculate HMS Schedule A heat sizes (for Race 1 seeding and Race 2 redistribution).
 * Per HMS rules: approximately equal heat sizes, extras go to the LOWEST (bottom) heat.
 *
 * Examples with 34 skippers:
 * - 3 heats: [11, 11, 12] - extra to C (bottom)
 * - 2 heats: [17, 17]
 *
 * Examples with 29 skippers:
 * - 3 heats: [9, 10, 10] - extras to B and C (bottom-first)
 * - 2 heats: [14, 15] - extra to B (bottom)
 */
export function calculateHMSHeatSizes(totalSkippers: number, numberOfHeats: number): number[] {
  const baseSize = Math.floor(totalSkippers / numberOfHeats);
  const remainder = totalSkippers % numberOfHeats;

  const heatSizes: number[] = Array(numberOfHeats).fill(baseSize);

  for (let i = 0; i < remainder; i++) {
    heatSizes[numberOfHeats - 1 - i]++;
  }

  return heatSizes;
}

/**
 * Calculate HMS Schedule B heat sizes (for Race 3+ redistribution).
 *
 * Per HMS 2022 v2 rules:
 * - The BOTTOM heat (lowest) gets the most skippers since it has no promotions from below
 * - Upper heats get fewer BASE skippers because they receive P promoted boats from the heat below
 * - Goal: each heat SAILS approximately the same number of boats
 *
 * Formula:
 *   upper_heat_base = floor((N - P) / H)
 *   bottom_heat_base = N - (H - 1) * upper_heat_base
 *   Remainder distributed to bottom heats first
 *
 * Each heat then SAILS: upper = base + P, bottom = base (no incoming promotions)
 *
 * Examples with P=4:
 * - 34 boats, 3 heats: A=10, B=10, C=14 (each sails 14)
 * - 29 boats, 3 heats: A=8, B=8, C=13 (A sails 12, B sails 12, C sails 13)
 * - 34 boats, 2 heats: A=15, B=19 (A sails 19, B sails 19)
 */
export function calculateScheduleBHeatSizes(totalSkippers: number, numberOfHeats: number, promotionCount: number): number[] {
  if (numberOfHeats <= 1) return [totalSkippers];

  const adjustedTotal = totalSkippers - promotionCount;
  const baseSize = Math.floor(adjustedTotal / numberOfHeats);
  const remainder = adjustedTotal % numberOfHeats;

  const heatSizes: number[] = Array(numberOfHeats).fill(baseSize);

  for (let i = 0; i < remainder; i++) {
    heatSizes[numberOfHeats - 1 - i]++;
  }

  heatSizes[numberOfHeats - 1] += promotionCount;

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

  // HMS SCHEDULE A: Complete redistribution based on overall fleet ranking.
  // After seeding round, ALL skippers are re-ranked by their finish position and redistributed
  // into balanced heats (extras go to bottom heat). Between-round swaps (Schedule B/C) then
  // maintain heat size consistency by swapping equal P skippers between adjacent heats.
  console.log(`\n=== Schedule A: Full Redistribution ===`);

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

  const initialHeatSizes: number[] = [...targetHeatSizes];

  console.log(`\nSchedule A Assignment Sizes:`);
  for (let i = 0; i < numberOfHeats; i++) {
    console.log(`  Heat ${heats[i]}: ${initialHeatSizes[i]} skippers`);
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
    console.log(`\nHeat ${heats[heatIdx]} (Round 2): ${skipperIndices.length} skippers - [${skipperIndices.join(', ')}]`);
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
 * Per HMS 2022 v2 rules: Full redistribution of ALL skippers based on overall
 * fleet board ranking (cumulative across ALL rounds) into heats sized according
 * to Schedule B4/B6.
 *
 * Schedule B sizes ensure each heat SAILS approximately the same number of boats:
 * - Upper heats get fewer BASE assignments (they receive P promoted from below)
 * - Bottom heat gets the most BASE assignments (no promotions from below)
 *
 * Special handling:
 * - RDG/DPI skippers are placed one heat LOWER than their ranking would indicate
 * - Other letter scores (DNS, DNF, DSQ, etc.) go to the bottom heat
 */
function applyScheduleBC(
  currentHeatAssignments: HeatAssignment[],
  heatResults: Map<HeatDesignation, HeatResult[]>,
  config: HMSConfig,
  allRoundsResults?: HeatResult[]
): HeatAssignment[] {
  const { numberOfHeats, promotionCount } = config;
  const heats: HeatDesignation[] = (['A', 'B', 'C', 'D', 'E', 'F'] as HeatDesignation[]).slice(0, numberOfHeats);

  console.log('\n========================================');
  console.log('=== Apply Schedule B/C (Full Redistribution by Fleet Board Ranking) ===');
  console.log(`Number of heats: ${numberOfHeats}, Promotion count (P): ${promotionCount}`);

  console.log('\nCurrent heat sizes:');
  currentHeatAssignments.forEach(a => {
    console.log(`  Heat ${a.heatDesignation}: ${a.skipperIndices.length} skippers`);
  });

  const newAssignments: HeatAssignment[] = heats.map(heat => ({
    heatDesignation: heat,
    skipperIndices: []
  }));

  const currentRoundSkipperInfo: Array<{
    skipperIndex: number;
    heat: HeatDesignation;
    hasLetterScore: boolean;
    letterScore?: LetterScore;
    originalHeatIndex: number;
  }> = [];

  heats.forEach((heat, heatIdx) => {
    const heatResultsArray = heatResults.get(heat) || [];
    heatResultsArray.forEach(result => {
      currentRoundSkipperInfo.push({
        skipperIndex: result.skipperIndex,
        heat,
        hasLetterScore: !!result.letterScore,
        letterScore: result.letterScore,
        originalHeatIndex: heatIdx
      });
    });
  });

  const rdgResults = currentRoundSkipperInfo.filter(r => r.letterScore === 'RDG' || r.letterScore === 'DPI');
  const letterScoreResults = currentRoundSkipperInfo.filter(r =>
    (r.hasLetterScore) &&
    r.letterScore !== 'RDG' &&
    r.letterScore !== 'DPI'
  );
  const rdgSkipperSet = new Set(rdgResults.map(r => r.skipperIndex));
  const letterScoreSkipperSet = new Set(letterScoreResults.map(r => r.skipperIndex));

  console.log(`\nSkipper categorization (current round):`);
  console.log(`  RDG/DPI (drop 1 heat): ${rdgResults.length}`);
  console.log(`  Other letter scores (bottom heat): ${letterScoreResults.length}`);

  const fleetBoardRanking = computeFleetBoardFromRounds(allRoundsResults || [], currentRoundSkipperInfo, numberOfHeats);

  const validRanked = fleetBoardRanking.filter(r =>
    !rdgSkipperSet.has(r.skipperIndex) && !letterScoreSkipperSet.has(r.skipperIndex)
  );

  console.log(`\nFleet Board Ranking (${validRanked.length} valid skippers):`);
  validRanked.forEach((r, idx) => {
    console.log(`  Rank ${idx + 1}: Skipper #${r.skipperIndex} (total score: ${r.totalScore})`);
  });

  const totalSkippers = validRanked.length + rdgResults.length + letterScoreResults.length;
  const targetHeatSizes = calculateScheduleBHeatSizes(totalSkippers, numberOfHeats, promotionCount);

  console.log(`\nSchedule B Heat Sizes for ${totalSkippers} skippers, ${numberOfHeats} heats, P=${promotionCount}:`);
  for (let i = 0; i < numberOfHeats; i++) {
    const sailsWith = i < numberOfHeats - 1 ? `(sails ${targetHeatSizes[i] + promotionCount} with promotions)` : `(sails ${targetHeatSizes[i]})`;
    console.log(`  Heat ${heats[i]}: ${targetHeatSizes[i]} base ${sailsWith}`);
  }
  console.log(`  Total base: ${targetHeatSizes.reduce((a, b) => a + b, 0)}`);

  let currentRank = 0;

  for (let heatIdx = 0; heatIdx < numberOfHeats; heatIdx++) {
    const skipperIndices: number[] = [];
    const heatSize = targetHeatSizes[heatIdx];

    for (let i = 0; i < heatSize && currentRank < validRanked.length; i++) {
      skipperIndices.push(validRanked[currentRank].skipperIndex);
      currentRank++;
    }

    if (heatIdx > 0) {
      const rdgDropToThisHeat = rdgResults.filter(r => r.originalHeatIndex === heatIdx - 1);
      rdgDropToThisHeat.forEach(r => {
        if (!skipperIndices.includes(r.skipperIndex)) {
          skipperIndices.push(r.skipperIndex);
          console.log(`  RDG/DPI relegation: Skipper #${r.skipperIndex} from Heat ${heats[heatIdx - 1]} -> Heat ${heats[heatIdx]}`);
        }
      });
    }

    if (heatIdx === numberOfHeats - 1) {
      const rdgInLowestHeat = rdgResults.filter(r => r.originalHeatIndex === heatIdx);
      rdgInLowestHeat.forEach(r => {
        if (!skipperIndices.includes(r.skipperIndex)) {
          skipperIndices.push(r.skipperIndex);
          console.log(`  RDG/DPI in lowest heat: Skipper #${r.skipperIndex} stays in Heat ${heats[heatIdx]}`);
        }
      });
    }

    if (heatIdx === numberOfHeats - 1) {
      letterScoreResults.forEach(r => {
        if (!skipperIndices.includes(r.skipperIndex)) {
          skipperIndices.push(r.skipperIndex);
        }
      });
    }

    newAssignments[heatIdx].skipperIndices = skipperIndices;
  }

  const seen = new Set<number>();
  for (let i = 0; i < newAssignments.length; i++) {
    const deduped: number[] = [];
    for (const idx of newAssignments[i].skipperIndices) {
      if (!seen.has(idx)) {
        seen.add(idx);
        deduped.push(idx);
      } else {
        console.warn(`DUPLICATE DETECTED: Skipper #${idx} already assigned to a higher heat, removing from Heat ${newAssignments[i].heatDesignation}`);
      }
    }
    newAssignments[i].skipperIndices = deduped;
  }

  console.log('\n=== HEAT ASSIGNMENTS FOR NEXT ROUND (Schedule B redistribution) ===');
  newAssignments.forEach(a => {
    console.log(`Heat ${a.heatDesignation}: ${a.skipperIndices.length} skippers - [${a.skipperIndices.join(', ')}]`);
  });

  return newAssignments;
}

/**
 * Compute fleet board ranking from all rounds' heat results.
 * Converts within-heat positions to overall positions per round using heat order,
 * then sums across all rounds to produce a cumulative ranking.
 */
function computeFleetBoardFromRounds(
  allRoundsResults: HeatResult[],
  currentRoundSkippers: Array<{ skipperIndex: number }>,
  numberOfHeats: number
): Array<{ skipperIndex: number; totalScore: number }> {
  const heats: HeatDesignation[] = (['A', 'B', 'C', 'D', 'E', 'F'] as HeatDesignation[]).slice(0, numberOfHeats);
  const allSkipperIndices = new Set(currentRoundSkippers.map(r => r.skipperIndex));

  const roundNumbers = [...new Set(allRoundsResults.map(r => r.round))].sort((a, b) => a - b);

  const skipperTotals = new Map<number, number>();
  allSkipperIndices.forEach(idx => skipperTotals.set(idx, 0));

  for (const roundNum of roundNumbers) {
    const roundResults = allRoundsResults.filter(r => r.round === roundNum);

    const resultsByHeat: Record<string, HeatResult[]> = {};
    roundResults.forEach(r => {
      if (!resultsByHeat[r.heatDesignation]) {
        resultsByHeat[r.heatDesignation] = [];
      }
      resultsByHeat[r.heatDesignation].push(r);
    });

    let overallPosition = 1;
    const roundPositions = new Map<number, number>();

    for (const heat of heats) {
      const heatResults = resultsByHeat[heat] || [];
      const finishers = heatResults
        .filter(r => r.position !== null && !r.letterScore)
        .sort((a, b) => (a.position || 999) - (b.position || 999));

      for (const result of finishers) {
        roundPositions.set(result.skipperIndex, overallPosition);
        overallPosition++;
      }
    }

    const totalSkippersThisRound = overallPosition - 1;
    const dnsScore = totalSkippersThisRound + 1;

    for (const heat of heats) {
      const heatResults = resultsByHeat[heat] || [];
      const letterScoreResults = heatResults.filter(r => r.letterScore);
      for (const result of letterScoreResults) {
        if (!roundPositions.has(result.skipperIndex)) {
          roundPositions.set(result.skipperIndex, dnsScore);
        }
      }
    }

    roundPositions.forEach((pos, skipperIdx) => {
      const current = skipperTotals.get(skipperIdx) || 0;
      skipperTotals.set(skipperIdx, current + pos);
    });
  }

  const ranked = Array.from(skipperTotals.entries())
    .map(([skipperIndex, totalScore]) => ({ skipperIndex, totalScore }))
    .sort((a, b) => a.totalScore - b.totalScore);

  return ranked;
}

/**
 * Generate heat assignments for next race based on current results.
 * Race 1->2: Schedule A (full redistribution based on seeding results)
 * Race 2+: Schedule B/C (between-round promotion/relegation swaps)
 */
export function generateHeatAssignmentsForNextRace(
  currentRace: number,
  currentRound: HeatRound,
  config: HMSConfig,
  allRoundsResults?: HeatResult[]
): HeatAssignment[] {
  const heatResults = new Map<HeatDesignation, HeatResult[]>();
  currentRound.results.forEach(result => {
    if (!heatResults.has(result.heatDesignation)) {
      heatResults.set(result.heatDesignation, []);
    }
    heatResults.get(result.heatDesignation)!.push(result);
  });

  if (currentRace === 1) {
    console.log('HMS: Round 1 (seeding) complete → Using Schedule A (full redistribution) for Round 2');
    return applyScheduleA(currentRound.heatAssignments, heatResults, config);
  }

  console.log(`HMS: Round ${currentRace} complete → Using Schedule B/C (promotion/relegation swaps) for Round ${currentRace + 1}`);
  return applyScheduleBC(currentRound.heatAssignments, heatResults, config, allRoundsResults);
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
  const MAX_FLEET_SIZE = 24;
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

  const heatSizes = calculateHMSHeatSizes(totalSkippers, numberOfHeats);

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

/**
 * Validate that each skipper appears exactly once across all heats in a round.
 * Per HMS VBA: every registered boat must appear in exactly one heat per round.
 * Returns list of problems found (empty = valid).
 */
export function validateHeatAssignments(
  assignments: HeatAssignment[],
  totalSkippers: number
): string[] {
  const problems: string[] = [];
  const seen = new Map<number, HeatDesignation>();

  for (const assignment of assignments) {
    for (const skipperIdx of assignment.skipperIndices) {
      const existing = seen.get(skipperIdx);
      if (existing) {
        problems.push(`Skipper #${skipperIdx} appears in both Heat ${existing} and Heat ${assignment.heatDesignation}`);
      } else {
        seen.set(skipperIdx, assignment.heatDesignation);
      }
    }
  }

  if (seen.size < totalSkippers) {
    const missing: number[] = [];
    for (let i = 0; i < totalSkippers; i++) {
      if (!seen.has(i)) missing.push(i);
    }
    if (missing.length > 0) {
      problems.push(`${missing.length} skipper(s) not assigned to any heat: #${missing.join(', #')}`);
    }
  }

  return problems;
}
