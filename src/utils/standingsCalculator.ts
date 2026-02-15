import { RaceEvent } from '../types/race';
import { LetterScore } from '../types';
import { getLetterScorePointsForRace } from './scratchCalculations';
import { combineAllDayResults } from './raceStorage';

// Helper function to get letter score value
const getLetterScoreValue = (
  letterScore: LetterScore | undefined,
  numFinishers: number,
  totalCompetitors: number
): number => {
  if (!letterScore) return 0;

  switch (letterScore) {
    case 'DNF':
    case 'RET':
      return numFinishers + 1;
    case 'DNS':
    case 'DNC':
      return totalCompetitors + 1;
    case 'DSQ':
      return totalCompetitors + 2;
    case 'BFD':
    case 'OCS':
      return totalCompetitors + 1;
    case 'DNE':
      return totalCompetitors + 2;
    case 'RDG':
    case 'DPI':
      return 0; // Manual points - handled separately
    case 'NSC':
    case 'WDN':
      return totalCompetitors + 1;
    default:
      return totalCompetitors + 1;
  }
};

// Group results by race number
const groupResultsByRace = (event: RaceEvent) => {
  const resultsByRace: Record<number, any[]> = {};

  if (!event.raceResults || !event.skippers) return resultsByRace;

  const skipperCount = event.skippers.length;
  if (skipperCount === 0) return resultsByRace;

  const hasRaceProperty = event.raceResults.some(r => r.race !== undefined);

  if (hasRaceProperty) {
    event.raceResults.forEach(result => {
      const raceNum = result.race;
      if (!resultsByRace[raceNum]) {
        resultsByRace[raceNum] = [];
      }
      resultsByRace[raceNum].push(result);
    });
  } else {
    let currentRace = 1;
    let skippersSeen = 0;

    event.raceResults.forEach((result, index) => {
      if (!resultsByRace[currentRace]) {
        resultsByRace[currentRace] = [];
      }

      resultsByRace[currentRace].push({
        ...result,
        race: currentRace
      });

      skippersSeen++;

      if (skippersSeen === skipperCount) {
        currentRace++;
        skippersSeen = 0;
      }
    });
  }

  return resultsByRace;
};

// Calculate totals for all skippers
const calculateTotals = (event: RaceEvent, allResults: any[]) => {
  const totals: Record<number, { gross: number; net: number }> = {};
  const drops: Record<string, boolean> = {};

  if (!event.skippers || event.skippers.length === 0) {
    return { totals, drops };
  }

  const skippers = event.skippers;
  const skipperGroups: Record<number, any[]> = {};

  // SHRS Rule 5.2: For SHRS, use the number of boats in the largest heat instead of total skippers
  const isSHRS = event.scoringSystem === 'shrs' || event.heatManagement?.configuration?.scoringSystem === 'shrs';
  let largestHeatSize = skippers.length;

  if (isSHRS && event.heatManagement?.rounds && event.heatManagement.rounds.length > 0) {
    // Find the largest heat size across all rounds
    largestHeatSize = 0;
    event.heatManagement.rounds.forEach(round => {
      if (round.heats) {
        round.heats.forEach(heat => {
          const heatSize = heat.skippers?.length || 0;
          if (heatSize > largestHeatSize) {
            largestHeatSize = heatSize;
          }
        });
      }
    });
    // Fallback to total skippers if no heats found
    if (largestHeatSize === 0) {
      largestHeatSize = skippers.length;
    }
  }

  const totalCompetitorsForScoring = isSHRS ? largestHeatSize : skippers.length;

  allResults.forEach(result => {
    if (!skipperGroups[result.skipperIndex]) {
      skipperGroups[result.skipperIndex] = [];
    }
    skipperGroups[result.skipperIndex].push(result);
  });

  Object.entries(skipperGroups).forEach(([skipperIndex, results]) => {
    const idx = parseInt(skipperIndex);
    const scores = results.map((r: any) => {
      if (r.position !== null && !r.letterScore) {
        return { race: r.race, score: r.position };
      }

      if (r.letterScore) {
        const raceFinishers = allResults
          .filter(res => res.race === r.race && res.position !== null && !res.letterScore)
          .length;

        if (r.letterScore === 'RDGfix' && r.position !== null) {
          return { race: r.race, score: r.position, isLetterScore: true };
        }

        return {
          race: r.race,
          score: getLetterScoreValue(r.letterScore as LetterScore, raceFinishers, totalCompetitorsForScoring),
          isLetterScore: true
        };
      }

      return { race: r.race, score: totalCompetitorsForScoring + 1 };
    });

    const gross = scores.reduce((sum, r) => sum + r.score, 0);

    let numDrops = 0;
    const dropRules = event.dropRules || [4, 8, 16, 24, 32, 40];

    for (const threshold of dropRules) {
      if (scores.length >= threshold) {
        numDrops++;
      } else {
        break;
      }
    }

    if (numDrops === 0) {
      totals[idx] = { gross, net: gross };
      return;
    }

    const letterScores = scores
      .filter(r => 'isLetterScore' in r)
      .sort((a, b) => b.score - a.score);

    const dropsRemaining = Math.max(0, numDrops - letterScores.length);
    const remainingScores = scores
      .filter(r => !('isLetterScore' in r))
      .sort((a, b) => b.score - a.score);

    letterScores.slice(0, numDrops).forEach(r => {
      drops[`${idx}-${r.race}`] = true;
    });

    remainingScores.slice(0, dropsRemaining).forEach(r => {
      drops[`${idx}-${r.race}`] = true;
    });

    let net = gross;
    scores.forEach(r => {
      if (drops[`${idx}-${r.race}`]) {
        net -= r.score;
      }
    });

    totals[idx] = { gross, net };
  });

  return { totals, drops };
};

