import { Skipper } from './index';
import { LetterScore } from './letterScores';
import { generateHeatAssignmentsForNextRace, HMSConfig } from '../utils/hmsHeatSystem';
import { getNextHeat, getNonFinisherPriority, compareSailNumbers } from '../utils/shrsHeatSystem';
import { LetterScore } from './letterScores';

export type HeatDesignation = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export interface HeatResult {
  skipperIndex: number;
  position: number | null;
  letterScore?: LetterScore;
  heatDesignation: HeatDesignation;
  race: number;
  round: number;
  markedAsUP?: boolean; // HMS: Promoted to higher heat, doesn't score in this heat
  customPoints?: number; // For RDG fix
}

export type SeedingMethod = 'random' | 'manual' | 'ranking';

export interface HeatConfiguration {
  enabled: boolean;
  numberOfHeats: number; // 2-6 heats supported
  promotionCount: number; // 4 or 6 per HMS rules
  seedingMethod: SeedingMethod;
  autoAssign: boolean; // Deprecated - use seedingMethod instead
  skippersPerHeat?: number;
  maxHeatSize?: number; // Safety limit
  allowPromotionCountChange?: boolean; // Allow RO to change promotion count mid-event
  scoringSystem?: 'hms' | 'shrs'; // Heat racing scoring system type
  shrsQualifyingRounds?: number; // SHRS: number of qualifying rounds before finals
  shrsFinalsStarted?: boolean; // SHRS: whether finals have been initiated
}

export interface HeatAssignment {
  heatDesignation: HeatDesignation;
  skipperIndices: number[];
}

export interface HeatRound {
  round: number;
  heatAssignments: HeatAssignment[];
  results: HeatResult[];
  completed: boolean;
}

export interface HeatManagement {
  configuration: HeatConfiguration;
  rounds: HeatRound[];
  currentRound: number;
  currentHeat: HeatDesignation | null;
  lastPromotionInfo?: {
    promotedSkippers: number[];
    relegatedSkippers?: number[];
    fromHeat: HeatDesignation;
    toHeat: HeatDesignation;
    relegationFromHeat?: HeatDesignation | null;
    relegationToHeat?: HeatDesignation | null;
    round: number;
  };
  roundJustCompleted?: number;
}

export const getHeatColor = (heat: HeatDesignation): string => {
  switch (heat) {
    case 'A': return 'yellow';
    case 'B': return 'orange';
    case 'C': return 'pink';
    case 'D': return 'green';
    case 'E': return 'blue';
    case 'F': return 'purple';
    default: return 'gray';
  }
};

export const getHeatColorClasses = (heat: HeatDesignation): { bg: string; text: string; darkBg: string; darkText: string } => {
  switch (heat) {
    case 'A':
      return {
        bg: 'bg-yellow-100',
        text: 'text-yellow-800',
        darkBg: 'dark:bg-yellow-900',
        darkText: 'dark:text-yellow-200'
      };
    case 'B':
      return {
        bg: 'bg-orange-100',
        text: 'text-orange-800',
        darkBg: 'dark:bg-orange-900',
        darkText: 'dark:text-orange-200'
      };
    case 'C':
      return {
        bg: 'bg-pink-100',
        text: 'text-pink-800',
        darkBg: 'dark:bg-pink-900',
        darkText: 'dark:text-pink-200'
      };
    case 'D':
      return {
        bg: 'bg-green-100',
        text: 'text-green-800',
        darkBg: 'dark:bg-green-900',
        darkText: 'dark:text-green-200'
      };
    case 'E':
      return {
        bg: 'bg-blue-100',
        text: 'text-blue-800',
        darkBg: 'dark:bg-blue-900',
        darkText: 'dark:text-blue-200'
      };
    case 'F':
      return {
        bg: 'bg-purple-100',
        text: 'text-purple-800',
        darkBg: 'dark:bg-purple-900',
        darkText: 'dark:text-purple-200'
      };
    default:
      return {
        bg: 'bg-gray-100',
        text: 'text-gray-800',
        darkBg: 'dark:bg-gray-900',
        darkText: 'dark:text-gray-200'
      };
  }
};

// Helper function to get available heats based on number of heats
export const getAvailableHeats = (numberOfHeats: number): HeatDesignation[] => {
  const allHeats: HeatDesignation[] = ['A', 'B', 'C', 'D', 'E', 'F'];
  return allHeats.slice(0, Math.min(numberOfHeats, 6));
};

