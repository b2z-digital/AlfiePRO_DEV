import React, { useState, useEffect, useMemo } from 'react';
import { X, Users, Shuffle, Edit3, Check, RefreshCw, Eye, UserPlus, AlertCircle, Lock, ArrowRight, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { Skipper } from '../types';
import { HeatManagement, HeatDesignation, getHeatColorClasses, HeatAssignment, generateNextRoundAssignments, getSHRSPhase, getSHRSHeatLabel, getSHRSRoundLabel, isSHRSTransitionRound, isSHRSFinalsRound } from '../types/heat';
import { RaceEvent } from '../types/race';
import { getCountryFlag, getIOCCode } from '../utils/countryFlags';
import { selectObservers, saveObserverAssignments, getObserverAssignments, toggleObserver, ObserverAssignment } from '../utils/observerUtils';
import { supabase } from '../utils/supabase';

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
  onAdvanceToNextRound
}) => {
  const [editMode, setEditMode] = useState(false);
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

  const rankedSkipperIndices = useMemo(() => {
    const indices = (heatManagement.configuration as any)?.rankedSkipperIndices;
    return new Set<number>(Array.isArray(indices) ? indices : []);
  }, [heatManagement.configuration]);

  const shrsHasPreAssignments = heatManagement.configuration.scoringSystem === 'shrs' &&
    heatManagement.rounds.length > 1 &&
    !heatManagement.rounds.some(r => r.results && r.results.length > 0);

  const totalPreAssignedRounds = shrsHasPreAssignments ? heatManagement.rounds.length : 0;

  const exportAllSHRSAssignments = () => {
    const rows: string[] = ['Round,Heat,Sail Number,Skipper Name,Club'];

    for (const rd of heatManagement.rounds) {
      const sortedAssignments = [...rd.heatAssignments].sort((a, b) =>
        a.heatDesignation.localeCompare(b.heatDesignation)
      );
      const config = heatManagement.configuration;
      const roundLabel = config.scoringSystem === 'shrs'
        ? getSHRSRoundLabel(rd.round, config)
        : `R${rd.round}`;

      for (const assignment of sortedAssignments) {
        for (const idx of assignment.skipperIndices) {
          const skipper = skippers[idx];
          if (skipper) {
            rows.push(`${roundLabel},Heat ${assignment.heatDesignation},${skipper.sailNo || ''},${skipper.name || ''},${skipper.club || ''}`);
          }
        }
      }
    }

    const csvContent = rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `SHRS_Heat_Assignments_All_Qualifying_Rounds.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const resolveObserverConflicts = (updatedAssignments: HeatAssignment[]) => {
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

        const allRacingIndices = new Set<number>();
        updatedAssignments.forEach(a => a.skipperIndices.forEach(idx => {
          const aHeatIdx = sortedDesignations.indexOf(a.heatDesignation);
          if (aHeatIdx + 1 === heatNumber) {
            allRacingIndices.add(idx);
          }
        }));
        assignment.skipperIndices.forEach(idx => allRacingIndices.add(idx));

        const existingObserverIndices = new Set(observers.map(o => o.skipper_index));
        const allObserverIndicesAcrossHeats = new Set<number>();
        newMap.forEach(obs => obs.forEach(o => allObserverIndicesAcrossHeats.add(o.skipper_index)));

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
              sail_number: skippers[candidate].sailNo,
              times_served: 0,
              is_active: true
            });
            existingObserverIndices.add(candidate);
          }
        }

        newMap.set(heatNumber, cleaned);
      }

      return newMap;
    });
  };

  // Observer state - store per heat
  const [observersByHeat, setObserversByHeat] = useState<Map<number, ObserverAssignment[]>>(new Map());
  const [loadingObservers, setLoadingObservers] = useState(false);
  const [showObserverSelector, setShowObserverSelector] = useState(false);
  const [selectedHeatForObserver, setSelectedHeatForObserver] = useState<number>(1);
  const [showCustomObserverInput, setShowCustomObserverInput] = useState(false);
  const [customObserverName, setCustomObserverName] = useState('');

  // Reset edit state when modal opens/closes
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
    }
  }, [isOpen]);

  // Create a stable key that represents the state of rounds that should trigger observer reload
  const roundDataKey = useMemo(() => {
    const { currentRound, roundJustCompleted, rounds } = heatManagement;

    // Determine which round we're displaying
    let targetRound;
    if (roundJustCompleted && currentRound > roundJustCompleted) {
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
    const resultCount = roundData.results?.length || 0;
    const completionStatus = roundData.completed ? 'complete' : 'incomplete';
    const justCompletedFlag = roundJustCompleted ? `jc${roundJustCompleted}` : 'active';
    const assignmentHash = roundData.heatAssignments
      .map(h => `${h.heatDesignation}:${h.skipperIndices.slice().sort().join(',')}`)
      .join('|');

    return `${targetRound}-${heatCount}-${resultCount}-${completionStatus}-${justCompletedFlag}-${assignmentHash}`;
  }, [heatManagement.currentRound, heatManagement.roundJustCompleted, heatManagement.rounds]);

  // Load and select observers when modal opens
  useEffect(() => {
    console.log('🔵 HeatAssignmentModal useEffect TRIGGERED:', {
      isOpen,
      hasEventId: !!currentEvent?.id,
      roundDataKey,
      dependencies: {
        isOpen,
        eventId: currentEvent?.id,
        enable_observers: currentEvent?.enable_observers,
        observers_per_heat: currentEvent?.observers_per_heat,
        skipperCount: skippers?.length
      }
    });

    const loadObservers = async () => {
      console.log('🎯 HeatAssignmentModal - Checking observer conditions:', {
        isOpen,
        hasEventId: !!currentEvent?.id,
        enable_observers: currentEvent?.enable_observers,
        observers_per_heat: currentEvent?.observers_per_heat,
        roundDataKey,
        currentEvent
      });

      if (!isOpen || !currentEvent?.id) {
        console.log('⏭️ Skipping observer load - no event or modal closed');
        setObserversByHeat(new Map());
        return;
      }

      // Check if observers are enabled - if undefined, fetch from database
      const enableObservers = currentEvent?.enable_observers;
      if (enableObservers === undefined) {
        console.log('🔄 Observer settings undefined, fetching from database...');
        const { data: eventData, error } = await supabase
          .from('quick_races')
          .select('enable_observers, observers_per_heat')
          .eq('id', currentEvent.id)
          .maybeSingle();

        if (error) {
          console.error('❌ Error fetching observer settings:', error);
          setObserversByHeat(new Map());
          return;
        }

        console.log('📥 Fetched observer settings from DB:', eventData);

        // Update currentEvent with the fetched values
        if (eventData) {
          (currentEvent as any).enable_observers = eventData.enable_observers ?? true;
          (currentEvent as any).observers_per_heat = eventData.observers_per_heat ?? 2;
        }

        // If observers are not enabled, don't proceed
        if (!eventData?.enable_observers) {
          console.log('⏭️ Observers disabled for this event');
          setObserversByHeat(new Map());
          return;
        }
      } else if (!enableObservers) {
        console.log('⏭️ Observers disabled for this event');
        setObserversByHeat(new Map());
        return;
      }

      setLoadingObservers(true);
      try {
        const { currentRound, rounds, roundJustCompleted } = heatManagement;

        // CRITICAL: Use the SAME logic as the modal display to determine which round to load observers for
        // This ensures observers match the round being displayed
        let roundToLoadObserversFor;
        if (roundJustCompleted) {
          // Show the round that was just completed (with results)
          // This matches the modal display logic at line 383-385
          roundToLoadObserversFor = rounds.find(r => r.round === roundJustCompleted);
          console.log('🏁 Showing completed round', roundJustCompleted);
        } else {
          // Show the next uncompleted round, or current round
          // This matches the modal display logic at line 388
          roundToLoadObserversFor = rounds.find(r => !r.completed) || rounds.find(r => r.round === currentRound);
          console.log('➡️ Showing current/next round', roundToLoadObserversFor?.round);
        }

        console.log('✅ Loading observers for round', roundToLoadObserversFor?.round);
        console.log('   Round data:', roundToLoadObserversFor);

        // CRITICAL FIX: If the round we're displaying is NOT completed, don't load old observers
        // This handles the case where Round 1 completes, modal shows Round 2 assignments,
        // but we shouldn't load Round 1 observers - we need to assign NEW observers for Round 2
        if (roundToLoadObserversFor && !roundToLoadObserversFor.completed) {
          console.log('🆕 Round is not completed - will assign new observers, not load historical ones');
        }

        if (!roundToLoadObserversFor) {
          console.warn('⚠️ No round data found');
          setObserversByHeat(new Map());
          return;
        }

        const currentRoundData = roundToLoadObserversFor;
        const roundNumberToLoad = currentRoundData.round; // Use the round we're displaying, not currentRound

        // Load observers PER HEAT
        const newObserversByHeat = new Map<number, ObserverAssignment[]>();
        const observersPerHeat = currentEvent.observers_per_heat || 2;

        console.log('👀 Loading', observersPerHeat, 'observers per heat');
        console.log('🔥 Total heats:', currentRoundData.heatAssignments.length);

        // IMPORTANT: Sort heats alphabetically to match UI rendering order
        // This ensures heatNumber (1, 2, 3...) maps correctly to Heat A, B, C...
        const sortedHeats = [...currentRoundData.heatAssignments].sort((a, b) =>
          a.heatDesignation.localeCompare(b.heatDesignation)
        );

        // Use results from the round we're displaying
        const roundResults = currentRoundData.results || [];

        // Check which heats are completed to determine observer assignment
        // Heats complete from bottom to top (B -> A for 2 heats, C -> B -> A for 3 heats)
        const heatCompletionStatus = sortedHeats.map((heat, idx) => {
          const heatResults = roundResults.filter(r => r.heatDesignation === heat.heatDesignation);

          // For completed rounds, check if this heat has ANY results with positions
          // (don't rely on original skipperIndices as skippers may have moved between heats)
          let isCompleted;
          if (currentRoundData.completed) {
            // If round is complete, a heat is complete if it has any results with scored positions
            isCompleted = heatResults.some(r => r.position !== null || r.letterScore || r.markedAsUP);
          } else {
            // For active rounds, check if all skippers in the original assignment have results
            isCompleted = heat.skipperIndices.length > 0 && heat.skipperIndices.every(skipperIdx => {
              const result = heatResults.find(r => r.skipperIndex === skipperIdx);
              return result && (result.position !== null || result.letterScore || result.markedAsUP);
            });
          }

          return { heatDesignation: heat.heatDesignation, heatNumber: idx + 1, isCompleted };
        });

        console.log('📊 Heat completion status:', heatCompletionStatus);

        // Determine which heat should have observers (the first uncompleted heat from bottom to top)
        // Reverse to check from bottom (last) to top (first)
        const nextHeatToScore = [...heatCompletionStatus].reverse().find(h => !h.isCompleted);
        console.log('🎯 Next heat to score:', nextHeatToScore?.heatDesignation || 'All heats completed');

        // Get all completed heats to show their previous observers
        const completedHeats = heatCompletionStatus.filter(h => h.isCompleted);
        console.log('🏁 Completed heats:', completedHeats.map(h => h.heatDesignation).join(', ') || 'None');

        // Process each heat separately
        for (let i = 0; i < sortedHeats.length; i++) {
          const heat = sortedHeats[i];
          const heatNumber = i + 1; // Heat 1 = Heat A, Heat 2 = Heat B, etc.

          console.log(`\n🔍 Heat ${heat.heatDesignation} (heat ${heatNumber}):`);

          // Assign observers to:
          // 1. The next heat that needs scoring (active observers)
          // 2. ALL completed heats (to show previous observers)
          const isNextHeatToScore = nextHeatToScore && nextHeatToScore.heatNumber === heatNumber;
          const isCompletedHeat = heatCompletionStatus[i].isCompleted;

          console.log(`  isNextHeatToScore: ${isNextHeatToScore}, isCompletedHeat: ${isCompletedHeat}`);

          const isSHRSMode = heatManagement.configuration.scoringSystem === 'shrs';

          if (!isSHRSMode && !isNextHeatToScore && !isCompletedHeat) {
            console.log(`  ⏭️ Skipping observer assignment - this heat has not been scored yet (HMS mode)`);
            continue;
          }

          if (isSHRSMode && !isNextHeatToScore && !isCompletedHeat) {
            console.log(`  🔄 SHRS mode - assigning observers for all heats upfront`);
          }

          if (isCompletedHeat) {
            console.log(`  ✅ This is a completed heat - loading observers for completed heat`);
          }

          if (isNextHeatToScore) {
            console.log(`  ✅ This is the next heat to score - assigning observers`);
          }

          const needsObserverAssignment = isNextHeatToScore || (isSHRSMode && !isCompletedHeat);

          let shouldSelectNewObservers = false;
          let existingObservers: ObserverAssignment[] | null = null;

          if (isCompletedHeat) {
            // Heat is complete - load observers who actually observed this heat
            existingObservers = await getObserverAssignments(
              currentEvent.id,
              heatNumber,
              roundNumberToLoad
            );
            console.log(`  📖 Loading ${existingObservers?.length || 0} observers for completed heat`);

            if (existingObservers && existingObservers.length > 0) {
              newObserversByHeat.set(heatNumber, existingObservers);
            }
          } else if (needsObserverAssignment) {
            // For heats that need observers (next to score in HMS, or all heats in SHRS)
            existingObservers = await getObserverAssignments(
              currentEvent.id,
              heatNumber,
              roundNumberToLoad
            );

            console.log(`  📋 Checking existing observers for Round ${roundNumberToLoad}, Heat ${heatNumber}:`, existingObservers?.length || 0);
            if (existingObservers && existingObservers.length > 0) {
              console.log(`     Existing observer indices:`, existingObservers.map(o => o.skipper_index));
              console.log(`     Racing skipper indices:`, heat.skipperIndices);
            }

            // Validate existing observers:
            // 1. Count must match expected
            // 2. None of the observers can be racing in THIS heat
            const observersRacingInHeat = existingObservers?.filter(obs => {
              const isRacing = heat.skipperIndices.includes(obs.skipper_index);
              if (isRacing) {
                console.log(`     ❌ Observer ${obs.skipper_name} (index ${obs.skipper_index}) is RACING in this heat!`);
              }
              return isRacing;
            }) || [];

            // Also check if ALL observers are still available
            const observersStillInHeat = existingObservers?.filter(obs => {
              const skipperStillExists = obs.skipper_index >= 0 && obs.skipper_index < skippers.length && skippers[obs.skipper_index];
              if (!skipperStillExists) {
                console.log(`     ⚠️ Observer ${obs.skipper_name} (index ${obs.skipper_index}) no longer exists in skipper list`);
              }
              return skipperStillExists;
            }) || [];

            const hasValidExistingObservers = existingObservers &&
              existingObservers.length > 0 &&
              existingObservers.length === observersPerHeat &&
              observersRacingInHeat.length === 0 && // No observers can be racing in this heat
              observersStillInHeat.length === existingObservers.length; // All observers still exist

            if (hasValidExistingObservers) {
              console.log(`  ✅ Using existing ${existingObservers.length} valid observers:`, existingObservers.map(o => `${o.skipper_name} (${o.skipper_index})`));
              newObserversByHeat.set(heatNumber, existingObservers);
            } else {
              if (existingObservers && existingObservers.length > 0) {
                console.warn(`  ⚠️ Existing observers invalid - will re-select`);
              } else {
                console.log(`  ℹ️ No existing observers found - will select new`);
              }
              shouldSelectNewObservers = true;
            }
          } else {
            console.log(`  ⏭️ Not next heat to score and not completed - skipping observer assignment`);
          }

          // Select new observers if needed
          if (shouldSelectNewObservers) {
            console.log(`  🔄 Selecting new observers for this heat`);
            console.log('  🏁 Skippers racing in this heat:', heat.skipperIndices);

            // Select observers from skippers NOT racing in THIS specific heat
            const observersForThisHeat = await selectObservers(
              currentEvent.id,
              heatNumber,
              roundNumberToLoad,
              heat.skipperIndices, // Only exclude skippers in THIS heat
              skippers,
              observersPerHeat
            );

            console.log(`  ✅ Selected ${observersForThisHeat.length} observers:`, observersForThisHeat);

            // Save observers for this specific heat
            if (observersForThisHeat.length > 0) {
              console.log(`  💾 Saving ${observersForThisHeat.length} observers to database for Heat ${heatNumber}, Round ${roundNumberToLoad}...`);
              await saveObserverAssignments(
                currentEvent.id,
                heatNumber,
                roundNumberToLoad,
                observersForThisHeat
              );
              console.log(`  ✅ Successfully saved observers to database`);
              newObserversByHeat.set(heatNumber, observersForThisHeat);
            }
          }
        }

        console.log('\n📊 Loaded observers for', newObserversByHeat.size, 'heats');
        console.log('   Observer details by heat:');
        for (let i = 1; i <= sortedHeats.length; i++) {
          const observers = newObserversByHeat.get(i);
          console.log(`   Heat ${['A', 'B', 'C', 'D', 'E', 'F'][i-1]}: ${observers ? observers.map(o => `${o.skipper_name} (${o.skipper_index})`).join(', ') : 'NONE'}`);
        }
        setObserversByHeat(newObserversByHeat);

        if (newObserversByHeat.size === 0) {
          console.warn('⚠️ No observers selected - may need more skippers or different configuration');
        }
      } catch (error) {
        console.error('Error loading observers:', error);
      } finally {
        setLoadingObservers(false);
      }
    };

    loadObservers();
  }, [isOpen, currentEvent?.id, currentEvent?.enable_observers, currentEvent?.observers_per_heat, roundDataKey, skippers]);

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black bg-opacity-50">
      <div
        className={`w-full ${maxWidthClass} max-h-[92vh] rounded-xl shadow-2xl overflow-hidden flex flex-col ${
          darkMode ? 'bg-slate-800 text-white' : 'bg-white text-slate-900'
        }`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-3 border-b flex-shrink-0 ${
          darkMode ? 'border-slate-700' : 'border-slate-200'
        }`}>
          <div className="flex items-center gap-3">
            <Users className="text-blue-400" size={24} />
            <div>
              <h2 className="text-lg font-bold">
                {isSHRS ? getSHRSRoundLabel(round, configuration) : `Round ${round}`} - {configuration.scoringSystem.toUpperCase()} {completed ? 'Heat Results' : 'Heat Assignments'}
              </h2>
              <p className={`text-xs mt-0.5 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                {isSHRS && shrsPhase ? (
                  <span className={`font-semibold ${isFinalsPhase ? 'text-yellow-500' : 'text-blue-400'}`}>
                    {isFinalsPhase ? 'Finals Series' : 'Qualifying Series'}
                  </span>
                ) : (
                  completed ? 'Round Complete' : 'Current Round'
                )}
                {' '} • {heatAssignments.length} heats
                {editMode && <span className="ml-2 text-amber-500 font-semibold">• Edit Mode</span>}
                {!editMode && hasAppliedChanges && <span className="ml-2 text-green-500 font-semibold">• Changes Applied</span>}
                {initialEditMode && <span className="ml-2 text-amber-500 font-semibold">• Tap unranked skippers to swap between heats</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {shrsHasPreAssignments && (
              <button
                onClick={exportAllSHRSAssignments}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  darkMode
                    ? 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
                title="Export all qualifying round assignments as CSV"
              >
                <Download size={16} />
                Export All
              </button>
            )}
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
            <div className="flex items-center gap-1.5">
              {heatManagement.rounds.map((rd, idx) => (
                <button
                  key={rd.round}
                  onClick={() => setPreviewRoundIndex(idx)}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                    (previewRoundIndex ?? 0) === idx
                      ? 'bg-blue-500 text-white'
                      : darkMode
                        ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                  }`}
                >
                  {getSHRSRoundLabel(rd.round, heatManagement.configuration)}
                </button>
              ))}
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

              // Check if this heat is completed (all assigned skippers have results)
              const heatCompleted = heatResults.length > 0 && heatResults.length >= skipperIndices.length && heatResults.every(r =>
                r.position !== null || r.letterScore || r.markedAsUP
              );

              // Determine which skippers to show:
              // - In EDIT mode: Show only who sailed in their original heat (hide promotions from lower heats)
              // - In NORMAL mode: If heat completed: show who sailed (from results)
              // - If heat not yet scored: show assignment
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
                // Normal mode: show completed heats' results or assignments
                skippersToDisplay = heatCompleted && skippersWhoSailed.length > 0
                  ? skippersWhoSailed
                  : skipperIndices;

                // Note: After Apply Changes, onUpdateAssignments already updates skipperIndices
                // with the correct promoted skippers, so no additional manipulation is needed here.
              }

              const sortedSkippers = [...skippersToDisplay].sort((a, b) => {
                const resultA = heatResults.find(r => r.skipperIndex === a);
                const resultB = heatResults.find(r => r.skipperIndex === b);

                const aHasResult = resultA && resultA.position !== null;
                const bHasResult = resultB && resultB.position !== null;

                if (aHasResult && bHasResult) {
                  return resultA.position! - resultB.position!;
                }
                if (aHasResult && !bHasResult) return -1;
                if (!aHasResult && bHasResult) return 1;
                return 0;
              });

              // Calculate heat position info for header and P slots
              const heatIndex = ['A', 'B', 'C', 'D', 'E', 'F'].indexOf(heatDesignation);
              const totalHeats = roundToDisplay?.heatAssignments?.length || 0;
              const isBottomHeat = heatIndex === totalHeats - 1;
              const isTopHeat = heatIndex === 0;

              // Check if the heat BELOW this one is completed (promotions have already happened)
              // Heat B gets promotions from Heat C, Heat A gets promotions from Heat B, etc.
              const heatLetters = ['A', 'B', 'C', 'D', 'E', 'F'];
              const lowerHeatLetter = heatLetters[heatIndex + 1] as typeof heatDesignation;
              let lowerHeatCompleted = false;
              if (!isBottomHeat && lowerHeatLetter) {
                const lowerHeatAssignment = heatAssignments.find(a => a.heatDesignation === lowerHeatLetter);
                if (lowerHeatAssignment) {
                  const lowerHeatSkippers = lowerHeatAssignment.skipperIndices;
                  const lowerHeatResults = results.filter(r => r.heatDesignation === lowerHeatLetter);
                  lowerHeatCompleted = lowerHeatSkippers.length > 0 && lowerHeatSkippers.every(skipperIdx => {
                    const result = lowerHeatResults.find(r => r.skipperIndex === skipperIdx);
                    return result && (result.position !== null || result.letterScore || result.markedAsUP);
                  });
                }
              }

              const isDropTarget = initialEditMode && selectedSkipperToMove !== null && !skipperIndices.includes(selectedSkipperToMove);

              return (
                <div
                  key={heatDesignation}
                  className={`rounded-lg border-2 overflow-hidden flex flex-col flex-1 min-w-0 ${
                    isDropTarget
                      ? 'border-amber-400 ring-2 ring-amber-400/50'
                      : darkMode ? 'bg-slate-700 border-slate-600' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  {/* Heat Header */}
                  <div
                    className={`p-2 ${getHeatGradient(heatDesignation)} border-b-2 flex-shrink-0 ${
                      isDropTarget ? 'cursor-pointer' : ''
                    }`}
                    onClick={() => {
                      if (!isDropTarget || selectedSkipperToMove === null || !localAssignments) return;
                      const targetAssignment = localAssignments.find(a => a.heatDesignation === heatDesignation);
                      if (!targetAssignment) return;
                      const unrankedInTarget = targetAssignment.skipperIndices.filter(i => !rankedSkipperIndices.has(i));
                      if (unrankedInTarget.length === 0) return;
                      const swapWith = unrankedInTarget[unrankedInTarget.length - 1];
                      const updated = localAssignments.map(a => {
                        if (a.skipperIndices.includes(selectedSkipperToMove)) {
                          return { ...a, skipperIndices: a.skipperIndices.map(i => i === selectedSkipperToMove ? swapWith : i) };
                        }
                        if (a.heatDesignation === heatDesignation) {
                          return { ...a, skipperIndices: a.skipperIndices.map(i => i === swapWith ? selectedSkipperToMove : i) };
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
                        {(isSHRS ? getSHRSHeatLabel(heatDesignation, round, configuration) : `Heat ${heatDesignation}`).toUpperCase()}
                      </h3>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-white opacity-80">{skippersToDisplay.length} skippers</span>
                        {heatCompleted ? (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-green-500 text-white">
                            Complete
                          </span>
                        ) : heatResults.length > 0 && !completed && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-500 text-white">
                            Scoring
                          </span>
                        )}
                      </div>
                    </div>
                    {isDropTarget && (
                      <div className="flex items-center gap-1 mt-1 text-xs font-semibold text-amber-200">
                        <ArrowRight size={12} />
                        Swap skipper here
                      </div>
                    )}
                  </div>

                  {/* Skipper List - Vertical scroll within column */}
                  <div className="flex-1 p-2 flex flex-col gap-1.5 overflow-y-auto">
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

                      if (round >= 2 && !isBottomHeat && lowerHeatLetter) {
                        const lowerHeatResults = results.filter(r => r.heatDesignation === lowerHeatLetter);

                        if (editMode && lowerHeatLetter === lastCompletedHeatLetter) {
                          const lowerHeatResult = lowerHeatResults.find(r => r.skipperIndex === skipperIndex);
                          if (lowerHeatResult && lowerHeatResult.position) {
                            const naturallyPromoted = lowerHeatResult.position <= promotionCount;
                            const manuallyToggled = modifiedPromotions.has(skipperIndex);
                            wasPromotedFromBelow = naturallyPromoted ? !manuallyToggled : manuallyToggled;
                          }
                        } else if (!editMode && !completed && lowerHeatCompleted) {
                          const currentHeatAssignment = heatAssignments[heatIndex];
                          const lowerHeatSkipperSet = new Set(lowerHeatResults.map(r => r.skipperIndex));
                          const hasMidRoundOverrides = currentHeatAssignment?.skipperIndices.some(
                            (idx: number) => lowerHeatSkipperSet.has(idx)
                          );
                          if (hasMidRoundOverrides) {
                            wasPromotedFromBelow = lowerHeatSkipperSet.has(skipperIndex);
                          } else {
                            wasPromotedFromBelow = lowerHeatResults.some(r =>
                              r.skipperIndex === skipperIndex &&
                              r.position !== null &&
                              r.position <= promotionCount &&
                              !r.letterScore
                            );
                          }
                        } else if (completed && !editMode) {
                          const currentHeatAssignment = heatAssignments[heatIndex];
                          const lowerHeatSkipperSet = new Set(lowerHeatResults.map(r => r.skipperIndex));
                          const hasMidRoundOverrides = currentHeatAssignment?.skipperIndices.some(
                            (idx: number) => lowerHeatSkipperSet.has(idx)
                          );

                          if (hasMidRoundOverrides) {
                            wasPromotedFromBelow = lowerHeatSkipperSet.has(skipperIndex);
                          } else {
                            wasPromotedFromBelow = lowerHeatResults.some(r =>
                              r.skipperIndex === skipperIndex &&
                              r.position !== null &&
                              r.position <= promotionCount &&
                              !r.letterScore
                            );
                          }
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
                                  const updated = localAssignments.map(a => {
                                    if (a.heatDesignation === sourceHeat.heatDesignation) {
                                      return {
                                        ...a,
                                        skipperIndices: a.skipperIndices.map(i => i === selectedSkipperToMove ? skipperIndex : i)
                                      };
                                    }
                                    if (a.heatDesignation === targetHeat.heatDesignation) {
                                      return {
                                        ...a,
                                        skipperIndices: a.skipperIndices.map(i => i === skipperIndex ? selectedSkipperToMove : i)
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
                                    setLimitWarning(`Cannot relegate more than ${promotionCount} skippers from Heat ${heatDesignation}`);
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
                                    setLimitWarning(`Cannot promote more than ${promotionCount} skippers from Heat ${heatDesignation}`);
                                    setTimeout(() => setLimitWarning(null), 3000);
                                    return prev; // Return unchanged set
                                  }
                                  newSet.add(skipperIndex);
                                }
                                return newSet;
                              });
                            }
                          }}
                          className={`p-1.5 rounded border-2 transition-all ${
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
                            {result && result.position !== null && (
                              <span className={`
                                flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold
                                ${result.position === 1 ? 'bg-yellow-500 text-yellow-900' :
                                  result.position === 2 ? 'bg-slate-300 text-slate-900' :
                                  result.position === 3 ? 'bg-amber-600 text-white' :
                                  darkMode ? 'bg-slate-600 text-white' : 'bg-slate-200 text-slate-900'}
                              `}>
                                {result.position}
                              </span>
                            )}

                            <div className={`flex-shrink-0 px-1.5 py-0.5 text-xs rounded font-bold ${
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

                            <div className="flex-1 min-w-0">
                              <p
                                className={`font-medium truncate text-xs ${
                                  darkMode ? 'text-white' : 'text-slate-900'
                                }`}
                                title={skipper.name}
                              >
                                {skipper.name}
                              </p>
                              {isPromoted && (
                                <p className="text-[10px] font-semibold text-green-600 dark:text-green-400">
                                  {wasPromotedFromBelow ? `From Heat ${lowerHeatLetter}` : 'Promoted'}
                                </p>
                              )}
                              {isRelegated && (
                                <p className="text-[10px] font-semibold text-red-600 dark:text-red-400">
                                  Relegate
                                </p>
                              )}
                              {initialEditMode && isRanked && (
                                <p className="text-[10px] font-semibold text-green-600 dark:text-green-400 flex items-center gap-0.5">
                                  <Lock size={8} /> Ranked
                                </p>
                              )}
                              {isSelectedForMove && (
                                <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                                  Tap to swap
                                </p>
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

                            {result && result.letterScore && (
                              <span className="flex-shrink-0 text-[10px] font-semibold px-1 py-0.5 rounded bg-red-500 text-white">
                                {result.letterScore}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Show P (Promotion) slots for non-bottom heats in Round 2+ ONLY if:
                        1. The round is not completed
                        2. This specific heat is not completed
                        3. The lower heat is not completed yet
                        4. No manual changes have been applied (which would already show promoted skippers)
                        5. NOT using SHRS (SHRS doesn't use promotion/relegation)
                        Once lower heat is completed OR changes are applied, promoted skippers are shown in their positions above with green borders */}
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
                  {/* Show observers for uncompleted heats AND previous heat observers */}
                  {currentEvent?.enable_observers && (() => {
                    const heatIndex = ['A', 'B', 'C', 'D', 'E', 'F'].indexOf(heatDesignation);
                    const heatNumber = heatIndex + 1;
                    const heatObservers = observersByHeat.get(heatNumber) || [];

                    // Only render if there are observers for this heat
                    if (heatObservers.length === 0) {
                      return null;
                    }

                    // Check if this is a completed heat showing previous observers
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
                              const observerSkipper = skippers[observer.skipper_index];
                              if (!observerSkipper) return null;

                              if (isPreviousHeatObservers) {
                                return (
                                  <div
                                    key={observer.skipper_index}
                                    className={`flex items-center gap-1 p-1 rounded border ${
                                      darkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-slate-200'
                                    }`}
                                  >
                                    <Eye size={10} className={`${darkMode ? 'text-slate-500' : 'text-slate-400'} flex-shrink-0`} />
                                    <span className={`font-medium truncate flex-1 text-[11px] ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                                      {observerSkipper.name}
                                    </span>
                                    <span className={`text-[10px] ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                      #{observerSkipper.sailNo}
                                    </span>
                                  </div>
                                );
                              }

                              return (
                                <button
                                  key={observer.skipper_index}
                                  onClick={async () => {
                                    if (!currentEvent?.id) return;
                                    const success = await toggleObserver(
                                      currentEvent.id,
                                      heatNumber,
                                      round,
                                      observer.skipper_index,
                                      observerSkipper.name,
                                      observerSkipper.sailNo,
                                      observer.times_served
                                    );
                                    if (success) {
                                      const updatedObservers = await getObserverAssignments(
                                        currentEvent.id,
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
                                    {observerSkipper.name}
                                  </span>
                                  <span className={`text-[10px] ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                    #{observerSkipper.sailNo}
                                  </span>
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
        <div className={`flex ${isInitialAllocation || initialEditMode || editMode || (round >= 2 && !completed && results && results.length > 0 && !anyScoringInProgress) ? 'justify-between' : 'justify-end'} gap-2 px-5 py-3 border-t flex-shrink-0 ${
          darkMode ? 'border-slate-700' : 'border-slate-200'
        }`}>
          {/* Initial edit mode controls */}
          {initialEditMode && (
            <div className="flex gap-3">
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
              <button
                onClick={() => {
                  if (localAssignments && onUpdateAssignments) {
                    onUpdateAssignments(localAssignments, 1);
                  }
                  setInitialEditMode(false);
                  setSelectedSkipperToMove(null);
                }}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg transition-colors font-medium text-sm bg-green-600 text-white hover:bg-green-700"
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
            </div>
          )}


          {/* Edit mode controls for mid-round only (when at least one heat complete but round not finished) */}
          {/* Allow manual override of promotions/relegations */}
          {!isInitialAllocation && !completed && round >= 2 && results && results.length > 0 && !anyScoringInProgress && (
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

                          // If we're editing mid-round (no nextRound), update CURRENT round
                          // If between rounds (nextRound exists), update NEXT round
                          const targetRoundNumber = nextRound ? nextRound.round : roundToDisplay.round;

                          console.log('💾 Applying assignment changes to Round', targetRoundNumber);
                          console.log('   Updated assignments:', updatedAssignments);

                          // Update in parent state - pass targetRoundNumber so parent knows which round to update
                          onUpdateAssignments(updatedAssignments, targetRoundNumber);

                          // Save to database if currentEvent exists
                          if (currentEvent?.id) {
                            try {
                              const { error } = await supabase
                                .from('quick_races')
                                .update({
                                  heat_management: {
                                    ...heatManagement,
                                    rounds: heatManagement.rounds.map(r =>
                                      r.round === targetRoundNumber
                                        ? { ...r, heatAssignments: updatedAssignments }
                                        : r
                                    )
                                  }
                                })
                                .eq('id', currentEvent.id);

                              if (error) {
                                console.error('❌ Error saving assignment changes:', error);
                              } else {
                                console.log('✅ Assignment changes saved to database');
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

          {!initialEditMode && <button
            onClick={() => {
              if (!isInitialAllocation) {
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
            disabled={loadingObservers}
            className={`px-4 py-1.5 rounded-lg transition-colors font-medium text-sm ${
              loadingObservers
                ? 'bg-slate-400 text-slate-200 cursor-not-allowed'
                : 'bg-blue-500 text-white hover:bg-blue-600'
            }`}
          >
            {loadingObservers ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Setting up observers...
              </span>
            ) : (
              completed && shouldAllowProgression
                ? isSHRS
                  ? `Progress to ${isSHRSFinalsRound(round + 1, configuration) ? `Final ${(round + 1) - (configuration.shrsQualifyingRounds || 0)}` : `Qualifying Rd ${round + 1}`}`
                  : `Progress to Round ${round + 1}`
                : completed && nextRound
                ? isSHRS
                  ? `Score ${isSHRSFinalsRound(nextRound.round, configuration) ? `Final ${nextRound.round - (configuration.shrsQualifyingRounds || 0)}` : `Qualifying Rd ${nextRound.round}`}`
                  : `Next Round (Round ${nextRound.round})`
                : completed
                ? 'Close'
                : isInitialAllocation
                ? 'Accept & Start Scoring'
                : 'Start Scoring'
            )}
          </button>}
        </div>
      </div>

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
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black bg-opacity-70">
            <div
              className={`w-full max-w-2xl max-h-[80vh] rounded-lg shadow-2xl overflow-hidden flex flex-col ${
                darkMode ? 'bg-slate-800 text-white' : 'bg-white text-slate-900'
              }`}
            >
              <div className={`flex items-center justify-between p-4 border-b ${
                darkMode ? 'border-slate-700' : 'border-slate-200'
              }`}>
                <div>
                  <h3 className="text-lg font-bold">Manage Observers - Heat {selectedHeat.heatDesignation}</h3>
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
                        Tap to select or deselect observers. Only skippers not racing in Heat {selectedHeat.heatDesignation} are shown.
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
                              if (!currentEvent?.id) return;

                              if (!isSelected && isAtLimit) {
                                setLimitWarning(`Maximum of ${maxObservers} observer${maxObservers !== 1 ? 's' : ''} reached. Remove one first.`);
                                setTimeout(() => setLimitWarning(null), 3000);
                                return;
                              }

                              const { data: existingObserver } = await supabase
                                .from('heat_observers')
                                .select('times_served')
                                .eq('event_id', currentEvent.id)
                                .eq('skipper_index', index)
                                .order('times_served', { ascending: false })
                                .limit(1)
                                .maybeSingle();

                              const timesServed = existingObserver?.times_served || 0;

                              const success = await toggleObserver(
                                currentEvent.id,
                                selectedHeatForObserver,
                                round,
                                index,
                                skipper.name,
                                skipper.sailNo,
                                timesServed
                              );

                              if (success) {
                                const updatedObservers = await getObserverAssignments(
                                  currentEvent.id,
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
                          if (!currentEvent?.id || !customObserverName.trim()) return;

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
                            currentEvent.id,
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
    </div>
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
