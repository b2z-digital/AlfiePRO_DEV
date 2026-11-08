/**
 * The desktop results table's scoring, as a plain function: race grouping, which races count,
 * letter scores, custom points, drops, countback, SHRS ties and finals fleets. Moved out of
 * EventResultsDisplay unchanged so the phone app shows exactly the same standings.
 */
import { RaceEvent } from '../types/race';
import { LetterScore } from '../types';
import { HeatDesignation } from '../types/heat';
import { getLetterScorePointsForRace, compareWithCountback, resolveCustomPoints } from './scratchCalculations';
import { calculateSHRSDiscards } from './shrsHeatSystem';

/* eslint-disable @typescript-eslint/no-unused-vars */
export function computeEventResults(event: RaceEvent, enrichedEvent: RaceEvent = event) {
  const getLetterScoreValue = (
    letterScore: LetterScore | undefined,
    numFinishers: number,
    totalCompetitors: number
  ): number => {
    if (!letterScore) return 0;

    // RRS Appendix A scoring: all letter scores = number of starters + 1
    // This ensures consistency across all scoring displays
    return totalCompetitors + 1;
  };

  // Group results by race number
  const groupResultsByRace = () => {
    const resultsByRace: Record<number, any[]> = {};
    
    if (!event.raceResults || !event.skippers) return resultsByRace;
    
    // Determine race numbers from results
    // If race property is missing, infer it from the pattern of results
    const skipperCount = event.skippers.length;
    if (skipperCount === 0) return resultsByRace;
    
    // If race property exists, use it directly
    const hasRaceProperty = event.raceResults.some(r => r.race !== undefined);
    
    if (hasRaceProperty) {
      // Group by existing race property
      event.raceResults.forEach(result => {
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
      
      event.raceResults.forEach((result, index) => {
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

  // Calculate totals for each skipper
  const calculateTotals = () => {
    const { skippers, raceResults } = event;
    if (!skippers || skippers.length === 0 || !raceResults || raceResults.length === 0) {
      return { totals: {}, drops: {} };
    }

    const totals: Record<number, { gross: number; net: number }> = {};
    const drops: Record<string, boolean> = {};
    const resolvedScores: Record<string, number> = {};

    // Group results by skipper
    const skipperGroups: Record<number, any[]> = {};

    // Determine race numbers from results
    const resultsByRace = groupResultsByRace();
    const allRaceNumbers = Object.keys(resultsByRace).map(Number).sort((a, b) => a - b);

    // Get list of active (non-withdrawn) skippers
    const activeSkippers = skippers.filter(s => !s.withdrawnFromRace || typeof s.withdrawnFromRace !== 'number');
    const activeSkipperCount = activeSkippers.length;

    // Filter to only include COMPLETED races (where all active skippers have results)
    // This prevents phantom races like R13 from being included in scoring
    const eventLastCompleted = enrichedEvent?.lastCompletedRace || 0;
    const eventIsCompleted = enrichedEvent?.completed || false;

    const raceNumbers = allRaceNumbers.filter(raceNum => {
      const raceResultsForRace = resultsByRace[raceNum] || [];

      // If event is marked completed or this race is within lastCompletedRace,
      // include it as long as it has at least 2 results with positions
      if (eventIsCompleted || raceNum <= eventLastCompleted) {
        const resultsWithPositions = raceResultsForRace.filter(r => r.position !== null && r.position !== undefined).length;
        if (resultsWithPositions >= 2) {
          return true;
        }
      }

      // Count how many active skippers have results for this race
      const activeSkipperResultsCount = raceResultsForRace.filter(result => {
        const skipper = skippers[result.skipperIndex];
        if (!skipper) return false;

        // Skipper is active for this race if they didn't withdraw, or withdrew after this race
        const isActive = !skipper.withdrawnFromRace ||
                        typeof skipper.withdrawnFromRace !== 'number' ||
                        raceNum < skipper.withdrawnFromRace;
        return isActive;
      }).length;

      // Include race if ALL active skippers have results (strict check)
      if (activeSkipperResultsCount >= activeSkipperCount) {
        return true;
      }

      // Also include race if it has at least 2 results with positions assigned
      // This handles handicap races where not all registered skippers participated
      const resultsWithPositions = raceResultsForRace.filter(r => r.position !== null && r.position !== undefined).length;
      if (resultsWithPositions >= 2 && activeSkipperResultsCount >= Math.ceil(activeSkipperCount * 0.5)) {
        return true;
      }

      return false;
    });
    
    // Prepare results with race numbers if missing
    const processedResults = raceResults.map((result, index) => {
      if (result.race !== undefined) return result;
      
      // Calculate race number based on index and skipper count
      const raceNum = Math.floor(index / skippers.length) + 1;
      return { ...result, race: raceNum };
    });
    
    // Group by skipper
    processedResults.forEach(result => {
      if (!skipperGroups[result.skipperIndex]) {
        skipperGroups[result.skipperIndex] = [];
      }
      skipperGroups[result.skipperIndex].push(result);
    });

    // Add withdrawn scores for skippers who withdrew
    // Only add withdrawn scores for races where at least one active skipper has results
    skippers.forEach((skipper, skipperIndex) => {
      if (skipper.withdrawnFromRace && typeof skipper.withdrawnFromRace === 'number') {
        if (!skipperGroups[skipperIndex]) {
          skipperGroups[skipperIndex] = [];
        }

        // Find all races this skipper should have results for
        const skipperResults = skipperGroups[skipperIndex];
        const racesWithResults = new Set(skipperResults.map(r => r.race));

        // Add withdrawn results for races >= withdrawnFromRace
        // BUT only if at least one active (non-withdrawn) skipper has results for that race
        raceNumbers.forEach(raceNum => {
          if (raceNum >= skipper.withdrawnFromRace && !racesWithResults.has(raceNum)) {
            // Check if any active skipper has results for this race
            const activeSkipperHasResults = processedResults.some(result => {
              const resultSkipper = skippers[result.skipperIndex];
              if (!resultSkipper) return false;

              // Check if this is an active skipper for this race
              const isActive = !resultSkipper.withdrawnFromRace ||
                              typeof resultSkipper.withdrawnFromRace !== 'number' ||
                              raceNum < resultSkipper.withdrawnFromRace;

              return result.race === raceNum && isActive;
            });

            // Only add withdrawn score if an active skipper has sailed this race
            if (activeSkipperHasResults) {
              skipperGroups[skipperIndex].push({
                skipperIndex,
                race: raceNum,
                position: null,
                letterScore: null,
                isWithdrawn: true
              });
            }
          }
        });
      }
    });

    // For completed races, ensure ALL active skippers have an entry (inject DNC for missing ones)
    // This handles the case where not all skippers participated but the race was marked complete
    raceNumbers.forEach(raceNum => {
      skippers.forEach((skipper, skipperIndex) => {
        // Skip withdrawn skippers for races after withdrawal
        if (skipper.withdrawnFromRace && typeof skipper.withdrawnFromRace === 'number' && raceNum >= skipper.withdrawnFromRace) {
          return;
        }

        if (!skipperGroups[skipperIndex]) {
          skipperGroups[skipperIndex] = [];
        }

        const hasResult = skipperGroups[skipperIndex].some(r => r.race === raceNum);
        if (!hasResult) {
          // Inject DNC (Did Not Compete) result
          skipperGroups[skipperIndex].push({
            skipperIndex,
            race: raceNum,
            position: null,
            letterScore: null,
            isDNC: true
          });
        }
      });
    });

    // Calculate drops and totals
    Object.entries(skipperGroups).forEach(([skipperIndex, results]) => {
      const idx = parseInt(skipperIndex);

      // Calculate scores for each race - but ONLY for completed races
      // Filter out any races that aren't in the raceNumbers list (e.g., incomplete races like R13)
      const scores = results
        .filter(r => raceNumbers.includes(r.race)) // Only include completed races
        .map(r => {
          if (r.position !== null && !r.letterScore) {
            const score = enrichedEvent.raceFormat === 'handicap' ? r.position : Math.round(r.position);
            return { race: r.race, score, isDNE: false, isLetterScore: false };
          }

          if (r.letterScore) {
            // Special case for RDGfix
            if (r.letterScore === 'RDGfix' && r.position !== null) {
              const score = enrichedEvent.raceFormat === 'handicap' ? r.position : Math.round(r.position);
              return { race: r.race, score, isDNE: false, isLetterScore: true };
            }

            // For RDG, DPI, ROD with custom points, use the canonical resolveCustomPoints
            if ((r.letterScore === 'RDG' || r.letterScore === 'DPI' || r.letterScore === 'ROD') && r.customPoints !== undefined && r.customPoints !== null) {
              const activeDropRules = Array.isArray(event.dropRules) ? event.dropRules : [4, 8, 16, 24, 32, 40];
              let score = resolveCustomPoints(r, r.skipperIndex, processedResults, enrichedEvent.skippers?.length || 0, activeDropRules);
              if (enrichedEvent.raceFormat !== 'handicap') score = Math.round(score * 100) / 100;
              return {
                race: r.race,
                score,
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
              score: enrichedEvent.raceFormat === 'handicap' ? getLetterScoreValue(r.letterScore as LetterScore, raceFinishers, skippers.length) : Math.round(getLetterScoreValue(r.letterScore as LetterScore, raceFinishers, skippers.length)),
              isDNE: r.letterScore === 'DNE',
              isLetterScore: true
            };
          }

          return { race: r.race, score: skippers.length + 1, isDNE: false, isLetterScore: false }; // Default for missing results
        });

      scores.forEach(s => {
        resolvedScores[`${idx}-${s.race}`] = s.score;
      });
      console.log(`Skipper ${idx} (${skippers[idx]?.name}): ${scores.length} races, scores:`, scores.map(s => `R${s.race}=${s.score}`));

      // Calculate gross score
      const gross = scores.reduce((sum, r) => sum + r.score, 0);

      // Determine number of drops based on event's drop rules
      let numDrops = 0;
      const rawDropRules = event.dropRules || [4, 8, 16, 24, 32, 40];
      const dropRules = Array.isArray(rawDropRules) ? rawDropRules : [4, 8, 16, 24, 32, 40];

      for (const threshold of dropRules) {
        if (scores.length >= threshold) {
          numDrops++;
        } else {
          break;
        }
      }

      console.log(`Skipper ${idx} (${skippers[idx]?.name}): numDrops=${numDrops} based on ${scores.length} races and dropRules=${dropRules.join(',')}, raw=${JSON.stringify(event.dropRules)}`);

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

      console.log(`Skipper ${idx} (${skippers[idx]?.name}): Dropping races:`, sortedDroppableScores.slice(0, numDrops).map(r => `R${r.race}=${r.score}`));

      let net = gross;
      scores.forEach(r => {
        if (drops[`${idx}-${r.race}`]) {
          net -= r.score;
        }
      });

      totals[idx] = { gross, net };
    });
    
    return { totals, drops, resolvedScores };
  };

  const { totals, drops, resolvedScores } = calculateTotals();

  const hasRODScoring = (event.raceResults || []).some((r: any) => r.letterScore === 'ROD');

  // Get scoring system name based on drop rules
  const getScoringSystemName = () => {
    const dropRules = event.dropRules || [4, 8, 16, 24, 32, 40];

    // Check if heat management has a scoring system specified
    if (event.heatManagement?.configuration?.scoringSystem) {
      const heatScoringSystem = event.heatManagement.configuration.scoringSystem;
      if (heatScoringSystem === 'hms') {
        return 'HMS Heat System';
      } else if (heatScoringSystem === 'shrs') {
        const mode = event.heatManagement.configuration.shrsAssignmentMode;
        return `SHRS-${mode === 'preset' ? 'B' : 'P'} - Simple Heat Race System`;
      }
    }

    // Handle heat racing scoring systems (strings)
    if (typeof dropRules === 'string') {
      if (dropRules === 'hms') {
        return 'HMS Heat System';
      } else if (dropRules === 'shrs') {
        const mode = event?.heatManagement?.configuration?.shrsAssignmentMode;
        return `SHRS-${mode === 'preset' ? 'B' : 'P'} - Simple Heat Race System`;
      }
    }

    // Handle array-based scoring systems
    const rulesString = JSON.stringify(dropRules);

    if (rulesString === '[]') {
      return 'No Discards';
    } else if (rulesString === '[4,8,16,24,32,40]') {
      return 'RRS - Appendix A Scoring System';
    } else if (rulesString === '[4,8,12,16,20,24,28,32,36,40]') {
      return 'Low Point System';
    } else if (Array.isArray(dropRules)) {
      return `Custom - ${dropRules.join(', ')}`;
    } else {
      return 'RRS - Appendix A Scoring System';
    }
  };

  // SHRS same-heat tie-breaking (Rule 5.6)
  const isShrsEvent = event.heatManagement?.configuration?.scoringSystem === 'shrs';
  const shrsQualRounds = event.heatManagement?.configuration?.shrsQualifyingRounds || 0;

  // Build heat assignment map for SHRS events (which skipper was in which heat per round)
  const shrsRoundHeatMap = (() => {
    if (!isShrsEvent || !event.heatManagement?.rounds) return new Map<number, Map<number, string>>();
    const map = new Map<number, Map<number, string>>();
    for (const round of event.heatManagement.rounds) {
      if (!round.completed) continue;
      const skipperToHeat = new Map<number, string>();
      for (const ha of round.heatAssignments) {
        for (const si of ha.skipperIndices) {
          skipperToHeat.set(si, ha.heatDesignation);
        }
      }
      map.set(round.round, skipperToHeat);
    }
    return map;
  })();

  // Countback comparison function for tied net scores
  const compareSkippersWithCountback = (a: any, b: any): number => {
    if (a.netTotal !== b.netTotal) {
      return a.netTotal - b.netTotal;
    }

    const resultsByRaceMap = groupResultsByRace();
    const raceNums = Object.keys(resultsByRaceMap).map(Number).sort((x, y) => x - y);

    // SHRS Rule 5.6: Use same-heat scores for tie-breaking
    if (isShrsEvent && shrsRoundHeatMap.size > 0) {
      const aSameHeatScores: number[] = [];
      const bSameHeatScores: number[] = [];

      for (const raceNum of raceNums) {
        const skipperToHeat = shrsRoundHeatMap.get(raceNum);
        if (!skipperToHeat) continue;
        const aHeat = skipperToHeat.get(a.index);
        const bHeat = skipperToHeat.get(b.index);
        if (aHeat && bHeat && aHeat === bHeat) {
          const raceResults = resultsByRaceMap[raceNum] || [];
          const aResult = raceResults.find((r: any) => r.skipperIndex === a.index);
          const bResult = raceResults.find((r: any) => r.skipperIndex === b.index);
          const aScore = aResult?.position ?? (event.skippers?.length || 0) + 1;
          const bScore = bResult?.position ?? (event.skippers?.length || 0) + 1;
          aSameHeatScores.push(aScore);
          bSameHeatScores.push(bScore);
        }
      }

      if (aSameHeatScores.length > 0) {
        // SHRS 5.6(a): Countback with 0 discards on same-heat scores
        const result = compareWithCountback(aSameHeatScores, bSameHeatScores, 0, 0);
        if (result !== 0) return result;
      } else {
        // SHRS 5.6(b): Never sailed together -> use unmodified RRS A8.1/A8.2
        const aAll: number[] = [];
        const bAll: number[] = [];
        for (const raceNum of raceNums) {
          const raceResults = resultsByRaceMap[raceNum] || [];
          const aResult = raceResults.find((r: any) => r.skipperIndex === a.index);
          const bResult = raceResults.find((r: any) => r.skipperIndex === b.index);
          aAll.push(aResult?.position ?? (event.skippers?.length || 0) + 1);
          bAll.push(bResult?.position ?? (event.skippers?.length || 0) + 1);
        }
        const aDropCount = Object.keys(drops).filter(k => k.startsWith(`${a.index}-`)).length;
        const bDropCount = Object.keys(drops).filter(k => k.startsWith(`${b.index}-`)).length;
        const result = compareWithCountback(aAll, bAll, aDropCount, bDropCount);
        if (result !== 0) return result;
      }

      // Final fallback for SHRS: surname, first name, sail number
      const extractSurname = (name: string): { surname: string; firstName: string } => {
        const parts = (name || '').trim().split(/\s+/);
        if (parts.length <= 1) return { surname: parts[0] || '', firstName: '' };
        return { surname: parts[parts.length - 1], firstName: parts.slice(0, -1).join(' ') };
      };
      const aNameParts = extractSurname(event.skippers?.[a.index]?.name || '');
      const bNameParts = extractSurname(event.skippers?.[b.index]?.name || '');
      const surnameResult = aNameParts.surname.localeCompare(bNameParts.surname, undefined, { sensitivity: 'base' });
      if (surnameResult !== 0) return surnameResult;
      const firstNameResult = aNameParts.firstName.localeCompare(bNameParts.firstName, undefined, { sensitivity: 'base' });
      if (firstNameResult !== 0) return firstNameResult;
      const aSail = (event.skippers?.[a.index]?.sailNo || event.skippers?.[a.index]?.sailNumber || '').toUpperCase();
      const bSail = (event.skippers?.[b.index]?.sailNo || event.skippers?.[b.index]?.sailNumber || '').toUpperCase();
      return aSail.localeCompare(bSail, undefined, { numeric: true, sensitivity: 'base' });
    }

    // Standard (non-SHRS) countback: RRS A8.1/A8.2
    const aPositionCounts: number[] = [];
    const bPositionCounts: number[] = [];
    let lastRaceAPosition: number | null = null;
    let lastRaceBPosition: number | null = null;

    for (const raceNum of raceNums) {
      const raceResults = resultsByRaceMap[raceNum] || [];
      const aResult = raceResults.find((r: any) => r.skipperIndex === a.index);
      const bResult = raceResults.find((r: any) => r.skipperIndex === b.index);

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
      if (aCount !== bCount) return bCount - aCount;
    }

    if (lastRaceAPosition !== null && lastRaceBPosition !== null && lastRaceAPosition !== lastRaceBPosition) {
      return lastRaceAPosition - lastRaceBPosition;
    }

    return a.index - b.index;
  };

  // Sort skippers by net total with countback for ties
  const sortedSkippers = enrichedEvent.skippers ? [...enrichedEvent.skippers].map((skipper, index) => ({
    ...skipper,
    index,
    netTotal: totals[index]?.net || 0
  })).sort(compareSkippersWithCountback) : [];

  // SHRS 5.7(ii)(3): Resolve non-transitive multi-way ties by best individual same-heat score
  // For SHRS events, pairwise same-heat countback can be circular (A beats B, B beats C, C beats A).
  // In that case, resolve by best individual same-heat score across all pairwise matchups.
  const resolveShrsMultiWayTiesForResults = (sorted: any[]): any[] => {
    if (!isShrsEvent || shrsRoundHeatMap.size === 0 || sorted.length === 0) return sorted;

    const resultsByRaceMap = groupResultsByRace();
    const raceNums = Array.from(shrsRoundHeatMap.keys()).sort((x, y) => x - y);

    // Pairwise same-heat countback result (without name/sail fallback) - returns 0 if tied on scores
    const sameHeatCountbackOnly = (a: any, b: any): number => {
      const aSameHeatScores: number[] = [];
      const bSameHeatScores: number[] = [];
      for (const raceNum of raceNums) {
        const skipperToHeat = shrsRoundHeatMap.get(raceNum);
        if (!skipperToHeat) continue;
        const aHeat = skipperToHeat.get(a.index);
        const bHeat = skipperToHeat.get(b.index);
        if (aHeat && bHeat && aHeat === bHeat) {
          const raceResults = resultsByRaceMap[raceNum] || [];
          const aResult = raceResults.find((r: any) => r.skipperIndex === a.index);
          const bResult = raceResults.find((r: any) => r.skipperIndex === b.index);
          aSameHeatScores.push(aResult?.position ?? 999);
          bSameHeatScores.push(bResult?.position ?? 999);
        }
      }
      if (aSameHeatScores.length > 0) {
        return compareWithCountback(aSameHeatScores, bSameHeatScores, 0, 0);
      }
      return 0;
    };

    const result: any[] = [];
    let i = 0;
    while (i < sorted.length) {
      let j = i + 1;
      while (j < sorted.length && sorted[j].netTotal === sorted[i].netTotal) j++;
      const group = sorted.slice(i, j);
      if (group.length <= 2) {
        result.push(...group);
      } else {
        // Check transitivity: does pairwise countback produce a consistent winner?
        let bestIdx = 0;
        for (let k = 1; k < group.length; k++) {
          if (sameHeatCountbackOnly(group[k], group[bestIdx]) < 0) bestIdx = k;
        }
        let isTransitive = true;
        for (let k = 0; k < group.length; k++) {
          if (k === bestIdx) continue;
          if (sameHeatCountbackOnly(group[bestIdx], group[k]) > 0) { isTransitive = false; break; }
        }

        if (!isTransitive) {
          // Non-transitive (circular): resolve by best individual same-heat score
          const bestSameHeatScore = (s: any): number => {
            let best = 999;
            for (const raceNum of raceNums) {
              const skipperToHeat = shrsRoundHeatMap.get(raceNum);
              if (!skipperToHeat) continue;
              const sHeat = skipperToHeat.get(s.index);
              if (!sHeat) continue;
              const inSameHeat = group.some((other: any) =>
                other !== s && skipperToHeat.get(other.index) === sHeat
              );
              if (inSameHeat) {
                const rr = resultsByRaceMap[raceNum] || [];
                const sResult = rr.find((r: any) => r.skipperIndex === s.index);
                const score = sResult?.position ?? 999;
                if (score < best) best = score;
              }
            }
            return best;
          };
          group.sort((a: any, b: any) => bestSameHeatScore(a) - bestSameHeatScore(b));
        } else {
          // Transitive: iteratively peel off best using same-heat countback
          const remaining = [...group];
          const resolved: any[] = [];
          while (remaining.length > 1) {
            let bIdx = 0;
            for (let k = 1; k < remaining.length; k++) {
              if (sameHeatCountbackOnly(remaining[k], remaining[bIdx]) < 0) bIdx = k;
            }
            resolved.push(remaining.splice(bIdx, 1)[0]);
          }
          resolved.push(remaining[0]);
          group.length = 0;
          group.push(...resolved);
        }
        result.push(...group);
      }
      i = j;
    }
    return result;
  };

  const sortedSkippersResolved = resolveShrsMultiWayTiesForResults(sortedSkippers);

  const isShrs = isShrsEvent;
  const shrsQualifyingRounds = shrsQualRounds;

  const shrsFleetMap = (() => {
    if (!isShrs || !event.heatManagement) return new Map<number, HeatDesignation>();
    const map = new Map<number, HeatDesignation>();
    const finalsRounds = event.heatManagement.rounds
      .filter(r => r.round > shrsQualifyingRounds && r.completed);
    if (finalsRounds.length === 0) return map;
    finalsRounds[0].heatAssignments.forEach(assignment => {
      assignment.skipperIndices.forEach(idx => {
        map.set(idx, assignment.heatDesignation);
      });
    });
    return map;
  })();

  const shrsHasFinals = isShrs && shrsFleetMap.size > 0;

  const shrsFleetSortedSkippers = shrsHasFinals
    ? [...sortedSkippersResolved].sort((a, b) => {
        const fleetA = shrsFleetMap.get(a.index) || 'Z';
        const fleetB = shrsFleetMap.get(b.index) || 'Z';
        if (fleetA !== fleetB) return fleetA.localeCompare(fleetB);
        return compareSkippersWithCountback(a, b);
      })
    : sortedSkippersResolved;

  const displaySkippers = shrsHasFinals ? shrsFleetSortedSkippers : sortedSkippersResolved;

  const SHRS_FLEET_NAMES: Record<string, string> = {
    'A': 'Gold Fleet', 'B': 'Silver Fleet', 'C': 'Bronze Fleet',
    'D': 'Copper Fleet', 'E': 'Emerald Fleet', 'F': 'Pewter Fleet',
  };
  const SHRS_FLEET_COLORS: Record<string, { border: string; text: string; bg: string; exportBorder: string; exportText: string; exportBg: string }> = {
    'A': { border: 'border-yellow-500', text: 'text-yellow-400', bg: 'bg-yellow-500/10', exportBorder: '#b8960c', exportText: '#ffffff', exportBg: '#c9a70c' },
    'B': { border: 'border-slate-400', text: 'text-slate-300', bg: 'bg-slate-400/10', exportBorder: '#8a8a8a', exportText: '#ffffff', exportBg: '#a8a8a8' },
    'C': { border: 'border-amber-600', text: 'text-amber-500', bg: 'bg-amber-700/10', exportBorder: '#8B5E2F', exportText: '#ffffff', exportBg: '#b87a3d' },
    'D': { border: 'border-orange-500', text: 'text-orange-400', bg: 'bg-orange-500/10', exportBorder: '#f97316', exportText: '#ffffff', exportBg: '#f97316' },
    'E': { border: 'border-pink-500', text: 'text-pink-400', bg: 'bg-pink-500/10', exportBorder: '#ec4899', exportText: '#ffffff', exportBg: '#ec4899' },
    'F': { border: 'border-cyan-500', text: 'text-cyan-400', bg: 'bg-cyan-500/10', exportBorder: '#06b6d4', exportText: '#ffffff', exportBg: '#06b6d4' },
  };

  const getShrsRaceLabel = (raceNum: number): string => {
    if (!isShrs) return `R${raceNum}`;
    if (raceNum <= shrsQualifyingRounds) return `Q${raceNum}`;
    return `F${raceNum - shrsQualifyingRounds}`;
  };

  const isShrsFinalsRace = (raceNum: number): boolean => {
    return isShrs && raceNum > shrsQualifyingRounds;
  };

  // Get the maximum race number
  const resultsByRace = groupResultsByRace();
  const allRaceNumbers = Object.keys(resultsByRace).map(Number).sort((a, b) => a - b);

  // Get list of active (non-withdrawn) skippers
  const activeSkippers = enrichedEvent.skippers?.filter(s => !s.withdrawnFromRace || typeof s.withdrawnFromRace !== 'number') || [];
  const activeSkipperCount = activeSkippers.length;

  console.log('Total skippers:', enrichedEvent.skippers?.length);
  console.log('Active skippers:', activeSkipperCount);
  console.log('Withdrawn skippers:', enrichedEvent.skippers?.filter(s => s.withdrawnFromRace && typeof s.withdrawnFromRace === 'number').map(s => ({ name: s.name, withdrawnFromRace: s.withdrawnFromRace })));

  // Show all races, but exclude races that have NO active skipper results or incomplete races
  const raceNumbers = allRaceNumbers.filter(raceNum => {
    const raceResults = resultsByRace[raceNum] || [];

    // Count how many active skippers have results for this race
    // Active skippers are those who haven't withdrawn, or haven't withdrawn yet at this race
    const activeSkipperResultsCount = raceResults.filter(result => {
      const skipper = enrichedEvent.skippers?.[result.skipperIndex];
      if (!skipper) return false;

      // Skipper is active for this race if they didn't withdraw, or withdrew after this race
      const isActive = !skipper.withdrawnFromRace ||
                      typeof skipper.withdrawnFromRace !== 'number' ||
                      raceNum < skipper.withdrawnFromRace;
      return isActive;
    }).length;

    console.log(`Race ${raceNum}: ${activeSkipperResultsCount} out of ${activeSkipperCount} active skippers have results`);

    // Show the race only if ALL active skippers have results
    // This prevents showing partially completed races like R13
    return activeSkipperResultsCount >= activeSkipperCount;
  });

  console.log('Races to display:', raceNumbers);
  return { totals, drops, resolvedScores, hasRODScoring, getScoringSystemName, shrsFleetMap, shrsHasFinals, displaySkippers, SHRS_FLEET_NAMES, SHRS_FLEET_COLORS, getShrsRaceLabel, isShrsFinalsRace, resultsByRace, raceNumbers, sortedSkippersResolved, calculateTotals, isShrsEvent };
}

export type EventResults = ReturnType<typeof computeEventResults>;
