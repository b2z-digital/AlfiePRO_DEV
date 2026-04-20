import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { Skipper } from '../types';
import { HeatDesignation, HeatManagement } from '../types/heat';
import { RaceEvent } from '../types/race';
import { LetterScore } from '../types/letterScores';
import { LetterScoreSelector } from './LetterScoreSelector';
import { CircleCheck as CheckCircle2, TriangleAlert as AlertTriangle, ShieldCheck, X, Search, RotateCcw, CircleAlert as AlertCircle, Timer, Trophy } from 'lucide-react';
import { useNotification } from '../contexts/NotificationContext';
import { HeatOverallResultsModal } from './HeatOverallResultsModal';

const LETTER_SCORE_CODES: LetterScore[] = [
  'DNS', 'DNF', 'DSQ', 'OCS', 'BFD', 'UFD', 'RDG', 'DPI',
  'ZFP', 'SCP', 'RET', 'DNC', 'DNE', 'NSC', 'WDN'
];

const HEAT_LABELS: HeatDesignation[] = ['A', 'B', 'C', 'D', 'E'];
const TOTAL_RACES = 41;

const getOrdinal = (n: number): string => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

interface CellData {
  sailNumber: string;
  comment: string;
  points: string;
  letterScore?: LetterScore | null;
  customPoints?: number;
  skipperIndex?: number | null;
  isValid?: boolean;
  isDuplicate?: boolean;
}

interface VerifyResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

interface HmsManualSpreadsheetProps {
  skippers: Skipper[];
  heatManagement: HeatManagement;
  darkMode: boolean;
  raceResults: any[];
  currentEvent: RaceEvent | null;
  onConfigureHeats: () => void;
  updateRaceResults: (race: number, skipperIndex: number, position: number | null, letterScore?: any, customPoints?: number, hmsHeat?: string, hmsPosition?: number) => void;
  deleteRaceResult: (race: number, skipperIndex: number) => void;
  isFullscreen?: boolean;
  onOpenStartBox?: () => void;
}

const LETTER_SCORES_PATTERN = 'DNS|DNF|DSQ|OCS|BFD|UFD|RDG|DPI|ZFP|SCP|RET|DNC|DNE|NSC|WDN';

const parseSmartInput = (raw: string): { sailNumber: string; letterScore: LetterScore | null } => {
  const trimmed = raw.trim();
  const withSpace = new RegExp(`^(\\S+)\\s+(${LETTER_SCORES_PATTERN})$`, 'i');
  const matchSpace = trimmed.match(withSpace);
  if (matchSpace) {
    return {
      sailNumber: matchSpace[1],
      letterScore: matchSpace[2].toUpperCase() as LetterScore,
    };
  }
  const noSpace = new RegExp(`^(\\d+)(${LETTER_SCORES_PATTERN})$`, 'i');
  const matchNoSpace = trimmed.match(noSpace);
  if (matchNoSpace) {
    return {
      sailNumber: matchNoSpace[1],
      letterScore: matchNoSpace[2].toUpperCase() as LetterScore,
    };
  }
  return { sailNumber: trimmed, letterScore: null };
};

