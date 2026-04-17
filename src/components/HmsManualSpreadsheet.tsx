import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { Skipper } from '../types';
import { HeatDesignation, HeatManagement } from '../types/heat';
import { RaceEvent } from '../types/race';
import { LetterScore } from '../types/letterScores';
import { LetterScoreSelector } from './LetterScoreSelector';
import { CircleCheck as CheckCircle2, TriangleAlert as AlertTriangle, ShieldCheck, X, Search } from 'lucide-react';

const LETTER_SCORE_CODES: LetterScore[] = [
  'DNS', 'DNF', 'DSQ', 'OCS', 'BFD', 'UFD', 'RDG', 'DPI',
  'ZFP', 'SCP', 'RET', 'DNC', 'DNE', 'NSC', 'WDN'
];

const LETTER_SCORE_COLORS: Record<string, { bg: string; text: string; darkBg: string; darkText: string }> = {
  DNF: { bg: 'bg-orange-100', text: 'text-orange-700', darkBg: 'bg-orange-900/40', darkText: 'text-orange-300' },
  NSC: { bg: 'bg-orange-100', text: 'text-orange-700', darkBg: 'bg-orange-900/40', darkText: 'text-orange-300' },
  RET: { bg: 'bg-amber-100', text: 'text-amber-700', darkBg: 'bg-amber-900/40', darkText: 'text-amber-300' },
  OCS: { bg: 'bg-yellow-100', text: 'text-yellow-700', darkBg: 'bg-yellow-900/40', darkText: 'text-yellow-300' },
  DNS: { bg: 'bg-red-100', text: 'text-red-700', darkBg: 'bg-red-900/40', darkText: 'text-red-300' },
  DNC: { bg: 'bg-red-100', text: 'text-red-700', darkBg: 'bg-red-900/40', darkText: 'text-red-300' },
  UFD: { bg: 'bg-rose-100', text: 'text-rose-700', darkBg: 'bg-rose-900/40', darkText: 'text-rose-300' },
  BFD: { bg: 'bg-slate-200', text: 'text-slate-800', darkBg: 'bg-slate-700', darkText: 'text-slate-200' },
  DSQ: { bg: 'bg-red-200', text: 'text-red-800', darkBg: 'bg-red-900/50', darkText: 'text-red-200' },
  DNE: { bg: 'bg-red-200', text: 'text-red-800', darkBg: 'bg-red-900/50', darkText: 'text-red-200' },
  WDN: { bg: 'bg-slate-200', text: 'text-slate-700', darkBg: 'bg-slate-700', darkText: 'text-slate-300' },
  RDG: { bg: 'bg-green-100', text: 'text-green-700', darkBg: 'bg-green-900/40', darkText: 'text-green-300' },
  DPI: { bg: 'bg-pink-100', text: 'text-pink-700', darkBg: 'bg-pink-900/40', darkText: 'text-pink-300' },
  ZFP: { bg: 'bg-teal-100', text: 'text-teal-700', darkBg: 'bg-teal-900/40', darkText: 'text-teal-300' },
  SCP: { bg: 'bg-cyan-100', text: 'text-cyan-700', darkBg: 'bg-cyan-900/40', darkText: 'text-cyan-300' },
};

const HEAT_HEADER_COLORS: Record<HeatDesignation, string> = {
  'A': 'bg-yellow-600', 'B': 'bg-orange-600', 'C': 'bg-red-600',
  'D': 'bg-green-600', 'E': 'bg-blue-600', 'F': 'bg-teal-600'
};

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
  updateRaceResults: (race: number, skipperIndex: number, position: number | null, letterScore?: any, customPoints?: number) => void;
  deleteRaceResult: (race: number, skipperIndex: number) => void;
  isFullscreen?: boolean;
}

