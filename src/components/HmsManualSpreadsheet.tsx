import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { Skipper } from '../types';
import { HeatDesignation, HeatManagement } from '../types/heat';
import { RaceEvent } from '../types/race';
import { LetterScore } from '../types/letterScores';
import { LetterScoreSelector } from './LetterScoreSelector';
import { Settings, RotateCcw, CircleCheck as CheckCircle2, TriangleAlert as AlertTriangle, ChevronDown, Anchor, ShieldCheck, Sparkles, X, Search } from 'lucide-react';

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

interface HeatTheme {
  gradient: string;
  gradientDark: string;
  accent: string;
  accentLight: string;
  accentDark: string;
  badge: string;
  badgeDark: string;
  ring: string;
}

const HEAT_THEMES: Record<HeatDesignation, HeatTheme> = {
  'A': {
    gradient: 'bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500',
    gradientDark: 'bg-gradient-to-r from-amber-600 via-yellow-500 to-amber-600',
    accent: 'border-amber-400',
    accentLight: 'bg-amber-50',
    accentDark: 'bg-amber-950/30',
    badge: 'bg-amber-100 text-amber-800',
    badgeDark: 'bg-amber-900/40 text-amber-200',
    ring: 'ring-amber-400/50',
  },
  'B': {
    gradient: 'bg-gradient-to-r from-rose-600 via-red-500 to-rose-600',
    gradientDark: 'bg-gradient-to-r from-rose-700 via-red-600 to-rose-700',
    accent: 'border-rose-400',
    accentLight: 'bg-rose-50',
    accentDark: 'bg-rose-950/30',
    badge: 'bg-rose-100 text-rose-800',
    badgeDark: 'bg-rose-900/40 text-rose-200',
    ring: 'ring-rose-400/50',
  },
  'C': {
    gradient: 'bg-gradient-to-r from-emerald-600 via-green-500 to-emerald-600',
    gradientDark: 'bg-gradient-to-r from-emerald-700 via-green-600 to-emerald-700',
    accent: 'border-emerald-400',
    accentLight: 'bg-emerald-50',
    accentDark: 'bg-emerald-950/30',
    badge: 'bg-emerald-100 text-emerald-800',
    badgeDark: 'bg-emerald-900/40 text-emerald-200',
    ring: 'ring-emerald-400/50',
  },
  'D': {
    gradient: 'bg-gradient-to-r from-blue-600 via-blue-500 to-blue-600',
    gradientDark: 'bg-gradient-to-r from-blue-700 via-blue-600 to-blue-700',
    accent: 'border-blue-400',
    accentLight: 'bg-blue-50',
    accentDark: 'bg-blue-950/30',
    badge: 'bg-blue-100 text-blue-800',
    badgeDark: 'bg-blue-900/40 text-blue-200',
    ring: 'ring-blue-400/50',
  },
  'E': {
    gradient: 'bg-gradient-to-r from-sky-600 via-cyan-500 to-sky-600',
    gradientDark: 'bg-gradient-to-r from-sky-700 via-cyan-600 to-sky-700',
    accent: 'border-sky-400',
    accentLight: 'bg-sky-50',
    accentDark: 'bg-sky-950/30',
    badge: 'bg-sky-100 text-sky-800',
    badgeDark: 'bg-sky-900/40 text-sky-200',
    ring: 'ring-sky-400/50',
  },
  'F': {
    gradient: 'bg-gradient-to-r from-teal-600 via-teal-500 to-teal-600',
    gradientDark: 'bg-gradient-to-r from-teal-700 via-teal-600 to-teal-700',
    accent: 'border-teal-400',
    accentLight: 'bg-teal-50',
    accentDark: 'bg-teal-950/30',
    badge: 'bg-teal-100 text-teal-800',
    badgeDark: 'bg-teal-900/40 text-teal-200',
    ring: 'ring-teal-400/50',
  },
};

