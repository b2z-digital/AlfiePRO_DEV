import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Users, Shuffle, CreditCard as Edit3, Check, RefreshCw, Eye, UserPlus, CircleAlert as AlertCircle, Lock, ArrowRight, ChevronLeft, ChevronRight, Download, FileDown, ChevronDown, FileSpreadsheet, Upload, Plus, Minus, GripVertical, Pencil } from 'lucide-react';
import { Skipper, LetterScore } from '../types';
import { HeatManagement, HeatDesignation, getHeatColorClasses, HeatAssignment, generateNextRoundAssignments, getSHRSPhase, getSHRSHeatLabel, getSHRSRoundLabel, isSHRSTransitionRound, isSHRSFinalsRound, getHeatDisplayLabel } from '../types/heat';
import { RaceEvent } from '../types/race';
import { getCountryFlag, getIOCCode } from '../utils/countryFlags';
import { LetterScoreSelector } from './LetterScoreSelector';
import { selectObservers, saveObserverAssignments, getObserverAssignments, getObserverAssignmentsForRound, getAllObserversForEvent, toggleObserver, preAllocateObserversForAllRounds, ObserverAssignment, getObserverEventId, resolveObserverEventId } from '../utils/observerUtils';
import { supabase } from '../utils/supabase';
import { exportSingleRoundPdf, exportAllRoundsPdf } from '../utils/heatAssignmentPdfExport';
import { validateHeatAssignments } from '../utils/hmsHeatSystem';
import { DiversityGauge } from './DiversityGauge';
import { estimateDiversityMetrics } from '../utils/shrsHeatSystem';

interface HeatAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  heatManagement: HeatManagement;
  skippers: Skipper[];
  darkMode: boolean;
  currentEvent?: RaceEvent | null;
  onReshuffle?: () => void;
  onManualAssign?: () => void;
  onStartRound?: (roundNumber: number) => void;
  onUpdateAssignments?: (assignments: HeatAssignment[], targetRound?: number) => void;
  onAdvanceToNextRound?: (nextRoundNumber: number) => void;
  onFinaliseQualifying?: () => void;
  onExtendQualifying?: (newQualifyingRounds: number) => void;
  onUpdateRoundResults?: (roundNumber: number, updatedResults: any[]) => void;
  onImportAllRoundAssignments?: (allRoundAssignments: HeatAssignment[][]) => void;
}