const parseSmartInput = (raw: string): { sailNumber: string; letterScore: LetterScore | null } => {
  const trimmed = raw.trim();
  const regex = /^(\S+)\s+(DNS|DNF|DSQ|OCS|BFD|UFD|RDG|DPI|ZFP|SCP|RET|DNC|DNE|NSC|WDN)$/i;
  const match = trimmed.match(regex);
  if (match) {
    return {
      sailNumber: match[1],
      letterScore: match[2].toUpperCase() as LetterScore,
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
}) => {
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

  const sailNumberMap = useMemo(() => {
    const map: Record<string, number> = {};
    skippers.forEach((s, idx) => {
      const sailNo = String(s.sailNumber || '').trim();
      if (sailNo) {
        map[sailNo.toLowerCase()] = idx;
      }
    });
    return map;
  }, [skippers]);

  const getCellKey = (heat: HeatDesignation, position: number, race: number) =>
    `${heat}-${position}-${race}`;

  useEffect(() => {
    const newCells: Record<string, CellData> = {};
    raceResults.forEach((result: any) => {
      if (result.hmsHeat && result.hmsPosition && result.race) {
        const key = getCellKey(result.hmsHeat, result.hmsPosition, result.race);
        const skipper = skippers[result.skipperIndex];
        const sailNo = skipper?.sailNumber || '';
        newCells[key] = {
          sailNumber: sailNo,
          comment: result.letterScore || (sailNo ? 'OK' : ''),
          points: result.letterScore ? '' : (result.position?.toString() || ''),
          letterScore: result.letterScore || null,
          customPoints: result.customPoints,
          skipperIndex: result.skipperIndex,
          isValid: true,
          isDuplicate: false,
        };
      }
    });
    setCells(prev => {
      const merged = { ...prev };
      Object.entries(newCells).forEach(([k, v]) => {
        if (!merged[k] || !merged[k].sailNumber) {
          merged[k] = v;
        }
      });
      return merged;
    });
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
    const { sailNumber, letterScore } = parseSmartInput(rawValue);
    const key = getCellKey(heat, position, race);
    const sailLower = sailNumber.toLowerCase();
    const skipperIdx = sailNumberMap[sailLower] ?? null;

    setCells(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        sailNumber: sailNumber,
        comment: letterScore ? letterScore : (sailNumber.trim() ? 'OK' : ''),
        points: letterScore ? '' : (prev[key]?.points || ''),
        letterScore: letterScore,
        skipperIndex: skipperIdx,
        isValid: !sailNumber.trim() || skipperIdx !== null,
        isDuplicate: false,
      }
    }));

    if (sailNumber.trim()) {
      setDropdownFilter(sailNumber);
    }
  }, [sailNumberMap]);

  const handleSailNumberBlur = useCallback((heat: HeatDesignation, position: number, race: number) => {
    const key = getCellKey(heat, position, race);
    const cell = cells[key];
    if (!cell?.sailNumber?.trim()) return;

    const skipperIdx = cell.skipperIndex ?? sailNumberMap[cell.sailNumber.toLowerCase()];
    if (skipperIdx !== undefined && skipperIdx !== null) {
      if (cell.letterScore) {
        updateRaceResults(race, skipperIdx, null, cell.letterScore, cell.customPoints);
      } else {
        updateRaceResults(race, skipperIdx, position, undefined, undefined);
      }
    }
  }, [cells, sailNumberMap, updateRaceResults]);

  const handleDropdownSelect = useCallback((heat: HeatDesignation, position: number, race: number, skipper: Skipper, skipperIdx: number) => {
    const key = getCellKey(heat, position, race);
    const sailNo = String(skipper.sailNumber || '').trim();

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

    updateRaceResults(race, skipperIdx, position, undefined, undefined);
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
        deleteRaceResult(race, cell.skipperIndex);
        updateRaceResults(race, cell.skipperIndex, position, undefined, undefined);
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
        updateRaceResults(race, cell.skipperIndex, null, score, customPoints);
      }
    }

    setShowLetterScoreModal(false);
    setLetterScoreTarget(null);
  }, [letterScoreTarget, cells, updateRaceResults, deleteRaceResult]);

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
    }
  }, [verifyRace]);

  const isPromotionRow = (heat: HeatDesignation, position: number, race: number) => {
    if (heat === 'A') return false;
    return race > 1 && position <= promotionCount;
  };

  const getRaceEntryCount = useCallback((race: number) => {
    let count = 0;
    heats.forEach(heat => {
      for (let pos = 1; pos <= maxPositions; pos++) {
        const key = getCellKey(heat, pos, race);
        if (cells[key]?.sailNumber?.trim()) count++;
      }
    });
    return count;
  }, [cells, heats, maxPositions]);

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
        const sailNo = String(skipper.sailNumber || '').trim();
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

  const borderColor = darkMode ? 'border-slate-700/50' : 'border-slate-200';
  const headerBg = darkMode ? 'bg-slate-800' : 'bg-slate-100';
  const subHeaderBg = darkMode ? 'bg-slate-800/60' : 'bg-slate-50';
  const cellBg = darkMode ? 'bg-slate-900' : 'bg-white';
  const positionBg = darkMode ? 'bg-slate-900' : 'bg-white';

  return (
    <div className={`flex flex-col h-full ${darkMode ? 'text-white' : 'text-slate-900'}`}>
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-auto relative"
      >
        <table className={`border-collapse text-xs ${cellBg}`} style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 48 }} />
            {Array.from({ length: TOTAL_RACES }).map((_, i) => (
              <React.Fragment key={i}>
                <col style={{ width: 52 }} />
                <col style={{ width: 40 }} />
                <col style={{ width: 32 }} />
              </React.Fragment>
            ))}
          </colgroup>

          <thead className="sticky top-0 z-20">
            <tr>
              <th className={`sticky left-0 z-30 px-1 py-1.5 border-b border-r ${borderColor} ${headerBg}`} />
              {Array.from({ length: TOTAL_RACES }, (_, i) => i + 1).map(race => {
                const entryCount = getRaceEntryCount(race);
                const isVerified = verifiedRaces.has(race);
                const isSeeding = race === 1;

                return (
                  <th
                    key={race}
                    colSpan={3}
                    className={`px-0.5 py-1 text-center border-b border-r ${borderColor} ${headerBg}`}
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <div className="flex items-center gap-1">
                        <span className={`font-bold text-[11px] uppercase tracking-widest ${
                          isSeeding
                            ? darkMode ? 'text-blue-300' : 'text-blue-700'
                            : darkMode ? 'text-slate-300' : 'text-slate-600'
                        }`}>
                          R{race}
                        </span>
                        {isSeeding && (
                          <span className={`text-[8px] px-1 py-0.5 rounded font-bold uppercase tracking-wider ${
                            darkMode ? 'bg-blue-900/50 text-blue-300' : 'bg-blue-100 text-blue-600'
                          }`}>
                            Seed
                          </span>
                        )}
                        {isVerified && (
                          <CheckCircle2 size={10} className="text-emerald-500" />
                        )}
                      </div>
                      {entryCount > 0 && (
                        <button
                          onClick={() => handleVerifyRace(race)}
                          className={`text-[8px] px-1.5 py-0.5 rounded font-medium transition-all ${
                            isVerified
                              ? darkMode ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-50 text-emerald-600'
                              : darkMode ? 'bg-amber-900/30 text-amber-300 hover:bg-amber-900/50' : 'bg-amber-50 text-amber-600 hover:bg-amber-100'
                          }`}
                        >
                          {isVerified ? 'Verified' : 'Verify'}
                        </button>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>

            <tr>
              <th className={`sticky left-0 z-30 px-1 py-1 border-b border-r text-[9px] font-bold uppercase tracking-wider ${borderColor} ${subHeaderBg} ${
                darkMode ? 'text-slate-500' : 'text-slate-400'
              }`}>
                Pos
              </th>
              {Array.from({ length: TOTAL_RACES }, (_, i) => i + 1).map(race => (
                <React.Fragment key={race}>
                  <th className={`px-0.5 py-1 text-center text-[9px] font-bold border-b border-r tracking-wider uppercase ${borderColor} ${subHeaderBg} ${
                    darkMode ? 'text-slate-500' : 'text-slate-400'
                  }`}>
                    Sail
                  </th>
                  <th className={`px-0.5 py-1 text-center text-[9px] font-bold border-b border-r tracking-wider uppercase ${borderColor} ${subHeaderBg} ${
                    darkMode ? 'text-slate-500' : 'text-slate-400'
                  }`}>
                    Cmt
                  </th>
                  <th className={`px-0.5 py-1 text-center text-[9px] font-bold border-b border-r tracking-wider uppercase ${borderColor} ${subHeaderBg} ${
                    darkMode ? 'text-slate-500' : 'text-slate-400'
                  }`}>
                    Pts
                  </th>
                </React.Fragment>
              ))}
            </tr>
          </thead>

          <tbody>
            {heats.map((heat) => {
              const heatColor = HEAT_HEADER_COLORS[heat] || 'bg-slate-600';
              const isTopHeat = heat === heats[0];

              return (
                <React.Fragment key={heat}>
                  <tr>
                    <td
                      className={`sticky left-0 z-10 px-2 py-1.5 border-b border-r font-bold text-xs text-white tracking-wide ${heatColor}`}
                    >
                      <span className="font-bold text-sm">Heat {heat}</span>
                    </td>
                    {Array.from({ length: TOTAL_RACES }, (_, i) => i + 1).map(race => (
                      <td
                        key={race}
                        colSpan={3}
                        className={`px-1 py-1.5 border-b border-r text-white ${heatColor}`}
                      />
                    ))}
                  </tr>

                  {Array.from({ length: maxPositions }, (_, posIdx) => posIdx + 1).map(position => {
                    const showPromotion = !isTopHeat && isPromotionRow(heat, position, 2);

                    return (
                      <tr
                        key={`${heat}-${position}`}
                        className={`group transition-colors ${
                          darkMode ? 'hover:bg-slate-800/50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className={`sticky left-0 z-10 px-2 py-0 text-[10px] font-bold border-b border-r whitespace-nowrap ${borderColor} ${
                          showPromotion
                            ? darkMode
                              ? 'bg-green-950/30 text-green-400'
                              : 'bg-green-50 text-green-700'
                            : darkMode
                              ? 'bg-slate-900 text-slate-400'
                              : 'bg-white text-slate-500'
                        }`}>
                          <div className="flex items-center gap-1">
                            {showPromotion && (
                              <div className={`w-1 h-3 rounded-full ${darkMode ? 'bg-green-500' : 'bg-green-400'}`} />
                            )}
                            {getOrdinal(position)}
                          </div>
                        </td>

                        {Array.from({ length: TOTAL_RACES }, (_, i) => i + 1).map(race => {
                          const key = getCellKey(heat, position, race);
                          const cell = cells[key];
                          const isDropdownOpen = dropdownTarget?.heat === heat && dropdownTarget?.position === position && dropdownTarget?.race === race;
                          const hasSail = !!cell?.sailNumber?.trim();
                          const isInvalid = hasSail && cell?.isValid === false;
                          const isDup = hasSail && cell?.isDuplicate;
                          const ls = cell?.letterScore;
                          const lsColor = ls ? LETTER_SCORE_COLORS[ls] : null;

                          return (
                            <React.Fragment key={race}>
                              <td className={`px-0 py-0 border-b border-r ${borderColor} ${cellBg} relative`}>
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
                                  className={`w-full px-1 py-[3px] text-[11px] text-center border-0 outline-none transition-all
                                    ${cellBg}
                                    ${isInvalid
                                      ? darkMode ? 'text-red-400 bg-red-950/30' : 'text-red-500 bg-red-50'
                                      : isDup
                                        ? darkMode ? 'text-amber-400 bg-amber-950/30' : 'text-amber-500 bg-amber-50'
                                        : hasSail
                                          ? darkMode ? 'text-white font-medium' : 'text-slate-900 font-medium'
                                          : darkMode ? 'text-slate-600' : 'text-slate-300'
                                    }
                                    focus:ring-1 focus:ring-inset ${darkMode ? 'focus:ring-blue-500/50' : 'focus:ring-blue-400/50'}
                                    placeholder:text-transparent
                                  `}
                                  placeholder=""
                                />
                                {isDropdownOpen && availableSkippersForDropdown.length > 0 && (
                                  <div
                                    ref={dropdownRef}
                                    className={`absolute top-full left-0 z-50 w-48 max-h-48 overflow-auto rounded-lg shadow-2xl border ${
                                      darkMode
                                        ? 'bg-slate-800 border-slate-600'
                                        : 'bg-white border-slate-200'
                                    }`}
                                    style={{ minWidth: 180 }}
                                  >
                                    <div className={`sticky top-0 p-1.5 border-b ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'}`}>
                                      <div className="relative">
                                        <Search size={10} className={`absolute left-2 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} />
                                        <input
                                          type="text"
                                          value={dropdownFilter}
                                          onChange={e => setDropdownFilter(e.target.value)}
                                          placeholder="Filter..."
                                          className={`w-full pl-6 pr-2 py-1 text-[10px] rounded border outline-none ${
                                            darkMode
                                              ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-500'
                                              : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'
                                          }`}
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
                                        className={`w-full px-3 py-1.5 text-left flex items-center gap-2 transition-colors ${
                                          darkMode
                                            ? 'hover:bg-slate-700 text-slate-200'
                                            : 'hover:bg-slate-50 text-slate-700'
                                        }`}
                                      >
                                        <span className={`text-[11px] font-bold min-w-[28px] ${
                                          darkMode ? 'text-blue-400' : 'text-blue-600'
                                        }`}>
                                          {skipper.sailNumber}
                                        </span>
                                        <span className="text-[10px] truncate">
                                          {skipper.name}
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </td>

                              <td
                                className={`px-0 py-0 border-b border-r ${borderColor} ${cellBg} cursor-pointer`}
                                onClick={() => handleCommentClick(heat, position, race)}
                              >
                                {ls && lsColor ? (
                                  <div className={`px-0.5 py-[3px] text-[10px] text-center font-bold rounded-sm mx-0.5 ${
                                    darkMode ? lsColor.darkBg + ' ' + lsColor.darkText : lsColor.bg + ' ' + lsColor.text
                                  }`}>
                                    {ls}
                                  </div>
                                ) : hasSail ? (
                                  <div className={`px-1 py-[3px] text-[10px] text-center font-medium ${
                                    darkMode ? 'text-green-500' : 'text-green-600'
                                  }`}>
                                    OK
                                  </div>
                                ) : null}
                              </td>

                              <td className={`px-0 py-0 border-b border-r ${borderColor} ${cellBg}`}>
                                <div className={`px-1 py-[3px] text-[10px] text-center font-medium tabular-nums ${
                                  ls
                                    ? darkMode ? 'text-slate-500' : 'text-slate-400'
                                    : hasSail
                                      ? darkMode ? 'text-slate-300' : 'text-slate-700'
                                      : ''
                                }`}>
                                  {ls
                                    ? (cell?.customPoints && cell.customPoints > 0 ? cell.customPoints : '')
                                    : hasSail ? position : ''
                                  }
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

      {verifyTarget !== null && verifyResult && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`w-full max-w-md rounded-xl shadow-2xl overflow-hidden ${
            darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white'
          }`}>
            <div className={`flex items-center justify-between p-4 border-b ${
              darkMode ? 'border-slate-700' : 'border-slate-200'
            }`}>
              <div className="flex items-center gap-2">
                {verifyResult.valid ? (
                  <ShieldCheck className="text-emerald-500" size={20} />
                ) : (
                  <AlertTriangle className="text-amber-500" size={20} />
                )}
                <h3 className={`font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  Verify Race {verifyTarget}
                </h3>
              </div>
              <button
                onClick={() => { setVerifyTarget(null); setVerifyResult(null); }}
                className={`p-1 rounded-lg ${darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}
              >
                <X size={16} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
              </button>
            </div>
            <div className="p-4 space-y-3 max-h-64 overflow-auto">
              {verifyResult.valid && verifyResult.warnings.length === 0 && (
                <div className={`flex items-center gap-2 p-3 rounded-lg ${
                  darkMode ? 'bg-emerald-900/20 text-emerald-300' : 'bg-emerald-50 text-emerald-700'
                }`}>
                  <CheckCircle2 size={16} />
                  <span className="text-sm font-medium">All entries are valid</span>
                </div>
              )}
              {verifyResult.errors.map((err, i) => (
                <div key={i} className={`flex items-start gap-2 p-2 rounded-lg text-xs ${
                  darkMode ? 'bg-red-900/20 text-red-300' : 'bg-red-50 text-red-700'
                }`}>
                  <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                  <span>{err}</span>
                </div>
              ))}
              {verifyResult.warnings.map((warn, i) => (
                <div key={i} className={`flex items-start gap-2 p-2 rounded-lg text-xs ${
                  darkMode ? 'bg-amber-900/20 text-amber-300' : 'bg-amber-50 text-amber-700'
                }`}>
                  <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                  <span>{warn}</span>
                </div>
              ))}
            </div>
            <div className={`flex justify-end p-4 border-t ${
              darkMode ? 'border-slate-700' : 'border-slate-200'
            }`}>
              <button
                onClick={() => { setVerifyTarget(null); setVerifyResult(null); }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  verifyResult.valid
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                    : darkMode
                      ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {verifyResult.valid ? 'Done' : 'Close'}
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
    </div>
  );
};
