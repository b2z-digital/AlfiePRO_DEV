import { AAvatar } from '../alfie/Kit';
import React, { useState, useEffect, useMemo } from 'react';
import { X, Award, ChevronRight, RotateCcw, Check, History, Zap, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { AlfieIcon } from '../brand/AlfieIcon';
import { Skipper, RaceResult } from '../../types';
import { RaceEvent } from '../../types/race';
import { motion, AnimatePresence } from 'framer-motion';
import { getCountryFlag, getIOCCode } from '../../utils/countryFlags';

export interface StoredHandicapData {
  skipperIndex: number;
  boatId: string;
  storedHandicap: number;
  boatType: string;
}

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
  canEditHandicaps?: boolean;
  onUpdateHandicap?: (skipperIndex: number, value: number) => void;
  onOverrideHandicap?: (skipperIndex: number, value: number) => void;
  onScratchStart?: () => void;
  storedHandicaps?: StoredHandicapData[];
  onUsePreviousHandicaps?: () => void;
}

interface SkipperHandicap {
  skipperIndex: number;
  skipperName: string;
  sailNumber: string;
  avatarUrl?: string;
  currentHandicap: number;
  storedHandicap?: number;
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
  'E': { name: 'Emerald Fleet', color: 'bg-teal-500/15', borderColor: 'border-teal-500', textColor: 'text-teal-400' },
  'F': { name: 'Pewter Fleet', color: 'bg-green-500/15', borderColor: 'border-green-500', textColor: 'text-green-400' },
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
  allRaceResults,
  canEditHandicaps = false,
  onUpdateHandicap,
  onOverrideHandicap,
  onScratchStart,
  storedHandicaps,
  onUsePreviousHandicaps
}) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [handicaps, setHandicaps] = useState<SkipperHandicap[]>([]);
  const [rankings, setRankings] = useState<SkipperRanking[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>(isScratchEvent ? 'rankings' : 'handicaps');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isOverrideMode, setIsOverrideMode] = useState(false);

  const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;
  const setIsOpen = (open: boolean) => {
    if (onOpenChange) {
      onOpenChange(open);
    } else {
      setInternalIsOpen(open);
    }
    if (!open) {
      setIsOverrideMode(false);
      setEditingIndex(null);
      setEditValue('');
    }
  };

  const isShrs = currentEvent?.heatManagement?.configuration?.scoringSystem === 'shrs';
  const shrsQualifyingRounds = currentEvent?.heatManagement?.configuration?.shrsQualifyingRounds || 0;
  const isInFinals = isShrs && shrsQualifyingRounds > 0 && currentRace > shrsQualifyingRounds;

  const allHandicapsZero = handicaps.every(h => h.currentHandicap === 0);
  const hasStoredHandicaps = storedHandicaps && storedHandicaps.some(sh => sh.storedHandicap > 0);
  const storedHandicapsApplied = canEditHandicaps && !allHandicapsZero && hasStoredHandicaps;

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

      const stored = storedHandicaps?.find(sh => sh.skipperIndex === index);

      return {
        skipperIndex: index,
        skipperName: skipper.name,
        sailNumber: skipper.sailNumber || skipper.sailNo,
        avatarUrl: skipper.avatarUrl,
        currentHandicap,
        storedHandicap: stored?.storedHandicap,
        change,
        previousHandicap: currentHandicap - change
      };
    });

    skipperHandicaps.sort((a, b) => {
      if (a.currentHandicap !== b.currentHandicap) return a.currentHandicap - b.currentHandicap;
      const sailA = parseInt(a.sailNumber) || 0;
      const sailB = parseInt(b.sailNumber) || 0;
      return sailA - sailB;
    });
    setHandicaps(skipperHandicaps);
  }, [skippers, raceResults, currentRace, storedHandicaps]);

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

  const handleStartEdit = (skipperIndex: number, currentValue: number) => {
    setEditingIndex(skipperIndex);
    setEditValue(String(currentValue));
  };

  const handleConfirmEdit = () => {
    if (editingIndex === null) return;
    const numValue = Math.max(0, Math.min(300, parseInt(editValue) || 0));
    if (isOverrideMode && onOverrideHandicap) {
      onOverrideHandicap(editingIndex, numValue);
    } else if (onUpdateHandicap) {
      onUpdateHandicap(editingIndex, numValue);
    }
    setEditingIndex(null);
    setEditValue('');
  };

  const handleScratchStart = () => {
    if (onScratchStart) {
      onScratchStart();
    }
  };

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
        className="a-ov-row"
        style={{ padding: '9px 14px' }}
      >
        <div className="flex items-center gap-3">
          <span className={`a-fo-pos ${pos === 1 ? 'p1' : pos === 2 ? 'p2' : pos === 3 ? 'p3' : ''}`} style={{ width: 28, height: 28, fontSize: 12.5 }}>
            {pos}
          </span>

          <AAvatar url={ranking.avatarUrl} first={initials.charAt(0)} last={initials.charAt(1)} size={34} />

          <div className="flex-1 min-w-0">
            <div className="a-ink font-semibold text-[14px] truncate">{ranking.skipperName}</div>
            <div className="a-dim text-[12px] mt-px flex items-center gap-1.5 flex-wrap">
              {currentEvent?.show_flag && effectiveSkippers[ranking.skipperIndex]?.country_code && (
                <span className="text-base">{getCountryFlag(effectiveSkippers[ranking.skipperIndex].country_code!)}</span>
              )}
              {currentEvent?.show_country && effectiveSkippers[ranking.skipperIndex]?.country_code && (
                <span className="font-medium">{getIOCCode(effectiveSkippers[ranking.skipperIndex].country_code!)}</span>
              )}
              <span>Sail {ranking.sailNumber}</span>
            </div>
          </div>

          <div className="w-9 text-center flex-shrink-0">
            <div className="a-num a-dim text-[14px]">
              {ranking.totalPoints}
            </div>
          </div>

          <div className="w-9 text-center flex-shrink-0">
            <div className="a-num a-txt-a text-[15px] font-bold">{ranking.netPoints}</div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <motion.button
        initial={{ x: 20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className={`a-edge-tab fixed right-0 top-1/2 -translate-y-1/2 z-40 transition-all duration-200 ${
          canEditHandicaps && allHandicapsZero && hasStoredHandicaps
            ? 'a-edge-tab-g animate-pulse'
            : canEditHandicaps && allHandicapsZero
              ? 'a-edge-tab-a animate-pulse'
              : ''
        }`}
        aria-label={isOpen ? 'Hide standings' : isScratchEvent ? 'Show standings' : 'Show handicaps'}
      >
        {isOpen ? <X size={16} /> : <Award size={16} />}
        <span className="a-edge-tab-l">{isScratchEvent ? 'STANDINGS' : 'HANDICAPS'}</span>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[9995]"
            />

            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="a-sheet a-tray fixed right-3 top-3 bottom-3 w-[440px] max-w-[calc(100vw-24px)] z-[9996] flex flex-col overflow-hidden"
            >
              <div>
                <div className="flex items-center justify-between gap-3" style={{ padding: '18px 16px 12px' }}>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setIsOpen(false)}
                      className="a-ib"
                      aria-label="Close standings"
                    >
                      <ChevronRight size={20} />
                    </button>
                    <div>
                      <h3 className="a-display a-ink text-[19px] font-semibold">
                        {isScratchEvent || isShrs
                          ? 'Standings'
                          : viewMode === 'handicaps'
                            ? canEditHandicaps ? 'Set Starting Handicaps' : isOverrideMode ? 'Override Handicaps' : 'Current Handicaps'
                            : 'Standings'}
                      </h3>
                      <p className="a-dim text-[12px] mt-0.5">
                        {isShrs
                          ? isInFinals
                            ? `Final ${currentRace - shrsQualifyingRounds} of Finals Series`
                            : `Qualifying Rd ${currentRace}`
                          : canEditHandicaps
                            ? hasStoredHandicaps && allHandicapsZero
                              ? 'Load previous handicaps or start from scratch'
                              : 'Tap a handicap to edit or use scratch start'
                            : isOverrideMode
                              ? 'Tap a handicap to override for next race'
                              : `After race ${currentRace}`}
                      </p>
                    </div>
                  </div>
                  {!canEditHandicaps && !isScratchEvent && !isShrs && viewMode === 'handicaps' && onOverrideHandicap && (
                    <button
                      onClick={() => { setIsOverrideMode(!isOverrideMode); setEditingIndex(null); setEditValue(''); }}
                      className={`a-btn a-btn-sm ${isOverrideMode ? 'a-btn-a' : ''}`}
                      style={{ height: 34 }}
                    >
                      {isOverrideMode ? <><Check size={15} />Done</> : <><AlfieIcon glyph="pen" size={15} />Edit</>}
                    </button>
                  )}
                </div>

                {!isScratchEvent && !isShrs && (
                  <div style={{ padding: '0 16px 10px' }}>
                    <div className="a-seg a-hc-tabs" role="tablist" aria-label="Handicaps or rankings">
                      <button type="button" role="tab" aria-selected={viewMode === 'handicaps'} onClick={() => setViewMode('handicaps')} className={`a-seg-i ${viewMode === 'handicaps' ? 'a-seg-on' : ''}`}>Handicaps</button>
                      <button type="button" role="tab" aria-selected={viewMode === 'rankings'} onClick={() => setViewMode('rankings')} className={`a-seg-i ${viewMode === 'rankings' ? 'a-seg-on' : ''}`}>Rankings</button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {viewMode === 'handicaps' && !isScratchEvent && !isShrs ? (
                  <>
                    {canEditHandicaps && (
                      <div className="a-hc-top">
                        {hasStoredHandicaps && allHandicapsZero && (
                          <button type="button" onClick={() => onUsePreviousHandicaps?.()} className="a-hc-act">
                            <span className="a-tile a-tile-sm a-hc-act-ic"><History size={17} /></span>
                            <span className="a-hc-act-b">
                              <span className="a-hc-act-t">Use previous handicaps</span>
                              <span className="a-hc-act-d">Stored handicaps for {currentEvent?.raceClass || 'this class'}</span>
                            </span>
                            <ChevronRight size={18} className="a-dim" />
                          </button>
                        )}
                        {hasStoredHandicaps && !allHandicapsZero && storedHandicapsApplied && (
                          <div className="a-hc-note a-hc-note-g" role="status">
                            <span className="a-hc-note-ic"><Check size={15} strokeWidth={2.5} /></span>
                            <span>Previous handicaps loaded</span>
                          </div>
                        )}
                        {allHandicapsZero ? (
                          <button type="button" onClick={handleScratchStart} className="a-hc-note a-hc-note-a">
                            <span className="a-hc-note-ic"><Zap size={15} /></span>
                            <span>Scratch start active</span>
                          </button>
                        ) : (
                          <button type="button" onClick={handleScratchStart} className="a-btn a-hc-scratch">
                            <RotateCcw size={16} />Scratch start (reset all to 0)
                          </button>
                        )}
                        <p className="a-hc-help">
                          {allHandicapsZero && hasStoredHandicaps
                            ? 'Load stored handicaps or start from scratch. Handicaps will build from race results.'
                            : allHandicapsZero
                              ? 'First race scored as scratch. Handicaps are calculated from the results.'
                              : 'Tap a handicap to edit it, or use scratch start for equal positions.'}
                        </p>
                      </div>
                    )}

                    <div className="a-hc-cols">
                      <span>Skipper</span>
                      <span>Handicap</span>
                    </div>

                    <div className="a-grp">
                      {handicaps.map((handicap) => {
                        const [firstName, ...rest] = handicap.skipperName.split(' ');
                        const isEditing = editingIndex === handicap.skipperIndex;
                        const editable = canEditHandicaps || isOverrideMode;
                        return (
                          <div key={handicap.skipperIndex} className={`a-ov-row a-hc-row ${isEditing ? 'a-hc-row-on' : ''}`}>
                            <AAvatar url={handicap.avatarUrl} first={firstName} last={rest.join(' ')} size={36} />
                            <div className="flex-1 min-w-0">
                              <div className="a-ink font-semibold text-[14px] truncate">{handicap.skipperName}</div>
                              <div className="a-dim text-[12px] mt-px flex items-center gap-1.5 flex-wrap">
                                {currentEvent?.show_flag && skippers[handicap.skipperIndex]?.country_code && (
                                  <span className="text-base">{getCountryFlag(skippers[handicap.skipperIndex].country_code!)}</span>
                                )}
                                {currentEvent?.show_country && skippers[handicap.skipperIndex]?.country_code && (
                                  <span className="font-medium">{getIOCCode(skippers[handicap.skipperIndex].country_code!)}</span>
                                )}
                                <span>Sail {handicap.sailNumber}</span>
                                {editable && handicap.storedHandicap !== undefined && handicap.storedHandicap > 0 && handicap.currentHandicap === 0 && (
                                  <span className="a-hc-stored">Stored {handicap.storedHandicap}</span>
                                )}
                              </div>
                            </div>
                            {editable && isEditing ? (
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <input
                                  type="number"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleConfirmEdit();
                                    if (e.key === 'Escape') { setEditingIndex(null); setEditValue(''); }
                                  }}
                                  autoFocus
                                  min="0"
                                  max="300"
                                  step="10"
                                  aria-label={`Handicap for ${handicap.skipperName}`}
                                  className="a-inp a-hc-inp"
                                />
                                <button type="button" onClick={handleConfirmEdit} className="a-hc-ok" aria-label="Save handicap">
                                  <Check size={17} strokeWidth={2.5} />
                                </button>
                              </div>
                            ) : editable ? (
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {handicap.change !== 0 && (
                                <span className={`a-hc-chg ${handicap.change < 0 ? 'a-hc-chg-dn' : 'a-hc-chg-up'}`} title={`was ${handicap.previousHandicap}`}>
                                  {handicap.change < 0 ? <ArrowUpRight size={12} strokeWidth={2.5} /> : <ArrowDownRight size={12} strokeWidth={2.5} />}
                                  {handicap.change < 0 ? handicap.change : `+${handicap.change}`}s
                                  <span className="a-hc-was">was {handicap.previousHandicap}</span>
                                </span>
                              )}
                                <button type="button" onClick={() => handleStartEdit(handicap.skipperIndex, handicap.currentHandicap)} className="a-hc-val a-hc-val-edit" aria-label={`Edit handicap for ${handicap.skipperName}: ${handicap.currentHandicap}`}>
                                  <span className="a-num">{handicap.currentHandicap}</span>
                                  <AlfieIcon glyph="pen" size={14} className="a-hc-pen" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {handicap.change !== 0 && (
                                <span className={`a-hc-chg ${handicap.change < 0 ? 'a-hc-chg-dn' : 'a-hc-chg-up'}`} title={`was ${handicap.previousHandicap}`}>
                                  {handicap.change < 0 ? <ArrowUpRight size={12} strokeWidth={2.5} /> : <ArrowDownRight size={12} strokeWidth={2.5} />}
                                  {handicap.change < 0 ? handicap.change : `+${handicap.change}`}s
                                  <span className="a-hc-was">was {handicap.previousHandicap}</span>
                                </span>
                              )}
                                <span className="a-hc-val"><span className="a-num">{handicap.currentHandicap}</span></span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="a-dim flex items-center gap-3" style={{ padding: '0 14px 6px', font: "600 10.5px 'Instrument Sans', sans-serif", letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      <span className="flex-1 pl-1">Skipper</span>
                      <span className="w-9 text-center">Total</span>
                      <span className="w-9 text-center a-txt-a">Net</span>
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
                            <div className="a-grp">
                              {group.rankings.map((ranking) => renderRankingRow(ranking, ranking.position))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="a-grp">
                        {rankings.map((ranking) => renderRankingRow(ranking))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {canEditHandicaps && viewMode === 'handicaps' && !isScratchEvent && !isShrs && (
                <div className="a-sheet-foot" style={{ padding: '14px 16px' }}>
                  <button type="button" onClick={() => setIsOpen(false)} className="a-btn a-btn-p w-full" style={{ height: 46 }}>
                    <Check size={18} />Done · start racing
                  </button>
                </div>
              )}

              {(viewMode === 'rankings' || isScratchEvent || isShrs) && (
                <div className="a-sheet-foot a-dim px-4 py-3 text-[12px]">
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
