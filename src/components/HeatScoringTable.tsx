import React, { useState, useMemo, useCallback } from 'react';
import { HeatManagement, HeatDesignation, generateInitialHeatAssignments } from '../types/heat';
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
import { Hand, Eye } from 'lucide-react';
import { getObserverAssignments, ObserverAssignment } from '../utils/observerUtils';

interface HeatScoringTableProps {
  skippers: Skipper[];
  heatManagement: HeatManagement;
  darkMode: boolean;
  onManageSkippers: () => void;
  onUpdateSkipper?: (skipperIndex: number, updatedSkipper: Skipper) => void;
  onRemoveSkipper?: (skipperIndex: number) => void;
  onUpdateHeatResult: (result: any) => void;
  onCompleteHeat: (heat: HeatDesignation) => void;
  onReturnToRaceManagement: () => void;
  onCompleteScoring: () => void;
  onShowCharts: () => void;
  onConfigureHeats: () => void;
  onRaceSettingsChange: (settings: { numRaces: number; dropRules: number[] }) => void;
  updateRaceResults: (race: number, skipperIndex: number, position: number | null, letterScore?: any, customPoints?: number) => void;
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
  onUpdateHeatAssignments?: (assignments: any) => void;
  onSelectHeat?: (heat: HeatDesignation) => void;
}

