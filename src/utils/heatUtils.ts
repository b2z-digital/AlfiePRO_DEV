import { HeatManagement, HeatDesignation, HeatResult, HeatRound, generateNextRoundAssignments } from '../types/heat';
import { Skipper } from '../types';
import { getNextHeat, getLargestHeatSize, calculateNonFinisherScore, calculateSHRSDiscards } from './shrsHeatSystem';
import { isEntrantsPlusOne, LetterScore } from '../types/letterScores';

// Function to update a heat result in the heat management object
export const updateHeatResult = (
  heatManagement: HeatManagement,
  result: HeatResult
): HeatManagement => {
  const { rounds, currentRound } = heatManagement;

  // Find the target round - use result.round if specified, fall back to currentRound
  const targetRound = result.round || currentRound;
  const roundIndex = rounds.findIndex(r => r.round === targetRound);
  if (roundIndex === -1) return heatManagement;
  
  const round = rounds[roundIndex];
  
  // Check if this result already exists
  const resultIndex = round.results.findIndex(
    r => r.skipperIndex === result.skipperIndex && 
         r.heatDesignation === result.heatDesignation &&
         r.round === result.round &&
         r.race === result.race
  );
  
  const updatedResults = [...round.results];
  
  if (resultIndex !== -1) {
    // Update existing result
    updatedResults[resultIndex] = result;
  } else {
    // Add new result
    updatedResults.push(result);
  }
  
  // Update the round
  const updatedRounds = [...rounds];
  updatedRounds[roundIndex] = {
    ...round,
    results: updatedResults
  };
  
  return {
    ...heatManagement,
    rounds: updatedRounds
  };
};

