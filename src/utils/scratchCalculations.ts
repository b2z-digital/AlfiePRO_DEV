import { LetterScore } from '../types/letterScores';

export const calculateScratchResults = (
  skippers: any[],
  results: any[],
  numRaces: number,
  dropRules: number[]
) => {
  // Calculate total points for each skipper
  const skipperTotals = skippers.map((skipper, skipperIndex) => {
    const skipperResults = results.filter(r => r.skipperIndex === skipperIndex);
    
    // Get all race scores for this skipper
    const raceScores: number[] = [];
    const raceDetails: any[] = [];
    
    for (let race = 1; race <= numRaces; race++) {
      const result = skipperResults.find(r => r.race === race);
      if (result) {
        const points = result.points || result.position || 0;
        raceScores.push(points);
        raceDetails.push({
          race,
          points,
          letterScore: result.letterScore,
          isDropped: false
        });
      }
    }
    
    // Determine how many races to drop based on completed races
    let racesToDrop = 0;
    const completedRaces = raceScores.length;
    for (const threshold of dropRules) {
      if (completedRaces >= threshold) {
        racesToDrop++;
      } else {
        break;
      }
    }
    
    // If no drops allowed, return early
    if (racesToDrop === 0) {
      const totalPoints = raceScores.reduce((sum, score) => sum + score, 0);
      return {
        skipperIndex,
        totalPoints,
        raceScores,
        droppedCount: 0,
        raceDetails
      };
    }
    
    // Filter out DNE scores (cannot be dropped) and identify droppable results
    const droppableResults = raceDetails.filter(r => r.letterScore !== 'DNE');
    const nonDroppableResults = raceDetails.filter(r => r.letterScore === 'DNE');
    
    // Sort droppable results by points (highest first) to drop the worst scores
    const sortedDroppableResults = [...droppableResults].sort((a, b) => b.points - a.points);
    
    // Mark the worst droppable scores as dropped (up to racesToDrop)
    let actualDroppedCount = 0;
    for (let i = 0; i < sortedDroppableResults.length && actualDroppedCount < racesToDrop; i++) {
      sortedDroppableResults[i].isDropped = true;
      actualDroppedCount++;
    }
    
    // Update the race details with drop information
    const updatedRaceDetails = raceDetails.map(detail => {
      const droppableResult = sortedDroppableResults.find(r => 
        r.race === detail.race && r.letterScore === detail.letterScore
      );
      return droppableResult || detail;
    });
    
    // Calculate total points (only count non-dropped results)
    const totalPoints = updatedRaceDetails
      .filter(detail => !detail.isDropped)
      .reduce((sum, detail) => sum + detail.points, 0);
    
    return {
      skipperIndex,
      totalPoints,
      raceScores,
      droppedCount: actualDroppedCount,
      raceDetails: updatedRaceDetails
    };
  });
  
  // Sort by total points (lowest wins)
  return skipperTotals.sort((a, b) => a.totalPoints - b.totalPoints);
};

export const getLetterScorePointsForRace = (letterScore: string, race: number, raceResults: any[], skippers: any[], skipperIndex?: number): number => {
  // For RDG and DPI, check if there's a custom points value
  if ((letterScore === 'RDG' || letterScore === 'DPI') && skipperIndex !== undefined) {
    const result = raceResults.find(r => r.race === race && r.skipperIndex === skipperIndex);
    if (result && result.customPoints !== undefined && result.customPoints !== null) {
      return result.customPoints;
    }
  }

  // Calculate the number of starters for this specific race
  const raceStarters = raceResults.filter(result =>
    result.race === race &&
    (result.position !== null || result.letterScore)
  ).length;

  // If no starters data available, fall back to total skippers
  const numStarters = raceStarters > 0 ? raceStarters : skippers.length;

  // For scratch racing, letter scores typically get points equal to number of starters + 1
  return numStarters + 1;
};

/**
 * Apply countback rules for tied skippers
 * 1. Compare number of 1st places, then 2nd, then 3rd, etc. (only counting non-dropped races)
 * 2. If still tied, use last race position as tiebreaker
 */
