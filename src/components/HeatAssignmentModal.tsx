import React, { useState, useEffect } from 'react';
import { X, Users, Shuffle, Edit3, Check, RefreshCw, Eye, UserPlus } from 'lucide-react';
import { Skipper } from '../types';
import { HeatManagement, HeatDesignation, getHeatColorClasses, HeatAssignment, generateNextRoundAssignments } from '../types/heat';
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
  onUpdateAssignments?: (assignments: HeatAssignment[]) => void;
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

  // Observer state - store per heat
  const [observersByHeat, setObserversByHeat] = useState<Map<number, ObserverAssignment[]>>(new Map());
  const [loadingObservers, setLoadingObservers] = useState(false);
  const [showObserverSelector, setShowObserverSelector] = useState(false);
  const [selectedHeatForObserver, setSelectedHeatForObserver] = useState<number>(1);

  // Reset edit state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setEditMode(false);
      setModifiedPromotions(new Set());
      setModifiedRelegations(new Set());
      setAppliedPromotions(new Set());
      setAppliedRelegations(new Set());
      setHasAppliedChanges(false);
    }
  }, [isOpen]);

  // Load and select observers when modal opens
  useEffect(() => {
    const loadObservers = async () => {
      console.log('🔍 HeatAssignmentModal - Checking observer conditions:', {
        isOpen,
        hasEventId: !!currentEvent?.id,
        enable_observers: currentEvent?.enable_observers,
        observers_per_heat: currentEvent?.observers_per_heat,
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

      console.log('✅ Loading observers for round', heatManagement.currentRound);
      console.log('   Current round data:', heatManagement.rounds.find(r => r.round === heatManagement.currentRound));
      setLoadingObservers(true);
      try {
        const { currentRound, rounds } = heatManagement;
        const currentRoundData = rounds.find(r => r.round === currentRound);

        if (!currentRoundData) {
          console.warn('⚠️ No round data found for round', currentRound);
          setObserversByHeat(new Map());
          return;
        }

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

        // Check which heats are completed to determine observer assignment
        // Heats complete from bottom to top (B -> A for 2 heats, C -> B -> A for 3 heats)
        const heatCompletionStatus = sortedHeats.map((heat, idx) => {
          const heatResults = results.filter(r => r.heatDesignation === heat.heatDesignation);
          const isCompleted = heat.skipperIndices.length > 0 && heat.skipperIndices.every(skipperIdx => {
            const result = heatResults.find(r => r.skipperIndex === skipperIdx);
            return result && (result.position !== null || result.letterScore || result.markedAsUP);
          });
          return { heatDesignation: heat.heatDesignation, heatNumber: idx + 1, isCompleted };
        });

        console.log('📊 Heat completion status:', heatCompletionStatus);

        // Determine which heat should have observers (the first uncompleted heat from bottom to top)
        // Reverse to check from bottom (last) to top (first)
        const nextHeatToScore = [...heatCompletionStatus].reverse().find(h => !h.isCompleted);
        const lastCompletedHeat = [...heatCompletionStatus].reverse().find(h => h.isCompleted);
        console.log('🎯 Next heat to score:', nextHeatToScore?.heatDesignation || 'All heats completed');
        console.log('🏁 Last completed heat:', lastCompletedHeat?.heatDesignation || 'None');

        // Process each heat separately
        for (let i = 0; i < sortedHeats.length; i++) {
          const heat = sortedHeats[i];
          const heatNumber = i + 1; // Heat 1 = Heat A, Heat 2 = Heat B, etc.

          console.log(`\n🔍 Heat ${heat.heatDesignation} (heat ${heatNumber}):`);

          // Assign observers to:
          // 1. The next heat that needs scoring
          // 2. The last completed heat (to show previous observers)
          const isNextHeatToScore = nextHeatToScore && nextHeatToScore.heatNumber === heatNumber;
          const isLastCompletedHeat = lastCompletedHeat && lastCompletedHeat.heatNumber === heatNumber;

          if (!isNextHeatToScore && !isLastCompletedHeat) {
            console.log(`  ⏭️ Skipping observer assignment - this heat is ${heatCompletionStatus[i].isCompleted ? 'already completed' : 'not relevant'}`);
            continue;
          }

          if (isLastCompletedHeat) {
            console.log(`  ✅ This is the last completed heat - loading previous observers`);
          }

          console.log(`  ✅ This is the next heat to score - assigning observers`);

          // Check if we already have observers for this heat
          const existingObservers = await getObserverAssignments(
            currentEvent.id,
            heatNumber,
            currentRound
          );

          // Validate existing observers:
          // 1. Count must match expected
          // 2. None of the observers can be racing in THIS heat
          console.log(`  📋 Checking existing observers:`, existingObservers?.length || 0);
          if (existingObservers && existingObservers.length > 0) {
            console.log(`     Existing observer indices:`, existingObservers.map(o => o.skipper_index));
            console.log(`     Racing skipper indices:`, heat.skipperIndices);
          }

          const observersRacingInHeat = existingObservers?.filter(obs => {
            const isRacing = heat.skipperIndices.includes(obs.skipper_index);
            if (isRacing) {
              console.log(`     ❌ Observer ${obs.skipper_name} (index ${obs.skipper_index}) is RACING in this heat!`);
            }
            return isRacing;
          }) || [];

          // Also check if ALL observers are still available (not promoted/relegated)
          const observersStillInHeat = existingObservers?.filter(obs => {
            const skipperStillExists = skippers.some(s => s && s.index === obs.skipper_index);
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
            console.log(`  ✅ Using existing ${existingObservers.length} observers:`, existingObservers.map(o => `${o.skipper_name} (${o.skipper_index})`));
            newObserversByHeat.set(heatNumber, existingObservers);
          } else {
            if (existingObservers && existingObservers.length > 0) {
              if (existingObservers.length !== observersPerHeat) {
                console.warn(`  ⚠️ Found ${existingObservers.length} existing observers but expected ${observersPerHeat}, will re-select`);
              }
              if (observersRacingInHeat.length > 0) {
                console.warn(`  ⚠️ Found ${observersRacingInHeat.length} observers racing in this heat, will re-select:`,
                  observersRacingInHeat.map(o => `${o.skipper_name} (index ${o.skipper_index})`));
              }
              if (observersStillInHeat.length !== existingObservers.length) {
                console.warn(`  ⚠️ ${existingObservers.length - observersStillInHeat.length} observer(s) no longer exist, will re-select`);
              }
            }
            console.log(`  🔄 Re-selecting observers for this heat`);
            console.log('  🏁 Skippers racing in this heat:', heat.skipperIndices);

            // Select observers from skippers NOT racing in THIS specific heat
            const observersForThisHeat = await selectObservers(
              currentEvent.id,
              heatNumber,
              currentRound,
              heat.skipperIndices, // Only exclude skippers in THIS heat
              skippers,
              observersPerHeat
            );

            console.log(`  ✅ Selected ${observersForThisHeat.length} observers:`, observersForThisHeat);

            // Save observers for this specific heat
            if (observersForThisHeat.length > 0) {
              await saveObserverAssignments(
                currentEvent.id,
                heatNumber,
                currentRound,
                observersForThisHeat
              );
              newObserversByHeat.set(heatNumber, observersForThisHeat);
            }
          }
        }

        console.log('\n📊 Loaded observers for', newObserversByHeat.size, 'heats');
        console.log('   Observer details:', Array.from(newObserversByHeat.entries()).map(([heat, obs]) =>
          `Heat ${heat}: ${obs.map(o => `${o.skipper_name} (${o.skipper_index})`).join(', ')}`
        ).join('\n   '));
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
  }, [isOpen, currentEvent?.id, currentEvent?.enable_observers, currentEvent?.observers_per_heat, heatManagement.currentRound, skippers]);

  if (!isOpen) return null;

  const { currentRound, rounds, configuration } = heatManagement;
  const promotionCount = configuration.promotionCount;

  // If a round was just completed, show that completed round with its results
  // Otherwise, find the next uncompleted round to score
  const roundJustCompleted = heatManagement.roundJustCompleted;
  let roundToDisplay;

  if (roundJustCompleted) {
    // Show the round that was just completed (with results)
    roundToDisplay = rounds.find(r => r.round === roundJustCompleted);
  } else {
    // Show the next uncompleted round, or current round
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

  // Sort heat assignments alphabetically (A, B, C, etc.) for consistent display
  heatAssignments = [...heatAssignments].sort((a, b) =>
    a.heatDesignation.localeCompare(b.heatDesignation)
  );

  // Find the next round (if current round is complete)
  const nextRound = completed ? rounds.find(r => r.round === round + 1) : null;

  console.log('HeatAssignmentModal Debug:', {
    round,
    completed,
    roundJustCompleted,
    nextRound: nextRound ? `Round ${nextRound.round}` : 'null',
    totalRounds: rounds.length,
    allRounds: rounds.map(r => ({ round: r.round, completed: r.completed }))
  });

  // Get vibrant gradient colors for each heat
  const getHeatGradient = (heat: HeatDesignation): string => {
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div
        className={`w-full max-w-7xl max-h-[90vh] rounded-lg shadow-2xl overflow-hidden flex flex-col ${
          darkMode ? 'bg-slate-800 text-white' : 'bg-white text-slate-900'
        }`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${
          darkMode ? 'border-slate-700' : 'border-slate-200'
        }`}>
          <div className="flex items-center gap-3">
            <Users className="text-blue-400" size={28} />
            <div>
              <h2 className="text-2xl font-bold">
                Round {round} {completed ? 'Heat Results' : 'Heat Assignments'}
              </h2>
              <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                {completed ? 'Round Complete' : 'Current Round'} • {heatAssignments.length} heats
                {editMode && <span className="ml-2 text-amber-500 font-semibold">• Edit Mode</span>}
                {!editMode && hasAppliedChanges && <span className="ml-2 text-green-500 font-semibold">• Changes Applied</span>}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              // Same logic as main button - if round completed, advance to next
              if (!isInitialAllocation && onStartRound && completed && nextRound) {
                console.log('X button - Starting next round:', nextRound.round);
                onStartRound(nextRound.round);
              }
              onClose();
            }}
            className={`p-2 rounded-lg transition-colors ${
              darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100'
            }`}
          >
            <X size={24} />
          </button>
        </div>

        {/* Heat Grid */}
        <div className="p-6 overflow-y-auto flex-1">
          <div className="grid gap-4" style={{
            gridTemplateColumns: `repeat(${Math.min(heatAssignments.length, 6)}, minmax(200px, 1fr))`
          }}>
            {/* Find the last completed heat (for edit mode) */}
            {/* Heats complete from bottom to top (C → B → A), so the "last" completed is the HIGHEST one */}
            {(() => {
              let lastCompletedHeatLetter = null;

              // Go through heats from TOP to BOTTOM (A, B, C) to find the first complete heat
              // This gives us the most recently completed heat in the progression
              for (let i = 0; i < heatAssignments.length; i++) {
                const assignment = heatAssignments[i];
                const heatResults = results.filter(r => r.heatDesignation === assignment.heatDesignation);
                const isComplete = heatResults.length > 0 && heatResults.every(r =>
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

              // Check if this heat is completed (has results)
              const heatCompleted = heatResults.length > 0 && heatResults.every(r =>
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
                  // For not-yet-completed heats in edit mode, FILTER OUT promoted skippers from below
                  const heatIndex = ['A', 'B', 'C', 'D', 'E', 'F'].indexOf(heatDesignation);
                  const lowerHeatLetter = ['A', 'B', 'C', 'D', 'E', 'F'][heatIndex + 1] as HeatDesignation;

                  if (lowerHeatLetter && lastCompletedHeatLetter === lowerHeatLetter) {
                    // This heat receives promotions from the last completed heat
                    // Filter out those promoted skippers
                    const lowerHeatResults = results.filter(r => r.heatDesignation === lowerHeatLetter);
                    const promotedSkipperIndices = lowerHeatResults
                      .filter(r => r.position !== null && r.position <= promotionCount && !r.letterScore)
                      .map(r => r.skipperIndex);

                    skippersToDisplay = skipperIndices.filter(idx => !promotedSkipperIndices.includes(idx));
                  } else {
                    skippersToDisplay = skipperIndices;
                  }
                }
              } else {
                // Normal mode: show completed heats' results or assignments
                skippersToDisplay = heatCompleted && skippersWhoSailed.length > 0
                  ? skippersWhoSailed
                  : skipperIndices;

                // After applying changes, add manually promoted skippers ONLY to the heat directly above the last completed heat
                // This prevents re-applying historical promotions from previous rounds
                if (hasAppliedChanges && !editMode && lastCompletedHeatLetter) {
                  const heatIndex = ['A', 'B', 'C', 'D', 'E', 'F'].indexOf(heatDesignation);
                  const lowerHeatLetter = ['A', 'B', 'C', 'D', 'E', 'F'][heatIndex + 1] as HeatDesignation;

                  // Only apply promotions if this heat is DIRECTLY above the last completed heat
                  if (lowerHeatLetter === lastCompletedHeatLetter) {
                    const lowerHeatResults = results.filter(r => r.heatDesignation === lowerHeatLetter);
                    const promotedFromBelow: number[] = [];
                    const allPotentiallyPromoted: number[] = lowerHeatResults.map(r => r.skipperIndex);

                    // Calculate which skippers should be promoted based on current appliedPromotions
                    lowerHeatResults.forEach(result => {
                      if (!result.position) return;

                      const skipperIndex = result.skipperIndex;
                      const naturallyPromoted = result.position <= promotionCount;
                      const manuallyToggled = appliedPromotions.has(skipperIndex);

                      // If naturally NOT promoted but manually toggled ON, or naturally promoted and NOT toggled OFF
                      const shouldBePromoted = naturallyPromoted ? !manuallyToggled : manuallyToggled;

                      if (shouldBePromoted) {
                        promotedFromBelow.push(skipperIndex);
                      }
                    });

                    // First, remove ALL potentially promoted skippers from the display (to handle toggles OFF)
                    skippersToDisplay = skippersToDisplay.filter(idx => !allPotentiallyPromoted.includes(idx));

                    // Then, add back ONLY the skippers who should currently be promoted
                    promotedFromBelow.forEach(skipperIdx => {
                      if (!skippersToDisplay.includes(skipperIdx)) {
                        skippersToDisplay.push(skipperIdx);
                      }
                    });
                  }
                }
              }

              // Sort skippers by their result position if available
              const sortedSkippers = [...skippersToDisplay].sort((a, b) => {
                const resultA = heatResults.find(r => r.skipperIndex === a);
                const resultB = heatResults.find(r => r.skipperIndex === b);

                if (!resultA || !resultB) return 0;

                // Position-based sorting
                const posA = resultA.position !== null ? resultA.position : 9999;
                const posB = resultB.position !== null ? resultB.position : 9999;

                return posA - posB;
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

              return (
                <div
                  key={heatDesignation}
                  className={`rounded-lg border-2 overflow-hidden flex flex-col ${
                    darkMode ? 'bg-slate-700 border-slate-600' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  {/* Heat Header */}
                  <div className={`p-3 ${getHeatGradient(heatDesignation)} border-b-2`}>
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-bold text-white">
                        Heat {heatDesignation}
                      </h3>
                      {heatCompleted && (
                        <span className="text-xs font-semibold px-2 py-1 rounded bg-green-500 text-white">
                          Complete
                        </span>
                      )}
                    </div>
                    <p className="text-xs mt-1 text-white opacity-90">
                      {skippersToDisplay.length} skippers
                      {/* Round 2+: Show P slots if this heat hasn't been scored yet (and not bottom heat) */}
                      {!completed && round >= 2 && !isBottomHeat && !heatCompleted && (
                        <span className="ml-1 opacity-75">+ {promotionCount} P slots</span>
                      )}
                    </p>
                  </div>

                  {/* Skipper List - 2 Column Grid - Flex-1 to push observers to bottom */}
                  <div className="flex-1 p-3 grid grid-cols-2 gap-2 content-start">
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

                      // Check if this skipper was promoted FROM the heat below
                      // - For active rounds: check if naturally promoted from below
                      // - After applying changes: check if manually promoted from below (only for heat directly above last completed)
                      if (!editMode && round >= 2 && !isBottomHeat && lowerHeatLetter) {
                        const lowerHeatResults = results.filter(r => r.heatDesignation === lowerHeatLetter);

                        if (hasAppliedChanges && lowerHeatLetter === lastCompletedHeatLetter) {
                          // After applying changes: ONLY show promotions from the last completed heat
                          const lowerHeatResult = lowerHeatResults.find(r => r.skipperIndex === skipperIndex);
                          if (lowerHeatResult && lowerHeatResult.position) {
                            const naturallyPromoted = lowerHeatResult.position <= promotionCount;
                            const manuallyToggled = appliedPromotions.has(skipperIndex);
                            wasPromotedFromBelow = naturallyPromoted ? !manuallyToggled : manuallyToggled;
                          }
                        } else if (!completed && !hasAppliedChanges && lowerHeatCompleted) {
                          // Active rounds (before any manual changes): check natural promotions
                          wasPromotedFromBelow = lowerHeatResults.some(r =>
                            r.skipperIndex === skipperIndex &&
                            r.position !== null &&
                            r.position <= promotionCount &&
                            !r.letterScore
                          );
                        }

                        if (wasPromotedFromBelow) {
                          isPromoted = true; // Mark as promoted so the green border shows
                        }
                      }

                      // Skip promotion/relegation logic for SHRS
                      if (!isSHRS) {
                      if (completed && result?.position) {
                        // For completed rounds (showing results), only show promotions, not relegations
                        // ROUND 1 (Initial Seeding) - NO promotion/relegation badges
                        if (round === 1) {
                          isPromoted = false;
                          isRelegated = false;
                        }
                        // ROUND 2+ - Only show promotions (not relegations)
                        else {
                          if (isBottomHeat) {
                            // Bottom heat: Only top skippers are promoted (go up)
                            isPromoted = result.position <= promotionCount;
                          } else if (!isTopHeat) {
                            // Middle heats: Only show top promoted (go up), no relegations
                            isPromoted = result.position <= promotionCount;
                          }
                          // Top heat: No promotion indicators (they're already at the top)
                          // And no relegation indicators for completed rounds
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

                      // Apply manual overrides ONLY in edit mode (HMS only)
                      // After applying changes, promotions are shown in the destination heat via wasPromotedFromBelow
                      if (!isSHRS && editMode) {
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

                      return (
                        <div
                          key={skipperIndex}
                          onClick={() => {
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
                              // Currently relegated - allow toggling off
                              setModifiedRelegations(prev => {
                                const newSet = new Set(prev);
                                if (newSet.has(skipperIndex)) {
                                  newSet.delete(skipperIndex);
                                } else {
                                  newSet.add(skipperIndex);
                                }
                                return newSet;
                              });
                            } else if (isPromoted && !isTopHeat) {
                              // Currently promoted - allow toggling off
                              setModifiedPromotions(prev => {
                                const newSet = new Set(prev);
                                if (newSet.has(skipperIndex)) {
                                  newSet.delete(skipperIndex);
                                } else {
                                  newSet.add(skipperIndex);
                                }
                                return newSet;
                              });
                            } else if (isInNaturalRelegationZone && !isBottomHeat) {
                              // In relegation zone - toggle relegation
                              setModifiedRelegations(prev => {
                                const newSet = new Set(prev);
                                if (newSet.has(skipperIndex)) {
                                  newSet.delete(skipperIndex);
                                } else {
                                  newSet.add(skipperIndex);
                                }
                                return newSet;
                              });
                            } else if (!isTopHeat) {
                              // Default: toggle promotion for heats that can promote
                              setModifiedPromotions(prev => {
                                const newSet = new Set(prev);
                                if (newSet.has(skipperIndex)) {
                                  newSet.delete(skipperIndex);
                                } else {
                                  newSet.add(skipperIndex);
                                }
                                return newSet;
                              });
                            }
                          }}
                          className={`p-2 rounded border-2 transition-all ${
                            isClickableInEditMode ? 'cursor-pointer hover:shadow-lg hover:scale-105' : ''
                          } ${
                            isPromoted
                              ? 'bg-green-50 border-green-400 dark:bg-green-900/20 dark:border-green-500'
                              : isRelegated
                              ? 'bg-red-50 border-red-400 dark:bg-red-900/20 dark:border-red-500'
                              : darkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {result && result.position !== null && (
                              <span className={`
                                flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                                ${result.position === 1 ? 'bg-yellow-500 text-yellow-900' :
                                  result.position === 2 ? 'bg-slate-300 text-slate-900' :
                                  result.position === 3 ? 'bg-amber-600 text-white' :
                                  darkMode ? 'bg-slate-600 text-white' : 'bg-slate-200 text-slate-900'}
                              `}>
                                {result.position}
                              </span>
                            )}
                            {/* Flag (if event shows flag) */}
                            {currentEvent?.show_flag && skipper.country_code && (
                              <div className="flex-shrink-0 text-2xl">
                                {getCountryFlag(skipper.country_code)}
                              </div>
                            )}
                            {skipper.avatarUrl ? (
                              <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
                                <img
                                  src={skipper.avatarUrl}
                                  alt={skipper.name}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            ) : (
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                                darkMode ? 'bg-slate-600 text-slate-300' : 'bg-slate-300 text-slate-700'
                              }`}>
                                {skipper.name.split(' ').map(n => n[0]).join('')}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className={`font-medium truncate text-sm ${
                                darkMode ? 'text-white' : 'text-slate-900'
                              }`}>
                                {skipper.name}
                              </p>
                              <p className={`text-xs truncate ${
                                darkMode ? 'text-slate-400' : 'text-slate-600'
                              }`}>
                                {skipper.boatModel} - #
                                {currentEvent?.show_country && skipper.country_code && (
                                  <span className="font-bold mr-1">
                                    {getIOCCode(skipper.country_code)}
                                  </span>
                                )}
                                {skipper.sailNo}
                              </p>
                              {isPromoted && (
                                <p className="text-xs font-semibold text-green-600 dark:text-green-400 mt-0.5">
                                  {wasPromotedFromBelow ? `↑ From Heat ${lowerHeatLetter}` : '↑ Promoted'}
                                </p>
                              )}
                              {isRelegated && (
                                <p className="text-xs font-semibold text-red-600 dark:text-red-400 mt-0.5">
                                  ↓ Relegate
                                </p>
                              )}
                            </div>
                            {result && result.letterScore && (
                              <span className="flex-shrink-0 text-xs font-semibold px-1.5 py-0.5 rounded bg-red-500 text-white">
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
                        Once lower heat is completed OR changes are applied, promoted skippers are shown in their positions above with green borders */}
                    {!completed && !heatCompleted && round >= 2 && !isBottomHeat && !lowerHeatCompleted && !hasAppliedChanges && (
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
                      <div className={`mt-auto border-t ${
                        darkMode ? 'border-slate-600' : 'border-slate-200'
                      }`}>
                        <div className={`p-3 ${
                          darkMode ? 'bg-slate-700' : 'bg-slate-50'
                        }`}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Eye size={16} className={isPreviousHeatObservers ? 'text-slate-400' : 'text-purple-400'} />
                              <h5 className={`text-sm font-semibold ${
                                isPreviousHeatObservers
                                  ? (darkMode ? 'text-slate-300' : 'text-slate-700')
                                  : (darkMode ? 'text-purple-300' : 'text-purple-700')
                              }`}>
                                {isPreviousHeatObservers ? 'Previous Observers' : 'Observers'} ({heatObservers.length})
                              </h5>
                            </div>
                            {!isPreviousHeatObservers && (
                              <button
                                onClick={() => {
                                  setSelectedHeatForObserver(heatNumber);
                                  setShowObserverSelector(true);
                                }}
                                className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-all ${
                                  darkMode
                                    ? 'bg-purple-700 text-purple-200 hover:bg-purple-600'
                                    : 'bg-purple-600 text-white hover:bg-purple-700'
                                }`}
                                title="Add observer"
                              >
                                <UserPlus size={12} />
                                <span>Add</span>
                              </button>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {heatObservers.map((observer, idx) => {
                              const observerSkipper = skippers[observer.skipper_index];
                              if (!observerSkipper) return null;

                              // Style previous observers like regular skipper cards, active observers with purple
                              if (isPreviousHeatObservers) {
                                // Previous observers - styled like regular skipper cards (no purple, not clickable)
                                return (
                                  <div
                                    key={observer.skipper_index}
                                    className={`flex items-center gap-2 p-2 rounded border-2 ${
                                      darkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-slate-200'
                                    }`}
                                  >
                                    <Eye size={14} className={`${darkMode ? 'text-slate-500' : 'text-slate-400'} flex-shrink-0`} />
                                    {observerSkipper.avatarUrl ? (
                                      <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0">
                                        <img
                                          src={observerSkipper.avatarUrl}
                                          alt={observerSkipper.name}
                                          className="w-full h-full object-cover"
                                        />
                                      </div>
                                    ) : (
                                      <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                                        darkMode ? 'bg-slate-600 text-slate-300' : 'bg-slate-300 text-slate-700'
                                      }`}>
                                        {observerSkipper.name.split(' ').map(n => n[0]).join('')}
                                      </div>
                                    )}
                                    <span className={`font-medium truncate flex-1 text-xs ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                                      {observerSkipper.name}
                                    </span>
                                    <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                      #{observerSkipper.sailNo}
                                    </span>
                                  </div>
                                );
                              }

                              // Active observers - purple styling, clickable to remove
                              return (
                                <button
                                  key={observer.skipper_index}
                                  onClick={async () => {
                                    if (!currentEvent?.id) return;

                                    // Toggle observer status (remove this observer)
                                    const success = await toggleObserver(
                                      currentEvent.id,
                                      heatNumber,
                                      heatManagement.currentRound,
                                      observer.skipper_index,
                                      observerSkipper.name,
                                      observerSkipper.sailNo,
                                      observer.times_served
                                    );

                                    if (success) {
                                      // Reload observers
                                      const updatedObservers = await getObserverAssignments(
                                        currentEvent.id,
                                        heatNumber,
                                        heatManagement.currentRound
                                      );

                                      // Update state
                                      setObserversByHeat(prev => {
                                        const newMap = new Map(prev);
                                        newMap.set(heatNumber, updatedObservers || []);
                                        return newMap;
                                      });
                                    }
                                  }}
                                  title="Click to remove this observer"
                                  className={`flex items-center gap-2 p-2 rounded text-xs transition-all hover:scale-[1.02] cursor-pointer ${
                                    darkMode
                                      ? 'bg-purple-900/30 text-purple-200 border border-purple-700/50 hover:bg-purple-900/50 hover:border-purple-600'
                                      : 'bg-purple-50 text-purple-900 border border-purple-200 hover:bg-purple-100 hover:border-purple-300'
                                  }`}
                                >
                                  <Eye size={14} className="text-purple-400 flex-shrink-0" />
                                  <span className="font-medium truncate flex-1 text-left">
                                    {observerSkipper.name}
                                  </span>
                                  <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
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

          {/* Info footer */}
          <div className={`mt-6 p-4 rounded-lg border ${
            darkMode ? 'bg-slate-700 border-slate-600' : 'bg-blue-50 border-blue-200'
          }`}>
            <div className="flex items-start gap-3">
              <Users className={darkMode ? 'text-blue-400' : 'text-blue-600'} size={20} />
              <div>
                <p className={`text-sm font-medium ${
                  darkMode ? 'text-white' : 'text-slate-900'
                }`}>
                  {editMode
                    ? `Click any skipper in Heat ${(window as any).__lastCompletedHeat} to toggle promotion/relegation. Promoted skippers (green) move up to the next heat.`
                    : completed
                    ? 'This round is complete. Green cards show skippers who will be promoted to the next heat in the following round.'
                    : 'Skippers are assigned to heats for this round. Close this modal to begin scoring.'
                  }
                </p>
                {!completed && round > 1 && (
                  <p className={`text-xs mt-1 ${
                    darkMode ? 'text-slate-400' : 'text-slate-600'
                  }`}>
                    Heat assignments are based on previous round performance.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={`flex ${isInitialAllocation || (round >= 2 && !completed) ? 'justify-between' : editMode ? 'justify-between' : 'justify-end'} gap-3 p-6 border-t flex-shrink-0 ${
          darkMode ? 'border-slate-700' : 'border-slate-200'
        }`}>
          {/* Show reshuffle/manual assign buttons only for initial Round 1 allocation */}
          {isInitialAllocation && (onReshuffle || onManualAssign) && (
            <div className="flex gap-3">
              {onReshuffle && (
                <button
                  onClick={() => {
                    onReshuffle();
                    onClose();
                  }}
                  className={`flex items-center gap-2 px-6 py-2 rounded-lg transition-colors font-medium ${
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
                  className={`flex items-center gap-2 px-6 py-2 rounded-lg transition-colors font-medium ${
                    darkMode
                      ? 'bg-teal-600 text-white hover:bg-teal-700'
                      : 'bg-teal-500 text-white hover:bg-teal-600'
                  }`}
                >
                  <Edit3 size={18} />
                  Manual Assign
                </button>
              )}
            </div>
          )}


          {/* Edit mode controls for completed rounds or mid-round (when at least one heat complete) */}
          {/* Allow manual override of promotions/relegations */}
          {!isInitialAllocation && (completed || round >= 2) && (
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
                  className={`flex items-center gap-2 px-6 py-2 rounded-lg transition-colors font-medium ${
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
                    className={`px-6 py-2 rounded-lg transition-colors font-medium ${
                      darkMode
                        ? 'text-slate-300 hover:bg-slate-700'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      // Apply modifications to next round's heat assignments
                      if (onUpdateAssignments && roundToDisplay && nextRound) {
                        const updatedAssignments = applyManualOverrides(
                          roundToDisplay,
                          modifiedPromotions,
                          modifiedRelegations,
                          promotionCount,
                          heatAssignments,
                          configuration.numberOfHeats
                        );
                        onUpdateAssignments(updatedAssignments);
                      }

                      // Save the applied changes to show them visually
                      setAppliedPromotions(new Set(modifiedPromotions));
                      setAppliedRelegations(new Set(modifiedRelegations));
                      setHasAppliedChanges(true);

                      // Exit edit mode but keep the modifications visible
                      setEditMode(false);
                      setModifiedPromotions(new Set());
                      setModifiedRelegations(new Set());
                    }}
                    className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                  >
                    <Check size={18} />
                    Apply Changes
                  </button>
                </>
              )}
            </div>
          )}

          <button
            onClick={() => {
              if (!isInitialAllocation) {
                if (completed && nextRound) {
                  // Advancing to next round after completing current round
                  // Use onAdvanceToNextRound if available - this keeps modal open to show new round allocations
                  console.log('Advancing to next round:', nextRound.round);
                  if (onAdvanceToNextRound) {
                    onAdvanceToNextRound(nextRound.round);
                    // Don't close - modal will update to show new round allocations
                    return;
                  } else if (onStartRound) {
                    // Fallback to old behavior
                    onStartRound(nextRound.round);
                  }
                } else if (!completed && roundToDisplay && onStartRound) {
                  // Start scoring the current round
                  console.log('Starting current round:', roundToDisplay.round);
                  onStartRound(roundToDisplay.round);
                }
              }
              onClose();
            }}
            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
          >
            {completed && nextRound ? `Next Round (Round ${nextRound.round})` : completed ? 'Close' : isInitialAllocation ? 'Accept & Start Scoring' : 'Start Scoring'}
          </button>
        </div>
      </div>

      {/* Observer Selector Modal */}
      {showObserverSelector && currentEvent && (() => {
        // Get current round data
        const currentRoundData = heatManagement.rounds.find(r => r.round === heatManagement.currentRound);
        if (!currentRoundData) return null;

        // Get the heat assignment for the selected heat
        const sortedHeats = [...currentRoundData.heatAssignments].sort((a, b) =>
          a.heatDesignation.localeCompare(b.heatDesignation)
        );
        const selectedHeat = sortedHeats[selectedHeatForObserver - 1];
        if (!selectedHeat) return null;

        // Get current observers for this heat
        const currentObservers = observersByHeat.get(selectedHeatForObserver) || [];
        const currentObserverIndices = currentObservers.map(o => o.skipper_index);

        // Get available skippers (not racing in this heat and not already observers)
        const availableSkippers = skippers
          .map((s, idx) => ({ skipper: s, index: idx }))
          .filter(({ index }) =>
            !selectedHeat.skipperIndices.includes(index) && !currentObserverIndices.includes(index)
          );

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
                <h3 className="text-lg font-bold">Add Observer to Heat {selectedHeat.heatDesignation}</h3>
                <button
                  onClick={() => setShowObserverSelector(false)}
                  className={`p-1 rounded-lg transition-colors ${
                    darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100'
                  }`}
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                <p className={`text-sm mb-4 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Select a skipper to add as an observer. Only skippers not racing in Heat {selectedHeat.heatDesignation} are shown.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {availableSkippers.map(({ skipper, index }) => (
                    <button
                      key={index}
                      onClick={async () => {
                        if (!currentEvent?.id) return;

                        // Get times served for this skipper
                        const { data: existingObserver } = await supabase
                          .from('heat_observers')
                          .select('times_served')
                          .eq('event_id', currentEvent.id)
                          .eq('skipper_index', index)
                          .order('times_served', { ascending: false })
                          .limit(1)
                          .maybeSingle();

                        const timesServed = existingObserver?.times_served || 0;

                        // Add this skipper as an observer
                        const success = await toggleObserver(
                          currentEvent.id,
                          selectedHeatForObserver,
                          heatManagement.currentRound,
                          index,
                          skipper.name,
                          skipper.sailNo,
                          timesServed
                        );

                        if (success) {
                          // Reload observers
                          const updatedObservers = await getObserverAssignments(
                            currentEvent.id,
                            selectedHeatForObserver,
                            heatManagement.currentRound
                          );

                          // Update state
                          setObserversByHeat(prev => {
                            const newMap = new Map(prev);
                            newMap.set(selectedHeatForObserver, updatedObservers || []);
                            return newMap;
                          });

                          // Close modal
                          setShowObserverSelector(false);
                        }
                      }}
                      className={`flex items-center gap-2 p-3 rounded-lg border-2 transition-all hover:scale-[1.02] ${
                        darkMode
                          ? 'bg-slate-700 border-slate-600 hover:border-purple-500'
                          : 'bg-white border-slate-200 hover:border-purple-500'
                      }`}
                    >
                      {skipper.avatarUrl ? (
                        <img
                          src={skipper.avatarUrl}
                          alt={skipper.name}
                          className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                          darkMode ? 'bg-slate-600 text-slate-300' : 'bg-slate-300 text-slate-700'
                        }`}>
                          {skipper.name.split(' ').map(n => n[0]).join('')}
                        </div>
                      )}
                      <div className="flex-1 min-w-0 text-left">
                        <p className={`font-medium truncate text-sm ${
                          darkMode ? 'text-white' : 'text-slate-900'
                        }`}>
                          {skipper.name}
                        </p>
                        <p className={`text-xs truncate ${
                          darkMode ? 'text-slate-400' : 'text-slate-600'
                        }`}>
                          #{skipper.sailNo}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
                {availableSkippers.length === 0 && (
                  <p className={`text-center py-8 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    No skippers available to add as observers.
                  </p>
                )}
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
  // Start with the original assignments for the NEXT round
  const heats = (['A', 'B', 'C', 'D', 'E', 'F'] as HeatDesignation[]).slice(0, numberOfHeats);

  // Build the next round assignments based on current round results
  const nextRoundAssignments: HeatAssignment[] = heats.map(heat => ({
    heatDesignation: heat,
    skipperIndices: []
  }));

  // Build a map of current results
  const skipperResults = new Map<number, { heat: HeatDesignation; position: number }>();
  round.results.forEach((r: any) => {
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

    // Determine target heat for next round
    let targetHeatIdx = currentHeatIdx;

    if (shouldPromote && !isTopHeat) {
      targetHeatIdx = round.round === 1 ? 0 : currentHeatIdx - 1; // R1: all promote to Heat A, R2+: to next higher
    } else if (shouldRelegate && !isBottomHeat) {
      targetHeatIdx = currentHeatIdx + 1;
    }

    // Add to target heat
    nextRoundAssignments[targetHeatIdx].skipperIndices.push(skipperIndex);
  });

  console.log('Manual overrides applied:', {
    promotions: Array.from(modifiedPromotions),
    relegations: Array.from(modifiedRelegations),
    nextRoundAssignments: nextRoundAssignments.map(ha => ({
      heat: ha.heatDesignation,
      count: ha.skipperIndices.length,
      skippers: ha.skipperIndices
    }))
  });

  return nextRoundAssignments;
}