// Function to complete a heat and automatically move to the next heat
// HMS: Each heat races with its assigned roster. Promotion/relegation swaps happen between rounds.
// SHRS uses different movement rules based on position
export const completeHeat = (
  heatManagement: HeatManagement,
  heat: HeatDesignation,
  scoringSystem?: string | number[] // 'hms', 'shrs', or array of drop rules
): HeatManagement => {
  // Determine if using SHRS
  const isShrs = scoringSystem === 'shrs';
  const isHms = scoringSystem === 'hms' || !scoringSystem; // HMS is default for heat racing
  const { rounds, currentRound, configuration } = heatManagement;

  // Find the current round
  const roundIndex = rounds.findIndex(r => r.round === currentRound);
  if (roundIndex === -1) return heatManagement;

  const round = rounds[roundIndex];

  // Get all available heats in order (A, B, C, etc.)
  const availableHeats = round.heatAssignments
    .map(a => a.heatDesignation)
    .sort();

  // Find the index of the current heat
  const heatIndex = availableHeats.indexOf(heat);
  if (heatIndex === -1) return heatManagement;

  // Determine if we're in SHRS finals (flexible fleet ordering)
  const shrsQualRounds = configuration?.shrsQualifyingRounds || 0;
  const isShrsFinalsRound = isShrs && shrsQualRounds > 0 && currentRound > shrsQualRounds;

  let nextHeat: HeatDesignation | null = null;
  if (!isShrsFinalsRound && heatIndex < availableHeats.length - 1) {
    nextHeat = availableHeats[heatIndex + 1];
  }

  // Update the round
  let updatedRounds = [...rounds];
  let promotionsOccurred = false;
  let promotedSkipperIndices: number[] = [];
  let promotionTargetHeat: HeatDesignation | null = null;
  let relegationsOccurred = false;
  let relegatedSkipperIndices: number[] = [];
  let relegationTargetHeat: HeatDesignation | null = null;

  // Determine if there's a higher heat for promotions (HMS scores LOW → HIGH, so B → A)
  const higherHeatIndex = heatIndex - 1;
  const higherHeat: HeatDesignation | null = higherHeatIndex >= 0 ? availableHeats[higherHeatIndex] : null;

  // Determine if there's a lower heat for relegations
  const lowerHeatIndex = heatIndex + 1;
  const lowerHeat: HeatDesignation | null = lowerHeatIndex < availableHeats.length ? availableHeats[lowerHeatIndex] : null;

  // Resolve effective promotion count for this round (supports per-race overrides per HMS VBA)
  const effectivePromotionCount = configuration.promotionCountOverrides?.[currentRound]
    ?? configuration.promotionCount;

  // SCORING SYSTEM SPECIFIC LOGIC
  console.log(`\n🔍 Heat ${heat} complete. Scoring System: ${isShrs ? 'SHRS' : 'HMS'}, Round ${currentRound}`);
  if (effectivePromotionCount !== configuration.promotionCount) {
    console.log(`  ⚡ Per-race promotion override: ${effectivePromotionCount} (default: ${configuration.promotionCount})`);
  }

  if (isHms && currentRound >= 2 && higherHeat) {
    const higherHeatAssignmentIdx = updatedRounds[roundIndex].heatAssignments.findIndex(
      a => a.heatDesignation === higherHeat
    );
    const currentHeatResults = updatedRounds[roundIndex].results.filter(
      r => r.heatDesignation === heat && r.round === currentRound
    );
    const topFinishers = currentHeatResults
      .filter(r => r.position !== null && r.position <= effectivePromotionCount && !r.letterScore)
      .sort((a, b) => (a.position || 999) - (b.position || 999))
      .map(r => r.skipperIndex);

    if (topFinishers.length > 0 && higherHeatAssignmentIdx >= 0) {
      const higherAssignment = updatedRounds[roundIndex].heatAssignments[higherHeatAssignmentIdx];
      const higherHeatHasResults = updatedRounds[roundIndex].results.some(
        r => r.heatDesignation === higherHeat && r.round === currentRound &&
             (r.position !== null || r.letterScore)
      );

      if (!higherHeatHasResults) {
        const existingSet = new Set(higherAssignment.skipperIndices);
        const newPromoted = topFinishers.filter(idx => !existingSet.has(idx));
        if (newPromoted.length > 0) {
          updatedRounds[roundIndex] = {
            ...updatedRounds[roundIndex],
            heatAssignments: updatedRounds[roundIndex].heatAssignments.map((a, i) =>
              i === higherHeatAssignmentIdx
                ? { ...a, skipperIndices: [...a.skipperIndices, ...newPromoted] }
                : a
            )
          };
          promotionsOccurred = true;
          promotedSkipperIndices = newPromoted;
          promotionTargetHeat = higherHeat;
          console.log(`\n🔼 HMS Round ${currentRound}: Promoted ${newPromoted.length} skippers from Heat ${heat} → Heat ${higherHeat}`);
          console.log(`   Heat ${higherHeat} now has ${higherAssignment.skipperIndices.length + newPromoted.length} skippers`);
        }
      } else {
        console.log(`\n📋 HMS Round ${currentRound}: Heat ${heat} complete. Heat ${higherHeat} already has results - no mid-round promotion.`);
      }
    }
  } else if (isHms && currentRound >= 2) {
    console.log(`\n📋 HMS Round ${currentRound}: Heat ${heat} complete (top heat - no promotions needed).`);
  }

  console.log(`completeHeat: checking allHeatsComplete. availableHeats=${JSON.stringify(availableHeats)}, roundIndex=${roundIndex}, totalResults=${updatedRounds[roundIndex].results.length}`);
  const allHeatsComplete = availableHeats.every(h => {
    const heatSkippers = updatedRounds[roundIndex].heatAssignments.find(a => a.heatDesignation === h)?.skipperIndices || [];
    const heatResultsForRound = updatedRounds[roundIndex].results.filter(
      r => r.heatDesignation === h && r.round === currentRound
    );
    const missingSkippers = heatSkippers.filter(skipperIndex => {
      const result = updatedRounds[roundIndex].results.find(
        r => r.skipperIndex === skipperIndex &&
             r.heatDesignation === h &&
             r.round === currentRound &&
             (r.position !== null || r.letterScore)
      );
      return !result;
    });
    console.log(`  Heat ${h}: ${heatSkippers.length} skippers, ${heatResultsForRound.length} results for round ${currentRound}, missing=${missingSkippers.length}${missingSkippers.length > 0 ? ` [${missingSkippers.join(',')}]` : ''}`);
    return missingSkippers.length === 0 && heatSkippers.length > 0;
  });

  // Mark round as complete if all heats are done
  updatedRounds[roundIndex] = {
    ...updatedRounds[roundIndex],
    completed: allHeatsComplete
  };

  // If all heats are complete, prepare for the next round (with RELEGATIONS only)
  if (allHeatsComplete) {
    console.log(`\n🏁 All heats complete for Round ${currentRound}. Generating Round ${currentRound + 1} assignments...`);

    try {
      // Generate assignments for the next round based on current results
      // This will handle RELEGATIONS from higher heats to lower heats
      const nextRoundAssignments = generateNextRoundAssignments(updatedRounds[roundIndex], heatManagement);

      console.log(`✅ Generated ${nextRoundAssignments.length} heat assignments for Round ${currentRound + 1}`);

      const nextRoundIndex = updatedRounds.findIndex(r => r.round === currentRound + 1);

      if (nextRoundIndex === -1) {
        // Add a new round if it doesn't exist
        updatedRounds.push({
          round: currentRound + 1,
          heatAssignments: nextRoundAssignments,
          results: [],
          completed: false
        });
        console.log('✨ Created new Round', currentRound + 1, 'with heat assignments');
      } else {
        // Check if next round has any results
        const nextRoundHasResults = updatedRounds[nextRoundIndex].results.length > 0;

        if (!nextRoundHasResults) {
          // Safe to update assignments since no scoring has happened yet
          updatedRounds[nextRoundIndex] = {
            ...updatedRounds[nextRoundIndex],
            heatAssignments: nextRoundAssignments
          };
          console.log('🔄 Updated Round', currentRound + 1, 'heat assignments based on latest Round', currentRound, 'results');
        } else {
          console.warn('⚠️ Round', currentRound + 1, 'already has results - not updating heat assignments');
          console.warn('   Officer should clear Round', currentRound + 1, 'results before re-scoring Round', currentRound);
        }
      }
    } catch (error) {
      console.error(`❌ CRITICAL ERROR: Failed to generate Round ${currentRound + 1} assignments:`, error);
      console.error('Round data:', updatedRounds[roundIndex]);
      console.error('Heat management config:', heatManagement.configuration);
      // Don't throw - return current state so UI doesn't break
    }
  }

  const result: any = {
    ...heatManagement,
    rounds: updatedRounds,
    currentHeat: nextHeat,
    currentRound: currentRound,
    roundJustCompleted: allHeatsComplete ? currentRound : heatManagement.roundJustCompleted
  };

  // Add promotion/relegation info if mid-round changes occurred
  if (promotionsOccurred && promotionTargetHeat) {
    result.lastPromotionInfo = {
      promotedSkippers: promotedSkipperIndices,
      relegatedSkippers: relegationsOccurred ? relegatedSkipperIndices : [],
      fromHeat: heat,
      toHeat: promotionTargetHeat,
      relegationFromHeat: relegationsOccurred ? heat : null,
      relegationToHeat: relegationsOccurred ? relegationTargetHeat : null,
      round: currentRound
    };
  } else if (relegationsOccurred && relegationTargetHeat) {
    // If only relegations occurred (no promotions in same operation)
    result.lastPromotionInfo = {
      promotedSkippers: [],
      relegatedSkippers: relegatedSkipperIndices,
      fromHeat: heat,
      toHeat: relegationTargetHeat,
      relegationFromHeat: heat,
      relegationToHeat: relegationTargetHeat,
      round: currentRound
    };
  }

  return result;
};