export const compareWithCountback = (
  aPoints: number[],
  bPoints: number[],
  aDrops: number,
  bDrops: number
): number => {
  // Get non-dropped points for comparison
  const getKeptPoints = (points: number[], drops: number) => {
    if (drops === 0) return points;

    // Sort points to identify worst scores (highest values)
    const sortedIndices = points
      .map((p, idx) => ({ p, idx }))
      .sort((a, b) => b.p - a.p); // Sort by points descending (worst first)

    // Get indices of dropped races
    const droppedIndices = new Set(sortedIndices.slice(0, drops).map(x => x.idx));

    // Return only non-dropped points
    return points.filter((_, idx) => !droppedIndices.has(idx));
  };

  const aKept = getKeptPoints(aPoints, aDrops);
  const bKept = getKeptPoints(bPoints, bDrops);

  // Count occurrences of each position for kept races
  const countPositions = (points: number[]) => {
    const counts: { [key: number]: number } = {};
    points.forEach(p => {
      counts[p] = (counts[p] || 0) + 1;
    });
    return counts;
  };

  const aCounts = countPositions(aKept);
  const bCounts = countPositions(bKept);

  // Compare from 1st place upward
  const maxPosition = Math.max(
    ...Object.keys(aCounts).map(Number),
    ...Object.keys(bCounts).map(Number)
  );

  for (let pos = 1; pos <= maxPosition; pos++) {
    const aCount = aCounts[pos] || 0;
    const bCount = bCounts[pos] || 0;

    if (aCount !== bCount) {
      return bCount - aCount; // More of better position wins (returns negative if a is better)
    }
  }

  // If still tied, use last race as tiebreaker
  if (aPoints.length > 0 && bPoints.length > 0) {
    const aLast = aPoints[aPoints.length - 1];
    const bLast = bPoints[bPoints.length - 1];
    return aLast - bLast; // Lower position in last race wins
  }

  return 0; // Complete tie
};

export const applyDropRules = (
  results: any[],
  dropRules: number[],
  totalRaces: number
): any[] => {
  if (!dropRules || dropRules.length === 0) {
    return results;
  }

  return results.map(result => {
    const { skipperIndex, races, totalPoints } = result;
    
    // Count completed races for this skipper
    const completedRaces = races.filter((race: any) => 
      race.points !== null && race.points !== undefined
    ).length;
    
    // Determine how many races to drop based on completed races
    let racesToDrop = 0;
    for (const threshold of dropRules) {
      if (completedRaces >= threshold) {
        racesToDrop++;
      } else {
        break;
      }
    }
    
    if (racesToDrop === 0) {
      return {
        ...result,
        netPoints: totalPoints,
        droppedRaces: []
      };
    }
    
    // Get races with points, but exclude DNE scores from being dropped
    const racesWithPoints = races
      .map((race: any, index: number) => ({ ...race, raceNumber: index + 1 }))
      .filter((race: any) => 
        race.points !== null && 
        race.points !== undefined && 
        race.letterScore !== 'DNE'  // DNE scores cannot be dropped
      )
    
    // Separate droppable and non-droppable results
    const droppableRaces = racesWithPoints.filter((race: any) => race.letterScore !== 'DNE');
    const nonDroppableRaces = racesWithPoints.filter((race: any) => race.letterScore === 'DNE');
    
    // Sort droppable races by points (highest first for dropping)
    const sortedDroppableRaces = droppableRaces.sort((a: any, b: any) => b.points - a.points);
    
    // Drop the worst droppable races only
    const actualDroppedRaces = sortedDroppableRaces.slice(0, Math.min(racesToDrop, droppableRaces.length));
    const droppedPoints = actualDroppedRaces.reduce((sum: number, race: any) => sum + race.points, 0);
    
    return {
      ...result,
      netPoints: Math.max(0, totalPoints - droppedPoints),
      droppedRaces: actualDroppedRaces.map((race: any) => race.raceNumber)
    };
  });
};