const HEAT_LABELS: HeatDesignation[] = ['A', 'B', 'C', 'D', 'E', 'F'];
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
  const heats = HEAT_LABELS.slice(0, numberOfHeats);
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

  const handleResetAll = useCallback(() => {
    if (!confirm('Reset all entries in the spreadsheet? This cannot be undone.')) return;
    setCells({});
    setVerifiedRaces(new Set());
  }, []);

  const isPromotionRow = (position: number, race: number) => {
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

    return skippers
      .map((s, idx) => ({ skipper: s, index: idx }))
      .filter(({ skipper }) => {
        const sailNo = String(skipper.sailNumber || '').trim();
        if (!sailNo) return false;
        const isUsed = usedSails.has(sailNo.toLowerCase());
        if (dropdownFilter) {
          const filter = dropdownFilter.toLowerCase();
          return (
            sailNo.toLowerCase().includes(filter) ||
            skipper.name.toLowerCase().includes(filter)
          ) && !isUsed;
        }
        return !isUsed;
      });
  }, [dropdownTarget, skippers, getUsedSailNumbersForRace, dropdownFilter]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, heat: HeatDesignation, position: number, race: number) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
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

  return (
    <div className={`flex flex-col h-full ${darkMode ? 'text-white' : 'text-slate-900'}`}>
      {/* Toolbar */}
      <div className={`flex items-center justify-between px-5 py-3 border-b ${
        darkMode
          ? 'bg-gradient-to-r from-slate-800 via-slate-800 to-slate-900 border-slate-700'
          : 'bg-gradient-to-r from-white via-slate-50 to-white border-slate-200'
      }`}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${darkMode ? 'bg-amber-900/30' : 'bg-amber-100'}`}>
              <Anchor size={16} className={darkMode ? 'text-amber-400' : 'text-amber-600'} />
            </div>
            <div>
              <h3 className={`text-sm font-bold tracking-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                HMS Scoring
              </h3>
              <p className={`text-[10px] ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                Heat Management System
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 ml-2">
            <span className={`text-[10px] px-2 py-1 rounded-md font-semibold ${
              darkMode ? 'bg-amber-900/30 text-amber-300 border border-amber-800/50' : 'bg-amber-50 text-amber-700 border border-amber-200'
            }`}>
              {numberOfHeats} Heats
            </span>
            <span className={`text-[10px] px-2 py-1 rounded-md font-semibold ${
              darkMode ? 'bg-emerald-900/30 text-emerald-300 border border-emerald-800/50' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            }`}>
              {promotionCount} Promotion
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleResetAll}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              darkMode
                ? 'bg-red-900/20 text-red-400 hover:bg-red-900/40 border border-red-800/30'
                : 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
            }`}
          >
            <RotateCcw size={12} />
            Reset
          </button>
          <button
            onClick={onConfigureHeats}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              darkMode
                ? 'bg-slate-700/50 text-slate-300 hover:bg-slate-600/50 border border-slate-600/50'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
            }`}
          >
            <Settings size={12} />
            Settings
          </button>
        </div>
      </div>

      {/* Spreadsheet Grid */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-auto relative"
      >
        <table className={`border-collapse text-xs ${darkMode ? 'bg-slate-950' : 'bg-slate-50'}`} style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 56 }} />
            {Array.from({ length: TOTAL_RACES }).map((_, i) => (
              <React.Fragment key={i}>
                <col style={{ width: 56 }} />
                <col style={{ width: 44 }} />
                <col style={{ width: 36 }} />
              </React.Fragment>
            ))}
          </colgroup>

          <thead className="sticky top-0 z-20">
            {/* Race Number Row */}
            <tr>
              <th className={`sticky left-0 z-30 px-1 py-2 border-b border-r ${
                darkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-300'
              }`}>
              </th>
              {Array.from({ length: TOTAL_RACES }, (_, i) => i + 1).map(race => {
                const entryCount = getRaceEntryCount(race);
                const isVerified = verifiedRaces.has(race);
                const isSeeding = race === 1;

                return (
                  <th
                    key={race}
                    colSpan={3}
                    className={`px-0.5 py-1 text-center border-b border-r ${
                      darkMode ? 'border-slate-700' : 'border-slate-300'
                    } ${isSeeding
                      ? darkMode ? 'bg-blue-950/50' : 'bg-blue-50'
                      : darkMode ? 'bg-slate-900' : 'bg-white'
                    }`}
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <div className="flex items-center gap-1">
                        <span className={`font-bold text-[11px] ${
                          isSeeding
                            ? darkMode ? 'text-blue-300' : 'text-blue-700'
                            : darkMode ? 'text-slate-200' : 'text-slate-800'
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

            {/* Sub-header Row */}
            <tr>
              <th className={`sticky left-0 z-30 px-1 py-1 border-b border-r text-[9px] font-semibold uppercase tracking-wider ${
                darkMode ? 'bg-slate-900 border-slate-700 text-slate-500' : 'bg-white border-slate-300 text-slate-400'
              }`}>
                Pos
              </th>
              {Array.from({ length: TOTAL_RACES }, (_, i) => i + 1).map(race => (
                <React.Fragment key={race}>
                  <th className={`px-0.5 py-1 text-center text-[9px] font-medium border-b border-r tracking-wide uppercase ${
                    darkMode
                      ? 'bg-slate-900/80 border-slate-700 text-slate-500'
                      : 'bg-slate-50 border-slate-300 text-slate-400'
                  }`}>
                    Sail
                  </th>
                  <th className={`px-0.5 py-1 text-center text-[9px] font-medium border-b border-r tracking-wide uppercase ${
                    darkMode
                      ? 'bg-slate-900/80 border-slate-700 text-slate-500'
                      : 'bg-slate-50 border-slate-300 text-slate-400'
                  }`}>
                    Cmt
                  </th>
                  <th className={`px-0.5 py-1 text-center text-[9px] font-medium border-b border-r tracking-wide uppercase ${
                    darkMode
                      ? 'bg-slate-900/80 border-slate-700 text-slate-500'
                      : 'bg-slate-50 border-slate-300 text-slate-400'
                  }`}>
                    Pts
                  </th>
                </React.Fragment>
              ))}
            </tr>
          </thead>

          <tbody>
            {heats.map((heat) => {
              const theme = HEAT_THEMES[heat];
              return (
                <React.Fragment key={heat}>
                  {/* Heat Header */}
                  <tr>
                    <td
                      className={`sticky left-0 z-10 px-2 py-2 border-b border-r font-bold text-xs text-white tracking-wide ${
                        darkMode ? theme.gradientDark : theme.gradient
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <Sparkles size={12} className="opacity-60" />
                        Heat {heat}
                      </div>
                    </td>
                    {Array.from({ length: TOTAL_RACES }, (_, i) => i + 1).map(race => (
                      <td
                        key={race}
                        colSpan={3}
                        className={`px-1 py-1.5 border-b border-r text-center font-bold text-white text-[10px] ${
                          darkMode ? theme.gradientDark : theme.gradient
                        }`}
                      >
                      </td>
                    ))}
                  </tr>

                  {/* Position Rows */}
                  {Array.from({ length: maxPositions }, (_, posIdx) => posIdx + 1).map(position => {
                    const showPromotion = isPromotionRow(position, 2);

                    return (
                      <tr
                        key={`${heat}-${position}`}
                        className={`group transition-colors ${
                          showPromotion
                            ? darkMode ? 'hover:bg-emerald-950/20' : 'hover:bg-emerald-50/50'
                            : darkMode ? 'hover:bg-slate-800/50' : 'hover:bg-slate-100/50'
                        }`}
                      >
                        {/* Position Cell */}
                        <td className={`sticky left-0 z-10 px-2 py-0 text-[10px] font-semibold border-b border-r whitespace-nowrap ${
                          showPromotion
                            ? darkMode
                              ? 'bg-emerald-950/40 border-emerald-900/50 text-emerald-300'
                              : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                            : darkMode
                              ? 'bg-slate-900 border-slate-800 text-slate-400'
                              : 'bg-white border-slate-200 text-slate-500'
                        }`}>
                          <div className="flex items-center gap-1">
                            {showPromotion && (
                              <div className={`w-1 h-3 rounded-full ${darkMode ? 'bg-emerald-500' : 'bg-emerald-400'}`} />
                            )}
                            {getOrdinal(position)}
                          </div>
                        </td>

                        {/* Race Cells */}
                        {Array.from({ length: TOTAL_RACES }, (_, i) => i + 1).map(race => {
                          const key = getCellKey(heat, position, race);
                          const cell = cells[key];
                          const isPromo = isPromotionRow(position, race);
                          const isSeeding = race === 1;
                          const isDropdownOpen = dropdownTarget?.heat === heat && dropdownTarget?.position === position && dropdownTarget?.race === race;
                          const hasSail = !!cell?.sailNumber?.trim();
                          const isInvalid = hasSail && cell?.isValid === false;
                          const isDup = hasSail && cell?.isDuplicate;
                          const ls = cell?.letterScore;
                          const lsColor = ls ? LETTER_SCORE_COLORS[ls] : null;

                          const promoBg = isPromo
                            ? darkMode ? 'bg-emerald-950/30' : 'bg-emerald-50/80'
                            : '';
                          const seedBg = isSeeding && !isPromo
                            ? darkMode ? 'bg-blue-950/20' : 'bg-blue-50/30'
                            : '';
                          const baseBg = promoBg || seedBg || (darkMode ? 'bg-slate-950' : 'bg-white');
                          const borderColor = darkMode ? 'border-slate-800' : 'border-slate-200';

                          return (
                            <React.Fragment key={race}>
                              {/* Sail Number Cell */}
                              <td className={`px-0 py-0 border-b border-r ${borderColor} ${baseBg} relative`}>
                                <input
                                  ref={el => { inputRefs.current[`${key}-sail`] = el; }}
                                  type="text"
                                  value={cell?.sailNumber || ''}
                                  onChange={e => handleSailNumberInput(heat, position, race, e.target.value)}
                                  onBlur={() => handleSailNumberBlur(heat, position, race)}
                                  onFocus={() => {
                                    setDropdownTarget({ heat, position, race });
                                    setDropdownFilter('');
                                  }}
                                  onKeyDown={e => handleKeyDown(e, heat, position, race)}
                                  className={`w-full px-1 py-[3px] text-[11px] text-center border-0 outline-none transition-all
                                    ${baseBg}
                                    ${isInvalid
                                      ? 'text-red-500 bg-red-50 dark:bg-red-950/30'
                                      : isDup
                                        ? 'text-amber-500 bg-amber-50 dark:bg-amber-950/30'
                                        : hasSail
                                          ? darkMode ? 'text-white font-medium' : 'text-slate-900 font-medium'
                                          : darkMode ? 'text-slate-500' : 'text-slate-300'
                                    }
                                    focus:ring-1 focus:ring-inset ${darkMode ? 'focus:ring-blue-500/50' : 'focus:ring-blue-400/50'}
                                    placeholder:text-transparent
                                  `}
                                  placeholder=""
                                />
                                {/* Dropdown */}
                                {isDropdownOpen && !cell?.sailNumber?.trim() && (
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
                                    {availableSkippersForDropdown.length === 0 ? (
                                      <div className={`px-3 py-2 text-[10px] ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                        No available skippers
                                      </div>
                                    ) : (
                                      availableSkippersForDropdown.map(({ skipper, index }) => (
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
                                            darkMode ? 'text-amber-400' : 'text-amber-600'
                                          }`}>
                                            {skipper.sailNumber}
                                          </span>
                                          <span className="text-[10px] truncate">
                                            {skipper.name}
                                          </span>
                                        </button>
                                      ))
                                    )}
                                  </div>
                                )}
                              </td>

                              {/* Comments Cell */}
                              <td
                                className={`px-0 py-0 border-b border-r ${borderColor} ${baseBg} cursor-pointer`}
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
                                    darkMode ? 'text-emerald-500' : 'text-emerald-600'
                                  }`}>
                                    OK
                                  </div>
                                ) : null}
                              </td>

                              {/* Points Cell */}
                              <td className={`px-0 py-0 border-b border-r ${borderColor} ${baseBg}`}>
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

      {/* Verify Results Modal */}
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

      {/* Letter Score Modal */}
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
