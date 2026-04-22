import React, { useState, useMemo, useCallback } from 'react';
import { HeatManagement, HeatDesignation, generateInitialHeatAssignments, getHeatDisplayLabel } from '../types/heat';
import { Skipper } from '../types';
import { ScratchRaceTable } from './ScratchRaceTable';
import { TouchModeScoring } from './TouchModeScoring';
import { RaceEvent } from '../types/race';
import { HeatOverallResultsModal } from './HeatOverallResultsModal';
import { HeatRaceResultsModal } from './HeatRaceResultsModal';
import { HeatAssignmentModal } from './HeatAssignmentModal';
import { ManualHeatAssignmentModal } from './ManualHeatAssignmentModal';
import { clearHeatRaceResults } from '../utils/heatUtils';
import { LiveStatusControl } from './LiveStatusControl';
import { Hand, Eye, FileDown, ClipboardCheck, UserCheck, UserX, Table2, Grid3x2 as Grid3X3, Check, Timer, Trophy } from 'lucide-react';
import { StartBoxModal } from './start-box/StartBoxModal';
import { RaceElapsedTimer } from './start-box/RaceElapsedTimer';
import { SpreadsheetScoring } from './SpreadsheetScoring';
import { HmsManualSpreadsheet } from './HmsManualSpreadsheet';
import { exportAllRoundsPdf } from '../utils/heatAssignmentPdfExport';
import { getObserverAssignments, getAllObserversForEvent, ObserverAssignment, getObserverEventId, resolveObserverEventId } from '../utils/observerUtils';
import { supabase } from '../utils/supabase';
import { getCountryFlag, getIOCCode } from '../utils/countryFlags';
import { SHRSOverallResultsView } from './SHRSOverallResultsView';
import { HmsScoreSheet } from './HmsScoreSheet';

interface HeatScoringTableProps {
  skippers: Skipper[];
  heatManagement: HeatManagement;
  darkMode: boolean;
  onManageSkippers: () => void;
  onUpdateSkipper?: (skipperIndex: number, updatedSkipper: Skipper) => void;
  onRemoveSkipper?: (skipperIndex: number) => void;
  onUpdateHeatResult: (result: any) => void;
  onBatchUpdateHeatResults?: (results: any[]) => void;
  onCompleteHeat: (heat: HeatDesignation) => void;
  onReturnToRaceManagement: () => void;
  onCompleteScoring: () => void;
  onShowCharts: () => void;
  onConfigureHeats: () => void;
  onRaceSettingsChange: (settings: { numRaces: number; dropRules: number[] }) => void;
  updateRaceResults: (race: number, skipperIndex: number, position: number | null, letterScore?: any, customPoints?: number, hmsHeat?: string, hmsPosition?: number) => void;
  raceResults: any[];
  enableRaceEditing: (raceNum: number | null) => void;
  lastCompletedRace: number;
  editingRace: number | null;
  deleteRaceResult: (race: number, skipperIndex: number) => void;
  clearRace: (race: number) => void;
  clearRaceForSkippers: (race: number, skipperIndices: number[]) => void;
  replaceRaceResultsForSkippers: (race: number, skipperIndices: number[], newEntries: Array<{ skipperIndex: number; position: number | null; letterScore?: any; customPoints?: number }>) => void;
  currentEvent: RaceEvent | null;
  currentDay: number;
  onToggleDarkMode: () => void;
  onGoBackToPreviousRound?: () => void;
  onGoToRound?: (roundNumber: number) => void;
  onAdvanceToNextRound?: (currentHeat: HeatDesignation) => void;
  onClearHeatRaceResults?: (heatDesignation: HeatDesignation, round: number, race: number, skipperIndices: number[]) => void;
  onUpdateHeatAssignments?: (assignments: any, targetRound?: number) => void;
  onSelectHeat?: (heat: HeatDesignation) => void;
  onForceRoundComplete?: (roundNumber: number) => void;
  isFullscreen?: boolean;
  scoringMode?: 'pro' | 'touch' | 'spreadsheet';
}