// Helper function to initialize a new heat management system
export const initializeHeatManagement = (
  skippers: Skipper[],
  config: HeatConfiguration
): HeatManagement => {
  const heats = getAvailableHeats(config.numberOfHeats);
  
  // Determine how many skippers per heat
  let skippersPerHeat: number;
  if (config.skippersPerHeat) {
    skippersPerHeat = config.skippersPerHeat;
  } else {
    // Distribute skippers evenly across heats
    skippersPerHeat = Math.ceil(skippers.length / heats.length);
  }

  // Create initial heat assignments
  const heatAssignments: HeatAssignment[] = [];
  
  if (config.autoAssign) {
    // Randomly assign skippers to heats
    const skipperIndices = [...Array(skippers.length).keys()];
    
    // Shuffle the array
    for (let i = skipperIndices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [skipperIndices[i], skipperIndices[j]] = [skipperIndices[j], skipperIndices[i]];
    }
    
    // Distribute skippers to heats
    heats.forEach((heat, index) => {
      const startIdx = index * skippersPerHeat;
      const endIdx = Math.min(startIdx + skippersPerHeat, skipperIndices.length);
      const heatSkippers = skipperIndices.slice(startIdx, endIdx);
      
      heatAssignments.push({
        heatDesignation: heat,
        skipperIndices: heatSkippers
      });
    });
  } else {
    // Create empty heats for manual assignment
    heats.forEach(heat => {
      heatAssignments.push({
        heatDesignation: heat,
        skipperIndices: []
      });
    });
  }

  return {
    configuration: config,
    rounds: [{
      round: 1,
      heatAssignments,
      results: [],
      completed: false
    }],
    currentRound: 1,
    currentHeat: null
  };
};

// Function to calculate overall positions from heat results
export const calculateOverallPositions = (
  heatResults: HeatResult[],
  round: number
): { skipperIndex: number; position: number }[] => {
  // Group results by heat
  const resultsByHeat = heatResults
    .filter(r => r.round === round)
    .reduce((acc, result) => {
      if (!acc[result.heatDesignation]) {
        acc[result.heatDesignation] = [];
      }
      acc[result.heatDesignation].push(result);
      return acc;
    }, {} as Record<HeatDesignation, HeatResult[]>);
  
  // Calculate overall positions
  const overallPositions: { skipperIndex: number; position: number }[] = [];
  let currentPosition = 1;
  
  // Process heats in order (A, B, C, etc.)
  const heats: HeatDesignation[] = ['A', 'B', 'C', 'D', 'E', 'F'];
  
  heats.forEach(heat => {
    if (resultsByHeat[heat]) {
      // Sort results within this heat by position
      const sortedResults = [...resultsByHeat[heat]]
        .filter(r => r.position !== null)
        .sort((a, b) => (a.position || 999) - (b.position || 999));
      
      // Assign overall positions
      sortedResults.forEach(result => {
        overallPositions.push({
          skipperIndex: result.skipperIndex,
          position: currentPosition++
        });
      });
      
      // Add letter scores at the end
      const letterScoreResults = resultsByHeat[heat].filter(r => r.letterScore);
      letterScoreResults.forEach(result => {
        overallPositions.push({
          skipperIndex: result.skipperIndex,
          position: currentPosition++
        });
      });
    }
  });
  
  return overallPositions;
};

export type SHRSPhase = 'qualifying' | 'finals';

export const getSHRSPhase = (round: number, config: HeatConfiguration): SHRSPhase => {
  if (config.scoringSystem !== 'shrs') return 'qualifying';
  const qualifyingRounds = config.shrsQualifyingRounds || 0;
  if (qualifyingRounds <= 0) return 'qualifying';
  return round <= qualifyingRounds ? 'qualifying' : 'finals';
};

export const isSHRSFinalsRound = (round: number, config: HeatConfiguration): boolean => {
  return getSHRSPhase(round, config) === 'finals';
};

export const isSHRSTransitionRound = (round: number, config: HeatConfiguration): boolean => {
  if (config.scoringSystem !== 'shrs') return false;
  const qualifyingRounds = config.shrsQualifyingRounds || 0;
  return qualifyingRounds > 0 && round === qualifyingRounds;
};