// Countback comparison function for tied net scores
const compareSkippersWithCountback = (event: RaceEvent, resultsByRaceMap: Record<number, any[]>, drops: Record<string, boolean>) => {
  return (a: any, b: any): number => {
    if (a.netTotal !== b.netTotal) {
      return a.netTotal - b.netTotal;
    }

    const aPositionCounts: number[] = [];
    const bPositionCounts: number[] = [];
    let lastRaceAPosition: number | null = null;
    let lastRaceBPosition: number | null = null;

    const raceNums = Object.keys(resultsByRaceMap).map(Number).sort((a, b) => a - b);

    for (const raceNum of raceNums) {
      const raceResults = resultsByRaceMap[raceNum] || [];
      const aResult = raceResults.find(r => r.skipperIndex === a.index);
      const bResult = raceResults.find(r => r.skipperIndex === b.index);

      const aIsDropped = drops[`${a.index}-${raceNum}`];
      const bIsDropped = drops[`${b.index}-${raceNum}`];

      if (aResult && aResult.position !== null && !aResult.letterScore && !aIsDropped) {
        aPositionCounts.push(aResult.position);
      }

      if (bResult && bResult.position !== null && !bResult.letterScore && !bIsDropped) {
        bPositionCounts.push(bResult.position);
      }

      if (aResult && aResult.position !== null && !aResult.letterScore) {
        lastRaceAPosition = aResult.position;
      }
      if (bResult && bResult.position !== null && !bResult.letterScore) {
        lastRaceBPosition = bResult.position;
      }
    }

    aPositionCounts.sort((x, y) => x - y);
    bPositionCounts.sort((x, y) => x - y);

    const maxPosition = Math.max(...aPositionCounts, ...bPositionCounts, 1);

    for (let pos = 1; pos <= maxPosition; pos++) {
      const aCount = aPositionCounts.filter(p => p === pos).length;
      const bCount = bPositionCounts.filter(p => p === pos).length;

      if (aCount !== bCount) {
        return bCount - aCount;
      }
    }

    if (lastRaceAPosition !== null && lastRaceBPosition !== null && lastRaceAPosition !== lastRaceBPosition) {
      return lastRaceAPosition - lastRaceBPosition;
    }

    return a.index - b.index;
  };
};

/**
 * Calculate the sorted standings for an event
 * This function is used by both the results display and dashboard
 */
export const calculateEventStandings = (event: RaceEvent): Array<{name: string, netTotal: number, index: number}> => {
  if (!event.skippers || event.skippers.length === 0) {
    return [];
  }

  // For multi-day events, combine all day results
  const allResults = event.multiDay ? combineAllDayResults(event) : event.raceResults;

  // Even if there are no results yet, we should still return skippers with default values
  const { totals, drops } = calculateTotals(event, allResults || []);
  const resultsByRaceMap = groupResultsByRace(event);

  const sortedSkippers = event.skippers
    .map((skipper: any, index: number) => {
      // Convert drops object to isDropped map for this skipper
      const isDropped: Record<number, boolean> = {};
      Object.keys(drops).forEach(key => {
        const [skipperIdx, raceNum] = key.split('-').map(Number);
        if (skipperIdx === index) {
          isDropped[raceNum] = true;
        }
      });

      return {
        ...skipper,
        index,
        netTotal: totals[index]?.net || Number.MAX_SAFE_INTEGER,
        hasResults: totals[index] !== undefined,
        isDropped
      };
    })
    .sort((a: any, b: any) => {
      // Skippers without results go to the bottom
      if (!a.hasResults && !b.hasResults) return 0;
      if (!a.hasResults) return 1;
      if (!b.hasResults) return -1;

      // Use countback for skippers with results
      return compareSkippersWithCountback(event, resultsByRaceMap, drops)(a, b);
    });

  return sortedSkippers;
};

/**
 * Get the top N finishers from an event
 */
export const getTopFinishers = (event: RaceEvent, count: number = 3): Array<{position: number, name: string, avatarUrl?: string}> => {
  const sortedSkippers = calculateEventStandings(event);

  return sortedSkippers
    .slice(0, Math.min(count, sortedSkippers.length))
    .map((skipper: any, index) => ({
      position: index + 1,
      name: skipper.name,
      avatarUrl: skipper.avatarUrl
    }));
};