export const HeatScoringTable: React.FC<HeatScoringTableProps> = ({
  skippers,
  heatManagement,
  darkMode,
  onManageSkippers,
  onUpdateSkipper,
  onRemoveSkipper,
  onUpdateHeatResult,
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
  onSelectHeat
}) => {
  const currentRound = heatManagement.rounds[heatManagement.currentRound - 1];

  // Get all available heats for current round, sorted in reverse order (F -> A)
  // This ensures the last element is the lowest heat (e.g., C in a 3-heat setup)
  const availableHeats = useMemo(() => {
    if (!currentRound) return [];
    return currentRound.heatAssignments
      .map(assignment => assignment.heatDesignation)
      .sort()
      .reverse();
  }, [currentRound]);

  // Start with the LOWEST heat (last in the list) by default
  // Initialize to null and let useEffect set the correct heat
  const [selectedHeat, setSelectedHeat] = useState<HeatDesignation | null>(null);
  const [showOverallResults, setShowOverallResults] = useState(false);
  const [showRaceResults, setShowRaceResults] = useState(false);
  const [showHeatAssignments, setShowHeatAssignments] = useState(false);
  const [showManualAssignModal, setShowManualAssignModal] = useState(false);
  const [shouldAutoShuffle, setShouldAutoShuffle] = useState(false);
  const [editingSkipperIndex, setEditingSkipperIndex] = useState<number | null>(null);
  const [manualSelection, setManualSelection] = useState(false); // Track manual heat selection
  const [touchMode, setTouchMode] = useState(true); // Touch mode scoring state - default to Touch mode
  const [touchModeResultsConfirmed, setTouchModeResultsConfirmed] = useState(false); // Track if touch mode results are confirmed
  const [currentHeatObservers, setCurrentHeatObservers] = useState<ObserverAssignment[]>([]);
  const manualSelectionTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // Track the round number to detect actual round changes (not just object reference changes)
  const lastRoundNumber = React.useRef<number | null>(null);

  // Reset touch mode confirmation when heat or round changes
  React.useEffect(() => {
    setTouchModeResultsConfirmed(false);
  }, [selectedHeat, heatManagement.currentRound]);

  // Track which heat was last auto-advanced to prevent loops
  const lastAutoAdvancedHeat = React.useRef<HeatDesignation | null>(null);

  // Track if we've shown the initial modal
  const hasShownInitialModal = React.useRef<boolean>(false);

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

  // When round NUMBER changes (not just object reference), reset to lowest incomplete heat
  // availableHeats is ['D', 'C', 'B', 'A'] - D is the FIRST and LOWEST heat
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
        const isComplete = progress.scored === progress.total && progress.total > 0;

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
  const lastCompletedHeats = React.useRef<Set<string>>(new Set());
  const pendingModalShow = React.useRef<boolean>(false);
  React.useEffect(() => {
    if (!currentRound) return;

    // In touch mode, wait for explicit confirmation before triggering
    if (touchMode && !touchModeResultsConfirmed) {
      return;
    }

    availableHeats.forEach(heat => {
      const heatKey = `${heatManagement.currentRound}-${heat}`;
      const wasCompleted = lastCompletedHeats.current.has(heatKey);
      const isNowComplete = isHeatComplete(heat);

      // If heat just became complete (wasn't complete before, but is now)
      if (!wasCompleted && isNowComplete) {
        console.log(`🎯 Heat ${heat} just became complete! Triggering completeHeat for mid-round promotion/relegation...`);
        lastCompletedHeats.current.add(heatKey);
        onCompleteHeat(heat);

        // In Round 2+, show modal after heat completes to display promotions/relegations
        if (heatManagement.currentRound >= 2) {
          pendingModalShow.current = true;
        }
      }
    });
  }, [currentRound?.results, heatManagement.currentRound, availableHeats, onCompleteHeat, touchMode, touchModeResultsConfirmed]);

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

  // Show modal on initial load for Round 1 if no scores yet
  React.useEffect(() => {
    if (!hasShownInitialModal.current && currentRound && currentRound.round === 1) {
      const hasScores = currentRound.results && currentRound.results.length > 0;
      if (!hasScores && availableHeats.length > 0) {
        console.log('🎯 Initial heat allocation - showing assignments modal');
        setShowHeatAssignments(true);
        hasShownInitialModal.current = true;
      }
    }
  }, [currentRound, availableHeats]);

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

  // Auto-advance to next heat when current heat is complete
  React.useEffect(() => {
    if (!currentRound || availableHeats.length === 0) return;
    if (manualSelection) return; // Respect manual selection
    if (!selectedHeat) return;

    // In touch mode, wait for explicit confirmation before auto-advancing
    if (touchMode && !touchModeResultsConfirmed) return;

    // Check if current heat is complete
    const progress = getHeatProgress(selectedHeat);
    const currentHeatComplete = progress.scored === progress.total && progress.total > 0;

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
        const nextHeatComplete = nextProgress.scored === nextProgress.total && nextProgress.total > 0;

        // Only auto-advance if next heat is NOT complete
        if (!nextHeatComplete) {
          console.log(`✅ Heat ${selectedHeat} complete! Auto-advancing to Heat ${nextHeat}`);
          lastAutoAdvancedHeat.current = selectedHeat; // Mark this heat as advanced

          // In touch mode, show Heat Assignments modal for next heat to display observers
          if (touchMode) {
            console.log('📋 Touch mode: Showing Heat Assignments for next heat observers');
            setShowHeatAssignments(true);
            // Reset touch mode confirmation for next heat
            setTouchModeResultsConfirmed(false);
          }

          setTimeout(() => {
            setSelectedHeat(nextHeat);
          }, 500); // Small delay for visual feedback
        }
      } else {
        // All heats complete, stay on current heat
        console.log('✅ All heats complete!');
      }
    }
  }, [currentRound?.results, manualSelection, selectedHeat, availableHeats, touchMode, touchModeResultsConfirmed]);

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
      if (!currentEvent?.id) return;

      // Import the live tracking utilities dynamically
      const { getRaceStatus, updateRaceStatus } = await import('../utils/liveTrackingStorage');

      // Check current status
      const statusData = await getRaceStatus(currentEvent.id);

      // If status is not "live", automatically set it to "live"
      if (statusData && statusData.status !== 'live') {
        console.log('🟢 Auto-updating race status to "live" as scoring has begun');
        await updateRaceStatus(currentEvent.id, 'live');
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

  // Filter race results for current heat's skippers
  const heatRaceResults = useMemo(() => {
    const heatSkipperIndicesSet = new Set(heatSkipperIndices);
    return raceResults.filter(result =>
      heatSkipperIndicesSet.has(result.skipperIndex)
    );
  }, [raceResults, heatSkipperIndices]);

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

  // Calculate heat-specific lastCompletedRace
  // In heat racing mode, we need to track which races are complete for THIS heat only
  const heatLastCompletedRace = useMemo(() => {
    // Check each race in order to find the last completed one
    let lastCompleted = 0;
    const numRaces = 12; // HMS heat racing uses 12 races per round

    for (let race = 1; race <= numRaces; race++) {
      // Check if ALL skippers in this heat have results for this race
      const allScored = heatSkipperIndices.every(skipperIdx => {
        const result = raceResults.find(r =>
          r.race === race && r.skipperIndex === skipperIdx
        );
        return result && (result.position !== null || result.letterScore);
      });

      if (allScored) {
        lastCompleted = race;
      } else {
        // Once we find an incomplete race, stop checking
        break;
      }
    }

    console.log('🏁 Heat', selectedHeat, 'lastCompletedRace:', lastCompleted);
    return lastCompleted;
  }, [heatSkipperIndices, raceResults, selectedHeat]);

  const getHeatColor = (heat: HeatDesignation): string => {
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
    return `Heat ${heat}`;
  };

  // Calculate heat progress
  const getHeatProgress = (heat: HeatDesignation) => {
    const assignment = currentRound?.heatAssignments.find(
      a => a.heatDesignation === heat
    );
    if (!assignment) return { scored: 0, total: 0 };

    // Get ALL results for this heat designation, regardless of current assignments
    // This is important because after promotions/relegations, assignments change
    // but results remain for the skippers who actually sailed
    const heatResults = currentRound?.results.filter(r =>
      r.heatDesignation === heat &&
      r.round === heatManagement.currentRound
    ) || [];

    // Count how many skippers in this heat have valid results
    // (position is not null OR has a letter score)
    const scoredCount = heatResults.filter(r =>
      r.position !== null || r.letterScore
    ).length;

    return {
      scored: scoredCount,
      total: assignment.skipperIndices.length
    };
  };

  const isHeatComplete = (heat: HeatDesignation) => {
    const progress = getHeatProgress(heat);
    return progress.scored === progress.total && progress.total > 0;
  };

  // Check if all heats are complete for current race
  const areAllHeatsComplete = () => {
    if (!currentRound) {
      return false;
    }

    // Use the getHeatProgress function which already works correctly
    const allComplete = availableHeats.every(heat => {
      const progress = getHeatProgress(heat);
      return progress.scored === progress.total && progress.total > 0;
    });

    if (allComplete) {
      console.log('✅ All heats complete for Round', heatManagement.currentRound);
    }

    return allComplete;
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

  // Load observers for the current heat
  React.useEffect(() => {
    const loadObservers = async () => {
      if (!currentEvent?.id || !selectedHeat || !currentEvent.enable_observers) {
        setCurrentHeatObservers([]);
        return;
      }

      try {
        // Get the heat number (A=1, B=2, C=3, etc.)
        const heatNumber = selectedHeat.charCodeAt(0) - 'A'.charCodeAt(0) + 1;
        const observers = await getObserverAssignments(
          currentEvent.id,
          heatManagement.currentRound,
          heatNumber
        );
        setCurrentHeatObservers(observers || []);
      } catch (error) {
        console.error('Error loading observers for current heat:', error);
        setCurrentHeatObservers([]);
      }
    };

    loadObservers();
  }, [currentEvent?.id, selectedHeat, heatManagement.currentRound, currentEvent?.enable_observers]);

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

  return (
    <div className="space-y-6 p-8 no-select">
      {/* All Heats Complete - Show Actions */}
      {areAllHeatsComplete() && !isRoundComplete && (
          <div className={`mt-4 p-4 rounded-lg ${
            darkMode ? 'bg-green-900/20 border border-green-700' : 'bg-green-50 border border-green-200'
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <div className={`font-semibold ${darkMode ? 'text-green-400' : 'text-green-800'}`}>
                  All heats scored for Round {heatManagement.currentRound}!
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
                className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors shadow-md"
              >
                Advance to Round {heatManagement.currentRound + 1}
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
              {/* Race Status Control */}
              {currentEvent?.id && (
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
                  title={`Go back to Round ${heatManagement.currentRound - 1}`}
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
                Round {heatManagement.currentRound}
              </div>

              {/* Heat Buttons - Inline */}
              <div className="flex items-center gap-2">
                {availableHeats.map((heat, index) => {
                  const progress = getHeatProgress(heat);
                  const isComplete = isHeatComplete(heat);
                  const isSelected = heat === selectedHeat;

                  // Determine if this heat can be scored
                  // Only allow scoring heats in order (lowest to highest)
                  // availableHeats is already sorted: [F, E, D, C, B, A] or similar
                  let canScore = false;

                  if (index === 0) {
                    // First heat (lowest) can always be scored if not complete
                    canScore = !isComplete;
                  } else {
                    // Higher heats can only be scored if all lower heats are complete
                    const allLowerHeatsComplete = availableHeats
                      .slice(0, index)
                      .every(lowerHeat => isHeatComplete(lowerHeat));
                    canScore = allLowerHeatsComplete && !isComplete;
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
                        <span className="text-base font-bold">{heat}</span>
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
                  title={`Return to active Round ${activeRound}`}
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
                  title={`Advance to Round ${heatManagement.currentRound + 1}`}
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
              {/* Touch Mode Toggle Button */}
              <button
                onClick={() => setTouchMode(!touchMode)}
                className={`p-2 rounded-lg transition-colors ${
                  touchMode
                    ? darkMode
                      ? 'bg-cyan-600 text-white'
                      : 'bg-cyan-500 text-white'
                    : darkMode
                      ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                }`}
                title={touchMode ? "Exit Touch Mode" : "Enable Touch Mode"}
              >
                <Hand size={20} />
              </button>

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
              {/* Only show Race Results and Overall Results after Round 1 is complete and advanced */}
              {heatManagement.currentRound > 1 && (
                <>
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
                    onClick={() => setShowOverallResults(true)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      darkMode
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    Overall Results
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {touchMode ? (
          <TouchModeScoring
            skippers={heatSkippers}
            currentRace={heatManagement.currentRound}
            numRaces={12}
            isHeatScoring={true}
            raceResults={mappedRaceResults}
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
            }}
            darkMode={darkMode}
            dropRules={[4, 8, 16, 24, 32, 40]}
            currentEvent={currentEvent}
            updateSkipper={onUpdateSkipper ? (index: number, updates: Partial<Skipper>) => {
              const updatedSkipper = { ...heatSkippers[index], ...updates };
              onUpdateSkipper(index, updatedSkipper);
            } : undefined}
            heatObservers={currentHeatObservers}
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
      </div>

      {/* Heat Assignment Modal */}
      <HeatAssignmentModal
        isOpen={showHeatAssignments}
        onClose={() => {
          setShowHeatAssignments(false);
          if (heatManagement.roundJustCompleted) {
            delete heatManagement.roundJustCompleted;
          }
          // Ensure touch mode confirmation is reset when modal closes
          // This allows scoring to continue for the newly selected heat
          if (touchMode) {
            setTouchModeResultsConfirmed(false);
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
          if (onGoToRound) {
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
        />
      )}

      {/* Race Results Modal */}
      <HeatRaceResultsModal
        isOpen={showRaceResults}
        onClose={() => setShowRaceResults(false)}
        skippers={skippers}
        heatManagement={heatManagement}
        darkMode={darkMode}
      />

      {/* Overall Results Modal */}
      <HeatOverallResultsModal
        isOpen={showOverallResults}
        onClose={() => setShowOverallResults(false)}
        skippers={skippers}
        heatManagement={heatManagement}
        dropRules={[4, 8, 16, 24, 32, 40]}
        darkMode={darkMode}
      />
    </div>
  );
};
