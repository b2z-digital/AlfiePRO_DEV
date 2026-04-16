import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Skipper, LetterScore } from '../types';
import { RaceEvent } from '../types/race';
import { HeatManagement, HeatDesignation, HeatAssignment } from '../types/heat';
import { Check, CircleAlert as AlertCircle, ArrowUp, Trophy, Eye, Type } from 'lucide-react';
import { LetterScoreSelector } from './LetterScoreSelector';
import { HeatOverallResultsModal } from './HeatOverallResultsModal';

interface SpreadsheetScoringProps {
  skippers: Skipper[];
  currentRace: number;
  numRaces: number;
  raceResults: any[];
  updateRaceResults: (results: any[]) => void;
  darkMode: boolean;
  onRaceChange?: (newRace: number) => void;
  dropRules?: number[] | string;
  currentEvent?: RaceEvent | null;
  isHeatScoring?: boolean;
  isScoringLastHeat?: boolean;
  onConfirmResults?: () => void;
  onConfirmHeatResults?: (heat: HeatDesignation) => void;
  heatObservers?: any[];
  allHeatObserversMap?: Record<string, any[]>;
  roundLabel?: string;
  allSkippers?: Skipper[];
  allRaceResults?: any[];
  isFullscreen?: boolean;
  isSeedingRound?: boolean;
  heatManagement?: HeatManagement;
  availableHeats?: HeatDesignation[];
  heatSkipperIndicesMap?: Record<HeatDesignation, number[]>;
  allHeatRaceResults?: Record<HeatDesignation, any[]>;
  onUpdateHeatResults?: (heat: HeatDesignation, results: any[]) => void;
  selectedHeat?: HeatDesignation | null;
  onSelectHeat?: (heat: HeatDesignation) => void;
  parentVerifiedHeats?: Set<string>;
}

interface CellEntry {
  sailNumber: string;
  skipperIndex: number | null;
  letterScore?: LetterScore | null;
  customPoints?: number;
  isValid: boolean;
  isDuplicate: boolean;
}

const HEAT_HEADER_COLORS: Record<HeatDesignation, string> = {
  'A': 'bg-yellow-600', 'B': 'bg-orange-600', 'C': 'bg-red-600',
  'D': 'bg-green-600', 'E': 'bg-blue-600', 'F': 'bg-teal-600'
};

