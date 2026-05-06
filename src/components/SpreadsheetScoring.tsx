import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Skipper, LetterScore } from '../types';
import { RaceEvent } from '../types/race';
import { HeatManagement, HeatDesignation, HeatAssignment, getHeatDisplayLabel } from '../types/heat';
import { getLetterScoreDisplayCode } from '../types/letterScores';
import { Check, CircleAlert as AlertCircle, ArrowUp, Trophy, Eye, Type, ChevronLeft, ChevronRight, Timer, Flag, Pencil, Video, X } from 'lucide-react';
import { LetterScoreSelector } from './LetterScoreSelector';
import { HeatOverallResultsModal } from './HeatOverallResultsModal';
import { StartBoxModal } from './start-box/StartBoxModal';
import { RaceElapsedTimer } from './start-box/RaceElapsedTimer';
import { LiveStatusControl } from './LiveStatusControl';
import { LivestreamControlPanel } from './livestream/LivestreamControlPanel';
import { getCountryFlag, getIOCCode } from '../utils/countryFlags';
import { motion, AnimatePresence } from 'framer-motion';

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
  onShowOverallResults?: () => void;
  onUpdatePreviousRoundResults?: (round: number, heat: HeatDesignation, results: { skipperIndex: number; position: number | null; letterScore?: LetterScore; customPoints?: number }[]) => void;
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
  parentVerifiedHeats,
  onShowOverallResults,
  onUpdatePreviousRoundResults,
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
  const [showStartBoxModal, setShowStartBoxModal] = useState(false);
  const [raceTimerRunning, setRaceTimerRunning] = useState(false);
  const [isLivestreamPanelOpen, setIsLivestreamPanelOpen] = useState(false);
  const [singleFleetRace, setSingleFleetRace] = useState(initialRace);
  const [editingRound, setEditingRound] = useState<number | null>(null);

  useEffect(() => {
    return () => {
      if (autoCompleteTimerRef.current) clearTimeout(autoCompleteTimerRef.current);
    };
  }, []);

  const isMultiHeatMode = !!(heatManagement && propAvailableHeats && heatSkipperIndicesMap && allHeatRaceResults);
  const isSHRS = heatManagement?.configuration?.scoringSystem === 'shrs';
  const isHMS = heatManagement?.configuration?.scoringSystem === 'hms';

  useEffect(() => {
    if (!isMultiHeatMode) {
      setSingleFleetRace(initialRace);
    }
  }, [initialRace, isMultiHeatMode]);

  const availableHeats = useMemo(() => {
    if (isMultiHeatMode && propAvailableHeats) {
      if (isHMS) {
        return [...propAvailableHeats].reverse();
      }
      return [...propAvailableHeats];
    }
    return [];
  }, [isMultiHeatMode, propAvailableHeats, isHMS]);

  const actualCurrentRound = heatManagement?.currentRound || initialRace;
  const effectiveEditingRound = editingRound ?? actualCurrentRound;
  const isEditingPreviousRound = editingRound !== null && editingRound !== actualCurrentRound;
  const currentRound = effectiveEditingRound;

  const verifiedHeats = useMemo(() => {
    const merged = new Set(localVerifiedHeats);
    if (parentVerifiedHeats) {
      for (const key of parentVerifiedHeats) {
        const [roundStr, heat] = key.split('-');
        if (Number(roundStr) === effectiveEditingRound && heat) {
          merged.add(heat as HeatDesignation);
        }
      }
    }
    return merged;
  }, [localVerifiedHeats, parentVerifiedHeats, effectiveEditingRound]);

  const completedRounds = useMemo(() => {
    if (!heatManagement || !isMultiHeatMode) return [];
    return heatManagement.rounds.filter(r => {
      if (r.round === effectiveEditingRound) return false;
      if (r.round < actualCurrentRound && r.completed) return true;
      if (isEditingPreviousRound && r.round === actualCurrentRound) return true;
      return false;
    });
  }, [heatManagement, isMultiHeatMode, effectiveEditingRound, actualCurrentRound, isEditingPreviousRound]);

  const orderedColumns = useMemo(() => {
    if (!isMultiHeatMode) return [];
    const cols: { round: number; type: 'completed' | 'editing'; data?: any }[] = [];
    for (const r of completedRounds) {
      cols.push({ round: r.round, type: 'completed', data: r });
    }
    cols.push({ round: effectiveEditingRound, type: 'editing' });
    cols.sort((a, b) => a.round - b.round);
    return cols;
  }, [isMultiHeatMode, completedRounds, effectiveEditingRound]);

  const singleFleetCompletedRaces = useMemo(() => {
    if (isMultiHeatMode) return [];
    const completed: number[] = [];
    for (let r = 1; r < singleFleetRace; r++) {
      const raceHasResults = raceResults.some(res => res.race === r && (res.position !== null || res.letterScore));
      if (raceHasResults) completed.push(r);
    }
    return completed;
  }, [isMultiHeatMode, singleFleetRace, raceResults]);

  const promotionCount = useMemo(() => {
    if (!isHeatScoring || !heatManagement || isSHRS) return 0;
    return heatManagement.configuration?.promotionCount || 0;
  }, [isHeatScoring, heatManagement, isSHRS]);

  const getObserversForHeat = useCallback((heat: HeatDesignation): any[] => {
    return allHeatObserversMap[heat] || [];
  }, [allHeatObserversMap]);

  const editingRoundData = useMemo(() => {
    if (!isEditingPreviousRound || !heatManagement) return null;
    return heatManagement.rounds.find(r => r.round === editingRound) || null;
  }, [isEditingPreviousRound, heatManagement, editingRound]);

  const getHeatSkippers = useCallback((heat: HeatDesignation): Skipper[] => {
    if (isMultiHeatMode && editingRoundData) {
      const assignment = editingRoundData.heatAssignments?.find(
        (a: any) => a.heatDesignation === heat
      );
      const indices = assignment?.skipperIndices || [];
      return indices.map((idx: number) => skippers[idx]).filter(Boolean);
    }
    if (isMultiHeatMode && heatSkipperIndicesMap) {
      const indices = heatSkipperIndicesMap[heat] || [];
      return indices.map(idx => skippers[idx]).filter(Boolean);
    }
    return skippers;
  }, [isMultiHeatMode, heatSkipperIndicesMap, skippers, editingRoundData]);

  const getGlobalSkipperIndex = useCallback((heat: HeatDesignation, localIndex: number): number => {
    if (editingRoundData) {
      const assignment = editingRoundData.heatAssignments?.find(
        (a: any) => a.heatDesignation === heat
      );
      const indices = assignment?.skipperIndices || [];
      return indices[localIndex] ?? -1;
    }
    if (isMultiHeatMode && heatSkipperIndicesMap) {
      const indices = heatSkipperIndicesMap[heat] || [];
      return indices[localIndex] ?? -1;
    }
    return localIndex;
  }, [isMultiHeatMode, heatSkipperIndicesMap, editingRoundData]);

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

  const autoScoringHeat = useMemo(() => {
    if (!isMultiHeatMode) return 'A' as HeatDesignation;
    if (isHMS) {
      const reversed = [...availableHeats].reverse();
      for (const heat of reversed) {
        if (!verifiedHeats.has(heat)) return heat;
      }
      return reversed[reversed.length - 1] || 'A' as HeatDesignation;
    }
    for (const heat of availableHeats) {
      if (!verifiedHeats.has(heat)) return heat;
    }
    return availableHeats[0] || 'A' as HeatDesignation;
  }, [isMultiHeatMode, availableHeats, verifiedHeats, isHMS]);

  const currentScoringHeat = selectedHeat || autoScoringHeat;

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

  const prevActualRoundRef = useRef<number>(actualCurrentRound);
  useEffect(() => {
    if (prevActualRoundRef.current !== actualCurrentRound) {
      setEditingRound(null);
      prevActualRoundRef.current = actualCurrentRound;
    }
  }, [actualCurrentRound]);

  useEffect(() => {
    if (prevRoundRef.current !== null && prevRoundRef.current !== currentRound) {
      verifiedCellsRef.current = {} as any;
    }
    prevRoundRef.current = currentRound;

    if (!isMultiHeatMode) {
      const racingSkips = skippers;
      const totalPos = racingSkips.length;
      const existingResults = raceResults.filter(r => r.race === initialRace);

      const positionedResults = existingResults
        .filter(r => r.position !== null && r.position !== undefined)
        .sort((a, b) => (a.position || 0) - (b.position || 0));
      const letterScoreResults = existingResults
        .filter(r => (r.position === null || r.position === undefined) && r.letterScore);

      const newCells: CellEntry[] = [];
      for (const result of positionedResults) {
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
      }
      for (const result of letterScoreResults) {
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
      }
      while (newCells.length < totalPos) {
        newCells.push({ sailNumber: '', skipperIndex: null, letterScore: null, isValid: true, isDuplicate: false });
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

      let existingResults: any[];
      if (editingRoundData) {
        const roundResults = (editingRoundData.results || []).filter(
          (res: any) => res.heatDesignation === heat
        );
        const assignment = editingRoundData.heatAssignments?.find(
          (a: any) => a.heatDesignation === heat
        );
        const assignedIndices = assignment?.skipperIndices || [];
        totalPos = Math.max(totalPos, assignedIndices.length);
        existingResults = roundResults.map((res: any) => ({
          ...res,
          race: currentRound,
          skipperIndex: assignedIndices.indexOf(res.skipperIndex)
        })).filter((res: any) => res.skipperIndex >= 0);
      } else {
        const heatResults = getHeatRaceResults(heat);
        existingResults = heatResults.filter(r => r.race === currentRound);
      }

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

      const positionedResults = existingResults
        .filter(r => r.position !== null && r.position !== undefined)
        .sort((a, b) => (a.position || 0) - (b.position || 0));
      const letterScoreResults = existingResults
        .filter(r => (r.position === null || r.position === undefined) && r.letterScore);

      const newCells: CellEntry[] = [];
      for (const result of positionedResults) {
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
      }
      for (const result of letterScoreResults) {
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
      }
      while (newCells.length < totalPos) {
        newCells.push({ sailNumber: '', skipperIndex: null, letterScore: null, isValid: true, isDuplicate: false });
      }
      newAllCells[heat] = newCells;

      const filledCount = newCells.filter(c => c.sailNumber.trim() || c.letterScore).length;
      if (filledCount >= totalPos && totalPos > 0 && existingResults.length === 0) {
        alreadyVerified.add(heat);
      }
    }

    setCells(newAllCells as any);
    setLocalVerifiedHeats(alreadyVerified);
  }, [isMultiHeatMode, availableHeats, currentRound, skippers, initialRace, raceResults, heatResultsKey, heatAssignmentKey, completedRounds, editingRoundData]);

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
            for (let next = position; next < currentSkipperCount; next++) {
              const nextRef = inputRefs.current[`${heat}-${next}`];
              if (nextRef) {
                nextRef.focus();
                nextRef.select();
                break;
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

    const firstEmptyIdx = reordered.findIndex(c => !c.letterScore && !c.sailNumber.trim() && c.skipperIndex === null);
    const focusHeat = heat;
    setShowLetterScoreModal(false);
    setLetterScorePosition(null);
    setLetterScoreHeat(null);

    if (firstEmptyIdx >= 0) {
      setTimeout(() => {
        const ref = inputRefs.current[`${focusHeat}-${firstEmptyIdx}`];
        if (ref) {
          ref.focus();
          ref.select();
        }
      }, 50);
    }
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
      for (let next = position; next < totalPositions; next++) {
        const ref = inputRefs.current[`${heat}-${next}`];
        if (ref) {
          ref.focus();
          ref.select();
          return;
        }
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      for (let next = position; next < totalPositions; next++) {
        const ref = inputRefs.current[`${heat}-${next}`];
        if (ref) { ref.focus(); return; }
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      for (let prev = position - 2; prev >= 0; prev--) {
        const ref = inputRefs.current[`${heat}-${prev}`];
        if (ref) { ref.focus(); return; }
      }
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

    if (isEditingPreviousRound && onUpdatePreviousRoundResults) {
      const globalResults: { skipperIndex: number; position: number | null; letterScore?: LetterScore; customPoints?: number }[] = [];
      let posCounter = 1;
      heatCells.forEach((cell) => {
        if (cell.skipperIndex !== null && (cell.sailNumber.trim() || cell.letterScore)) {
          const globalIdx = getGlobalSkipperIndex(heat, cell.skipperIndex);
          if (globalIdx >= 0) {
            globalResults.push({
              skipperIndex: globalIdx,
              position: cell.letterScore ? null : posCounter++,
              letterScore: cell.letterScore || undefined,
              customPoints: cell.customPoints
            });
          }
        }
      });
      onUpdatePreviousRoundResults(editingRound!, heat, globalResults);
    } else if (isMultiHeatMode && onUpdateHeatResults) {
      const heatResults = getHeatRaceResults(heat);
      const newResults = heatResults.filter(r => r.race !== currentRound);
      let posCounter = 1;
      heatCells.forEach((cell) => {
        if (cell.skipperIndex !== null && (cell.sailNumber.trim() || cell.letterScore)) {
          newResults.push({
            race: currentRound,
            skipperIndex: cell.skipperIndex,
            position: cell.letterScore ? null : posCounter++,
            letterScore: cell.letterScore || undefined,
            customPoints: cell.customPoints
          });
        }
      });
      onUpdateHeatResults(heat, newResults);
    } else {
      const newResults = raceResults.filter(r => r.race !== initialRace);
      let posCounter = 1;
      heatCells.forEach((cell) => {
        if (cell.skipperIndex !== null && (cell.sailNumber.trim() || cell.letterScore)) {
          newResults.push({
            race: initialRace,
            skipperIndex: cell.skipperIndex,
            position: cell.letterScore ? null : posCounter++,
            letterScore: cell.letterScore || undefined,
            customPoints: cell.customPoints
          });
        }
      });
      updateRaceResults(newResults);
    }

    setLocalVerifiedHeats(prev => new Set(prev).add(heat));
    verifiedCellsRef.current[heat] = cells[heat] ? [...cells[heat]] : [];

    if (!isEditingPreviousRound) {
      if (onConfirmHeatResults) {
        onConfirmHeatResults(heat);
      } else if (onConfirmResults) {
        onConfirmResults();
      }
    }
  };

  const getSkipperName = (heat: HeatDesignation, cell: CellEntry): string | null => {
    if (cell.skipperIndex === null) return null;
    const heatSkips = isMultiHeatMode ? getHeatSkippers(heat) : skippers;
    return heatSkips[cell.skipperIndex]?.name || null;
  };

  const isPromotionPosition = (pos: number): boolean => {
    return isHeatScoring && !isSeedingRound && promotionCount > 0 && pos <= promotionCount;
  };

  const heatsToRender = isMultiHeatMode ? availableHeats : ['A' as HeatDesignation];

  const navigateSingleFleetRace = (direction: 'prev' | 'next') => {
    const newRace = direction === 'prev' ? singleFleetRace - 1 : singleFleetRace + 1;
    if (newRace >= 1 && newRace <= numRaces) {
      setSingleFleetRace(newRace);
      onRaceChange?.(newRace);
    }
  };

  if (!isMultiHeatMode) {
    const sfCells = cells['A' as HeatDesignation] || [];
    const sfTotalPositions = skippers.length;
    const sfStats = getHeatCellStats('A' as HeatDesignation);
    const sfIsVerified = verifiedHeats.has('A' as HeatDesignation);
    const sfReady = isHeatReady('A' as HeatDesignation);
    const sfHeat = 'A' as HeatDesignation;

    return (
      <div className={`flex flex-col rounded-b-xl ${darkMode ? 'bg-slate-900' : 'bg-slate-50'}`}>
        <div className={`border-b px-4 py-2.5 flex items-center justify-between flex-shrink-0 ${
          darkMode ? 'bg-slate-800/50 border-slate-700/50' : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowStartBoxModal(true)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all active:scale-95 ${
                raceTimerRunning
                  ? darkMode
                    ? 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  : darkMode
                    ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/25'
                    : 'bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100'
              }`}
            >
              <Timer size={16} />
              <span className="hidden sm:inline">StartBox</span>
            </button>
            {currentEvent?.id && (currentEvent?.enableLiveTracking || currentEvent?.enableLiveStream) && !currentEvent?.completed && (
              <LiveStatusControl eventId={currentEvent.id} darkMode={darkMode} />
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => navigateSingleFleetRace('prev')}
              disabled={singleFleetRace <= 1}
              className={`p-1.5 rounded-lg ${singleFleetRace <= 1 ? 'opacity-30 cursor-not-allowed' : darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}
            >
              <ChevronLeft size={20} />
            </button>
            <span className="text-lg font-bold">Race {singleFleetRace}</span>
            <button
              onClick={() => navigateSingleFleetRace('next')}
              disabled={singleFleetRace >= numRaces}
              className={`p-1.5 rounded-lg ${singleFleetRace >= numRaces ? 'opacity-30 cursor-not-allowed' : darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}
            >
              <ChevronRight size={20} />
            </button>
          </div>

          <div className="w-[140px] flex items-center justify-end">
            {raceTimerRunning && (
              <RaceElapsedTimer
                isRunning={raceTimerRunning}
                onStop={() => setRaceTimerRunning(false)}
                darkMode={darkMode}
              />
            )}
            {!raceTimerRunning && (
              <div className="flex items-center gap-1.5">
                <span className={`text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  {sfStats.filledCount}/{sfStats.totalPositions}
                </span>
                {sfIsVerified && <Check size={14} className="text-green-500" />}
              </div>
            )}
          </div>
        </div>

        <div className={`${isFullscreen ? 'max-h-[calc(100vh-120px)]' : 'max-h-[70vh]'} overflow-auto`} ref={scrollContainerRef}>
          <div className="p-2 pb-4">
            <div className={`rounded-lg border overflow-hidden ${
              darkMode ? 'bg-slate-800/50 border-slate-700/50' : 'bg-white border-slate-200'
            }`}>
              <div className={`flex items-center justify-between px-3 py-1.5 ${
                darkMode ? 'bg-blue-600/80' : 'bg-blue-600'
              } text-white`}>
                <div className="flex items-center gap-2">
                  <Flag size={14} />
                  <span className="font-bold text-sm">Race {singleFleetRace}</span>
                  <span className="text-xs opacity-80">{sfTotalPositions} skippers</span>
                </div>
                <div className="flex items-center gap-2">
                  {sfIsVerified ? (
                    <span className="flex items-center gap-1 text-xs">
                      <Check size={14} />
                      Verified
                    </span>
                  ) : (
                    <span className="text-xs opacity-80">
                      {sfStats.filledCount}/{sfStats.totalPositions}
                    </span>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="text-[13px] border-collapse">
                  <colgroup>
                    <col style={{ width: '40px' }} />
                    {singleFleetCompletedRaces.map(r => (
                      <React.Fragment key={`tcg-sf-${r}`}>
                        <col style={{ width: '48px' }} />
                        <col style={{ width: '40px' }} />
                        <col style={{ width: '32px' }} />
                      </React.Fragment>
                    ))}
                    <col style={{ width: '56px' }} />
                    <col style={{ width: '48px' }} />
                    <col style={{ width: '32px' }} />
                  </colgroup>
                  <thead>
                    <tr className={darkMode ? 'bg-slate-700' : 'bg-slate-200'}>
                      <th className="px-1.5 py-1.5" />
                      {singleFleetCompletedRaces.map(r => (
                        <th
                          key={`sf-race-lbl-${r}`}
                          colSpan={3}
                          className={`text-center font-bold text-[11px] uppercase tracking-widest py-1.5 border-l ${
                            darkMode ? 'text-slate-300 border-slate-500/50' : 'text-slate-500 border-slate-400/50'
                          }`}
                        >
                          Race {r}
                        </th>
                      ))}
                      <th
                        colSpan={3}
                        className={`text-center font-bold text-[11px] uppercase tracking-widest py-1.5 ${singleFleetCompletedRaces.length > 0 ? 'border-l ' : ''}${
                          darkMode ? 'text-blue-300 border-blue-500/30' : 'text-blue-700 border-blue-300'
                        }`}
                      >
                        Race {singleFleetRace}
                      </th>
                    </tr>
                    <tr className={darkMode ? 'bg-slate-700/40' : 'bg-slate-100/60'}>
                      <th className="px-1.5 py-1" />
                      {singleFleetCompletedRaces.map(r => (
                        <React.Fragment key={`sf-hdr-r${r}`}>
                          <th className={`px-1 py-1 text-center font-bold uppercase tracking-wider border-l ${
                            darkMode ? 'text-slate-500 border-slate-600/40' : 'text-slate-500 border-slate-200'
                          }`}>
                            <span className="text-[10px]">Sail No.</span>
                          </th>
                          <th className={`px-1 py-1 text-center font-bold uppercase tracking-wider ${
                            darkMode ? 'text-slate-500' : 'text-slate-500'
                          }`}>
                            <span className="text-[10px]">Comment</span>
                          </th>
                          <th className={`px-1 py-1 text-center font-bold uppercase tracking-wider ${
                            darkMode ? 'text-slate-500' : 'text-slate-500'
                          }`}>
                            <span className="text-[10px]">Pts</span>
                          </th>
                        </React.Fragment>
                      ))}
                      <th className={`px-1 py-1 text-center font-bold uppercase tracking-wider ${singleFleetCompletedRaces.length > 0 ? 'border-l ' : ''}${
                        darkMode ? 'text-blue-400 border-blue-500/30' : 'text-blue-600 border-blue-300'
                      }`}>
                        <span className="text-[10px]">Sail No.</span>
                      </th>
                      <th className={`px-1 py-1 text-center font-bold uppercase tracking-wider ${
                        darkMode ? 'text-blue-400' : 'text-blue-600'
                      }`}><span className="text-[10px]">Comment</span></th>
                      <th className={`px-1 py-1 text-center font-bold uppercase tracking-wider ${
                        darkMode ? 'text-blue-400' : 'text-blue-600'
                      }`}><span className="text-[10px]">Pts</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sfCells.map((cell, idx) => {
                      const position = idx + 1;
                      const hasValue = cell.sailNumber.trim() || cell.letterScore;
                      const rawPoints = cell.letterScore
                        ? (cell.customPoints !== undefined ? cell.customPoints : sfTotalPositions + 1)
                        : (hasValue && cell.isValid ? position : null);
                      const points = rawPoints === -1 ? 'AVG' : rawPoints;

                      return (
                        <tr
                          key={`sf-${position}`}
                          className={`border-t transition-colors ${
                            darkMode ? 'border-slate-700/30 hover:bg-slate-700/20' : 'border-slate-100 hover:bg-slate-50/80'
                          } ${cell.isDuplicate ? (darkMode ? 'bg-red-900/15' : 'bg-red-50/60') : ''}`}
                        >
                          <td className={`px-1.5 py-1 font-bold whitespace-nowrap ${
                            darkMode ? 'text-slate-400' : 'text-slate-500'
                          }`}>{getOrdinal(position)}</td>

                          {singleFleetCompletedRaces.map(r => {
                            const raceResultsForRace = raceResults
                              .filter(res => res.race === r)
                              .sort((a, b) => {
                                if (a.position === null && !a.letterScore) return 1;
                                if (b.position === null && !b.letterScore) return -1;
                                if (a.letterScore && !b.letterScore) return 1;
                                if (!a.letterScore && b.letterScore) return -1;
                                if (a.letterScore && b.letterScore) return 0;
                                if (a.position === null) return 1;
                                if (b.position === null) return -1;
                                return a.position - b.position;
                              });
                            const displayResult = raceResultsForRace[idx] || null;
                            const prevSkipper = displayResult ? skippers[displayResult.skipperIndex] : null;
                            const prevSailNo = prevSkipper ? String(prevSkipper.sailNumber || prevSkipper.sailNo || '') : '';
                            const raceStarters = raceResultsForRace.length;
                            const prevPtsRaw = displayResult
                              ? displayResult.letterScore
                                ? (displayResult.customPoints !== undefined ? displayResult.customPoints : raceStarters + 1)
                                : displayResult.position
                              : null;
                            const prevPts = prevPtsRaw === -1 ? -1 : prevPtsRaw;

                            return (
                              <React.Fragment key={`sf-prev-r${r}-${position}`}>
                                <td className={`px-1 py-1 font-mono font-semibold border-l ${
                                  (currentEvent?.show_flag || currentEvent?.show_country) ? 'text-left' : 'text-center'
                                } ${darkMode ? 'text-slate-400 border-slate-600/40' : 'text-slate-600 border-slate-200'}`}>
                                  {displayResult ? (
                                    <span className={`flex items-center gap-1 ${(currentEvent?.show_flag || currentEvent?.show_country) ? '' : 'justify-center'}`}>
                                      {(currentEvent?.show_flag || currentEvent?.show_country) && prevSkipper?.country_code && (
                                        <span className={`text-[9px] font-medium shrink-0 w-7 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                          {currentEvent?.show_flag && getCountryFlag(prevSkipper.country_code)}
                                          {currentEvent?.show_country && getIOCCode(prevSkipper.country_code)}
                                        </span>
                                      )}
                                      <span>{prevSailNo}</span>
                                    </span>
                                  ) : ''}
                                </td>
                                <td className={`px-1 py-1 text-center ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                  {displayResult ? (
                                    displayResult.letterScore
                                      ? <span className={`font-semibold text-[11px] ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>{getLetterScoreDisplayCode(displayResult.letterScore, displayResult.customPoints)}</span>
                                      : <span className={darkMode ? 'text-slate-500' : 'text-slate-500'}>OK</span>
                                  ) : ''}
                                </td>
                                <td className={`px-1 py-1 text-center font-mono font-semibold ${
                                  prevPts === -1 ? 'text-green-500' : darkMode ? 'text-slate-400' : 'text-slate-600'
                                }`}>
                                  {prevPts !== null ? (prevPts === -1 ? 'AVG' : prevPts) : ''}
                                </td>
                              </React.Fragment>
                            );
                          })}

                          <td className={`px-1 py-0.5${singleFleetCompletedRaces.length > 0 ? ' border-l' : ''} ${
                            darkMode ? 'border-blue-500/20' : 'border-blue-200'
                          }`}>
                            {sfIsVerified ? (
                              <span className={`font-mono font-bold flex items-center gap-1 ${
                                (currentEvent?.show_flag || currentEvent?.show_country) ? '' : 'justify-center'
                              } ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                                {(() => {
                                  const cellSkipper = cell.skipperIndex !== null ? skippers[cell.skipperIndex] : null;
                                  return (
                                    <>
                                      {(currentEvent?.show_flag || currentEvent?.show_country) && cellSkipper?.country_code && (
                                        <span className={`text-[9px] font-medium shrink-0 w-7 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                          {currentEvent?.show_flag && getCountryFlag(cellSkipper.country_code)}
                                          {currentEvent?.show_country && getIOCCode(cellSkipper.country_code)}
                                        </span>
                                      )}
                                      <span>{cell.sailNumber || '-'}</span>
                                    </>
                                  );
                                })()}
                              </span>
                            ) : (
                              <div className="flex items-center justify-center gap-0.5">
                                <input
                                  ref={el => { inputRefs.current[`A-${idx}`] = el; }}
                                  type="text"
                                  value={cell.sailNumber}
                                  onChange={e => handleCellChange(sfHeat, position, e.target.value)}
                                  onKeyDown={e => handleKeyDown(e, sfHeat, position, sfTotalPositions)}
                                  className={`w-12 h-7 px-1 rounded text-xs font-mono font-bold border text-center ${
                                    cell.letterScore
                                      ? darkMode
                                        ? 'bg-slate-700/60 border-slate-600/70 text-white focus:border-blue-500'
                                        : 'bg-white/70 border-slate-300 text-slate-900 focus:border-blue-500'
                                      : !cell.isValid && cell.sailNumber.trim()
                                        ? 'border-red-500 bg-red-50/80 text-red-700 dark:bg-red-900/20 dark:text-red-400 dark:border-red-500'
                                        : cell.isDuplicate
                                          ? 'border-amber-500 bg-amber-50/80 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-500'
                                          : darkMode
                                            ? 'bg-slate-700/60 border-slate-600/70 text-white focus:border-blue-500'
                                            : 'bg-white/70 border-slate-300 text-slate-900 focus:border-blue-500'
                                  } focus:outline-none focus:ring-1 focus:ring-blue-500/20`}
                                />
                                {!cell.isValid && cell.sailNumber.trim() && !cell.letterScore && (
                                  <AlertCircle size={12} className="text-red-500 flex-shrink-0" />
                                )}
                              </div>
                            )}
                          </td>

                          <td className={`px-1 py-1 text-center ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                            {sfIsVerified ? (
                              cell.letterScore
                                ? <span className={`font-semibold text-[11px] ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>{getLetterScoreDisplayCode(cell.letterScore, cell.customPoints)}</span>
                                : hasValue && cell.isValid
                                  ? <span className={darkMode ? 'text-slate-500' : 'text-slate-500'}>OK</span>
                                  : ''
                            ) : cell.letterScore ? (
                              <button
                                onClick={() => handleLetterScore(sfHeat, position)}
                                className={`h-7 rounded-full px-2 text-[9px] font-bold flex-shrink-0 inline-flex items-center justify-center ${
                                  darkMode
                                    ? 'bg-slate-600/40 text-slate-300 border border-slate-500/40'
                                    : 'bg-slate-100 text-slate-700 border border-slate-300'
                                }`}
                                title={`${getLetterScoreDisplayCode(cell.letterScore, cell.customPoints)}${cell.customPoints !== undefined ? ` (${cell.customPoints === -1 ? 'AVG' : cell.customPoints})` : ''}`}
                              >
                                {getLetterScoreDisplayCode(cell.letterScore, cell.customPoints)}
                              </button>
                            ) : (
                              <button
                                onClick={() => handleLetterScore(sfHeat, position)}
                                className={`h-7 rounded-full px-2 text-[11px] font-medium flex-shrink-0 inline-flex items-center justify-center transition-colors ${
                                  darkMode
                                    ? 'text-slate-400 hover:bg-slate-700/60 hover:text-white border border-transparent hover:border-slate-600/70'
                                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700 border border-transparent hover:border-slate-200'
                                }`}
                                title="Assign letter score (DNS, DNF, DSQ, etc.)"
                              >
                                OK
                              </button>
                            )}
                          </td>

                          <td className={`px-1 py-1 text-center font-mono font-bold ${
                            points === 'AVG' ? 'text-green-500' : darkMode ? 'text-slate-200' : 'text-slate-800'
                          }`}>
                            {points !== null ? points : ''}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {!sfIsVerified && (() => {
                if (skippers.length === 0) return null;
                const activeCells = cells[sfHeat] || [];
                return (
                  <div className={`px-3 py-2 border-t ${
                    darkMode ? 'bg-slate-800/80 border-slate-700/50' : 'bg-slate-50/80 border-slate-200'
                  }`}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`text-xs font-semibold ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        Sail Numbers
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {skippers.map((s, sIdx) => {
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
                            <span className="flex items-center gap-1">
                              {currentEvent?.show_flag && s.country_code && (
                                <span className="text-[11px]">{getCountryFlag(s.country_code)}</span>
                              )}
                              {currentEvent?.show_country && s.country_code && (
                                <span className="text-[10px] font-medium opacity-70">{getIOCCode(s.country_code)}</span>
                              )}
                              <span>{sailNo}</span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {!sfIsVerified && sfReady && (
                <div
                  ref={verifyButtonRef}
                  className={`px-3 py-2 border-t ${
                    darkMode ? 'bg-slate-800 border-slate-700/40' : 'bg-white border-slate-200'
                  }`}
                >
                  <button
                    onClick={() => handleConfirmHeat(sfHeat)}
                    className="w-full py-2.5 rounded-lg text-white font-bold text-sm bg-green-600 hover:bg-green-700 transition-colors flex items-center justify-center gap-2 shadow-md active:scale-[0.98]"
                  >
                    <Check size={18} />
                    Verify Race {singleFleetRace} Results
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {showLetterScoreModal && (() => {
          const lsPos = letterScorePosition || 1;
          const lsCells = cells[sfHeat] || [];
          const lsCell = lsCells[lsPos - 1];
          const lsSkipperName = lsCell ? getSkipperName(sfHeat, lsCell) || `Position ${lsPos}` : `Position ${lsPos}`;
          const prevResults = lsCell?.skipperIndex !== null && lsCell?.skipperIndex !== undefined
            ? raceResults
                .filter(r => r.race !== singleFleetRace && r.skipperIndex === lsCell.skipperIndex)
                .map(r => ({
                  position: r.position,
                  letterScore: r.letterScore,
                  customPoints: r.customPoints,
                  points: r.letterScore
                    ? (r.customPoints !== undefined && r.customPoints > 0 ? r.customPoints : skippers.length + 1)
                    : (r.position || skippers.length + 1),
                  raceNumber: r.race
                }))
            : [];
          const ssHasCompleted = prevResults.some(r => r.position !== null && r.position > 0);
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
                  if (letterScorePosition !== null) {
                    const idx = letterScorePosition - 1;
                    const updated = [...(cells[sfHeat] || [])];
                    updated[idx] = { ...updated[idx], letterScore: null, customPoints: undefined };
                    const validated = validateCells(updated, skippers);
                    setCells(prev => ({ ...prev, [sfHeat]: validated }));
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
              raceNumber={singleFleetRace}
              skipperPreviousResults={prevResults}
              hasCompletedRaces={ssHasCompleted}
              isMultiDay={currentEvent?.multiDay}
              numberOfDays={currentEvent?.numberOfDays}
              currentDay={currentEvent?.currentDay}
            />
          );
        })()}

        <StartBoxModal
          isOpen={showStartBoxModal}
          onClose={() => setShowStartBoxModal(false)}
          darkMode={darkMode}
          onSequenceComplete={() => setRaceTimerRunning(true)}
        />
      </div>
    );
  }

  return (
    <div className={`flex flex-col rounded-b-xl ${
      darkMode ? 'bg-slate-900' : 'bg-slate-50'
    }`}>
      {isEditingPreviousRound && (
        <div className={`px-3 py-2 border-b flex items-center justify-between ${
          darkMode ? 'bg-amber-900/20 border-amber-800/30' : 'bg-amber-50 border-amber-200'
        }`}>
          <div className="flex items-center gap-2">
            <Pencil size={14} className={darkMode ? 'text-amber-400' : 'text-amber-600'} />
            <span className={`text-sm font-semibold ${darkMode ? 'text-amber-300' : 'text-amber-800'}`}>
              Editing Race {editingRound}
            </span>
          </div>
          <button
            onClick={() => setEditingRound(null)}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
              darkMode
                ? 'bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 border border-blue-500/30'
                : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
            }`}
          >
            Return to Race {actualCurrentRound}
          </button>
        </div>
      )}
      <div className={`${isFullscreen ? 'max-h-[calc(100vh-80px)]' : 'max-h-[75vh]'} overflow-auto`} ref={scrollContainerRef}>
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
                  onClick={() => {
                    if (!isCurrent && onSelectHeat) {
                      onSelectHeat(heat);
                    }
                  }}
                  className={`flex items-center justify-between px-3 py-1.5 ${HEAT_HEADER_COLORS[heat] || 'bg-slate-600'} text-white${
                    !isCurrent ? ' cursor-pointer hover:brightness-110' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm">Heat {getHeatDisplayLabel(heat, heatManagement?.configuration)}</span>
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
                      {orderedColumns.map(col => (
                        <React.Fragment key={`tcg-${col.round}`}>
                          <col style={{ width: col.type === 'editing' ? '56px' : '48px' }} />
                          <col style={{ width: col.type === 'editing' ? '48px' : '40px' }} />
                          <col style={{ width: '32px' }} />
                        </React.Fragment>
                      ))}
                      {!isSeedingRound && promotionCount > 0 && heat !== heatsToRender[0] && <col style={{ width: '32px' }} />}
                    </colgroup>
                    <thead>
                      <tr className={darkMode ? 'bg-slate-700' : 'bg-slate-200'}>
                        <th className="px-1.5 py-1.5" />
                        {orderedColumns.map((col, colIdx) => {
                          if (col.type === 'editing') {
                            return (
                              <th
                                key={`race-lbl-${col.round}`}
                                colSpan={3}
                                onClick={() => {
                                  if (!isCurrent && onSelectHeat) onSelectHeat(heat);
                                  if (isEditingPreviousRound) setEditingRound(null);
                                }}
                                className={`text-center font-bold text-[11px] uppercase tracking-widest py-1.5 ${colIdx > 0 ? 'border-l ' : ''}${
                                  darkMode ? 'text-blue-300 border-blue-500/30 bg-blue-900/20' : 'text-blue-700 border-blue-300 bg-blue-50/80'
                                }${!isCurrent ? ' opacity-30' : ''}${!isCurrent || isEditingPreviousRound ? ' cursor-pointer' : ''}`}
                                title={!isCurrent ? `Switch to Heat ${getHeatDisplayLabel(heat, heatManagement?.configuration)}` : isEditingPreviousRound ? `Return to Race ${actualCurrentRound}` : undefined}
                              >
                                Race {col.round}
                              </th>
                            );
                          }
                          return (
                            <th
                              key={`race-lbl-${col.round}`}
                              colSpan={3}
                              onClick={() => {
                                if (!isCurrent && onSelectHeat) onSelectHeat(heat);
                                setEditingRound(col.round);
                              }}
                              className={`text-center font-bold text-[11px] uppercase tracking-widest py-1.5 border-l cursor-pointer transition-colors ${
                                darkMode ? 'text-slate-300 border-slate-500/50 hover:bg-slate-600/50 hover:text-blue-300' : 'text-slate-500 border-slate-400/50 hover:bg-slate-100 hover:text-blue-600'
                              }`}
                              title={`Click to edit Race ${col.round}`}
                            >
                              <span className="inline-flex items-center gap-1">
                                Race {col.round}
                                <Pencil size={9} className="opacity-40" />
                              </span>
                            </th>
                          );
                        })}
                        {!isSeedingRound && promotionCount > 0 && heat !== heatsToRender[0] && <th />}
                      </tr>
                      <tr className={darkMode ? 'bg-slate-700/40' : 'bg-slate-100/60'}>
                        <th className="px-1.5 py-1" />
                        {orderedColumns.map((col, colIdx) => {
                          if (col.type === 'editing') {
                            return (
                              <React.Fragment key={`hdr-r${col.round}`}>
                                <th className={`px-1 py-1 text-center font-bold uppercase tracking-wider ${colIdx > 0 ? 'border-l ' : ''}${
                                  darkMode ? 'text-blue-400 border-blue-500/30 bg-blue-900/20' : 'text-blue-600 border-blue-300 bg-blue-50/80'
                                }${!isCurrent ? ' opacity-30' : ''}`}>
                                  <span className="text-[10px]">Sail No.</span>
                                </th>
                                <th className={`px-1 py-1 text-center font-bold uppercase tracking-wider ${
                                  darkMode ? 'text-blue-400 bg-blue-900/20' : 'text-blue-600 bg-blue-50/80'
                                }${!isCurrent ? ' opacity-30' : ''}`}><span className="text-[10px]">Comment</span></th>
                                <th className={`px-1 py-1 text-center font-bold uppercase tracking-wider ${
                                  darkMode ? 'text-blue-400 bg-blue-900/20' : 'text-blue-600 bg-blue-50/80'
                                }${!isCurrent ? ' opacity-30' : ''}`}><span className="text-[10px]">Pts</span></th>
                              </React.Fragment>
                            );
                          }
                          return (
                            <React.Fragment key={`hdr-r${col.round}`}>
                              <th className={`px-1 py-1 text-center font-bold uppercase tracking-wider border-l ${
                                darkMode ? 'text-slate-500 border-slate-600/40' : 'text-slate-500 border-slate-200'
                              }`}>
                                <span className="text-[10px]">Sail No.</span>
                              </th>
                              <th className={`px-1 py-1 text-center font-bold uppercase tracking-wider ${
                                darkMode ? 'text-slate-500' : 'text-slate-500'
                              }`}>
                                <span className="text-[10px]">Comment</span>
                              </th>
                              <th className={`px-1 py-1 text-center font-bold uppercase tracking-wider ${
                                darkMode ? 'text-slate-500' : 'text-slate-500'
                              }`}>
                                <span className="text-[10px]">Pts</span>
                              </th>
                            </React.Fragment>
                          );
                        })}
                        {!isSeedingRound && promotionCount > 0 && heat !== heatsToRender[0] && (
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
                        const isTopHeat = heat === heatsToRender[0];
                        const isPromotion = !isTopHeat && !isHistoricalRow && isPromotionPosition(position);
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

                            {orderedColumns.map((col, colIdx) => {
                              if (col.type === 'completed') {
                                const r = col.data;
                                const prevHeatResults = (r.results || []).filter(
                                  (res: any) => res.heatDesignation === heat
                                );
                                const positioned = prevHeatResults
                                  .filter((res: any) => res.position !== null)
                                  .sort((a: any, b: any) => (a.position || 0) - (b.position || 0));
                                const lettered = prevHeatResults
                                  .filter((res: any) => res.position === null && res.letterScore);
                                const ordered = [...positioned, ...lettered];
                                const displayResult = ordered[idx] || null;
                                const prevSkipper = displayResult ? skippers[displayResult.skipperIndex] : null;
                                const prevSailNo = prevSkipper ? String(prevSkipper.sailNumber || prevSkipper.sailNo || '') : '';
                                const prevHeatSize = r.heatAssignments.find((a: any) => a.heatDesignation === heat)?.skipperIndices.length || 0;
                                const prevPtsRaw = displayResult
                                  ? displayResult.letterScore
                                    ? (displayResult.customPoints !== undefined ? displayResult.customPoints : prevHeatSize + 1)
                                    : displayResult.position
                                  : null;
                                const prevPts = prevPtsRaw === -1 ? -1 : prevPtsRaw;

                                return (
                                  <React.Fragment key={`prev-r${r.round}-${position}`}>
                                    <td className={`px-1 py-1 font-mono font-semibold border-l ${
                                      (currentEvent?.show_flag || currentEvent?.show_country) ? 'text-left' : 'text-center'
                                    } ${darkMode ? 'text-slate-400 border-slate-600/40' : 'text-slate-600 border-slate-200'}`}>
                                      {displayResult ? (
                                        <span className={`flex items-center gap-1 ${(currentEvent?.show_flag || currentEvent?.show_country) ? '' : 'justify-center'}`}>
                                          {(currentEvent?.show_flag || currentEvent?.show_country) && prevSkipper?.country_code && (
                                            <span className={`text-[9px] font-medium shrink-0 w-7 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                              {currentEvent?.show_flag && getCountryFlag(prevSkipper.country_code)}
                                              {currentEvent?.show_country && getIOCCode(prevSkipper.country_code)}
                                            </span>
                                          )}
                                          <span>{prevSailNo}</span>
                                        </span>
                                      ) : ''}
                                    </td>
                                    <td className={`px-1 py-1 text-center ${
                                      darkMode ? 'text-slate-500' : 'text-slate-400'
                                    }`}>
                                      {displayResult ? (
                                        displayResult.letterScore
                                          ? <span className={`font-semibold text-[11px] ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>{getLetterScoreDisplayCode(displayResult.letterScore, displayResult.customPoints)}</span>
                                          : <span className={darkMode ? 'text-slate-500' : 'text-slate-500'}>OK</span>
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
                              }

                              const editBg = darkMode ? 'bg-blue-900/10' : 'bg-blue-50/60';
                              return (
                                <React.Fragment key={`edit-r${col.round}-${position}`}>
                                  <td className={`px-1 py-0.5${colIdx > 0 ? ' border-l' : ''} ${editBg} ${
                                    darkMode ? 'border-blue-500/20' : 'border-blue-200'
                                  }${!isCurrent ? ' opacity-30 pointer-events-none' : ''}`}>
                                    {isVerified || isHistoricalRow ? (
                                      <span className={`font-mono font-bold flex items-center gap-1 ${
                                        (currentEvent?.show_flag || currentEvent?.show_country) ? '' : 'justify-center'
                                      } ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                                        {(() => {
                                          const cellSkipper = cell.skipperIndex !== null ? (isMultiHeatMode ? getHeatSkippers(heat)[cell.skipperIndex] : skippers[cell.skipperIndex]) : null;
                                          return (
                                            <>
                                              {(currentEvent?.show_flag || currentEvent?.show_country) && cellSkipper?.country_code && (
                                                <span className={`text-[9px] font-medium shrink-0 w-7 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                                  {currentEvent?.show_flag && getCountryFlag(cellSkipper.country_code)}
                                                  {currentEvent?.show_country && getIOCCode(cellSkipper.country_code)}
                                                </span>
                                              )}
                                              <span>{cell.sailNumber || (isHistoricalRow ? '' : '-')}</span>
                                            </>
                                          );
                                        })()}
                                      </span>
                                    ) : (
                                      <div className="flex items-center justify-center gap-0.5">
                                        <input
                                          ref={el => { inputRefs.current[`${heat}-${idx}`] = el; }}
                                          type="text"
                                          value={cell.sailNumber}
                                          onChange={e => handleCellChange(heat, position, e.target.value)}
                                          onKeyDown={e => handleKeyDown(e, heat, position, totalPositions)}
                                          tabIndex={!isCurrent ? -1 : undefined}
                                          className={`w-12 h-7 px-1 rounded text-xs font-mono font-bold border text-center ${
                                            cell.letterScore
                                              ? darkMode
                                                ? 'bg-slate-700/60 border-slate-600/70 text-white focus:border-blue-500'
                                                : 'bg-white/70 border-slate-300 text-slate-900 focus:border-blue-500'
                                              : !cell.isValid && cell.sailNumber.trim()
                                                ? 'border-red-500 bg-red-50/80 text-red-700 dark:bg-red-900/20 dark:text-red-400 dark:border-red-500'
                                                : cell.isDuplicate
                                                  ? 'border-amber-500 bg-amber-50/80 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-500'
                                                  : darkMode
                                                    ? 'bg-slate-700/60 border-slate-600/70 text-white focus:border-blue-500'
                                                    : 'bg-white/70 border-slate-300 text-slate-900 focus:border-blue-500'
                                          } focus:outline-none focus:ring-1 focus:ring-blue-500/20`}
                                        />
                                        {!cell.isValid && cell.sailNumber.trim() && !cell.letterScore && (
                                          <AlertCircle size={12} className="text-red-500 flex-shrink-0" />
                                        )}
                                      </div>
                                    )}
                                  </td>

                                  <td className={`px-1 py-1 text-center ${editBg} ${
                                    darkMode ? 'text-slate-400' : 'text-slate-500'
                                  }${!isCurrent ? ' opacity-30 pointer-events-none' : ''}`}>
                                    {isVerified || isHistoricalRow ? (
                                      cell.letterScore
                                        ? <span className={`font-semibold text-[11px] ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>{getLetterScoreDisplayCode(cell.letterScore, cell.customPoints)}</span>
                                        : hasValue && cell.isValid
                                          ? <span className={darkMode ? 'text-slate-500' : 'text-slate-500'}>OK</span>
                                          : ''
                                    ) : cell.letterScore ? (
                                      <button
                                        onClick={() => handleLetterScore(heat, position)}
                                        className={`h-7 rounded-full px-2 text-[9px] font-bold flex-shrink-0 inline-flex items-center justify-center ${
                                          darkMode
                                            ? 'bg-slate-600/40 text-slate-300 border border-slate-500/40'
                                            : 'bg-slate-100 text-slate-700 border border-slate-300'
                                        }`}
                                        title={`${getLetterScoreDisplayCode(cell.letterScore, cell.customPoints)}${cell.customPoints !== undefined ? ` (${cell.customPoints === -1 ? 'AVG' : cell.customPoints})` : ''}`}
                                      >
                                        {getLetterScoreDisplayCode(cell.letterScore, cell.customPoints)}
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => handleLetterScore(heat, position)}
                                        className={`h-7 rounded-full px-2 text-[11px] font-medium flex-shrink-0 inline-flex items-center justify-center transition-colors ${
                                          darkMode
                                            ? 'text-slate-400 hover:bg-slate-700/60 hover:text-white border border-transparent hover:border-slate-600/70'
                                            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700 border border-transparent hover:border-slate-200'
                                        }`}
                                        title="Assign letter score (DNS, DNF, DSQ, etc.)"
                                      >
                                        OK
                                      </button>
                                    )}
                                  </td>

                                  <td className={`px-1 py-1 text-center font-mono font-bold ${editBg} ${
                                    points === 'AVG'
                                      ? 'text-green-500'
                                      : darkMode ? 'text-slate-200' : 'text-slate-800'
                                  }${!isCurrent ? ' opacity-30' : ''}`}>
                                    {points !== null ? points : ''}
                                  </td>
                                </React.Fragment>
                              );
                            })}

                            {!isSeedingRound && promotionCount > 0 && !isTopHeat && (
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
                          Heat {getHeatDisplayLabel(heat, heatManagement?.configuration)} Sail Numbers
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
                              <span className="flex items-center gap-1">
                                {currentEvent?.show_flag && s.country_code && (
                                  <span className="text-[11px]">{getCountryFlag(s.country_code)}</span>
                                )}
                                {currentEvent?.show_country && s.country_code && (
                                  <span className="text-[10px] font-medium opacity-70">{getIOCCode(s.country_code)}</span>
                                )}
                                <span>{sailNo}</span>
                              </span>
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
                      className={`w-full py-2.5 rounded-lg text-white font-bold text-sm transition-colors flex items-center justify-center gap-2 shadow-md active:scale-[0.98] ${
                        isEditingPreviousRound
                          ? 'bg-amber-600 hover:bg-amber-700'
                          : 'bg-green-600 hover:bg-green-700'
                      }`}
                    >
                      <Check size={18} />
                      {isEditingPreviousRound
                        ? `Update Race ${editingRound} - Heat ${getHeatDisplayLabel(heat, heatManagement?.configuration)}`
                        : `Verify Heat ${getHeatDisplayLabel(heat, heatManagement?.configuration)} Results`
                      }
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


      {isHeatScoring && heatManagement && heatManagement.configuration?.scoringSystem !== 'hms' && (
        <button
          onClick={() => {
            if (onShowOverallResults) {
              onShowOverallResults();
            } else {
              setShowOverallResults(true);
            }
          }}
          className={`fixed right-0 top-1/2 -translate-y-1/2 z-40 rounded-l-xl shadow-2xl flex flex-col items-center gap-2 px-2 py-4 transition-all duration-200 hover:scale-105 ${
            darkMode
              ? 'bg-gradient-to-b from-cyan-600 to-blue-700 text-white hover:from-cyan-500 hover:to-blue-600'
              : 'bg-gradient-to-b from-blue-600 to-cyan-600 text-white hover:from-blue-500 hover:to-cyan-500'
          }`}
          title="Overall Results"
        >
          <Trophy size={18} />
          <div className="flex flex-col items-center">
            {'RESULTS'.split('').map((letter, index) => (
              <span key={index} className="text-[10px] font-semibold leading-tight">
                {letter}
              </span>
            ))}
          </div>
        </button>
      )}

      {isHeatScoring && heatManagement && heatManagement.configuration?.scoringSystem !== 'hms' && (
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
                  ? (r.customPoints !== undefined && r.customPoints > 0 ? r.customPoints : lsHeatSkips.length + 1)
                  : (r.position || lsHeatSkips.length + 1),
                raceNumber: r.race
              }))
          : [];
        const ssHeatHasCompleted = prevResults.some(r => r.position !== null && r.position > 0);
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
            isHeatRacing={true}
            hasCompletedRaces={ssHeatHasCompleted}
            isMultiDay={currentEvent?.multiDay}
            numberOfDays={currentEvent?.numberOfDays}
            currentDay={currentEvent?.currentDay}
          />
        );
      })()}

      {/* Floating Livestream Panel - only for events with livestream enabled */}
      {currentEvent?.enableLiveStream && currentEvent?.clubId && (
        <>
          {!isLivestreamPanelOpen && (
            <motion.button
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsLivestreamPanelOpen(true)}
              className="fixed right-0 top-[calc(50%+40px)] z-30 rounded-l-xl shadow-lg flex flex-col items-center gap-2 px-2 py-3 bg-gradient-to-b from-slate-700 to-slate-800 text-slate-200 border border-slate-600/50 hover:from-slate-600 hover:to-slate-700 transition-all duration-200"
            >
              <Video size={18} />
              <div className="flex flex-col items-center">
                {'STREAM'.split('').map((letter, index) => (
                  <span key={index} className="text-[10px] font-semibold leading-tight">
                    {letter}
                  </span>
                ))}
              </div>
            </motion.button>
          )}

          <AnimatePresence>
            {isLivestreamPanelOpen && (
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed right-0 top-0 bottom-0 w-[75vw] max-w-[1200px] shadow-2xl z-[9995] flex flex-col bg-slate-900 text-white"
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50 bg-gradient-to-r from-rose-900/50 to-slate-900 flex-shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-red-600/20 flex items-center justify-center">
                      <Video size={18} className="text-red-400" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-white">Livestream Console</h3>
                      <p className="text-xs text-slate-400">{currentEvent?.eventName || 'Live Broadcast'}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsLivestreamPanelOpen(false)}
                    className="p-2 rounded-lg hover:bg-slate-700/50 text-slate-400 hover:text-white transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="flex-1 overflow-auto">
                  <LivestreamControlPanel
                    clubId={currentEvent.clubId}
                    autoCreateForEvent={currentEvent?.id ? { eventId: currentEvent.id, eventName: currentEvent.eventName || 'Live Broadcast' } : undefined}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
};
