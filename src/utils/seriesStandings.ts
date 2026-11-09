/**
 * Series standings, moved verbatim out of SeriesResultsDisplay so the phone app and the web show
 * the same table: round positions with countback, DNC points for missed rounds, average and manual
 * overrides, and the series drops (HMS default 4, 8, 16, 24, 32, 40).
 */
import type { RaceSeries } from '../types/race';
import type { LetterScore } from '../types';
import { mergeSeriesSkippersByName, findRoundSkipperIndex, getMergedOverride, getSkipperSailNumber } from './seriesSkipperMerge';

export interface SeriesStandingRow {
  [key: string]: any;
  index: number;
  roundPoints: (number | null)[];
  roundPositions: (number | null)[];
  droppedRounds: Set<number>;
  total: number;
}

/** True when any round has results (the web shows "No Results Available" otherwise). */
export function seriesHasResults(series: RaceSeries): boolean {
  return series.rounds.some(r =>
    (r.raceResults && r.raceResults.length > 0) ||
    (r.results && r.results.length > 0) ||
    (r.lastCompletedRace && r.lastCompletedRace > 0)
  );

}

/** The series' skippers, or (when it has none) everyone who sailed a completed round. */
export function effectiveSeriesSkippers(series: RaceSeries): any[] {
  const hasAnyResults = seriesHasResults(series);
  // If series has no series-level skippers, try to get unique skippers from COMPLETED rounds only
  let effectiveSkippers = series.skippers || [];
  if ((!effectiveSkippers || effectiveSkippers.length === 0) && hasAnyResults) {
    const skipperMap = new Map();
    series.rounds.forEach(round => {
      if (round.completed && ((round.raceResults && round.raceResults.length > 0) || (round.results && round.results.length > 0))) {
        (round.skippers || []).forEach((skipper: any) => {
          const sailNum = skipper.sailNumber || skipper.sailNo;
          if (sailNum && !skipperMap.has(sailNum)) {
            skipperMap.set(sailNum, skipper);
          }
        });
      }
    });
    effectiveSkippers = Array.from(skipperMap.values());
  }

  return effectiveSkippers;
}

