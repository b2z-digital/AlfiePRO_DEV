import { HeatManagement, HeatDesignation, HeatResult, HeatRound, generateNextRoundAssignments } from '../types/heat';
import { Skipper } from '../types';
import { getNextHeat } from './shrsHeatSystem';

// Function to update a heat result in the heat management object
export const updateHeatResult = (
  heatManagement: HeatManagement,
  result: HeatResult
): HeatManagement => {
  const { rounds, currentRound } = heatManagement;
  
  // Find the current round
  const roundIndex = rounds.findIndex(r => r.round === currentRound);
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
// HMS PROMOTION-BEFORE-RELEGATION: Promotions happen WITHIN the same round
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

  // Determine the next heat to score (for auto-advance)
  let nextHeat: HeatDesignation | null = null;
  if (heatIndex < availableHeats.length - 1) {
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

  // SCORING SYSTEM SPECIFIC LOGIC
  console.log(`\n🔍 Heat ${heat} complete. Scoring System: ${isShrs ? 'SHRS' : 'HMS'}, Round ${currentRound}`);

  // HMS CRITICAL LOGIC: After a lower heat completes, IMMEDIATELY promote skippers to the HIGHER heat
  // This happens WITHIN the same round, BEFORE the higher heat is scored
  // Applies to Round 2+ (after initial seeding heats)
  // HMS scores LOWER → HIGHER (B → A), so when B completes, promote to A
  // ONLY do this if the higher heat hasn't been scored yet!
  if (isHms && currentRound >= 2 && higherHeat && configuration.promotionCount) {
    // Check if the higher heat has already been scored
    const higherHeatSkippers = round.heatAssignments.find(a => a.heatDesignation === higherHeat)?.skipperIndices || [];
    const higherHeatAlreadyScored = higherHeatSkippers.length > 0 && higherHeatSkippers.every(skipperIndex => {
      const result = round.results.find(
        r => r.skipperIndex === skipperIndex &&
             r.heatDesignation === higherHeat &&
             r.round === currentRound
      );
      return result && (result.position !== null || result.letterScore);
    });

    if (!higherHeatAlreadyScored) {
      console.log(`\n🔼 HMS PROMOTION: Heat ${heat} complete. Promoting top ${configuration.promotionCount} to Heat ${higherHeat} (same round)`);

      // Get results from the just-completed heat
      const completedHeatResults = round.results
        .filter(r => r.heatDesignation === heat && r.position !== null && !r.letterScore)
        .sort((a, b) => (a.position || 999) - (b.position || 999));

      // Top N skippers get promoted
      const promotedSkippers = completedHeatResults
        .slice(0, configuration.promotionCount)
        .map(r => r.skipperIndex);

      if (promotedSkippers.length > 0) {
        console.log(`  Promoting skippers:`, promotedSkippers);

        // Track that promotions occurred
        promotionsOccurred = true;
        promotedSkipperIndices = promotedSkippers;
        promotionTargetHeat = higherHeat;

        // Find the higher heat's assignment
        const higherHeatAssignmentIndex = round.heatAssignments.findIndex(
          a => a.heatDesignation === higherHeat
        );

        if (higherHeatAssignmentIndex !== -1) {
          // Update the heat assignments IN THE CURRENT ROUND
          const updatedAssignments = [...round.heatAssignments];
          const higherHeatAssignment = { ...updatedAssignments[higherHeatAssignmentIndex] };

          // Add promoted skippers to the higher heat (but only if not already there)
          const newPromotedSkippers = promotedSkippers.filter(
            skipperIdx => !higherHeatAssignment.skipperIndices.includes(skipperIdx)
          );

          if (newPromotedSkippers.length > 0) {
            higherHeatAssignment.skipperIndices = [
              ...higherHeatAssignment.skipperIndices,
              ...newPromotedSkippers
            ];
            console.log(`  Added ${newPromotedSkippers.length} new promoted skippers (${promotedSkippers.length - newPromotedSkippers.length} already present)`);
          } else {
            console.log(`  All promoted skippers already in Heat ${higherHeat}, skipping duplication`);
          }

          updatedAssignments[higherHeatAssignmentIndex] = higherHeatAssignment;

          // Also remove promoted skippers from current heat assignment
          const currentHeatAssignmentIndex = updatedAssignments.findIndex(a => a.heatDesignation === heat);
          if (currentHeatAssignmentIndex !== -1) {
            const currentHeatAssignment = { ...updatedAssignments[currentHeatAssignmentIndex] };
            currentHeatAssignment.skipperIndices = currentHeatAssignment.skipperIndices.filter(
              skipperIdx => !promotedSkippers.includes(skipperIdx)
            );
            updatedAssignments[currentHeatAssignmentIndex] = currentHeatAssignment;
          }

          // Update the round with new assignments
          updatedRounds[roundIndex] = {
            ...round,
            heatAssignments: updatedAssignments
          };

          console.log(`  Heat ${higherHeat} now has ${higherHeatAssignment.skipperIndices.length} skippers (including promoted)`);
          console.log(`  Heat ${heat} now has ${updatedAssignments[currentHeatAssignmentIndex].skipperIndices.length} skippers (after promotion)`);
        }
      }
    } else {
      console.log(`\n⏭️  Heat ${heat} complete, but Heat ${higherHeat} already scored. Skipping mid-round promotion.`);
    }
  }

  // HMS RELEGATION LOGIC: After a HIGHER heat completes, IMMEDIATELY relegate bottom skippers to lower heat
  // This happens WITHIN the same round, AFTER the higher heat is scored
  // Applies to Round 2+ (after initial seeding heats)
  // Only do this if there's a lower heat available and it hasn't been scored yet
  if (isHms && currentRound >= 2 && lowerHeat && configuration.promotionCount) {
    // Check if the lower heat has already been scored
    const lowerHeatSkippers = round.heatAssignments.find(a => a.heatDesignation === lowerHeat)?.skipperIndices || [];
    const lowerHeatAlreadyScored = lowerHeatSkippers.length > 0 && lowerHeatSkippers.every(skipperIndex => {
      const result = round.results.find(
        r => r.skipperIndex === skipperIndex &&
             r.heatDesignation === lowerHeat &&
             r.round === currentRound
      );
      return result && (result.position !== null || result.letterScore);
    });

    // Get results from the just-completed heat
    const completedHeatResults = round.results
      .filter(r => r.heatDesignation === heat && r.position !== null && !r.letterScore)
      .sort((a, b) => (a.position || 999) - (b.position || 999));

    // Bottom N skippers get relegated
    const totalInHeat = completedHeatResults.length;
    const relegatedSkippers = completedHeatResults
      .slice(Math.max(0, totalInHeat - configuration.promotionCount))
      .map(r => r.skipperIndex);

    if (relegatedSkippers.length > 0) {
      if (!lowerHeatAlreadyScored) {
        console.log(`\n🔽 HMS RELEGATION: Heat ${heat} complete. Relegating bottom ${configuration.promotionCount} to Heat ${lowerHeat} (same round)`);
      } else {
        console.log(`\n🔽 HMS RELEGATION: Heat ${heat} complete. Relegating bottom ${configuration.promotionCount} to Heat ${lowerHeat} (Heat ${lowerHeat} already scored, relegation will apply to next round)`);
      }

      console.log(`  Relegating skippers:`, relegatedSkippers);

      // Track that relegations occurred
      relegationsOccurred = true;
      relegatedSkipperIndices = relegatedSkippers;
      relegationTargetHeat = lowerHeat;

      // Find the lower heat's assignment
      const lowerHeatAssignmentIndex = updatedRounds[roundIndex].heatAssignments.findIndex(
        a => a.heatDesignation === lowerHeat
      );

      if (lowerHeatAssignmentIndex !== -1) {
        // Update the heat assignments IN THE CURRENT ROUND
        const updatedAssignments = [...updatedRounds[roundIndex].heatAssignments];
        const lowerHeatAssignment = { ...updatedAssignments[lowerHeatAssignmentIndex] };

        // Add relegated skippers to the lower heat (but only if not already there)
        const newRelegatedSkippers = relegatedSkippers.filter(
          skipperIdx => !lowerHeatAssignment.skipperIndices.includes(skipperIdx)
        );

        if (newRelegatedSkippers.length > 0) {
          lowerHeatAssignment.skipperIndices = [
            ...lowerHeatAssignment.skipperIndices,
            ...newRelegatedSkippers
          ];
          console.log(`  Added ${newRelegatedSkippers.length} new relegated skippers (${relegatedSkippers.length - newRelegatedSkippers.length} already present)`);
        } else {
          console.log(`  All relegated skippers already in Heat ${lowerHeat}, skipping duplication`);
        }

        updatedAssignments[lowerHeatAssignmentIndex] = lowerHeatAssignment;

        // Also remove relegated skippers from current heat assignment
        const currentHeatAssignmentIndex = updatedAssignments.findIndex(a => a.heatDesignation === heat);
        if (currentHeatAssignmentIndex !== -1) {
          const currentHeatAssignment = { ...updatedAssignments[currentHeatAssignmentIndex] };
          currentHeatAssignment.skipperIndices = currentHeatAssignment.skipperIndices.filter(
            skipperIdx => !relegatedSkippers.includes(skipperIdx)
          );
          updatedAssignments[currentHeatAssignmentIndex] = currentHeatAssignment;
        }

        // Update the round with new assignments
        updatedRounds[roundIndex] = {
          ...updatedRounds[roundIndex],
          heatAssignments: updatedAssignments
        };

        console.log(`  Heat ${lowerHeat} now has ${lowerHeatAssignment.skipperIndices.length} skippers (including relegated)`);
        console.log(`  Heat ${heat} now has ${updatedAssignments[currentHeatAssignmentIndex].skipperIndices.length} skippers (after relegation)`);
      }
    }
  }

  // SHRS LOGIC: Use movement tables to assign skippers to next round heats based on finishing position
  // Unlike HMS (which moves within the same round), SHRS moves between rounds
  if (isShrs && currentRound >= 2) {
    console.log(`\n🎯 SHRS: Processing heat movements for next round based on positions`);

    // Get results from the just-completed heat
    const completedHeatResults = round.results
      .filter(r => r.heatDesignation === heat && r.position !== null && !r.letterScore)
      .sort((a, b) => (a.position || 999) - (b.position || 999));

    // For each skipper, determine their next heat assignment using SHRS movement table
    completedHeatResults.forEach(result => {
      if (result.position) {
        // SHRS uses alpha heat labels (A, B, C, D) with Table 2
        const nextHeatDesignation = getNextHeat(
          result.position,
          heat, // Current heat (e.g., 'A', 'B')
          availableHeats.length,
          true // Use Table 2 (alpha labeling)
        );

        console.log(`  Skipper ${result.skipperIndex}: Position ${result.position} in Heat ${heat} → Heat ${nextHeatDesignation} (next round)`);

        // Store the next heat assignment for when we generate the next round
        // This will be used by generateNextRoundAssignments
        result.nextHeatAssignment = nextHeatDesignation;
      }
    });
  }

  // Check if all heats are complete
  // Note: After mid-round movements, a skipper might be in a different heat than where they scored
  // So we check if each skipper has a result from ANY heat in this round
  console.log(`\n🔍 Checking if all heats complete for Round ${currentRound}:`);
  console.log(`  Available heats:`, availableHeats);
  console.log(`  Total results in round:`, updatedRounds[roundIndex].results.length);
  console.log(`  Results:`, updatedRounds[roundIndex].results.map(r => `Skipper ${r.skipperIndex} in Heat ${r.heatDesignation}: position ${r.position}`));

  const allHeatsComplete = availableHeats.every(h => {
    const heatSkippers = updatedRounds[roundIndex].heatAssignments.find(a => a.heatDesignation === h)?.skipperIndices || [];
    console.log(`  Heat ${h}: ${heatSkippers.length} skippers assigned`);

    const complete = heatSkippers.every(skipperIndex => {
      // Check if this skipper has a result in ANY heat for this round
      const result = updatedRounds[roundIndex].results.find(
        r => r.skipperIndex === skipperIndex &&
             r.round === currentRound &&
             (r.position !== null || r.letterScore)
      );
      const hasResult = !!result;
      if (!hasResult) {
        console.log(`    ❌ Skipper ${skipperIndex} has NO result yet`);
      }
      return hasResult;
    });

    console.log(`  Heat ${h}: ${complete ? '✅ COMPLETE' : '❌ INCOMPLETE'}`);
    return complete;
  });

  console.log(`  Overall: ${allHeatsComplete ? '✅ ALL HEATS COMPLETE' : '❌ NOT ALL HEATS COMPLETE'}`);

  // Mark round as complete if all heats are done
  updatedRounds[roundIndex] = {
    ...updatedRounds[roundIndex],
    completed: allHeatsComplete
  };

  // If all heats are complete, prepare for the next round (with RELEGATIONS only)
  if (allHeatsComplete) {
    console.log(`\n🏁 All heats complete for Round ${currentRound}. Generating Round ${currentRound + 1} assignments...`);

    // Set flag to trigger modal showing next round assignments
    heatManagement.roundJustCompleted = currentRound;

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
    // Don't auto-advance round - user must explicitly advance via "Advance to Round 2" button
    currentRound: currentRound
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

    // ROUND 1 (SEEDED): Use within-heat positions
    if (round.round === 1) {
      // Each skipper gets their finishing position within their heat
      round.results.forEach(result => {
        if (result.position !== null) {
          overallPositions.set(result.skipperIndex, result.position);
        } else if (result.letterScore) {
          // For letter scores in seeded round, use total competitors in round + 1
          // This matches standard yacht racing scoring rules
          const totalCompetitorsInRound = round.results.length;
          overallPositions.set(result.skipperIndex, totalCompetitorsInRound + 1);
        }
      });
    }
    // ROUND 2+: Use overall positions based on heat hierarchy
    else {
      // HMS CRITICAL: A skipper may have competed in multiple heats in the same round
      // (e.g., Heat B then promoted to Heat A). We only count their HIGHEST heat result.
      // Highest heat = lowest letter (A > B > C)

      // First, determine each skipper's final (highest) heat for this round
      const skipperFinalHeat = new Map<number, HeatDesignation>();
      round.results.forEach(result => {
        const existingHeat = skipperFinalHeat.get(result.skipperIndex);
        if (!existingHeat || result.heatDesignation < existingHeat) {
          // This heat is higher (A < B < C in string comparison)
          skipperFinalHeat.set(result.skipperIndex, result.heatDesignation);
        }
      });

      // Process heats in order (A, B, C, etc.)
      let currentPosition = 1;
      const heats: HeatDesignation[] = ['A', 'B', 'C', 'D', 'E', 'F'];

      heats.forEach(heat => {
        if (resultsByHeat[heat]) {
          // Only include skippers whose FINAL heat is this heat
          const sortedResults = [...resultsByHeat[heat]]
            .filter(r => r.position !== null && skipperFinalHeat.get(r.skipperIndex) === heat)
            .sort((a, b) => (a.position || 999) - (b.position || 999));

          // Assign overall positions
          sortedResults.forEach(result => {
            overallPositions.set(result.skipperIndex, currentPosition++);
          });

          // Add letter scores at the end (only if this was their final heat)
          // Letter scores should get points based on total competitors in the round
          const letterScoreResults = resultsByHeat[heat]
            .filter(r => r.letterScore && skipperFinalHeat.get(r.skipperIndex) === heat);
          letterScoreResults.forEach(result => {
            // Calculate letter score points: total competitors in round + 1
            const totalCompetitorsInRound = round.results.length;
            overallPositions.set(result.skipperIndex, totalCompetitorsInRound + 1);
          });
        }
      });
    }

    // Convert to race results format
    overallPositions.forEach((position, skipperIndex) => {
      raceResults.push({
        race: round.round, // Use round number as race number
        skipperIndex,
        position,
        // Find the original result to get the letter score if any
        letterScore: round.results.find(
          r => r.skipperIndex === skipperIndex
        )?.letterScore
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