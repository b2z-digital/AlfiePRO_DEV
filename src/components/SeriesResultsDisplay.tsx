import React, { useState } from 'react';
import { Trophy, Medal, TrendingUp, Award, ChevronDown, ChevronUp } from 'lucide-react';
import { RaceSeries } from '../types/race';
import { formatDate } from '../utils/date';
import { LetterScore } from '../types';
import { getLetterScorePointsForRace } from '../utils/scratchCalculations';
import { SeriesSkipperPerformanceInsights } from './SeriesSkipperPerformanceInsights';
import '../styles/results-export.css';

interface SeriesResultsDisplayProps {
  series: RaceSeries;
  darkMode?: boolean;
  isExportMode?: boolean;
}

export const SeriesResultsDisplay: React.FC<SeriesResultsDisplayProps> = ({
  series,
  darkMode = true,
  isExportMode = false
}) => {
  // Debug log on every render
  console.log('=== SeriesResultsDisplay RENDER ===');
  console.log('Series name:', series.seriesName);
  console.log('Number of rounds:', series.rounds?.length);
  if (series.rounds && series.rounds[2]) {
    console.log('Round 3 averagePointsApplied:', series.rounds[2].averagePointsApplied);
    console.log('Round 3 manualScoreOverrides:', series.rounds[2].manualScoreOverrides);
  }

  const [activeRound, setActiveRound] = useState<number>(0);
  const [activeView, setActiveView] = useState<'round' | 'standings'>('standings');
  const [expandedSkipper, setExpandedSkipper] = useState<number | null>(null);

  const toggleSkipperExpansion = (skipperIndex: number) => {
    if (isExportMode) return;
    setExpandedSkipper(expandedSkipper === skipperIndex ? null : skipperIndex);
  };

  // Helper function to get letter score value
  const getLetterScoreValue = (
    letterScore: LetterScore | undefined,
    numFinishers: number,
    totalCompetitors: number
  ): number => {
    if (!letterScore) return 0;

    // RRS Appendix A scoring: all letter scores = number of starters + 1
    // This ensures consistency with individual race/event displays
    return totalCompetitors + 1;
  };

  // Group results by race number for the current round
  const groupResultsByRace = (roundIndex: number) => {
    const resultsByRace: Record<number, any[]> = {};
    
    if (!series.rounds[roundIndex] || !series.skippers) return resultsByRace;
    
    const round = series.rounds[roundIndex];
    const roundResults = round.results || [];
    
    if (roundResults.length === 0) return resultsByRace;
    
    // Determine race numbers from results
    // If race property is missing, infer it from the pattern of results
    const skipperCount = series.skippers.length;
    if (skipperCount === 0) return resultsByRace;
    
    // If race property exists, use it directly
    const hasRaceProperty = roundResults.some(r => r.race !== undefined);
    
    if (hasRaceProperty) {
      // Group by existing race property
      roundResults.forEach(result => {
        const raceNum = result.race;
        if (!resultsByRace[raceNum]) {
          resultsByRace[raceNum] = [];
        }
        resultsByRace[raceNum].push(result);
      });
    } else {
      // Infer race numbers based on the pattern of results
      // Assuming results are grouped by race in order
      let currentRace = 1;
      let skippersSeen = 0;
      
      roundResults.forEach((result, index) => {
        if (!resultsByRace[currentRace]) {
          resultsByRace[currentRace] = [];
        }
        
        resultsByRace[currentRace].push({
          ...result,
          race: currentRace
        });
        
        skippersSeen++;
        
        // When we've seen all skippers for this race, move to the next race
        if (skippersSeen === skipperCount) {
          currentRace++;
          skippersSeen = 0;
        }
      });
    }
    
    return resultsByRace;
  };

  // Calculate results for the current round
  const calculateRoundResults = (roundIndex: number) => {
    if (!series.rounds[roundIndex] || !series.skippers || series.skippers.length === 0) {
      return { totals: {}, drops: {} };
    }
    
    const round = series.rounds[roundIndex];
    const roundResults = round.results || [];
    
    if (roundResults.length === 0) {
      return { totals: {}, drops: {} };
    }
    
    const totals: Record<number, { gross: number; net: number }> = {};
    const drops: Record<string, boolean> = {};
    
    // Group results by skipper
    const skipperGroups: Record<number, any[]> = {};
    
    // Determine race numbers from results
    const resultsByRace = groupResultsByRace(roundIndex);
    const raceNumbers = Object.keys(resultsByRace).map(Number).sort((a, b) => a - b);
    
    // Prepare results with race numbers if missing
    const processedResults = roundResults.map((result, index) => {
      if (result.race !== undefined) return result;
      
      // Calculate race number based on index and skipper count
      const raceNum = Math.floor(index / series.skippers.length) + 1;
      return { ...result, race: raceNum };
    });
    
    // Group by skipper
    processedResults.forEach(result => {
      if (!skipperGroups[result.skipperIndex]) {
        skipperGroups[result.skipperIndex] = [];
      }
      skipperGroups[result.skipperIndex].push(result);
    });
    
    // Calculate drops and totals
    Object.entries(skipperGroups).forEach(([skipperIndex, results]) => {
      const idx = parseInt(skipperIndex);
      
      // Calculate scores for each race
      const scores = results.map(r => {
        if (r.position !== null && !r.letterScore) {
          return { race: r.race, score: r.position, isDNE: false, isLetterScore: false };
        }

        if (r.letterScore) {
          // Special case for RDGfix
          if (r.letterScore === 'RDGfix' && r.position !== null) {
            return { race: r.race, score: r.position, isDNE: false, isLetterScore: true };
          }

          // For RDG and DPI with custom points, use the custom points
          if ((r.letterScore === 'RDG' || r.letterScore === 'DPI') && r.customPoints !== undefined && r.customPoints !== null) {
            return {
              race: r.race,
              score: r.customPoints,
              isDNE: false,
              isLetterScore: true
            };
          }

          // Count finishers (skippers with positions, not letter scores) for standard letter scores
          const raceFinishers = processedResults
            .filter(res => res.race === r.race && res.position !== null && !res.letterScore)
            .length;

          return {
            race: r.race,
            score: getLetterScoreValue(r.letterScore as LetterScore, raceFinishers, series.skippers.length),
            isDNE: r.letterScore === 'DNE',
            isLetterScore: true
          };
        }

        return { race: r.race, score: series.skippers.length + 1, isDNE: false, isLetterScore: false }; // Default for missing results
      });

      // Calculate gross score
      const gross = scores.reduce((sum, r) => sum + r.score, 0);

      // Determine number of drops using drop rules from series or round
      let numDrops = 0;
      // Fix: Empty array is truthy, so check length explicitly
      const roundDropRules = series.rounds[roundIndex]?.dropRules;
      const seriesDropRules = series.dropRules;
      const dropRules = (roundDropRules && roundDropRules.length > 0)
        ? roundDropRules
        : (seriesDropRules && seriesDropRules.length > 0)
          ? seriesDropRules
          : [4, 8, 16, 24, 32, 40]; // Default to HMS rules

      // Count drops based on number of races completed in this round
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

      // Separate DNE scores (not droppable) from droppable scores
      const dneScores = scores.filter(s => s.isDNE);
      const letterScores = scores.filter(s => s.isLetterScore && !s.isDNE);
      const regularScores = scores.filter(s => !s.isLetterScore);

      // Letter scores (except DNE) and regular scores are droppable
      const droppableScores = [...letterScores, ...regularScores];

      // Sort droppable scores by worst (highest) first and drop the worst N
      const sortedDroppableScores = [...droppableScores].sort((a, b) => b.score - a.score);
      sortedDroppableScores.slice(0, numDrops).forEach(r => {
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

  // Calculate overall series results
  const calculateSeriesResults = () => {
    if (!series.skippers || series.skippers.length === 0) {
      return [];
    }

    // Calculate points for each skipper in each round
    const skipperPoints: Record<number, {
      roundPositions: (number | null)[],
      roundPoints: (number | null)[],
      total: number,
      // Track counts of each position for tiebreaking
      positionCounts: Record<number, number>
    }> = {};

    series.skippers.forEach((_, skipperIndex) => {
      skipperPoints[skipperIndex] = {
        roundPositions: [],
        roundPoints: [],
        total: 0,
        positionCounts: {}
      };

      series.rounds.forEach((round, roundIndex) => {
        // Skip rounds that haven't been completed yet
        if (!round.completed) {
          skipperPoints[skipperIndex].roundPositions[roundIndex] = null;
          skipperPoints[skipperIndex].roundPoints[roundIndex] = null;
          return;
        }

        // Debug logging for round data
        if (roundIndex === 2) { // Round 3 (index 2)
          console.log('=== ROUND 3 DEBUG (Skipper ' + skipperIndex + ') ===');
          console.log('Round object:', round);
          console.log('averagePointsApplied:', round.averagePointsApplied);
          console.log('manualScoreOverrides:', round.manualScoreOverrides);
          console.log('round.results:', round.results);
          console.log('round.raceResults:', round.raceResults);
        }

        // Get results from either field name
        const roundResults = round.results || round.raceResults || [];
        const roundSkippers = round.skippers || [];

        // Map series skipperIndex to round skipperIndex
        // Find this skipper in the round's skippers array by matching sail number
        const seriesSkipper = series.skippers[skipperIndex];
        const seriesSailNum = seriesSkipper?.sailNumber || seriesSkipper?.sailNo;

        const roundSkipperIndex = roundSkippers.findIndex((rSkipper: any) => {
          const roundSailNum = rSkipper?.sailNumber || rSkipper?.sailNo;
          return roundSailNum === seriesSailNum;
        });

        if (roundIndex === 3) { // Round 4 (index 3)
          console.log(`[Rd4 Mapping] Series ${skipperIndex} (Sail ${seriesSailNum}, Name: ${seriesSkipper?.name}) -> Round ${roundSkipperIndex}`);
        }

        // Check if skipper participated in this round
        const skipperParticipated = roundSkipperIndex !== -1 && roundResults.some(r => r.skipperIndex === roundSkipperIndex);

        if (!skipperParticipated) {
          // Skipper did not participate - assign (number of skippers in THIS round + 1)
          // Count unique skippers who competed in THIS round
          const roundCompetitors = new Set(roundResults.map(r => r.skipperIndex) || []).size;
          skipperPoints[skipperIndex].roundPositions[roundIndex] = null;
          skipperPoints[skipperIndex].roundPoints[roundIndex] = roundCompetitors + 1;
          skipperPoints[skipperIndex].total += roundCompetitors + 1;
          return;
        }

        if (roundResults.length === 0) {
          skipperPoints[skipperIndex].roundPositions[roundIndex] = null;
          skipperPoints[skipperIndex].roundPoints[roundIndex] = null;
          return;
        }

        // Check for manually applied average points or score overrides first
        // These use the round-level skipperIndex
        const hasAverageApplied = round.averagePointsApplied?.[roundSkipperIndex] !== undefined;
        const hasManualOverride = round.manualScoreOverrides?.[roundSkipperIndex] !== undefined;

        if (hasAverageApplied || hasManualOverride) {
          console.log('=== FOUND OVERRIDE FOR SKIPPER ===');
          console.log('Series Skipper Index:', skipperIndex);
          console.log('Round Skipper Index:', roundSkipperIndex);
          console.log('Round Index:', roundIndex);
          console.log('Has Average:', hasAverageApplied, round.averagePointsApplied?.[roundSkipperIndex]);
          console.log('Has Manual:', hasManualOverride, round.manualScoreOverrides?.[roundSkipperIndex]);
        }

        // Calculate results for this round
        const { totals } = calculateRoundResults(roundIndex);

        // Debug: Log net scores for this round
        console.log(`[Round ${roundIndex + 1}] Net scores:`, Object.entries(totals).map(([idx, scores]) => ({
          skipperIndex: parseInt(idx),
          gross: scores.gross,
          net: scores.net
        })));

        // Calculate position in this round with countback tiebreaking
        const sortedSkippers = Object.entries(totals)
          .map(([idx, scores]) => ({
            skipperIndex: parseInt(idx),
            net: scores.net
          }))
          .sort((a, b) => {
            // First compare by net score
            if (a.net !== b.net) {
              return a.net - b.net;
            }

            // If tied, apply countback - count 1sts, 2nds, 3rds, etc.
            const aPositions: number[] = [];
            const bPositions: number[] = [];

            // Get all positions for skipper a in this round
            round.results?.forEach(result => {
              if (result.skipperIndex === a.skipperIndex && result.position !== null && !result.letterScore) {
                aPositions.push(result.position);
              }
            });

            // Get all positions for skipper b in this round
            round.results?.forEach(result => {
              if (result.skipperIndex === b.skipperIndex && result.position !== null && !result.letterScore) {
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
          })
          .map(s => s.skipperIndex);

        // For average applied or manual override, use that value for both position and points
        let position: number;
        let netPoints: number;

        if (hasAverageApplied) {
          position = round.averagePointsApplied![roundSkipperIndex];
          netPoints = round.averagePointsApplied![roundSkipperIndex];
          console.log(`[Round ${roundIndex + 1}] Series Skipper ${skipperIndex} (Round Skipper ${roundSkipperIndex}): Using averagePointsApplied - position=${position}, net=${netPoints}`);
        } else if (hasManualOverride) {
          position = round.manualScoreOverrides![roundSkipperIndex];
          netPoints = round.manualScoreOverrides![roundSkipperIndex];
          console.log(`[Round ${roundIndex + 1}] Series Skipper ${skipperIndex} (Round Skipper ${roundSkipperIndex}): Using manualOverride - position=${position}, net=${netPoints}`);
        } else {
          position = sortedSkippers.indexOf(roundSkipperIndex) + 1;
          netPoints = totals[roundSkipperIndex]?.net || 0;
          console.log(`[Round ${roundIndex + 1}] Series Skipper ${skipperIndex} (Round Skipper ${roundSkipperIndex}): Calculated - position=${position}, net=${netPoints}, sortedSkippers=${JSON.stringify(sortedSkippers)}`);
        }

        if (position > 0) {
          skipperPoints[skipperIndex].roundPositions[roundIndex] = position;
          skipperPoints[skipperIndex].roundPoints[roundIndex] = netPoints;
          skipperPoints[skipperIndex].total += netPoints;

          // Track position counts for tiebreaking
          if (!skipperPoints[skipperIndex].positionCounts[position]) {
            skipperPoints[skipperIndex].positionCounts[position] = 0;
          }
          skipperPoints[skipperIndex].positionCounts[position]++;
        } else {
          // Skipper has results but no valid position (shouldn't happen)
          // Count unique skippers who competed in THIS round
          const roundCompetitors = new Set(round.results?.map(r => r.skipperIndex) || []).size;
          skipperPoints[skipperIndex].roundPositions[roundIndex] = null;
          skipperPoints[skipperIndex].roundPoints[roundIndex] = roundCompetitors + 1;
          skipperPoints[skipperIndex].total += roundCompetitors + 1;
        }
      });
    });
    
    // Apply drops if applicable
    const completedRounds = series.rounds.filter(r => r.completed).length;
    let numDrops = 0;
    // Fix: Empty array is truthy, so check length explicitly
    const dropRules = (series.dropRules && series.dropRules.length > 0)
      ? series.dropRules
      : [4, 8, 16, 24, 32, 40]; // Default to HMS rules

    // Count drops based on number of completed rounds
    for (const threshold of dropRules) {
      if (completedRounds >= threshold) {
        numDrops++;
      }
    }
    
    if (numDrops > 0) {
      // Apply drops to each skipper
      Object.keys(skipperPoints).forEach(skipperIndexStr => {
        const skipperIndex = parseInt(skipperIndexStr);
        const points = skipperPoints[skipperIndex].roundPoints
          .filter(p => p !== null)
          .sort((a, b) => (b || 0) - (a || 0));
        
        // Take the worst numDrops results and subtract them from the total
        const dropsTotal = points.slice(0, numDrops).reduce((sum, p) => sum + (p || 0), 0);
        skipperPoints[skipperIndex].total -= dropsTotal;
      });
    }
    
    // Sort skippers by total points
    const sortedSkippers = series.skippers.map((skipper, index) => ({
      ...skipper,
      index,
      roundPositions: skipperPoints[index].roundPositions,
      roundPoints: skipperPoints[index].roundPoints,
      total: skipperPoints[index].total,
      positionCounts: skipperPoints[index].positionCounts
    })).sort((a, b) => {
      // First sort by total points
      if (a.total !== b.total) {
        return a.total - b.total;
      }
      
      // If tied, use count of 1st places
      const aFirsts = a.positionCounts[1] || 0;
      const bFirsts = b.positionCounts[1] || 0;
      if (aFirsts !== bFirsts) {
        return bFirsts - aFirsts;
      }
      
      // If still tied, use count of 2nd places
      const aSeconds = a.positionCounts[2] || 0;
      const bSeconds = b.positionCounts[2] || 0;
      if (aSeconds !== bSeconds) {
        return bSeconds - aSeconds;
      }
      
      // If still tied, use count of 3rd places
      const aThirds = a.positionCounts[3] || 0;
      const bThirds = b.positionCounts[3] || 0;
      if (aThirds !== bThirds) {
        return bThirds - aThirds;
      }
      
      // If still tied, use the result of the last race they both competed in
      const aLastRace = a.roundPositions.slice().reverse().find(p => p !== null);
      const bLastRace = b.roundPositions.slice().reverse().find(p => p !== null);
      
      if (aLastRace !== undefined && bLastRace !== undefined) {
        return (aLastRace || 0) - (bLastRace || 0);
      }
      
      return 0;
    });
    
    return sortedSkippers;
  };

  // Get club abbreviation for a skipper
  const getClubAbbreviation = (skipper: any) => {
    if (!skipper.club) return '';
    
    // If club is already an abbreviation (less than 6 chars), return it
    if (skipper.club.length <= 6) return skipper.club;
    
    // Otherwise, try to create an abbreviation from the club name
    // Example: "Lake Macquarie Radio Yacht Club" -> "LMRYC"
    return skipper.club
      .split(' ')
      .map((word: string) => word.charAt(0).toUpperCase())
      .join('');
  };
  
  // Get hull design for a skipper
  const getHullDesign = (skipper: any) => {
    return skipper.hull || '';
  };

  // Get scoring system name based on drop rules
  const getScoringSystemName = () => {
    // For series, we check if rounds have individual drop rules, otherwise use a default
    // Series typically use the same drop rules across all rounds
    // Fix: Empty array is truthy, so check length explicitly
    const firstRoundRules = series.rounds[0]?.dropRules;
    const dropRules = (firstRoundRules && firstRoundRules.length > 0)
      ? firstRoundRules
      : [4, 8, 16, 24, 32, 40];
    const rulesString = JSON.stringify(dropRules);

    if (rulesString === '[]') {
      return 'No Discards';
    } else if (rulesString === '[4,8,16,24,32,40]') {
      return 'RRS - Appendix A Scoring System';
    } else if (rulesString === '[4,8,12,16,20,24,28,32,36,40]') {
      return 'Low Point System';
    } else {
      return `Custom - ${dropRules.join(', ')}`;
    }
  };
  
  // Get the current round
  const currentRound = series.rounds[activeRound];
  
  // Get race numbers for the current round
  const resultsByRace = groupResultsByRace(activeRound);
  const raceNumbers = Object.keys(resultsByRace).map(Number).sort((a, b) => a - b);
  const maxRace = raceNumbers.length > 0 ? Math.max(...raceNumbers) : 0;
  
  // Get position for a specific race and skipper
  const getPositionForRace = (race: number, skipperIndex: number) => {
    const raceResults = resultsByRace[race] || [];
    const result = raceResults.find(r => r.skipperIndex === skipperIndex);
    return result ? { position: result.position, letterScore: result.letterScore } : { position: null };
  };
  
  // Countback comparison function for tied net scores in a round
  const compareRoundSkippersWithCountback = (a: any, b: any): number => {
    // First compare by net score (lower is better)
    if (a.netTotal !== b.netTotal) {
      return a.netTotal - b.netTotal;
    }

    // If net scores are tied, apply countback rules (excluding dropped races)
    // Count the number of 1st places, 2nd places, 3rd places, etc.
    const aPositionCounts: number[] = [];
    const bPositionCounts: number[] = [];
    let lastRaceAPosition: number | null = null;
    let lastRaceBPosition: number | null = null;

    const roundResults = series.rounds[activeRound]?.results || [];

    for (const raceNum of raceNumbers) {
      const raceResultsForRace = resultsByRace[raceNum] || [];
      const aResult = raceResultsForRace.find(r => r.skipperIndex === a.index);
      const bResult = raceResultsForRace.find(r => r.skipperIndex === b.index);

      const aIsDropped = roundDrops[`${a.index}-${raceNum}`];
      const bIsDropped = roundDrops[`${b.index}-${raceNum}`];

      // Only count actual finishing positions (not letter scores) for countback, excluding dropped races
      if (aResult && aResult.position !== null && !aResult.letterScore && !aIsDropped) {
        aPositionCounts.push(aResult.position);
      }

      if (bResult && bResult.position !== null && !bResult.letterScore && !bIsDropped) {
        bPositionCounts.push(bResult.position);
      }

      // Track last race positions (including dropped, for final tiebreaker)
      if (aResult && aResult.position !== null && !aResult.letterScore) {
        lastRaceAPosition = aResult.position;
      }
      if (bResult && bResult.position !== null && !bResult.letterScore) {
        lastRaceBPosition = bResult.position;
      }
    }

    // Sort positions (best to worst)
    aPositionCounts.sort((x, y) => x - y);
    bPositionCounts.sort((x, y) => x - y);

    // Count how many 1sts, 2nds, 3rds, etc. each skipper has
    const maxPosition = Math.max(...aPositionCounts, ...bPositionCounts, 1);

    for (let pos = 1; pos <= maxPosition; pos++) {
      const aCount = aPositionCounts.filter(p => p === pos).length;
      const bCount = bPositionCounts.filter(p => p === pos).length;

      if (aCount !== bCount) {
        // More of this position is better (so reverse the comparison)
        return bCount - aCount;
      }
    }

    // If still tied after countback, use last race position as tiebreaker
    if (lastRaceAPosition !== null && lastRaceBPosition !== null && lastRaceAPosition !== lastRaceBPosition) {
      return lastRaceAPosition - lastRaceBPosition;
    }

    // If still tied after last race tiebreaker, maintain original order
    return a.index - b.index;
  };

  const containerClass = isExportMode ? 'series-export-container' : '';
  const tableClass = isExportMode ? 'export-table' : '';

  // Check if series has no rounds with results
  const hasAnyResults = series.rounds.some(r =>
    (r.raceResults && r.raceResults.length > 0) ||
    (r.results && r.results.length > 0) ||
    (r.lastCompletedRace && r.lastCompletedRace > 0)
  );

  // If series has no series-level skippers, try to get unique skippers from COMPLETED rounds only
  let effectiveSkippers = series.skippers || [];
  if ((!effectiveSkippers || effectiveSkippers.length === 0) && hasAnyResults) {
    // Collect all unique skippers from COMPLETED rounds only (not in-progress rounds)
    const skipperMap = new Map();
    series.rounds.forEach(round => {
      // Only include skippers from completed rounds
      if (round.completed && ((round.raceResults && round.raceResults.length > 0) || (round.results && round.results.length > 0))) {
        (round.skippers || []).forEach((skipper: any, index: number) => {
          // Use index as key to get the first N skippers (where N = number of unique skipperIndex values)
          // This handles the case where the skippers array has duplicates
          const sailNum = skipper.sailNumber || skipper.sailNo;
          if (sailNum && !skipperMap.has(sailNum)) {
            skipperMap.set(sailNum, skipper);
          }
        });
      }
    });
    effectiveSkippers = Array.from(skipperMap.values());
  }

  if ((!effectiveSkippers || effectiveSkippers.length === 0) || !hasAnyResults) {
    return (
      <div className={`${isExportMode ? 'bg-white' : 'bg-slate-800/50'} rounded-lg border ${isExportMode ? 'border-slate-200' : 'border-slate-700/50'} p-12`}>
        <div className="flex items-center justify-center">
          <div className="text-center max-w-md">
            <div className="relative mb-8">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className={`w-24 h-24 ${isExportMode ? 'bg-blue-500/5' : 'bg-blue-500/10'} rounded-full animate-pulse`}></div>
              </div>
              <div className="relative">
                <Trophy size={48} className={`mx-auto ${isExportMode ? 'text-slate-400' : 'text-blue-400/80'}`} strokeWidth={1.5} />
              </div>
            </div>

            <h3 className={`text-xl font-bold mb-3 ${isExportMode ? 'text-slate-900' : 'text-white'}`}>
              No Results Available
            </h3>
            <p className={`leading-relaxed ${isExportMode ? 'text-slate-600' : 'text-slate-400'}`}>
              Results will appear here once rounds have been completed and scores have been entered.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Use effective skippers for the series display
  const displaySeries = {
    ...series,
    skippers: effectiveSkippers
  };

  // Calculate results using displaySeries (which has effective skippers)
  // Note: The calculation functions use 'series' from closure, so we create wrapper functions
  const calculateRoundResultsWithDisplaySeries = (roundIndex: number) => {
    const tempSeries = series;
    const modifiedProps = { series: displaySeries };
    // Temporarily replace series in the calculation
    return calculateRoundResults.call({ ...modifiedProps, series: displaySeries }, roundIndex);
  };

  const calculateSeriesResultsWithDisplaySeries = () => {
    // Create a local function that uses displaySeries
    if (!displaySeries.skippers || displaySeries.skippers.length === 0) {
      return [];
    }

    // Initialize skipper points tracking
    const skipperPoints: any[] = displaySeries.skippers.map((skipper, index) => ({
      ...skipper,
      index,
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
        console.log('🔴🔴🔴 ROUND 4 DATA 🔴🔴🔴');
        console.log('Round skippers:', roundSkippers.map((s: any, i: number) => `${i}: Sail ${s.sailNumber || s.sailNo}`));
        console.log('Number of skippers:', numRoundSkippers);
      }

      // Calculate totals for each skipper in this round
      const skipperTotals = displaySeries.skippers.map((skipper, skipperIndex) => {
        const sailNum = skipper.sailNumber || skipper.sailNo;

        // Check if this skipper competed in this round by matching sail number
        const roundSkipper = roundSkippers.find((rs: any) =>
          (rs.sailNumber || rs.sailNo) === sailNum
        );

        // If skipper didn't compete in this round, assign DNS points (number of competitors + 1)
        if (!roundSkipper) {
          return {
            skipperIndex,
            totalPoints: numRoundSkippers + 1,
            netPoints: numRoundSkippers + 1,
            sailNumber: sailNum,
            didNotCompete: true
          };
        }

        // Find the skipper's index in the round's skippers array
        const roundSkipperIndex = roundSkippers.findIndex((rs: any) =>
          (rs.sailNumber || rs.sailNo) === sailNum
        );

        // Calculate this skipper's gross and net points for the round
        const skipperRoundResults = roundResults.filter((r: any) => r.skipperIndex === roundSkipperIndex);

        // Calculate gross points (sum of all race scores) and track DNE scores separately
        const raceScores: Array<{score: number, isDNE: boolean, isLetterScore: boolean}> = [];
        skipperRoundResults.forEach((result: any) => {
          if (result.position && !result.letterScore) {
            raceScores.push({score: result.position, isDNE: false, isLetterScore: false});
          } else if (result.letterScore) {
            // For RDG and DPI with custom points, use the custom points
            if ((result.letterScore === 'RDG' || result.letterScore === 'DPI') && result.customPoints !== undefined && result.customPoints !== null) {
              raceScores.push({
                score: result.customPoints,
                isDNE: false,
                isLetterScore: true
              });
            } else {
              const raceFinishers = roundResults.filter((r: any) =>
                r.race === result.race && r.position && !r.letterScore
              ).length;
              raceScores.push({
                score: getLetterScoreValue(result.letterScore as LetterScore, raceFinishers, numRoundSkippers),
                isDNE: result.letterScore === 'DNE',
                isLetterScore: true
              });
            }
          }
        });

        const grossPoints = raceScores.reduce((sum, item) => sum + item.score, 0);

        // Calculate net points (gross minus worst scores based on drop rules)
        const numRaces = skipperRoundResults.length;
        let numDrops = 0;
        // Fix: Empty array is truthy, so check length explicitly
        const roundDropRules = (round.dropRules && round.dropRules.length > 0) ? round.dropRules : [4, 8, 12];

        for (const threshold of roundDropRules) {
          if (numRaces >= threshold) {
            numDrops++;
          }
        }

        // Apply drops - DNE scores cannot be dropped
        let netPoints = grossPoints;
        if (numDrops > 0 && raceScores.length > 0) {
          // Separate DNE scores (not droppable) from droppable scores
          const dneScores = raceScores.filter(s => s.isDNE);
          const letterScores = raceScores.filter(s => s.isLetterScore && !s.isDNE);
          const regularScores = raceScores.filter(s => !s.isLetterScore);

          // Letter scores (except DNE) and regular scores are droppable
          const droppableScores = [...letterScores, ...regularScores];

          // Sort droppable scores by worst (highest) first and drop the worst N
          const sortedDroppableScores = [...droppableScores].sort((a, b) => b.score - a.score);
          const scoresToDrop = sortedDroppableScores.slice(0, Math.min(numDrops, droppableScores.length));
          const dropsTotal = scoresToDrop.reduce((sum, item) => sum + item.score, 0);
          netPoints = grossPoints - dropsTotal;
        }

        return {
          skipperIndex,
          totalPoints: grossPoints,
          netPoints: netPoints,
          sailNumber: sailNum,
          didNotCompete: false
        };
      });

      // Check for average points or manual overrides for this round
      if (roundIndex === 2 && round.averagePointsApplied) {
        console.log('=== ROUND 3 OVERRIDE CHECK (calculateSeriesResultsWithDisplaySeries) ===');
        console.log('averagePointsApplied:', round.averagePointsApplied);
        console.log('manualScoreOverrides:', round.manualScoreOverrides);
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
        roundResults.forEach((result: any) => {
          const aRoundSkipperIndex = roundSkippers.findIndex((rs: any) =>
            (rs.sailNumber || rs.sailNo) === a.sailNumber
          );
          const bRoundSkipperIndex = roundSkippers.findIndex((rs: any) =>
            (rs.sailNumber || rs.sailNo) === b.sailNumber
          );

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
          console.log(`🔴 Rd4 Position ${roundPosition}: Series Skipper ${item.skipperIndex} (Sail ${item.sailNumber}, Net: ${item.netPoints})`);
        }

        // Debug for round 3
        if (roundIndex === 2) {
          console.log(`🔍 Skipper ${item.skipperIndex} (Sail ${item.sailNumber}):`, {
            hasAverageApplied: round.averagePointsApplied?.[item.skipperIndex] !== undefined,
            averageValue: round.averagePointsApplied?.[item.skipperIndex],
            hasManualOverride: round.manualScoreOverrides?.[item.skipperIndex] !== undefined,
            manualValue: round.manualScoreOverrides?.[item.skipperIndex]
          });
        }

        // Check if this skipper has average points or manual override applied
        const hasAverageApplied = round.averagePointsApplied?.[item.skipperIndex] !== undefined;
        const hasManualOverride = round.manualScoreOverrides?.[item.skipperIndex] !== undefined;

        if (hasAverageApplied) {
          roundPoints = round.averagePointsApplied![item.skipperIndex];
          console.log(`🎯 APPLYING AVERAGE for skipper ${item.skipperIndex}: ${roundPoints} instead of ${roundPosition}`);
        } else if (hasManualOverride) {
          roundPoints = round.manualScoreOverrides![item.skipperIndex];
          console.log(`🎯 APPLYING MANUAL OVERRIDE for skipper ${item.skipperIndex}: ${roundPoints} instead of ${roundPosition}`);
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

        // Check if this non-competing skipper has average points or manual override applied
        const hasAverageApplied = round.averagePointsApplied?.[item.skipperIndex] !== undefined;
        const hasManualOverride = round.manualScoreOverrides?.[item.skipperIndex] !== undefined;

        if (hasAverageApplied) {
          dncPoints = round.averagePointsApplied![item.skipperIndex];
          console.log(`🎯 APPLYING AVERAGE (DNC) for skipper ${item.skipperIndex}: ${dncPoints} instead of ${item.totalPoints}`);
        } else if (hasManualOverride) {
          dncPoints = round.manualScoreOverrides![item.skipperIndex];
          console.log(`🎯 APPLYING MANUAL OVERRIDE (DNC) for skipper ${item.skipperIndex}: ${dncPoints} instead of ${item.totalPoints}`);
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
  };

  const { totals: roundTotals, drops: roundDrops } = calculateRoundResults(activeRound);
  const seriesResults = calculateSeriesResultsWithDisplaySeries();

  // Sort skippers by net total for the current round with countback
  const sortedSkippersForRound = displaySeries.skippers ? [...displaySeries.skippers].map((skipper, index) => ({
    ...skipper,
    index,
    netTotal: roundTotals[index]?.net || 0
  })).sort(compareRoundSkippersWithCountback) : [];

  return (
    <div className={`${isExportMode ? 'bg-white text-black' : 'bg-slate-800'} p-4 sm:p-6 rounded-lg ${containerClass}`}>
      {isExportMode ? (
        <>
          <div className="event-title">
            {series.seriesName}
          </div>
          <div className="event-subtitle">
            {series.raceClass} - {series.raceFormat === 'handicap' ? 'Handicap' : 'Scratch'}
          </div>
        </>
      ) : (
        <div className="mb-4 sm:mb-6">
          <h2 className={`text-xl sm:text-2xl font-bold ${isExportMode ? 'text-black' : 'text-white'}`}>
            {series.seriesName}
          </h2>
          <div className="flex flex-wrap gap-2 mt-2">
            <div className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-900/30 text-blue-400">
              {series.raceClass}
            </div>
            <div className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-900/30 text-purple-400">
              {series.raceFormat === 'handicap' ? 'Handicap' : 'Scratch'}
            </div>
          </div>
        </div>
      )}

      {/* Series Standings */}
      <div className="overflow-x-auto -mx-4 sm:mx-0">
        <table className={`w-full text-left ${tableClass}`}>
          <thead>
            <tr>
              <th className={isExportMode ? '' : 'px-2 sm:px-4 py-3 sm:py-4 text-xs sm:text-sm font-medium text-slate-300'}>Pos</th>
              <th className={isExportMode ? '' : 'px-2 sm:px-4 py-3 sm:py-4 text-xs sm:text-sm font-medium text-slate-300'}>Sail</th>
              <th className={isExportMode ? '' : 'px-2 sm:px-4 py-3 sm:py-4 text-xs sm:text-sm font-medium text-slate-300'}>Skipper</th>
              <th className={isExportMode ? '' : 'px-2 sm:px-4 py-3 sm:py-4 text-xs sm:text-sm font-medium text-slate-300'}>Club</th>
              <th className={isExportMode ? '' : 'px-2 sm:px-4 py-3 sm:py-4 text-xs sm:text-sm font-medium text-slate-300'}>Design</th>
              {displaySeries.rounds.map((round, index) => (
                <th key={index} className={isExportMode ? '' : 'px-2 sm:px-4 py-3 sm:py-4 text-xs sm:text-sm font-medium text-center text-slate-300'}>
                  {isExportMode ? (
                    `Rd${index + 1}`
                  ) : (
                    <div className="flex items-center justify-center">
                      <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-semibold bg-slate-600 text-slate-300">
                        Rd{index + 1}
                      </div>
                    </div>
                  )}
                </th>
              ))}
              <th className={isExportMode ? '' : 'px-2 sm:px-4 py-3 sm:py-4 text-xs sm:text-sm font-medium text-center text-slate-300'}>Total</th>
            </tr>
          </thead>
          <tbody className={isExportMode ? '' : 'divide-y divide-slate-700'}>
            {seriesResults.map((skipper, position) => (
              <React.Fragment key={skipper.index}>
                <tr
                  onClick={() => toggleSkipperExpansion(skipper.index)}
                  className={`
                    ${isExportMode ? '' : position % 2 === 0 ? '' : 'bg-slate-700/50'}
                    ${isExportMode ? '' : 'hover:bg-slate-700/30 cursor-pointer transition-colors'}
                    ${!isExportMode && expandedSkipper === skipper.index ? 'bg-slate-700/50' : ''}
                  `}
                >
                <td className={isExportMode ? 'font-medium' : 'px-2 sm:px-4 py-3 sm:py-4 text-white font-medium text-sm sm:text-base'}>
                  {isExportMode ? (
                    position + 1
                  ) : (
                    <div className="flex items-center gap-1 sm:gap-2">
                      {expandedSkipper === skipper.index ?
                        <ChevronUp size={14} className="text-slate-400 sm:w-4 sm:h-4" /> :
                        <ChevronDown size={14} className="text-slate-400 sm:w-4 sm:h-4" />
                      }
                      <div>
                        {position + 1}
                        {position === 0 && <Trophy className="inline ml-0.5 sm:ml-1 text-yellow-400 position-icon" size={14} />}
                        {position === 1 && <Medal className="inline ml-0.5 sm:ml-1 text-gray-400 position-icon" size={14} />}
                        {position === 2 && <Medal className="inline ml-0.5 sm:ml-1 text-amber-700 position-icon" size={14} />}
                      </div>
                    </div>
                  )}
                </td>
                <td className={isExportMode ? '' : 'px-2 sm:px-4 py-3 sm:py-4 text-slate-300 text-sm sm:text-base'}>{skipper.sailNo}</td>
                <td className={isExportMode ? '' : 'px-2 sm:px-4 py-3 sm:py-4 text-white text-left text-sm sm:text-base'}>
                  {isExportMode ? (
                    skipper.name
                  ) : (
                    <div className="flex items-center gap-2 sm:gap-3">
                      {skipper.avatarUrl ? (
                        <img
                          src={skipper.avatarUrl}
                          alt={skipper.name}
                          className="w-8 h-8 sm:w-10 sm:h-10 rounded-full object-cover border-2 border-slate-600"
                        />
                      ) : (
                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-bold text-xs sm:text-sm bg-slate-700 text-slate-300">
                          {skipper.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()}
                        </div>
                      )}
                      <span className="truncate">{skipper.name}</span>
                    </div>
                  )}
                </td>
                <td className={isExportMode ? '' : 'px-2 sm:px-4 py-3 sm:py-4 text-slate-300 text-sm sm:text-base'}>{getClubAbbreviation(skipper)}</td>
                <td className={isExportMode ? '' : 'px-2 sm:px-4 py-3 sm:py-4 text-slate-300 text-sm sm:text-base'}>{getHullDesign(skipper)}</td>
                {displaySeries.rounds.map((round, index) => {
                  // Check if the round is completed
                  const isRoundCompleted = round.completed;
                  const roundPosition = skipper.roundPositions[index];

                  // Check if this round is dropped (using pre-calculated droppedRounds Set - same as HeatOverallResultsModal)
                  const isDropped = skipper.droppedRounds && skipper.droppedRounds.has(index);

                  return (
                    <td key={index} className={`${isExportMode ? '' : 'px-2 sm:px-4 py-3 sm:py-4 text-center text-slate-300 text-sm sm:text-base'} ${isDropped && isExportMode ? 'dropped-score' : ''}`}>
                      {!isRoundCompleted ? (
                        '-'
                      ) : isExportMode ? (
                        roundPosition !== null ? roundPosition : skipper.roundPoints[index] || '-'
                      ) : roundPosition !== null ? (
                        <span className={`
                          ${roundPosition === 1 ? 'text-yellow-400' :
                            roundPosition === 2 ? 'text-gray-400' :
                            roundPosition === 3 ? 'text-amber-600' :
                            'text-slate-300'}
                          font-medium
                          ${isDropped ? 'opacity-60' : ''}
                        `}>
                          {isDropped ? (
                            <span className="line-through text-red-400">{roundPosition}</span>
                          ) : (
                            roundPosition
                          )}
                        </span>
                      ) : (
                        <span className={`text-slate-300 ${isDropped ? 'opacity-60' : ''}`}>
                          {isDropped ? (
                            <span className="line-through text-red-400">{skipper.roundPoints[index] || '-'}</span>
                          ) : (
                            skipper.roundPoints[index] || '-'
                          )}
                        </span>
                      )}
                    </td>
                  );
                })}
                <td className={isExportMode ? 'net-total font-medium' : 'px-2 sm:px-4 py-3 sm:py-4 text-center font-medium text-blue-400 text-sm sm:text-base'}>
                  {Number(skipper.total.toFixed(1))}
                </td>
              </tr>
              {!isExportMode && expandedSkipper === skipper.index && (
                <tr>
                  <td colSpan={series.rounds.length + 6}>
                    <SeriesSkipperPerformanceInsights
                      skipper={skipper}
                      skipperIndex={skipper.index}
                      series={displaySeries}
                      darkMode={darkMode}
                      allSkippers={displaySeries.skippers || []}
                      onClose={() => setExpandedSkipper(null)}
                    />
                  </td>
                </tr>
              )}
            </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Scoring System Display - Hidden in export mode */}
      {!isExportMode && (
        <div className="mt-4 px-4 flex justify-end">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700/50 text-slate-300">
            <Award size={16} />
            <span className="text-sm font-medium">Scoring System:</span>
            <span className="text-sm">{getScoringSystemName()}</span>
          </div>
        </div>
      )}

      {isExportMode && (
        <div className="footer">
          Results generated by Alfie PRO - RC Yacht Management Software
        </div>
      )}
    </div>
  );
};

export default SeriesResultsDisplay;