export function computeSeriesStandings(displaySeries: RaceSeries): SeriesStandingRow[] {
  const series = displaySeries;
  const getLetterScoreValue = (letterScore: LetterScore | undefined, _numFinishers: number, totalCompetitors: number): number => {
    if (!letterScore) return 0;
    // RRS Appendix A scoring: all letter scores = number of starters + 1
    return totalCompetitors + 1;
  };
    // Create a local function that uses displaySeries
    if (!displaySeries.skippers || displaySeries.skippers.length === 0) {
      return [];
    }

    const mergedSkippers = mergeSeriesSkippersByName(displaySeries.skippers);

    // Initialize skipper points tracking
    const skipperPoints: any[] = mergedSkippers.map((skipper) => ({
      ...skipper,
      index: skipper.sourceIndices[0],
      roundPoints: new Array(displaySeries.rounds.length).fill(null),
      roundPositions: new Array(displaySeries.rounds.length).fill(null),
      droppedRounds: new Set<number>(),
      total: 0
    }));

    // For each round, calculate positions and points
    displaySeries.rounds.forEach((round, roundIndex) => {
      if (!round.completed) return;

      // Get round results and round skippers
      const roundResults = round.results || round.raceResults || [];
      if (roundResults.length === 0) return;

      const roundSkippers = round.skippers || [];
      const numRoundSkippers = roundSkippers.length;

      // DEBUG: Log Round 4 data
      if (roundIndex === 3) {
      }

      // Calculate totals for each skipper in this round
      const skipperTotals = mergedSkippers.map((skipper, skipperIndex) => {
        const roundSkipperIndex = findRoundSkipperIndex(roundSkippers, skipper);
        const sailNum = roundSkipperIndex !== -1
          ? getSkipperSailNumber(roundSkippers[roundSkipperIndex])
          : skipper.displaySailNo;

        // If skipper didn't compete in this round, assign DNS points (number of competitors + 1)
        if (roundSkipperIndex === -1) {
          return {
            skipperIndex,
            roundSkipperIndex,
            totalPoints: numRoundSkippers + 1,
            netPoints: numRoundSkippers + 1,
            sailNumber: sailNum,
            didNotCompete: true
          };
        }

        // Collect race results from this skipper
        const skipperRoundResults = roundResults.filter((r: any) => r.skipperIndex === roundSkipperIndex);

        // Calculate gross points (sum of all race scores) and track DNE scores separately
        const raceScores: Array<{score: number, isDNE: boolean, isLetterScore: boolean, isAvgSentinel: boolean, race?: number}> = [];
        const avgSentinelIndices: number[] = [];
        skipperRoundResults.forEach((result: any) => {
          if (result.position && !result.letterScore) {
            raceScores.push({score: result.position, isDNE: false, isLetterScore: false, isAvgSentinel: false, race: result.race});
          } else if (result.letterScore) {
            if ((result.letterScore === 'RDG' || result.letterScore === 'DPI' || result.letterScore === 'ROD') && result.customPoints !== undefined && result.customPoints !== null) {
              let score = result.customPoints;
              let isSentinel = false;
              if (score < 0 && (result.letterScore === 'ROD' || result.letterScore === 'RDG')) {
                isSentinel = true;
                const skipperRes = roundResults.filter((r: any) => r.skipperIndex === result.skipperIndex);
                const nScores: number[] = [];
                for (const res of skipperRes) {
                  if (res.letterScore === 'ROD') continue;
                  if (res.customPoints !== undefined && res.customPoints < 0) continue;
                  if (res.customPoints !== undefined && res.customPoints !== null && res.customPoints >= 0) { nScores.push(res.customPoints); }
                  else if (res.position !== null && res.position > 0 && !res.letterScore) { nScores.push(res.position); }
                }
                score = nScores.length > 0 ? nScores.reduce((a, b) => a + b, 0) / nScores.length : 0;
                if (isSentinel) avgSentinelIndices.push(raceScores.length);
              }
              if (series.raceFormat !== 'handicap') score = Math.round(score * 100) / 100;
              raceScores.push({
                score,
                isDNE: false,
                isLetterScore: true,
                isAvgSentinel: isSentinel,
                race: result.race
              });
            } else {
              const raceFinishers = roundResults.filter((r: any) =>
                r.race === result.race && r.position && !r.letterScore
              ).length;
              raceScores.push({
                score: getLetterScoreValue(result.letterScore as LetterScore, raceFinishers, numRoundSkippers),
                isDNE: result.letterScore === 'DNE',
                isLetterScore: true,
                isAvgSentinel: false,
                race: result.race
              });
            }
          }
        });

        // Calculate net points (gross minus worst scores based on drop rules)
        const numRaces = skipperRoundResults.length;
        let numDrops = 0;
        const roundDropRules = (round.dropRules && round.dropRules.length > 0) ? round.dropRules : [4, 8, 12];

        for (const threshold of roundDropRules) {
          if (numRaces >= threshold) {
            numDrops++;
          }
        }

        let grossPoints = raceScores.reduce((sum, item) => sum + item.score, 0);
        let netPoints = grossPoints;
        if (numDrops > 0 && raceScores.length > 0) {
          // First pass: determine drops
          const droppableFirst = raceScores.filter(s => !s.isDNE);
          const sortedFirst = [...droppableFirst].sort((a, b) => b.score - a.score);
          const droppedRaces = new Set<number>();
          sortedFirst.slice(0, Math.min(numDrops, droppableFirst.length)).forEach(r => {
            if (r.race !== undefined) droppedRaces.add(r.race);
          });

          // Second pass: recalculate average sentinels excluding dropped races
          if (avgSentinelIndices.length > 0) {
            const skipperRes = roundResults.filter((r: any) => r.skipperIndex === roundSkipperIndex);
            const nonDroppedScores: number[] = [];
            for (const res of skipperRes) {
              if (res.letterScore === 'ROD') continue;
              if (res.customPoints !== undefined && res.customPoints < 0) continue;
              if (res.race !== undefined && droppedRaces.has(res.race)) continue;
              if (res.customPoints !== undefined && res.customPoints !== null && res.customPoints >= 0) { nonDroppedScores.push(res.customPoints); }
              else if (res.position !== null && res.position > 0 && !res.letterScore) { nonDroppedScores.push(res.position); }
            }
            const avg = nonDroppedScores.length > 0 ? nonDroppedScores.reduce((a, b) => a + b, 0) / nonDroppedScores.length : 0;
            const roundedAvg = series.raceFormat !== 'handicap' ? Math.round(avg * 100) / 100 : avg;
            avgSentinelIndices.forEach(i => { raceScores[i].score = roundedAvg; });
          }

          // Recalculate gross and net with updated scores
          grossPoints = raceScores.reduce((sum, item) => sum + item.score, 0);
          const droppableSecond = raceScores.filter(s => !s.isDNE);
          const sortedSecond = [...droppableSecond].sort((a, b) => b.score - a.score);
          const scoresToDrop = sortedSecond.slice(0, Math.min(numDrops, droppableSecond.length));
          const dropsTotal = scoresToDrop.reduce((sum, item) => sum + item.score, 0);
          netPoints = grossPoints - dropsTotal;
        }

        return {
          skipperIndex,
          roundSkipperIndex,
          totalPoints: grossPoints,
          netPoints: netPoints,
          sailNumber: sailNum,
          didNotCompete: false
        };
      });

      // Check for average points or manual overrides for this round
      if (roundIndex === 2 && round.averagePointsApplied) {
      }

      // Separate skippers who competed from those who didn't
      const competed = skipperTotals.filter(s => !s.didNotCompete);
      const didNotCompete = skipperTotals.filter(s => s.didNotCompete);

      // Sort skippers who competed by net points with countback tiebreaking
      const sortedCompeted = [...competed].sort((a, b) => {
        // First compare by net points
        if (a.netPoints !== b.netPoints) {
          return a.netPoints - b.netPoints;
        }

        // If tied on net, apply countback - compare individual race positions
        const aPositions: number[] = [];
        const bPositions: number[] = [];

        // Get all race positions for both skippers in this round
        const aRoundSkipperIndex = a.roundSkipperIndex;
        const bRoundSkipperIndex = b.roundSkipperIndex;
        roundResults.forEach((result: any) => {
          if (result.skipperIndex === aRoundSkipperIndex && result.position !== null && !result.letterScore) {
            aPositions.push(result.position);
          }
          if (result.skipperIndex === bRoundSkipperIndex && result.position !== null && !result.letterScore) {
            bPositions.push(result.position);
          }
        });

        // Sort positions
        aPositions.sort((x, y) => x - y);
        bPositions.sort((x, y) => x - y);

        // Compare count of 1sts, then 2nds, then 3rds, etc.
        const maxPosition = Math.max(...aPositions, ...bPositions, 1);

        for (let pos = 1; pos <= maxPosition; pos++) {
          const aCount = aPositions.filter(p => p === pos).length;
          const bCount = bPositions.filter(p => p === pos).length;

          if (aCount !== bCount) {
            return bCount - aCount; // More of a better position wins
          }
        }

        // If still tied, maintain original skipper order
        return a.skipperIndex - b.skipperIndex;
      });

      // Assign positions to skippers who competed based on net points
      sortedCompeted.forEach((item, position) => {
        let roundPosition = position + 1;
        let roundPoints = roundPosition;

        // Debug for round 4
        if (roundIndex === 3) {
        }

        const averageOverride = getMergedOverride(round.averagePointsApplied, mergedSkippers[item.skipperIndex]);
        const manualOverride = getMergedOverride(round.manualScoreOverrides, mergedSkippers[item.skipperIndex]);

        if (averageOverride !== undefined) {
          roundPoints = averageOverride;
        } else if (manualOverride !== undefined) {
          roundPoints = manualOverride;
        }

        skipperPoints[item.skipperIndex].roundPositions[roundIndex] = roundPosition;
        // Store the position for display and series calculations
        skipperPoints[item.skipperIndex].roundPoints[roundIndex] = roundPoints;  // Use override if present
        // Add the round position to the total (for series calculations)
        skipperPoints[item.skipperIndex].total += roundPoints;  // Use override if present
      });

      // Assign DNC points to skippers who didn't compete (no position, just points)
      didNotCompete.forEach(item => {
        let dncPoints = item.totalPoints;

        const averageOverride = getMergedOverride(round.averagePointsApplied, mergedSkippers[item.skipperIndex]);
        const manualOverride = getMergedOverride(round.manualScoreOverrides, mergedSkippers[item.skipperIndex]);

        if (averageOverride !== undefined) {
          dncPoints = averageOverride;
        } else if (manualOverride !== undefined) {
          dncPoints = manualOverride;
        }

        skipperPoints[item.skipperIndex].roundPositions[roundIndex] = null;
        skipperPoints[item.skipperIndex].roundPoints[roundIndex] = dncPoints;
        // Add DNC points to the total
        skipperPoints[item.skipperIndex].total += dncPoints;
      });
    });

    // Apply drops based on series dropRules
    const completedRounds = displaySeries.rounds.filter(r => r.completed).length;
    let numDrops = 0;
    // Fix: Empty array is truthy, so check length explicitly
    const dropRules = (displaySeries.dropRules && displaySeries.dropRules.length > 0)
      ? displaySeries.dropRules
      : [4, 8, 16, 24, 32, 40]; // Default to HMS rules

    // Count drops based on number of completed rounds
    for (const threshold of dropRules) {
      if (completedRounds >= threshold) {
        numDrops++;
      }
    }

    if (numDrops > 0) {
      skipperPoints.forEach(skipper => {
        // Get all round scores with their indices
        const roundScoresWithIndex: Array<{score: number, index: number}> = [];

        skipper.roundPositions.forEach((pos: number | null, idx: number) => {
          if (pos !== null) {
            // Skipper competed - use their position
            roundScoresWithIndex.push({ score: pos, index: idx });
          } else if (skipper.roundPoints[idx] !== null) {
            // Skipper didn't compete - use DNC points
            roundScoresWithIndex.push({ score: skipper.roundPoints[idx], index: idx });
          }
        });

        // Sort by score (worst first), then by index for deterministic ordering
        roundScoresWithIndex.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return a.index - b.index;
        });

        // Get the indices and scores to drop
        const itemsToDrop = roundScoresWithIndex.slice(0, Math.min(numDrops, roundScoresWithIndex.length));

        // Store dropped indices as a Set for efficient lookup during rendering (same as HeatOverallResultsModal)
        skipper.droppedRounds = new Set(itemsToDrop.map(item => item.index));

        // Subtract dropped scores from total
        itemsToDrop.forEach(item => {
          skipper.total -= item.score;
        });
      });
    }

    // Sort by total points
    return skipperPoints.sort((a, b) => {
      if (a.total !== b.total) return a.total - b.total;
      // Countback on most recent races
      for (let i = displaySeries.rounds.length - 1; i >= 0; i--) {
        if (a.roundPoints[i] !== null && b.roundPoints[i] !== null) {
          if (a.roundPoints[i] !== b.roundPoints[i]) {
            return a.roundPoints[i] - b.roundPoints[i];
          }
        }
      }
      return 0;
    });
  }