export const getSHRSHeatLabel = (heat: HeatDesignation, round: number, config: HeatConfiguration): string => {
  const phase = getSHRSPhase(round, config);
  if (phase === 'finals') {
    const fleetNames: Record<string, string> = {
      'A': 'Gold Fleet',
      'B': 'Silver Fleet',
      'C': 'Bronze Fleet',
      'D': 'Copper Fleet',
      'E': 'Fleet E',
      'F': 'Fleet F'
    };
    return fleetNames[heat] || `Fleet ${heat}`;
  }
  return `Heat ${heat}`;
};

export const getSHRSRoundLabel = (round: number, config: HeatConfiguration): string => {
  if (config.scoringSystem !== 'shrs') return `R${round}`;
  const qualifyingRounds = config.shrsQualifyingRounds || 0;
  if (qualifyingRounds <= 0) return `R${round}`;
  if (round <= qualifyingRounds) return `Q${round}`;
  return `F${round - qualifyingRounds}`;
};

// Function to generate heat assignments for the next round based on results
// HMS: This handles the STARTING lineup for the next round (after relegations from current round)
export const generateNextRoundAssignments = (
  currentRound: HeatRound,
  heatManagement: HeatManagement
): HeatAssignment[] => {
  const { configuration } = heatManagement;
  const { numberOfHeats, promotionCount } = configuration;
  const heats = getAvailableHeats(numberOfHeats);

  // If there are no results yet, keep the same assignments
  if (currentRound.results.length === 0) {
    return currentRound.heatAssignments;
  }

  console.log('\n========================================');
  console.log('=== GENERATING NEXT ROUND ASSIGNMENTS ===');
  console.log(`Current Round: ${currentRound.round}`);

  if (configuration.scoringSystem === 'shrs' && isSHRSTransitionRound(currentRound.round, configuration)) {
    console.log('SHRS: Transitioning from Qualifying to Finals');
    console.log('SHRS: Ranking all skippers by cumulative qualifying scores, splitting into fleets');

    const allSkipperScores = new Map<number, number>();
    const allSkipperRaceScores = new Map<number, number[]>();

    for (const r of heatManagement.rounds) {
      if (r.round > currentRound.round) continue;
      for (const result of r.results) {
        if (!allSkipperScores.has(result.skipperIndex)) {
          allSkipperScores.set(result.skipperIndex, 0);
          allSkipperRaceScores.set(result.skipperIndex, []);
        }
        const score = result.letterScore
          ? (Math.max(...heats.map((_, i) => {
              const ha = r.heatAssignments.find(a => a.heatDesignation === heats[i]);
              return ha ? ha.skipperIndices.length : 0;
            })) + 1)
          : (result.position || 999);
        allSkipperRaceScores.get(result.skipperIndex)!.push(score);
      }
    }

    const qualRacesCompleted = currentRound.round;
    const numDiscards = qualRacesCompleted < 4 ? 0 : qualRacesCompleted < 8 ? 1 : 2 + Math.floor((qualRacesCompleted - 8) / 8);
    const fleetRankingDiscards = (qualRacesCompleted > 5 && qualRacesCompleted < 8) ? numDiscards + 1 : numDiscards;

    allSkipperRaceScores.forEach((scores, idx) => {
      const sorted = [...scores].sort((a, b) => b - a);
      const kept = sorted.slice(fleetRankingDiscards);
      allSkipperScores.set(idx, kept.reduce((sum, s) => sum + s, 0));
    });

    const rankedSkippers = Array.from(allSkipperScores.entries())
      .sort(([, scoreA], [, scoreB]) => scoreA - scoreB);

    const fleetSizes: number[] = [];
    const totalSkippers = rankedSkippers.length;
    const baseSize = Math.floor(totalSkippers / numberOfHeats);
    const remainder = totalSkippers % numberOfHeats;
    for (let i = 0; i < numberOfHeats; i++) {
      fleetSizes.push(baseSize + (i < remainder ? 1 : 0));
    }

    const newAssignments: HeatAssignment[] = heats.map(heat => ({
      heatDesignation: heat,
      skipperIndices: []
    }));

    let skipperIdx = 0;
    for (let fleetIdx = 0; fleetIdx < numberOfHeats; fleetIdx++) {
      for (let i = 0; i < fleetSizes[fleetIdx] && skipperIdx < rankedSkippers.length; i++) {
        newAssignments[fleetIdx].skipperIndices.push(rankedSkippers[skipperIdx][0]);
        skipperIdx++;
      }
    }

    console.log('SHRS Finals fleet assignments:');
    newAssignments.forEach((a, i) => {
      console.log(`  ${heats[i]} (${getSHRSHeatLabel(heats[i], currentRound.round + 1, configuration)}): ${a.skipperIndices.length} skippers`);
    });

    return newAssignments;
  }

  // Group results by heat
  const resultsByHeat = currentRound.results.reduce((acc, result) => {
    if (!acc[result.heatDesignation]) {
      acc[result.heatDesignation] = [];
    }
    acc[result.heatDesignation].push(result);
    return acc;
  }, {} as Record<HeatDesignation, HeatResult[]>);

  // Sort results within each heat
  Object.keys(resultsByHeat).forEach(heat => {
    resultsByHeat[heat as HeatDesignation].sort((a, b) => {
      // Sort by position, handling null and letter scores
      if (a.position === null && b.position === null) return 0;
      if (a.position === null) return 1;
      if (b.position === null) return -1;
      return a.position - b.position;
    });
  });

  // Create new heat assignments
  const newAssignments: HeatAssignment[] = heats.map(heat => ({
    heatDesignation: heat,
    skipperIndices: []
  }));

  // Check which scoring system to use
  const scoringSystem = configuration.scoringSystem || 'hms';
  console.log(`Using ${scoringSystem.toUpperCase()} heat system for Round ${currentRound.round} → Round ${currentRound.round + 1}`);

  if (scoringSystem === 'shrs') {
    if (isSHRSFinalsRound(currentRound.round, configuration)) {
      console.log('SHRS Finals: Keeping same fleet assignments (no movement tables in finals)');
      return currentRound.heatAssignments.map(a => ({
        heatDesignation: a.heatDesignation,
        skipperIndices: [...a.skipperIndices]
      }));
    }

    // SHRS Rule 3.1.ii: Use Heat Movement Tables to assign boats to next race heats.
    // Each skipper's next heat is determined by their position within their current heat
    // and their current heat designation, looked up in the movement table.
    //
    // SHRS Rule 3.1.iii: Non-finishers get virtual positions AFTER all finishers,
    // ordered by: DNF, RET, NSC, OCS, DNS, DNC, WTH, UFD, BFD, DSQ.
    // SHRS Rule 3.1.iv: Tied boats ordered by alphanumerical sail number.

    Object.keys(resultsByHeat).forEach(heat => {
      const heatResults = resultsByHeat[heat as HeatDesignation];

      const finishers = heatResults
        .filter(r => r.position !== null && r.position > 0 && !r.letterScore)
        .sort((a, b) => (a.position || 999) - (b.position || 999));

      const nonFinishers = heatResults
        .filter(r => r.letterScore && r.letterScore !== 'RDG' && r.letterScore !== 'DPI')
        .sort((a, b) => {
          const priorityA = getNonFinisherPriority(a.letterScore as LetterScore);
          const priorityB = getNonFinisherPriority(b.letterScore as LetterScore);
          if (priorityA !== priorityB) return priorityA - priorityB;
          return a.skipperIndex - b.skipperIndex;
        });

      const rdgDpiResults = heatResults
        .filter(r => r.letterScore === 'RDG' || r.letterScore === 'DPI')
        .filter(r => r.position !== null && r.position > 0);

      const allOrdered = [...finishers, ...rdgDpiResults.filter(r => !finishers.some(f => f.skipperIndex === r.skipperIndex)), ...nonFinishers];

      allOrdered.forEach((result, idx) => {
        const virtualPosition = result.position && result.position > 0 ? result.position : finishers.length + rdgDpiResults.filter(r => !finishers.some(f => f.skipperIndex === r.skipperIndex)).length + nonFinishers.indexOf(result) + 1;

        const nextHeatLabel = getNextHeat(
          virtualPosition,
          result.heatDesignation,
          numberOfHeats,
          true
        );

        const nextHeatIndex = heats.indexOf(nextHeatLabel as HeatDesignation);
        if (nextHeatIndex >= 0) {
          if (!newAssignments[nextHeatIndex].skipperIndices.includes(result.skipperIndex)) {
            newAssignments[nextHeatIndex].skipperIndices.push(result.skipperIndex);
          }
        }
      });
    });

    console.log('SHRS: Generated heat assignments using movement tables for next round');
    return newAssignments;
  } else {
    // Use HMS heat system for all rounds
    // - Round 1 (seeding) → Round 2 uses Schedule A (full redistribution)
    // - Round 2+ uses Schedule B/C (promotion/relegation)
    const hmsConfig: HMSConfig = {
      numberOfHeats,
      promotionCount,
      seedingMethod: 'manual'
    };

    try {
      // currentRound.round is the round that just completed
      // generateHeatAssignmentsForNextRace expects the completed race number
      const hmsAssignments = generateHeatAssignmentsForNextRace(
        currentRound.round, // The race/round that just completed
        currentRound,
        hmsConfig
      );

      console.log('✅ Successfully generated HMS heat assignments for next round');
      return hmsAssignments;
    } catch (error) {
      console.error('❌ Error generating heat assignments:', error);
      console.error('Current round data:', currentRound);
      console.error('HMS config:', hmsConfig);
      throw error; // Re-throw to see the full error
    }
  }

  // For each heat, we need to:
  // 1. Start with skippers who BEGAN this round in that heat
  // 2. Remove those who were PROMOTED during this round (they raced in higher heat)
  // 3. Remove those who get RELEGATED at end of this round
  // 4. Add those who get RELEGATED from higher heats

  // Build a map of who raced in which heat (their FINAL heat for the round)
  const skipperFinalHeat = new Map<number, HeatDesignation>();
  Object.entries(resultsByHeat).forEach(([heat, results]) => {
    results.forEach(r => {
      skipperFinalHeat.set(r.skipperIndex, heat as HeatDesignation);
    });
  });

  // Track skippers with RDG/DPI who should be relegated down one heat
  const rdgRelegations = new Set<number>();

  // Process each heat to find RDG/DPI skippers
  heats.forEach((heat, heatIndex) => {
    const heatResults = resultsByHeat[heat] || [];

    // Find skippers with RDG or DPI letter scores
    heatResults.forEach(r => {
      if ((r.letterScore === 'RDG' || r.letterScore === 'DPI') && heatIndex < heats.length - 1) {
        // Only relegate if not already in the lowest heat
        rdgRelegations.add(r.skipperIndex);
        console.log(`🔽 RDG/DPI Relegation: Skipper ${r.skipperIndex} in Heat ${heat} will drop to Heat ${heats[heatIndex + 1]}`);
      }
    });
  });

  // Process each heat to determine next round assignments
  // IMPORTANT: Skippers who raced in multiple heats (promoted mid-round) should be
  // assigned based on their HIGHEST heat result
  heats.forEach((heat, heatIndex) => {
    const heatResults = resultsByHeat[heat] || [];
    const rankedSkippers = heatResults
      .filter(r => r.position !== null && !r.letterScore)
      .map(r => r.skipperIndex);

    console.log(`\nHeat ${heat}: ${rankedSkippers.length} finishers`);

    if (heatIndex === 0) {
      // Heat A (Top Heat): Keep all except bottom N (relegated down)
      // Also remove any RDG skippers who will be relegated
      const keepEnd = Math.max(0, rankedSkippers.length - promotionCount);
      const keepSkippers = rankedSkippers.slice(0, keepEnd).filter(s => !rdgRelegations.has(s));
      const relegatedSkippers = rankedSkippers.slice(keepEnd).filter(s => !rdgRelegations.has(s));
      const rdgRelegatedFromThisHeat = rankedSkippers.filter(s => rdgRelegations.has(s));

      newAssignments[heatIndex].skipperIndices.push(...keepSkippers);
      console.log(`  Heat A: Keeping ${keepSkippers.length}, relegating ${relegatedSkippers.length}, RDG relegated ${rdgRelegatedFromThisHeat.length}`);
      console.log(`  Keeping in Heat A:`, keepSkippers);

      // Add relegated skippers to the next lower heat (performance-based)
      if (heatIndex < heats.length - 1 && relegatedSkippers.length > 0) {
        newAssignments[heatIndex + 1].skipperIndices.push(...relegatedSkippers);
        console.log(`  Relegating to Heat ${heats[heatIndex + 1]}:`, relegatedSkippers);
      }

      // Add RDG relegated skippers to the next lower heat
      if (heatIndex < heats.length - 1 && rdgRelegatedFromThisHeat.length > 0) {
        newAssignments[heatIndex + 1].skipperIndices.push(...rdgRelegatedFromThisHeat);
        console.log(`  RDG Relegating to Heat ${heats[heatIndex + 1]}:`, rdgRelegatedFromThisHeat);
      }
    } else if (heatIndex === heats.length - 1) {
      // Lowest heat (e.g., Heat B in 2-heat system)
      // Only keep skippers who did NOT race in a higher heat
      // (Promoted skippers raced in both heats - use their higher heat result)
      // Note: RDG skippers cannot be relegated further down from the lowest heat
      const skippersThatRacedInHigherHeat = new Set<number>();

      // Check which skippers from this heat also raced in higher heats
      for (let higherHeatIdx = 0; higherHeatIdx < heatIndex; higherHeatIdx++) {
        const higherHeat = heats[higherHeatIdx];
        const higherHeatResults = resultsByHeat[higherHeat] || [];
        higherHeatResults.forEach(r => {
          if (rankedSkippers.includes(r.skipperIndex)) {
            skippersThatRacedInHigherHeat.add(r.skipperIndex);
          }
        });
      }

      // Only keep skippers who stayed in this heat (didn't race in higher heat)
      // RDG skippers in the lowest heat stay in the lowest heat (can't go lower)
      const keepSkippers = rankedSkippers.filter(s => !skippersThatRacedInHigherHeat.has(s));

      // Add RDG skippers from this heat (they stay here since this is the lowest heat)
      const rdgInLowestHeat = heatResults
        .filter(r => (r.letterScore === 'RDG' || r.letterScore === 'DPI'))
        .map(r => r.skipperIndex);

      if (rdgInLowestHeat.length > 0) {
        keepSkippers.push(...rdgInLowestHeat);
        console.log(`  RDG/DPI skippers remaining in lowest heat:`, rdgInLowestHeat);
      }

      newAssignments[heatIndex].skipperIndices.push(...keepSkippers);

      console.log(`  Lowest heat: ${rankedSkippers.length} raced, ${skippersThatRacedInHigherHeat.size} also raced in higher heat`);
      console.log(`  Keeping in Heat ${heat}:`, keepSkippers);
      console.log(`  Promoted skippers (assigned based on higher heat):`, Array.from(skippersThatRacedInHigherHeat));
    } else {
      // Middle heats: Keep middle skippers (not relegated, not promoted)
      // Also exclude skippers who raced in a higher heat
      // RDG skippers get relegated down one heat
      const skippersThatRacedInHigherHeat = new Set<number>();

      for (let higherHeatIdx = 0; higherHeatIdx < heatIndex; higherHeatIdx++) {
        const higherHeat = heats[higherHeatIdx];
        const higherHeatResults = resultsByHeat[higherHeat] || [];
        higherHeatResults.forEach(r => {
          if (rankedSkippers.includes(r.skipperIndex)) {
            skippersThatRacedInHigherHeat.add(r.skipperIndex);
          }
        });
      }

      const skippersOnlyInThisHeat = rankedSkippers.filter(s => !skippersThatRacedInHigherHeat.has(s));
      const keepEnd = Math.max(0, skippersOnlyInThisHeat.length - promotionCount);
      const keepSkippers = skippersOnlyInThisHeat.slice(0, keepEnd).filter(s => !rdgRelegations.has(s));
      const relegatedSkippers = skippersOnlyInThisHeat.slice(keepEnd).filter(s => !rdgRelegations.has(s));
      const rdgRelegatedFromThisHeat = skippersOnlyInThisHeat.filter(s => rdgRelegations.has(s));

      newAssignments[heatIndex].skipperIndices.push(...keepSkippers);
      console.log(`  Middle heat: Keeping ${keepSkippers.length}, relegating ${relegatedSkippers.length}, RDG relegated ${rdgRelegatedFromThisHeat.length}`);
      console.log(`  Keeping in Heat ${heat}:`, keepSkippers);

      if (relegatedSkippers.length > 0) {
        newAssignments[heatIndex + 1].skipperIndices.push(...relegatedSkippers);
        console.log(`  Relegating to Heat ${heats[heatIndex + 1]}:`, relegatedSkippers);
      }

      // Add RDG relegated skippers to the next lower heat
      if (rdgRelegatedFromThisHeat.length > 0) {
        newAssignments[heatIndex + 1].skipperIndices.push(...rdgRelegatedFromThisHeat);
        console.log(`  RDG Relegating to Heat ${heats[heatIndex + 1]}:`, rdgRelegatedFromThisHeat);
      }
    }
  });

  // Log final assignments
  console.log('\n=== NEXT ROUND STARTING ASSIGNMENTS ===');
  newAssignments.forEach((assignment, idx) => {
    console.log(`Heat ${heats[idx]}: ${assignment.skipperIndices.length} skippers - [${assignment.skipperIndices.join(', ')}]`);
  });

  return newAssignments;
};