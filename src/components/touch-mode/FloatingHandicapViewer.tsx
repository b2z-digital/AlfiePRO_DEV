import React, { useState, useEffect } from 'react';
import { X, Award, ChevronLeft } from 'lucide-react';
import { Skipper, RaceResult } from '../../types';
import { RaceEvent } from '../../types/race';
import { motion, AnimatePresence } from 'framer-motion';
import { getCountryFlag, getIOCCode } from '../../utils/countryFlags';

interface FloatingHandicapViewerProps {
  skippers: Skipper[];
  raceResults: RaceResult[];
  currentRace: number;
  darkMode: boolean;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  dropRules?: number[];
  isScratchEvent?: boolean;
  currentEvent?: RaceEvent | null;
}

interface SkipperHandicap {
  skipperIndex: number;
  skipperName: string;
  sailNumber: string;
  avatarUrl?: string;
  currentHandicap: number;
  change: number;
  previousHandicap: number;
}

interface SkipperRanking {
  skipperIndex: number;
  skipperName: string;
  sailNumber: string;
  avatarUrl?: string;
  totalPoints: number;
  netPoints: number;
  position: number;
}

type ViewMode = 'handicaps' | 'rankings';

export const FloatingHandicapViewer: React.FC<FloatingHandicapViewerProps> = ({
  skippers,
  raceResults,
  currentRace,
  darkMode,
  isOpen: externalIsOpen,
  onOpenChange,
  dropRules = [4, 8, 16, 24, 32, 40],
  isScratchEvent = false,
  currentEvent
}) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [handicaps, setHandicaps] = useState<SkipperHandicap[]>([]);
  const [rankings, setRankings] = useState<SkipperRanking[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>(isScratchEvent ? 'rankings' : 'handicaps');

  // Use external control if provided, otherwise use internal state
  const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;
  const setIsOpen = (open: boolean) => {
    if (onOpenChange) {
      onOpenChange(open);
    } else {
      setInternalIsOpen(open);
    }
  };

  useEffect(() => {
    const skipperHandicaps: SkipperHandicap[] = skippers.map((skipper, index) => {
      // Helper to check if a value is a valid number
      const isValidNumber = (val: any): boolean => {
        return val !== undefined && val !== null && !isNaN(parseFloat(val)) && isFinite(val);
      };

      // Helper to safely get a number value
      const safeNumber = (val: any, fallback: number = 0): number => {
        if (!isValidNumber(val)) return fallback;
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) ? fallback : num;
      };

      // Start with skipper's starting handicap, defaulting to 0 if invalid
      let currentHandicap = safeNumber(skipper.startHcap, 0);

      // Look backwards through completed races to find the most recent valid handicap
      for (let race = currentRace - 1; race >= 1; race--) {
        const result = raceResults.find(r => r.race === race && r.skipperIndex === index);
        if (result) {
          // Try adjusted handicap first (this is the handicap after the race adjustments)
          if (isValidNumber(result.adjustedHcap)) {
            currentHandicap = safeNumber(result.adjustedHcap, 0);
            break;
          }

          // Fall back to handicap before adjustment
          if (isValidNumber(result.handicap)) {
            currentHandicap = safeNumber(result.handicap, 0);
            break;
          }
        }
      }

      // Calculate change from previous race
      let change = 0;
      const previousResult = raceResults.find(r => r.race === currentRace - 1 && r.skipperIndex === index);
      if (previousResult) {
        const beforePreviousRace = safeNumber(previousResult.handicap, currentHandicap);
        const afterPreviousRace = safeNumber(previousResult.adjustedHcap, beforePreviousRace);
        change = afterPreviousRace - beforePreviousRace;

        // Ensure change is a valid number
        if (isNaN(change) || !isFinite(change)) {
          change = 0;
        }
      }

      return {
        skipperIndex: index,
        skipperName: skipper.name,
        sailNumber: skipper.sailNumber || skipper.sailNo,
        avatarUrl: skipper.avatarUrl,
        currentHandicap: currentHandicap,
        change: change,
        previousHandicap: currentHandicap - change
      };
    });

    // Sort by sail number
    skipperHandicaps.sort((a, b) => {
      const sailA = parseInt(a.sailNumber) || 0;
      const sailB = parseInt(b.sailNumber) || 0;
      return sailA - sailB;
    });

    setHandicaps(skipperHandicaps);
  }, [skippers, raceResults, currentRace]);

  // Calculate rankings (Total and Net scores with drops)
  useEffect(() => {
    // Helper: Get letter score value
    const getLetterScoreValue = (letterScore: string, numFinishers: number): number => {
      const totalCompetitors = skippers.length;
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

    // Calculate total and net points for each skipper with drops
    const skipperRankings: SkipperRanking[] = skippers.map((skipper, index) => {
      // Get all results for this skipper up to current race
      const skipperResults = raceResults
        .filter(r => r.skipperIndex === index && r.race <= currentRace);

      // Calculate scores for each race
      const scores = skipperResults.map(result => {
        let score: number;

        // Use custom points if available
        if (result.customPoints !== undefined && result.customPoints !== null) {
          score = result.customPoints;
        } else if (result.letterScore) {
          // Calculate number of finishers in this race
          const raceFinishers = raceResults
            .filter(r => r.race === result.race && r.position !== null && !r.letterScore)
            .length;

          if (result.letterScore === 'RDGfix' && result.position !== null) {
            score = result.position;
          } else {
            score = getLetterScoreValue(result.letterScore, raceFinishers);
          }
        } else {
          score = result.position || (skippers.length + 1);
        }

        return {
          race: result.race,
          score,
          isLetterScore: !!result.letterScore
        };
      });

      // Calculate gross total
      const totalPoints = scores.reduce((sum, s) => sum + s.score, 0);

      // Calculate drops
      let numDrops = 0;
      for (const threshold of dropRules) {
        if (scores.length >= threshold) {
          numDrops++;
        } else {
          break;
        }
      }

      // Apply drops
      let netPoints = totalPoints;
      if (numDrops > 0 && scores.length > 0) {
        // Prioritize dropping letter scores first (highest scores)
        const letterScores = scores
          .filter(s => s.isLetterScore)
          .sort((a, b) => b.score - a.score);

        const dropsRemaining = Math.max(0, numDrops - letterScores.length);
        const regularScores = scores
          .filter(s => !s.isLetterScore)
          .sort((a, b) => b.score - a.score);

        // Drop letter scores first
        const scoresToDrop = [
          ...letterScores.slice(0, numDrops),
          ...regularScores.slice(0, dropsRemaining)
        ];

        // Subtract dropped scores from net total
        scoresToDrop.forEach(s => {
          netPoints -= s.score;
        });
      }

      return {
        skipperIndex: index,
        skipperName: skipper.name,
        sailNumber: skipper.sailNumber || skipper.sailNo,
        avatarUrl: skipper.avatarUrl,
        totalPoints,
        netPoints,
        position: 0 // Will be calculated after sorting
      };
    });

    // Sort by net points (lower is better)
    skipperRankings.sort((a, b) => {
      if (a.netPoints !== b.netPoints) {
        return a.netPoints - b.netPoints;
      }
      // Tie-break by sail number
      return parseInt(a.sailNumber) - parseInt(b.sailNumber);
    });

    // Assign positions
    skipperRankings.forEach((ranking, index) => {
      ranking.position = index + 1;
    });

    setRankings(skipperRankings);
  }, [skippers, raceResults, currentRace, dropRules]);

  return (
    <>
      {/* Floating Button */}
      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-colors ${
          darkMode
            ? 'bg-gradient-to-br from-cyan-600 to-blue-700 text-white hover:from-cyan-500 hover:to-blue-600'
            : 'bg-gradient-to-br from-blue-600 to-cyan-600 text-white hover:from-blue-500 hover:to-cyan-500'
        }`}
      >
        {isOpen ? <X size={24} /> : <Award size={24} />}
      </motion.button>

      {/* Side Panel */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30"
            />

            {/* Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className={`fixed right-0 top-0 bottom-0 w-[480px] max-w-[95vw] shadow-2xl z-40 flex flex-col ${
                darkMode ? 'bg-slate-800 text-white' : 'bg-white text-slate-900'
              }`}
            >
              {/* Header */}
              <div className={`border-b ${
                darkMode ? 'bg-slate-900/50 border-slate-700' : 'bg-slate-50 border-slate-200'
              }`}>
                <div className="px-4 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setIsOpen(false)}
                      className={`p-2 rounded-lg transition-colors ${
                        darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100'
                      }`}
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <div>
                      <h3 className="font-bold text-lg">
                        {isScratchEvent
                          ? 'Current Rankings'
                          : viewMode === 'handicaps'
                            ? 'Current Handicaps'
                            : 'Current Rankings'}
                      </h3>
                      <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        As of Race {currentRace}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Tabs - Hide for scratch events */}
                {!isScratchEvent && (
                  <div className="flex px-4 pb-2 gap-2">
                    <button
                      onClick={() => setViewMode('handicaps')}
                      className={`flex-1 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                        viewMode === 'handicaps'
                          ? darkMode
                            ? 'bg-slate-700 text-white'
                            : 'bg-white text-slate-900 shadow-sm'
                          : darkMode
                            ? 'text-slate-400 hover:text-slate-300'
                            : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Handicaps
                    </button>
                    <button
                      onClick={() => setViewMode('rankings')}
                      className={`flex-1 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                        viewMode === 'rankings'
                          ? darkMode
                            ? 'bg-slate-700 text-white'
                            : 'bg-white text-slate-900 shadow-sm'
                          : darkMode
                            ? 'text-slate-400 hover:text-slate-300'
                            : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Rankings
                    </button>
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-4">
                {viewMode === 'handicaps' && !isScratchEvent ? (
                  /* Handicaps View */
                  <>
                    {/* Column Header */}
                    <div className={`flex items-center justify-between px-3 py-2 mb-3 rounded-lg ${
                      darkMode ? 'bg-slate-900/50' : 'bg-slate-100'
                    }`}>
                      <div className="flex-1">
                        <span className={`text-xs font-semibold uppercase tracking-wide ${
                          darkMode ? 'text-slate-400' : 'text-slate-600'
                        }`}>
                          Skipper
                        </span>
                      </div>
                      <div className="text-right">
                        <span className={`text-xs font-semibold uppercase tracking-wide ${
                          darkMode ? 'text-slate-400' : 'text-slate-600'
                        }`}>
                          Handicap
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {handicaps.map((handicap) => {
                        const initials = handicap.skipperName
                          .split(' ')
                          .map(n => n[0])
                          .join('')
                          .toUpperCase()
                          .slice(0, 2);

                        return (
                          <div
                            key={handicap.skipperIndex}
                            className={`rounded-lg p-3 border transition-all ${
                              darkMode
                                ? 'bg-slate-900/30 border-slate-700/50 hover:bg-slate-900/50'
                                : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              {/* Avatar */}
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-xs border-2 overflow-hidden flex-shrink-0 ${
                                darkMode ? 'bg-slate-700 text-slate-300 border-slate-600' : 'bg-slate-200 text-slate-600 border-slate-300'
                              }`}>
                                {handicap.avatarUrl ? (
                                  <img
                                    src={handicap.avatarUrl}
                                    alt={handicap.skipperName}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <span>{initials}</span>
                                )}
                              </div>

                              {/* Info */}
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-sm">
                                  {handicap.skipperName}
                                </div>
                                <div className={`text-xs flex items-center gap-1.5 flex-wrap ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                                  {/* Flag */}
                                  {currentEvent?.show_flag && skippers[handicap.skipperIndex]?.country_code && (
                                    <span className="text-base">
                                      {getCountryFlag(skippers[handicap.skipperIndex].country_code!)}
                                    </span>
                                  )}
                                  {/* Country Code */}
                                  {currentEvent?.show_country && skippers[handicap.skipperIndex]?.country_code && (
                                    <span className="font-medium">
                                      {getIOCCode(skippers[handicap.skipperIndex].country_code!)}
                                    </span>
                                  )}
                                  {/* Sail Number */}
                                  <span>Sail {handicap.sailNumber}</span>
                                </div>
                              </div>

                              {/* Handicap */}
                              <div className="text-right flex-shrink-0">
                                <div className="text-xl font-bold text-green-500">
                                  {handicap.currentHandicap}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  /* Rankings View */
                  <>
                    {/* Column Header */}
                    <div className={`flex items-center gap-3 px-3 py-2 mb-3 rounded-lg ${
                      darkMode ? 'bg-slate-900/50' : 'bg-slate-100'
                    }`}>
                      <div className="w-8 text-center">
                        <span className={`text-xs font-semibold uppercase tracking-wide ${
                          darkMode ? 'text-slate-400' : 'text-slate-600'
                        }`}>
                          Pos
                        </span>
                      </div>
                      <div className="flex-1">
                        <span className={`text-xs font-semibold uppercase tracking-wide ${
                          darkMode ? 'text-slate-400' : 'text-slate-600'
                        }`}>
                          Skipper
                        </span>
                      </div>
                      <div className="w-16 text-center">
                        <span className={`text-xs font-semibold uppercase tracking-wide ${
                          darkMode ? 'text-slate-400' : 'text-slate-600'
                        }`}>
                          Total
                        </span>
                      </div>
                      <div className="w-16 text-center">
                        <span className={`text-xs font-semibold uppercase tracking-wide ${
                          darkMode ? 'text-slate-400' : 'text-slate-600'
                        }`}>
                          Net
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {rankings.map((ranking) => {
                        const initials = ranking.skipperName
                          .split(' ')
                          .map(n => n[0])
                          .join('')
                          .toUpperCase()
                          .slice(0, 2);

                        return (
                          <div
                            key={ranking.skipperIndex}
                            className={`rounded-lg p-3 border transition-all ${
                              darkMode
                                ? 'bg-slate-900/30 border-slate-700/50 hover:bg-slate-900/50'
                                : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              {/* Position Badge */}
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                                ranking.position === 1
                                  ? 'bg-yellow-500 text-white'
                                  : ranking.position === 2
                                    ? 'bg-slate-400 text-white'
                                    : ranking.position === 3
                                      ? 'bg-amber-700 text-white'
                                      : darkMode
                                        ? 'bg-slate-700 text-slate-300'
                                        : 'bg-slate-200 text-slate-700'
                              }`}>
                                {ranking.position}
                              </div>

                              {/* Avatar */}
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-xs border-2 overflow-hidden flex-shrink-0 ${
                                darkMode ? 'bg-slate-700 text-slate-300 border-slate-600' : 'bg-slate-200 text-slate-600 border-slate-300'
                              }`}>
                                {ranking.avatarUrl ? (
                                  <img
                                    src={ranking.avatarUrl}
                                    alt={ranking.skipperName}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <span>{initials}</span>
                                )}
                              </div>

                              {/* Info */}
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-sm">
                                  {ranking.skipperName}
                                </div>
                                <div className={`text-xs flex items-center gap-1.5 flex-wrap ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                                  {/* Flag */}
                                  {currentEvent?.show_flag && skippers[ranking.skipperIndex]?.country_code && (
                                    <span className="text-base">
                                      {getCountryFlag(skippers[ranking.skipperIndex].country_code!)}
                                    </span>
                                  )}
                                  {/* Country Code */}
                                  {currentEvent?.show_country && skippers[ranking.skipperIndex]?.country_code && (
                                    <span className="font-medium">
                                      {getIOCCode(skippers[ranking.skipperIndex].country_code!)}
                                    </span>
                                  )}
                                  {/* Sail Number */}
                                  <span>Sail {ranking.sailNumber}</span>
                                </div>
                              </div>

                              {/* Total Points */}
                              <div className="w-16 text-center flex-shrink-0">
                                <div className={`text-sm font-semibold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                                  {ranking.totalPoints}
                                </div>
                              </div>

                              {/* Net Points */}
                              <div className="w-16 text-center flex-shrink-0">
                                <div className="text-sm font-bold text-blue-500">
                                  {ranking.netPoints}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* Footer Info */}
              {viewMode === 'rankings' && (
                <div className={`px-4 py-3 border-t text-xs ${
                  darkMode ? 'bg-slate-900/50 border-slate-700 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}>
                  <div className="text-center">
                    Showing standings after {currentRace} race{currentRace !== 1 ? 's' : ''}
                  </div>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