export const HmsManualSpreadsheet: React.FC<HmsManualSpreadsheetProps> = ({
  skippers,
  heatManagement,
  darkMode,
  raceResults,
  currentEvent,
  onConfigureHeats,
  updateRaceResults,
  deleteRaceResult,
  isFullscreen = false,
  onOpenStartBox,
}) => {
  const { addNotification } = useNotification();
  const numberOfHeats = heatManagement.configuration.numberOfHeats;
  const promotionCount = heatManagement.configuration.promotionCount;
  const heats = HEAT_LABELS.slice(0, Math.max(numberOfHeats, 5));
  const maxPositions = Math.max(24, Math.ceil(skippers.length / numberOfHeats) + 4);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [cells, setCells] = useState<Record<string, CellData>>({});
  const [verifiedRaces, setVerifiedRaces] = useState<Set<number>>(new Set());
  const [verifyTarget, setVerifyTarget] = useState<number | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [resetConfirmRace, setResetConfirmRace] = useState<number | null>(null);

  const [showOverallResults, setShowOverallResults] = useState(false);
  const [showLetterScoreModal, setShowLetterScoreModal] = useState(false);
  const [letterScoreTarget, setLetterScoreTarget] = useState<{
    heat: HeatDesignation;
    position: number;
    race: number;
  } | null>(null);

  const [dropdownTarget, setDropdownTarget] = useState<{
    heat: HeatDesignation;
    position: number;
    race: number;
  } | null>(null);
  const [dropdownFilter, setDropdownFilter] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [noSuchBoatTarget, setNoSuchBoatTarget] = useState<{
    heat: HeatDesignation;
    position: number;
    race: number;
    sailNumber: string;
  } | null>(null);

  const sailNumberMap = useMemo(() => {
    const map: Record<string, number> = {};
    skippers.forEach((s, idx) => {
      const sailNo = String(s.sailNumber || s.sailNo || s.boat_sail_number || '').trim();
      if (sailNo) {
        map[sailNo.toLowerCase()] = idx;
      }
    });
    return map;
  }, [skippers]);

  const getCellKey = (heat: HeatDesignation, position: number, race: number) =>
    `${heat}-${position}-${race}`;

  const loadedRef = useRef(false);

  useEffect(() => {
    const newCells: Record<string, CellData> = {};
    raceResults.forEach((result: any) => {
      if (result.hmsHeat && result.hmsPosition && result.race) {
        const key = getCellKey(result.hmsHeat, result.hmsPosition, result.race);
        const skipper = skippers[result.skipperIndex];
        const sailNo = skipper?.sailNumber || skipper?.sailNo || skipper?.boat_sail_number || result.hmsSailNumber || '';
        if (sailNo) {
          newCells[key] = {
            sailNumber: String(sailNo),
            comment: result.letterScore || 'OK',
            points: result.letterScore ? '' : (result.position?.toString() || ''),
            letterScore: result.letterScore || null,
            customPoints: result.customPoints,
            skipperIndex: result.skipperIndex,
            isValid: true,
            isDuplicate: false,
          };
        }
      }
    });
    if (Object.keys(newCells).length > 0) {
      if (!loadedRef.current) {
        setCells(prev => ({ ...prev, ...newCells }));
        loadedRef.current = true;
      } else {
        setCells(prev => {
          const merged = { ...prev };
          Object.entries(newCells).forEach(([k, v]) => {
            if (!merged[k] || !merged[k].sailNumber) {
              merged[k] = v;
            }
          });
          return merged;
        });
      }
    }
  }, [raceResults, skippers]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownTarget(null);
        setDropdownFilter('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getUsedSailNumbersForRace = useCallback((race: number, excludeKey?: string): Set<string> => {
    const used = new Set<string>();
    heats.forEach(heat => {
      for (let pos = 1; pos <= maxPositions; pos++) {
        const key = getCellKey(heat, pos, race);
        if (key === excludeKey) continue;
        const cell = cells[key];
        if (cell?.sailNumber?.trim()) {
          used.add(cell.sailNumber.trim().toLowerCase());
        }
      }
    });
    return used;
  }, [cells, heats, maxPositions]);

  const handleSailNumberInput = useCallback((heat: HeatDesignation, position: number, race: number, rawValue: string) => {
    const key = getCellKey(heat, position, race);
    const numericPart = rawValue.replace(/[^0-9]/g, '');
    const skipperIdx = numericPart ? (sailNumberMap[numericPart.toLowerCase()] ?? null) : null;

    setCells(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        sailNumber: rawValue,
        comment: prev[key]?.comment || '',
        points: prev[key]?.points || '',
        letterScore: prev[key]?.letterScore || null,
        skipperIndex: skipperIdx,
        isValid: !rawValue.trim() || skipperIdx !== null,
        isDuplicate: false,
      }
    }));

    if (numericPart) {
      setDropdownFilter(numericPart);
    }
  }, [sailNumberMap]);

  const handleSailNumberBlur = useCallback((heat: HeatDesignation, position: number, race: number) => {
    const key = getCellKey(heat, position, race);
    const cell = cells[key];
    if (!cell?.sailNumber?.trim()) return;

    const { sailNumber: parsedSail, letterScore: parsedScore } = parseSmartInput(cell.sailNumber);
    const sailLower = parsedSail.toLowerCase();
    const skipperIdx = sailNumberMap[sailLower] ?? null;

    if (parsedScore) {
      setCells(prev => ({
        ...prev,
        [key]: {
          ...prev[key],
          sailNumber: parsedSail,
          comment: parsedScore,
          letterScore: parsedScore,
          skipperIndex: skipperIdx,
          isValid: !parsedSail.trim() || skipperIdx !== null,
        }
      }));
    }

    const finalIdx = skipperIdx ?? cell.skipperIndex;
    if (finalIdx !== undefined && finalIdx !== null) {
      if (parsedScore) {
        updateRaceResults(race, finalIdx, null, parsedScore, cell.customPoints, heat, position);
      } else {
        updateRaceResults(race, finalIdx, position, undefined, undefined, heat, position);
      }
    } else {
      setNoSuchBoatTarget({ heat, position, race, sailNumber: parsedSail });
    }
  }, [cells, sailNumberMap, updateRaceResults]);

  const handleDropdownSelect = useCallback((heat: HeatDesignation, position: number, race: number, skipper: Skipper, skipperIdx: number) => {
    const key = getCellKey(heat, position, race);
    const sailNo = String(skipper.sailNumber || skipper.sailNo || skipper.boat_sail_number || '').trim();

    setCells(prev => ({
      ...prev,
      [key]: {
        sailNumber: sailNo,
        comment: 'OK',
        points: position.toString(),
        letterScore: null,
        skipperIndex: skipperIdx,
        isValid: true,
        isDuplicate: false,
      }
    }));

    updateRaceResults(race, skipperIdx, position, undefined, undefined, heat, position);
    setDropdownTarget(null);
    setDropdownFilter('');

    setTimeout(() => {
      const nextKey = getCellKey(heat, position + 1, race);
      const ref = inputRefs.current[`${nextKey}-sail`];
      ref?.focus();
    }, 50);
  }, [updateRaceResults]);

  const handleCommentClick = useCallback((heat: HeatDesignation, position: number, race: number) => {
    const key = getCellKey(heat, position, race);
    const cell = cells[key];
    if (cell?.sailNumber?.trim()) {
      setLetterScoreTarget({ heat, position, race });
      setShowLetterScoreModal(true);
    }
  }, [cells]);

  const handleLetterScoreSelect = useCallback((score: LetterScore | null, customPoints?: number) => {
    if (!letterScoreTarget) return;
    const { heat, position, race } = letterScoreTarget;
    const key = getCellKey(heat, position, race);
    const cell = cells[key];

    if (!score) {
      setCells(prev => ({
        ...prev,
        [key]: {
          ...prev[key],
          comment: prev[key]?.sailNumber?.trim() ? 'OK' : '',
          letterScore: null,
          customPoints: undefined,
        }
      }));
      if (cell?.skipperIndex != null) {
        updateRaceResults(race, cell.skipperIndex, position, undefined, undefined, heat, position);
      }
    } else {
      setCells(prev => ({
        ...prev,
        [key]: {
          ...prev[key],
          comment: score,
          points: '',
          letterScore: score,
          customPoints: customPoints,
        }
      }));
      if (cell?.skipperIndex != null) {
        updateRaceResults(race, cell.skipperIndex, null, score, customPoints, heat, position);
      }
    }

    setShowLetterScoreModal(false);
    setLetterScoreTarget(null);
  }, [letterScoreTarget, cells, updateRaceResults, deleteRaceResult]);

  const handleResetRace = useCallback((race: number) => {
    heats.forEach(heat => {
      for (let pos = 1; pos <= maxPositions; pos++) {
        const key = getCellKey(heat, pos, race);
        const cell = cells[key];
        if (cell?.skipperIndex != null) {
          deleteRaceResult(race, cell.skipperIndex);
        }
      }
    });

    setCells(prev => {
      const updated = { ...prev };
      heats.forEach(heat => {
        for (let pos = 1; pos <= maxPositions; pos++) {
          const key = getCellKey(heat, pos, race);
          delete updated[key];
        }
      });
      return updated;
    });

    setVerifiedRaces(prev => {
      const next = new Set(prev);
      next.delete(race);
      return next;
    });
    setResetConfirmRace(null);
  }, [cells, heats, maxPositions, deleteRaceResult]);

  const handleNoSuchBoatCancel = useCallback(() => {
    if (!noSuchBoatTarget) return;
    const key = getCellKey(noSuchBoatTarget.heat, noSuchBoatTarget.position, noSuchBoatTarget.race);
    setCells(prev => {
      const updated = { ...prev };
      delete updated[key];
      return updated;
    });
    setNoSuchBoatTarget(null);
  }, [noSuchBoatTarget]);

  const handleNoSuchBoatRetry = useCallback(() => {
    if (!noSuchBoatTarget) return;
    const key = getCellKey(noSuchBoatTarget.heat, noSuchBoatTarget.position, noSuchBoatTarget.race);
    setCells(prev => ({
      ...prev,
      [key]: { ...prev[key], sailNumber: '', comment: '', points: '', letterScore: null, skipperIndex: null, isValid: true, isDuplicate: false }
    }));
    setNoSuchBoatTarget(null);
    setTimeout(() => {
      const ref = inputRefs.current[`${key}-sail`];
      ref?.focus();
    }, 50);
  }, [noSuchBoatTarget]);

  const verifyRace = useCallback((race: number): VerifyResult => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const allSailsInRace = new Map<string, { heat: HeatDesignation; position: number }>();

    heats.forEach(heat => {
      const heatEntries: string[] = [];
      for (let pos = 1; pos <= maxPositions; pos++) {
        const key = getCellKey(heat, pos, race);
        const cell = cells[key];
        if (!cell?.sailNumber?.trim()) continue;

        const sailLower = cell.sailNumber.trim().toLowerCase();

        if (!cell.isValid && cell.skipperIndex == null) {
          errors.push(`Heat ${heat}, ${getOrdinal(pos)}: Sail "${cell.sailNumber}" not registered`);
        }

        if (heatEntries.includes(sailLower)) {
          errors.push(`Heat ${heat}: Duplicate entry "${cell.sailNumber}"`);
        }
        heatEntries.push(sailLower);

        const existing = allSailsInRace.get(sailLower);
        if (existing) {
          errors.push(`"${cell.sailNumber}" appears in Heat ${existing.heat} (${getOrdinal(existing.position)}) and Heat ${heat} (${getOrdinal(pos)})`);
        } else {
          allSailsInRace.set(sailLower, { heat, position: pos });
        }
      }
    });

    const registeredCount = skippers.filter(s => s.sailNumber?.trim()).length;
    if (allSailsInRace.size < registeredCount && allSailsInRace.size > 0) {
      warnings.push(`${registeredCount - allSailsInRace.size} registered skipper(s) not entered`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }, [cells, heats, maxPositions, skippers]);

  const handleVerifyRace = useCallback((race: number) => {
    const result = verifyRace(race);
    setVerifyResult(result);
    setVerifyTarget(race);
    if (result.valid) {
      setVerifiedRaces(prev => new Set(prev).add(race));
      const raceLabel = `R${race.toString().padStart(2, '0')}`;
      if (result.warnings.length === 0) {
        addNotification('success', `Race ${raceLabel} verified - all boats accounted for, no duplicate entries, all promotions correct.`, 5000);
      } else {
        addNotification('warning', `Race ${raceLabel} verified with warnings: ${result.warnings.join('; ')}`, 5000);
      }
    } else {
      addNotification('error', `Race R${race.toString().padStart(2, '0')} verification failed - ${result.errors.length} error(s) found.`, 5000);
    }
  }, [verifyRace, addNotification]);

  const isPromotionRow = (heat: HeatDesignation, position: number) => {
    if (heat === 'A') return false;
    return position <= promotionCount;
  };

  const getHeatEntryCount = useCallback((h: HeatDesignation, race: number): number => {
    let count = 0;
    for (let p = 1; p <= maxPositions; p++) {
      const k = getCellKey(h, p, race);
      if (cells[k]?.sailNumber?.trim()) count++;
    }
    return count;
  }, [cells, maxPositions]);

  const getHeatNonLetterNonPromotedCount = useCallback((h: HeatDesignation, race: number): number => {
    let count = 0;
    for (let p = 1; p <= maxPositions; p++) {
      const k = getCellKey(h, p, race);
      const c = cells[k];
      if (!c?.sailNumber?.trim()) continue;
      const isProm = h !== 'A' && race > 1 && p <= promotionCount;
      if (isProm) continue;
      if (!c.letterScore) count++;
    }
    return count;
  }, [cells, maxPositions, promotionCount]);

  const getOkCountAbovePosition = useCallback((h: HeatDesignation, position: number, race: number): number => {
    let count = 0;
    for (let p = 1; p < position; p++) {
      const k = getCellKey(h, p, race);
      const c = cells[k];
      if (!c?.sailNumber?.trim()) continue;
      const isProm = h !== 'A' && race > 1 && p <= promotionCount;
      if (isProm) continue;
      if (!c.letterScore) count++;
    }
    return count;
  }, [cells, promotionCount]);

  const getHeatOffset = useCallback((heat: HeatDesignation, race: number): number => {
    if (race === 1) return 0;
    const heatIdx = HEAT_LABELS.indexOf(heat);
    if (heatIdx <= 0) return 0;
    let offset = 0;
    for (let i = 0; i < heatIdx; i++) {
      const h = HEAT_LABELS[i];
      const entries = getHeatEntryCount(h, race);
      const promoted = i === 0 ? 0 : promotionCount;
      offset += Math.max(0, entries - promoted);
    }
    return offset;
  }, [getHeatEntryCount, promotionCount]);

  const getTotalNonPromotedFleet = useCallback((race: number): number => {
    let total = 0;
    for (const h of heats) {
      const entries = getHeatEntryCount(h, race);
      const promoted = h !== 'A' && race > 1 ? promotionCount : 0;
      total += Math.max(0, entries - promoted);
    }
    return total;
  }, [heats, getHeatEntryCount, promotionCount]);

  const getLargestHeatEntryCount = useCallback((race: number): number => {
    let max = 0;
    for (const h of heats) {
      const entries = getHeatEntryCount(h, race);
      if (entries > max) max = entries;
    }
    return max;
  }, [heats, getHeatEntryCount]);

  const getMaxExpForHeat = useCallback((heat: HeatDesignation, race: number): number => {
    const entries = getHeatEntryCount(heat, race);
    if (race === 1) {
      return entries;
    }
    if (entries === 0) {
      const totalFleet = getTotalNonPromotedFleet(race);
      return totalFleet > 0 ? totalFleet + 1 : 0;
    }
    const offset = getHeatOffset(heat, race);
    if (heat === 'A') {
      return entries + 1;
    }
    const nonPromoted = Math.max(0, entries - promotionCount);
    return offset + nonPromoted + 1;
  }, [getHeatOffset, getHeatEntryCount, promotionCount, getTotalNonPromotedFleet]);

  const getHeatRaceStats = useCallback((heat: HeatDesignation, race: number) => {
    let scoreCount = 0;
    let letterCount = 0;
    let totalPoints = 0;
    let entryCount = 0;

    for (let pos = 1; pos <= maxPositions; pos++) {
      const key = getCellKey(heat, pos, race);
      const cell = cells[key];
      if (!cell?.sailNumber?.trim()) continue;

      entryCount++;

      const isPromoted = heat !== 'A' && race > 1 && pos <= promotionCount;

      if (!isPromoted) {
        if (cell.letterScore) {
          letterCount++;
        } else {
          scoreCount++;
        }
      }
    }

    const maxExp = getMaxExpForHeat(heat, race);

    return { scoreCount, letterCount, totalPoints, entryCount, maxExp };
  }, [cells, maxPositions, promotionCount, getMaxExpForHeat]);

  const getEmptyRowScore = useCallback((heat: HeatDesignation, race: number): number | string => {
    const entryCount = getHeatEntryCount(heat, race);
    if (entryCount === 0) return '';
    const regularCount = getHeatNonLetterNonPromotedCount(heat, race);
    if (race === 1 || heat === 'A') return regularCount;
    const offset = getHeatOffset(heat, race);
    return offset + regularCount;
  }, [getHeatOffset, getHeatEntryCount, getHeatNonLetterNonPromotedCount]);

  const SEVERE_LETTER_SCORES: LetterScore[] = ['UFD', 'BFD', 'DSQ', 'DNE', 'WDN'];

  const getLetterScorePoints = useCallback((heat: HeatDesignation, race: number, ls: LetterScore): number => {
    if (SEVERE_LETTER_SCORES.includes(ls)) {
      if (race === 1) {
        return getLargestHeatEntryCount(race) + 1;
      }
      return getTotalNonPromotedFleet(race) + 1;
    }
    if (race === 1) {
      return getLargestHeatEntryCount(race);
    }
    const entries = getHeatEntryCount(heat, race);
    if (entries === 0) {
      return getTotalNonPromotedFleet(race);
    }
    if (heat === 'A') {
      return entries;
    }
    const offset = getHeatOffset(heat, race);
    const nonPromoted = Math.max(0, entries - promotionCount);
    return offset + nonPromoted;
  }, [getLargestHeatEntryCount, getTotalNonPromotedFleet, getHeatEntryCount, getHeatOffset, promotionCount]);

  const getPointsForCell = useCallback((heat: HeatDesignation, position: number, race: number, cell: CellData | undefined): number | string => {
    const hasSail = !!cell?.sailNumber?.trim();

    if (!hasSail) {
      return '';
    }

    const isPromoted = heat !== 'A' && race > 1 && position <= promotionCount;
    if (isPromoted) return '#N/A';

    if (cell?.letterScore) {
      if (cell.customPoints !== undefined && cell.customPoints > 0) return cell.customPoints;
      if (cell.customPoints === -1) return 'AVG';
      return getLetterScorePoints(heat, race, cell.letterScore);
    }

    if (race === 1 || heat === 'A') return position;

    const offset = getHeatOffset(heat, race);
    const effectivePos = position - promotionCount;
    return offset + effectivePos;
  }, [promotionCount, getHeatOffset, getLetterScorePoints]);

  const getExpForCell = useCallback((heat: HeatDesignation, position: number, race: number, cell: CellData | undefined): number | string => {
    const hasSail = !!cell?.sailNumber?.trim();
    const isPromoted = heat !== 'A' && race > 1 && position <= promotionCount;

    if (hasSail && isPromoted) {
      const offset = getHeatOffset(heat, race);
      return offset > 0 ? offset : getHeatEntryCount('A', race);
    }

    if (hasSail) {
      if (cell?.letterScore) {
        const okAbove = getOkCountAbovePosition(heat, position, race);
        if (race === 1 || heat === 'A') return okAbove;
        const offset = getHeatOffset(heat, race);
        return offset + okAbove;
      }
      if (race === 1 || heat === 'A') return position;
      const offset = getHeatOffset(heat, race);
      const effectivePos = position - promotionCount;
      return offset + effectivePos;
    }

    return getEmptyRowScore(heat, race);
  }, [getHeatOffset, getHeatEntryCount, getEmptyRowScore, getOkCountAbovePosition, promotionCount]);

  const availableSkippersForDropdown = useMemo(() => {
    if (!dropdownTarget) return [];
    const { heat, position, race } = dropdownTarget;
    const currentKey = getCellKey(heat, position, race);
    const usedSails = getUsedSailNumbersForRace(race, currentKey);
    const currentCell = cells[currentKey];
    const currentValue = currentCell?.sailNumber?.trim().toLowerCase() || '';

    return skippers
      .map((s, idx) => ({ skipper: s, index: idx }))
      .filter(({ skipper }) => {
        const sailNo = String(skipper.sailNumber || skipper.sailNo || skipper.boat_sail_number || '').trim();
        if (!sailNo) return false;
        if (usedSails.has(sailNo.toLowerCase())) return false;
        if (currentValue) {
          return (
            sailNo.toLowerCase().includes(currentValue) ||
            skipper.name.toLowerCase().includes(currentValue)
          );
        }
        if (dropdownFilter) {
          const filter = dropdownFilter.toLowerCase();
          return (
            sailNo.toLowerCase().includes(filter) ||
            skipper.name.toLowerCase().includes(filter)
          );
        }
        return true;
      });
  }, [dropdownTarget, skippers, getUsedSailNumbersForRace, dropdownFilter, cells]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, heat: HeatDesignation, position: number, race: number) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      setDropdownTarget(null);
      setDropdownFilter('');
      handleSailNumberBlur(heat, position, race);
      const nextKey = getCellKey(heat, position + 1, race);
      const ref = inputRefs.current[`${nextKey}-sail`];
      ref?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextKey = getCellKey(heat, position + 1, race);
      inputRefs.current[`${nextKey}-sail`]?.focus();
    } else if (e.key === 'ArrowUp' && position > 1) {
      e.preventDefault();
      const prevKey = getCellKey(heat, position - 1, race);
      inputRefs.current[`${prevKey}-sail`]?.focus();
    } else if (e.key === 'Escape') {
      setDropdownTarget(null);
      setDropdownFilter('');
    }
  }, [handleSailNumberBlur]);

  const getExpBasedScore = useCallback((heat: HeatDesignation, position: number, race: number, cell: CellData | undefined): number | string => {
    const hasSail = !!cell?.sailNumber?.trim();
    if (!hasSail) return '';

    const isPromoted = heat !== 'A' && race > 1 && position <= promotionCount;
    if (isPromoted) return '#N/A';

    if (cell?.letterScore) {
      if (cell.customPoints !== undefined && cell.customPoints > 0) return cell.customPoints;
      if (cell.customPoints === -1) return 'AVG';
      return getLetterScorePoints(heat, race, cell.letterScore);
    }

    const okAbove = getOkCountAbovePosition(heat, position, race);
    if (race === 1 || heat === 'A') {
      return okAbove + 1;
    }

    const offset = getHeatOffset(heat, race);
    return offset + okAbove + 1;
  }, [promotionCount, getLetterScorePoints, getOkCountAbovePosition, getHeatOffset]);

  const overallRaceResults = useMemo(() => {
    const results: any[] = [];
    const seenSkipperRaces = new Set<string>();

    for (let race = 1; race <= TOTAL_RACES; race++) {
      for (const heat of heats) {
        for (let position = 1; position <= maxPositions; position++) {
          const key = getCellKey(heat, position, race);
          const cell = cells[key];
          if (!cell?.sailNumber?.trim() || cell.skipperIndex == null) continue;

          const isPromoted = heat !== 'A' && race > 1 && position <= promotionCount;
          if (isPromoted) continue;

          const skipperRaceKey = `${cell.skipperIndex}-${race}`;
          if (seenSkipperRaces.has(skipperRaceKey)) continue;
          seenSkipperRaces.add(skipperRaceKey);

          const pts = getExpBasedScore(heat, position, race, cell);
          if (pts === '' || pts === '#N/A') continue;

          results.push({
            race,
            skipperIndex: cell.skipperIndex,
            position: typeof pts === 'number' ? pts : parseInt(String(pts), 10) || 999,
            letterScore: cell.letterScore || undefined,
          });
        }
      }
    }
    return results;
  }, [cells, heats, maxPositions, promotionCount, getExpBasedScore]);

  const raceSeparator = 'border-l-2 border-l-slate-400';

  return (
    <div className={`flex flex-col h-full text-slate-900 relative`}>
      <div className="absolute top-[-44px] right-0 z-30">
        <button
          onClick={() => setShowOverallResults(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          <Trophy size={14} />
          Overall Results
        </button>
      </div>
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-auto relative"
      >
        <table
          className="border-collapse text-xs bg-white"
          style={{ tableLayout: 'fixed', minWidth: 140 + TOTAL_RACES * 240 }}
        >
          <colgroup>
            <col style={{ width: 140, minWidth: 140 }} />
            {Array.from({ length: TOTAL_RACES }).map((_, i) => (
              <React.Fragment key={i}>
                <col style={{ width: 50 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 60 }} />
                <col style={{ width: 40 }} />
              </React.Fragment>
            ))}
          </colgroup>

          <thead className="sticky top-0 z-20">
            <tr>
              <th
                rowSpan={2}
                className="sticky left-0 z-30 px-1 py-0 border-b border-r border-slate-300 bg-black cursor-pointer"
                onClick={onOpenStartBox}
                title="Open StartBox"
              >
                <div className="flex items-center justify-center gap-1.5">
                  <Timer size={18} className="text-white" />
                  <span className="text-xs font-semibold text-white">StartBox</span>
                </div>
              </th>
              {Array.from({ length: TOTAL_RACES }, (_, i) => i + 1).map(race => {
                const isVerified = verifiedRaces.has(race);
                const isSeeding = race === 1;

                return (
                  <th
                    key={race}
                    colSpan={4}
                    className={`px-0.5 py-0 text-center border-b border-slate-300 ${raceSeparator}`}
                    style={{ backgroundColor: '#00FFFF' }}
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] font-extrabold text-black">
                          Race {race}
                        </span>
                        {isSeeding && (
                          <span className="text-[8px] font-medium px-1 py-0 rounded bg-blue-200 text-blue-800">
                            Seeding
                          </span>
                        )}
                        {isVerified && (
                          <CheckCircle2 size={10} className="text-emerald-600" />
                        )}
                        {!isSeeding && (
                          <span className="text-[7px] text-slate-600 font-medium">
                            P={promotionCount}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleVerifyRace(race)}
                          className="text-[8px] font-bold px-1.5 py-0 rounded border transition-colors border-black/20 text-black hover:opacity-80"
                          style={{ backgroundColor: '#FFFF00' }}
                        >
                          Verify R{race.toString().padStart(2, '0')}
                        </button>
                        <button
                          onClick={() => setResetConfirmRace(race)}
                          className="text-[8px] font-bold px-1.5 py-0 rounded text-white transition-colors hover:opacity-80"
                          style={{ backgroundColor: '#FF0000' }}
                        >
                          Reset
                        </button>
                      </div>
                    </div>
                  </th>
                );
              })}
            </tr>

            <tr>
              {Array.from({ length: TOTAL_RACES }, (_, i) => i + 1).map(race => (
                <React.Fragment key={race}>
                  <th className={`px-1 py-0 text-center text-[10px] font-extrabold border-b border-slate-300 ${raceSeparator} text-black whitespace-nowrap`} style={{ backgroundColor: '#00FFFF' }}>
                    Sail No
                  </th>
                  <th className="px-1 py-0 text-center text-[10px] font-extrabold border-b border-slate-300 text-black whitespace-nowrap" style={{ backgroundColor: '#00FFFF' }}>
                    Comments
                  </th>
                  <th className="px-1 py-0 text-center text-[10px] font-extrabold border-b border-slate-300 text-black whitespace-nowrap" style={{ backgroundColor: '#00FFFF' }}>
                    Points
                  </th>
                  <th className="px-1 py-0 text-center text-[10px] font-extrabold border-b border-slate-300 text-black whitespace-nowrap" style={{ backgroundColor: '#00FFFF' }}>
                    Exp.
                  </th>
                </React.Fragment>
              ))}
            </tr>
          </thead>

          <tbody>
            {heats.map((heat) => {
              const isTopHeat = heat === 'A';

              return (
                <React.Fragment key={heat}>
                  <tr style={{ height: 14 }}>
                    <td
                      className="sticky left-0 z-10 px-1 py-0 border-b border-r border-slate-400 font-bold text-[11px] text-black whitespace-nowrap text-center"
                      style={{ backgroundColor: '#FF00FF' }}
                    >
                      Heat {heat}
                    </td>
                    {Array.from({ length: TOTAL_RACES }, (_, i) => i + 1).map(race => {
                      const stats = getHeatRaceStats(heat, race);
                      return (
                        <React.Fragment key={race}>
                          <td
                            className={`px-0 py-0 border-b border-slate-400 ${raceSeparator} text-black text-[10px] font-bold text-center`}
                            style={{ backgroundColor: '#FF0000' }}
                          >
                            {String(stats.entryCount).padStart(2, '0')}
                          </td>
                          <td
                            className="px-0 py-0 border-b border-slate-400 text-black text-[10px] font-bold text-center"
                            style={{ backgroundColor: '#FF0000' }}
                          >
                            {stats.letterCount > 0 ? stats.letterCount : '0'}
                          </td>
                          <td
                            className="px-0 py-0 border-b border-slate-400 text-black text-[10px] font-bold text-center"
                            style={{ backgroundColor: '#FF0000' }}
                          >
                            0
                          </td>
                          <td
                            className="px-0 py-0 border-b border-slate-400 text-black text-[10px] font-bold text-center"
                            style={{ backgroundColor: '#FF0000' }}
                          >
                            {String(stats.maxExp).padStart(2, '0')}
                          </td>
                        </React.Fragment>
                      );
                    })}
                  </tr>

                  {Array.from({ length: maxPositions }, (_, posIdx) => posIdx + 1).map(position => {
                    const showPromotion = !isTopHeat && isPromotionRow(heat, position);

                    return (
                      <tr
                        key={`${heat}-${position}`}
                        className="hover:bg-slate-50"
                        style={{ height: 16 }}
                      >
                        <td
                          className="sticky left-0 z-10 px-1 py-0 text-[11px] font-extrabold border-r border-slate-300 whitespace-nowrap text-black text-center leading-none"
                          style={{ backgroundColor: '#FFFF00' }}
                        >
                          {getOrdinal(position)}
                        </td>

                        {Array.from({ length: TOTAL_RACES }, (_, i) => i + 1).map(race => {
                          const key = getCellKey(heat, position, race);
                          const cell = cells[key];
                          const isDropdownOpen = dropdownTarget?.heat === heat && dropdownTarget?.position === position && dropdownTarget?.race === race;
                          const hasSail = !!cell?.sailNumber?.trim();
                          const isInvalid = hasSail && cell?.isValid === false;
                          const isDup = hasSail && cell?.isDuplicate;
                          const ls = cell?.letterScore;
                          const isPromotedSlot = showPromotion && race > 1;
                          const pts = getPointsForCell(heat, position, race, cell);
                          const exp = getExpForCell(heat, position, race, cell);
                          const isPromotedEntry = hasSail && isPromotedSlot;

                          const promotionStyle = isPromotedSlot
                            ? { backgroundColor: '#00FF00' }
                            : undefined;
                          const cellBorderClass = isPromotedSlot
                            ? ''
                            : 'border-b border-r border-slate-300';

                          return (
                            <React.Fragment key={race}>
                              <td
                                className={`px-0 py-0 ${cellBorderClass} ${raceSeparator} relative`}
                                style={promotionStyle}
                              >
                                <input
                                  ref={el => { inputRefs.current[`${key}-sail`] = el; }}
                                  type="text"
                                  value={cell?.sailNumber || ''}
                                  onChange={e => handleSailNumberInput(heat, position, race, e.target.value)}
                                  onBlur={() => {
                                    setTimeout(() => {
                                      if (!dropdownRef.current?.contains(document.activeElement)) {
                                        handleSailNumberBlur(heat, position, race);
                                      }
                                    }, 150);
                                  }}
                                  onFocus={() => {
                                    setDropdownTarget({ heat, position, race });
                                    setDropdownFilter('');
                                  }}
                                  onKeyDown={e => handleKeyDown(e, heat, position, race)}
                                  className={`w-full px-0.5 py-0 text-[11px] text-center border-0 outline-none bg-transparent leading-none
                                    ${isInvalid
                                      ? 'text-red-500 font-bold'
                                      : isDup
                                        ? 'text-amber-500 font-bold'
                                        : 'text-black font-medium'
                                    }
                                    focus:ring-1 focus:ring-inset focus:ring-blue-400/40
                                  `}
                                  placeholder=""
                                />
                                {isDropdownOpen && availableSkippersForDropdown.length > 0 && (
                                  <div
                                    ref={dropdownRef}
                                    className="absolute top-full left-0 z-50 w-48 max-h-48 overflow-auto rounded-lg shadow-2xl border bg-white border-slate-200"
                                    style={{ minWidth: 180 }}
                                  >
                                    <div className="sticky top-0 p-1.5 border-b bg-white border-slate-100">
                                      <div className="relative">
                                        <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input
                                          type="text"
                                          value={dropdownFilter}
                                          onChange={e => setDropdownFilter(e.target.value)}
                                          placeholder="Filter..."
                                          className="w-full pl-6 pr-2 py-1 text-[10px] rounded border outline-none bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400"
                                        />
                                      </div>
                                    </div>
                                    {availableSkippersForDropdown.map(({ skipper, index }) => (
                                      <button
                                        key={index}
                                        onMouseDown={e => {
                                          e.preventDefault();
                                          handleDropdownSelect(heat, position, race, skipper, index);
                                        }}
                                        className="w-full px-3 py-1.5 text-left flex items-center gap-2 transition-colors hover:bg-slate-50 text-slate-700"
                                      >
                                        <span className="text-[12px] font-bold min-w-[28px] text-black">
                                          {skipper.sailNumber || skipper.sailNo || skipper.boat_sail_number}
                                        </span>
                                        <span className="text-[11px] truncate">
                                          {skipper.name}
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </td>

                              <td
                                className={`px-0 py-0 ${cellBorderClass} cursor-pointer`}
                                style={promotionStyle}
                                onClick={() => handleCommentClick(heat, position, race)}
                              >
                                {isPromotedEntry ? (
                                  <div className="px-1 py-0 text-[10px] text-center font-bold text-black leading-none">
                                    UP
                                  </div>
                                ) : ls ? (
                                  <div className="px-1 py-0 text-[10px] text-center font-medium text-black leading-none">
                                    {ls}
                                  </div>
                                ) : hasSail ? (
                                  <div className="px-1 py-0 text-[10px] text-center font-medium text-black leading-none">
                                    OK
                                  </div>
                                ) : null}
                              </td>

                              <td
                                className={`px-0 py-0 ${cellBorderClass}`}
                                style={promotionStyle}
                              >
                                <div className={`px-1 py-0 text-[10px] text-center font-medium tabular-nums leading-none ${
                                  hasSail ? 'text-black' : ''
                                }`}>
                                  {pts !== '' ? pts : ''}
                                </div>
                              </td>

                              <td
                                className={`px-0 py-0 ${cellBorderClass}`}
                                style={promotionStyle}
                              >
                                <div className="px-1 py-0 text-[10px] text-center font-medium tabular-nums leading-none text-black">
                                  {exp !== '' ? exp : ''}
                                </div>
                              </td>
                            </React.Fragment>
                          );
                        })}
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {resetConfirmRace !== null && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-sm rounded-xl shadow-2xl overflow-hidden bg-white">
            <div className="flex items-center gap-2 p-4 border-b border-slate-200">
              <AlertTriangle className="text-red-500" size={20} />
              <h3 className="font-bold text-slate-900">
                Reset Race {resetConfirmRace}?
              </h3>
            </div>
            <div className="p-4">
              <p className="text-sm text-slate-600">
                This will clear all scores for Race {resetConfirmRace} across all heats. This cannot be undone.
              </p>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-slate-200">
              <button
                onClick={() => setResetConfirmRace(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-slate-100 text-slate-700 hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={() => handleResetRace(resetConfirmRace)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors hover:opacity-80"
                style={{ backgroundColor: '#FF0000' }}
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {verifyTarget !== null && verifyResult && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-md rounded-xl shadow-2xl overflow-hidden bg-white">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                {verifyResult.valid ? (
                  <ShieldCheck className="text-emerald-500" size={20} />
                ) : (
                  <AlertTriangle className="text-amber-500" size={20} />
                )}
                <h3 className="font-bold text-slate-900">
                  Verify Race {verifyTarget}
                </h3>
              </div>
              <button
                onClick={() => { setVerifyTarget(null); setVerifyResult(null); }}
                className="p-1 rounded-lg hover:bg-slate-100"
              >
                <X size={16} className="text-slate-500" />
              </button>
            </div>
            <div className="p-4 space-y-3 max-h-64 overflow-auto">
              {verifyResult.valid && verifyResult.warnings.length === 0 && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 text-emerald-700">
                  <CheckCircle2 size={16} />
                  <span className="text-sm font-medium">All entries are valid</span>
                </div>
              )}
              {verifyResult.errors.map((err, i) => (
                <div key={i} className="flex items-start gap-2 p-2 rounded-lg text-xs bg-red-50 text-red-700">
                  <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                  <span>{err}</span>
                </div>
              ))}
              {verifyResult.warnings.map((warn, i) => (
                <div key={i} className="flex items-start gap-2 p-2 rounded-lg text-xs bg-amber-50 text-amber-700">
                  <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                  <span>{warn}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-end p-4 border-t border-slate-200">
              <button
                onClick={() => { setVerifyTarget(null); setVerifyResult(null); }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  verifyResult.valid
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {verifyResult.valid ? 'Done' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {noSuchBoatTarget && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-sm rounded-xl shadow-2xl overflow-hidden bg-white">
            <div className="flex items-center gap-3 p-4 border-b border-slate-200">
              <AlertCircle className="text-red-500" size={24} />
              <h3 className="font-bold text-slate-900 text-lg">NO SUCH BOAT!</h3>
            </div>
            <div className="p-4">
              <p className="text-sm text-slate-700">
                There is no boat with Sail Number <span className="font-bold">"{noSuchBoatTarget.sailNumber}"</span> in the event.
              </p>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-slate-200">
              <button
                onClick={handleNoSuchBoatCancel}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-slate-100 text-slate-700 hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={handleNoSuchBoatRetry}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      )}

      {showLetterScoreModal && letterScoreTarget && (
        <LetterScoreSelector
          isOpen={showLetterScoreModal}
          onClose={() => {
            setShowLetterScoreModal(false);
            setLetterScoreTarget(null);
          }}
          onSelect={handleLetterScoreSelect}
          darkMode={darkMode}
          raceNumber={letterScoreTarget.race}
          skipperName={(() => {
            const key = getCellKey(letterScoreTarget.heat, letterScoreTarget.position, letterScoreTarget.race);
            const cell = cells[key];
            if (cell?.sailNumber) {
              const idx = sailNumberMap[cell.sailNumber.toLowerCase()];
              return idx !== undefined ? skippers[idx]?.name || cell.sailNumber : cell.sailNumber;
            }
            return '';
          })()}
          isHeatRacing={true}
        />
      )}

      <HeatOverallResultsModal
        isOpen={showOverallResults}
        onClose={() => setShowOverallResults(false)}
        skippers={skippers}
        heatManagement={heatManagement}
        dropRules={currentEvent?.dropRules || [4, 8, 16, 24, 32, 40]}
        darkMode={darkMode}
        externalRaceResults={overallRaceResults}
      />
    </div>
  );
};
