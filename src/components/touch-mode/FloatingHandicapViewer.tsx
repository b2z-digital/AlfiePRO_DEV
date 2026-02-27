import React, { useState, useEffect, useMemo } from 'react';
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
  allSkippers?: Skipper[];
  allRaceResults?: RaceResult[];
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
  fleet?: string;
}

interface FleetGroup {
  fleet: string;
  name: string;
  color: string;
  borderColor: string;
  textColor: string;
  rankings: SkipperRanking[];
}

const SHRS_FLEET_CONFIG: Record<string, { name: string; color: string; borderColor: string; textColor: string }> = {
  'A': { name: 'Gold Fleet', color: 'bg-yellow-500/15', borderColor: 'border-yellow-500', textColor: 'text-yellow-400' },
  'B': { name: 'Silver Fleet', color: 'bg-slate-400/15', borderColor: 'border-slate-400', textColor: 'text-slate-300' },
  'C': { name: 'Bronze Fleet', color: 'bg-amber-600/15', borderColor: 'border-amber-600', textColor: 'text-amber-500' },
  'D': { name: 'Copper Fleet', color: 'bg-orange-500/15', borderColor: 'border-orange-500', textColor: 'text-orange-400' },
  'E': { name: 'Fleet E', color: 'bg-teal-500/15', borderColor: 'border-teal-500', textColor: 'text-teal-400' },
  'F': { name: 'Fleet F', color: 'bg-green-500/15', borderColor: 'border-green-500', textColor: 'text-green-400' },
};

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
  currentEvent,
  allSkippers,
  allRaceResults
}) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [handicaps, setHandicaps] = useState<SkipperHandicap[]>([]);
  const [rankings, setRankings] = useState<SkipperRanking[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>(isScratchEvent ? 'rankings' : 'handicaps');

  const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;
  const setIsOpen = (open: boolean) => {
    if (onOpenChange) {
      onOpenChange(open);
    } else {
      setInternalIsOpen(open);
    }
  };

  const isShrs = currentEvent?.heatManagement?.configuration?.scoringSystem === 'shrs';
  const shrsQualifyingRounds = currentEvent?.heatManagement?.configuration?.shrsQualifyingRounds || 0;
  const isInFinals = isShrs && shrsQualifyingRounds > 0 && currentRace > shrsQualifyingRounds;

  const shrsFleetMap = useMemo(() => {
    if (!isInFinals || !currentEvent?.heatManagement) return null;
    const hm = currentEvent.heatManagement;
    const currentRound = hm.rounds.find(r => r.round === hm.currentRound);
    if (!currentRound) return null;

    const map = new Map<number, string>();
    for (const assignment of currentRound.heatAssignments) {
      for (const skipperIdx of assignment.skipperIndices) {
        map.set(skipperIdx, assignment.heatDesignation);
      }
    }
    return map;
  }, [isInFinals, currentEvent?.heatManagement]);

  useEffect(() => {
    const skipperHandicaps: SkipperHandicap[] = skippers.map((skipper, index) => {
      const isValidNumber = (val: any): boolean => {
        return val !== undefined && val !== null && !isNaN(parseFloat(val)) && isFinite(val);
      };
      const safeNumber = (val: any, fallback: number = 0): number => {
        if (!isValidNumber(val)) return fallback;
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) ? fallback : num;
      };

      let currentHandicap = safeNumber(skipper.startHcap, 0);
      for (let race = currentRace - 1; race >= 1; race--) {
        const result = raceResults.find(r => r.race === race && r.skipperIndex === index);
        if (result) {
          if (isValidNumber(result.adjustedHcap)) {
            currentHandicap = safeNumber(result.adjustedHcap, 0);
            break;
          }
          if (isValidNumber(result.handicap)) {
            currentHandicap = safeNumber(result.handicap, 0);
            break;
          }
        }
      }

      let change = 0;
      const previousResult = raceResults.find(r => r.race === currentRace - 1 && r.skipperIndex === index);
      if (previousResult) {
        const beforePreviousRace = safeNumber(previousResult.handicap, currentHandicap);
        const afterPreviousRace = safeNumber(previousResult.adjustedHcap, beforePreviousRace);
        change = afterPreviousRace - beforePreviousRace;
        if (isNaN(change) || !isFinite(change)) change = 0;
      }

      return {
        skipperIndex: index,
        skipperName: skipper.name,
        sailNumber: skipper.sailNumber || skipper.sailNo,
        avatarUrl: skipper.avatarUrl,
        currentHandicap,
        change,
        previousHandicap: currentHandicap - change
      };
    });

    skipperHandicaps.sort((a, b) => {
      const sailA = parseInt(a.sailNumber) || 0;
      const sailB = parseInt(b.sailNumber) || 0;
      return sailA - sailB;
    });
    setHandicaps(skipperHandicaps);
  }, [skippers, raceResults, currentRace]);

  useEffect(() => {
    const rankingSkippers = (isInFinals && allSkippers) ? allSkippers : skippers;
    const rankingResults = (isInFinals && allRaceResults) ? allRaceResults : raceResults;

    const getLetterScoreValue = (letterScore: string, numFinishers: number): number => {
      const totalCompetitors = rankingSkippers.length;
      switch (letterScore) {
        case 'DNF': case 'RET': return numFinishers + 1;
        case 'DNS': case 'DNC': return totalCompetitors + 1;
        case 'DSQ': return totalCompetitors + 2;
        case 'BFD': case 'OCS': return totalCompetitors + 1;
        case 'DNE': return totalCompetitors + 2;
        case 'RDG': case 'DPI': return 0;
        case 'NSC': case 'WDN': return totalCompetitors + 1;
        default: return totalCompetitors + 1;
      }
    };

    const skipperRankings: SkipperRanking[] = rankingSkippers.map((skipper, index) => {
      const skipperResults = rankingResults
        .filter(r => r.skipperIndex === index && r.race <= currentRace);

      const scores = skipperResults.map(result => {
        let score: number;
        if (result.customPoints !== undefined && result.customPoints !== null) {
          score = result.customPoints;
        } else if (result.letterScore) {
          const raceFinishers = rankingResults
            .filter(r => r.race === result.race && r.position !== null && !r.letterScore)
            .length;
          if (result.letterScore === 'RDGfix' && result.position !== null) {
            score = result.position;
          } else {
            score = getLetterScoreValue(result.letterScore, raceFinishers);
          }
        } else {
          score = result.position || (rankingSkippers.length + 1);
        }
        return { race: result.race, score, isLetterScore: !!result.letterScore };
      });

      const totalPoints = scores.reduce((sum, s) => sum + s.score, 0);

      let numDrops = 0;
      for (const threshold of dropRules) {
        if (scores.length >= threshold) numDrops++;
        else break;
      }

      let netPoints = totalPoints;
      if (numDrops > 0 && scores.length > 0) {
        const letterScores = scores.filter(s => s.isLetterScore).sort((a, b) => b.score - a.score);
        const dropsRemaining = Math.max(0, numDrops - letterScores.length);
        const regularScores = scores.filter(s => !s.isLetterScore).sort((a, b) => b.score - a.score);
        const scoresToDrop = [...letterScores.slice(0, numDrops), ...regularScores.slice(0, dropsRemaining)];
        scoresToDrop.forEach(s => { netPoints -= s.score; });
      }

      return {
        skipperIndex: index,
        skipperName: skipper.name,
        sailNumber: skipper.sailNumber || skipper.sailNo,
        avatarUrl: skipper.avatarUrl,
        totalPoints,
        netPoints,
        position: 0,
        fleet: shrsFleetMap?.get(index) || undefined
      };
    });

    if (isInFinals && shrsFleetMap) {
      const fleetOrder = ['A', 'B', 'C', 'D', 'E', 'F'];
      skipperRankings.sort((a, b) => {
        const fleetA = fleetOrder.indexOf(a.fleet || 'Z');
        const fleetB = fleetOrder.indexOf(b.fleet || 'Z');
        if (fleetA !== fleetB) return fleetA - fleetB;
        if (a.netPoints !== b.netPoints) return a.netPoints - b.netPoints;
        return parseInt(a.sailNumber) - parseInt(b.sailNumber);
      });
    } else {
      skipperRankings.sort((a, b) => {
        if (a.netPoints !== b.netPoints) return a.netPoints - b.netPoints;
        return parseInt(a.sailNumber) - parseInt(b.sailNumber);
      });
    }

    skipperRankings.forEach((ranking, index) => {
      ranking.position = index + 1;
    });

    setRankings(skipperRankings);
  }, [skippers, raceResults, currentRace, dropRules, isInFinals, allSkippers, allRaceResults, shrsFleetMap]);

  const fleetGroups = useMemo((): FleetGroup[] | null => {
    if (!isInFinals || !shrsFleetMap) return null;
    const groups: FleetGroup[] = [];
    const fleetOrder = ['A', 'B', 'C', 'D', 'E', 'F'];
    const usedFleets = new Set(rankings.map(r => r.fleet).filter(Boolean));

    for (const fleet of fleetOrder) {
      if (!usedFleets.has(fleet)) continue;
      const config = SHRS_FLEET_CONFIG[fleet] || { name: `Fleet ${fleet}`, color: 'bg-slate-500/15', borderColor: 'border-slate-500', textColor: 'text-slate-400' };
      const fleetRankings = rankings.filter(r => r.fleet === fleet);
      let posCounter = 1;
      fleetRankings.forEach(r => { r.position = posCounter++; });
      groups.push({
        fleet,
        name: config.name,
        color: config.color,
        borderColor: config.borderColor,
        textColor: config.textColor,
        rankings: fleetRankings
      });
    }
    return groups;
  }, [isInFinals, shrsFleetMap, rankings]);

  const effectiveSkippers = (isInFinals && allSkippers) ? allSkippers : skippers;

  const renderRankingRow = (ranking: SkipperRanking, fleetPosition?: number) => {
    const initials = ranking.skipperName
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

    const pos = fleetPosition ?? ranking.position;

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
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
            pos === 1
              ? 'bg-yellow-500 text-white'
              : pos === 2
                ? 'bg-slate-400 text-white'
                : pos === 3
                  ? 'bg-amber-700 text-white'
                  : darkMode
                    ? 'bg-slate-700 text-slate-300'
                    : 'bg-slate-200 text-slate-700'
          }`}>
            {pos}
          </div>

          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-xs border-2 overflow-hidden flex-shrink-0 ${
            darkMode ? 'bg-slate-700 text-slate-300 border-slate-600' : 'bg-slate-200 text-slate-600 border-slate-300'
          }`}>
            {ranking.avatarUrl ? (
              <img src={ranking.avatarUrl} alt={ranking.skipperName} className="w-full h-full object-cover" />
            ) : (
              <span>{initials}</span>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm">{ranking.skipperName}</div>
            <div className={`text-xs flex items-center gap-1.5 flex-wrap ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              {currentEvent?.show_flag && effectiveSkippers[ranking.skipperIndex]?.country_code && (
                <span className="text-base">{getCountryFlag(effectiveSkippers[ranking.skipperIndex].country_code!)}</span>
              )}
              {currentEvent?.show_country && effectiveSkippers[ranking.skipperIndex]?.country_code && (
                <span className="font-medium">{getIOCCode(effectiveSkippers[ranking.skipperIndex].country_code!)}</span>
              )}
              <span>Sail {ranking.sailNumber}</span>
            </div>
          </div>

          <div className="w-16 text-center flex-shrink-0">
            <div className={`text-sm font-semibold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              {ranking.totalPoints}
            </div>
          </div>

          <div className="w-16 text-center flex-shrink-0">
            <div className="text-sm font-bold text-blue-500">{ranking.netPoints}</div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
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

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30"
            />

            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className={`fixed right-0 top-0 bottom-0 w-[480px] max-w-[95vw] shadow-2xl z-40 flex flex-col ${
                darkMode ? 'bg-slate-800 text-white' : 'bg-white text-slate-900'
              }`}
            >
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
                        {isScratchEvent || isShrs
                          ? 'Current Rankings'
                          : viewMode === 'handicaps'
                            ? 'Current Handicaps'
                            : 'Current Rankings'}
                      </h3>
                      <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        {isShrs
                          ? isInFinals
                            ? `Final ${currentRace - shrsQualifyingRounds} of Finals Series`
                            : `Qualifying Rd ${currentRace}`
                          : `As of Race ${currentRace}`}
                      </p>
                    </div>
                  </div>
                </div>

                {!isScratchEvent && !isShrs && (
                  <div className="flex px-4 pb-2 gap-2">
                    <button
                      onClick={() => setViewMode('handicaps')}
                      className={`flex-1 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                        viewMode === 'handicaps'
                          ? darkMode ? 'bg-slate-700 text-white' : 'bg-white text-slate-900 shadow-sm'
                          : darkMode ? 'text-slate-400 hover:text-slate-300' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Handicaps
                    </button>
                    <button
                      onClick={() => setViewMode('rankings')}
                      className={`flex-1 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                        viewMode === 'rankings'
                          ? darkMode ? 'bg-slate-700 text-white' : 'bg-white text-slate-900 shadow-sm'
                          : darkMode ? 'text-slate-400 hover:text-slate-300' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Rankings
                    </button>
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {viewMode === 'handicaps' && !isScratchEvent && !isShrs ? (
                  <>
                    <div className={`flex items-center justify-between px-3 py-2 mb-3 rounded-lg ${
                      darkMode ? 'bg-slate-900/50' : 'bg-slate-100'
                    }`}>
                      <div className="flex-1">
                        <span className={`text-xs font-semibold uppercase tracking-wide ${
                          darkMode ? 'text-slate-400' : 'text-slate-600'
                        }`}>Skipper</span>
                      </div>
                      <div className="text-right">
                        <span className={`text-xs font-semibold uppercase tracking-wide ${
                          darkMode ? 'text-slate-400' : 'text-slate-600'
                        }`}>Handicap</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {handicaps.map((handicap) => {
                        const initials = handicap.skipperName
                          .split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
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
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-xs border-2 overflow-hidden flex-shrink-0 ${
                                darkMode ? 'bg-slate-700 text-slate-300 border-slate-600' : 'bg-slate-200 text-slate-600 border-slate-300'
                              }`}>
                                {handicap.avatarUrl ? (
                                  <img src={handicap.avatarUrl} alt={handicap.skipperName} className="w-full h-full object-cover" />
                                ) : (
                                  <span>{initials}</span>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-sm">{handicap.skipperName}</div>
                                <div className={`text-xs flex items-center gap-1.5 flex-wrap ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                                  {currentEvent?.show_flag && skippers[handicap.skipperIndex]?.country_code && (
                                    <span className="text-base">{getCountryFlag(skippers[handicap.skipperIndex].country_code!)}</span>
                                  )}
                                  {currentEvent?.show_country && skippers[handicap.skipperIndex]?.country_code && (
                                    <span className="font-medium">{getIOCCode(skippers[handicap.skipperIndex].country_code!)}</span>
                                  )}
                                  <span>Sail {handicap.sailNumber}</span>
                                </div>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <div className="text-xl font-bold text-green-500">{handicap.currentHandicap}</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <>
                    <div className={`flex items-center gap-3 px-3 py-2 mb-3 rounded-lg ${
                      darkMode ? 'bg-slate-900/50' : 'bg-slate-100'
                    }`}>
                      <div className="w-8 text-center">
                        <span className={`text-xs font-semibold uppercase tracking-wide ${
                          darkMode ? 'text-slate-400' : 'text-slate-600'
                        }`}>Pos</span>
                      </div>
                      <div className="flex-1">
                        <span className={`text-xs font-semibold uppercase tracking-wide ${
                          darkMode ? 'text-slate-400' : 'text-slate-600'
                        }`}>Skipper</span>
                      </div>
                      <div className="w-16 text-center">
                        <span className={`text-xs font-semibold uppercase tracking-wide ${
                          darkMode ? 'text-slate-400' : 'text-slate-600'
                        }`}>Total</span>
                      </div>
                      <div className="w-16 text-center">
                        <span className={`text-xs font-semibold uppercase tracking-wide ${
                          darkMode ? 'text-slate-400' : 'text-slate-600'
                        }`}>Net</span>
                      </div>
                    </div>

                    {fleetGroups ? (
                      <div className="space-y-4">
                        {fleetGroups.map((group) => (
                          <div key={group.fleet}>
                            <div className={`mb-2 px-3 py-2 rounded-lg border-l-4 ${group.borderColor} ${group.color}`}>
                              <span className={`font-bold text-sm ${group.textColor}`}>
                                {group.name}
                              </span>
                              <span className={`ml-2 text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                ({group.rankings.length} skippers)
                              </span>
                            </div>
                            <div className="space-y-2">
                              {group.rankings.map((ranking) => renderRankingRow(ranking, ranking.position))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {rankings.map((ranking) => renderRankingRow(ranking))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {(viewMode === 'rankings' || isScratchEvent || isShrs) && (
                <div className={`px-4 py-3 border-t text-xs ${
                  darkMode ? 'bg-slate-900/50 border-slate-700 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}>
                  <div className="text-center">
                    {isShrs
                      ? isInFinals
                        ? `Standings after ${currentRace - shrsQualifyingRounds} final${currentRace - shrsQualifyingRounds !== 1 ? 's' : ''} (${shrsQualifyingRounds} qualifying + ${currentRace - shrsQualifyingRounds} finals)`
                        : `Standings after ${currentRace} qualifying round${currentRace !== 1 ? 's' : ''}`
                      : `Showing standings after ${currentRace} race${currentRace !== 1 ? 's' : ''}`}
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