// Function to convert heat results to regular race results for the main scoring table
export const convertHeatResultsToRaceResults = (
  heatManagement: HeatManagement,
  skippers: Skipper[]
): any[] => {
  const raceResults: any[] = [];

  // Process each round
  heatManagement.rounds.forEach(round => {
    // Skip incomplete rounds
    if (!round.completed) return;

    // Calculate overall positions for this round
    const overallPositions = new Map<number, number>(); // skipperIndex -> position

    // Group results by heat
    const resultsByHeat = round.results.reduce((acc, result) => {
      if (!acc[result.heatDesignation]) {
        acc[result.heatDesignation] = [];
      }
      acc[result.heatDesignation].push(result);
      return acc;
    }, {} as Record<HeatDesignation, HeatResult[]>);

    const isShrs = heatManagement.configuration.scoringSystem === 'shrs';

    if (isShrs) {
      const heatSizes = round.heatAssignments.map(a => a.skipperIndices.length);
      const largestHeatSize = getLargestHeatSize(heatSizes);
      const qualRounds = heatManagement.configuration.shrsQualifyingRounds || heatManagement.rounds.length;
      const isQualifying = round.round <= qualRounds;

      // Collect all scored results (sailed + penalty) per skipper in same phase for RDGave calculation
      // RDGave averages all other round scores (including DNF, RDGfix, etc.) excluding only other RDGave rounds
      const aveScoresBySkipper = new Map<number, number[]>();
      const allHeatSizesByRound = new Map<number, number>();
      for (const r of heatManagement.rounds) {
        if (!r.completed) continue;
        const rIsQual = r.round <= qualRounds;
        if (rIsQual !== isQualifying) continue;
        const rHeatSizes = r.heatAssignments.map(a => a.skipperIndices.length);
        const rLargestHeat = getLargestHeatSize(rHeatSizes);
        allHeatSizesByRound.set(r.round, rLargestHeat);
        for (const res of r.results) {
          const resIsRDGave = res.letterScore === 'RDG' && (res.customPoints === -1 || res.customPoints === -2 || res.customPoints === -3);
          if (resIsRDGave) continue;
          let s: number;
          if (res.importedScore !== undefined && res.importedScore !== null) {
            s = res.importedScore;
          } else if (res.letterScore && res.customPoints !== undefined && res.customPoints > 0) {
            s = res.customPoints;
          } else if (res.letterScore) {
            s = calculateNonFinisherScore(rLargestHeat);
          } else if (res.position !== null) {
            s = res.position;
          } else {
            continue;
          }
          if (!aveScoresBySkipper.has(res.skipperIndex)) aveScoresBySkipper.set(res.skipperIndex, []);
          aveScoresBySkipper.get(res.skipperIndex)!.push(s);
        }
      }

      round.results.forEach(result => {
        const isRDGave = result.letterScore === 'RDG' && (result.customPoints === -1 || result.customPoints === -2 || result.customPoints === -3);
        if (isRDGave) {
          const scores = aveScoresBySkipper.get(result.skipperIndex) || [];
          const avg = scores.length > 0
            ? Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 10) / 10
            : calculateNonFinisherScore(largestHeatSize);
          overallPositions.set(result.skipperIndex, avg);
        } else if (result.importedScore !== undefined && result.importedScore !== null) {
          overallPositions.set(result.skipperIndex, result.importedScore);
        } else if (result.letterScore) {
          if (result.customPoints !== undefined && result.customPoints > 0) {
            overallPositions.set(result.skipperIndex, result.customPoints);
          } else {
            overallPositions.set(result.skipperIndex, calculateNonFinisherScore(largestHeatSize));
          }
        } else if (result.position !== null && result.position !== undefined) {
          overallPositions.set(result.skipperIndex, result.position);
        }
      });
    }
    else if (round.round === 1) {
      round.results.forEach(result => {
        if (result.position !== null) {
          overallPositions.set(result.skipperIndex, result.position);
        } else if (result.letterScore) {
          const points = isEntrantsPlusOne(result.letterScore as LetterScore)
            ? skippers.length + 1
            : round.results.length + 1;
          overallPositions.set(result.skipperIndex, points);
        }
      });
    }
    else {
      const skipperFinalHeat = new Map<number, HeatDesignation>();
      round.results.forEach(result => {
        const existingHeat = skipperFinalHeat.get(result.skipperIndex);
        if (!existingHeat || result.heatDesignation < existingHeat) {
          skipperFinalHeat.set(result.skipperIndex, result.heatDesignation);
        }
      });

      let currentPosition = 1;
      const heats: HeatDesignation[] = ['A', 'B', 'C', 'D', 'E', 'F'];

      heats.forEach(heat => {
        if (resultsByHeat[heat]) {
          const sortedResults = [...resultsByHeat[heat]]
            .filter(r => r.position !== null && skipperFinalHeat.get(r.skipperIndex) === heat)
            .sort((a, b) => (a.position || 999) - (b.position || 999));

          sortedResults.forEach(result => {
            overallPositions.set(result.skipperIndex, currentPosition++);
          });

          const letterScoreResults = resultsByHeat[heat]
            .filter(r => r.letterScore && skipperFinalHeat.get(r.skipperIndex) === heat);
          letterScoreResults.forEach(result => {
            const points = isEntrantsPlusOne(result.letterScore as LetterScore)
              ? skippers.length + 1
              : round.results.length + 1;
            overallPositions.set(result.skipperIndex, points);
          });
        }
      });
    }

    // Convert to race results format
    overallPositions.forEach((position, skipperIndex) => {
      const originalResult = round.results.find(r => r.skipperIndex === skipperIndex);
      raceResults.push({
        race: round.round,
        skipperIndex,
        position,
        letterScore: originalResult?.letterScore,
        customPoints: originalResult?.customPoints,
      });
    });
  });

  return raceResults;
};