const getOrdinal = (n: number): string => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export const SpreadsheetScoring: React.FC<SpreadsheetScoringProps> = ({
  skippers,
  currentRace: initialRace,
  numRaces,
  raceResults,
  updateRaceResults,
  darkMode,
  onRaceChange,
  currentEvent,
  isHeatScoring = false,
  isScoringLastHeat = false,
  onConfirmResults,
  onConfirmHeatResults,
  heatObservers = [],
  allHeatObserversMap = {},
  roundLabel,
  isFullscreen = false,
  isSeedingRound = false,
  heatManagement,
  availableHeats: propAvailableHeats,
  heatSkipperIndicesMap,
  allHeatRaceResults,
  onUpdateHeatResults,
  selectedHeat,
  onSelectHeat,
  parentVerifiedHeats
}) => {
  const [cells, setCells] = useState<Record<HeatDesignation, CellEntry[]>>({} as any);
  const [localVerifiedHeats, setLocalVerifiedHeats] = useState<Set<HeatDesignation>>(new Set());
  const [showOverallResults, setShowOverallResults] = useState(false);
  const [showLetterScoreModal, setShowLetterScoreModal] = useState(false);
  const [letterScorePosition, setLetterScorePosition] = useState<number | null>(null);
  const [letterScoreHeat, setLetterScoreHeat] = useState<HeatDesignation | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const heatSectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const verifyButtonRef = useRef<HTMLDivElement | null>(null);
  const autoCompleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoCompleteCellRef = useRef<{ heat: HeatDesignation; position: number; value: string } | null>(null);
  const verifiedCellsRef = useRef<Record<HeatDesignation, CellEntry[]>>({} as any);
  const prevRoundRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (autoCompleteTimerRef.current) clearTimeout(autoCompleteTimerRef.current);
    };
  }, []);

  const isMultiHeatMode = !!(heatManagement && propAvailableHeats && heatSkipperIndicesMap && allHeatRaceResults);

  const availableHeats = useMemo(() => {
    if (isMultiHeatMode && propAvailableHeats) {
      return [...propAvailableHeats].reverse();
    }
    return [];
  }, [isMultiHeatMode, propAvailableHeats]);

  const currentRound = heatManagement?.currentRound || initialRace;

  const verifiedHeats = useMemo(() => {
    const merged = new Set(localVerifiedHeats);
    if (parentVerifiedHeats) {
      for (const key of parentVerifiedHeats) {
        const [roundStr, heat] = key.split('-');
        if (Number(roundStr) === currentRound && heat) {
          merged.add(heat as HeatDesignation);
        }
      }
    }
    return merged;
  }, [localVerifiedHeats, parentVerifiedHeats, currentRound]);

  const completedRounds = useMemo(() => {
    if (!heatManagement || !isMultiHeatMode) return [];
    return heatManagement.rounds.filter(r => r.completed && r.round < currentRound);
  }, [heatManagement, isMultiHeatMode, currentRound]);

  const promotionCount = useMemo(() => {
    if (!isHeatScoring || !heatManagement) return 0;
    return heatManagement.configuration?.promotionCount || 0;
  }, [isHeatScoring, heatManagement]);

  const getObserversForHeat = useCallback((heat: HeatDesignation): any[] => {
    return allHeatObserversMap[heat] || [];
  }, [allHeatObserversMap]);

  const getHeatSkippers = useCallback((heat: HeatDesignation): Skipper[] => {
    if (isMultiHeatMode && heatSkipperIndicesMap) {
      const indices = heatSkipperIndicesMap[heat] || [];
      return indices.map(idx => skippers[idx]).filter(Boolean);
    }
    return skippers;
  }, [isMultiHeatMode, heatSkipperIndicesMap, skippers]);

  const getRacingSkippersForHeat = useCallback((heat: HeatDesignation): Skipper[] => {
    return getHeatSkippers(heat);
  }, [getHeatSkippers]);

  const getHeatRaceResults = useCallback((heat: HeatDesignation): any[] => {
    if (isMultiHeatMode && allHeatRaceResults) {
      return allHeatRaceResults[heat] || [];
    }
    return raceResults;
  }, [isMultiHeatMode, allHeatRaceResults, raceResults]);

  const buildSailNumberMap = useCallback((heatSkips: Skipper[]): Map<string, number> => {
    const map = new Map<string, number>();
    heatSkips.forEach((s, idx) => {
      const sailNo = String(s.sailNumber || s.sailNo).trim().toLowerCase();
      if (sailNo) map.set(sailNo, idx);
    });
    return map;
  }, []);

  const currentScoringHeat = useMemo(() => {
    if (!isMultiHeatMode) return 'A' as HeatDesignation;
    const reversed = [...availableHeats].reverse();
    for (const heat of reversed) {
      if (!verifiedHeats.has(heat)) return heat;
    }
    return reversed[reversed.length - 1] || 'A' as HeatDesignation;
  }, [isMultiHeatMode, availableHeats, verifiedHeats]);

  const heatResultsKey = useMemo(() => {
    if (!isMultiHeatMode || !allHeatRaceResults) return '';
    return availableHeats.map(h => {
      const results = allHeatRaceResults[h] || [];
      const roundResults = results.filter(r => r.race === currentRound);
      return `${h}:${roundResults.length}`;
    }).join('|');
  }, [isMultiHeatMode, allHeatRaceResults, availableHeats, currentRound]);

  const heatAssignmentKey = useMemo(() => {
    if (!isMultiHeatMode || !heatSkipperIndicesMap) return '';
    return availableHeats.map(h => {
      const indices = heatSkipperIndicesMap[h] || [];
      return `${h}:${indices.length}`;
    }).join('|');
  }, [isMultiHeatMode, heatSkipperIndicesMap, availableHeats]);

  useEffect(() => {
    if (prevRoundRef.current !== null && prevRoundRef.current !== currentRound) {
      verifiedCellsRef.current = {} as any;
    }
    prevRoundRef.current = currentRound;

    if (!isMultiHeatMode) {
      const racingSkips = skippers;
      const totalPos = racingSkips.length;
      const newCells: CellEntry[] = [];
      const existingResults = raceResults.filter(r => r.race === initialRace);

      for (let pos = 1; pos <= totalPos; pos++) {
        const result = existingResults.find(r => r.position === pos);
        if (result) {
          const skipper = skippers[result.skipperIndex];
          const sailNo = String(skipper?.sailNumber || skipper?.sailNo || '');
          newCells.push({
            sailNumber: sailNo,
            skipperIndex: result.skipperIndex,
            letterScore: result.letterScore || null,
            customPoints: result.customPoints,
            isValid: true,
            isDuplicate: false
          });
        } else {
          newCells.push({ sailNumber: '', skipperIndex: null, letterScore: null, isValid: true, isDuplicate: false });
        }
      }

      setCells({ A: newCells } as any);
      setLocalVerifiedHeats(new Set());
      return;
    }

    const newAllCells: Record<string, CellEntry[]> = {};
    const alreadyVerified = new Set<HeatDesignation>();

    for (const heat of availableHeats) {
      const heatSkips = getHeatSkippers(heat);
      const racingSkips = getRacingSkippersForHeat(heat);
      let totalPos = racingSkips.length;
      const heatResults = getHeatRaceResults(heat);
      const existingResults = heatResults.filter(r => r.race === currentRound);

      if (completedRounds.length > 0) {
        for (const r of completedRounds) {
          const prevAssignment = r.heatAssignments?.find((a: any) => a.heatDesignation === heat);
          const prevAssignmentCount = prevAssignment?.skipperIndices?.length || 0;
          const prevResultCount = (r.results || []).filter((res: any) => res.heatDesignation === heat).length;
          totalPos = Math.max(totalPos, prevAssignmentCount, prevResultCount);
        }
      }

      const savedCells = verifiedCellsRef.current[heat];
      if (savedCells && savedCells.length > 0) {
        const hasData = savedCells.some(c => c.sailNumber.trim() || c.letterScore);
        if (hasData) {
          if (savedCells.length < totalPos) {
            const expanded = [...savedCells];
            for (let i = savedCells.length; i < totalPos; i++) {
              expanded.push({ sailNumber: '', skipperIndex: null, letterScore: null, isValid: true, isDuplicate: false });
            }
            newAllCells[heat] = expanded;
            verifiedCellsRef.current[heat] = expanded;
          } else {
            newAllCells[heat] = savedCells;
          }
          alreadyVerified.add(heat);
          continue;
        }
      }

      const newCells: CellEntry[] = [];
      for (let pos = 1; pos <= totalPos; pos++) {
        const result = existingResults.find(r => r.position === pos);
        if (result) {
          const skipperIdx = result.skipperIndex;
          const skipper = heatSkips[skipperIdx];
          const sailNo = String(skipper?.sailNumber || skipper?.sailNo || '');
          newCells.push({
            sailNumber: sailNo,
            skipperIndex: skipperIdx,
            letterScore: result.letterScore || null,
            customPoints: result.customPoints,
            isValid: true,
            isDuplicate: false
          });
        } else {
          newCells.push({ sailNumber: '', skipperIndex: null, letterScore: null, isValid: true, isDuplicate: false });
        }
      }
      newAllCells[heat] = newCells;

      const filledCount = newCells.filter(c => c.sailNumber.trim() || c.letterScore).length;
      if (filledCount >= totalPos && totalPos > 0) {
        alreadyVerified.add(heat);
      }
    }

    setCells(newAllCells as any);
    setLocalVerifiedHeats(alreadyVerified);
  }, [isMultiHeatMode, availableHeats, currentRound, skippers, initialRace, raceResults, heatResultsKey, heatAssignmentKey, completedRounds]);

  useEffect(() => {
    if (!isMultiHeatMode || !currentScoringHeat) return;
    const timer = setTimeout(() => {
      const ref = heatSectionRefs.current[currentScoringHeat];
      if (ref && scrollContainerRef.current) {
        ref.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [currentScoringHeat, isMultiHeatMode]);

  const validateCells = useCallback((updatedCells: CellEntry[], heatSkips: Skipper[]): CellEntry[] => {
    const sailMap = buildSailNumberMap(heatSkips);
    const usedSails = new Map<string, number>();

    return updatedCells.map((cell, idx) => {
      if (!cell.sailNumber.trim() && !cell.letterScore) {
        return { ...cell, skipperIndex: null, isValid: true, isDuplicate: false };
      }

      const sailLower = cell.sailNumber.trim().toLowerCase();
      const skipperIdx = sailMap.get(sailLower) ?? null;

      if (cell.letterScore) {
        if (sailLower && usedSails.has(sailLower)) {
          return { ...cell, skipperIndex: skipperIdx, isValid: skipperIdx !== null, isDuplicate: true };
        }
        if (sailLower) usedSails.set(sailLower, idx);
        return { ...cell, skipperIndex: skipperIdx, isValid: true, isDuplicate: false };
      }

      const isValid = skipperIdx !== null;
      if (usedSails.has(sailLower)) {
        return { ...cell, skipperIndex: skipperIdx, isValid, isDuplicate: true };
      }
      usedSails.set(sailLower, idx);
      return { ...cell, skipperIndex: skipperIdx, isValid, isDuplicate: false };
    });
  }, [buildSailNumberMap]);

  const handleCellChange = (heat: HeatDesignation, position: number, value: string) => {
    const idx = position - 1;
    const heatCells = cells[heat] || [];
    const updated = [...heatCells];
    updated[idx] = { ...updated[idx], sailNumber: value, letterScore: null, customPoints: undefined };

    const heatSkips = isMultiHeatMode ? getHeatSkippers(heat) : skippers;
    const validated = validateCells(updated, heatSkips);
    setCells(prev => ({ ...prev, [heat]: validated }));

    if (autoCompleteTimerRef.current) {
      clearTimeout(autoCompleteTimerRef.current);
      autoCompleteTimerRef.current = null;
    }

    if (currentEvent?.auto_complete_sail && value.trim()) {
      const sailMap = buildSailNumberMap(heatSkips);
      const lower = value.trim().toLowerCase();
      const exactMatch = sailMap.has(lower);
      const possibleLongerMatch = exactMatch && [...sailMap.keys()].some(
        k => k !== lower && k.startsWith(lower)
      );

      if (exactMatch) {
        const delay = possibleLongerMatch ? 1500 : 800;
        autoCompleteCellRef.current = { heat, position, value: lower };
        const currentSkipperCount = isMultiHeatMode ? getRacingSkippersForHeat(heat).length : skippers.length;
        autoCompleteTimerRef.current = setTimeout(() => {
          const pending = autoCompleteCellRef.current;
          if (pending && pending.heat === heat && pending.position === position && pending.value === lower) {
            if (position < currentSkipperCount) {
              const nextRef = inputRefs.current[`${heat}-${position}`];
              if (nextRef) {
                nextRef.focus();
                nextRef.select();
              }
            }
          }
          autoCompleteTimerRef.current = null;
          autoCompleteCellRef.current = null;
        }, delay);
      }
    }
  };

  const handleLetterScore = (heat: HeatDesignation, position: number) => {
    setLetterScoreHeat(heat);
    setLetterScorePosition(position);
    setShowLetterScoreModal(true);
  };

  const applyLetterScore = (score: LetterScore, customPoints?: number) => {
    if (letterScorePosition === null || !letterScoreHeat) return;
    const idx = letterScorePosition - 1;
    const heat = letterScoreHeat;
    const heatCells = cells[heat] || [];
    const updated = [...heatCells];
    updated[idx] = { ...updated[idx], letterScore: score, customPoints };

    const regularFinishers = updated.filter(c => !c.letterScore && (c.sailNumber.trim() || c.skipperIndex !== null));
    const letterScoreEntries = updated.filter(c => c.letterScore);
    const emptyEntries = updated.filter(c => !c.letterScore && !c.sailNumber.trim() && c.skipperIndex === null);
    const reordered = [...regularFinishers, ...letterScoreEntries, ...emptyEntries];

    const heatSkips = isMultiHeatMode ? getHeatSkippers(heat) : skippers;
    const validated = validateCells(reordered, heatSkips);
    setCells(prev => ({ ...prev, [heat]: validated }));
    setShowLetterScoreModal(false);
    setLetterScorePosition(null);
    setLetterScoreHeat(null);
  };

  useEffect(() => {
    if (!currentScoringHeat || verifiedHeats.has(currentScoringHeat)) return;
    const stats = getHeatCellStats(currentScoringHeat);
    const isReady = stats.filledCount >= stats.totalPositions && !stats.hasErrors && stats.totalPositions > 0;
    if (isReady && verifyButtonRef.current) {
      setTimeout(() => {
        verifyButtonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    }
  }, [cells, currentScoringHeat, verifiedHeats]);

  const handleKeyDown = (e: React.KeyboardEvent, heat: HeatDesignation, position: number, totalPositions: number) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (position < totalPositions) {
        const ref = inputRefs.current[`${heat}-${position}`];
        ref?.focus();
        ref?.select();
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      inputRefs.current[`${heat}-${position}`]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      inputRefs.current[`${heat}-${position - 2}`]?.focus();
    }
  };

  const getHeatCellStats = (heat: HeatDesignation) => {
    const heatCells = cells[heat] || [];
    const filledCount = heatCells.filter(c => c.sailNumber.trim() || c.letterScore).length;
    const hasErrors = heatCells.some(c => (c.sailNumber.trim() && !c.isValid) || c.isDuplicate);
    const currentSkipperCount = isMultiHeatMode ? getRacingSkippersForHeat(heat).length : skippers.length;
    const totalPositions = currentSkipperCount;
    return { filledCount, hasErrors, totalPositions };
  };

  const isHeatReady = (heat: HeatDesignation): boolean => {
    const stats = getHeatCellStats(heat);
    return stats.filledCount >= stats.totalPositions && !stats.hasErrors && stats.totalPositions > 0;
  };

  const handleConfirmHeat = (heat: HeatDesignation) => {
    const heatCells = cells[heat] || [];
    const hasErrors = heatCells.some(c => (c.sailNumber.trim() && !c.isValid) || c.isDuplicate);
    if (hasErrors) return;

    if (isMultiHeatMode && onUpdateHeatResults) {
      const heatResults = getHeatRaceResults(heat);
      const newResults = heatResults.filter(r => r.race !== currentRound);
      heatCells.forEach((cell, idx) => {
        if (cell.skipperIndex !== null && (cell.sailNumber.trim() || cell.letterScore)) {
          newResults.push({
            race: currentRound,
            skipperIndex: cell.skipperIndex,
            position: cell.letterScore ? null : idx + 1,
            letterScore: cell.letterScore || undefined,
            customPoints: cell.customPoints
          });
        }
      });
      onUpdateHeatResults(heat, newResults);
    } else {
      const newResults = raceResults.filter(r => r.race !== initialRace);
      heatCells.forEach((cell, idx) => {
        if (cell.skipperIndex !== null && (cell.sailNumber.trim() || cell.letterScore)) {
          newResults.push({
            race: initialRace,
            skipperIndex: cell.skipperIndex,
            position: cell.letterScore ? null : idx + 1,
            letterScore: cell.letterScore || undefined,
            customPoints: cell.customPoints
          });
        }
      });
      updateRaceResults(newResults);
    }

    setLocalVerifiedHeats(prev => new Set(prev).add(heat));
    verifiedCellsRef.current[heat] = cells[heat] ? [...cells[heat]] : [];

    if (onConfirmHeatResults) {
      onConfirmHeatResults(heat);
    } else if (onConfirmResults) {
      onConfirmResults();
    }
  };

  const getSkipperName = (heat: HeatDesignation, cell: CellEntry): string | null => {
    if (cell.skipperIndex === null) return null;
    const heatSkips = isMultiHeatMode ? getHeatSkippers(heat) : skippers;
    return heatSkips[cell.skipperIndex]?.name || null;
  };

  const getMatchedSkipper = (heat: HeatDesignation, cell: CellEntry): Skipper | null => {
    if (cell.skipperIndex === null) return null;
    const heatSkips = isMultiHeatMode ? getHeatSkippers(heat) : skippers;
    return heatSkips[cell.skipperIndex] || null;
  };

  const isPromotionPosition = (pos: number): boolean => {
    return isHeatScoring && !isSeedingRound && promotionCount > 0 && pos <= promotionCount;
  };

  const heatsToRender = isMultiHeatMode ? availableHeats : ['A' as HeatDesignation];

  return (
    <div className={`flex flex-col rounded-b-xl ${
      darkMode ? 'bg-slate-900' : 'bg-slate-50'
    }`}>
      <div className={`${isFullscreen ? 'max-h-[calc(100vh-80px)]' : 'max-h-[75vh]'} overflow-auto`} ref={scrollContainerRef}>
        {completedRounds.length > 0 && (
          <div className={`sticky top-0 z-10 ${
            darkMode ? 'bg-slate-700 border-b border-slate-600/50' : 'bg-slate-200 border-b border-slate-300'
          }`}>
            <table className="text-[13px] border-collapse mx-2">
              <colgroup>
                <col style={{ width: '40px' }} />
                {completedRounds.map(r => (
                  <React.Fragment key={`cg-${r.round}`}>
                    <col style={{ width: '48px' }} />
                    <col style={{ width: '40px' }} />
                    <col style={{ width: '32px' }} />
                  </React.Fragment>
                ))}
                <col style={{ width: '88px' }} />
                <col style={{ width: '140px' }} />
                <col style={{ width: '40px' }} />
                <col style={{ width: '32px' }} />
                {!isSeedingRound && promotionCount > 0 && <col style={{ width: '32px' }} />}
              </colgroup>
              <tbody>
                <tr>
                  <td className="px-1.5 py-1.5" />
                  {completedRounds.map(r => (
                    <td
                      key={`master-race-${r.round}`}
                      colSpan={3}
                      className={`text-center font-bold text-[11px] uppercase tracking-widest py-1.5 border-l ${
                        darkMode ? 'text-slate-300 border-slate-500/50' : 'text-slate-600 border-slate-400/50'
                      }`}
                    >
                      Race {r.round}
                    </td>
                  ))}
                  <td
                    colSpan={4}
                    className={`text-center font-bold text-[11px] uppercase tracking-widest py-1.5 border-l ${
                      darkMode ? 'text-blue-300 border-blue-500/30' : 'text-blue-700 border-blue-300'
                    }`}
                  >
                    Race {currentRound}
                  </td>
                  {!isSeedingRound && promotionCount > 0 && <td />}
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <div className="space-y-2 p-2 pb-4">
          {heatsToRender.map(heat => {
            const heatCells = cells[heat] || [];
            const racingSkips = isMultiHeatMode ? getRacingSkippersForHeat(heat) : skippers;
            const totalPositions = racingSkips.length;
            const stats = getHeatCellStats(heat);
            const isVerified = verifiedHeats.has(heat);
            const isCurrent = heat === currentScoringHeat;
            const heatReady = isHeatReady(heat);

            return (
              <div
                key={heat}
                ref={el => { heatSectionRefs.current[heat] = el; }}
                className={`rounded-lg border overflow-hidden ${
                  darkMode ? 'bg-slate-800/50 border-slate-700/50' : 'bg-white border-slate-200'
                } ${isCurrent && !isVerified ? 'ring-2 ring-blue-500/40' : ''}`}
              >
                <div
                  className={`flex items-center justify-between px-3 py-1.5 ${HEAT_HEADER_COLORS[heat] || 'bg-slate-600'} text-white`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm">Heat {heat}</span>
                    <span className="text-xs opacity-80">{totalPositions} skippers</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs opacity-80">
                      {stats.filledCount}/{stats.totalPositions}
                    </span>
                    {isVerified && <Check size={14} />}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="text-[13px] border-collapse">
                    <colgroup>
                      <col style={{ width: '40px' }} />
                      {completedRounds.map(r => (
                        <React.Fragment key={`tcg-${r.round}`}>
                          <col style={{ width: '48px' }} />
                          <col style={{ width: '40px' }} />
                          <col style={{ width: '32px' }} />
                        </React.Fragment>
                      ))}
                      <col style={{ width: isVerified ? '64px' : '88px' }} />
                      {!isVerified && <col style={{ width: '140px' }} />}
                      <col style={{ width: '40px' }} />
                      <col style={{ width: '32px' }} />
                      {!isSeedingRound && promotionCount > 0 && <col style={{ width: '32px' }} />}
                    </colgroup>
                    <thead>
                      <tr className={darkMode ? 'bg-slate-700/40' : 'bg-slate-100/60'}>
                        <th className="px-1.5 py-1" />
                        {completedRounds.map(r => (
                          <React.Fragment key={`hdr-r${r.round}`}>
                            <th className={`px-1 py-1 text-center font-bold uppercase tracking-wider border-l ${
                              darkMode ? 'text-slate-500 border-slate-600/40' : 'text-slate-400 border-slate-200'
                            }`}>
                              <span className="text-[10px]">Sail No.</span>
                            </th>
                            <th className={`px-1 py-1 text-center font-bold uppercase tracking-wider ${
                              darkMode ? 'text-slate-500' : 'text-slate-400'
                            }`}>
                              <span className="text-[10px]">Comment</span>
                            </th>
                            <th className={`px-1 py-1 text-center font-bold uppercase tracking-wider ${
                              darkMode ? 'text-slate-500' : 'text-slate-400'
                            }`}>
                              <span className="text-[10px]">Pts</span>
                            </th>
                          </React.Fragment>
                        ))}
                        <th className={`px-1 py-1 text-left font-bold uppercase tracking-wider ${completedRounds.length > 0 ? 'border-l ' : ''}${
                          darkMode ? 'text-blue-400 border-blue-500/30' : 'text-blue-600 border-blue-300'
                        }`}>
                          <span className="text-[10px]">Sail No.</span>
                        </th>
                        {!isVerified && (
                          <th className={`px-1 py-1 text-left font-bold uppercase tracking-wider ${
                            darkMode ? 'text-slate-400' : 'text-slate-500'
                          }`}><span className="text-[10px]">Skipper</span></th>
                        )}
                        <th className={`px-1 py-1 text-center font-bold uppercase tracking-wider ${
                          darkMode ? 'text-blue-400' : 'text-blue-600'
                        }`}><span className="text-[10px]">Comment</span></th>
                        <th className={`px-1 py-1 text-center font-bold uppercase tracking-wider ${
                          darkMode ? 'text-blue-400' : 'text-blue-600'
                        }`}><span className="text-[10px]">Pts</span></th>
                        {!isSeedingRound && promotionCount > 0 && (
                          <th className={`px-1 py-1 text-center font-bold uppercase tracking-wider ${
                            darkMode ? 'text-slate-400' : 'text-slate-500'
                          }`}><ArrowUp size={10} className="inline" /></th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {heatCells.map((cell, idx) => {
                        const position = idx + 1;
                        const isHistoricalRow = position > totalPositions;
                        const isPromotion = !isHistoricalRow && isPromotionPosition(position);
                        const skipperName = getSkipperName(heat, cell);
                        const matchedSkipper = getMatchedSkipper(heat, cell);
                        const hasValue = cell.sailNumber.trim() || cell.letterScore;
                        const rawPoints = cell.letterScore
                          ? (cell.customPoints !== undefined ? cell.customPoints : totalPositions + 1)
                          : (hasValue && cell.isValid ? position : null);
                        const points = rawPoints === -1 ? 'AVG' : rawPoints;

                        return (
                          <tr
                            key={`${heat}-${position}`}
                            className={`border-t transition-colors ${
                              isHistoricalRow
                                ? darkMode ? 'border-slate-700/20' : 'border-slate-100'
                                : isPromotion
                                  ? darkMode ? 'bg-green-900/25 border-green-800/30' : 'bg-green-100/70 border-green-200/50'
                                  : darkMode ? 'border-slate-700/30 hover:bg-slate-700/20' : 'border-slate-100 hover:bg-slate-50/80'
                            } ${cell.isDuplicate ? (darkMode ? 'bg-red-900/15' : 'bg-red-50/60') : ''}`}
                          >
                            <td className={`px-1.5 py-1 font-bold whitespace-nowrap ${
                              isPromotion
                                ? darkMode ? 'text-green-400' : 'text-green-700'
                                : darkMode ? 'text-slate-400' : 'text-slate-500'
                            }`}>{getOrdinal(position)}</td>

                            {completedRounds.map(r => {
                              const prevHeatResults = (r.results || []).filter(
                                res => res.heatDesignation === heat
                              );
                              const positioned = prevHeatResults
                                .filter(res => res.position !== null)
                                .sort((a, b) => (a.position || 0) - (b.position || 0));
                              const lettered = prevHeatResults
                                .filter(res => res.position === null && res.letterScore);
                              const ordered = [...positioned, ...lettered];
                              const displayResult = ordered[idx] || null;
                              const prevSkipper = displayResult ? skippers[displayResult.skipperIndex] : null;
                              const prevSailNo = prevSkipper ? String(prevSkipper.sailNumber || prevSkipper.sailNo || '') : '';
                              const prevHeatSize = r.heatAssignments.find(a => a.heatDesignation === heat)?.skipperIndices.length || 0;
                              const prevPtsRaw = displayResult
                                ? displayResult.letterScore
                                  ? (displayResult.customPoints !== undefined ? displayResult.customPoints : prevHeatSize + 1)
                                  : displayResult.position
                                : null;
                              const prevPts = prevPtsRaw === -1 ? -1 : prevPtsRaw;

                              return (
                                <React.Fragment key={`prev-r${r.round}-${position}`}>
                                  <td className={`px-1 py-1 text-center font-mono font-semibold border-l ${
                                    darkMode ? 'text-slate-400 border-slate-600/40' : 'text-slate-600 border-slate-200'
                                  }`}>
                                    {displayResult ? (
                                      displayResult.letterScore
                                        ? <span className="text-amber-500">{prevSailNo}</span>
                                        : prevSailNo
                                    ) : ''}
                                  </td>
                                  <td className={`px-1 py-1 text-center ${
                                    darkMode ? 'text-slate-500' : 'text-slate-400'
                                  }`}>
                                    {displayResult ? (
                                      displayResult.letterScore
                                        ? <span className="text-amber-500 font-semibold text-[11px]">{displayResult.letterScore}</span>
                                        : <span className={darkMode ? 'text-slate-500' : 'text-slate-400'}>OK</span>
                                    ) : ''}
                                  </td>
                                  <td className={`px-1 py-1 text-center font-mono font-semibold ${
                                    prevPts === -1
                                      ? 'text-green-500'
                                      : darkMode ? 'text-slate-400' : 'text-slate-600'
                                  }`}>
                                    {prevPts !== null ? (prevPts === -1 ? 'AVG' : prevPts) : ''}
                                  </td>
                                </React.Fragment>
                              );
                            })}

                            <td className={`px-1 py-0.5${completedRounds.length > 0 ? ' border-l' : ''} ${
                              darkMode ? 'border-blue-500/20' : 'border-blue-200'
                            }`}>
                              {isVerified || isHistoricalRow ? (
                                <span className={`font-mono font-bold ${
                                  cell.letterScore
                                    ? 'text-amber-500'
                                    : darkMode ? 'text-slate-200' : 'text-slate-800'
                                }`}>
                                  {cell.sailNumber || (isHistoricalRow ? '' : '-')}
                                </span>
                              ) : (
                                <div className="flex items-center gap-0.5">
                                  {cell.letterScore ? (
                                    <>
                                      <input
                                        ref={el => { inputRefs.current[`${heat}-${idx}`] = el; }}
                                        type="text"
                                        value={cell.sailNumber}
                                        onChange={e => handleCellChange(heat, position, e.target.value)}
                                        onKeyDown={e => handleKeyDown(e, heat, position, totalPositions)}
                                        className={`w-12 h-7 px-1 rounded text-xs font-mono font-bold border text-center ${
                                          darkMode
                                            ? 'bg-slate-700/60 border-slate-600/70 text-white focus:border-blue-500'
                                            : 'bg-white/70 border-slate-300 text-slate-900 focus:border-blue-500'
                                        } focus:outline-none focus:ring-1 focus:ring-blue-500/20`}
                                      />
                                      <button
                                        onClick={() => handleLetterScore(heat, position)}
                                        className={`ml-1 h-7 rounded-full px-2 text-[9px] font-bold flex-shrink-0 flex items-center justify-center ${
                                          darkMode
                                            ? 'bg-amber-600/30 text-amber-400 border border-amber-500/30'
                                            : 'bg-amber-100 text-amber-700 border border-amber-300'
                                        }`}
                                        title={`${cell.letterScore}${cell.customPoints !== undefined ? ` (${cell.customPoints === -1 ? 'AVG' : cell.customPoints})` : ''}`}
                                      >
                                        {cell.letterScore?.slice(0, 3)}
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <input
                                        ref={el => { inputRefs.current[`${heat}-${idx}`] = el; }}
                                        type="text"
                                        value={cell.sailNumber}
                                        onChange={e => handleCellChange(heat, position, e.target.value)}
                                        onKeyDown={e => handleKeyDown(e, heat, position, totalPositions)}
                                        className={`w-12 h-7 px-1 rounded text-xs font-mono font-bold border text-center ${
                                          !cell.isValid && cell.sailNumber.trim()
                                            ? 'border-red-500 bg-red-50/80 text-red-700 dark:bg-red-900/20 dark:text-red-400 dark:border-red-500'
                                            : cell.isDuplicate
                                              ? 'border-amber-500 bg-amber-50/80 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-500'
                                              : darkMode
                                                ? 'bg-slate-700/60 border-slate-600/70 text-white focus:border-blue-500'
                                                : 'bg-white/70 border-slate-300 text-slate-900 focus:border-blue-500'
                                        } focus:outline-none focus:ring-1 focus:ring-blue-500/20`}
                                      />
                                      <button
                                        onClick={() => handleLetterScore(heat, position)}
                                        className={`ml-1 h-7 w-7 rounded-full flex-shrink-0 flex items-center justify-center transition-colors ${
                                          darkMode
                                            ? 'bg-slate-700/60 text-slate-400 hover:bg-slate-600 hover:text-white border border-slate-600/70'
                                            : 'bg-slate-100/70 text-slate-400 hover:bg-slate-200 hover:text-slate-700 border border-slate-200'
                                        }`}
                                        title="Assign letter score (DNS, DNF, DSQ, etc.)"
                                      >
                                        <Type size={12} />
                                      </button>
                                    </>
                                  )}
                                  {!cell.isValid && cell.sailNumber.trim() && !cell.letterScore && (
                                    <AlertCircle size={12} className="text-red-500 flex-shrink-0" />
                                  )}
                                </div>
                              )}
                            </td>

                            {!isVerified && (
                              <td className={`px-1 py-1 truncate w-[140px] max-w-[140px] ${
                                hasValue && skipperName
                                  ? darkMode ? 'text-slate-200' : 'text-slate-800'
                                  : darkMode ? 'text-slate-600' : 'text-slate-300'
                              }`}>
                                {hasValue && skipperName ? (
                                  <div className="flex items-center gap-1">
                                    {currentEvent?.show_flag && matchedSkipper?.country_code && (
                                      <span className="text-xs leading-none">{(() => {
                                        try {
                                          const { getCountryFlag } = require('../utils/countryFlags');
                                          return getCountryFlag(matchedSkipper.country_code);
                                        } catch { return ''; }
                                      })()}</span>
                                    )}
                                    <span className="font-medium truncate">{skipperName}</span>
                                  </div>
                                ) : hasValue ? (
                                  <span className="text-red-400 text-[10px]">Unknown</span>
                                ) : (
                                  <span className="italic text-[10px]">---</span>
                                )}
                              </td>
                            )}

                            <td className={`px-1 py-1 text-center ${
                              darkMode ? 'text-slate-400' : 'text-slate-500'
                            }`}>
                              {hasValue && cell.isValid ? (
                                cell.letterScore
                                  ? <span className="text-amber-500 font-semibold text-[11px]">{cell.letterScore}</span>
                                  : <span className={darkMode ? 'text-slate-500' : 'text-slate-400'}>OK</span>
                              ) : ''}
                            </td>

                            <td className={`px-1 py-1 text-center font-mono font-bold ${
                              points === 'AVG'
                                ? 'text-green-500'
                                : darkMode ? 'text-slate-200' : 'text-slate-800'
                            }`}>
                              {points !== null ? points : ''}
                            </td>

                            {!isSeedingRound && promotionCount > 0 && (
                              <td className="px-1 py-0.5 text-center">
                                {isPromotion && hasValue && cell.isValid && (
                                  <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-[9px] font-bold ${
                                    darkMode ? 'bg-green-600/30 text-green-400' : 'bg-green-100 text-green-700'
                                  }`}>UP</span>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {isCurrent && !isVerified && (() => {
                  const heatSkippersList = isMultiHeatMode ? getHeatSkippers(heat) : skippers;
                  if (heatSkippersList.length === 0) return null;
                  const activeCells = cells[heat] || [];
                  return (
                    <div className={`px-3 py-2 border-t ${
                      darkMode ? 'bg-slate-800/80 border-slate-700/50' : 'bg-slate-50/80 border-slate-200'
                    }`}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`text-xs font-semibold ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                          Heat {heat} Sail Numbers
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {heatSkippersList.map((s, sIdx) => {
                          const sailNo = String(s.sailNumber || s.sailNo);
                          const sailLower = sailNo.trim().toLowerCase();
                          const isUsed = activeCells.some(c => c.sailNumber.trim().toLowerCase() === sailLower);
                          return (
                            <div
                              key={sIdx}
                              className={`px-2.5 py-1 rounded text-sm font-bold transition-colors cursor-default ${
                                isUsed
                                  ? darkMode
                                    ? 'bg-green-800/30 text-green-400 border border-green-700/30 line-through opacity-50'
                                    : 'bg-green-100 text-green-600 border border-green-200 line-through opacity-50'
                                  : darkMode
                                    ? 'bg-slate-700 text-slate-200 border border-slate-600'
                                    : 'bg-white text-slate-800 border border-slate-300'
                              }`}
                              title={s.name}
                            >
                              {sailNo}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {(() => {
                  if (!isCurrent || isVerified) return null;
                  const heatObs = getObserversForHeat(heat);
                  if (heatObs.length === 0) return null;
                  return (
                    <div className={`px-3 py-1.5 border-t ${
                      darkMode ? 'bg-cyan-900/10 border-slate-700/30' : 'bg-cyan-50/50 border-slate-200/50'
                    }`}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <Eye size={12} className={darkMode ? 'text-cyan-400' : 'text-cyan-600'} />
                        <span className={`text-[10px] font-semibold uppercase tracking-wider ${
                          darkMode ? 'text-cyan-400/80' : 'text-cyan-700'
                        }`}>Observers</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {heatObs.map((obs: any, i: number) => (
                          <span key={i} className={`px-2 py-0.5 rounded text-xs font-medium ${
                            darkMode ? 'bg-cyan-800/20 text-cyan-300 border border-cyan-700/30' : 'bg-cyan-100 text-cyan-800 border border-cyan-200'
                          }`}>
                            {obs.skipper_sail_number ? `${obs.skipper_sail_number} - ` : ''}{obs.skipper_name}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {!isVerified && heatReady && isCurrent && (
                  <div
                    ref={verifyButtonRef}
                    className={`px-3 py-2 border-t ${
                      darkMode ? 'bg-slate-800 border-slate-700/40' : 'bg-white border-slate-200'
                    }`}
                  >
                    <button
                      onClick={() => handleConfirmHeat(heat)}
                      className="w-full py-2.5 rounded-lg text-white font-bold text-sm bg-green-600 hover:bg-green-700 transition-colors flex items-center justify-center gap-2 shadow-md active:scale-[0.98]"
                    >
                      <Check size={18} />
                      Verify Heat {heat} Results
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {isHeatScoring && isSeedingRound && (
        <div className={`px-4 py-1.5 border-t flex-shrink-0 ${
          darkMode ? 'bg-blue-900/10 border-blue-800/20' : 'bg-blue-50/50 border-blue-200/50'
        }`}>
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded ${darkMode ? 'bg-blue-600' : 'bg-blue-500'}`} />
            <span className={`text-xs font-medium ${darkMode ? 'text-blue-400' : 'text-blue-700'}`}>
              Seeding round - results determine heat assignments for Round 2
            </span>
          </div>
        </div>
      )}

      {isHeatScoring && !isSeedingRound && promotionCount > 0 && (
        <div className={`px-4 py-1.5 border-t flex-shrink-0 ${
          darkMode ? 'bg-green-900/10 border-green-800/20' : 'bg-green-50/50 border-green-200/50'
        }`}>
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded ${darkMode ? 'bg-green-600' : 'bg-green-500'}`} />
            <span className={`text-xs font-medium ${darkMode ? 'text-green-400' : 'text-green-700'}`}>
              Top {promotionCount} positions promote to next heat
            </span>
          </div>
        </div>
      )}


      {isHeatScoring && heatManagement && (
        <button
          onClick={() => setShowOverallResults(true)}
          className={`fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-colors ${
            darkMode
              ? 'bg-gradient-to-br from-cyan-600 to-blue-700 text-white hover:from-cyan-500 hover:to-blue-600'
              : 'bg-gradient-to-br from-blue-600 to-cyan-600 text-white hover:from-blue-500 hover:to-cyan-500'
          }`}
          title="Current Rankings"
        >
          <Trophy size={24} />
        </button>
      )}

      {isHeatScoring && heatManagement && (
        <HeatOverallResultsModal
          isOpen={showOverallResults}
          onClose={() => setShowOverallResults(false)}
          skippers={skippers}
          heatManagement={heatManagement}
          dropRules={[4, 8, 16, 24, 32, 40]}
          darkMode={darkMode}
        />
      )}

      {showLetterScoreModal && (() => {
        const lsHeat = letterScoreHeat || 'A' as HeatDesignation;
        const lsPos = letterScorePosition || 1;
        const lsCells = cells[lsHeat] || [];
        const lsCell = lsCells[lsPos - 1];
        const lsSkipperName = lsCell ? getSkipperName(lsHeat, lsCell) || `Position ${lsPos}` : `Position ${lsPos}`;
        const lsHeatSkips = isMultiHeatMode ? getHeatSkippers(lsHeat) : skippers;
        const lsHeatResults = getHeatRaceResults(lsHeat);
        const prevResults = lsCell?.skipperIndex !== null && lsCell?.skipperIndex !== undefined
          ? lsHeatResults
              .filter(r => r.race !== currentRound && r.skipperIndex === lsCell.skipperIndex)
              .map(r => ({
                position: r.position,
                letterScore: r.letterScore,
                customPoints: r.customPoints,
                points: r.letterScore
                  ? (r.customPoints !== undefined && r.customPoints !== -1 ? r.customPoints : lsHeatSkips.length + 1)
                  : (r.position || lsHeatSkips.length + 1)
              }))
          : [];
        return (
          <LetterScoreSelector
            isOpen={showLetterScoreModal}
            onClose={() => {
              setShowLetterScoreModal(false);
              setLetterScorePosition(null);
              setLetterScoreHeat(null);
            }}
            onSelect={(score, customPoints) => {
              if (score === null) {
                if (letterScorePosition !== null && letterScoreHeat) {
                  const idx = letterScorePosition - 1;
                  const heat = letterScoreHeat;
                  const heatCells = cells[heat] || [];
                  const updated = [...heatCells];
                  updated[idx] = { ...updated[idx], letterScore: null, customPoints: undefined };
                  const heatSkips = isMultiHeatMode ? getHeatSkippers(heat) : skippers;
                  const validated = validateCells(updated, heatSkips);
                  setCells(prev => ({ ...prev, [heat]: validated }));
                }
                setShowLetterScoreModal(false);
                setLetterScorePosition(null);
                setLetterScoreHeat(null);
              } else {
                applyLetterScore(score as LetterScore, customPoints);
              }
            }}
            darkMode={darkMode}
            skipperName={lsSkipperName}
            raceNumber={currentRound}
            skipperPreviousResults={prevResults}
          />
        );
      })()}
    </div>
  );
};