export const HeatAssignmentModal: React.FC<HeatAssignmentModalProps> = ({
  isOpen,
  onClose,
  heatManagement,
  skippers,
  darkMode,
  currentEvent,
  onReshuffle,
  onManualAssign,
  onStartRound,
  onUpdateAssignments,
  onAdvanceToNextRound,
  onFinaliseQualifying,
  onExtendQualifying,
  onUpdateRoundResults,
  onImportAllRoundAssignments
}) => {
  const [editMode, setEditMode] = useState(false);
  const [showFinaliseConfirm, setShowFinaliseConfirm] = useState(false);
  const [modifiedPromotions, setModifiedPromotions] = useState<Set<number>>(new Set());
  const [modifiedRelegations, setModifiedRelegations] = useState<Set<number>>(new Set());
  const [appliedPromotions, setAppliedPromotions] = useState<Set<number>>(new Set());
  const [appliedRelegations, setAppliedRelegations] = useState<Set<number>>(new Set());
  const [hasAppliedChanges, setHasAppliedChanges] = useState(false);
  const [isApplyingChanges, setIsApplyingChanges] = useState(false);
  const [limitWarning, setLimitWarning] = useState<string | null>(null);

  const [initialEditMode, setInitialEditMode] = useState(false);
  const [selectedSkipperToMove, setSelectedSkipperToMove] = useState<number | null>(null);
  const [localAssignments, setLocalAssignments] = useState<HeatAssignment[] | null>(null);
  const [previewRoundIndex, setPreviewRoundIndex] = useState<number | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [showQualifyingCompletePrompt, setShowQualifyingCompletePrompt] = useState(false);
  const [showExtendSettings, setShowExtendSettings] = useState(false);
  const [extendRoundCount, setExtendRoundCount] = useState(0);
  const [editResultsMode, setEditResultsMode] = useState(false);
  const [draggedSkipper, setDraggedSkipper] = useState<{ skipperIndex: number; heatDesignation: string; fromPosition: number } | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<{ skipperIndex: number; heatDesignation: string } | null>(null);
  const [localResults, setLocalResults] = useState<any[] | null>(null);
  const [editLetterScoreTarget, setEditLetterScoreTarget] = useState<{ skipperIndex: number; heatDesignation: string } | null>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  const sortBySailNumber = useCallback((indices: number[]) => {
    return [...indices].sort((a, b) => {
      const sailA = parseInt(skippers[a]?.sailNo || '0', 10) || 0;
      const sailB = parseInt(skippers[b]?.sailNo || '0', 10) || 0;
      return sailA - sailB;
    });
  }, [skippers]);

  const handleImportHeatAssignmentsCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError(null);
    setImportSuccess(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target?.result as string;
        const parsed = parseHeatAssignmentsCsv(text);
        if (parsed.error) {
          setImportError(parsed.error);
          return;
        }
        if (onImportAllRoundAssignments && parsed.assignments.length > 0) {
          onImportAllRoundAssignments(parsed.assignments);
          setImportSuccess(`Imported heat assignments for ${parsed.assignments.length} rounds (${parsed.matchedCount}/${parsed.totalSailNumbers} sail numbers matched)`);
          if (parsed.unmatchedSails.length > 0) {
            setImportError(`Unmatched sail numbers: ${parsed.unmatchedSails.join(', ')}`);
          }
        }
      } catch (err: any) {
        setImportError(err.message || 'Failed to parse CSV file');
      }
    };
    reader.readAsText(file);
    if (importFileRef.current) importFileRef.current.value = '';
  };

  const parseHeatAssignmentsCsv = (text: string): {
    assignments: HeatAssignment[][];
    error?: string;
    matchedCount: number;
    totalSailNumbers: number;
    unmatchedSails: string[];
  } => {
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length < 2) return { assignments: [], error: 'CSV file is empty or has no data rows', matchedCount: 0, totalSailNumbers: 0, unmatchedSails: [] };

    // Parse CSV fields (handle quoted fields)
    const parseCsvLine = (line: string): string[] => {
      const fields: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
          fields.push(current.trim());
          current = '';
        } else {
          current += ch;
        }
      }
      fields.push(current.trim());
      return fields;
    };

    // Build sail number -> skipper index lookup
    const sailToIndex = new Map<string, number>();
    skippers.forEach((s, idx) => {
      const sail = (s.sailNo || s.sailNumber || '').toString().trim().toUpperCase();
      if (sail) sailToIndex.set(sail, idx);
    });

    // Detect format from header row
    const headerFields = parseCsvLine(lines[0]);
    const headerLower = headerFields.map(f => f.toLowerCase().replace(/"/g, '').trim());

    const numberOfHeats = heatManagement.configuration.numberOfHeats || 2;
    const heatDesignations: HeatDesignation[] = ['A', 'B', 'C', 'D', 'E', 'F'].slice(0, numberOfHeats) as HeatDesignation[];

    // --- Row-based format detection ---
    // Format: "Round,Heat,Sail Number,Skipper Name" where each row is one skipper assignment
    const isRowBasedFormat = (
      (headerLower.includes('round') || headerLower.some(h => /^round/.test(h))) &&
      (headerLower.includes('heat') || headerLower.some(h => /^heat/.test(h))) &&
      (headerLower.includes('sail number') || headerLower.includes('sail no') || headerLower.includes('sail'))
    );

    if (isRowBasedFormat) {
      // Determine column indices
      const roundCol = headerLower.findIndex(h => /^round/.test(h));
      const heatCol = headerLower.findIndex(h => /^heat/.test(h));
      const sailCol = headerLower.findIndex(h => /sail/.test(h));

      if (roundCol < 0 || heatCol < 0 || sailCol < 0) {
        return { assignments: [], error: 'Could not identify Round, Heat, and Sail columns', matchedCount: 0, totalSailNumbers: 0, unmatchedSails: [] };
      }

      // Parse all data rows to discover rounds and heats
      const roundHeatData = new Map<string, Map<number, number[]>>(); // roundName -> heatIdx -> skipperIndices[]
      const allSailNumbers = new Set<string>();
      const unmatchedSails = new Set<string>();

      for (let lineIdx = 1; lineIdx < lines.length; lineIdx++) {
        const fields = parseCsvLine(lines[lineIdx]);
        if (fields.length <= Math.max(roundCol, heatCol, sailCol)) continue;

        const roundName = fields[roundCol].replace(/"/g, '').trim();
        const heatName = fields[heatCol].replace(/"/g, '').trim();
        const sailNo = fields[sailCol].replace(/"/g, '').trim().toUpperCase();

        if (!roundName || !heatName || !sailNo) continue;

        allSailNumbers.add(sailNo);

        // Extract heat number from "Heat 1", "Heat 2", etc.
        const heatMatch = heatName.match(/(\d+)/);
        const heatIdx = heatMatch ? parseInt(heatMatch[1]) - 1 : 0;
        if (heatIdx < 0 || heatIdx >= numberOfHeats) continue;

        if (!roundHeatData.has(roundName)) {
          roundHeatData.set(roundName, new Map());
        }
        const roundMap = roundHeatData.get(roundName)!;
        if (!roundMap.has(heatIdx)) {
          roundMap.set(heatIdx, []);
        }

        const skipperIdx = sailToIndex.get(sailNo);
        if (skipperIdx !== undefined) {
          roundMap.get(heatIdx)!.push(skipperIdx);
        } else {
          unmatchedSails.add(sailNo);
        }
      }

      if (roundHeatData.size === 0) {
        return { assignments: [], error: 'No valid heat assignment data found in CSV', matchedCount: 0, totalSailNumbers: allSailNumbers.size, unmatchedSails: Array.from(unmatchedSails) };
      }

      // Sort rounds naturally (Q1, Q2, ..., Q10, F1, F2, etc.)
      const roundNames = Array.from(roundHeatData.keys()).sort((a, b) => {
        const aNum = parseInt(a.replace(/\D/g, '') || '0');
        const bNum = parseInt(b.replace(/\D/g, '') || '0');
        const aPrefix = a.replace(/\d/g, '').toLowerCase();
        const bPrefix = b.replace(/\d/g, '').toLowerCase();
        if (aPrefix !== bPrefix) return aPrefix.localeCompare(bPrefix);
        return aNum - bNum;
      });

      // Convert to HeatAssignment[][] format
      const result: HeatAssignment[][] = roundNames.map(roundName => {
        const roundMap = roundHeatData.get(roundName)!;
        return heatDesignations.map((_, heatIdx) => ({
          heatDesignation: heatDesignations[heatIdx],
          skipperIndices: roundMap.get(heatIdx) || []
        }));
      });

      const matchedCount = allSailNumbers.size - unmatchedSails.size;
      return { assignments: result, matchedCount, totalSailNumbers: allSailNumbers.size, unmatchedSails: Array.from(unmatchedSails) };
    }

    // --- Columnar format detection (original) ---
    // Format: "Heat","Pos","Qualifying Rd 1","","","Qualifying Rd 2","",""...
    // Each round has 3 columns: Sail No, Skipper, Pts
    let numRounds = 0;
    for (let i = 2; i < headerFields.length; i++) {
      const f = headerFields[i].replace(/"/g, '').trim();
      if (f && /qualifying|round|rd|final|race|q\d/i.test(f)) {
        numRounds++;
      }
    }
    if (numRounds === 0) {
      // Try alternative detection: count groups of 3 columns after first 2
      numRounds = Math.floor((headerFields.length - 2) / 3);
    }
    if (numRounds === 0) return { assignments: [], error: 'Could not detect rounds from CSV header. Expected either row format (Round, Heat, Sail Number, Skipper Name) or columnar format with round names in header.', matchedCount: 0, totalSailNumbers: 0, unmatchedSails: [] };

    // For each round, build heat -> skipper indices mapping
    // roundAssignments[roundIdx][heatIdx] = skipperIndices[]
    const roundAssignments: number[][][] = Array.from({ length: numRounds }, () =>
      Array.from({ length: numberOfHeats }, () => [])
    );

    let currentHeatIdx = -1;
    let allSailNumbers = new Set<string>();
    const unmatchedSails = new Set<string>();

    // Skip header row(s) - find first data row
    let dataStartLine = 1;
    const secondLine = parseCsvLine(lines[1]);
    if (secondLine[0]?.toLowerCase().replace(/"/g, '').includes('sail') ||
        secondLine[2]?.toLowerCase().replace(/"/g, '').includes('sail')) {
      dataStartLine = 2;
    }

    for (let lineIdx = dataStartLine; lineIdx < lines.length; lineIdx++) {
      const fields = parseCsvLine(lines[lineIdx]);
      if (fields.length < 3) continue;

      const firstField = fields[0].replace(/"/g, '').trim();
      const secondField = fields[1]?.replace(/"/g, '').trim() || '';

      // Detect heat section start
      if (/^heat\s*\d+$/i.test(firstField)) {
        currentHeatIdx++;
        if (currentHeatIdx >= numberOfHeats) {
          break;
        }
      }

      // Skip observer rows or empty rows
      if (/^observer/i.test(secondField) || /^observer/i.test(firstField)) continue;
      if (!secondField || isNaN(parseInt(secondField))) continue;

      if (currentHeatIdx < 0) continue;

      // Each round has 3 columns (Sail No, Skipper, Pts) starting at offset 2
      for (let roundIdx = 0; roundIdx < numRounds; roundIdx++) {
        const colOffset = 2 + (roundIdx * 3);
        const sailNo = (fields[colOffset] || '').replace(/"/g, '').trim().toUpperCase();
        if (!sailNo) continue;

        allSailNumbers.add(sailNo);
        const skipperIdx = sailToIndex.get(sailNo);
        if (skipperIdx !== undefined) {
          roundAssignments[roundIdx][currentHeatIdx].push(skipperIdx);
        } else {
          unmatchedSails.add(sailNo);
        }
      }
    }

    if (currentHeatIdx < 0) {
      return { assignments: [], error: 'No heat sections found in CSV', matchedCount: 0, totalSailNumbers: allSailNumbers.size, unmatchedSails: Array.from(unmatchedSails) };
    }

    // Convert to HeatAssignment[][] format
    const result: HeatAssignment[][] = roundAssignments.map(roundHeats =>
      roundHeats.map((skipperIndices, heatIdx) => ({
        heatDesignation: heatDesignations[heatIdx],
        skipperIndices
      }))
    );

    const matchedCount = allSailNumbers.size - unmatchedSails.size;
    return { assignments: result, matchedCount, totalSailNumbers: allSailNumbers.size, unmatchedSails: Array.from(unmatchedSails) };
  };

  const syncObserverEventId = useMemo(() => getObserverEventId(currentEvent), [currentEvent?.id, currentEvent?.isSeriesEvent, currentEvent?.seriesRoundId]);
  const [resolvedObserverId, setResolvedObserverId] = useState<string | null>(syncObserverEventId);

  useEffect(() => {
    if (syncObserverEventId) {
      setResolvedObserverId(syncObserverEventId);
      return;
    }
    let cancelled = false;
    resolveObserverEventId(currentEvent).then(id => {
      if (!cancelled && id) setResolvedObserverId(id);
    });
    return () => { cancelled = true; };
  }, [syncObserverEventId, currentEvent?.id, currentEvent?.seriesId, currentEvent?.roundName]);

  const observerEventId = resolvedObserverId;

  useEffect(() => {
    if (!showExportMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showExportMenu]);

  const rankedSkipperIndices = useMemo(() => {
    const indices = (heatManagement.configuration as any)?.rankedSkipperIndices;
    return new Set<number>(Array.isArray(indices) ? indices : []);
  }, [heatManagement.configuration]);

  const shrsIsPresetMode = heatManagement.configuration.scoringSystem === 'shrs' &&
    heatManagement.configuration.shrsAssignmentMode === 'preset' &&
    heatManagement.rounds.length > 1;

  // Show round navigator for pre-assigned SHRS even after scoring has started
  const shrsHasPreAssignments = shrsIsPresetMode;

  const totalPreAssignedRounds = shrsHasPreAssignments ? heatManagement.rounds.length : 0;

  // Heat balance checking for initialEditMode
  const heatBalanceInfo = useMemo(() => {
    if (!localAssignments || !initialEditMode) return null;
    const sizes = localAssignments.map(a => a.skipperIndices.length);
    const minSize = Math.min(...sizes);
    const maxSize = Math.max(...sizes);
    const isBalanced = maxSize - minSize <= 1;
    return { isBalanced, sizes, minSize, maxSize };
  }, [localAssignments, initialEditMode]);

  const heatsAreBalanced = !heatBalanceInfo || heatBalanceInfo.isBalanced;

  const downloadCsv = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const exportAllAssignmentsCsv = async () => {
    const config = heatManagement.configuration;
    const qualifyingRounds = config.shrsQualifyingRounds || heatManagement.rounds.length;
    const roundsToExport = heatManagement.rounds.filter(r => r.round <= qualifyingRounds);

    let allObservers = new Map<string, { skipperName: string; sailNumber: string }[]>();
    if (observerEventId) {
      allObservers = await getAllObserversForEvent(observerEventId);
    }
    const stateObs = buildObserverMap();
    stateObs.forEach((obs, key) => allObservers.set(key, obs));

    const rows: string[] = ['Round,Heat,Sail Number,Skipper Name,Club,Observer'];

    for (const rd of roundsToExport) {
      const sortedAssignments = [...rd.heatAssignments].sort((a, b) =>
        a.heatDesignation.localeCompare(b.heatDesignation)
      );
      const roundLabel = config.scoringSystem === 'shrs'
        ? getSHRSRoundLabel(rd.round, config)
        : `R${rd.round}`;

      for (const assignment of sortedAssignments) {
        const heatLabel = getHeatDisplayLabel(assignment.heatDesignation, config);
        const obsKey = `${rd.round}-${assignment.heatDesignation}`;
        const heatObservers = allObservers.get(obsKey) || [];
        const observerText = heatObservers.map(o => `${o.sailNumber} ${o.skipperName}`.trim()).join('; ');

        for (const idx of assignment.skipperIndices) {
          const skipper = skippers[idx];
          if (skipper) {
            const escapeCsv = (v: string) => v.includes(',') ? `"${v}"` : v;
            rows.push(`${roundLabel},Heat ${heatLabel},${skipper.sailNo || ''},${escapeCsv(skipper.name || '')},${escapeCsv(skipper.club || '')},${escapeCsv(observerText)}`);
          }
        }
      }
    }

    const eventSlug = (currentEvent?.name || currentEvent?.eventName || 'Heat_Assignments').replace(/[^a-zA-Z0-9]/g, '_');
    downloadCsv(rows.join('\n'), `${eventSlug}_All_Assignments.csv`);
  };

  const exportCurrentRoundCsv = () => {
    const config = heatManagement.configuration;
    const roundIdx = previewRoundIndex ?? heatManagement.rounds.findIndex(r => r.round === round);
    if (roundIdx < 0) return;
    const rd = heatManagement.rounds[roundIdx];
    if (!rd) return;

    const obsMap = buildObserverMap();

    const roundLabel = config.scoringSystem === 'shrs'
      ? getSHRSRoundLabel(rd.round, config)
      : `R${rd.round}`;

    const rows: string[] = ['Round,Heat,Sail Number,Skipper Name,Club,Observer'];

    const sortedAssignments = [...rd.heatAssignments].sort((a, b) =>
      a.heatDesignation.localeCompare(b.heatDesignation)
    );

    for (const assignment of sortedAssignments) {
      const heatLabel = getHeatDisplayLabel(assignment.heatDesignation, config);
      const obsKey = `${rd.round}-${assignment.heatDesignation}`;
      const heatObservers = obsMap.get(obsKey) || [];
      const observerText = heatObservers.map(o => `${o.sailNumber} ${o.skipperName}`.trim()).join('; ');

      for (const idx of assignment.skipperIndices) {
        const skipper = skippers[idx];
        if (skipper) {
          const escapeCsv = (v: string) => v.includes(',') ? `"${v}"` : v;
          rows.push(`${roundLabel},Heat ${heatLabel},${skipper.sailNo || ''},${escapeCsv(skipper.name || '')},${escapeCsv(skipper.club || '')},${escapeCsv(observerText)}`);
        }
      }
    }

    const eventSlug = (currentEvent?.name || currentEvent?.eventName || 'Heat_Assignments').replace(/[^a-zA-Z0-9]/g, '_');
    downloadCsv(rows.join('\n'), `${eventSlug}_${roundLabel}_Assignments.csv`);
  };

  const exportAssignmentsBySkipperCsv = async () => {
    const config = heatManagement.configuration;
    const qualifyingRounds = config.shrsQualifyingRounds || heatManagement.rounds.length;
    const roundsToExport = heatManagement.rounds.filter(r => r.round <= qualifyingRounds);

    let allObservers = new Map<string, { skipperName: string; sailNumber: string }[]>();
    if (observerEventId) {
      allObservers = await getAllObserversForEvent(observerEventId);
    }
    const stateObs = buildObserverMap();
    stateObs.forEach((obs, key) => allObservers.set(key, obs));

    const roundLabels = roundsToExport.map(rd =>
      config.scoringSystem === 'shrs' ? getSHRSRoundLabel(rd.round, config) : `R${rd.round}`
    );

    const skipperData = new Map<number, {
      name: string;
      sailNo: string;
      club: string;
      heatByRound: Map<number, string>;
      observerByRound: Map<number, string>;
    }>();

    const ensureSkipper = (idx: number) => {
      if (!skipperData.has(idx)) {
        const s = skippers[idx];
        if (!s) return null;
        skipperData.set(idx, {
          name: s.name || '',
          sailNo: s.sailNo || '',
          club: s.club || '',
          heatByRound: new Map(),
          observerByRound: new Map(),
        });
      }
      return skipperData.get(idx)!;
    };

    for (const rd of roundsToExport) {
      for (const assignment of rd.heatAssignments) {
        const heatLabel = `Heat ${getHeatDisplayLabel(assignment.heatDesignation, config)}`;
        for (const idx of assignment.skipperIndices) {
          const data = ensureSkipper(idx);
          if (data) data.heatByRound.set(rd.round, heatLabel);
        }
      }

      for (const [key, observers] of allObservers.entries()) {
        const parts = key.split('-');
        const rNum = parseInt(parts[0]);
        if (rNum !== rd.round) continue;
        const designation = parts[1] || '';
        const heatLabel = `Heat ${getHeatDisplayLabel(designation as any, config)}`;
        for (const obs of observers) {
          const matchIdx = skippers.findIndex(s =>
            (obs.sailNumber && s.sailNo === obs.sailNumber) ||
            (obs.skipperName && s.name === obs.skipperName)
          );
          if (matchIdx >= 0) {
            const data = ensureSkipper(matchIdx);
            if (data) data.observerByRound.set(rd.round, heatLabel);
          }
        }
      }
    }

    const escapeCsv = (v: string) => v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;

    const heatHeaders = roundLabels.map(l => `${l} Heat`);
    const obsHeaders = roundLabels.map(l => `${l} Observer`);
    const headerRow = ['Sail Number', 'Skipper Name', 'Club', ...heatHeaders, ...obsHeaders].join(',');

    const sorted = [...skipperData.values()].sort((a, b) => {
      const numA = parseInt(a.sailNo) || 99999;
      const numB = parseInt(b.sailNo) || 99999;
      return numA - numB;
    });

    const dataRows = sorted.map(s => {
      const heatCols = roundsToExport.map(rd => s.heatByRound.get(rd.round) || '');
      const obsCols = roundsToExport.map(rd => s.observerByRound.get(rd.round) || '');
      return [s.sailNo, escapeCsv(s.name), escapeCsv(s.club), ...heatCols, ...obsCols].join(',');
    });

    const eventSlug = (currentEvent?.name || currentEvent?.eventName || 'Heat_Assignments').replace(/[^a-zA-Z0-9]/g, '_');
    downloadCsv([headerRow, ...dataRows].join('\n'), `${eventSlug}_Assignments_By_Skipper.csv`);
  };

  const buildObserverMap = () => {
    const obsMap = new Map<string, { skipperName: string; sailNumber: string; countryCode?: string }[]>();
    observersByHeat.forEach((observers, heatNumber) => {
      const sortedDesignations = heatAssignments
        .map(a => a.heatDesignation)
        .sort((a, b) => a.localeCompare(b));
      const designation = sortedDesignations[heatNumber - 1];
      if (!designation) return;
      const key = `${round}-${designation}`;
      obsMap.set(key, observers.map(o => {
        const matchedSkipper = skippers.find(s =>
          s.sailNo === o.skipper_sail_number || s.name === o.skipper_name
        );
        return {
          skipperName: o.skipper_name,
          sailNumber: o.skipper_sail_number || '',
          countryCode: matchedSkipper?.country_code || undefined,
        };
      }));
    });
    return obsMap;
  };

  const getExportOptions = () => ({
    eventName: currentEvent?.name || currentEvent?.eventName || '',
    eventDate: currentEvent?.date || '',
    venueName: (currentEvent as any)?.venue || '',
    clubName: (currentEvent as any)?.clubName || '',
    showFlag: currentEvent?.show_flag ?? false,
    showCountry: currentEvent?.show_country ?? false,
  });

  const handleExportCurrentRoundPdf = () => {
    const roundIdx = previewRoundIndex ?? heatManagement.rounds.findIndex(r => r.round === round);
    if (roundIdx < 0) return;
    const obsMap = currentEvent?.enable_observers ? buildObserverMap() : undefined;
    exportSingleRoundPdf(heatManagement, roundIdx, skippers, getExportOptions(), obsMap);
  };

  const handleExportAllRoundsPdf = async () => {
    if (!currentEvent?.enable_observers) {
      exportAllRoundsPdf(heatManagement, skippers, getExportOptions(), undefined);
      return;
    }
    const stateObsMap = buildObserverMap();
    let obsMap = new Map<string, { skipperName: string; sailNumber: string; countryCode?: string }[]>();
    if (observerEventId) {
      const rawMap = await getAllObserversForEvent(observerEventId);
      rawMap.forEach((observers, key) => {
        obsMap.set(key, observers.map(o => {
          const matched = skippers.find(s =>
            s.sailNo === o.sailNumber || s.name === o.skipperName
          );
          return { ...o, countryCode: matched?.country_code || undefined };
        }));
      });
    }
    stateObsMap.forEach((observers, key) => {
      obsMap.set(key, observers);
    });
    exportAllRoundsPdf(heatManagement, skippers, getExportOptions(), obsMap);
  };

  const resolveObserverConflicts = (updatedAssignments: HeatAssignment[]) => {
    const changedHeats: number[] = [];
    let resolvedMap: Map<number, ObserverAssignment[]> | undefined;

    setObserversByHeat(prev => {
      const newMap = new Map(prev);
      const sortedDesignations = updatedAssignments
        .map(a => a.heatDesignation)
        .sort((a, b) => a.localeCompare(b));

      for (let i = 0; i < sortedDesignations.length; i++) {
        const designation = sortedDesignations[i];
        const heatNumber = i + 1;
        const assignment = updatedAssignments.find(a => a.heatDesignation === designation);
        if (!assignment) continue;

        const observers = newMap.get(heatNumber);
        if (!observers || observers.length === 0) continue;

        const racingSet = new Set(assignment.skipperIndices);
        const conflicting = observers.filter(o => racingSet.has(o.skipper_index));
        if (conflicting.length === 0) continue;

        const existingObserverIndices = new Set(observers.map(o => o.skipper_index));

        let cleaned = observers.filter(o => !racingSet.has(o.skipper_index));
        const needed = observers.length - cleaned.length;

        for (let r = 0; r < needed; r++) {
          const candidate = skippers.findIndex((s, idx) =>
            s &&
            !racingSet.has(idx) &&
            !existingObserverIndices.has(idx) &&
            !cleaned.some(o => o.skipper_index === idx)
          );
          if (candidate !== -1) {
            cleaned.push({
              skipper_index: candidate,
              skipper_name: skippers[candidate].name,
              skipper_sail_number: skippers[candidate].sailNo,
              times_served: 0,
              is_manual_assignment: true
            });
            existingObserverIndices.add(candidate);
          }
        }

        newMap.set(heatNumber, cleaned);
        changedHeats.push(heatNumber);
      }

      resolvedMap = newMap;
      return newMap;
    });

    if (resolvedMap && observerEventId && changedHeats.length > 0) {
      for (const heatNumber of changedHeats) {
        const observers = resolvedMap.get(heatNumber);
        if (observers && observers.length > 0) {
          saveObserverAssignments(observerEventId, heatNumber, round, observers);
        }
      }
    }
  };

  // Observer state - store per heat
  const [observersByHeat, setObserversByHeat] = useState<Map<number, ObserverAssignment[]>>(new Map());
  const [loadingObservers, setLoadingObservers] = useState(false);
  const resolvedObserverSettings = useRef<{ enableObservers?: boolean; observersPerHeat?: number } | null>(null);
  const [showObserverSelector, setShowObserverSelector] = useState(false);
  const [selectedHeatForObserver, setSelectedHeatForObserver] = useState<number>(1);
  const [showCustomObserverInput, setShowCustomObserverInput] = useState(false);
  const [customObserverName, setCustomObserverName] = useState('');

  useEffect(() => {
    if (isOpen) {
      setEditMode(false);
      setModifiedPromotions(new Set());
      setModifiedRelegations(new Set());
      setAppliedPromotions(new Set());
      setAppliedRelegations(new Set());
      setHasAppliedChanges(false);
      setIsApplyingChanges(false);
      setInitialEditMode(false);
      setSelectedSkipperToMove(null);
      setLocalAssignments(null);

      // Set previewRoundIndex to match the round that will actually be displayed
      const isSHRSPreset = heatManagement.configuration.scoringSystem === 'shrs' &&
        heatManagement.configuration.shrsAssignmentMode === 'preset' &&
        heatManagement.rounds.length > 1;
      if (isSHRSPreset) {
        const rjc = heatManagement.roundJustCompleted;
        let displayIdx: number;
        if (rjc) {
          displayIdx = heatManagement.rounds.findIndex(r => r.round === rjc);
        } else {
          const firstIncomplete = heatManagement.rounds.findIndex(r => !r.completed);
          displayIdx = firstIncomplete >= 0 ? firstIncomplete : heatManagement.rounds.findIndex(r => r.round === heatManagement.currentRound);
        }
        setPreviewRoundIndex(displayIdx >= 0 ? displayIdx : 0);
      } else {
        setPreviewRoundIndex(null);
      }
    } else {
      resolvedObserverSettings.current = null;
    }
  }, [isOpen]);

  const roundDataKey = useMemo(() => {
    const { currentRound, roundJustCompleted, rounds } = heatManagement;

    let targetRound;
    if (previewRoundIndex !== null) {
      targetRound = rounds[previewRoundIndex]?.round || currentRound;
    } else if (roundJustCompleted && currentRound > roundJustCompleted) {
      targetRound = currentRound;
    } else if (roundJustCompleted) {
      targetRound = roundJustCompleted;
    } else {
      const nextUncompleted = rounds.find(r => !r.completed);
      targetRound = nextUncompleted?.round || currentRound;
    }

    const roundData = rounds.find(r => r.round === targetRound);
    if (!roundData) return `${currentRound}-no-data`;

    const heatCount = roundData.heatAssignments.length;
    const completionStatus = roundData.completed ? 'complete' : 'incomplete';
    const justCompletedFlag = roundJustCompleted ? `jc${roundJustCompleted}` : 'active';
    const assignmentHash = roundData.heatAssignments
      .map(h => `${h.heatDesignation}:${h.skipperIndices.slice().sort().join(',')}`)
      .join('|');

    return `${targetRound}-${heatCount}-${completionStatus}-${justCompletedFlag}-${assignmentHash}-preview${previewRoundIndex}`;
  }, [heatManagement.currentRound, heatManagement.roundJustCompleted, heatManagement.rounds, previewRoundIndex]);

  const skippersRef = useRef(skippers);
  skippersRef.current = skippers;

  const preAllocationDone = React.useRef(false);

  useEffect(() => {
    if (!isOpen) {
      preAllocationDone.current = false;
      setShowFinaliseConfirm(false);
      setShowQualifyingCompletePrompt(false);
      setShowExtendSettings(false);
    }
  }, [isOpen]);

  useEffect(() => {
    let cancelled = false;

    const safetyTimeout = setTimeout(() => {
      setLoadingObservers(false);
    }, 8000);

    const loadObservers = async () => {
      if (!isOpen) {
        setObserversByHeat(new Map());
        setLoadingObservers(false);
        return;
      }

      let resolvedEventId = observerEventId;
      if (!resolvedEventId) {
        resolvedEventId = await resolveObserverEventId(currentEvent);
        if (resolvedEventId && !cancelled) {
          setResolvedObserverId(resolvedEventId);
        }
      }
      if (!resolvedEventId) {
        setObserversByHeat(new Map());
        setLoadingObservers(false);
        return;
      }

      let enableObs = currentEvent?.enable_observers ?? resolvedObserverSettings.current?.enableObservers;
      let resolvedObsPerHeat = currentEvent?.observers_per_heat ?? resolvedObserverSettings.current?.observersPerHeat;
      if (enableObs === undefined) {
        const roundId = currentEvent?.isSeriesEvent
          ? (currentEvent?.seriesRoundId || resolvedEventId)
          : null;
        const tableName = roundId ? 'race_series_rounds' : 'quick_races';
        const queryId = roundId || resolvedEventId;
        const { data: eventData, error } = await supabase
          .from(tableName)
          .select('enable_observers, observers_per_heat')
          .eq('id', queryId)
          .maybeSingle();

        if (error || cancelled) {
          if (!cancelled) {
            setObserversByHeat(new Map());
            setLoadingObservers(false);
          }
          return;
        }

        enableObs = eventData?.enable_observers ?? true;
        resolvedObsPerHeat = eventData?.observers_per_heat ?? 2;
        resolvedObserverSettings.current = { enableObservers: enableObs, observersPerHeat: resolvedObsPerHeat };

        if (!enableObs) {
          if (!cancelled) {
            setObserversByHeat(new Map());
            setLoadingObservers(false);
          }
          return;
        }
      } else if (!enableObs) {
        setObserversByHeat(new Map());
        setLoadingObservers(false);
        return;
      }

      setLoadingObservers(true);
      try {
        const { currentRound, rounds, roundJustCompleted } = heatManagement;
        const isSHRSMode = heatManagement.configuration.scoringSystem === 'shrs';
        const observersPerHeat = resolvedObsPerHeat || currentEvent.observers_per_heat || 2;

        const shrsPreAssign = isSHRSMode &&
          rounds.length > 1 &&
          !rounds.some(r => r.results && r.results.length > 0);

        if (shrsPreAssign && !preAllocationDone.current) {
          preAllocationDone.current = true;
          await preAllocateObserversForAllRounds(
            resolvedEventId,
            rounds.map(r => ({
              round: r.round,
              heatAssignments: r.heatAssignments.map(h => ({
                heatDesignation: h.heatDesignation as string,
                skipperIndices: h.skipperIndices
              }))
            })),
            skippersRef.current,
            observersPerHeat
          );
        }

        if (cancelled) return;

        let roundToLoadObserversFor;
        if (previewRoundIndex !== null && shrsPreAssign) {
          roundToLoadObserversFor = rounds[previewRoundIndex];
        } else if (roundJustCompleted) {
          roundToLoadObserversFor = rounds.find(r => r.round === roundJustCompleted);
        } else {
          roundToLoadObserversFor = rounds.find(r => !r.completed) || rounds.find(r => r.round === currentRound);
        }

        if (!roundToLoadObserversFor) {
          if (!cancelled) {
            setObserversByHeat(new Map());
            setLoadingObservers(false);
          }
          return;
        }

        const currentRoundData = roundToLoadObserversFor;
        const roundNumberToLoad = currentRoundData.round;

        const newObserversByHeat = new Map<number, ObserverAssignment[]>();

        const sortedHeats = [...currentRoundData.heatAssignments].sort((a, b) =>
          a.heatDesignation.localeCompare(b.heatDesignation)
        );

        if (shrsPreAssign) {
          const batchObservers = await getObserverAssignmentsForRound(resolvedEventId, roundNumberToLoad);
          if (cancelled) return;
          for (let i = 0; i < sortedHeats.length; i++) {
            const heatNumber = i + 1;
            const heatObs = batchObservers.get(heatNumber);
            if (heatObs && heatObs.length > 0) {
              newObserversByHeat.set(heatNumber, heatObs);
            }
          }
        } else {
          const roundResults = currentRoundData.results || [];

          const heatCompletionStatus = sortedHeats.map((heat, idx) => {
            const heatResults = roundResults.filter(r => r.heatDesignation === heat.heatDesignation);
            let isCompleted;
            if (currentRoundData.completed) {
              isCompleted = heatResults.some(r => r.position !== null || r.letterScore || r.markedAsUP);
            } else {
              isCompleted = heat.skipperIndices.length > 0 && heat.skipperIndices.every(skipperIdx => {
                const result = heatResults.find(r => r.skipperIndex === skipperIdx);
                return result && (result.position !== null || result.letterScore || result.markedAsUP);
              });
            }
            return { heatDesignation: heat.heatDesignation, heatNumber: idx + 1, isCompleted };
          });

          const nextHeatToScore = [...heatCompletionStatus].reverse().find(h => !h.isCompleted);
          const noScoringStarted = roundResults.length === 0;

          const batchObservers = await getObserverAssignmentsForRound(resolvedEventId, roundNumberToLoad);
          if (cancelled) return;

          for (let i = 0; i < sortedHeats.length; i++) {
            if (cancelled) return;
            const heat = sortedHeats[i];
            const heatNumber = i + 1;
            const isNextHeatToScore = nextHeatToScore && nextHeatToScore.heatNumber === heatNumber;
            const isCompletedHeat = heatCompletionStatus[i].isCompleted;
            const adjacentHeat = i - 1 >= 0 ? sortedHeats[i - 1] : null;
            const nextHeatIndices = adjacentHeat ? adjacentHeat.skipperIndices : undefined;

            if (!isNextHeatToScore && !isCompletedHeat && !isSHRSMode && !noScoringStarted) {
              continue;
            }

            const existingObservers = batchObservers.get(heatNumber) || [];

            if (isCompletedHeat) {
              if (existingObservers.length > 0) {
                newObserversByHeat.set(heatNumber, existingObservers);
              }
              continue;
            }

            const observersRacingInHeat = existingObservers.filter(obs =>
              obs.skipper_index !== undefined && obs.skipper_index !== null &&
              heat.skipperIndices.includes(obs.skipper_index)
            );

            const observersInNextHeat = existingObservers.filter(obs =>
              obs.skipper_index !== undefined && obs.skipper_index !== null &&
              nextHeatIndices && nextHeatIndices.includes(obs.skipper_index)
            );

            const currentSkippers = skippersRef.current;
            const observersStillExist = existingObservers.filter(obs =>
              obs.skipper_index !== undefined && obs.skipper_index !== null &&
              obs.skipper_index >= 0 && obs.skipper_index < currentSkippers.length && currentSkippers[obs.skipper_index]
            );

            const hasValid = existingObservers.length > 0 &&
              existingObservers.length === observersPerHeat &&
              observersRacingInHeat.length === 0 &&
              observersInNextHeat.length === 0 &&
              observersStillExist.length === existingObservers.length;

            if (hasValid) {
              newObserversByHeat.set(heatNumber, existingObservers);
            } else {
              const observersForThisHeat = await selectObservers(
                resolvedEventId,
                heatNumber,
                roundNumberToLoad,
                heat.skipperIndices,
                currentSkippers,
                observersPerHeat,
                nextHeatIndices
              );

              if (observersForThisHeat.length > 0) {
                const saved = await saveObserverAssignments(
                  resolvedEventId,
                  heatNumber,
                  roundNumberToLoad,
                  observersForThisHeat
                );
                if (saved) {
                  newObserversByHeat.set(heatNumber, observersForThisHeat);
                }
              }
            }
          }
        }

        if (!cancelled) setObserversByHeat(newObserversByHeat);
      } catch (error) {
        console.error('Error loading observers:', error);
      } finally {
        if (!cancelled) setLoadingObservers(false);
      }
    };

    loadObservers();
    return () => {
      cancelled = true;
      clearTimeout(safetyTimeout);
      setLoadingObservers(false);
    };
  }, [isOpen, observerEventId, roundDataKey]);

  if (!isOpen) return null;

  const { currentRound, rounds, configuration } = heatManagement;
  const promotionCount = configuration.promotionCount;

  // Helper function to count how many skippers are currently promoted from a specific heat
  const countCurrentPromotions = (heatDesignation: HeatDesignation): number => {
    // Find results for this heat
    const heatResults = results?.filter(r => r.heatDesignation === heatDesignation) || [];

    // Count how many are promoted (considering both natural promotion and modifications)
    let count = 0;
    heatResults.forEach(result => {
      if (!result.position) return;

      // Determine if naturally promoted
      const naturallyPromoted = result.position <= promotionCount;

      // Check if manually toggled
      const manuallyToggled = modifiedPromotions.has(result.skipperIndex);

      // Final status: naturally promoted XOR manually toggled
      const isPromoted = naturallyPromoted ? !manuallyToggled : manuallyToggled;

      if (isPromoted) count++;
    });

    return count;
  };

  // Helper function to count how many skippers are currently relegated from a specific heat
  const countCurrentRelegations = (heatDesignation: HeatDesignation): number => {
    // Find results for this heat
    const heatResults = results?.filter(r => r.heatDesignation === heatDesignation) || [];
    const totalInHeat = heatResults.length;

    // Count how many are relegated (considering both natural relegation and modifications)
    let count = 0;
    heatResults.forEach(result => {
      if (!result.position) return;

      // Determine if naturally relegated (bottom finishers)
      const naturallyRelegated = result.position > (totalInHeat - promotionCount);

      // Check if manually toggled
      const manuallyToggled = modifiedRelegations.has(result.skipperIndex);

      // Final status: naturally relegated XOR manually toggled
      const isRelegated = naturallyRelegated ? !manuallyToggled : manuallyToggled;

      if (isRelegated) count++;
    });

    return count;
  };

  // If a round was just completed, show that completed round with its results
  // Otherwise, find the next uncompleted round to score
  const roundJustCompleted = heatManagement.roundJustCompleted;
  let roundToDisplay;

  if (previewRoundIndex !== null && shrsHasPreAssignments) {
    roundToDisplay = rounds[previewRoundIndex];
  } else if (roundJustCompleted) {
    roundToDisplay = rounds.find(r => r.round === roundJustCompleted);
  } else {
    roundToDisplay = rounds.find(r => !r.completed) || rounds.find(r => r.round === currentRound);
  }

  if (!roundToDisplay) return null;

  let { round, heatAssignments, results, completed } = roundToDisplay;

  // If the round is complete, reconstruct heat assignments based on where skippers actually scored
  // This is necessary because mid-round movements modify the assignments
  if (completed && results && results.length > 0) {
    const heatsInResults = new Set(results.map(r => r.heatDesignation));
    const reconstructedAssignments = Array.from(heatsInResults).map(heatDesignation => {
      const skippersWhoScoredInThisHeat = results
        .filter(r => r.heatDesignation === heatDesignation && (r.position !== null || r.letterScore))
        .map(r => r.skipperIndex);

      return {
        heatDesignation,
        skipperIndices: skippersWhoScoredInThisHeat
      };
    });

    // Use reconstructed assignments for display
    if (reconstructedAssignments.length > 0) {
      heatAssignments = reconstructedAssignments;
    }
  }

  // Check if this is Round 1 with no scores (initial allocation)
  const isInitialAllocation = round === 1 && (!results || results.length === 0);

  // Check if this is any unplayed round (no results yet) - allows editing future rounds
  const isUnplayedRound = !completed && (!results || results.length === 0);

  // Check if viewing a previously-scored historical round (not the active round)
  const isHistoricalRound = completed && round !== roundJustCompleted && previewRoundIndex !== null && (() => {
    const firstIncompleteRound = rounds.find(r => !r.completed);
    return firstIncompleteRound ? round < firstIncompleteRound.round : false;
  })();

  // Check if any heat has scoring in progress (partial results)
  const anyScoringInProgress = !completed && heatAssignments.some(assignment => {
    const heatResults = (results || []).filter(r => r.heatDesignation === assignment.heatDesignation);
    const hasResults = heatResults.length > 0;
    const allScored = heatResults.length >= assignment.skipperIndices.length && heatResults.every(r =>
      r.position !== null || r.letterScore || r.markedAsUP
    );
    return hasResults && !allScored;
  });

  // Sort heat assignments alphabetically (A, B, C, etc.) for consistent display
  heatAssignments = [...heatAssignments].sort((a, b) =>
    a.heatDesignation.localeCompare(b.heatDesignation)
  );

  if (initialEditMode && localAssignments) {
    heatAssignments = localAssignments;
  }

  // Find the next round (if current round is complete)
  const nextRound = completed ? rounds.find(r => r.round === round + 1) : null;

  // For SHRS, check if we should allow progression even if next round doesn't exist yet
  const isSHRS = heatManagement.configuration.scoringSystem === 'shrs';
  const shrsPhase = isSHRS ? getSHRSPhase(round, configuration) : null;
  const isFinalsPhase = shrsPhase === 'finals';
  const isTransitionRound = isSHRS && isSHRSTransitionRound(round, configuration);
  const expectedRounds = heatManagement.configuration.numberOfRounds || 6;
  const shouldAllowProgression = completed && round < expectedRounds;

  console.log('HeatAssignmentModal Debug:', {
    round,
    completed,
    roundJustCompleted,
    nextRound: nextRound ? `Round ${nextRound.round}` : 'null',
    totalRounds: rounds.length,
    isSHRS,
    expectedRounds,
    shouldAllowProgression,
    allRounds: rounds.map(r => ({ round: r.round, completed: r.completed }))
  });

  const getHeatGradient = (heat: HeatDesignation): string => {
    if (isSHRS) {
      if (isFinalsPhase) {
        const finalsGradients: Record<HeatDesignation, string> = {
          'A': 'bg-gradient-to-br from-yellow-400 to-yellow-600 border-yellow-700',
          'B': 'bg-gradient-to-br from-slate-300 to-slate-400 border-slate-500',
          'C': 'bg-gradient-to-br from-amber-600 to-amber-700 border-amber-800',
          'D': 'bg-gradient-to-br from-orange-600 to-orange-700 border-orange-800',
          'E': 'bg-gradient-to-br from-blue-500 to-blue-600 border-blue-700',
          'F': 'bg-gradient-to-br from-slate-500 to-slate-600 border-slate-700'
        };
        return finalsGradients[heat] || 'bg-gradient-to-br from-slate-500 to-slate-600 border-slate-700';
      }
      const qualifyingGradients: Record<HeatDesignation, string> = {
        'A': 'bg-gradient-to-br from-blue-500 to-blue-600 border-blue-700',
        'B': 'bg-gradient-to-br from-teal-500 to-teal-600 border-teal-700',
        'C': 'bg-gradient-to-br from-cyan-500 to-cyan-600 border-cyan-700',
        'D': 'bg-gradient-to-br from-sky-500 to-sky-600 border-sky-700',
        'E': 'bg-gradient-to-br from-slate-500 to-slate-600 border-slate-700',
        'F': 'bg-gradient-to-br from-slate-500 to-slate-600 border-slate-700'
      };
      return qualifyingGradients[heat] || 'bg-gradient-to-br from-slate-500 to-slate-600 border-slate-700';
    }
    const gradients: Record<HeatDesignation, string> = {
      'A': 'bg-gradient-to-br from-yellow-500 to-amber-600 border-amber-700',
      'B': 'bg-gradient-to-br from-orange-500 to-orange-600 border-orange-700',
      'C': 'bg-gradient-to-br from-pink-500 to-rose-600 border-rose-700',
      'D': 'bg-gradient-to-br from-green-500 to-emerald-600 border-emerald-700',
      'E': 'bg-gradient-to-br from-blue-500 to-blue-600 border-blue-700',
      'F': 'bg-gradient-to-br from-purple-500 to-purple-600 border-purple-700'
    };
    return gradients[heat] || 'bg-gradient-to-br from-slate-500 to-slate-600 border-slate-700';
  };

  const heatCount = heatAssignments.length;
  const maxWidthClass = heatCount >= 5
    ? 'max-w-[95vw]'
    : heatCount === 4
    ? 'max-w-[85vw]'
    : heatCount === 3
    ? 'max-w-[75vw]'
    : heatCount === 2
    ? 'max-w-[60vw]'
    : 'max-w-[40vw]';

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/75">
      <div
        className={`w-full ${maxWidthClass} max-h-[92vh] rounded-xl shadow-2xl overflow-hidden flex flex-col relative ${
          darkMode ? 'bg-slate-800 text-white' : 'bg-white text-slate-900'
        }`}
      >
        {loadingObservers && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm rounded-xl">
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-blue-500/30 rounded-full"></div>
                <div className="absolute inset-0 w-16 h-16 border-4 border-transparent border-t-blue-500 rounded-full animate-spin"></div>
                <Eye className="absolute inset-0 m-auto text-blue-400" size={24} />
              </div>
              <div className="text-center">
                <p className="text-white font-semibold text-lg">Loading Observers</p>
                <p className="text-slate-300 text-sm mt-1">Fetching observer assignments for each heat...</p>
              </div>
            </div>
          </div>
        )}
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-3 border-b flex-shrink-0 ${
          darkMode ? 'border-slate-700' : 'border-slate-200'
        }`}>
          <div className="flex items-center gap-3">
            <Users className="text-blue-400" size={24} />
            <div>
              <h2 className="text-lg font-bold">
                {isSHRS ? getSHRSRoundLabel(round, configuration) : `Race ${round}`} - {configuration.scoringSystem === 'shrs' ? `SHRS-${configuration.shrsAssignmentMode === 'preset' ? 'B' : 'P'}` : configuration.scoringSystem.toUpperCase()} {completed ? 'Heat Results' : 'Heat Assignments'}
              </h2>
              <p className={`text-xs mt-0.5 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                {isSHRS && shrsPhase ? (
                  <span className={`font-semibold ${isFinalsPhase ? 'text-yellow-500' : 'text-blue-400'}`}>
                    {isFinalsPhase ? 'Finals Series' : 'Qualifying Series'}
                  </span>
                ) : (
                  completed ? 'Race Complete' : 'Current Race'
                )}
                {' '} • {heatAssignments.length} heats
                {editMode && <span className="ml-2 text-amber-500 font-semibold">• Edit Mode</span>}
                {!editMode && hasAppliedChanges && <span className="ml-2 text-green-500 font-semibold">• Changes Applied</span>}
                {initialEditMode && <span className="ml-2 text-amber-500 font-semibold">• Tap skipper then tap heat to move - balance heats before saving</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative" ref={exportMenuRef}>
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  darkMode
                    ? 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Download size={16} />
                Export Assignments
                <ChevronDown size={14} />
              </button>
              {showExportMenu && (
                <div className={`absolute right-0 top-full mt-1 w-64 rounded-lg shadow-lg border z-50 py-1 ${
                  darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
                }`}>
                  <div className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider ${
                    darkMode ? 'text-slate-500' : 'text-slate-400'
                  }`}>
                    PDF
                  </div>
                  <button
                    onClick={() => { handleExportCurrentRoundPdf(); setShowExportMenu(false); }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                      darkMode ? 'text-slate-200 hover:bg-slate-700' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <FileDown size={15} className="flex-shrink-0" />
                    This Heat (PDF)
                  </button>
                  <button
                    onClick={() => { handleExportAllRoundsPdf(); setShowExportMenu(false); }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                      darkMode ? 'text-slate-200 hover:bg-slate-700' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <FileDown size={15} className="flex-shrink-0" />
                    All Heats (PDF)
                  </button>
                  <div className={`my-1 border-t ${darkMode ? 'border-slate-700' : 'border-slate-200'}`} />
                  <div className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider ${
                    darkMode ? 'text-slate-500' : 'text-slate-400'
                  }`}>
                    CSV
                  </div>
                  <button
                    onClick={() => { exportCurrentRoundCsv(); setShowExportMenu(false); }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                      darkMode ? 'text-slate-200 hover:bg-slate-700' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <FileSpreadsheet size={15} className="flex-shrink-0" />
                    This Heat (CSV)
                  </button>
                  <button
                    onClick={() => { exportAllAssignmentsCsv(); setShowExportMenu(false); }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                      darkMode ? 'text-slate-200 hover:bg-slate-700' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <FileSpreadsheet size={15} className="flex-shrink-0" />
                    All Heats (CSV)
                  </button>
                  <button
                    onClick={() => { exportAssignmentsBySkipperCsv(); setShowExportMenu(false); }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                      darkMode ? 'text-slate-200 hover:bg-slate-700' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Users size={15} className="flex-shrink-0" />
                    By Skipper (CSV)
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={() => {
                if (!isInitialAllocation && onStartRound && completed && nextRound) {
                  onStartRound(nextRound.round);
                }
                setPreviewRoundIndex(null);
                onClose();
              }}
              className={`p-2 rounded-lg transition-colors ${
                darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100'
              }`}
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {shrsHasPreAssignments && totalPreAssignedRounds > 1 && (
          <div className={`flex items-center justify-center gap-3 px-5 py-2 border-b flex-shrink-0 ${
            darkMode ? 'border-slate-700 bg-slate-750' : 'border-slate-200 bg-slate-50'
          }`}>
            <button
              onClick={() => setPreviewRoundIndex(prev => Math.max(0, (prev ?? 0) - 1))}
              disabled={(previewRoundIndex ?? 0) === 0}
              className={`p-1 rounded transition-colors ${
                (previewRoundIndex ?? 0) === 0
                  ? 'opacity-30 cursor-not-allowed'
                  : darkMode ? 'hover:bg-slate-600' : 'hover:bg-slate-200'
              }`}
            >
              <ChevronLeft size={20} />
            </button>
            <div className="flex items-center gap-1.5 flex-wrap justify-center">
              {heatManagement.rounds.map((rd, idx) => {
                const isSelected = (previewRoundIndex ?? 0) === idx;
                const hasResults = rd.results && rd.results.length > 0;
                const isCompleted = rd.completed;
                return (
                  <button
                    key={rd.round}
                    onClick={() => setPreviewRoundIndex(idx)}
                    className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                      isSelected
                        ? 'bg-blue-500 text-white'
                        : isCompleted
                          ? darkMode
                            ? 'bg-green-800/50 text-green-300 hover:bg-green-700/60'
                            : 'bg-green-100 text-green-700 hover:bg-green-200'
                          : hasResults
                            ? darkMode
                              ? 'bg-amber-800/50 text-amber-300 hover:bg-amber-700/60'
                              : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                            : darkMode
                              ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                              : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                    }`}
                  >
                    {getSHRSRoundLabel(rd.round, heatManagement.configuration)}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setPreviewRoundIndex(prev => Math.min(totalPreAssignedRounds - 1, (prev ?? 0) + 1))}
              disabled={(previewRoundIndex ?? 0) === totalPreAssignedRounds - 1}
              className={`p-1 rounded transition-colors ${
                (previewRoundIndex ?? 0) === totalPreAssignedRounds - 1
                  ? 'opacity-30 cursor-not-allowed'
                  : darkMode ? 'hover:bg-slate-600' : 'hover:bg-slate-200'
              }`}
            >
              <ChevronRight size={20} />
            </button>
          </div>
        )}

        {limitWarning && (
          <div className={`mx-5 mt-2 p-2 rounded-lg border flex-shrink-0 ${
            darkMode
              ? 'bg-amber-900/20 border-amber-700/50 text-amber-300'
              : 'bg-amber-50 border-amber-300 text-amber-800'
          }`}>
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <p className="text-xs font-medium">{limitWarning}</p>
            </div>
          </div>
        )}

        {/* Heat Grid - Always columns */}
        <div className="px-5 py-3 overflow-hidden flex-1 flex flex-col min-h-0">
          <div className="flex gap-3 flex-1 overflow-hidden">
            {/* Find the last completed heat (for edit mode) */}
            {/* Heats complete from bottom to top (C → B → A), so the "last" completed is the HIGHEST one */}
            {(() => {
              let lastCompletedHeatLetter = null;

              // Go through heats from TOP to BOTTOM (A, B, C) to find the first complete heat
              // This gives us the most recently completed heat in the progression
              for (let i = 0; i < heatAssignments.length; i++) {
                const assignment = heatAssignments[i];
                const heatResults = results.filter(r => r.heatDesignation === assignment.heatDesignation);
                const isComplete = heatResults.length > 0 && heatResults.length >= assignment.skipperIndices.length && heatResults.every(r =>
                  r.position !== null || r.letterScore || r.markedAsUP
                );
                if (isComplete) {
                  lastCompletedHeatLetter = assignment.heatDesignation;
                  break; // Found the topmost completed heat (most recently finished)
                }
              }

              // Store this for use in the map below
              window.__lastCompletedHeat = lastCompletedHeatLetter;
              return null;
            })()}

            {heatAssignments.map(assignment => {
              const { heatDesignation, skipperIndices } = assignment;
              const colors = getHeatColorClasses(heatDesignation);

              // Get the last completed heat from our calculation
              const lastCompletedHeatLetter = (window as any).__lastCompletedHeat;
              const isLastCompletedHeat = heatDesignation === lastCompletedHeatLetter;

              // Get results for this heat to show positions if round is complete
              const heatResults = results.filter(r => r.heatDesignation === heatDesignation);

              // For MID-ROUND display: Use RESULTS to show who actually sailed (not assignments)
              // This ensures promoted skippers stay visible in their source heat
              const skippersWhoSailed = heatResults.length > 0
                ? heatResults.map(r => r.skipperIndex)
                : [];

              const allResultsScored = heatResults.length > 0 && heatResults.every(r =>
                r.position !== null || r.letterScore || r.markedAsUP
              );
              const heatCompleted = allResultsScored;

              const heatIdx = ['A', 'B', 'C', 'D', 'E', 'F'].indexOf(heatDesignation);
              const totalHeatsCount = roundToDisplay?.heatAssignments?.length || 0;
              const isBottom = heatIdx === totalHeatsCount - 1;
              const lowerLetter = ['A', 'B', 'C', 'D', 'E', 'F'][heatIdx + 1] as HeatDesignation;
              let lowerCompleted = false;
              if (!isBottom && lowerLetter) {
                const lowerAssignment = heatAssignments.find(a => a.heatDesignation === lowerLetter);
                if (lowerAssignment) {
                  const lowerSkippers = lowerAssignment.skipperIndices;
                  const lowerResults = results.filter(r => r.heatDesignation === lowerLetter);
                  const allAssignedHaveResults = lowerSkippers.length > 0 && lowerSkippers.every(si => {
                    const res = lowerResults.find(r => r.skipperIndex === si);
                    return res && (res.position !== null || res.letterScore || res.markedAsUP);
                  });
                  const allExistingResultsScored = lowerResults.length > 0 &&
                    lowerResults.length >= lowerSkippers.length &&
                    lowerResults.every(r => r.position !== null || r.letterScore || r.markedAsUP);
                  lowerCompleted = allAssignedHaveResults || allExistingResultsScored;
                }
              }
              const scoringSys = heatManagement.configuration.scoringSystem;

              let skippersToDisplay;
              if (editMode) {
                if (isLastCompletedHeat) {
                  // For the last completed heat in edit mode, show all skippers who sailed
                  skippersToDisplay = skippersWhoSailed.length > 0 ? skippersWhoSailed : skipperIndices;
                } else if (heatCompleted) {
                  // For OTHER completed heats in edit mode, show who sailed here
                  skippersToDisplay = skippersWhoSailed;
                } else {
                  const heatIndex = ['A', 'B', 'C', 'D', 'E', 'F'].indexOf(heatDesignation);
                  const lowerHeatLetter = ['A', 'B', 'C', 'D', 'E', 'F'][heatIndex + 1] as HeatDesignation;

                  if (lowerHeatLetter && lastCompletedHeatLetter === lowerHeatLetter) {
                    const lowerHeatResults = results.filter(r => r.heatDesignation === lowerHeatLetter);
                    const allLowerHeatSkippers = lowerHeatResults.map(r => r.skipperIndex);

                    const effectivelyPromoted: number[] = [];
                    lowerHeatResults.forEach(result => {
                      if (!result.position) return;
                      const naturallyPromoted = result.position <= promotionCount && !result.letterScore;
                      const manuallyToggled = modifiedPromotions.has(result.skipperIndex);
                      const shouldBePromoted = naturallyPromoted ? !manuallyToggled : manuallyToggled;
                      if (shouldBePromoted) {
                        effectivelyPromoted.push(result.skipperIndex);
                      }
                    });

                    skippersToDisplay = skipperIndices.filter(idx => !allLowerHeatSkippers.includes(idx));
                    effectivelyPromoted.forEach(idx => {
                      if (!skippersToDisplay.includes(idx)) {
                        skippersToDisplay.push(idx);
                      }
                    });
                  } else {
                    skippersToDisplay = skipperIndices;
                  }
                }
              } else {
                skippersToDisplay = heatCompleted && skippersWhoSailed.length > 0
                  ? skippersWhoSailed
                  : skipperIndices;

                if (!completed && !heatCompleted && !isBottom && lowerCompleted && round >= 2 && scoringSys !== 'shrs') {
                  if (lowerLetter) {
                    const lowerHeatResults = results.filter(r => r.heatDesignation === lowerLetter);
                    const promotedFromBelow = lowerHeatResults
                      .filter(r => r.position !== null && r.position <= promotionCount && !r.letterScore)
                      .sort((a, b) => (a.position || 999) - (b.position || 999))
                      .map(r => r.skipperIndex);

                    promotedFromBelow.forEach(idx => {
                      if (!skippersToDisplay.includes(idx)) {
                        skippersToDisplay.push(idx);
                      }
                    });
                  }
                }
              }

              const isTopHeatVal = heatIdx === 0;
              const skipPromotionGrouping = completed && isTopHeatVal;

              const promotedFromBelowSet = new Set<number>();
              if (round >= 2 && !isBottom && lowerLetter && scoringSys !== 'shrs' && !skipPromotionGrouping && !completed) {
                const lowerHeatResultsForSort = results.filter(r => r.heatDesignation === lowerLetter);
                lowerHeatResultsForSort.forEach(r => {
                  if (r.position !== null && r.position <= promotionCount && !r.letterScore) {
                    promotedFromBelowSet.add(r.skipperIndex);
                  }
                });
              }

              const sortedSkippers = [...skippersToDisplay].sort((a, b) => {
                // In edit results mode, sort by localResults positions
                if (editResultsMode && localResults) {
                  const localA = localResults.find(r => r.skipperIndex === a && r.heatDesignation === heatDesignation);
                  const localB = localResults.find(r => r.skipperIndex === b && r.heatDesignation === heatDesignation);
                  const posA = localA?.position ?? 999;
                  const posB = localB?.position ?? 999;
                  return posA - posB;
                }

                const resultA = heatResults.find(r => r.skipperIndex === a);
                const resultB = heatResults.find(r => r.skipperIndex === b);

                const aHasResult = resultA && resultA.position !== null;
                const bHasResult = resultB && resultB.position !== null;

                if (heatCompleted && aHasResult && bHasResult) {
                  return resultA.position! - resultB.position!;
                }

                const aPromoted = promotedFromBelowSet.has(a);
                const bPromoted = promotedFromBelowSet.has(b);

                if (aPromoted !== bPromoted) {
                  return aPromoted ? 1 : -1;
                }

                if (aHasResult && bHasResult) {
                  return resultA.position! - resultB.position!;
                }
                if (aHasResult && !bHasResult) return -1;
                if (!aHasResult && bHasResult) return 1;
                const sailA = parseInt(skippers[a]?.sailNo || '0', 10) || 0;
                const sailB = parseInt(skippers[b]?.sailNo || '0', 10) || 0;
                return sailA - sailB;
              });

              const heatIndex = heatIdx;
              const totalHeats = totalHeatsCount;
              const isBottomHeat = isBottom;
              const isTopHeat = heatIdx === 0;
              const lowerHeatLetter = lowerLetter;
              const lowerHeatCompleted = lowerCompleted;

              const isDropTarget = initialEditMode && selectedSkipperToMove !== null && !skipperIndices.includes(selectedSkipperToMove);
              const isOverfull = initialEditMode && heatBalanceInfo && !heatBalanceInfo.isBalanced && skipperIndices.length > heatBalanceInfo.minSize + 1;
              const isUnderfull = initialEditMode && heatBalanceInfo && !heatBalanceInfo.isBalanced && skipperIndices.length < heatBalanceInfo.maxSize - 1;

              return (
                <div
                  key={heatDesignation}
                  className={`rounded-lg border-2 overflow-hidden flex flex-col flex-1 min-w-0 relative ${
                    isDropTarget
                      ? 'border-amber-400 ring-2 ring-amber-400/50'
                      : isOverfull
                        ? 'border-red-400 ring-1 ring-red-400/30'
                        : isUnderfull
                          ? 'border-amber-400 ring-1 ring-amber-400/30'
                          : heatCompleted
                            ? 'border-emerald-500/60'
                            : darkMode ? 'bg-slate-700 border-slate-600' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  {heatCompleted && (
                    <div className="absolute inset-0 bg-emerald-900/10 pointer-events-none z-10 rounded-lg" />
                  )}
                  {/* Heat Header */}
                  <div
                    className={`px-2 py-3 ${heatCompleted ? 'bg-gradient-to-r from-emerald-600 to-emerald-700' : getHeatGradient(heatDesignation)} border-b-2 flex-shrink-0 ${
                      isDropTarget ? 'cursor-pointer' : ''
                    }`}
                    onClick={() => {
                      if (!isDropTarget || selectedSkipperToMove === null || !localAssignments) return;
                      const targetAssignment = localAssignments.find(a => a.heatDesignation === heatDesignation);
                      if (!targetAssignment) return;
                      // Move skipper to target heat without auto-swapping
                      const updated = localAssignments.map(a => {
                        if (a.skipperIndices.includes(selectedSkipperToMove) && a.heatDesignation !== heatDesignation) {
                          return { ...a, skipperIndices: a.skipperIndices.filter(i => i !== selectedSkipperToMove) };
                        }
                        if (a.heatDesignation === heatDesignation) {
                          return { ...a, skipperIndices: sortBySailNumber([...a.skipperIndices, selectedSkipperToMove]) };
                        }
                        return a;
                      });
                      setLocalAssignments(updated);
                      resolveObserverConflicts(updated);
                      setSelectedSkipperToMove(null);
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-white">
                        {(isSHRS ? getSHRSHeatLabel(heatDesignation, round, configuration) : `Heat ${getHeatDisplayLabel(heatDesignation, configuration)}`).toUpperCase()}
                      </h3>
                      <div className="flex items-center gap-1.5">
                        {initialEditMode && heatBalanceInfo && !heatBalanceInfo.isBalanced ? (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                            skipperIndices.length > heatBalanceInfo.minSize + 1
                              ? 'bg-red-500/80 text-white'
                              : skipperIndices.length < heatBalanceInfo.maxSize - 1
                                ? 'bg-amber-500/80 text-white'
                                : 'text-white opacity-80'
                          }`}>
                            {skipperIndices.length} skippers
                            {skipperIndices.length > heatBalanceInfo.minSize + 1 && ' (overfull)'}
                            {skipperIndices.length < heatBalanceInfo.maxSize - 1 && ' (needs more)'}
                          </span>
                        ) : (
                          <span className="text-[10px] text-white opacity-80">{skippersToDisplay.length} skippers</span>
                        )}
                        {heatCompleted ? (
                          <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white backdrop-blur-sm">
                            <Check size={10} className="text-white" />
                            Scored
                          </span>
                        ) : heatResults.length > 0 && !completed && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/80 text-white animate-pulse">
                            Scoring
                          </span>
                        )}
                      </div>
                    </div>
                    {isDropTarget && (
                      <div className="flex items-center gap-1 mt-1 text-xs font-semibold text-amber-200">
                        <ArrowRight size={12} />
                        Move skipper here
                      </div>
                    )}
                  </div>

                  {/* Skipper List - Vertical scroll within column */}
                  <div className={`flex-1 p-2 flex flex-col gap-1.5 overflow-y-auto relative ${
                    heatCompleted && !editMode && !editResultsMode ? 'opacity-75' : ''
                  }`}>
                    {sortedSkippers.map((skipperIndex, idx) => {
                      const skipper = skippers[skipperIndex];
                      const result = heatResults.find(r => r.skipperIndex === skipperIndex);

                      if (!skipper) return null;

                      // Intelligent highlighting based on heat position and round context
                      const isTopHeat = heatIndex === 0;

                      // Check if using SHRS (no promotion/relegation)
                      const isSHRS = heatManagement.configuration.scoringSystem === 'shrs';

                      let isPromoted = false;
                      let isRelegated = false;
                      let wasPromotedFromBelow = false;

                      const skipTopHeatPromotionDisplay = completed && isTopHeat && !editMode;

                      if (round >= 2 && !isBottomHeat && lowerHeatLetter && !skipTopHeatPromotionDisplay) {
                        const lowerHeatResults = results.filter(r => r.heatDesignation === lowerHeatLetter);

                        if (editMode && lowerHeatLetter === lastCompletedHeatLetter) {
                          const lowerHeatResult = lowerHeatResults.find(r => r.skipperIndex === skipperIndex);
                          if (lowerHeatResult && lowerHeatResult.position) {
                            const naturallyPromoted = lowerHeatResult.position <= promotionCount;
                            const manuallyToggled = modifiedPromotions.has(skipperIndex);
                            wasPromotedFromBelow = naturallyPromoted ? !manuallyToggled : manuallyToggled;
                          }
                        } else if (!editMode && !completed && lowerHeatCompleted) {
                          wasPromotedFromBelow = lowerHeatResults.some(r =>
                            r.skipperIndex === skipperIndex &&
                            r.position !== null &&
                            r.position <= promotionCount &&
                            !r.letterScore
                          );
                        } else if (completed && !editMode) {
                          // Don't set wasPromotedFromBelow for completed rounds
                          // The isPromoted flag is handled separately via position-based logic below
                        }

                        if (wasPromotedFromBelow) {
                          isPromoted = true;
                        }
                      }

                      // Skip promotion/relegation logic for SHRS
                      if (!isSHRS) {
                      if (completed && result?.position) {
                        if (round === 1) {
                          isPromoted = false;
                          isRelegated = false;
                        }
                        else {
                          if (!isTopHeat) {
                            const upperHeatIdx = heatIndex - 1;
                            const upperHeatAssignment = upperHeatIdx >= 0 ? heatAssignments[upperHeatIdx] : null;
                            const thisHeatSkipperSet = new Set(
                              results.filter(r => r.heatDesignation === heatDesignation).map(r => r.skipperIndex)
                            );
                            const hasMidRoundOverrides = upperHeatAssignment?.skipperIndices.some(
                              (idx: number) => thisHeatSkipperSet.has(idx)
                            );

                            if (hasMidRoundOverrides && upperHeatAssignment) {
                              isPromoted = upperHeatAssignment.skipperIndices.includes(skipperIndex);
                            } else {
                              isPromoted = result.position <= promotionCount;
                            }
                          }
                        }
                      }
                      } // End of !isSHRS check

                      // In EDIT mode, ONLY show promotions in the last completed heat
                      if (!isSHRS && editMode && heatCompleted && result?.position && isLastCompletedHeat) {
                        if (round === 1) {
                          // Round 1: No promotions
                          isPromoted = false;
                          isRelegated = false;
                        } else {
                          // Round 2+: Show top finishers as promoted in the LAST completed heat only
                          if (!isTopHeat) {
                            isPromoted = result.position <= promotionCount;
                          }
                        }
                      }

                      if (!isSHRS && editMode && isLastCompletedHeat) {
                        if (modifiedPromotions.has(skipperIndex)) {
                          isPromoted = !isPromoted;
                        }
                        if (modifiedRelegations.has(skipperIndex)) {
                          isRelegated = !isRelegated;
                        }
                      }

                      // Determine if this skipper can be toggled
                      const totalInHeat = skipperIndices.length;

                      // Allow toggling if the round is complete and skipper has a position
                      const hasPosition = result?.position;
                      const canToggle = completed && hasPosition && editMode;

                      // Determine which action to take when clicked
                      // Priority: 1) Current status (promoted/relegated), 2) Natural zones
                      const isInNaturalPromotionZone = result?.position && result.position <= promotionCount;
                      const isInNaturalRelegationZone = result?.position && result.position > (totalInHeat - promotionCount);

                      // Determine if this card is clickable in edit mode
                      // Only allow clicking on skippers from the LAST completed heat
                      const isClickableInEditMode = editMode && isLastCompletedHeat && heatCompleted && hasPosition && (
                        (!isTopHeat) || // Can modify if not top heat (for relegations)
                        (!isBottomHeat)  // Can modify if not bottom heat (for promotions)
                      );

                      const isRanked = rankedSkipperIndices.has(skipperIndex);
                      const isSelectedForMove = initialEditMode && selectedSkipperToMove === skipperIndex;
                      const isMovable = initialEditMode && !isRanked;

                      return (
                        <div
                          key={skipperIndex}
                          onClick={() => {
                            if (initialEditMode && localAssignments) {
                              if (isRanked) return;
                              if (selectedSkipperToMove === skipperIndex) {
                                setSelectedSkipperToMove(null);
                                return;
                              }
                              if (selectedSkipperToMove !== null) {
                                const sourceHeat = localAssignments.find(a => a.skipperIndices.includes(selectedSkipperToMove));
                                const targetHeat = localAssignments.find(a => a.skipperIndices.includes(skipperIndex));
                                if (sourceHeat && targetHeat && sourceHeat.heatDesignation !== targetHeat.heatDesignation) {
                                  // Move selected skipper to the target heat without auto-swapping
                                  const updated = localAssignments.map(a => {
                                    if (a.heatDesignation === sourceHeat.heatDesignation) {
                                      return {
                                        ...a,
                                        skipperIndices: a.skipperIndices.filter(i => i !== selectedSkipperToMove)
                                      };
                                    }
                                    if (a.heatDesignation === targetHeat.heatDesignation) {
                                      return {
                                        ...a,
                                        skipperIndices: sortBySailNumber([...a.skipperIndices, selectedSkipperToMove])
                                      };
                                    }
                                    return a;
                                  });
                                  setLocalAssignments(updated);
                                  resolveObserverConflicts(updated);
                                  setSelectedSkipperToMove(null);
                                  return;
                                }
                              }
                              setSelectedSkipperToMove(skipperIndex);
                              return;
                            }
                            // Only allow editing if:
                            // 1. Edit mode is active
                            // 2. Skipper has a position
                            // 3. This is the LAST completed heat
                            if (!editMode || !result?.position || !isLastCompletedHeat) return;

                            // Decide which status to toggle based on priority:
                            // 1. If currently relegated, toggle relegation (to allow un-relegating)
                            // 2. If currently promoted, toggle promotion (to allow un-promoting)
                            // 3. If in natural relegation zone and not bottom heat, toggle relegation
                            // 4. If not top heat, toggle promotion (default for heats that can promote)

                            if (isRelegated && !isBottomHeat) {
                              // Currently relegated - allow toggling off (always allowed)
                              setModifiedRelegations(prev => {
                                const newSet = new Set(prev);
                                if (newSet.has(skipperIndex)) {
                                  newSet.delete(skipperIndex);
                                  setLimitWarning(null);
                                } else {
                                  newSet.add(skipperIndex);
                                }
                                return newSet;
                              });
                            } else if (isPromoted && !isTopHeat) {
                              // Currently promoted - allow toggling off (always allowed)
                              setModifiedPromotions(prev => {
                                const newSet = new Set(prev);
                                if (newSet.has(skipperIndex)) {
                                  newSet.delete(skipperIndex);
                                  // Clear any warning when deselecting
                                  setLimitWarning(null);
                                } else {
                                  newSet.add(skipperIndex);
                                }
                                return newSet;
                              });
                            } else if (isInNaturalRelegationZone && !isBottomHeat) {
                              // In relegation zone - toggle relegation
                              // Check relegation limit before allowing new selection
                              const currentRelegationCount = countCurrentRelegations(heatDesignation);

                              setModifiedRelegations(prev => {
                                const newSet = new Set(prev);
                                if (newSet.has(skipperIndex)) {
                                  // Always allow deselecting
                                  newSet.delete(skipperIndex);
                                  setLimitWarning(null);
                                } else {
                                  // Check if we're at the limit before allowing new selection
                                  if (currentRelegationCount >= promotionCount) {
                                    // Show warning and prevent selection
                                    setLimitWarning(`Cannot relegate more than ${promotionCount} skippers from Heat ${getHeatDisplayLabel(heatDesignation, configuration)}`);
                                    setTimeout(() => setLimitWarning(null), 3000);
                                    return prev; // Return unchanged set
                                  }
                                  newSet.add(skipperIndex);
                                }
                                return newSet;
                              });
                            } else if (!isTopHeat) {
                              // Default: toggle promotion for heats that can promote
                              // Check promotion limit before allowing new selection
                              const currentPromotionCount = countCurrentPromotions(heatDesignation);

                              setModifiedPromotions(prev => {
                                const newSet = new Set(prev);
                                if (newSet.has(skipperIndex)) {
                                  // Always allow deselecting
                                  newSet.delete(skipperIndex);
                                  // Clear any warning when deselecting
                                  setLimitWarning(null);
                                } else {
                                  // Check if we're at the limit before allowing new selection
                                  if (currentPromotionCount >= promotionCount) {
                                    // Show warning and prevent selection
                                    setLimitWarning(`Cannot promote more than ${promotionCount} skippers from Heat ${getHeatDisplayLabel(heatDesignation, configuration)}`);
                                    setTimeout(() => setLimitWarning(null), 3000);
                                    return prev; // Return unchanged set
                                  }
                                  newSet.add(skipperIndex);
                                }
                                return newSet;
                              });
                            }
                          }}
                          draggable={editResultsMode && (isHistoricalRound || completed)}
                          onDragStart={(e) => {
                            if (!editResultsMode || !(isHistoricalRound || completed)) return;
                            e.dataTransfer.effectAllowed = 'move';
                            const localResult = localResults?.find(r => r.skipperIndex === skipperIndex && r.heatDesignation === heatDesignation);
                            setDraggedSkipper({ skipperIndex, heatDesignation, fromPosition: localResult?.position ?? idx + 1 });
                          }}
                          onDragEnd={() => {
                            setDraggedSkipper(null);
                            setDragOverTarget(null);
                          }}
                          onDragOver={(e) => {
                            if (!editResultsMode || !draggedSkipper || draggedSkipper.heatDesignation !== heatDesignation) return;
                            if (draggedSkipper.skipperIndex === skipperIndex) return;
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                            setDragOverTarget({ skipperIndex, heatDesignation });
                          }}
                          onDragLeave={() => {
                            if (dragOverTarget?.skipperIndex === skipperIndex) {
                              setDragOverTarget(null);
                            }
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (!editResultsMode || !draggedSkipper || !localResults) return;
                            if (draggedSkipper.heatDesignation !== heatDesignation) return;
                            if (draggedSkipper.skipperIndex === skipperIndex) return;

                            // Swap positions between dragged and target within same heat
                            const updatedResults = localResults.map(r => {
                              if (r.heatDesignation !== heatDesignation) return r;
                              if (r.skipperIndex === draggedSkipper.skipperIndex) {
                                const targetResult = localResults.find(lr => lr.skipperIndex === skipperIndex && lr.heatDesignation === heatDesignation);
                                return { ...r, position: targetResult?.position ?? r.position };
                              }
                              if (r.skipperIndex === skipperIndex) {
                                const dragResult = localResults.find(lr => lr.skipperIndex === draggedSkipper.skipperIndex && lr.heatDesignation === heatDesignation);
                                return { ...r, position: dragResult?.position ?? r.position };
                              }
                              return r;
                            });
                            setLocalResults(updatedResults);
                            setDraggedSkipper(null);
                            setDragOverTarget(null);
                          }}
                          className={`p-1.5 rounded border-2 transition-all ${
                            editResultsMode && (isHistoricalRound || completed) ? 'cursor-grab active:cursor-grabbing' : ''
                          } ${
                            editResultsMode && dragOverTarget?.skipperIndex === skipperIndex && dragOverTarget?.heatDesignation === heatDesignation
                              ? 'ring-2 ring-blue-400 border-blue-400 scale-[1.02]'
                              : ''
                          } ${
                            editResultsMode && draggedSkipper?.skipperIndex === skipperIndex
                              ? 'opacity-50 scale-95'
                              : ''
                          } ${
                            isSelectedForMove
                              ? 'ring-2 ring-amber-400 cursor-pointer'
                              : isMovable
                                ? 'cursor-pointer hover:shadow-lg hover:scale-105'
                                : initialEditMode && isRanked
                                  ? 'opacity-70'
                                  : ''
                          } ${
                            isClickableInEditMode ? 'cursor-pointer hover:shadow-lg hover:scale-105' : ''
                          } ${
                            isSelectedForMove
                              ? 'bg-amber-50 border-amber-400 dark:bg-amber-900/30 dark:border-amber-500'
                              : initialEditMode && isRanked
                              ? darkMode ? 'bg-slate-800 border-green-700' : 'bg-green-50 border-green-300'
                              : isPromoted
                              ? 'bg-green-50 border-green-400 dark:bg-green-900/20 dark:border-green-500'
                              : isRelegated
                              ? 'bg-red-50 border-red-400 dark:bg-red-900/20 dark:border-red-500'
                              : darkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            {editResultsMode && (isHistoricalRound || completed) && (
                              <GripVertical size={14} className={`flex-shrink-0 ${darkMode ? 'text-slate-400' : 'text-slate-400'}`} />
                            )}
                            {result && result.position !== null && (() => {
                              const displayPos = editResultsMode && localResults
                                ? (localResults.find(r => r.skipperIndex === skipperIndex && r.heatDesignation === heatDesignation)?.position ?? result.position)
                                : result.position;
                              return (
                                <span className={`
                                  flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold
                                  ${displayPos === 1 ? 'bg-yellow-500 text-yellow-900' :
                                    displayPos === 2 ? 'bg-slate-300 text-slate-900' :
                                    displayPos === 3 ? 'bg-amber-600 text-white' :
                                    darkMode ? 'bg-slate-600 text-white' : 'bg-slate-200 text-slate-900'}
                                `}>
                                  {displayPos}
                                </span>
                              );
                            })()}

                            <div className={`flex-shrink-0 min-w-[3rem] px-1.5 py-0.5 text-xs rounded font-bold text-center ${
                              darkMode ? 'bg-slate-600 text-white' : 'bg-slate-200 text-slate-900'
                            }`}>
                              {currentEvent?.show_country && skipper.country_code && (
                                <span className="mr-1">
                                  {getIOCCode(skipper.country_code)}
                                </span>
                              )}
                              {skipper.sailNo}
                            </div>

                            {currentEvent?.show_flag && skipper.country_code && (
                              <div className="flex-shrink-0 text-lg leading-none">
                                {getCountryFlag(skipper.country_code)}
                              </div>
                            )}

                            <div className="flex-1 min-w-0 flex items-center gap-1.5">
                              <p
                                className={`font-medium truncate text-xs ${
                                  darkMode ? 'text-white' : 'text-slate-900'
                                }`}
                                title={skipper.name}
                              >
                                {skipper.name}
                              </p>
                              {isPromoted && (
                                <span className="flex-shrink-0 text-[9px] font-semibold text-green-600 dark:text-green-400">
                                  {wasPromotedFromBelow ? `From Heat ${lowerHeatLetter}` : 'Promoted'}
                                </span>
                              )}
                              {isRelegated && (
                                <span className="flex-shrink-0 text-[9px] font-semibold text-red-600 dark:text-red-400">
                                  Relegate
                                </span>
                              )}
                              {initialEditMode && isRanked && (
                                <span className="flex-shrink-0 text-[9px] font-semibold text-green-600 dark:text-green-400 flex items-center gap-0.5">
                                  <Lock size={8} /> Ranked
                                </span>
                              )}
                              {isSelectedForMove && (
                                <span className="flex-shrink-0 text-[9px] font-semibold text-amber-600 dark:text-amber-400">
                                  Tap heat to move
                                </span>
                              )}
                            </div>

                            {skipper.avatarUrl ? (
                              <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0">
                                <img
                                  src={skipper.avatarUrl}
                                  alt={skipper.name}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            ) : (
                              <div className={`w-6 h-6 text-[10px] rounded-full flex items-center justify-center font-bold flex-shrink-0 ${
                                darkMode ? 'bg-slate-600 text-slate-300' : 'bg-slate-300 text-slate-700'
                              }`}>
                                {skipper.name.split(' ').map(n => n[0]).join('')}
                              </div>
                            )}

                            {editResultsMode && (isHistoricalRound || completed) ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditLetterScoreTarget({ skipperIndex, heatDesignation });
                                }}
                                className={`flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded transition-colors ${
                                  (() => {
                                    const lr = localResults?.find(r => r.skipperIndex === skipperIndex && r.heatDesignation === heatDesignation);
                                    const ls = lr?.letterScore || result?.letterScore;
                                    return ls
                                      ? 'bg-red-500 text-white hover:bg-red-600'
                                      : darkMode
                                        ? 'bg-slate-600 text-slate-300 hover:bg-slate-500'
                                        : 'bg-slate-200 text-slate-600 hover:bg-slate-300';
                                  })()
                                }`}
                                title="Click to assign or change letter score"
                              >
                                {(() => {
                                  const lr = localResults?.find(r => r.skipperIndex === skipperIndex && r.heatDesignation === heatDesignation);
                                  const ls = lr?.letterScore || result?.letterScore;
                                  return ls || <Pencil size={10} />;
                                })()}
                              </button>
                            ) : result && result.letterScore ? (
                              <span className="flex-shrink-0 text-[10px] font-semibold px-1 py-0.5 rounded bg-red-500 text-white">
                                {result.letterScore}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}

                    {!completed && !heatCompleted && round >= 2 && !isBottomHeat && !lowerHeatCompleted && !hasAppliedChanges && !isSHRS && (
                      <>
                        {Array.from({ length: promotionCount }).map((_, idx) => (
                          <div
                            key={`p-slot-${idx}`}
                            className={`p-2 rounded border-2 border-dashed transition-all ${
                              darkMode
                                ? 'bg-slate-900/50 border-slate-500 text-slate-400'
                                : 'bg-slate-100 border-slate-300 text-slate-500'
                            }`}
                          >
                            <div className="flex items-center gap-2 justify-center">
                              <span className={`
                                w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold
                                ${darkMode ? 'bg-blue-500/30 text-blue-300' : 'bg-blue-100 text-blue-600'}
                              `}>
                                P
                              </span>
                              <span className="text-xs font-medium">
                                Promotion slot
                              </span>
                            </div>
                          </div>
                        ))}
                      </>
                    )}

                  </div>

                  {/* Observers Section - Fixed to bottom using mt-auto */}
                  {/* In HMS mode, only show observers for the currently active heat */}
                  {currentEvent?.enable_observers && (() => {
                    const heatIndex = ['A', 'B', 'C', 'D', 'E', 'F'].indexOf(heatDesignation);
                    const heatNumber = heatIndex + 1;
                    const heatObservers = observersByHeat.get(heatNumber) || [];

                    if (heatObservers.length === 0) {
                      return null;
                    }

                    const isHMS = heatManagement.configuration.scoringSystem === 'hms';
                    if (isHMS && !completed) {
                      const isActiveHeat = (isBottomHeat && !heatCompleted) ||
                        (!isBottomHeat && lowerHeatCompleted && !heatCompleted);
                      if (!isActiveHeat && !heatCompleted) {
                        return null;
                      }
                    }

                    const isPreviousHeatObservers = heatCompleted;

                    return (
                      <div className={`mt-auto border-t flex-shrink-0 ${
                        darkMode ? 'border-slate-600' : 'border-slate-200'
                      }`}>
                        <div className={`p-2 ${
                          darkMode ? 'bg-slate-700' : 'bg-slate-50'
                        }`}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-1.5">
                              <Eye size={12} className={isPreviousHeatObservers ? 'text-slate-400' : 'text-purple-400'} />
                              <h5 className={`text-[11px] font-semibold ${
                                isPreviousHeatObservers
                                  ? (darkMode ? 'text-slate-300' : 'text-slate-700')
                                  : (darkMode ? 'text-purple-300' : 'text-purple-700')
                              }`}>
                                Observers ({heatObservers.length})
                              </h5>
                            </div>
                            {!isPreviousHeatObservers && (
                              <button
                                onClick={() => {
                                  setSelectedHeatForObserver(heatNumber);
                                  setShowObserverSelector(true);
                                }}
                                className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-all ${
                                  darkMode
                                    ? 'bg-purple-700 text-purple-200 hover:bg-purple-600'
                                    : 'bg-purple-600 text-white hover:bg-purple-700'
                                }`}
                                title="Manage observers"
                              >
                                <Edit3 size={10} />
                                <span>Manage</span>
                              </button>
                            )}
                          </div>
                          <div className="flex flex-col gap-1">
                            {heatObservers.map((observer, idx) => {
                              const observerSkipper = observer.skipper_index !== undefined && observer.skipper_index !== null
                                ? skippers[observer.skipper_index]
                                : null;
                              const displayName = observerSkipper?.name || observer.skipper_name || 'Observer';
                              const displaySail = observerSkipper?.sailNo || observer.skipper_sail_number || '';

                              if (isPreviousHeatObservers) {
                                return (
                                  <div
                                    key={observer.id || `obs-${idx}`}
                                    className={`flex items-center gap-1 p-1 rounded border ${
                                      darkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-slate-200'
                                    }`}
                                  >
                                    <Eye size={10} className={`${darkMode ? 'text-slate-500' : 'text-slate-400'} flex-shrink-0`} />
                                    <span className={`font-medium truncate flex-1 text-[11px] ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                                      {displayName}
                                    </span>
                                    {displaySail && (
                                      <span className={`text-[10px] ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                        #{displaySail}
                                      </span>
                                    )}
                                  </div>
                                );
                              }

                              return (
                                <button
                                  key={observer.id || `obs-${idx}`}
                                  onClick={async () => {
                                    if (!observerEventId || observer.skipper_index === undefined || observer.skipper_index === null) return;
                                    const success = await toggleObserver(
                                      observerEventId,
                                      heatNumber,
                                      round,
                                      observer.skipper_index,
                                      displayName,
                                      displaySail,
                                      observer.times_served
                                    );
                                    if (success) {
                                      const updatedObservers = await getObserverAssignments(
                                        observerEventId,
                                        heatNumber,
                                        round
                                      );
                                      setObserversByHeat(prev => {
                                        const newMap = new Map(prev);
                                        newMap.set(heatNumber, updatedObservers || []);
                                        return newMap;
                                      });
                                    }
                                  }}
                                  title="Click to remove this observer"
                                  className={`flex items-center gap-1 p-1 text-[11px] rounded transition-all hover:scale-[1.01] cursor-pointer ${
                                    darkMode
                                      ? 'bg-purple-900/30 text-purple-200 border border-purple-700/50 hover:bg-purple-900/50'
                                      : 'bg-purple-50 text-purple-900 border border-purple-200 hover:bg-purple-100'
                                  }`}
                                >
                                  <Eye size={10} className="text-purple-400 flex-shrink-0" />
                                  <span className="font-medium truncate flex-1 text-left">
                                    {displayName}
                                  </span>
                                  {displaySail && (
                                    <span className={`text-[10px] ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                      #{displaySail}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className={`flex ${isInitialAllocation || initialEditMode || editMode || (round >= 3 && !completed && results && results.length > 0 && !anyScoringInProgress) ? 'justify-between' : 'justify-end'} gap-2 px-5 py-3 border-t flex-shrink-0 ${
          darkMode ? 'border-slate-700' : 'border-slate-200'
        }`}>
          {/* Initial edit mode controls */}
          {initialEditMode && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setInitialEditMode(false);
                  setSelectedSkipperToMove(null);
                  setLocalAssignments(null);
                }}
                className={`px-4 py-1.5 rounded-lg transition-colors font-medium text-sm ${
                  darkMode
                    ? 'text-slate-300 hover:bg-slate-700'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Cancel
              </button>
              {!heatsAreBalanced && (
                <span className="flex items-center gap-1.5 text-xs font-medium text-amber-500">
                  <AlertCircle size={14} />
                  Heats unbalanced - move skippers to balance before saving
                </span>
              )}
              <button
                onClick={() => {
                  if (localAssignments && onUpdateAssignments) {
                    const problems = validateHeatAssignments(localAssignments, skippers.length);
                    if (problems.length > 0) {
                      alert('Heat assignment issues:\n' + problems.join('\n'));
                      return;
                    }
                    onUpdateAssignments(localAssignments, round);
                  }
                  setInitialEditMode(false);
                  setSelectedSkipperToMove(null);
                }}
                disabled={!heatsAreBalanced}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-lg transition-colors font-medium text-sm text-white ${
                  !heatsAreBalanced
                    ? 'bg-slate-500 cursor-not-allowed opacity-50'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                <Check size={18} />
                Apply Changes
              </button>
            </div>
          )}
          {/* Show reshuffle/manual assign/edit buttons only for initial Round 1 allocation */}
          {isInitialAllocation && !initialEditMode && (onReshuffle || onManualAssign) && (
            <div className="flex gap-3">
              {onReshuffle && (
                <button
                  onClick={() => {
                    onReshuffle();
                    onClose();
                  }}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-lg transition-colors font-medium text-sm ${
                    darkMode
                      ? 'bg-amber-600 text-white hover:bg-amber-700'
                      : 'bg-amber-500 text-white hover:bg-amber-600'
                  }`}
                >
                  <Shuffle size={18} />
                  Reshuffle Heats
                </button>
              )}
              {onManualAssign && (
                <button
                  onClick={() => {
                    onManualAssign();
                    onClose();
                  }}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-lg transition-colors font-medium text-sm ${
                    darkMode
                      ? 'bg-teal-600 text-white hover:bg-teal-700'
                      : 'bg-teal-500 text-white hover:bg-teal-600'
                  }`}
                >
                  <Edit3 size={18} />
                  Manual Assign
                </button>
              )}
              {rankedSkipperIndices.size > 0 && onUpdateAssignments && (
                <button
                  onClick={() => {
                    setInitialEditMode(true);
                    setLocalAssignments([...heatAssignments].map(a => ({
                      ...a,
                      skipperIndices: [...a.skipperIndices]
                    })));
                  }}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-lg transition-colors font-medium text-sm ${
                    darkMode
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-blue-500 text-white hover:bg-blue-600'
                  }`}
                >
                  <Edit3 size={18} />
                  Edit Assignments
                </button>
              )}
              {isSHRS && onImportAllRoundAssignments && (
                <>
                  <input
                    ref={importFileRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={handleImportHeatAssignmentsCsv}
                  />
                  <button
                    onClick={() => importFileRef.current?.click()}
                    className={`flex items-center gap-2 px-4 py-1.5 rounded-lg transition-colors font-medium text-sm ${
                      darkMode
                        ? 'bg-green-600 text-white hover:bg-green-700'
                        : 'bg-green-500 text-white hover:bg-green-600'
                    }`}
                  >
                    <Upload size={18} />
                    Import from CSV
                  </button>
                </>
              )}
            </div>
          )}
          {(importSuccess || importError) && isInitialAllocation && (
            <div className="flex flex-col gap-1 px-5 pb-2">
              {importSuccess && (
                <p className="text-sm text-green-500">{importSuccess}</p>
              )}
              {importError && (
                <p className="text-sm text-amber-500">{importError}</p>
              )}
            </div>
          )}

          {/* Edit button for any unplayed future round in SHRS preset mode */}
          {!isInitialAllocation && isUnplayedRound && shrsIsPresetMode && !initialEditMode && onUpdateAssignments && (
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setInitialEditMode(true);
                  setLocalAssignments([...heatAssignments].map(a => ({
                    ...a,
                    skipperIndices: [...a.skipperIndices]
                  })));
                }}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-lg transition-colors font-medium text-sm ${
                  darkMode
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-blue-500 text-white hover:bg-blue-600'
                }`}
              >
                <Edit3 size={18} />
                Edit Round {round} Assignments
              </button>
            </div>
          )}

          {/* Edit mode controls for mid-round only (when at least one heat complete but round not finished) */}
          {/* Allow manual override of promotions/relegations */}
          {!isInitialAllocation && !completed && !isSHRS && round >= 3 && results && results.length > 0 && !anyScoringInProgress && (
            <div className="flex gap-3">
              {!editMode ? (
                <button
                  onClick={() => {
                    setEditMode(true);
                    // When re-entering edit mode, start with the applied changes
                    if (hasAppliedChanges) {
                      setModifiedPromotions(new Set(appliedPromotions));
                      setModifiedRelegations(new Set(appliedRelegations));
                    }
                  }}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-lg transition-colors font-medium text-sm ${
                    darkMode
                      ? 'bg-amber-600 text-white hover:bg-amber-700'
                      : 'bg-amber-500 text-white hover:bg-amber-600'
                  }`}
                >
                  <Edit3 size={18} />
                  {hasAppliedChanges ? 'Edit Again' : completed ? 'Edit Assignments' : 'Edit Promotions'}
                </button>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setEditMode(false);
                      // Restore to applied state if there were applied changes
                      if (hasAppliedChanges) {
                        setModifiedPromotions(new Set());
                        setModifiedRelegations(new Set());
                      } else {
                        setModifiedPromotions(new Set());
                        setModifiedRelegations(new Set());
                      }
                    }}
                    className={`px-4 py-1.5 rounded-lg transition-colors font-medium text-sm ${
                      darkMode
                        ? 'text-slate-300 hover:bg-slate-700'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      // Prevent multiple rapid clicks
                      if (isApplyingChanges) return;
                      setIsApplyingChanges(true);

                      try {
                        // Apply modifications to current round's heat assignments (mid-round edits)
                        // OR next round's assignments (between-round edits)
                        if (onUpdateAssignments && roundToDisplay) {
                          const updatedAssignments = applyManualOverrides(
                            roundToDisplay,
                            modifiedPromotions,
                            modifiedRelegations,
                            promotionCount,
                            heatAssignments,
                            configuration.numberOfHeats
                          );

                          const problems = validateHeatAssignments(updatedAssignments, skippers.length);
                          if (problems.length > 0) {
                            alert('Heat assignment issues:\n' + problems.join('\n'));
                            setIsApplyingChanges(false);
                            return;
                          }

                          const targetRoundNumber = nextRound ? nextRound.round : roundToDisplay.round;

                          onUpdateAssignments(updatedAssignments, targetRoundNumber);

                          if (currentEvent?.id) {
                            try {
                              const updatedHM = {
                                ...heatManagement,
                                rounds: heatManagement.rounds.map(r =>
                                  r.round === targetRoundNumber
                                    ? { ...r, heatAssignments: updatedAssignments }
                                    : r
                                )
                              };
                              if (currentEvent.isSeriesEvent && currentEvent.seriesId) {
                                let roundId = currentEvent.seriesRoundId;
                                if (!roundId && currentEvent.roundName) {
                                  const { data: rr } = await supabase
                                    .from('race_series_rounds')
                                    .select('id')
                                    .eq('series_id', currentEvent.seriesId)
                                    .eq('round_name', currentEvent.roundName)
                                    .maybeSingle();
                                  roundId = rr?.id;
                                }
                                if (roundId) {
                                  const { error } = await supabase
                                    .from('race_series_rounds')
                                    .update({ heat_management: updatedHM })
                                    .eq('id', roundId);
                                  if (error) console.error('Error saving assignment changes:', error);
                                  else console.log('Assignment changes saved to database');
                                }
                              } else {
                                const { error } = await supabase
                                  .from('quick_races')
                                  .update({ heat_management: updatedHM })
                                  .eq('id', currentEvent.id);
                                if (error) console.error('Error saving assignment changes:', error);
                                else console.log('Assignment changes saved to database');
                              }
                            } catch (error) {
                              console.error('❌ Error updating assignments:', error);
                            }
                          }
                        }

                        setAppliedPromotions(new Set(modifiedPromotions));
                        setAppliedRelegations(new Set(modifiedRelegations));
                        setHasAppliedChanges(true);
                        setModifiedPromotions(new Set());
                        setModifiedRelegations(new Set());
                      } catch (error) {
                        console.error('Error applying changes:', error);
                      } finally {
                        setEditMode(false);
                        setIsApplyingChanges(false);
                      }
                    }}
                    disabled={isApplyingChanges}
                    className={`flex items-center gap-2 px-4 py-1.5 rounded-lg transition-colors font-medium text-sm ${
                      isApplyingChanges
                        ? 'bg-green-400 cursor-not-allowed'
                        : 'bg-green-600 hover:bg-green-700'
                    } text-white`}
                  >
                    <Check size={18} />
                    {isApplyingChanges ? 'Applying...' : 'Apply Changes'}
                  </button>
                </>
              )}
            </div>
          )}

          {/* Finalise Qualifying button - shown when in qualifying phase and at least one round has been completed */}
          {!initialEditMode && isSHRS && !isFinalsPhase && !isTransitionRound && onFinaliseQualifying && round >= 1 && rounds.some(r => r.completed) && (
            showFinaliseConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-amber-400">End qualifying after Rd {Math.max(...rounds.filter(r => r.completed).map(r => r.round))}?</span>
                <button
                  onClick={() => {
                    onFinaliseQualifying();
                    setShowFinaliseConfirm(false);
                    onClose();
                  }}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-600 text-white hover:bg-amber-700 transition-colors"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setShowFinaliseConfirm(false)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-600 text-slate-300 hover:bg-slate-500 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowFinaliseConfirm(true)}
                className="px-4 py-1.5 rounded-lg transition-all font-medium text-sm bg-gradient-to-r from-amber-600 to-yellow-600 text-white hover:from-amber-700 hover:to-yellow-700 shadow-lg"
              >
                Finalise Qualifying
              </button>
            )
          )}

          {/* Qualifying Complete Prompt - shown when last qualifying round is completed */}
          {!initialEditMode && isSHRS && completed && !isFinalsPhase && round === (configuration.shrsQualifyingRounds || 0) && showQualifyingCompletePrompt && (
            <div className={`flex flex-col gap-3 p-4 rounded-lg border ${
              darkMode ? 'bg-slate-800 border-slate-600' : 'bg-slate-50 border-slate-200'
            }`}>
              {!showExtendSettings ? (
                <>
                  <p className={`text-sm font-medium ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                    All {configuration.shrsQualifyingRounds} qualifying rounds complete
                  </p>
                  <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    Would you like to proceed to finals or extend qualifying with additional rounds?
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setShowQualifyingCompletePrompt(false);
                        if (onFinaliseQualifying) {
                          onFinaliseQualifying();
                          onClose();
                        }
                      }}
                      className="flex-1 px-3 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-amber-600 to-yellow-600 text-white hover:from-amber-700 hover:to-yellow-700 transition-colors"
                    >
                      Proceed to Finals
                    </button>
                    <button
                      onClick={() => {
                        setExtendRoundCount((configuration.shrsQualifyingRounds || 0) + 2);
                        setShowExtendSettings(true);
                      }}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        darkMode
                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                          : 'bg-blue-500 text-white hover:bg-blue-600'
                      }`}
                    >
                      Extend Qualifying
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className={`text-sm font-medium ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                    Extend Qualifying Rounds
                  </p>
                  <div className={`flex items-center gap-3 p-3 rounded-lg ${
                    darkMode ? 'bg-slate-700/50' : 'bg-white border border-slate-200'
                  }`}>
                    <span className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                      Qualifying Rounds:
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setExtendRoundCount(prev => Math.max((configuration.shrsQualifyingRounds || 0) + 1, prev - 1))}
                        disabled={extendRoundCount <= (configuration.shrsQualifyingRounds || 0) + 1}
                        className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                          extendRoundCount <= (configuration.shrsQualifyingRounds || 0) + 1
                            ? 'opacity-30 cursor-not-allowed'
                            : darkMode ? 'bg-slate-600 hover:bg-slate-500 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                        }`}
                      >
                        <Minus size={16} />
                      </button>
                      <span className={`text-lg font-bold min-w-[2rem] text-center ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                        {extendRoundCount}
                      </span>
                      <button
                        onClick={() => setExtendRoundCount(prev => Math.min((configuration.numberOfRounds || 12) - 2, prev + 1))}
                        disabled={extendRoundCount >= (configuration.numberOfRounds || 12) - 2}
                        className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                          extendRoundCount >= (configuration.numberOfRounds || 12) - 2
                            ? 'opacity-30 cursor-not-allowed'
                            : darkMode ? 'bg-slate-600 hover:bg-slate-500 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                        }`}
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                    <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      (+{extendRoundCount - (configuration.shrsQualifyingRounds || 0)} rounds)
                    </span>
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    Finals rounds: {Math.max(0, (configuration.numberOfRounds || 12) - extendRoundCount)}
                  </div>

                  {/* Diversity Gauge Preview */}
                  <div className={`rounded-lg overflow-hidden ${darkMode ? 'bg-slate-700/30' : 'bg-slate-50'}`}>
                    <DiversityGauge
                      totalSkippers={skippers.length}
                      numberOfHeats={configuration.numberOfHeats || 2}
                      qualifyingRounds={extendRoundCount}
                      darkMode={darkMode}
                    />
                  </div>

                  <div className="flex gap-2 mt-1">
                    <button
                      onClick={() => setShowExtendSettings(false)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        darkMode ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      Back
                    </button>
                    <button
                      onClick={() => {
                        if (onExtendQualifying) {
                          onExtendQualifying(extendRoundCount);
                        }
                        setShowQualifyingCompletePrompt(false);
                        setShowExtendSettings(false);
                      }}
                      className="flex-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-700 hover:to-emerald-700 transition-colors"
                    >
                      Apply & Continue Qualifying
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Edit Results button for completed rounds (historical or just-completed) */}
          {!initialEditMode && (isHistoricalRound || (completed && round === roundJustCompleted)) && !editResultsMode && onUpdateRoundResults && (
            <button
              onClick={() => {
                setEditResultsMode(true);
                setLocalResults(results ? [...results] : []);
              }}
              className={`px-4 py-1.5 rounded-lg transition-all font-medium text-sm ${
                darkMode
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-blue-500 text-white hover:bg-blue-600'
              }`}
            >
              <span className="flex items-center gap-2">
                <Edit3 size={16} />
                Edit Results
              </span>
            </button>
          )}

          {/* Save/Cancel for edit results mode */}
          {editResultsMode && (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setEditResultsMode(false);
                  setLocalResults(null);
                  setDraggedSkipper(null);
                  setDragOverTarget(null);
                }}
                className={`px-4 py-1.5 rounded-lg transition-colors font-medium text-sm ${
                  darkMode ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (localResults && onUpdateRoundResults) {
                    onUpdateRoundResults(round, localResults);
                  }
                  setEditResultsMode(false);
                  setLocalResults(null);
                  setDraggedSkipper(null);
                  setDragOverTarget(null);
                }}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg transition-colors font-medium text-sm bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-700 hover:to-emerald-700"
              >
                <Check size={16} />
                Save Results
              </button>
            </div>
          )}

          {!initialEditMode && !isHistoricalRound && !editResultsMode && <button
            onClick={() => {
              if (!isInitialAllocation) {
                // Check if this is the last qualifying round being completed - show prompt
                if (isSHRS && completed && !isFinalsPhase && round === (configuration.shrsQualifyingRounds || 0) && onFinaliseQualifying) {
                  setShowQualifyingCompletePrompt(true);
                  return;
                }
                if (completed && (nextRound || shouldAllowProgression)) {
                  const targetRound = nextRound ? nextRound.round : round + 1;
                  console.log('Advancing to next round:', targetRound);
                  if (onAdvanceToNextRound) {
                    onAdvanceToNextRound(targetRound);
                    return;
                  } else if (onStartRound) {
                    onStartRound(targetRound);
                  }
                } else if (!completed && roundToDisplay && onStartRound) {
                  console.log('Starting current round:', roundToDisplay.round);
                  onStartRound(roundToDisplay.round);
                }
              }
              onClose();
            }}
            disabled={loadingObservers || showQualifyingCompletePrompt}
            className={`ml-auto px-4 py-1.5 rounded-lg transition-all font-medium text-sm ${
              loadingObservers || showQualifyingCompletePrompt
                ? 'bg-slate-400 text-slate-200 cursor-not-allowed'
                : 'bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-700 hover:to-emerald-700 shadow-lg'
            }`}
          >
            {completed && shouldAllowProgression
                ? isSHRS
                  ? round === (configuration.shrsQualifyingRounds || 0) && !isFinalsPhase
                    ? 'Qualifying Complete'
                    : `Progress to ${isSHRSFinalsRound(round + 1, configuration) ? `Final ${(round + 1) - (configuration.shrsQualifyingRounds || 0)}` : `Qualifying Rd ${round + 1}`}`
                  : `Progress to Race ${round + 1}`
                : completed && nextRound
                ? isSHRS
                  ? `Score ${isSHRSFinalsRound(nextRound.round, configuration) ? `Final ${nextRound.round - (configuration.shrsQualifyingRounds || 0)}` : `Qualifying Rd ${nextRound.round}`}`
                  : `Next Race (Race ${nextRound.round})`
                : completed
                ? 'Close'
                : isInitialAllocation
                ? 'Accept & Start Scoring'
                : 'Start Scoring'
            }
          </button>}
        </div>
      </div>

      {/* Letter Score Editor in Edit Results Mode */}
      {editLetterScoreTarget && localResults && (() => {
        const targetSkipper = skippers[editLetterScoreTarget.skipperIndex];
        const targetResult = localResults.find(
          r => r.skipperIndex === editLetterScoreTarget.skipperIndex && r.heatDesignation === editLetterScoreTarget.heatDesignation
        );
        return (
          <LetterScoreSelector
            isOpen={true}
            onClose={() => setEditLetterScoreTarget(null)}
            onSelect={(letterScore, customPoints) => {
              if (!localResults) return;
              const heatDesignation = editLetterScoreTarget.heatDesignation;
              const targetSkipperIndex = editLetterScoreTarget.skipperIndex;

              let updatedResults = localResults.map(r => {
                if (r.skipperIndex === targetSkipperIndex && r.heatDesignation === heatDesignation) {
                  if (letterScore === null) {
                    return { ...r, letterScore: undefined, customPoints: undefined, position: r.position };
                  }
                  return { ...r, letterScore, customPoints, position: null };
                }
                return r;
              });

              // Recalculate positions for all non-letter-score skippers in this heat
              const heatResults = updatedResults.filter(r => r.heatDesignation === heatDesignation);
              const positionedResults = heatResults
                .filter(r => !r.letterScore)
                .sort((a: any, b: any) => (a.position || 999) - (b.position || 999));

              // Reassign sequential positions
              const positionMap = new Map<number, number>();
              positionedResults.forEach((r, idx) => {
                positionMap.set(r.skipperIndex, idx + 1);
              });

              updatedResults = updatedResults.map(r => {
                if (r.heatDesignation === heatDesignation && !r.letterScore) {
                  const newPos = positionMap.get(r.skipperIndex);
                  if (newPos !== undefined) {
                    return { ...r, position: newPos };
                  }
                }
                return r;
              });

              setLocalResults(updatedResults);
              setEditLetterScoreTarget(null);
            }}
            darkMode={darkMode}
            skipperName={targetSkipper?.name || 'Unknown'}
            raceNumber={round}
            isHeatRacing={true}
          />
        );
      })()}

      {/* Observer Selector Modal - Toggle-based with limit enforcement */}
      {showObserverSelector && currentEvent && (() => {
        const currentRoundData = heatManagement.rounds.find(r => r.round === round);
        if (!currentRoundData) return null;

        const sortedHeats = [...currentRoundData.heatAssignments].sort((a, b) =>
          a.heatDesignation.localeCompare(b.heatDesignation)
        );
        const selectedHeat = sortedHeats[selectedHeatForObserver - 1];
        if (!selectedHeat) return null;

        const currentObservers = observersByHeat.get(selectedHeatForObserver) || [];
        const currentObserverIndices = currentObservers.map(o => o.skipper_index);
        const maxObservers = currentEvent.observers_per_heat ?? 2;
        const isAtLimit = currentObservers.length >= maxObservers;

        const allAvailableSkippers = skippers
          .map((s, idx) => ({ skipper: s, index: idx }))
          .filter(({ index }) => !selectedHeat.skipperIndices.includes(index));

        return (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black bg-opacity-70">
            <div
              className={`w-full max-w-2xl max-h-[80vh] rounded-lg shadow-2xl overflow-hidden flex flex-col ${
                darkMode ? 'bg-slate-800 text-white' : 'bg-white text-slate-900'
              }`}
            >
              <div className={`flex items-center justify-between p-4 border-b ${
                darkMode ? 'border-slate-700' : 'border-slate-200'
              }`}>
                <div>
                  <h3 className="text-lg font-bold">Manage Observers - Heat {getHeatDisplayLabel(selectedHeat.heatDesignation, configuration)}</h3>
                  <p className={`text-sm mt-0.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    {currentObservers.length} of {maxObservers} observer{maxObservers !== 1 ? 's' : ''} assigned
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowObserverSelector(false);
                    setShowCustomObserverInput(false);
                    setCustomObserverName('');
                  }}
                  className={`p-1 rounded-lg transition-colors ${
                    darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100'
                  }`}
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {!showCustomObserverInput ? (
                  <>
                    {isAtLimit && (
                      <div className={`flex items-center gap-2 p-3 rounded-lg mb-4 ${
                        darkMode ? 'bg-amber-900/30 border border-amber-700/50' : 'bg-amber-50 border border-amber-200'
                      }`}>
                        <AlertCircle size={16} className={darkMode ? 'text-amber-400' : 'text-amber-600'} />
                        <p className={`text-sm ${darkMode ? 'text-amber-300' : 'text-amber-700'}`}>
                          Maximum of {maxObservers} observer{maxObservers !== 1 ? 's' : ''} reached. Deselect an observer before adding another.
                        </p>
                      </div>
                    )}

                    <div className="flex items-center justify-between mb-3">
                      <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        Tap to select or deselect observers. Only skippers not racing in Heat {getHeatDisplayLabel(selectedHeat.heatDesignation, configuration)} are shown.
                      </p>
                      <button
                        onClick={() => {
                          if (isAtLimit) {
                            setLimitWarning(`Maximum of ${maxObservers} observer${maxObservers !== 1 ? 's' : ''} reached. Remove one first.`);
                            setTimeout(() => setLimitWarning(null), 3000);
                            return;
                          }
                          setShowCustomObserverInput(true);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 flex-shrink-0 ${
                          darkMode
                            ? 'bg-purple-600 hover:bg-purple-700 text-white'
                            : 'bg-purple-500 hover:bg-purple-600 text-white'
                        }`}
                      >
                        <UserPlus size={14} />
                        Custom
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {allAvailableSkippers.map(({ skipper, index }) => {
                        const isSelected = currentObserverIndices.includes(index);
                        return (
                          <button
                            key={index}
                            onClick={async () => {
                              if (!observerEventId) return;

                              if (!isSelected && isAtLimit) {
                                setLimitWarning(`Maximum of ${maxObservers} observer${maxObservers !== 1 ? 's' : ''} reached. Remove one first.`);
                                setTimeout(() => setLimitWarning(null), 3000);
                                return;
                              }

                              const { data: existingObserver } = await supabase
                                .from('heat_observers')
                                .select('times_served')
                                .eq('event_id', observerEventId)
                                .eq('skipper_index', index)
                                .order('times_served', { ascending: false })
                                .limit(1)
                                .maybeSingle();

                              const timesServed = existingObserver?.times_served || 0;

                              const success = await toggleObserver(
                                observerEventId,
                                selectedHeatForObserver,
                                round,
                                index,
                                skipper.name,
                                skipper.sailNo,
                                timesServed
                              );

                              if (success) {
                                const updatedObservers = await getObserverAssignments(
                                  observerEventId,
                                  selectedHeatForObserver,
                                  round
                                );
                                setObserversByHeat(prev => {
                                  const newMap = new Map(prev);
                                  newMap.set(selectedHeatForObserver, updatedObservers || []);
                                  return newMap;
                                });
                              }
                            }}
                            className={`flex items-center gap-2 p-3 rounded-lg border-2 transition-all hover:scale-[1.02] ${
                              isSelected
                                ? darkMode
                                  ? 'bg-purple-900/40 border-purple-500 ring-1 ring-purple-500/50'
                                  : 'bg-purple-50 border-purple-500 ring-1 ring-purple-200'
                                : isAtLimit
                                  ? darkMode
                                    ? 'bg-slate-700/50 border-slate-700 opacity-50 cursor-not-allowed'
                                    : 'bg-slate-50 border-slate-200 opacity-50 cursor-not-allowed'
                                  : darkMode
                                    ? 'bg-slate-700 border-slate-600 hover:border-purple-500'
                                    : 'bg-white border-slate-200 hover:border-purple-500'
                            }`}
                          >
                            {isSelected && (
                              <div className="w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center flex-shrink-0">
                                <Check size={12} className="text-white" />
                              </div>
                            )}
                            {!isSelected && (
                              <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 ${
                                darkMode ? 'border-slate-500' : 'border-slate-300'
                              }`} />
                            )}
                            {skipper.avatarUrl ? (
                              <img
                                src={skipper.avatarUrl}
                                alt={skipper.name}
                                className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                              />
                            ) : (
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                                isSelected
                                  ? 'bg-purple-600 text-white'
                                  : darkMode ? 'bg-slate-600 text-slate-300' : 'bg-slate-300 text-slate-700'
                              }`}>
                                {skipper.name.split(' ').map(n => n[0]).join('')}
                              </div>
                            )}
                            <div className="flex-1 min-w-0 text-left">
                              <p className={`font-medium truncate text-sm ${
                                isSelected
                                  ? (darkMode ? 'text-purple-200' : 'text-purple-900')
                                  : (darkMode ? 'text-white' : 'text-slate-900')
                              }`}>
                                {skipper.name}
                              </p>
                              <p className={`text-xs truncate ${
                                darkMode ? 'text-slate-400' : 'text-slate-600'
                              }`}>
                                #{skipper.sailNo}
                              </p>
                            </div>
                            {isSelected && (
                              <Eye size={14} className="text-purple-400 flex-shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {allAvailableSkippers.length === 0 && (
                      <p className={`text-center py-8 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        No skippers available as observers.
                      </p>
                    )}
                  </>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-4">
                      <button
                        onClick={() => {
                          setShowCustomObserverInput(false);
                          setCustomObserverName('');
                        }}
                        className={`p-1 rounded-lg transition-colors ${
                          darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100'
                        }`}
                      >
                        <X size={16} />
                      </button>
                      <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        Add a custom observer (volunteer, non-competing individual, etc.)
                      </p>
                    </div>
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${
                        darkMode ? 'text-slate-300' : 'text-slate-700'
                      }`}>
                        Observer Name
                      </label>
                      <input
                        type="text"
                        value={customObserverName}
                        onChange={(e) => setCustomObserverName(e.target.value)}
                        placeholder="Enter observer's name"
                        className={`w-full px-3 py-2 rounded-lg border ${
                          darkMode
                            ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400'
                            : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                        }`}
                        autoFocus
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => {
                          setShowCustomObserverInput(false);
                          setCustomObserverName('');
                        }}
                        className={`px-4 py-2 rounded-lg transition-colors ${
                          darkMode
                            ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                            : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                        }`}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={async () => {
                          if (!observerEventId || !customObserverName.trim()) return;

                          const customObserver: ObserverAssignment = {
                            skipper_index: undefined,
                            skipper_name: customObserverName.trim(),
                            times_served: 0,
                            is_manual_assignment: true,
                            is_custom_observer: true
                          };

                          const currentObs = observersByHeat.get(selectedHeatForObserver) || [];
                          const updatedObservers = [...currentObs, customObserver];

                          const success = await saveObserverAssignments(
                            observerEventId,
                            selectedHeatForObserver,
                            round,
                            updatedObservers
                          );

                          if (success) {
                            setObserversByHeat(prev => {
                              const newMap = new Map(prev);
                              newMap.set(selectedHeatForObserver, updatedObservers);
                              return newMap;
                            });
                            setCustomObserverName('');
                            setShowCustomObserverInput(false);
                          }
                        }}
                        disabled={!customObserverName.trim()}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                          !customObserverName.trim()
                            ? 'bg-slate-400 text-slate-200 cursor-not-allowed'
                            : darkMode
                            ? 'bg-purple-600 hover:bg-purple-700 text-white'
                            : 'bg-purple-500 hover:bg-purple-600 text-white'
                        }`}
                      >
                        Add Observer
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className={`flex items-center justify-end p-4 border-t ${
                darkMode ? 'border-slate-700' : 'border-slate-200'
              }`}>
                <button
                  onClick={() => {
                    setShowObserverSelector(false);
                    setShowCustomObserverInput(false);
                    setCustomObserverName('');
                  }}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    darkMode
                      ? 'bg-purple-600 hover:bg-purple-700 text-white'
                      : 'bg-purple-500 hover:bg-purple-600 text-white'
                  }`}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>,
    document.body
  );
};

// Helper function to apply manual promotion/relegation overrides
function applyManualOverrides(
  round: any,
  modifiedPromotions: Set<number>,
  modifiedRelegations: Set<number>,
  promotionCount: number,
  originalHeatAssignments: HeatAssignment[],
  numberOfHeats: number
): HeatAssignment[] {
  console.log('🔧 applyManualOverrides called with:', {
    roundNumber: round.round,
    roundCompleted: round.completed,
    modifiedPromotions: Array.from(modifiedPromotions),
    resultsCount: round.results?.length || 0
  });

  const heats = (['A', 'B', 'C', 'D', 'E', 'F'] as HeatDesignation[]).slice(0, numberOfHeats);

  // Check if we're doing mid-round edits (some heats complete, others not)
  const completedHeats = new Set<string>();
  const heatResults = new Map<HeatDesignation, any[]>();

  round.results?.forEach((r: any) => {
    if (!heatResults.has(r.heatDesignation)) {
      heatResults.set(r.heatDesignation, []);
    }
    heatResults.get(r.heatDesignation)!.push(r);

    // A heat is complete if all results have positions
    const results = heatResults.get(r.heatDesignation)!;
    if (results.every((res: any) => res.position !== null || res.letterScore)) {
      completedHeats.add(r.heatDesignation);
    }
  });

  const isMidRound = !round.completed && completedHeats.size > 0;

  console.log('   Mid-round edit:', isMidRound);
  console.log('   Completed heats:', Array.from(completedHeats));

  // ALWAYS start with fresh empty assignments - we'll build them from scratch
  // This prevents duplicates when applying changes multiple times
  const updatedAssignments: HeatAssignment[] = heats.map(heat => ({
    heatDesignation: heat,
    skipperIndices: []
  }));

  // Build a map of current results
  const skipperResults = new Map<number, { heat: HeatDesignation; position: number }>();
  (round.results || []).forEach((r: any) => {
    if (r.position !== null) {
      skipperResults.set(r.skipperIndex, {
        heat: r.heatDesignation,
        position: r.position
      });
    }
  });

  // Process each skipper based on their results and modifications
  skipperResults.forEach((result, skipperIndex) => {
    const currentHeatIdx = heats.indexOf(result.heat);
    if (currentHeatIdx === -1) return;

    const isTopHeat = currentHeatIdx === 0;
    const isBottomHeat = currentHeatIdx === heats.length - 1;

    // Determine base promotion/relegation status
    let shouldPromote = false;
    let shouldRelegate = false;

    // Round 1 logic
    if (round.round === 1) {
      if (isTopHeat) {
        shouldRelegate = result.position > promotionCount;
      } else if (isBottomHeat) {
        shouldPromote = result.position <= promotionCount;
      } else {
        shouldPromote = result.position <= promotionCount;
        const skippersInHeat = originalHeatAssignments[currentHeatIdx].skipperIndices.length;
        shouldRelegate = result.position > (skippersInHeat - promotionCount);
      }
    }
    // Round 2+ logic
    else {
      if (isTopHeat) {
        const skippersInHeat = originalHeatAssignments[currentHeatIdx].skipperIndices.length;
        shouldRelegate = result.position > (skippersInHeat - promotionCount);
      } else if (isBottomHeat) {
        shouldPromote = result.position <= promotionCount;
      } else {
        shouldPromote = result.position <= promotionCount;
        const skippersInHeat = originalHeatAssignments[currentHeatIdx].skipperIndices.length;
        shouldRelegate = result.position > (skippersInHeat - promotionCount);
      }
    }

    // Apply manual overrides (toggle the status)
    if (modifiedPromotions.has(skipperIndex)) {
      shouldPromote = !shouldPromote;
    }
    if (modifiedRelegations.has(skipperIndex)) {
      shouldRelegate = !shouldRelegate;
    }

    // Determine target heat
    let targetHeatIdx = currentHeatIdx;

    // For mid-round: only move skippers between heats in the CURRENT round
    // For between-rounds: move to next round's heats
    if (isMidRound) {
      // Mid-round: Promote to higher heat in THIS round
      if (shouldPromote && !isTopHeat) {
        targetHeatIdx = currentHeatIdx - 1;
        console.log(`   🔼 Mid-round: Promoting skipper ${skipperIndex} from Heat ${heats[currentHeatIdx]} to ${heats[targetHeatIdx]}`);
      }
      // Don't handle relegations mid-round (they apply to next round)
    } else {
      // Between rounds: Apply normal promotion/relegation logic for next round
      if (shouldPromote && !isTopHeat) {
        targetHeatIdx = round.round === 1 ? 0 : currentHeatIdx - 1; // R1: all promote to Heat A, R2+: to next higher
      } else if (shouldRelegate && !isBottomHeat) {
        targetHeatIdx = currentHeatIdx + 1;
      }
    }

    // Add to target heat (with duplicate check)
    if (!updatedAssignments[targetHeatIdx].skipperIndices.includes(skipperIndex)) {
      updatedAssignments[targetHeatIdx].skipperIndices.push(skipperIndex);
    } else {
      console.warn(`⚠️ Skipper ${skipperIndex} already in target heat ${heats[targetHeatIdx]}, skipping duplicate`);
    }
  });

  if (isMidRound) {
    heats.forEach((heat, idx) => {
      if (!completedHeats.has(heat)) {
        const originalAssignment = originalHeatAssignments.find(a => a.heatDesignation === heat);
        if (originalAssignment) {
          const promotedSkippers = updatedAssignments[idx].skipperIndices.slice();
          const originalSkippers: number[] = [];
          originalAssignment.skipperIndices.forEach(skipperIdx => {
            if (!skipperResults.has(skipperIdx)) {
              if (!promotedSkippers.includes(skipperIdx)) {
                originalSkippers.push(skipperIdx);
              }
            }
          });
          updatedAssignments[idx].skipperIndices = [...originalSkippers, ...promotedSkippers];
        }
      }
    });
  }

  console.log('✅ Manual overrides applied:', {
    isMidRound,
    promotions: Array.from(modifiedPromotions),
    relegations: Array.from(modifiedRelegations),
    updatedAssignments: updatedAssignments.map(ha => ({
      heat: ha.heatDesignation,
      count: ha.skipperIndices.length,
      skippers: ha.skipperIndices
    }))
  });

  return updatedAssignments;
}