export const HeatScoringTable: React.FC<HeatScoringTableProps> = ({
  skippers,
  heatManagement,
  darkMode,
  onManageSkippers,
  onUpdateSkipper,
  onRemoveSkipper,
  onUpdateHeatResult,
  onBatchUpdateHeatResults,
  onCompleteHeat,
  onReturnToRaceManagement,
  onCompleteScoring,
  onShowCharts,
  onConfigureHeats,
  onRaceSettingsChange,
  updateRaceResults,
  raceResults,
  enableRaceEditing,
  lastCompletedRace,
  editingRace,
  deleteRaceResult,
  clearRace,
  clearRaceForSkippers,
  replaceRaceResultsForSkippers,
  currentEvent,
  currentDay,
  onToggleDarkMode,
  onGoBackToPreviousRound,
  onGoToRound,
  onAdvanceToNextRound,
  onClearHeatRaceResults,
  onUpdateHeatAssignments,
  onSelectHeat,
  onForceRoundComplete,
  isFullscreen,
  scoringMode: initialScoringMode = 'touch'
}) => {
  if (!heatManagement?.configuration || !heatManagement?.rounds) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Loading heat configuration...</p>
      </div>
    );
  }

  const syncObserverEventId = useMemo(() => getObserverEventId(currentEvent), [currentEvent?.id, currentEvent?.isSeriesEvent, currentEvent?.seriesRoundId]);
  const [resolvedObserverEventId, setResolvedObserverEventId] = React.useState<string | null>(syncObserverEventId);

  React.useEffect(() => {
    if (syncObserverEventId) {
      setResolvedObserverEventId(syncObserverEventId);
      return;
    }
    let cancelled = false;
    resolveObserverEventId(currentEvent).then(id => {
      if (!cancelled && id) setResolvedObserverEventId(id);
    });
    return () => { cancelled = true; };
  }, [syncObserverEventId, currentEvent?.id, currentEvent?.seriesId, currentEvent?.roundName]);

  const observerEventId = resolvedObserverEventId;
  const safeCurrentRound = Math.max(1, heatManagement.currentRound || 1);
  const currentRound = heatManagement.rounds[safeCurrentRound - 1];
  const isShrs = heatManagement.configuration?.scoringSystem === 'shrs';
  const shrsQualifyingRounds = heatManagement.configuration?.shrsQualifyingRounds || 0;

  const getShrsRoundLabel = (roundNum: number, heat?: HeatDesignation | null): string => {
    if (isShrs && shrsQualifyingRounds > 0) {
      if (roundNum <= shrsQualifyingRounds) {
        return `Qualifying Rd ${roundNum}`;
      }
      const finalNum = roundNum - shrsQualifyingRounds;
      const fleetName = heat ? SHRS_FLEET_FULL_NAMES[heat] : null;
      return fleetName ? `Final ${finalNum} - ${fleetName}` : `Final ${finalNum}`;
    }
    return `Race ${roundNum}`;
  };

  const isInQualifyingRound = isShrs && shrsQualifyingRounds > 0 && heatManagement.currentRound <= shrsQualifyingRounds;

  const availableHeats = useMemo(() => {
    if (!currentRound) return [];
    const heats = currentRound.heatAssignments
      .map(assignment => assignment.heatDesignation)
      .sort();
    if (isInQualifyingRound) {
      if (heatManagement.configuration?.heatOrder === 'descending') {
        return [...heats].reverse();
      }
      return heats;
    }
    return heats.reverse();
  }, [currentRound, isInQualifyingRound, heatManagement.configuration?.heatOrder]);

  // Start with the LOWEST heat (last in the list) by default
  // Initialize to null and let useEffect set the correct heat
  const [selectedHeat, setSelectedHeat] = useState<HeatDesignation | null>(null);
  const [showOverallResults, setShowOverallResults] = useState(false);
  const [showHmsScoreSheet, setShowHmsScoreSheet] = useState(false);
  const isSHRSImport = isShrs && currentEvent?.is_simulated;
  const [showOverallResultsView, setShowOverallResultsView] = useState(false);

  // Show overall results view by default for SHRS simulated imports
  React.useEffect(() => {
    if (isSHRSImport) {
      setShowOverallResultsView(true);
    }
  }, [isSHRSImport]);
  const [showRaceResults, setShowRaceResults] = useState(false);
  const [showHeatAssignments, setShowHeatAssignments] = useState(false);
  const [observerReloadTrigger, setObserverReloadTrigger] = useState(0);
  const [showManualAssignModal, setShowManualAssignModal] = useState(false);
  const [shouldAutoShuffle, setShouldAutoShuffle] = useState(false);
  const [editingSkipperIndex, setEditingSkipperIndex] = useState<number | null>(null);
  const [manualSelection, setManualSelection] = useState(false); // Track manual heat selection
  const [heatScoringMode, setHeatScoringMode] = useState<'pro' | 'touch' | 'spreadsheet'>(initialScoringMode);
  React.useEffect(() => {
    setHeatScoringMode(initialScoringMode);
  }, [initialScoringMode]);
  const touchMode = heatScoringMode === 'touch';
  const [touchModeResultsConfirmed, setTouchModeResultsConfirmed] = useState(false);
  const [spreadsheetVerifiedHeats, setSpreadsheetVerifiedHeats] = useState<Set<string>>(new Set());
  const [currentHeatObservers, setCurrentHeatObservers] = useState<ObserverAssignment[]>([]);
  const [allHeatObserversMap, setAllHeatObserversMap] = useState<Record<string, ObserverAssignment[]>>({});
  const manualSelectionTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const [rollCallActive, setRollCallActive] = useState(false);
  const [rollCallReady, setRollCallReady] = useState<Set<number>>(new Set());
  const [rollCallAbsent, setRollCallAbsent] = useState<Set<number>>(new Set());
  const [showStartBoxModal, setShowStartBoxModal] = useState(false);
  const [raceTimerRunning, setRaceTimerRunning] = useState(false);

  // Track the round number to detect actual round changes (not just object reference changes)
  const lastRoundNumber = React.useRef<number | null>(null);

  // Reset touch mode confirmation and roll call when heat or round changes
  React.useEffect(() => {
    setTouchModeResultsConfirmed(false);
    setRollCallReady(new Set());
    setRollCallAbsent(new Set());
  }, [selectedHeat, heatManagement.currentRound]);

  React.useEffect(() => {
    if (currentEvent?.enable_roll_call === false && rollCallActive) {
      setRollCallActive(false);
    }
  }, [currentEvent?.enable_roll_call]);

  // Reset spreadsheet verified heats when round changes
  const lastSpreadsheetRound = React.useRef<number>(heatManagement.currentRound);
  React.useEffect(() => {
    if (lastSpreadsheetRound.current !== heatManagement.currentRound) {
      setSpreadsheetVerifiedHeats(new Set());
      lastSpreadsheetRound.current = heatManagement.currentRound;
    }
  }, [heatManagement.currentRound]);

  // Track which heat was last auto-advanced to prevent loops
  const lastAutoAdvancedHeat = React.useRef<HeatDesignation | null>(null);

  // Spreadsheet mode: pending advance after onCompleteHeat state update
  const pendingSpreadsheetAdvance = React.useRef<{ nextHeat: HeatDesignation; fromHeat: HeatDesignation } | null>(null);

  // Track which round was last auto-advanced to prevent loops
  const lastAutoAdvancedRound = React.useRef<number | null>(null);

  // Track if we've shown the initial modal (reset on each render cycle)
  const [hasShownInitialModal, setHasShownInitialModal] = React.useState<boolean>(false);

  // Track last promotion to avoid showing modal multiple times
  const lastPromotionShown = React.useRef<string | null>(null);

  // Show heat assignment modal when mid-round promotions/relegations occur
  React.useEffect(() => {
    if (heatManagement.lastPromotionInfo) {
      const promotionKey = `${heatManagement.lastPromotionInfo.round}-${heatManagement.lastPromotionInfo.fromHeat}-${heatManagement.lastPromotionInfo.toHeat}-${Date.now()}`;

      if (lastPromotionShown.current !== promotionKey) {
        const promotedCount = heatManagement.lastPromotionInfo.promotedSkippers?.length || 0;
        const relegatedCount = heatManagement.lastPromotionInfo.relegatedSkippers?.length || 0;

        if (promotedCount > 0 && relegatedCount > 0) {
          console.log(`🎯 Mid-round changes: ${promotedCount} promoted + ${relegatedCount} relegated`);
        } else if (promotedCount > 0) {
          console.log(`🔼 Mid-round promotions: ${promotedCount} skippers promoted from Heat ${heatManagement.lastPromotionInfo.fromHeat} → Heat ${heatManagement.lastPromotionInfo.toHeat}`);
        } else if (relegatedCount > 0) {
          console.log(`🔽 Mid-round relegations: ${relegatedCount} skippers relegated from Heat ${heatManagement.lastPromotionInfo.relegationFromHeat} → Heat ${heatManagement.lastPromotionInfo.relegationToHeat}`);
        }

        setShowHeatAssignments(true);
        lastPromotionShown.current = promotionKey;
      }
    }
  }, [heatManagement.lastPromotionInfo]);

  // When round NUMBER changes (not just object reference), reset to first incomplete heat
  // Also re-check when results change (e.g., when returning from modal after heats completed)
  React.useEffect(() => {
    const currentRoundNumber = heatManagement.currentRound;
    const isRoundChange = lastRoundNumber.current !== null && lastRoundNumber.current !== currentRoundNumber;
    const isInitialLoad = lastRoundNumber.current === null;

    // Always check heat completion when:
    // 1. Initial load
    // 2. Round number changes
    // 3. Results change (to handle coming back from assignments modal)
    if (availableHeats.length > 0) {
      // Find the first incomplete heat (starting from lowest)
      let heatToSelect = availableHeats[0]; // Default to lowest heat

      if (isInitialLoad || isRoundChange) {
        console.log('🔍 Checking heat completion for Round', currentRoundNumber, isInitialLoad ? '(Initial Load)' : '(Round Change)');
      }

      for (const heat of availableHeats) {
        const progress = getHeatProgress(heat);
        const isComplete = progress.scored >= progress.total && progress.total > 0;

        if (isInitialLoad || isRoundChange) {
          console.log(`Heat ${heat}: ${progress.scored}/${progress.total} - ${isComplete ? 'COMPLETE' : 'INCOMPLETE'}`);
        }

        if (!isComplete) {
          heatToSelect = heat;
          if (isInitialLoad || isRoundChange) {
            console.log('✅ Selecting incomplete heat:', heat);
          }
          break;
        } else if (isInitialLoad || isRoundChange) {
          console.log(`⏭️ Skipping complete heat ${heat}`);
        }
      }

      // Only update selected heat if it's different OR if this is initial/round change
      if (selectedHeat !== heatToSelect && (isInitialLoad || isRoundChange || !selectedHeat)) {
        console.log('🎯 Setting heat to:', heatToSelect, 'for Round', currentRoundNumber);
        setSelectedHeat(heatToSelect);
        setManualSelection(false); // Reset manual selection on round change
        lastAutoAdvancedHeat.current = null; // Reset auto-advance tracking for new round
        lastAutoAdvancedRound.current = null; // Reset round auto-advance tracking
      }

      // Auto-show heat assignments modal when round changes (but not on initial load)
      if (isRoundChange && lastRoundNumber.current !== null) {
        setShowHeatAssignments(true);
      }

      if (isInitialLoad || isRoundChange) {
        lastRoundNumber.current = currentRoundNumber;
      }
    }
  }, [heatManagement.currentRound, availableHeats, currentRound?.results?.length, selectedHeat]);

  // Auto-trigger completeHeat when a heat becomes complete (for mid-round promotions/relegations)
  // Only for touch/pro modes - spreadsheet mode calls onCompleteHeat directly in its callback
  const lastCompletedHeats = React.useRef<Set<string>>(new Set());
  const pendingModalShow = React.useRef<boolean>(false);
  React.useEffect(() => {
    if (!currentRound) return;
    if (heatScoringMode === 'spreadsheet') return;

    if (!touchModeResultsConfirmed) {
      return;
    }

    availableHeats.forEach(heat => {
      const heatKey = `${heatManagement.currentRound}-${heat}`;
      const wasCompleted = lastCompletedHeats.current.has(heatKey);
      const isNowComplete = isHeatComplete(heat);

      if (!wasCompleted && isNowComplete) {
        console.log(`Heat ${heat} just became complete! Triggering completeHeat for mid-round promotion/relegation...`);
        lastCompletedHeats.current.add(heatKey);
        onCompleteHeat(heat);

        const roundKey = `${heatManagement.currentRound}-${heat}`;
        setSpreadsheetVerifiedHeats(prev => new Set(prev).add(roundKey));

        if (heatManagement.currentRound >= 2) {
          pendingModalShow.current = true;
        }
      }
    });
  }, [currentRound?.results, heatManagement.currentRound, availableHeats, onCompleteHeat, touchModeResultsConfirmed, heatScoringMode]);

  // Show modal after heat completion in Round 2+ (delayed to allow state to update)
  React.useEffect(() => {
    if (pendingModalShow.current && heatManagement.currentRound >= 2) {
      const timer = setTimeout(() => {
        if (pendingModalShow.current) {
          console.log('📋 Showing heat assignments modal after heat completion (Round 2+)');
          setShowHeatAssignments(true);
          pendingModalShow.current = false;
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [heatManagement, currentRound?.results]);

  // Show modal on initial load when continuing scoring
  // This ensures the user sees heat assignments when clicking "Continue Scoring"
  React.useEffect(() => {
    if (!hasShownInitialModal && currentRound && availableHeats.length > 0) {
      console.log('🎯 Initial load - showing heat assignments modal for Round', currentRound.round);
      setShowHeatAssignments(true);
      setHasShownInitialModal(true);
    }
  }, [currentRound, availableHeats, hasShownInitialModal]);

  // Show modal when a round completes and next round assignments are generated
  const lastCompletedRoundShown = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (heatManagement.roundJustCompleted &&
        lastCompletedRoundShown.current !== heatManagement.roundJustCompleted) {
      console.log(`🏁 Round ${heatManagement.roundJustCompleted} completed! Showing Round ${heatManagement.roundJustCompleted + 1} assignments`);
      setShowHeatAssignments(true);
      lastCompletedRoundShown.current = heatManagement.roundJustCompleted;
    }
  }, [heatManagement.roundJustCompleted]);

  // Spreadsheet mode: process pending advance after heatManagement state updates
  React.useEffect(() => {
    if (pendingSpreadsheetAdvance.current) {
      const { nextHeat, fromHeat } = pendingSpreadsheetAdvance.current;
      pendingSpreadsheetAdvance.current = null;
      console.log(`Spreadsheet: state updated after Heat ${fromHeat} - advancing to Heat ${nextHeat}`);
      setSelectedHeat(nextHeat);
      setManualSelection(false);
      lastAutoAdvancedHeat.current = fromHeat;
      setObserverReloadTrigger(prev => prev + 1);
      setTimeout(() => {
        setShowHeatAssignments(true);
      }, 50);
    }
  }, [heatManagement]);

  // Auto-advance to next heat when current heat is complete (touch/pro modes only)
  // Spreadsheet mode handles its own advancement in onConfirmHeatResults callback
  React.useEffect(() => {
    if (!currentRound || availableHeats.length === 0) return;
    if (heatScoringMode === 'spreadsheet') return;
    if (manualSelection) return;
    if (!selectedHeat) return;

    if (!touchModeResultsConfirmed) return;

    // Check if current heat is complete
    const progress = getHeatProgress(selectedHeat);
    const currentHeatComplete = progress.scored >= progress.total && progress.total > 0;

    if (currentHeatComplete) {
      // Prevent advancing FROM the same heat multiple times
      if (lastAutoAdvancedHeat.current === selectedHeat) {
        return;
      }

      const currentHeatIndex = availableHeats.indexOf(selectedHeat);
      if (currentHeatIndex === -1) return;

      // Move to the next heat (moving UP from lower heats to higher heats)
      // availableHeats is ['D', 'C', 'B', 'A'], so we INCREMENT index
      // E.g., D (0) -> C (1) -> B (2) -> A (3)
      const nextHeatIndex = currentHeatIndex + 1;

      if (nextHeatIndex < availableHeats.length) {
        const nextHeat = availableHeats[nextHeatIndex];
        const nextProgress = getHeatProgress(nextHeat);
        const nextHeatComplete = nextProgress.scored >= nextProgress.total && nextProgress.total > 0;

        // Only auto-advance if next heat is NOT complete
        if (!nextHeatComplete) {
          console.log(`✅ Heat ${selectedHeat} complete! Auto-advancing to Heat ${nextHeat}`);
          lastAutoAdvancedHeat.current = selectedHeat; // Mark this heat as advanced

          setShowHeatAssignments(true);
          setTouchModeResultsConfirmed(false);

          setTimeout(() => {
            setSelectedHeat(nextHeat);
          }, 500); // Small delay for visual feedback
        }
      } else {
        console.log('✅ All heats complete! Waiting for user to click Progress to Next Round.');
      }
    }
  }, [currentRound?.results, manualSelection, selectedHeat, availableHeats, touchModeResultsConfirmed, onAdvanceToNextRound, currentRound, heatScoringMode]);

  // Handle manual heat selection
  const handleHeatSelection = (heat: HeatDesignation) => {
    console.log('👆 Manual heat selection:', heat);

    // Set manual selection FIRST to prevent auto-advance from triggering
    setManualSelection(true);

    // Then change the heat
    setSelectedHeat(heat);

    // Reset the auto-advance tracking since user manually selected
    lastAutoAdvancedHeat.current = null;

    // Clear any existing timeout
    if (manualSelectionTimeoutRef.current) {
      clearTimeout(manualSelectionTimeoutRef.current);
    }

    // Re-enable auto-advance after 10 seconds of inactivity
    manualSelectionTimeoutRef.current = setTimeout(() => {
      console.log('⏰ Re-enabling auto-advance after manual selection');
      setManualSelection(false);
    }, 10000);
  };

  // Cleanup timeout on unmount
  React.useEffect(() => {
    return () => {
      if (manualSelectionTimeoutRef.current) {
        clearTimeout(manualSelectionTimeoutRef.current);
      }
    };
  }, []);

  // Sync selectedHeat to heatManagement.currentHeat for live tracking
  React.useEffect(() => {
    if (selectedHeat && selectedHeat !== heatManagement.currentHeat && onSelectHeat) {
      console.log(`🔄 Syncing currentHeat from ${heatManagement.currentHeat} to ${selectedHeat}`);
      onSelectHeat(selectedHeat);
    }
  }, [selectedHeat, heatManagement.currentHeat, onSelectHeat]);

  // Auto-update race status to "live" when scoring starts
  React.useEffect(() => {
    const autoUpdateRaceStatus = async () => {
      if (!currentEvent?.id || !currentEvent?.enableLiveTracking) return;

      const { getRaceStatus, updateRaceStatus } = await import('../utils/liveTrackingStorage');

      const statusData = await getRaceStatus(currentEvent.id);

      if (!statusData || (statusData.status !== 'live' && statusData.status !== 'event_complete')) {
        await updateRaceStatus(currentEvent.id, 'live', undefined, currentEvent.clubId, currentEvent.currentDay || 1);
      }
    };

    autoUpdateRaceStatus();
  }, [currentEvent?.id]);

  // Scroll to top when all heats are complete and ready to advance
  React.useEffect(() => {
    const allComplete = areAllHeatsComplete();
    const roundNotComplete = !currentRound?.completed;

    if (allComplete && roundNotComplete) {
      // Smooth scroll to top of the page
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [currentRound?.results.length, currentRound?.completed]);

  // Get original skipper indices for selected heat
  const heatSkipperIndices = useMemo(() => {
    if (!currentRound) return [];
    const assignment = currentRound.heatAssignments.find(
      a => a.heatDesignation === selectedHeat
    );
    const indices = assignment?.skipperIndices || [];

    // Log heat assignment for debugging
    if (indices.length > 0) {
      console.log(`📋 Heat ${selectedHeat} indices:`, indices);
      console.log(`📊 Total skippers in event:`, skippers.length);

      // Check for out-of-bounds indices
      const invalidIndices = indices.filter(idx => idx < 0 || idx >= skippers.length);
      if (invalidIndices.length > 0) {
        console.error(`❌ WARNING: Heat ${selectedHeat} has ${invalidIndices.length} out-of-bounds indices:`, invalidIndices);
        console.error(`Valid range is 0-${skippers.length - 1}`);
      }
    }

    return indices;
  }, [currentRound, selectedHeat, skippers.length]);

  // Filter skippers for selected heat (with original indices preserved)
  const heatSkippers = useMemo(() => {
    // Validate skipperIndices and filter out invalid ones
    const validIndices = heatSkipperIndices.filter(idx => {
      if (idx < 0 || idx >= skippers.length) {
        console.error(`❌ Invalid skipperIndex ${idx} in heat ${selectedHeat} - skippers array has ${skippers.length} entries (indices 0-${skippers.length - 1})`);
        return false;
      }
      return true;
    });

    if (validIndices.length !== heatSkipperIndices.length) {
      console.error(`❌ Heat ${selectedHeat} has ${heatSkipperIndices.length - validIndices.length} invalid skipper indices`);
      console.error('Invalid indices removed:', heatSkipperIndices.filter(idx => !validIndices.includes(idx)));
    }

    return validIndices.map(idx => skippers[idx]).filter(Boolean);
  }, [heatSkipperIndices, skippers, selectedHeat]);

  const skippersInOtherHeatsCurrentRound = useMemo(() => {
    if (!currentRound || !selectedHeat) return new Set<number>();
    const skippersWithOtherHeatResults = new Set<number>();
    const skippersWithCurrentHeatResults = new Set<number>();
    currentRound.results.forEach(r => {
      if (r.round === heatManagement.currentRound && (r.position !== null || r.letterScore)) {
        if (r.heatDesignation === selectedHeat) {
          skippersWithCurrentHeatResults.add(r.skipperIndex);
        } else {
          skippersWithOtherHeatResults.add(r.skipperIndex);
        }
      }
    });
    const result = new Set<number>();
    skippersWithOtherHeatResults.forEach(idx => {
      if (!skippersWithCurrentHeatResults.has(idx)) {
        result.add(idx);
      }
    });
    return result;
  }, [currentRound, selectedHeat, heatManagement.currentRound]);

  // Filter race results for current heat's skippers
  const heatRaceResults = useMemo(() => {
    const heatSkipperIndicesSet = new Set(heatSkipperIndices);
    const currentRoundNum = heatManagement.currentRound;
    return raceResults.filter(result => {
      if (!heatSkipperIndicesSet.has(result.skipperIndex)) return false;
      if (result.race === currentRoundNum && skippersInOtherHeatsCurrentRound.has(result.skipperIndex)) {
        return false;
      }
      return true;
    });
  }, [raceResults, heatSkipperIndices, heatManagement.currentRound, skippersInOtherHeatsCurrentRound]);

  // Wrapper functions to map filtered indices to original indices
  const wrappedUpdateRaceResults = (race: number, filteredSkipperIndex: number, position: number | null, letterScore?: any, customPoints?: number) => {
    const originalSkipperIndex = heatSkipperIndices[filteredSkipperIndex];

    // Validate the originalSkipperIndex before using it
    if (originalSkipperIndex === undefined) {
      console.error(`❌ Invalid filteredSkipperIndex ${filteredSkipperIndex} - no corresponding original index`);
      return;
    }

    if (originalSkipperIndex < 0 || originalSkipperIndex >= skippers.length) {
      console.error(`❌ Invalid originalSkipperIndex ${originalSkipperIndex} from filteredIndex ${filteredSkipperIndex}`);
      console.error(`Valid range is 0-${skippers.length - 1}, but got ${originalSkipperIndex}`);
      console.error(`Heat ${selectedHeat} indices:`, heatSkipperIndices);
      return;
    }

    // Save to regular race results
    updateRaceResults(race, originalSkipperIndex, position, letterScore, customPoints);

    // ALSO save to heat results
    const heatResult = {
      skipperIndex: originalSkipperIndex,
      heatDesignation: selectedHeat,
      position: position,
      letterScore: letterScore,
      round: heatManagement.currentRound,
      race: race
    };
    onUpdateHeatResult(heatResult);

    console.log('Saved heat result:', heatResult);

    // When scoring, keep manual selection active to prevent unwanted jumps
    // User is actively working on this heat
    if (manualSelection) {
      if (manualSelectionTimeoutRef.current) {
        clearTimeout(manualSelectionTimeoutRef.current);
      }
      // Extend the timeout - user is still actively working
      manualSelectionTimeoutRef.current = setTimeout(() => {
        console.log('⏰ Re-enabling auto-advance after scoring inactivity');
        setManualSelection(false);
      }, 15000); // 15 seconds of inactivity before auto-advance re-enables
    }
  };

  const wrappedDeleteRaceResult = useCallback((race: number, filteredSkipperIndex: number) => {
    const originalSkipperIndex = heatSkipperIndices[filteredSkipperIndex];
    if (originalSkipperIndex !== undefined) {
      // Clear the regular race result
      deleteRaceResult(race, originalSkipperIndex);

      // Also clear the heat-specific result for this skipper
      if (selectedHeat && onClearHeatRaceResults) {
        onClearHeatRaceResults(
          selectedHeat,
          heatManagement.currentRound,
          race,
          [originalSkipperIndex] // Only this skipper
        );
        console.log('Cleared heat result for skipper', originalSkipperIndex, 'heat', selectedHeat, 'round', heatManagement.currentRound, 'race', race);
      }
    }
  }, [heatSkipperIndices, deleteRaceResult, selectedHeat, onClearHeatRaceResults, heatManagement.currentRound]);

  // Wrapped clearRace that only clears results for the current heat's skippers
  const wrappedClearRace = useCallback((race: number) => {
    console.log('🗑️ Clearing race', race, 'for heat', selectedHeat);
    console.log('🗑️ Skipper indices to clear:', heatSkipperIndices);
    console.log('🗑️ Current race results before clear:', raceResults);

    // Clear heat-specific results from heatManagement FIRST
    if (selectedHeat && onClearHeatRaceResults) {
      onClearHeatRaceResults(
        selectedHeat,
        heatManagement.currentRound,
        race,
        heatSkipperIndices
      );
      console.log('✅ Cleared heat results for heat', selectedHeat, 'round', heatManagement.currentRound, 'race', race);
    }

    // Clear regular race results for ALL skippers in this heat in a SINGLE state update
    // We can't call deleteRaceResult in a loop because React batches state updates
    // and each call would see the same initial state, causing only the last deletion to work
    // Instead, use clearRaceForSkippers which filters all results in one operation
    console.log('🗑️ Calling clearRaceForSkippers for race:', race, 'skippers:', heatSkipperIndices);
    clearRaceForSkippers(race, heatSkipperIndices);

    console.log('✅ Clear race completed');
  }, [heatSkipperIndices, selectedHeat, clearRaceForSkippers, onClearHeatRaceResults, heatManagement.currentRound, raceResults]);

  // Map race results to use filtered indices
  const mappedRaceResults = useMemo(() => {
    return heatRaceResults.map(result => {
      const filteredIndex = heatSkipperIndices.indexOf(result.skipperIndex);
      return {
        ...result,
        skipperIndex: filteredIndex
      };
    });
  }, [heatRaceResults, heatSkipperIndices]);

  const heatSkipperIndicesMap = useMemo(() => {
    if (!currentRound) return {} as Record<HeatDesignation, number[]>;
    const map: Record<string, number[]> = {};
    for (const assignment of currentRound.heatAssignments) {
      map[assignment.heatDesignation] = assignment.skipperIndices.filter(
        idx => idx >= 0 && idx < skippers.length
      );
    }
    return map as Record<HeatDesignation, number[]>;
  }, [currentRound, skippers.length]);

  const allHeatMappedResults = useMemo(() => {
    if (!currentRound) return {} as Record<HeatDesignation, any[]>;
    const currentRoundNum = heatManagement.currentRound;

    const otherHeatSkippersByHeat: Record<string, Set<number>> = {};
    for (const assignment of currentRound.heatAssignments) {
      const heat = assignment.heatDesignation;
      const withOther = new Set<number>();
      const withCurrent = new Set<number>();
      currentRound.results.forEach(r => {
        if (r.round === currentRoundNum && (r.position !== null || r.letterScore)) {
          if (r.heatDesignation === heat) {
            withCurrent.add(r.skipperIndex);
          } else {
            withOther.add(r.skipperIndex);
          }
        }
      });
      const onlyOthers = new Set<number>();
      withOther.forEach(idx => {
        if (!withCurrent.has(idx)) {
          onlyOthers.add(idx);
        }
      });
      otherHeatSkippersByHeat[heat] = onlyOthers;
    }

    const map: Record<string, any[]> = {};
    for (const assignment of currentRound.heatAssignments) {
      const heat = assignment.heatDesignation;
      const indices = assignment.skipperIndices.filter(idx => idx >= 0 && idx < skippers.length);
      const indicesSet = new Set(indices);
      const othersSet = otherHeatSkippersByHeat[heat] || new Set();
      const heatResults = raceResults.filter(r => {
        if (!indicesSet.has(r.skipperIndex)) return false;
        if (r.race === currentRoundNum && othersSet.has(r.skipperIndex)) return false;
        return true;
      });
      map[heat] = heatResults.map(result => ({
        ...result,
        skipperIndex: indices.indexOf(result.skipperIndex)
      }));
    }
    return map as Record<HeatDesignation, any[]>;
  }, [currentRound, raceResults, skippers.length, heatManagement.currentRound]);

  // Calculate heat-specific lastCompletedRace
  // In heat racing mode, we need to track which races are complete for THIS heat only
  const heatLastCompletedRace = useMemo(() => {
    let lastCompleted = 0;
    const numRaces = 12;

    for (let race = 1; race <= numRaces; race++) {
      const allScored = heatSkipperIndices.every(skipperIdx => {
        const result = raceResults.find(r =>
          r.race === race && r.skipperIndex === skipperIdx
        );
        return result && (result.position !== null || result.letterScore);
      });

      if (allScored) {
        lastCompleted = race;
      } else {
        break;
      }
    }

    console.log('🏁 Heat', selectedHeat, 'lastCompletedRace:', lastCompleted);
    return lastCompleted;
  }, [heatSkipperIndices, raceResults, selectedHeat]);

  const SHRS_FLEET_NAMES: Record<string, string> = {
    'A': 'Gold', 'B': 'Silver', 'C': 'Bronze',
    'D': 'Copper', 'E': 'Fleet E', 'F': 'Fleet F',
  };
  const SHRS_FLEET_FULL_NAMES: Record<string, string> = {
    'A': 'Gold Fleet', 'B': 'Silver Fleet', 'C': 'Bronze Fleet',
    'D': 'Copper Fleet', 'E': 'Fleet E', 'F': 'Fleet F',
  };
  const SHRS_FLEET_BUTTON_COLORS: Record<string, string> = {
    'A': 'bg-yellow-600',
    'B': 'bg-slate-400',
    'C': 'bg-amber-700',
    'D': 'bg-orange-600',
    'E': 'bg-teal-600',
    'F': 'bg-green-600',
  };

  const isInFinals = isShrs && shrsQualifyingRounds > 0 && heatManagement.currentRound > shrsQualifyingRounds;

  const getHeatColor = (heat: HeatDesignation): string => {
    if (isInFinals) {
      return SHRS_FLEET_BUTTON_COLORS[heat] || 'bg-slate-600';
    }
    const colors: Record<HeatDesignation, string> = {
      'A': 'bg-yellow-600',
      'B': 'bg-orange-600',
      'C': 'bg-red-600',
      'D': 'bg-purple-600',
      'E': 'bg-blue-600',
      'F': 'bg-green-600'
    };
    return colors[heat] || 'bg-slate-600';
  };

  const getHeatLabel = (heat: HeatDesignation): string => {
    if (isInFinals) {
      return SHRS_FLEET_FULL_NAMES[heat] || `Heat ${getHeatDisplayLabel(heat, heatManagement.configuration)}`;
    }
    return `Heat ${getHeatDisplayLabel(heat, heatManagement.configuration)}`;
  };

  const getHeatProgress = (heat: HeatDesignation) => {
    const assignment = currentRound?.heatAssignments.find(
      a => a.heatDesignation === heat
    );
    if (!assignment) return { scored: 0, total: 0 };

    const total = assignment.skipperIndices.length;

    const heatResults = currentRound?.results.filter(r =>
      r.heatDesignation === heat &&
      r.round === heatManagement.currentRound
    ) || [];

    let scoredCount = heatResults.filter(r =>
      r.position !== null || r.letterScore
    ).length;

    if (scoredCount < total) {
      const currentRace = heatManagement.currentRound;
      const raceResultsCount = assignment.skipperIndices.filter(idx =>
        raceResults.some(r =>
          r.skipperIndex === idx &&
          r.race === currentRace &&
          (r.position !== null || r.letterScore)
        )
      ).length;
      if (raceResultsCount > scoredCount) {
        scoredCount = raceResultsCount;
      }
    }

    return {
      scored: scoredCount,
      total
    };
  };

  const isHeatComplete = (heat: HeatDesignation) => {
    const roundKey = `${heatManagement.currentRound}-${heat}`;
    if (spreadsheetVerifiedHeats.has(roundKey)) return true;
    const progress = getHeatProgress(heat);
    return progress.scored >= progress.total && progress.total > 0;
  };

  // Check if all heats are complete for current race
  const areAllHeatsComplete = () => {
    if (!currentRound) {
      return false;
    }

    // Use the getHeatProgress function which already works correctly
    const allComplete = availableHeats.every(heat => {
      const progress = getHeatProgress(heat);
      return progress.scored >= progress.total && progress.total > 0;
    });

    if (allComplete) {
      console.log('✅ All heats complete for Round', heatManagement.currentRound);
    }

    return allComplete;
  };

  // Check if we're scoring the last heat (all other heats complete)
  const isScoringLastHeat = () => {
    if (!currentRound || !selectedHeat) {
      return false;
    }

    // Check if all heats EXCEPT the selected one are complete
    const otherHeats = availableHeats.filter(heat => heat !== selectedHeat);
    const allOthersComplete = otherHeats.every(heat => {
      const progress = getHeatProgress(heat);
      return progress.scored >= progress.total && progress.total > 0;
    });

    // Check if the selected heat is not yet complete
    const currentHeatProgress = getHeatProgress(selectedHeat);
    const currentHeatNotComplete = currentHeatProgress.scored < currentHeatProgress.total;

    return allOthersComplete && currentHeatNotComplete;
  };

  // Check if round is complete (already advanced to next round)
  const isRoundComplete = currentRound?.completed || false;

  // Find the active round (the highest round number with data or in progress)
  // MUST be before early return to satisfy Rules of Hooks
  const activeRound = useMemo(() => {
    // Find the highest round that has been started (has results or is current)
    let highest = 1;
    for (const round of heatManagement.rounds) {
      if (round.results && round.results.length > 0) {
        highest = Math.max(highest, round.round);
      }
    }
    // The active round is either the highest with data, or current round if higher
    return Math.max(highest, heatManagement.currentRound);
  }, [heatManagement]);

  // Check if we're viewing a previous round (not the active one)
  const isViewingPreviousRound = heatManagement.currentRound < activeRound;

  // Check if current round has any scores
  const currentRoundHasScores = currentRound?.results && currentRound.results.length > 0;

  // Check if we can go back (round > 1 and no scores in current round)
  const canGoBackToPreviousRound = heatManagement.currentRound > 1 && !currentRoundHasScores;

  // Handler for reshuffling heats (Round 1 only)
  const handleReshuffle = () => {
    // Open manual assignment modal with reshuffled assignments
    console.log('Reshuffling heats and opening manual assignment...');
    setShouldAutoShuffle(true);
    setShowManualAssignModal(true);
  };

  // Handler for manual heat assignment
  const handleManualAssign = () => {
    console.log('Opening manual heat assignment...');
    setShouldAutoShuffle(false);
    setShowManualAssignModal(true);
  };

  // Force reload observers when Heat Assignments Modal opens
  // This ensures fresh observer data when continuing scoring after exiting
  React.useEffect(() => {
    if (showHeatAssignments) {
      console.log('📋 Heat Assignments Modal opened - triggering observer refresh');
      setObserverReloadTrigger(prev => prev + 1);
    }
  }, [showHeatAssignments]);

  React.useEffect(() => {
    let cancelled = false;

    const loadObservers = async () => {
      const resolvedId = observerEventId || await resolveObserverEventId(currentEvent);
      if (!resolvedId || !selectedHeat) {
        if (currentHeatObservers.length > 0) {
          setCurrentHeatObservers([]);
        }
        return;
      }

      let enableObs = currentEvent?.enable_observers;
      if (enableObs === undefined) {
        const roundId = currentEvent?.isSeriesEvent
          ? (currentEvent?.seriesRoundId || resolvedId)
          : null;
        const tableName = roundId ? 'race_series_rounds' : 'quick_races';
        const queryId = roundId || resolvedId;
        const { data: eventData, error } = await supabase
          .from(tableName)
          .select('enable_observers, observers_per_heat')
          .eq('id', queryId)
          .maybeSingle();

        if (error || cancelled) {
          if (!cancelled && currentHeatObservers.length > 0) setCurrentHeatObservers([]);
          return;
        }

        if (eventData) {
          (currentEvent as any).enable_observers = eventData.enable_observers ?? false;
          (currentEvent as any).observers_per_heat = eventData.observers_per_heat ?? 2;
        }

        enableObs = eventData?.enable_observers;
      }

      if (!enableObs) {
        if (currentHeatObservers.length > 0) setCurrentHeatObservers([]);
        return;
      }

      try {
        const heatNumber = selectedHeat.charCodeAt(0) - 'A'.charCodeAt(0) + 1;
        const observers = await getObserverAssignments(
          resolvedId,
          heatNumber,
          heatManagement.currentRound
        );
        if (cancelled) return;
        console.log(`✅ Loaded ${observers?.length || 0} observers for Round ${heatManagement.currentRound}, Heat ${selectedHeat}:`, observers);

        setCurrentHeatObservers(observers || []);
      } catch (error) {
        console.error('❌ Error loading observers for current heat:', error);
        if (!cancelled) setCurrentHeatObservers([]);
      }
    };

    loadObservers();
    return () => { cancelled = true; };
  }, [observerEventId, selectedHeat, heatManagement.currentRound, currentEvent?.enable_observers, currentRound, observerReloadTrigger]);

  React.useEffect(() => {
    if (heatScoringMode !== 'spreadsheet' || !availableHeats.length) return;
    let cancelled = false;

    const loadAllObservers = async () => {
      const resolvedId = observerEventId || await resolveObserverEventId(currentEvent);
      if (!resolvedId || cancelled) return;

      let enableObs = currentEvent?.enable_observers;
      if (enableObs === undefined) {
        const roundId = currentEvent?.isSeriesEvent
          ? (currentEvent?.seriesRoundId || resolvedId)
          : null;
        const tableName = roundId ? 'race_series_rounds' : 'quick_races';
        const queryId = roundId || resolvedId;
        const { data: eventData } = await supabase
          .from(tableName)
          .select('enable_observers')
          .eq('id', queryId)
          .maybeSingle();
        enableObs = eventData?.enable_observers;
      }

      if (!enableObs || cancelled) return;

      const map: Record<string, ObserverAssignment[]> = {};
      for (const heat of availableHeats) {
        if (cancelled) return;
        const heatNumber = heat.charCodeAt(0) - 'A'.charCodeAt(0) + 1;
        try {
          const observers = await getObserverAssignments(resolvedId, heatNumber, heatManagement.currentRound);
          map[heat] = observers || [];
        } catch {
          map[heat] = [];
        }
      }
      if (!cancelled) {
        setAllHeatObserversMap(map);
      }
    };

    loadAllObservers();
    return () => { cancelled = true; };
  }, [heatScoringMode, observerEventId, availableHeats, heatManagement.currentRound, currentEvent?.enable_observers, observerReloadTrigger]);

  const fleetManagementEnabled = heatManagement.configuration?.fleetManagementEnabled !== false;

  if (!fleetManagementEnabled) {
    return (
      <div className={`flex flex-col ${isFullscreen ? 'h-full' : 'h-[calc(100vh-200px)]'} no-select`}>
        <HmsManualSpreadsheet
          skippers={skippers}
          heatManagement={heatManagement}
          darkMode={darkMode}
          raceResults={raceResults}
          currentEvent={currentEvent}
          onConfigureHeats={onConfigureHeats}
          updateRaceResults={updateRaceResults}
          deleteRaceResult={deleteRaceResult}
          isFullscreen={isFullscreen}
          onOpenStartBox={() => setShowStartBoxModal(true)}
        />
        <StartBoxModal
          isOpen={showStartBoxModal}
          onClose={() => setShowStartBoxModal(false)}
          onSequenceComplete={() => setRaceTimerRunning(true)}
          clubId={currentEvent?.clubId || null}
          darkMode={darkMode}
        />
      </div>
    );
  }

  // Don't render until a heat is selected
  if (!selectedHeat) {
    return (
      <div className="space-y-6 p-8">
        <div className={`rounded-xl p-6 border ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white'} shadow-lg text-center`}>
          <p className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Loading heats...</p>
        </div>
      </div>
    );
  }

  if (showOverallResultsView && heatManagement.configuration?.scoringSystem === 'shrs') {
    return (
      <div className={`${isFullscreen ? 'h-full' : 'h-[calc(100vh-200px)]'} flex flex-col no-select`}>
        <SHRSOverallResultsView
          skippers={skippers}
          heatManagement={heatManagement}
          darkMode={darkMode}
          onBack={() => setShowOverallResultsView(false)}
          isSimulated={currentEvent?.is_simulated}
        />
      </div>
    );
  }

  if (showHmsScoreSheet && heatManagement.configuration?.scoringSystem === 'hms') {
    return (
      <div className={`${isFullscreen ? 'h-full' : 'h-[calc(100vh-200px)]'} flex flex-col no-select`}>
        <div className={`flex items-center justify-between px-4 py-2.5 border-b shrink-0 ${
          darkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-slate-200'
        }`}>
          <button
            onClick={() => setShowHmsScoreSheet(false)}
            className={`flex items-center gap-2 text-sm font-medium transition-colors ${
              darkMode ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Back to Scoring
          </button>
          <span className={`text-sm font-semibold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
            HMS Score Sheet
          </span>
        </div>
        <div className="flex-1 overflow-auto">
          <HmsScoreSheet
            skippers={skippers}
            heatManagement={heatManagement}
            dropRules={currentEvent?.dropRules || [4, 8, 16, 24, 32, 40]}
            darkMode={darkMode}
            eventName={currentEvent?.eventName || currentEvent?.clubName}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${isFullscreen ? 'p-2' : 'p-8'} no-select`}>
      {/* All Heats Complete - Show Actions (hidden in touch/spreadsheet mode as it's shown in the button instead) */}
      {areAllHeatsComplete() && !isRoundComplete && heatScoringMode === 'pro' && (
          <div className={`mt-4 p-4 rounded-lg ${
            darkMode ? 'bg-green-900/20 border border-green-700' : 'bg-green-50 border border-green-200'
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <div className={`font-semibold ${darkMode ? 'text-green-400' : 'text-green-800'}`}>
                  All heats scored for {getShrsRoundLabel(heatManagement.currentRound)}!
                </div>
                <div className={`text-sm ${darkMode ? 'text-green-300' : 'text-green-700'}`}>
                  Ready to advance to next round with promotion/relegation
                </div>
              </div>
              <button
                onClick={() => {
                  console.log('Advancing to next round...');
                  console.log('Current round:', heatManagement.currentRound);
                  console.log('Heat results count:', currentRound?.results.length);

                  // Use the atomic advance handler if available, otherwise fall back to old method
                  if (onAdvanceToNextRound) {
                    const lastHeat = availableHeats[availableHeats.length - 1];
                    onAdvanceToNextRound(lastHeat);
                  } else {
                    // Fallback: old method (kept for backwards compatibility)
                    const nextRoundNumber = heatManagement.currentRound + 1;
                    const lastHeat = availableHeats[availableHeats.length - 1];
                    onCompleteHeat(lastHeat);
                    if (onGoToRound) {
                      onGoToRound(nextRoundNumber);
                    }
                  }
                }}
                className="px-6 py-3 text-white rounded-lg font-medium transition-colors shadow-md"
              >
                Advance to {getShrsRoundLabel(heatManagement.currentRound + 1)}
              </button>
            </div>
          </div>
        )}

      {/* Scratch Race Table for selected heat */}
      <div className={`rounded-xl overflow-hidden border ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white'} shadow-lg`}>
        <div className={`px-6 py-4 border-b ${
          darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-slate-50 border-slate-200'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-wrap">
              {/* Start Box Button */}
              <button
                onClick={() => setShowStartBoxModal(true)}
                className={`inline-flex items-center justify-center rounded-lg transition-all active:scale-95 ${
                  raceTimerRunning
                    ? darkMode
                      ? 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    : darkMode
                      ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/25'
                      : 'bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100'
                } px-3 py-2`}
                title="Starter Console"
              >
                <Timer size={22} />
              </button>

              {raceTimerRunning && (
                <RaceElapsedTimer
                  isRunning={raceTimerRunning}
                  onStop={() => setRaceTimerRunning(false)}
                  darkMode={darkMode}
                />
              )}

              {/* Race Status Control */}
              {currentEvent?.id && currentEvent?.enableLiveTracking && !currentEvent?.completed && (
                <LiveStatusControl eventId={currentEvent.id} darkMode={darkMode} />
              )}

              {/* Round Navigation - Left Arrow */}
              {canGoBackToPreviousRound && onGoBackToPreviousRound && (
                <button
                  onClick={onGoBackToPreviousRound}
                  className={`p-2 rounded-lg transition-all hover:scale-110 ${
                    darkMode
                      ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                      : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                  }`}
                  title={`Go back to ${getShrsRoundLabel(heatManagement.currentRound - 1)}`}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
              )}

              {/* Current Round Badge */}
              <div className={`px-3 py-1.5 rounded-lg ${
                darkMode ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'bg-blue-100 text-blue-700 border border-blue-300'
              } font-semibold text-sm`}>
                {getShrsRoundLabel(heatManagement.currentRound, selectedHeat)}
              </div>

              {/* Heat Buttons - Inline */}
              <div className="flex items-center gap-2">
                {availableHeats.map((heat, index) => {
                  const progress = getHeatProgress(heat);
                  const isComplete = isHeatComplete(heat);
                  const isSelected = heat === selectedHeat;

                  let canScore = false;

                  if (index === 0) {
                    canScore = !isComplete;
                  } else {
                    const allPriorHeatsComplete = availableHeats
                      .slice(0, index)
                      .every(lowerHeat => isHeatComplete(lowerHeat));
                    canScore = allPriorHeatsComplete && !isComplete;
                  }

                  // Always allow viewing completed heats
                  const isDisabled = !canScore && !isComplete;

                  return (
                    <button
                      key={heat}
                      onClick={() => !isDisabled && handleHeatSelection(heat)}
                      disabled={isDisabled}
                      className={`
                        relative px-4 py-2 rounded-lg font-semibold text-white transition-all
                        ${getHeatColor(heat)}
                        ${isSelected
                          ? 'ring-2 ring-offset-2 ring-blue-400 scale-105 shadow-lg'
                          : isDisabled
                          ? 'opacity-40 cursor-not-allowed'
                          : 'hover:scale-105 shadow-md opacity-90 hover:opacity-100 cursor-pointer'
                        }
                      `}
                      title={
                        isDisabled
                          ? `${getHeatLabel(heat)} - Complete lower heats first`
                          : `${getHeatLabel(heat)} - ${progress.scored}/${progress.total} scored`
                      }
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold">{isInFinals ? (SHRS_FLEET_NAMES[heat] || getHeatDisplayLabel(heat, heatManagement.configuration)) : getHeatDisplayLabel(heat, heatManagement.configuration)}</span>
                        {isComplete && (
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Round Navigation - Right Arrow or Return to Active */}
              {isViewingPreviousRound && onGoToRound && activeRound ? (
                <button
                  onClick={() => onGoToRound(activeRound)}
                  className={`p-2 rounded-lg transition-all hover:scale-110 ${
                    darkMode
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : 'bg-green-500 hover:bg-green-600 text-white'
                  }`}
                  title={`Return to active ${getShrsRoundLabel(activeRound)}`}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                  </svg>
                </button>
              ) : areAllHeatsComplete() && heatManagement.rounds.length > heatManagement.currentRound && onGoToRound && (
                <button
                  onClick={() => {
                    const nextRoundExists = heatManagement.rounds.some(r => r.round === heatManagement.currentRound + 1);
                    if (nextRoundExists) {
                      onGoToRound(heatManagement.currentRound + 1);
                    }
                  }}
                  className={`p-2 rounded-lg transition-all hover:scale-110 ${
                    darkMode
                      ? 'bg-blue-600 hover:bg-blue-700 text-white animate-pulse'
                      : 'bg-blue-500 hover:bg-blue-600 text-white animate-pulse'
                  }`}
                  title={`Advance to ${getShrsRoundLabel(heatManagement.currentRound + 1)}`}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}

              <div className="h-6 w-px bg-slate-300 dark:bg-slate-600 mx-1" />

              <div className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                {heatSkippers.length} skippers
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Scoring Mode Buttons - show all non-current modes */}
              {(['pro', 'touch', 'spreadsheet'] as const).filter(m => m !== heatScoringMode).map(mode => (
                <button
                  key={mode}
                  onClick={async () => {
                    setHeatScoringMode(mode);
                    setTouchModeResultsConfirmed(false);
                    const { data: { user } } = await supabase.auth.getUser();
                    if (user) {
                      await supabase.from('profiles').update({ scoring_mode_preference: mode }).eq('id', user.id);
                    }
                  }}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors ${
                    darkMode
                      ? 'bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
                  }`}
                  title={`Switch to ${mode === 'pro' ? 'Pro' : mode === 'touch' ? 'Touch' : 'Spreadsheet'} Mode`}
                >
                  {mode === 'pro' ? <Table2 size={18} /> : mode === 'touch' ? <Hand size={18} /> : <Grid3X3 size={18} />}
                  <span className="text-xs font-medium hidden sm:inline">
                    {mode === 'pro' ? 'Pro' : mode === 'touch' ? 'Touch' : 'Sheet'}
                  </span>
                </button>
              ))}

              {heatManagement.configuration?.scoringSystem === 'hms' && fleetManagementEnabled && (
                <button
                  onClick={() => setShowHmsScoreSheet(true)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors ${
                    darkMode
                      ? 'bg-amber-700 text-amber-100 hover:bg-amber-600'
                      : 'bg-amber-500 text-white hover:bg-amber-600'
                  }`}
                  title="View HMS Score Sheet"
                >
                  <Trophy size={18} />
                  <span className="text-xs font-medium hidden sm:inline">Score Sheet</span>
                </button>
              )}

              <button
                onClick={() => setShowHeatAssignments(true)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  darkMode
                    ? 'bg-purple-600 text-white hover:bg-purple-700'
                    : 'bg-purple-600 text-white hover:bg-purple-700'
                }`}
              >
                View Assignments
              </button>
              {heatManagement.configuration.scoringSystem === 'shrs' && (
                <button
                  onClick={async () => {
                    const opts = {
                      eventName: currentEvent?.name || currentEvent?.eventName || '',
                      eventDate: currentEvent?.date || '',
                      venueName: (currentEvent as any)?.venue || '',
                      clubName: (currentEvent as any)?.clubName || '',
                      showFlag: currentEvent?.show_flag ?? false,
                      showCountry: currentEvent?.show_country ?? false,
                    };
                    let obsMap: Map<string, { skipperName: string; sailNumber: string; countryCode?: string }[]> | undefined;
                    const pdfEventId = observerEventId || await resolveObserverEventId(currentEvent);
                    if (pdfEventId) {
                      const rawMap = await getAllObserversForEvent(pdfEventId);
                      obsMap = new Map();
                      rawMap.forEach((observers, key) => {
                        obsMap!.set(key, observers.map(o => {
                          const matched = skippers.find(s =>
                            s.sailNo === o.sailNumber || s.name === o.skipperName
                          );
                          return { ...o, countryCode: matched?.country_code || undefined };
                        }));
                      });
                    }
                    exportAllRoundsPdf(heatManagement, skippers, opts, obsMap);
                  }}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    darkMode
                      ? 'bg-slate-600 text-white hover:bg-slate-500'
                      : 'bg-slate-600 text-white hover:bg-slate-500'
                  }`}
                  title="Export all qualifying rounds as multi-page PDF"
                >
                  <FileDown size={16} />
                  Export All Rounds
                </button>
              )}
              <button
                onClick={() => setShowRaceResults(true)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  darkMode
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700'
                }`}
              >
                Race Results
              </button>
              <button
                onClick={() => {
                  if (heatManagement.configuration?.scoringSystem === 'shrs') {
                    setShowOverallResultsView(true);
                  } else if (heatManagement.configuration?.scoringSystem === 'hms' && fleetManagementEnabled) {
                    setShowHmsScoreSheet(true);
                  } else {
                    setShowOverallResults(true);
                  }
                }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  darkMode
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {heatManagement.configuration?.scoringSystem === 'hms' && fleetManagementEnabled ? 'Score Sheet' : 'Overall Results'}
              </button>
            </div>
          </div>
        </div>

        {rollCallActive && selectedHeat ? (() => {
          const racingSkippers = heatSkipperIndices.filter(idx => idx >= 0 && idx < skippers.length);
          const totalRacing = racingSkippers.length;
          const readyCount = rollCallReady.size;
          const absentCount = rollCallAbsent.size;
          const unmarkedCount = totalRacing - readyCount - absentCount;
          const allAccountedFor = readyCount + absentCount >= totalRacing;

          return (
            <div className={`${isFullscreen ? 'fixed inset-0 z-20' : 'h-[75vh]'} flex flex-col overflow-hidden ${isFullscreen ? '' : 'rounded-b-xl'} ${
              darkMode ? 'bg-slate-900' : 'bg-slate-50'
            }`}>
              <div className={`px-5 py-3 border-b flex-shrink-0 ${
                darkMode ? 'bg-teal-900/20 border-teal-800/30' : 'bg-teal-50/60 border-teal-200/60'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${darkMode ? 'bg-teal-500/15 ring-1 ring-teal-500/25' : 'bg-teal-100 ring-1 ring-teal-300/50'}`}>
                      <ClipboardCheck size={20} className={darkMode ? 'text-teal-400' : 'text-teal-600'} />
                    </div>
                    <div>
                      <h3 className={`font-bold text-base ${darkMode ? 'text-teal-200' : 'text-teal-900'}`}>
                        Heat {getHeatDisplayLabel(selectedHeat, heatManagement.configuration)} - Roll Call
                      </h3>
                      <p className={`text-xs ${darkMode ? 'text-teal-400/60' : 'text-teal-700/60'}`}>
                        Tap to mark ready. Right-click to mark absent.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-3 text-sm">
                      {readyCount > 0 && (
                        <span className={`flex items-center gap-1 ${darkMode ? 'text-green-400' : 'text-green-600'}`}>
                          <UserCheck size={14} /> {readyCount}
                        </span>
                      )}
                      {absentCount > 0 && (
                        <span className={`flex items-center gap-1 ${darkMode ? 'text-red-400' : 'text-red-600'}`}>
                          <UserX size={14} /> {absentCount}
                        </span>
                      )}
                      {unmarkedCount > 0 && (
                        <span className={`${darkMode ? 'text-slate-400' : 'text-slate-500'} text-xs`}>
                          {unmarkedCount} waiting
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setRollCallReady(new Set(racingSkippers));
                        setRollCallAbsent(new Set());
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        darkMode
                          ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                          : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
                      }`}
                    >
                      All Ready
                    </button>
                    <button
                      onClick={() => setRollCallActive(false)}
                      className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                        allAccountedFor
                          ? 'bg-green-600 text-white hover:bg-green-700'
                          : darkMode
                            ? 'bg-teal-600 text-white hover:bg-teal-500'
                            : 'bg-teal-600 text-white hover:bg-teal-500'
                      }`}
                    >
                      {allAccountedFor ? 'Start Scoring' : 'Skip Roll Call'}
                    </button>
                  </div>
                </div>
                <div className={`mt-2.5 w-full rounded-full h-1 ${darkMode ? 'bg-slate-700/60' : 'bg-teal-200/60'}`}>
                  <div
                    className="h-1 rounded-full transition-all duration-300"
                    style={{ width: `${totalRacing > 0 ? ((readyCount + absentCount) / totalRacing) * 100 : 0}%` }}
                  />
                </div>
              </div>

              <div className={`flex-1 overflow-y-auto p-4 sm:p-5 ${darkMode ? 'bg-slate-900/80' : 'bg-slate-50'}`}>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8 gap-3">
                  {racingSkippers.map(originalIdx => {
                    const skipper = skippers[originalIdx];
                    if (!skipper) return null;
                    const sailNo = String(skipper.sailNumber || skipper.sailNo);
                    const isReady = rollCallReady.has(originalIdx);
                    const isAbsent = rollCallAbsent.has(originalIdx);
                    const initials = skipper.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

                    return (
                      <button
                        key={originalIdx}
                        onClick={() => {
                          if (isAbsent) {
                            setRollCallAbsent(prev => { const n = new Set(prev); n.delete(originalIdx); return n; });
                            setRollCallReady(prev => new Set(prev).add(originalIdx));
                          } else if (isReady) {
                            setRollCallReady(prev => { const n = new Set(prev); n.delete(originalIdx); return n; });
                          } else {
                            setRollCallReady(prev => new Set(prev).add(originalIdx));
                          }
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          if (isAbsent) {
                            setRollCallAbsent(prev => { const n = new Set(prev); n.delete(originalIdx); return n; });
                          } else {
                            setRollCallReady(prev => { const n = new Set(prev); n.delete(originalIdx); return n; });
                            setRollCallAbsent(prev => new Set(prev).add(originalIdx));
                          }
                        }}
                        className={`
                          relative flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl
                          transition-all duration-200 active:scale-95
                          ${isReady
                            ? darkMode
                              ? 'bg-green-500/12 border border-green-500/40 shadow-sm shadow-green-500/10'
                              : 'bg-green-50 border border-green-400/50 shadow-sm shadow-green-500/10'
                            : isAbsent
                              ? darkMode
                                ? 'bg-red-500/8 border border-red-500/25 opacity-50'
                                : 'bg-red-50 border border-red-300/40 opacity-50'
                              : darkMode
                                ? 'bg-slate-800/80 border border-slate-700/50 hover:border-teal-500/40 hover:bg-slate-800'
                                : 'bg-white border border-slate-200 hover:border-teal-400/50 hover:shadow-sm'
                          }
                        `}
                      >
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 overflow-hidden mb-1 ${
                          isReady
                            ? 'ring-2 ring-green-500/50'
                            : isAbsent
                              ? 'ring-2 ring-red-500/30 grayscale'
                              : ''
                        }`}>
                          {skipper.avatarUrl ? (
                            <img src={skipper.avatarUrl} alt={skipper.name} className="w-full h-full object-cover rounded-full" />
                          ) : (
                            <div className={`w-full h-full flex items-center justify-center rounded-full ${
                              isReady
                                ? 'bg-green-600 text-white'
                                : isAbsent
                                  ? 'bg-red-500/60 text-white'
                                  : darkMode
                                    ? 'bg-slate-600 text-slate-300'
                                    : 'bg-slate-200 text-slate-600'
                            }`}>
                              {initials}
                            </div>
                          )}
                        </div>
                        {currentEvent?.show_country && skipper?.country_code && (
                          <span className={`text-[10px] font-medium leading-none ${
                            isReady ? (darkMode ? 'text-green-400/70' : 'text-green-600/70')
                              : isAbsent ? (darkMode ? 'text-red-400/50' : 'text-red-500/50')
                              : darkMode ? 'text-slate-500' : 'text-slate-400'
                          }`}>
                            {getIOCCode(skipper.country_code)}
                          </span>
                        )}
                        <span className={`text-lg font-bold leading-none ${
                          isReady ? (darkMode ? 'text-green-300' : 'text-green-700')
                            : isAbsent ? (darkMode ? 'text-red-400' : 'text-red-500')
                            : darkMode ? 'text-slate-100' : 'text-slate-700'
                        }`}>
                          {sailNo}
                        </span>
                        {isReady && (
                          <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center shadow">
                            <UserCheck size={10} className="text-white" strokeWidth={3} />
                          </div>
                        )}
                        {isAbsent && (
                          <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center shadow">
                            <UserX size={10} className="text-white" strokeWidth={3} />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {currentHeatObservers.length > 0 && (
                <div className={`px-5 py-3 border-t flex-shrink-0 ${
                  darkMode ? 'bg-purple-900/15 border-purple-800/25' : 'bg-purple-50/50 border-purple-200/50'
                }`}>
                  <div className="flex items-center gap-3">
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md ${
                      darkMode ? 'bg-purple-500/15' : 'bg-purple-100/60'
                    }`}>
                      <Eye size={13} className={darkMode ? 'text-purple-400' : 'text-purple-600'} />
                      <span className={`text-xs font-semibold ${darkMode ? 'text-purple-300' : 'text-purple-700'}`}>
                        Observers
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {currentHeatObservers.map((obs, idx) => (
                        <div key={idx} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${
                          darkMode
                            ? 'bg-purple-500/10 text-purple-300 border border-purple-500/20'
                            : 'bg-purple-50 text-purple-700 border border-purple-200/60'
                        }`}>
                          <span>{obs.skipper_name}</span>
                          <span className={darkMode ? 'text-purple-400/60' : 'text-purple-500/60'}>#{obs.skipper_sail_number}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className={`px-5 py-2.5 border-t flex-shrink-0 ${darkMode ? 'bg-teal-900/15 border-teal-800/20' : 'bg-teal-50/40 border-teal-200/40'}`}>
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-medium tracking-wider uppercase ${darkMode ? 'text-teal-500/50' : 'text-teal-600/50'}`}>
                    Roll Call Mode
                  </span>
                  <button
                    onClick={() => setRollCallActive(false)}
                    className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                      allAccountedFor
                        ? 'bg-green-600 text-white hover:bg-green-700 shadow-md'
                        : darkMode
                          ? 'bg-teal-600 text-white hover:bg-teal-500'
                          : 'bg-teal-600 text-white hover:bg-teal-500'
                    }`}
                  >
                    {allAccountedFor
                      ? `Start Scoring (${readyCount} racing${absentCount > 0 ? `, ${absentCount} absent` : ''})`
                      : 'Start Scoring'
                    }
                  </button>
                </div>
              </div>
            </div>
          );
        })() : heatScoringMode === 'touch' ? (
          <TouchModeScoring
            skippers={heatSkippers}
            currentRace={heatManagement.currentRound}
            numRaces={12}
            isHeatScoring={true}
            isFullscreen={isFullscreen}
            isScoringLastHeat={isScoringLastHeat()}
            roundLabel={getShrsRoundLabel(heatManagement.currentRound, selectedHeat)}
            allSkippers={skippers}
            allRaceResults={raceResults}
            raceResults={mappedRaceResults}
            heatObservers={currentHeatObservers}
            updateRaceResults={(updatedResults) => {
              const currentRace = heatManagement.currentRound;
              console.log('🔄 TouchMode callback - Race:', currentRace, 'Total results:', updatedResults.length);

              const currentRaceResults = updatedResults.filter(r => r.race === currentRace);
              console.log('📊 Current race results count:', currentRaceResults.length);

              // Map filtered indices back to original indices for the new entries
              const mappedEntries = currentRaceResults.map(result => ({
                skipperIndex: heatSkipperIndices[result.skipperIndex],
                position: result.position,
                letterScore: result.letterScore,
                customPoints: result.customPoints
              })).filter(entry => entry.skipperIndex !== undefined);

              console.log('🔄 Atomic replace: race', currentRace, 'skippers:', heatSkipperIndices, 'entries:', mappedEntries.length);

              // Use atomic replace function - clears and adds in one state update
              replaceRaceResultsForSkippers(currentRace, heatSkipperIndices, mappedEntries);

              // Clear existing heat results for this heat/round/race
              if (selectedHeat && onClearHeatRaceResults) {
                onClearHeatRaceResults(
                  selectedHeat,
                  heatManagement.currentRound,
                  currentRace,
                  heatSkipperIndices
                );
              }

              // ALSO update heat results for progression tracking
              mappedEntries.forEach(entry => {
                const heatResult = {
                  skipperIndex: entry.skipperIndex,
                  heatDesignation: selectedHeat,
                  position: entry.position,
                  letterScore: entry.letterScore,
                  round: heatManagement.currentRound,
                  race: currentRace
                };
                onUpdateHeatResult(heatResult);
              });
            }}
            onConfirmResults={() => {
              console.log('✅ Touch mode results confirmed for heat', selectedHeat);
              setTouchModeResultsConfirmed(true);

              if (selectedHeat) {
                const roundKey = `${heatManagement.currentRound}-${selectedHeat}`;
                setSpreadsheetVerifiedHeats(prev => new Set(prev).add(roundKey));
              }

              if (selectedHeat && isScoringLastHeat()) {
                console.log('🏁 Last heat confirmed - completing heat', selectedHeat);
                onCompleteHeat(selectedHeat);
              }
            }}
            darkMode={darkMode}
            dropRules={[4, 8, 16, 24, 32, 40]}
            currentEvent={currentEvent}
            updateSkipper={onUpdateSkipper ? (index: number, updates: Partial<Skipper>) => {
              const updatedSkipper = { ...heatSkippers[index], ...updates };
              onUpdateSkipper(index, updatedSkipper);
            } : undefined}
          />
        ) : heatScoringMode === 'spreadsheet' ? (
          <SpreadsheetScoring
            skippers={skippers}
            currentRace={heatManagement.currentRound}
            numRaces={12}
            isHeatScoring={true}
            isFullscreen={isFullscreen}
            isScoringLastHeat={isScoringLastHeat()}
            roundLabel={getShrsRoundLabel(heatManagement.currentRound, selectedHeat)}
            isSeedingRound={heatManagement.currentRound === 1}
            raceResults={mappedRaceResults}
            heatObservers={currentHeatObservers}
            allHeatObserversMap={allHeatObserversMap}
            heatManagement={heatManagement}
            availableHeats={availableHeats}
            heatSkipperIndicesMap={heatSkipperIndicesMap}
            allHeatRaceResults={allHeatMappedResults}
            selectedHeat={selectedHeat}
            onSelectHeat={handleHeatSelection}
            onUpdateHeatResults={(heat: HeatDesignation, updatedResults: any[]) => {
              const currentRace = heatManagement.currentRound;
              const indices = heatSkipperIndicesMap[heat] || [];

              const currentRaceResults = updatedResults.filter(r => r.race === currentRace);

              const mappedEntries = currentRaceResults.map(result => ({
                skipperIndex: indices[result.skipperIndex],
                position: result.position,
                letterScore: result.letterScore,
                customPoints: result.customPoints
              })).filter(entry => entry.skipperIndex !== undefined);

              replaceRaceResultsForSkippers(currentRace, indices, mappedEntries);

              if (onClearHeatRaceResults) {
                onClearHeatRaceResults(heat, heatManagement.currentRound, currentRace, indices);
              }

              const heatResults = mappedEntries.map(entry => ({
                skipperIndex: entry.skipperIndex,
                heatDesignation: heat,
                position: entry.position,
                letterScore: entry.letterScore,
                round: heatManagement.currentRound,
                race: currentRace
              }));

              if (onBatchUpdateHeatResults && heatResults.length > 0) {
                onBatchUpdateHeatResults(heatResults);
              } else {
                heatResults.forEach(heatResult => {
                  onUpdateHeatResult(heatResult);
                });
              }
            }}
            updateRaceResults={(updatedResults) => {
              const currentRace = heatManagement.currentRound;
              const currentRaceResults = updatedResults.filter(r => r.race === currentRace);
              const mappedEntries = currentRaceResults.map(result => ({
                skipperIndex: heatSkipperIndices[result.skipperIndex],
                position: result.position,
                letterScore: result.letterScore,
                customPoints: result.customPoints
              })).filter(entry => entry.skipperIndex !== undefined);
              replaceRaceResultsForSkippers(currentRace, heatSkipperIndices, mappedEntries);
              if (selectedHeat && onClearHeatRaceResults) {
                onClearHeatRaceResults(selectedHeat, heatManagement.currentRound, currentRace, heatSkipperIndices);
              }
              const heatResults = mappedEntries.map(entry => ({
                skipperIndex: entry.skipperIndex,
                heatDesignation: selectedHeat,
                position: entry.position,
                letterScore: entry.letterScore,
                round: heatManagement.currentRound,
                race: currentRace
              }));
              if (onBatchUpdateHeatResults && heatResults.length > 0) {
                onBatchUpdateHeatResults(heatResults);
              } else {
                heatResults.forEach(heatResult => {
                  onUpdateHeatResult(heatResult);
                });
              }
            }}
            onConfirmHeatResults={(heat: HeatDesignation) => {
              console.log('Spreadsheet per-heat results confirmed for heat', heat);
              const roundKey = `${heatManagement.currentRound}-${heat}`;
              const updatedVerified = new Set(spreadsheetVerifiedHeats).add(roundKey);
              setSpreadsheetVerifiedHeats(updatedVerified);

              const allHeatsNowVerified = availableHeats.every(h => {
                const hRoundKey = `${heatManagement.currentRound}-${h}`;
                return updatedVerified.has(hRoundKey);
              });

              const currentHeatIndex = availableHeats.indexOf(heat);
              const nextIncomplete = availableHeats.find((h, idx) => {
                if (idx <= currentHeatIndex) return false;
                const hRoundKey = `${heatManagement.currentRound}-${h}`;
                if (updatedVerified.has(hRoundKey)) return false;
                const progress = getHeatProgress(h);
                return progress.scored < progress.total || progress.total === 0;
              });

              if (nextIncomplete) {
                pendingSpreadsheetAdvance.current = { nextHeat: nextIncomplete, fromHeat: heat };
              }

              onCompleteHeat(heat);

              if (allHeatsNowVerified) {
                console.log('Spreadsheet: ALL heats verified for Race', heatManagement.currentRound, '- scheduling modal show');
                const roundNum = heatManagement.currentRound;
                setTimeout(() => {
                  console.log('Spreadsheet: timeout fired - forcing assignments modal for completed Race', roundNum);
                  lastCompletedRoundShown.current = roundNum;
                  if (onForceRoundComplete) {
                    onForceRoundComplete(roundNum);
                  }
                  setShowHeatAssignments(true);
                }, 300);
              }
            }}
            onConfirmResults={() => {
              console.log('Spreadsheet results confirmed for heat', selectedHeat);
              if (selectedHeat) {
                const roundKey = `${heatManagement.currentRound}-${selectedHeat}`;
                setSpreadsheetVerifiedHeats(prev => new Set(prev).add(roundKey));
                onCompleteHeat(selectedHeat);
              }
              setTouchModeResultsConfirmed(true);
            }}
            darkMode={darkMode}
            currentEvent={currentEvent}
            parentVerifiedHeats={spreadsheetVerifiedHeats}
            onShowOverallResults={heatManagement.configuration?.scoringSystem === 'shrs' ? () => setShowOverallResultsView(true) : undefined}
          />
        ) : (
          <ScratchRaceTable
          skippers={heatSkippers}
          numRaces={12}
          dropRules={[4, 8, 16, 24, 32, 40]}
          updateRaceResults={wrappedUpdateRaceResults}
          raceResults={mappedRaceResults}
          enableRaceEditing={enableRaceEditing}
          lastCompletedRace={heatLastCompletedRace}
          editingRace={editingRace}
          deleteRaceResult={wrappedDeleteRaceResult}
          clearRace={wrappedClearRace}
          darkMode={darkMode}
          onManageSkippers={onManageSkippers}
          onShowCharts={onShowCharts}
          onReturnToRaceManagement={onReturnToRaceManagement}
          onCompleteScoring={onCompleteScoring}
          currentEvent={currentEvent}
          currentDay={currentDay}
          onToggleDarkMode={onToggleDarkMode}
          onRaceSettingsChange={onRaceSettingsChange}
          onOpenRaceSettings={onConfigureHeats}
          updateSkipper={onUpdateSkipper ? (index: number, updates: Partial<Skipper>) => {
            const updatedSkipper = { ...heatSkippers[index], ...updates };
            onUpdateSkipper(index, updatedSkipper);
          } : undefined}
          isHeatRacing={true}
          currentHeatRound={heatManagement.currentRound}
        />
        )}

        {/* Pro Mode: Verify Results button - shown when heat is fully scored */}
        {heatScoringMode === 'pro' && selectedHeat && !touchModeResultsConfirmed && (() => {
          const progress = getHeatProgress(selectedHeat);
          const allScored = progress.scored >= progress.total && progress.total > 0;
          if (!allScored) return null;
          return (
            <div className={`px-4 py-3 border-t ${
              darkMode ? 'bg-slate-800/80 border-slate-700/50' : 'bg-slate-50 border-slate-200'
            }`}>
              <button
                onClick={() => {
                  setTouchModeResultsConfirmed(true);
                  if (selectedHeat) {
                    const roundKey = `${heatManagement.currentRound}-${selectedHeat}`;
                    setSpreadsheetVerifiedHeats(prev => new Set(prev).add(roundKey));
                  }
                  if (selectedHeat && isScoringLastHeat()) {
                    onCompleteHeat(selectedHeat);
                  }
                }}
                className="w-full py-3 rounded-xl text-white font-bold text-base bg-green-600 hover:bg-green-700 transition-colors flex items-center justify-center gap-2 shadow-lg"
              >
                <Check size={20} />
                {isScoringLastHeat() ? 'Verify Results & Complete Round' : 'Verify & Apply Results'}
              </button>
            </div>
          );
        })()}
      </div>

      {/* Heat Assignment Modal */}
      <HeatAssignmentModal
        isOpen={showHeatAssignments}
        onClose={() => {
          console.log('🔄 Heat Assignment Modal closing - triggering observer reload');
          setShowHeatAssignments(false);
          if (heatManagement.roundJustCompleted) {
            delete heatManagement.roundJustCompleted;
          }
          setTouchModeResultsConfirmed(false);
          setObserverReloadTrigger(prev => prev + 1);
          if (selectedHeat) {
            const progress = getHeatProgress(selectedHeat);
            const isComplete = progress.scored >= progress.total && progress.total > 0;
            if (!isComplete && currentEvent?.enable_roll_call === true) {
              setRollCallActive(true);
              setRollCallReady(new Set());
              setRollCallAbsent(new Set());
            }
          }
        }}
        heatManagement={heatManagement}
        skippers={skippers}
        darkMode={darkMode}
        currentEvent={currentEvent}
        onReshuffle={handleReshuffle}
        onManualAssign={handleManualAssign}
        onStartRound={onGoToRound}
        onUpdateAssignments={onUpdateHeatAssignments}
        onAdvanceToNextRound={(nextRoundNumber) => {
          console.log('🔄 Advancing to Round', nextRoundNumber, '- keeping modal open to show allocations');
          if (heatManagement.roundJustCompleted) {
            delete heatManagement.roundJustCompleted;
          }
          // Call the actual advance handler with the last heat to trigger round creation
          if (onAdvanceToNextRound) {
            const lastHeat = availableHeats[availableHeats.length - 1];
            console.log('📍 Calling onAdvanceToNextRound with last heat:', lastHeat);
            onAdvanceToNextRound(lastHeat);
          } else if (onGoToRound) {
            // Fallback to just navigating if advance handler not available
            onGoToRound(nextRoundNumber);
          }
        }}
      />

      {/* Manual Heat Assignment Modal */}
      {showManualAssignModal && (
        <ManualHeatAssignmentModal
          isOpen={showManualAssignModal}
          onClose={() => {
            setShowManualAssignModal(false);
            setShouldAutoShuffle(false);
          }}
          onConfirm={(assignments) => {
            console.log('Manual assignments confirmed:', assignments);
            setShowManualAssignModal(false);
            setShouldAutoShuffle(false);
            // This would update the heat management - for now it just closes
            // The parent component (YachtRaceManager) would need to handle the actual update
          }}
          skippers={skippers}
          numHeats={heatManagement.configuration.numberOfHeats}
          darkMode={darkMode}
          currentEvent={currentEvent}
          autoShuffle={shouldAutoShuffle}
          onAddSkipper={onManageSkippers}
          onEditSkipper={(skipperIndex) => {
            // Show edit modal for this specific skipper
            setEditingSkipperIndex(skipperIndex);
          }}
          onDeleteSkipper={(skipperIndex) => {
            // Delete skipper from event - stay on manual assignment modal
            if (onRemoveSkipper) {
              onRemoveSkipper(skipperIndex);
              // Don't close modal - let user continue assigning heats
            } else {
              // Fallback: close modal and refresh
              setShowManualAssignModal(false);
              onManageSkippers();
            }
          }}
          onSaveSkipper={(skipperIndex, updatedSkipper) => {
            // Save updated skipper - stay on manual assignment modal
            if (onUpdateSkipper) {
              onUpdateSkipper(skipperIndex, updatedSkipper);
              // Don't close modal - let user continue assigning heats
            }
          }}
          heatConfiguration={heatManagement.configuration}
        />
      )}

      {/* Race Results Modal */}
      <HeatRaceResultsModal
        isOpen={showRaceResults}
        onClose={() => setShowRaceResults(false)}
        skippers={skippers}
        heatManagement={heatManagement}
        darkMode={darkMode}
        currentEvent={currentEvent}
      />

      {/* Overall Results Modal */}
      <HeatOverallResultsModal
        isOpen={showOverallResults}
        onClose={() => setShowOverallResults(false)}
        skippers={skippers}
        heatManagement={heatManagement}
        dropRules={[4, 8, 16, 24, 32, 40]}
        darkMode={darkMode}
        isSimulated={currentEvent?.is_simulated}
      />

      {/* Start Box Modal */}
      <StartBoxModal
        isOpen={showStartBoxModal}
        onClose={() => setShowStartBoxModal(false)}
        onSequenceComplete={() => setRaceTimerRunning(true)}
        clubId={currentEvent?.clubId || null}
        darkMode={darkMode}
      />
    </div>
  );
};
