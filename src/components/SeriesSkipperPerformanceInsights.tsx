import React, { useState, useMemo } from 'react';
import { X, ChevronDown, Trophy } from 'lucide-react';
import { Skipper } from '../types';
import { RaceSeries } from '../types/race';
import { SkipperPerformanceInsights } from './SkipperPerformanceInsights';
import { calculateLetterScorePoints, calculateStarterCount, LetterScore } from '../types/letterScores';

interface SeriesSkipperPerformanceInsightsProps {
  skipper: Skipper;
  skipperIndex: number;
  series: RaceSeries;
  darkMode?: boolean;
  allSkippers: Skipper[];
  onClose: () => void;
}

export const SeriesSkipperPerformanceInsights: React.FC<SeriesSkipperPerformanceInsightsProps> = ({
  skipper,
  skipperIndex,
  series,
  darkMode = true,
  allSkippers,
  onClose
}) => {
  // Find the latest completed round
  const latestCompletedRoundIndex = useMemo(() => {
    for (let i = series.rounds.length - 1; i >= 0; i--) {
      const round = series.rounds[i];
      const hasResults = (round.results && round.results.length > 0) || (round.raceResults && round.raceResults.length > 0);
      if (round.completed && hasResults) {
        return i;
      }
    }
    return 0;
  }, [series.rounds]);

  const [selectedRoundIndex, setSelectedRoundIndex] = useState(latestCompletedRoundIndex);
  const [showRoundDropdown, setShowRoundDropdown] = useState(false);

  const selectedRound = series.rounds[selectedRoundIndex];
  const roundResults = selectedRound?.results || selectedRound?.raceResults || [];

  // Group results by race number for the selected round
  const groupResultsByRace = (roundResults: any[]) => {
    const resultsByRace: Record<number, any[]> = {};

    if (roundResults.length === 0) return resultsByRace;

    // Check if results have race property
    const hasRaceProperty = roundResults.some(r => r.race !== undefined);

    if (hasRaceProperty) {
      roundResults.forEach(result => {
        const raceNum = result.race;
        if (!resultsByRace[raceNum]) {
          resultsByRace[raceNum] = [];
        }
        resultsByRace[raceNum].push(result);
      });
    } else {
      // Infer race numbers
      const skipperCount = allSkippers.length;
      let currentRace = 1;
      let skippersSeen = 0;

      roundResults.forEach((result) => {
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

  const resultsByRace = groupResultsByRace(roundResults);
  const raceNumbers = Object.keys(resultsByRace).map(Number).sort((a, b) => a - b);

  // Create a race results array for the SkipperPerformanceInsights component
  const roundRaceResults = useMemo(() => {
    const results: any[] = [];

    raceNumbers.forEach(raceNum => {
      const raceResults = resultsByRace[raceNum] || [];
      raceResults.forEach(result => {
        // Just pass through the result with the race number
        // The skipperIndex will be remapped later when we know the final skipper list
        results.push({
          ...result,
          race: raceNum
        });
      });
    });

    return results;
  }, [selectedRoundIndex, roundResults]);

  const completedRounds = series.rounds.filter(r => {
    const hasResults = (r.results && r.results.length > 0) || (r.raceResults && r.raceResults.length > 0);
    return r.completed && hasResults;
  });

  // Check if skipper competed in the selected round
  const skipperCompetedInSelectedRound = useMemo(() => {
    if (selectedRoundIndex === -1) return true; // Complete Series view

    const roundSkippers = selectedRound?.skippers || allSkippers;
    const sailNum = skipper.sailNo;
    const roundSkipperIndex = roundSkippers.findIndex((rs: any) =>
      (rs.sailNumber || rs.sailNo) === sailNum
    );

    return roundSkipperIndex !== -1;
  }, [selectedRoundIndex, selectedRound, skipper, allSkippers]);

  // For Complete Series, sort skippers by overall series standings
  const sortedSkippersBySeriesStanding = useMemo(() => {
    if (selectedRoundIndex !== -1) return allSkippers;

    // Sort by total points (lower is better in sailing)
    return [...allSkippers].sort((a: any, b: any) => {
      const totalA = a.total || 999999;
      const totalB = b.total || 999999;
      return totalA - totalB;
    });
  }, [selectedRoundIndex, allSkippers]);

  // Calculate the correct skipperIndex based on sorted array for Complete Series
  const adjustedSkipperIndex = useMemo(() => {
    if (selectedRoundIndex !== -1) return skipperIndex;

    // Find the index of this skipper in the sorted array
    const sailNum = skipper.sailNo;
    return sortedSkippersBySeriesStanding.findIndex((s: any) =>
      (s.sailNumber || s.sailNo) === sailNum
    );
  }, [selectedRoundIndex, skipperIndex, skipper, sortedSkippersBySeriesStanding]);

  // Remap race results to use indices that match sortedSkippersBySeriesStanding
  const remapRaceResultsIndices = (results: any[], skipperList: any[], roundSkippers?: any[]) => {
    return results.map(result => {
      // Strategy 1: Use the result's skipperIndex to look up the skipper in the round's skipper list
      // Then match that skipper to the series skipper list
      if (roundSkippers && result.skipperIndex >= 0 && result.skipperIndex < roundSkippers.length) {
        const roundSkipper = roundSkippers[result.skipperIndex];
        const sailNum = String(roundSkipper.sailNumber || roundSkipper.sailNo || '').trim();

        if (sailNum) {
          const newIndex = skipperList.findIndex((s: any) => {
            const skipperSailNum = String(s.sailNumber || s.sailNo || '').trim();
            return skipperSailNum === sailNum;
          });

          if (newIndex >= 0) {
            return {
              ...result,
              skipperIndex: newIndex
            };
          }
        }
      }

      // Strategy 2: Try to match using data in the result itself
      const resultSailNum = String(result.sailNumber || result.sailNo || '').trim();
      const resultSkipperName = result.name || result.skipperName || '';

      const newIndex = skipperList.findIndex((s: any) => {
        const skipperSailNum = String(s.sailNumber || s.sailNo || '').trim();
        const skipperName = s.name || s.skipperName || '';

        // Match by sail number (primary)
        if (skipperSailNum && resultSailNum && skipperSailNum === resultSailNum) {
          return true;
        }

        // Fallback: match by name if sail number doesn't work
        if (skipperName && resultSkipperName && skipperName === resultSkipperName) {
          return true;
        }

        return false;
      });

      return {
        ...result,
        skipperIndex: newIndex >= 0 ? newIndex : -1
      };
    });
  };

  const remappedRoundResults = useMemo(() =>
    remapRaceResultsIndices(roundRaceResults, sortedSkippersBySeriesStanding, selectedRound?.skippers),
    [roundRaceResults, sortedSkippersBySeriesStanding, selectedRound]
  );

  const remappedCompleteResults = useMemo(() => {
    // For complete series, we need to remap each round's results with that round's skippers
    const results: any[] = [];
    let raceCounter = 1;

    completedRounds.forEach((round) => {
      const roundResults = round.results || round.raceResults || [];
      const roundResultsByRace = groupResultsByRace(roundResults);
      const roundRaceNumbers = Object.keys(roundResultsByRace).map(Number).sort((a, b) => a - b);

      roundRaceNumbers.forEach(raceNum => {
        const raceResults = roundResultsByRace[raceNum] || [];
        const remappedRaceResults = remapRaceResultsIndices(
          raceResults.map(r => ({ ...r, race: raceCounter })),
          sortedSkippersBySeriesStanding,
          round.skippers
        );
        results.push(...remappedRaceResults);
        raceCounter++;
      });
    });

    return results;
  }, [completedRounds, sortedSkippersBySeriesStanding]);

  return (
    <div
      className={`
        overflow-hidden transition-all duration-500 ease-in-out
        ${darkMode ? 'bg-slate-800/30' : 'bg-slate-50'}
      `}
      style={{
        animation: 'slideDown 0.5s ease-out'
      }}
    >
      <style>
        {`
          @keyframes slideDown {
            from {
              max-height: 0;
              opacity: 0;
            }
            to {
              max-height: 2000px;
              opacity: 1;
            }
          }
        `}
      </style>

      <div className="p-4 sm:p-6 border-t border-slate-700/50">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
          <div className="flex items-center gap-3">
            {skipper.avatarUrl ? (
              <img
                src={skipper.avatarUrl}
                alt={skipper.name}
                className="w-16 h-16 rounded-full object-cover border-3 border-blue-500"
              />
            ) : (
              <div className="w-16 h-16 rounded-full flex items-center justify-center font-bold text-lg bg-blue-600 text-white">
                {skipper.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-white">{skipper.name}</h3>
              <p className="text-xs sm:text-sm text-slate-400">Series Performance Analysis</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-700/50 transition-colors self-end sm:self-auto"
          >
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        {/* Round Selector and Race Results - Side by side on desktop */}
        <div className="mb-6 flex flex-col lg:flex-row lg:gap-6">
          {/* Round Selector */}
          <div className="mb-4 lg:mb-0 relative z-[120]">
            <label className="text-sm font-medium text-slate-300 mb-2 block">Select Round</label>
            <div className="relative">
              <button
                onClick={() => setShowRoundDropdown(!showRoundDropdown)}
                className="w-full sm:w-64 flex items-center justify-between px-4 py-2.5 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors"
              >
                <span>
                  {selectedRoundIndex === -1
                    ? 'Complete Series'
                    : selectedRound?.name || `Round ${selectedRoundIndex + 1}`}
                </span>
                <ChevronDown size={18} />
              </button>

              {showRoundDropdown && (
                <>
                  <div
                    className="fixed inset-0 z-[150]"
                    onClick={() => setShowRoundDropdown(false)}
                  />
                  <div className="fixed sm:absolute left-4 right-4 sm:left-0 sm:right-auto top-auto sm:top-full mt-2 sm:w-64 bg-slate-800 rounded-lg shadow-2xl border border-slate-700 py-2 z-[200] max-h-64 overflow-y-auto">
                    {/* Complete Series option */}
                    <button
                      onClick={() => {
                        setSelectedRoundIndex(-1);
                        setShowRoundDropdown(false);
                      }}
                      className={`
                        w-full text-left px-4 py-3 transition-colors border-b border-slate-700
                        ${selectedRoundIndex === -1
                          ? 'bg-blue-600/20 text-blue-400 font-semibold'
                          : 'text-slate-300 hover:bg-slate-700'
                        }
                      `}
                    >
                      Complete Series
                    </button>

                    {/* Individual rounds */}
                    {completedRounds.map((round, index) => {
                      const originalIndex = series.rounds.indexOf(round);
                      const isSelected = selectedRoundIndex === originalIndex;
                      return (
                        <button
                          key={originalIndex}
                          onClick={() => {
                            setSelectedRoundIndex(originalIndex);
                            setShowRoundDropdown(false);
                          }}
                          className={`
                            w-full text-left px-4 py-2.5 transition-colors
                            ${isSelected
                              ? 'bg-blue-600/20 text-blue-400'
                              : 'text-slate-300 hover:bg-slate-700'
                            }
                          `}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{round.name}</span>
                            {isSelected && (
                              <span className="text-blue-400 text-xs">●</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Round Race Results with Position, Gross, and Net - Only show for individual rounds */}
          {selectedRoundIndex !== -1 && raceNumbers.length > 0 ? (() => {
            const roundSkippers = selectedRound?.skippers || allSkippers;
            const numSkippers = roundSkippers.length;

            // Find this skipper's index in the round's skippers
            const sailNum = skipper.sailNo;
            const roundSkipperIndex = roundSkippers.findIndex((rs: any) =>
              (rs.sailNumber || rs.sailNo) === sailNum
            );

            // Check if skipper competed in this round
            const didNotCompete = roundSkipperIndex === -1;

            // If skipper didn't compete, show "Did Not Compete" message
            if (didNotCompete) {
              return (
                <div className="flex-1">
                  <label className="text-sm font-medium text-slate-300 mb-2 block">
                    {selectedRound?.name || `Round ${selectedRoundIndex + 1}`} - Race Results
                  </label>
                  <div className="bg-slate-800 rounded-lg border border-slate-700 p-8 text-center">
                    <p className="text-slate-400 text-lg">Did Not Compete</p>
                    <p className="text-slate-500 text-sm mt-2">
                      This skipper did not participate in this round
                    </p>
                  </div>
                </div>
              );
            }

            // Calculate all scores for this skipper
            const skipperScores = raceNumbers.map(num => {
              const res = resultsByRace[num]?.find(r => r.skipperIndex === roundSkipperIndex);
              if (!res) return 999;
              if (res.letterScore) {
                const raceFinishers = resultsByRace[num]?.filter((r: any) =>
                  r.position && !r.letterScore
                ).length || 0;
                return calculateLetterScorePoints(res.letterScore as LetterScore, raceFinishers);
              }
              return res.position || 999;
            });

            const numRaces = raceNumbers.length;
            let numDrops = 0;
            const roundDropRules = selectedRound?.dropRules;
            const seriesDropRules = series.dropRules;
            const dropRules = (roundDropRules && roundDropRules.length > 0)
              ? roundDropRules
              : (seriesDropRules && seriesDropRules.length > 0)
                ? seriesDropRules
                : [4, 8, 16, 24, 32, 40];

            // Count drops based on number of races completed
            for (const threshold of dropRules) {
              if (numRaces >= threshold) {
                numDrops++;
              }
            }

            // Find drop races - identify the worst N scores by race index
            const scoreWithIndex = skipperScores.map((score, idx) => ({ score, idx }));
            // Filter out 999 (non-races) and sort by score descending (worst first)
            const validScores = scoreWithIndex.filter(s => s.score !== 999);
            const sortedByScore = [...validScores].sort((a, b) => {
              // Sort by score descending (worst first)
              if (b.score !== a.score) return b.score - a.score;
              // If scores are equal, sort by race index to ensure consistent ordering
              return a.idx - b.idx;
            });
            // Take the worst N races as drops (by race index, not score value)
            const dropIndices = new Set(sortedByScore.slice(0, numDrops).map(s => s.idx));

            // Calculate gross and net
            const grossPoints = skipperScores.reduce((sum, score) => sum + (score === 999 ? 0 : score), 0);
            let netPoints = 0;
            skipperScores.forEach((score, idx) => {
              if (score !== 999 && !dropIndices.has(idx)) {
                netPoints += score;
              }
            });

            // Calculate position in this round based on NET points with countback
            const allSkipperNetTotals = roundSkippers.map((_: any, idx: number) => {
              const scores = raceNumbers.map(num => {
                const res = resultsByRace[num]?.find((r: any) => r.skipperIndex === idx);
                if (!res) return 999;
                if (res.letterScore) {
                  const raceFinishers = resultsByRace[num]?.filter((r: any) =>
                    r.position && !r.letterScore
                  ).length || 0;
                  return calculateLetterScorePoints(res.letterScore as LetterScore, raceFinishers);
                }
                return res.position || 999;
              });

              // Calculate drops for this skipper
              const scoreWithIndex = scores.map((score, scoreIdx) => ({ score, idx: scoreIdx }));
              const validScores = scoreWithIndex.filter(s => s.score !== 999);
              const sortedByScore = [...validScores].sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                return a.idx - b.idx;
              });
              const skipperDropIndices = new Set(sortedByScore.slice(0, numDrops).map(s => s.idx));

              // Calculate net points
              let net = 0;
              scores.forEach((score, scoreIdx) => {
                if (score !== 999 && !skipperDropIndices.has(scoreIdx)) {
                  net += score;
                }
              });

              return { skipperIdx: idx, net, scores };
            });

            // Sort by net score with countback tiebreaking
            const sortedByNet = [...allSkipperNetTotals].sort((a, b) => {
              // First compare by net score
              if (a.net !== b.net) return a.net - b.net;

              // If tied, apply countback - count 1sts, 2nds, 3rds, etc.
              const aPositions: number[] = [];
              const bPositions: number[] = [];

              raceNumbers.forEach(num => {
                const aRes = resultsByRace[num]?.find((r: any) => r.skipperIndex === a.skipperIdx);
                const bRes = resultsByRace[num]?.find((r: any) => r.skipperIndex === b.skipperIdx);

                if (aRes && aRes.position !== null && !aRes.letterScore) {
                  aPositions.push(aRes.position);
                }
                if (bRes && bRes.position !== null && !bRes.letterScore) {
                  bPositions.push(bRes.position);
                }
              });

              aPositions.sort((x, y) => x - y);
              bPositions.sort((x, y) => x - y);

              const maxPosition = Math.max(...aPositions, ...bPositions, 1);

              for (let pos = 1; pos <= maxPosition; pos++) {
                const aCount = aPositions.filter(p => p === pos).length;
                const bCount = bPositions.filter(p => p === pos).length;

                if (aCount !== bCount) {
                  return bCount - aCount; // More of a better position wins
                }
              }

              return a.skipperIdx - b.skipperIdx;
            });

            const roundPosition = sortedByNet.findIndex(s => s.skipperIdx === roundSkipperIndex) + 1;

            return (
              <div className="flex-1">
                <label className="text-xs sm:text-sm font-medium text-slate-300 mb-2 block">
                  <span className="hidden sm:inline">{selectedRound?.name || `Round ${selectedRoundIndex + 1}`} - Race Results</span>
                  <span className="sm:hidden">Race Results</span>
                  {roundPosition <= 3 ? (
                    <span className="inline-flex items-center gap-1 ml-2">
                      <Trophy
                        size={18}
                        className={`${
                          roundPosition === 1 ? 'text-yellow-400 fill-yellow-400' :
                          roundPosition === 2 ? 'text-slate-300 fill-slate-300' :
                          'text-amber-600 fill-amber-600'
                        }`}
                      />
                      <span className={`${
                        roundPosition === 1 ? 'text-yellow-400' :
                        roundPosition === 2 ? 'text-slate-300' :
                        'text-amber-600'
                      }`}>
                        {roundPosition === 1 ? '1st' : roundPosition === 2 ? '2nd' : '3rd'}
                      </span>
                    </span>
                  ) : (
                    <span className="text-slate-400 ml-2">(Position: {roundPosition})</span>
                  )}
                </label>
                <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
                  <div className="inline-flex items-center gap-1.5 sm:gap-2">
                    {raceNumbers.map((raceNum) => {
                      const raceResults = resultsByRace[raceNum] || [];
                      const skipperResult = raceResults.find(r => r.skipperIndex === roundSkipperIndex);

                      const raceIndex = raceNumbers.indexOf(raceNum);
                      const currentScore = skipperScores[raceIndex];
                      const isDropped = dropIndices.has(raceIndex);

                      let displayValue: string | number = '—';

                      if (skipperResult) {
                        if (skipperResult.letterScore) {
                          // Show the points value for letter scores, not the letter itself
                          displayValue = currentScore;
                        } else if (skipperResult.position !== null) {
                          displayValue = skipperResult.position;
                        }
                      }

                      return (
                        <div key={raceNum} className="flex flex-col items-center min-w-[40px] sm:min-w-[50px]">
                          <div className="text-[10px] sm:text-xs text-slate-400 mb-1">R{raceNum}</div>
                          <div className={`
                            px-2 sm:px-2.5 py-1.5 sm:py-2 rounded text-center font-medium min-w-[38px] sm:min-w-[45px] relative text-sm sm:text-base
                            ${isDropped
                              ? 'bg-red-900/20 text-red-400'
                              : 'bg-slate-700 text-slate-300'
                            }
                          `}>
                            <span className={isDropped ? 'line-through' : ''}>
                              {displayValue}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    {/* Gross Points */}
                    <div className="flex flex-col items-center min-w-[50px] sm:min-w-[60px] ml-2 sm:ml-4">
                      <div className="text-[10px] sm:text-xs text-slate-400 mb-1">Gross</div>
                      <div className="px-2 sm:px-2.5 py-1.5 sm:py-2 rounded text-center font-medium min-w-[48px] sm:min-w-[50px] bg-slate-600 text-slate-200 text-sm sm:text-base">
                        {grossPoints}
                      </div>
                    </div>
                    {/* Net Points */}
                    <div className="flex flex-col items-center min-w-[50px] sm:min-w-[60px]">
                      <div className="text-[10px] sm:text-xs text-slate-400 mb-1">Net</div>
                      <div className="px-2 sm:px-2.5 py-1.5 sm:py-2 rounded text-center font-bold min-w-[48px] sm:min-w-[50px] bg-blue-600 text-white text-sm sm:text-base">
                        {netPoints}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })() : selectedRoundIndex !== -1 ? (
            <div className="flex-1">
              <label className="text-sm font-medium text-slate-300 mb-2 block">
                {selectedRound?.name || `Round ${selectedRoundIndex + 1}`} - Race Results
              </label>
              <div className="bg-slate-800 rounded-lg border border-slate-700 p-8 text-center">
                <p className="text-slate-400 text-lg">No Race Results Available</p>
                <p className="text-slate-500 text-sm mt-2">
                  This round has not been scored yet
                </p>
              </div>
            </div>
          ) : null}
        </div>

        {/* Series Performance Stats - Only show if skipper competed in selected round */}
        {skipperCompetedInSelectedRound && (
          <div className="border-t border-slate-700/50 pt-6">
            <h4 className="text-lg font-semibold text-white mb-4">
              {selectedRoundIndex === -1 ? 'Complete Series Performance' : 'Series Performance'}
            </h4>
            <SkipperPerformanceInsights
              skipper={skipper}
              skipperIndex={adjustedSkipperIndex}
              event={{
                ...series,
                id: series.id,
                clubName: series.clubName,
                date: '',
                venue: '',
                raceClass: series.raceClass,
                raceFormat: series.raceFormat,
                skippers: sortedSkippersBySeriesStanding,
                raceResults: selectedRoundIndex === -1 ? remappedCompleteResults : remappedRoundResults
              }}
              darkMode={darkMode}
              allSkippers={sortedSkippersBySeriesStanding}
              raceResults={selectedRoundIndex === -1 ? remappedCompleteResults : remappedRoundResults}
              onClose={() => {}}
              hideHeader={true}
              useSkipperOrderForComparison={selectedRoundIndex === -1}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default SeriesSkipperPerformanceInsights;