// Function to start a new round
export const startNewRound = (
  heatManagement: HeatManagement
): HeatManagement => {
  const { rounds, currentRound } = heatManagement;

  // Find the current round
  const currentRoundData = rounds.find(r => r.round === currentRound);
  if (!currentRoundData) return heatManagement;

  // Check if the current round is completed
  if (!currentRoundData.completed) {
    return heatManagement;
  }

  // Check if the next round already exists
  const nextRoundExists = rounds.some(r => r.round === currentRound + 1);
  if (nextRoundExists) {
    // Just update the current round and heat
    return {
      ...heatManagement,
      currentRound: currentRound + 1,
      currentHeat: 'A' // Start with heat A
    };
  }

  // Generate assignments for the next round
  const nextRoundAssignments = generateNextRoundAssignments(currentRoundData, heatManagement);

  // Create a new round
  const newRound: HeatRound = {
    round: currentRound + 1,
    heatAssignments: nextRoundAssignments,
    results: [],
    completed: false
  };

  return {
    ...heatManagement,
    rounds: [...rounds, newRound],
    currentRound: currentRound + 1,
    currentHeat: 'A' // Start with heat A
  };
};

// Function to clear heat results for a specific heat, round, and race
export const clearHeatRaceResults = (
  heatManagement: HeatManagement,
  heatDesignation: HeatDesignation,
  round: number,
  race: number,
  skipperIndices: number[]
): HeatManagement => {
  const { rounds } = heatManagement;

  // Find the round
  const roundIndex = rounds.findIndex(r => r.round === round);
  if (roundIndex === -1) return heatManagement;

  const roundData = rounds[roundIndex];

  // Filter out results that match the criteria
  const updatedResults = roundData.results.filter(
    r => !(
      r.heatDesignation === heatDesignation &&
      r.round === round &&
      r.race === race &&
      skipperIndices.includes(r.skipperIndex)
    )
  );

  // Update the round
  const updatedRounds = [...rounds];
  updatedRounds[roundIndex] = {
    ...roundData,
    results: updatedResults
  };

  return {
    ...heatManagement,
    rounds: updatedRounds
  };
};