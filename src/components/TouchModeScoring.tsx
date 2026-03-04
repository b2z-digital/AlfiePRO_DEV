import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, MoreHorizontal, X, GripVertical, Check, Users, Award, Eye, Timer } from 'lucide-react';
import { Skipper, RaceResult } from '../types';
import { RaceEvent } from '../types/race';
import { LetterScoreSelector } from './LetterScoreSelector';
import type { LetterScore } from '../types/letterScores';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../utils/supabase';
import { PostRaceHandicapModal } from './touch-mode/PostRaceHandicapModal';
import { FloatingHandicapViewer } from './touch-mode/FloatingHandicapViewer';
import { HandicapChangeBadge } from './touch-mode/HandicapChangeBadge';
import { HandicapProgressionModal } from './touch-mode/HandicapProgressionModal';
import { getCountryFlag, getIOCCode } from '../utils/countryFlags';
import type { ObserverAssignment } from '../utils/observerUtils';
import { StartBoxModal } from './start-box/StartBoxModal';
import { RaceElapsedTimer } from './start-box/RaceElapsedTimer';
import { LiveStatusControl } from './LiveStatusControl';

interface TouchModeScoringProps {
  skippers: Skipper[];
  currentRace: number;
  numRaces: number;
  raceResults: RaceResult[];
  updateRaceResults: (results: RaceResult[]) => void;
  darkMode: boolean;
  onRaceChange?: (newRace: number) => void;
  dropRules?: number[] | string;
  currentEvent?: RaceEvent | null;
  isHeatScoring?: boolean;
  isScoringLastHeat?: boolean; // True when all other heats are complete and this is the last one
  onConfirmResults?: () => void; // Called when user confirms the finish order
  updateSkipper?: (skipperIndex: number, updates: Partial<Skipper>) => void;
  heatObservers?: ObserverAssignment[];
  roundLabel?: string;
  allSkippers?: Skipper[];
  allRaceResults?: RaceResult[];
  isFullscreen?: boolean;
}

interface FinishingEntry {
  skipperIndex: number;
  sailNumber: string;
  skipperName: string;
  position: number;
  letterScore?: string | null;
  customPoints?: number;
}

export const TouchModeScoring: React.FC<TouchModeScoringProps> = ({
  skippers,
  currentRace: initialRace,
  numRaces,
  raceResults,
  updateRaceResults,
  darkMode,
  onRaceChange,
  dropRules = [],
  currentEvent,
  isHeatScoring = false,
  isScoringLastHeat = false,
  onConfirmResults,
  updateSkipper,
  heatObservers = [],
  roundLabel,
  allSkippers,
  allRaceResults,
  isFullscreen = false
}) => {
  const [currentRace, setCurrentRace] = useState(initialRace);
  const [finishOrder, setFinishOrder] = useState<FinishingEntry[]>([]);
  const [showLetterScoreModal, setShowLetterScoreModal] = useState(false);
  const [selectedSkipperForScore, setSelectedSkipperForScore] = useState<number | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [splitPosition, setSplitPosition] = useState(33); // Default 33% for left panel
  const [isDraggingDivider, setIsDraggingDivider] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false); // Track if user confirmed the finish order
  const [isLoadingPreferences, setIsLoadingPreferences] = useState(true);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [touchDragging, setTouchDragging] = useState(false);
  const [showPostRaceHandicapModal, setShowPostRaceHandicapModal] = useState(false);
  const [showProgressionModal, setShowProgressionModal] = useState(false);
  const [selectedSkipperForProgression, setSelectedSkipperForProgression] = useState<number | null>(null);
  const [isHandicapViewerOpen, setIsHandicapViewerOpen] = useState(false);
  const [showStartBoxModal, setShowStartBoxModal] = useState(false);
  const [raceTimerRunning, setRaceTimerRunning] = useState(false);

  const { user } = useAuth();

  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const longPressSkipper = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load panel width preference from user profile
  useEffect(() => {
    const loadPanelWidthPreference = async () => {
      if (!user?.id) {
        setIsLoadingPreferences(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('ui_preferences')
          .eq('id', user.id)
          .maybeSingle();

        if (!error && data?.ui_preferences) {
          const prefs = data.ui_preferences as { touchModePanelWidth?: number };
          if (prefs.touchModePanelWidth) {
            setSplitPosition(prefs.touchModePanelWidth);
          }
        }
      } catch (error) {
        console.error('Error loading panel width preference:', error);
      } finally {
        setIsLoadingPreferences(false);
      }
    };

    loadPanelWidthPreference();
  }, [user?.id]);

  // Save panel width preference when it changes (debounced)
  useEffect(() => {
    if (isLoadingPreferences || !user?.id) return;

    const saveTimeout = setTimeout(async () => {
      try {
        // Get current preferences first
        const { data: profileData } = await supabase
          .from('profiles')
          .select('ui_preferences')
          .eq('id', user.id)
          .maybeSingle();

        const currentPrefs = (profileData?.ui_preferences || {}) as Record<string, any>;

        // Update with new panel width
        await supabase
          .from('profiles')
          .update({
            ui_preferences: {
              ...currentPrefs,
              touchModePanelWidth: splitPosition
            }
          })
          .eq('id', user.id);

        console.log('💾 Saved panel width preference:', splitPosition);
      } catch (error) {
        console.error('Error saving panel width preference:', error);
      }
    }, 1000); // Debounce by 1 second

    return () => clearTimeout(saveTimeout);
  }, [splitPosition, user?.id, isLoadingPreferences]);

  // Debug: Log when heatObservers changes
  useEffect(() => {
    console.log('👀 TouchMode heatObservers updated:', {
      count: heatObservers.length,
      race: currentRace,
      observers: heatObservers.map(obs => ({
        name: obs.skipper_name,
        sailNo: obs.skipper_sail_number,
        index: obs.skipper_index,
        round: obs.round,
        heatNumber: obs.heat_number
      }))
    });
    console.log('👥 Skippers in heat:', skippers.map((s, idx) => ({
      index: idx,
      name: s.name,
      sailNo: s.sailNumber || s.sailNo
    })));

    // Warn if observers don't match expected pattern
    if (heatObservers.length > 0 && skippers.length > 0) {
      const observerSailNumbers = new Set(heatObservers.map(o => String(o.skipper_sail_number)));
      const skipperSailNumbers = skippers.map(s => String(s.sailNumber || s.sailNo));
      const observersInSkipperList = skipperSailNumbers.filter(sn => observerSailNumbers.has(sn));
      if (observersInSkipperList.length > 0) {
        console.warn('⚠️ Some observers are in the skipper list!', observersInSkipperList);
      }
    }
  }, [heatObservers, skippers, currentRace]);

  // Auto-update race status to "live" when scoring starts
  useEffect(() => {
    const autoUpdateRaceStatus = async () => {
      if (!currentEvent?.id) return;

      // Import the live tracking utilities dynamically
      const { getRaceStatus, updateRaceStatus } = await import('../utils/liveTrackingStorage');

      // Check current status
      const statusData = await getRaceStatus(currentEvent.id);
      const raceNote = (() => {
        if (!isHeatScoring) return `Race ${currentRace}`;
        const isShrsScoring = currentEvent?.heatManagement?.configuration?.scoringSystem === 'shrs';
        const shrsQR = currentEvent?.heatManagement?.configuration?.shrsQualifyingRounds || 0;
        if (isShrsScoring && shrsQR > 0) {
          return currentRace <= shrsQR ? `Qualifying Rd ${currentRace}` : `Final ${currentRace - shrsQR}`;
        }
        return `Round ${currentRace}`;
      })();

      // If status is not "live", automatically set it to "live" with race/round number
      if (statusData && statusData.status !== 'live') {
        console.log('🟢 Auto-updating race status to "live" as scoring has begun (Touch Mode)');
        await updateRaceStatus(currentEvent.id, 'live', raceNote);
      } else if (statusData && statusData.status === 'live' && statusData.notes !== raceNote) {
        // Update race/round number if it has changed
        await updateRaceStatus(currentEvent.id, 'live', raceNote);
      }
    };

    autoUpdateRaceStatus();
  }, [currentEvent?.id, currentRace, isHeatScoring]);

  // Sync local race state with parent prop changes
  useEffect(() => {
    const previousRace = currentRace;
    setCurrentRace(initialRace);
    setIsConfirmed(false);
    setRaceTimerRunning(false);

    const isAutoAdvancing = initialRace === previousRace + 1 && isHandicapViewerOpen;
    if (!isAutoAdvancing) {
      setIsHandicapViewerOpen(false);
    }
  }, [initialRace]);

  // Load existing results for current race
  useEffect(() => {
    console.log('🔄 Loading results for race:', currentRace, 'Total results:', raceResults.length);
    const currentResults = raceResults.filter(r => r.race === currentRace);
    console.log('📊 Current race results:', currentResults.length);
    const entries: FinishingEntry[] = [];
    const newWithdrawnResults: any[] = [];

    currentResults.forEach(result => {
      if (result.position !== null || result.letterScore) {
        const skipper = skippers[result.skipperIndex];
        if (skipper) {
          entries.push({
            skipperIndex: result.skipperIndex,
            sailNumber: skipper.sailNumber || skipper.sailNo,
            skipperName: skipper.name,
            position: result.position || 999,
            letterScore: result.letterScore,
            customPoints: result.customPoints
          });
        }
      }
    });

    // Add withdrawn skippers automatically and create results for them
    skippers.forEach((skipper, index) => {
      // Check if skipper is withdrawn for this race
      if (skipper.withdrawnFromRace && currentRace >= skipper.withdrawnFromRace) {
        // Check if they're not already in the entries
        const alreadyAdded = entries.some(e => e.skipperIndex === index);
        if (!alreadyAdded) {
          console.log('🚫 Auto-adding withdrawn skipper to finish order:', skipper.name, 'Race:', currentRace);

          // Add to finish order UI
          entries.push({
            skipperIndex: index,
            sailNumber: skipper.sailNumber || skipper.sailNo || '',
            skipperName: skipper.name,
            position: 999,
            letterScore: 'WDN',
            customPoints: skippers.length + 1
          });

          // Get handicap from withdrawal race or previous race
          let handicap = skipper.startHcap || 0;
          if (currentRace > skipper.withdrawnFromRace) {
            // Use handicap from previous race if available
            const prevResult = raceResults.find(r => r.race === currentRace - 1 && r.skipperIndex === index);
            if (prevResult && prevResult.adjustedHcap !== undefined) {
              handicap = prevResult.adjustedHcap;
            }
          }

          // Create race result with handicap info
          newWithdrawnResults.push({
            race: currentRace,
            skipperIndex: index,
            position: null,
            letterScore: 'WDN',
            customPoints: skippers.length + 1,
            handicap: handicap,
            adjustedHcap: handicap
          });
        }
      }
    });

    // If we added any withdrawn skippers, save their results
    if (newWithdrawnResults.length > 0) {
      console.log('💾 Auto-saving', newWithdrawnResults.length, 'withdrawn skipper results');
      const updatedResults = [...raceResults, ...newWithdrawnResults];
      updateRaceResults(updatedResults);
    }

    // Sort by position (regular finishes first, then letter scores)
    entries.sort((a, b) => {
      if (a.letterScore && !b.letterScore) return 1;
      if (!a.letterScore && b.letterScore) return -1;
      return a.position - b.position;
    });

    console.log('📋 Setting finish order with', entries.length, 'entries (including withdrawn)');
    setFinishOrder(entries);
  }, [currentRace, raceResults, skippers]);

  // Debug logging for button visibility
  useEffect(() => {
    const shouldShowButton = finishOrder.length === skippers.length && !isConfirmed;
    console.log('🔘 Confirm button visibility:', shouldShowButton, {
      finishOrderLength: finishOrder.length,
      skippersLength: skippers.length,
      observersLength: heatObservers.length,
      isConfirmed,
      currentRace
    });
  }, [finishOrder.length, skippers.length, heatObservers.length, isConfirmed, currentRace]);

  const handleSailNumberClick = (skipperIndex: number) => {
    console.log('👆 Sail number clicked:', skipperIndex, 'Sail:', skippers[skipperIndex]?.sailNumber);

    // Check if already finished
    const alreadyFinished = finishOrder.find(e => e.skipperIndex === skipperIndex);
    if (alreadyFinished) {
      console.log('⚠️ Skipper already in finish order');
      return;
    }

    const skipper = skippers[skipperIndex];
    if (!skipper) {
      console.error('❌ Skipper not found at index:', skipperIndex);
      return;
    }

    const nextPosition = finishOrder.filter(e => !e.letterScore).length + 1;
    console.log('📍 Adding position:', nextPosition, 'for skipper:', skipper.name);

    const newEntry: FinishingEntry = {
      skipperIndex,
      sailNumber: skipper.sailNumber || skipper.sailNo,
      skipperName: skipper.name,
      position: nextPosition
    };

    const newFinishOrder = [...finishOrder, newEntry];
    console.log('✅ New finish order length:', newFinishOrder.length);
    setFinishOrder(newFinishOrder);
    setIsConfirmed(false); // Reset confirmation when order changes
    saveResults(newFinishOrder);
  };

  const handleRemoveFromFinish = (skipperIndex: number) => {
    const newFinishOrder = finishOrder.filter(e => e.skipperIndex !== skipperIndex);

    // Recalculate positions
    newFinishOrder.forEach((entry, index) => {
      if (!entry.letterScore) {
        entry.position = index + 1;
      }
    });

    setFinishOrder(newFinishOrder);
    setIsConfirmed(false); // Reset confirmation when order changes
    saveResults(newFinishOrder);
  };

  const handleWithdrawFromEvent = () => {
    if (selectedSkipperForScore === null || !updateSkipper) return;

    const skipperIndex = selectedSkipperForScore;
    const skipperName = skippers[skipperIndex]?.name || 'Skipper';

    // Update the skipper to mark them as withdrawn from this race onwards
    updateSkipper(skipperIndex, { withdrawnFromRace: currentRace });

    // Close the selector
    setShowLetterScoreModal(false);
    setSelectedSkipperForScore(null);

    // Remove from finish order if present
    const newFinishOrder = finishOrder.filter(e => e.skipperIndex !== skipperIndex);
    setFinishOrder(newFinishOrder);
    saveResults(newFinishOrder);
  };

  const handleLetterScore = (letterScore: LetterScore | null, customPoints?: number) => {
    if (selectedSkipperForScore === null) return;

    // Close modal immediately for better UX
    setShowLetterScoreModal(false);
    const skipperIndex = selectedSkipperForScore;
    setSelectedSkipperForScore(null);

    if (letterScore === null) {
      // Clear letter score - remove from finish order
      const newFinishOrder = finishOrder.filter(e => e.skipperIndex !== skipperIndex);
      // Recalculate positions
      newFinishOrder.forEach((entry, index) => {
        if (!entry.letterScore) {
          entry.position = newFinishOrder.filter((e, i) => i <= index && !e.letterScore).length;
        }
      });
      setFinishOrder(newFinishOrder);
      setIsConfirmed(false); // Reset confirmation when order changes
      saveResults(newFinishOrder);
    } else {
      const existingEntry = finishOrder.find(e => e.skipperIndex === skipperIndex);

      if (existingEntry) {
        // Update existing entry with letter score and move to end
        const withoutCurrent = finishOrder.filter(e => e.skipperIndex !== skipperIndex);
        const updatedEntry: FinishingEntry = {
          ...existingEntry,
          letterScore,
          customPoints,
          position: 999
        };

        // Add letter score entry to end
        const sortedOrder = [...withoutCurrent, updatedEntry];

        setFinishOrder(sortedOrder);
        setIsConfirmed(false); // Reset confirmation when order changes
        saveResults(sortedOrder);
      } else {
        // Add new entry with letter score at the end
        const skipper = skippers[skipperIndex];
        const newEntry: FinishingEntry = {
          skipperIndex,
          sailNumber: skipper.sailNumber,
          skipperName: skipper.name,
          position: 999,
          letterScore,
          customPoints
        };

        // Add to end (after all regular finishes)
        const newFinishOrder = [...finishOrder, newEntry];
        setFinishOrder(newFinishOrder);
        setIsConfirmed(false); // Reset confirmation when order changes
        saveResults(newFinishOrder);
      }
    }
  };

  const saveResults = (entries: FinishingEntry[]) => {
    console.log('💾 Saving results - Race:', currentRace, 'Entries:', entries.length);
    const updatedResults = [...raceResults];

    // Remove old results for this race
    const filteredResults = updatedResults.filter(r => r.race !== currentRace);
    console.log('🗑️ Removed old results, remaining:', filteredResults.length);

    // Add new results
    entries.forEach(entry => {
      const newResult = {
        race: currentRace,
        skipperIndex: entry.skipperIndex,
        position: entry.letterScore ? null : entry.position,
        letterScore: entry.letterScore || undefined,
        customPoints: entry.customPoints
      };
      filteredResults.push(newResult);
      console.log('➕ Added result:', newResult);
    });

    // Check if all racing skippers now have results
    // Note: skippers array is already filtered to racing skippers only (observers are in OTHER heats)
    const allSkippersScored = entries.length === skippers.length;
    console.log('📊 All racing skippers scored?', allSkippersScored, `(${entries.length}/${skippers.length}, ${heatObservers.length} observers watching)`);
    if (allSkippersScored) {
      console.log('✅ All racing skippers scored - Confirm button should appear');
    }

    console.log('📤 Calling updateRaceResults with', filteredResults.length, 'total results');
    updateRaceResults(filteredResults);
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();

    if (draggedIndex === null) return;

    const newOrder = [...finishOrder];
    const [draggedItem] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(dropIndex, 0, draggedItem);

    // Recalculate positions for non-letter scores
    newOrder.forEach((entry, index) => {
      if (!entry.letterScore) {
        entry.position = newOrder.filter((e, i) => i <= index && !e.letterScore).length;
      }
    });

    setFinishOrder(newOrder);
    setIsConfirmed(false); // Reset confirmation when order changes
    saveResults(newOrder);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // Touch event handlers for drag and drop
  const handleTouchStart = (e: React.TouchEvent, index: number) => {
    const entry = finishOrder[index];
    if (entry.letterScore) return;

    const target = e.target as HTMLElement;
    if (target.closest('button')) {
      return;
    }

    const gripHandle = target.closest('[data-grip-handle]');
    if (!gripHandle) {
      return;
    }

    setTouchStartY(e.touches[0].clientY);
    setDraggedIndex(index);
  };

  const handleTouchMove = (e: React.TouchEvent, index: number) => {
    if (draggedIndex === null) return;

    const currentY = e.touches[0].clientY;
    const moveDistance = touchStartY !== null ? Math.abs(currentY - touchStartY) : 0;

    if (moveDistance > 10) {
      e.preventDefault();
      if (!touchDragging) {
        setTouchDragging(true);
      }

      const touch = e.touches[0];
      const element = document.elementFromPoint(touch.clientX, touch.clientY);

      const finishOrderItem = element?.closest('[data-finish-index]');
      if (finishOrderItem) {
        const targetIndex = parseInt(finishOrderItem.getAttribute('data-finish-index') || '-1');
        if (targetIndex >= 0 && targetIndex !== draggedIndex) {
          setDragOverIndex(targetIndex);
        }
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent, dropIndex: number) => {
    if (draggedIndex === null) {
      return;
    }

    if (!touchDragging) {
      setDraggedIndex(null);
      setTouchStartY(null);
      return;
    }

    const targetIndex = dragOverIndex !== null ? dragOverIndex : dropIndex;
    if (targetIndex !== draggedIndex) {
      const newOrder = [...finishOrder];
      const [draggedItem] = newOrder.splice(draggedIndex, 1);
      newOrder.splice(targetIndex, 0, draggedItem);

      newOrder.forEach((entry, idx) => {
        if (!entry.letterScore) {
          entry.position = newOrder.filter((e, i) => i <= idx && !e.letterScore).length;
        }
      });

      setFinishOrder(newOrder);
      setIsConfirmed(false);
      saveResults(newOrder);
    }

    setDraggedIndex(null);
    setDragOverIndex(null);
    setTouchDragging(false);
    setTouchStartY(null);
  };

  // Handler for confirming the finish order
  const handleConfirmResults = () => {
    setIsConfirmed(true);
    setRaceTimerRunning(false);
    console.log('✅ User confirmed finish order for race', currentRace);

    // Check if this is a handicap event - use raceFormat from event if available
    const isHandicapEvent = currentEvent?.raceFormat === 'handicap' ||
      (!currentEvent?.raceFormat && skippers.some(s => s.startHcap !== undefined && s.startHcap > 0));

    // For handicap events, automatically open the handicap viewer so race officer can call out handicaps
    if (isHandicapEvent) {
      setIsHandicapViewerOpen(true);

      // Show post-race handicap modal for handicap events (not heat-based)
      if (typeof dropRules === 'string' && dropRules !== 'shrs' && dropRules !== 'hms') {
        setShowPostRaceHandicapModal(true);
      }
    }

    // Trigger the race completion callback - this will update lastCompletedRace
    // which will automatically advance to the next race via the parent's effect
    if (onConfirmResults) {
      onConfirmResults();
    }
  };

  const handleLongPressStart = (skipperIndex: number) => {
    longPressSkipper.current = skipperIndex;
    longPressTimer.current = setTimeout(() => {
      setSelectedSkipperForScore(skipperIndex);
      setShowLetterScoreModal(true);
    }, 500);
  };

  const handleLongPressEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const navigateRace = (direction: 'prev' | 'next') => {
    const newRace = direction === 'prev' ? currentRace - 1 : currentRace + 1;
    if (newRace >= 1 && newRace <= numRaces) {
      setCurrentRace(newRace);
      onRaceChange?.(newRace);
    }
  };

  // Divider drag handlers
  const handleDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingDivider(true);
  };

  const handleDividerTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    setIsDraggingDivider(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingDivider || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const newPosition = ((e.clientX - containerRect.left) / containerRect.width) * 100;

      // Constrain between 25% (min to fit names) and 65% (max for finish order)
      const clampedPosition = Math.min(Math.max(newPosition, 25), 65);
      setSplitPosition(clampedPosition);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDraggingDivider || !containerRef.current) return;

      const touch = e.touches[0];
      const containerRect = containerRef.current.getBoundingClientRect();
      const newPosition = ((touch.clientX - containerRect.left) / containerRect.width) * 100;

      // Constrain between 25% (min to fit names) and 65% (max for finish order)
      const clampedPosition = Math.min(Math.max(newPosition, 25), 65);
      setSplitPosition(clampedPosition);
    };

    const handleEnd = () => {
      setIsDraggingDivider(false);
    };

    if (isDraggingDivider) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleEnd);
      document.addEventListener('touchmove', handleTouchMove);
      document.addEventListener('touchend', handleEnd);
      document.body.style.cursor = 'col-resize';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleEnd);
      document.body.style.cursor = '';
    };
  }, [isDraggingDivider]);

  // Calculate grid columns based on right panel width
  // Reduced max columns for better spacing and readability with 3-4 digit sail numbers
  const rightPanelWidth = 100 - splitPosition;
  let gridCols = 'grid-cols-2'; // Default 2 columns for narrow panels

  if (rightPanelWidth > 50) {
    gridCols = 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6';
  } else if (rightPanelWidth > 35) {
    gridCols = 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4';
  }

  // Determine if finish order should display in 2 columns
  // Use 2 columns when panel is wide (>45%) and has 6+ entries
  const finishOrderTwoColumns = splitPosition > 45 && finishOrder.length >= 6;

  const usedSkipperIndices = new Set(finishOrder.map(e => e.skipperIndex));

  // Calculate completed races count
  const getCompletedRacesCount = (): number => {
    if (raceResults.length === 0) return 0;

    let completedCount = 0;
    for (let race = 1; race <= numRaces; race++) {
      const raceHasResults = raceResults.some(r => r.race === race && (r.position !== null || r.letterScore));
      if (raceHasResults) {
        const allSkippersHaveResult = skippers.every((_, skipperIndex) => {
          const result = raceResults.find(r => r.race === race && r.skipperIndex === skipperIndex);
          return result && (result.position !== null || result.letterScore);
        });
        if (allSkippersHaveResult) {
          completedCount++;
        }
      }
    }
    return completedCount;
  };

  // Check if we're viewing a previous race (locked from editing)
  const isPreviousRace = (): boolean => {
    // If the current race being viewed is less than the initial race (the active race from parent),
    // and it has been fully scored, then it's a previous race that should be locked
    if (currentRace >= initialRace) return false;

    // Check if this race has been fully scored
    const allSkippersHaveResult = skippers.every((_, skipperIndex) => {
      const result = raceResults.find(r => r.race === currentRace && r.skipperIndex === skipperIndex);
      return result && (result.position !== null || result.letterScore);
    });

    return allSkippersHaveResult;
  };

  // Get scoring system display name
  const getScoringSystemName = () => {
    // Check if heat management has a scoring system specified (most reliable for heat racing)
    if (currentEvent?.heatManagement?.configuration?.scoringSystem) {
      const heatScoringSystem = currentEvent.heatManagement.configuration.scoringSystem;
      if (heatScoringSystem === 'hms') {
        return 'HMS Heat System';
      } else if (heatScoringSystem === 'shrs') {
        const mode = currentEvent.heatManagement.configuration.shrsAssignmentMode;
        return `SHR-${mode === 'preset' ? 'B' : 'P'} - Structured Heat Racing`;
      }
    }

    // Check dropRules string values
    if (typeof dropRules === 'string') {
      if (dropRules === 'shrs') {
        const mode = currentEvent?.heatManagement?.configuration?.shrsAssignmentMode;
        return `SHR-${mode === 'preset' ? 'B' : 'P'} - Structured Heat Racing`;
      }
      if (dropRules === 'hms') return 'HMS Heat System';
      return dropRules;
    }

    // Check array-based scoring systems
    if (!Array.isArray(dropRules) || dropRules.length === 0) {
      return 'No Discards';
    }

    const rulesString = JSON.stringify(dropRules);
    if (rulesString === '[4,8,16,24,32,40]') {
      return 'RRS - Appendix A Scoring System';
    } else if (rulesString === '[4,8,12,16,20,24,28,32,36,40]') {
      return 'Low Point System';
    } else {
      return `Custom - ${dropRules.join(', ')}`;
    }
  };

  // Calculate handicap change for a skipper
  const getHandicapChange = (skipperIndex: number): number => {
    const currentResult = raceResults.find(r => r.race === currentRace && r.skipperIndex === skipperIndex);
    const previousResult = raceResults.find(r => r.race === currentRace - 1 && r.skipperIndex === skipperIndex);

    if (!currentResult) return 0;

    const before = currentResult.handicap ?? (previousResult?.adjustedHcap ?? skippers[skipperIndex].startHcap);
    const after = currentResult.adjustedHcap ?? before;

    return after - before;
  };

  // Check if this is a handicap event - use raceFormat from event if available
  const isHandicapEvent = currentEvent?.raceFormat === 'handicap' ||
    (!currentEvent?.raceFormat && skippers.some(s => s.startHcap !== undefined && s.startHcap > 0));

  return (
    <div className={`${isFullscreen ? 'h-[calc(100vh-3rem)]' : 'h-[75vh]'} flex flex-col overflow-hidden rounded-lg no-select ${darkMode ? 'bg-slate-900/95 text-white' : 'bg-slate-100 text-slate-900'}`}>
      {/* Header - Race Navigation with StartBox + Race Timer */}
      <div className={`border-b px-4 py-3 flex items-center justify-between flex-shrink-0 ${darkMode ? 'bg-slate-800/50 border-slate-700/50' : 'bg-white border-slate-200'}`}>
        <div className="flex items-center gap-2">
          {currentEvent?.id && currentEvent?.enableLiveTracking && (
            <LiveStatusControl eventId={currentEvent.id} darkMode={darkMode} />
          )}
          <button
            onClick={() => setShowStartBoxModal(true)}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all active:scale-95 ${
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
            Starter Console
          </button>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => navigateRace('prev')}
            disabled={currentRace <= 1}
            className={`p-2 rounded-lg ${currentRace <= 1 ? 'opacity-30 cursor-not-allowed' : darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}
          >
            <ChevronLeft size={24} />
          </button>

          <div className="text-2xl font-bold">
            {roundLabel || (isHeatScoring
              ? (() => {
                  const isShrs = currentEvent?.heatManagement?.configuration?.scoringSystem === 'shrs';
                  const shrsQR = currentEvent?.heatManagement?.configuration?.shrsQualifyingRounds || 0;
                  if (isShrs && shrsQR > 0) {
                    return currentRace <= shrsQR
                      ? `Qualifying Rd ${currentRace}`
                      : `Final ${currentRace - shrsQR}`;
                  }
                  return `Round ${currentRace}`;
                })()
              : `Race ${currentRace}`)}
          </div>

          <button
            onClick={() => navigateRace('next')}
            disabled={currentRace >= numRaces}
            className={`p-2 rounded-lg ${currentRace >= numRaces ? 'opacity-30 cursor-not-allowed' : darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}
          >
            <ChevronRight size={24} />
          </button>
        </div>

        <div className="w-[160px] flex items-center justify-end">
          {raceTimerRunning && (
            <RaceElapsedTimer
              isRunning={raceTimerRunning}
              onStop={() => setRaceTimerRunning(false)}
              darkMode={darkMode}
            />
          )}
        </div>
      </div>

      {/* Main Content - Split View */}
      <div ref={containerRef} className="flex-1 flex overflow-hidden min-h-0 relative">
        {/* Left Side - Finishing Order */}
        <div
          className={`flex flex-col min-h-0 transition-all ${darkMode ? 'bg-slate-800/30' : 'bg-white'}`}
          style={{ width: `${splitPosition}%` }}
        >
          <div className={`px-4 py-3 font-semibold border-b flex-shrink-0 ${darkMode ? 'bg-slate-800/40 border-slate-700/50' : 'bg-slate-50 border-slate-200'}`}>
            Finish Order
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            {finishOrder.length === 0 ? (
              <div className={`flex items-center justify-center h-full ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                Tap sail numbers to record finishes
              </div>
            ) : (
              <div className={`p-2 ${finishOrderTwoColumns ? 'grid grid-cols-2 gap-2' : 'space-y-2'}`}>
                {finishOrder.map((entry, index) => {
                  const skipper = skippers[entry.skipperIndex];
                  const initials = entry.skipperName
                    .split(' ')
                    .map(n => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2);

                  return (
                    <div
                      key={entry.skipperIndex}
                      data-finish-index={index}
                      draggable={!entry.letterScore && !isPreviousRace()}
                      onDragStart={() => !isPreviousRace() && handleDragStart(index)}
                      onDragOver={(e) => !isPreviousRace() && handleDragOver(e, index)}
                      onDrop={(e) => !isPreviousRace() && handleDrop(e, index)}
                      onDragEnd={() => {
                        setDraggedIndex(null);
                        setDragOverIndex(null);
                      }}
                      onTouchStart={(e) => !isPreviousRace() && handleTouchStart(e, index)}
                      onTouchMove={(e) => !isPreviousRace() && handleTouchMove(e, index)}
                      onTouchEnd={(e) => !isPreviousRace() && handleTouchEnd(e, index)}
                      style={{ touchAction: !entry.letterScore && !isPreviousRace() ? 'none' : 'auto' }}
                      className={`
                        rounded-lg p-2.5 flex items-center gap-3 border select-none
                        ${!entry.letterScore && !isPreviousRace() ? 'cursor-grab active:cursor-grabbing' : ''}
                        ${dragOverIndex === index ? 'ring-2 ring-blue-500' : ''}
                        ${draggedIndex === index && touchDragging ? 'opacity-50 scale-105' : ''}
                        ${isPreviousRace() ? 'opacity-70' : ''}
                        transition-all
                        ${darkMode
                          ? 'bg-slate-800/40 border-slate-700/40 hover:bg-slate-800/60'
                          : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                        }
                      `}
                    >
                      {/* Drag Handle */}
                      {!entry.letterScore && !isPreviousRace() && (
                        <div
                          data-grip-handle="true"
                          style={{ touchAction: 'none' }}
                          className={`flex-shrink-0 p-3 -m-2 cursor-grab active:cursor-grabbing ${darkMode ? 'text-slate-500 hover:text-slate-400' : 'text-slate-400 hover:text-slate-500'}`}
                        >
                          <GripVertical size={20} />
                        </div>
                      )}

                      {/* Position Badge */}
                      <div className={`
                        w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg flex-shrink-0
                        ${entry.letterScore
                          ? 'bg-red-900 text-red-200'
                          : 'bg-blue-600 text-white'
                        }
                      `}>
                        {entry.letterScore || entry.position}
                      </div>

                      {/* Flag (if event shows flag) */}
                      {currentEvent?.show_flag && skipper?.country_code && (
                        <div className="flex-shrink-0 text-3xl">
                          {getCountryFlag(skipper.country_code)}
                        </div>
                      )}

                      {/* Avatar */}
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-xs border-2 overflow-hidden flex-shrink-0 ${darkMode ? 'bg-slate-700 text-slate-300 border-slate-600' : 'bg-slate-200 text-slate-600 border-slate-300'}`}>
                        {skipper?.avatarUrl ? (
                          <img
                            src={skipper.avatarUrl}
                            alt={entry.skipperName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span>{initials}</span>
                        )}
                      </div>

                      {/* Skipper Info */}
                      <div className="flex-1 min-w-0">
                        <div className={`font-medium text-sm truncate ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                          {entry.skipperName}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className={`font-bold text-2xl leading-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                            {currentEvent?.show_country && skipper?.country_code && (
                              <span className={`font-bold text-2xl leading-tight ${darkMode ? 'text-white' : 'text-slate-900'} mr-1`}>
                                {getIOCCode(skipper.country_code)}
                              </span>
                            )}
                            {entry.sailNumber}
                          </div>
                          {isHandicapEvent && (
                            <HandicapChangeBadge
                              change={getHandicapChange(entry.skipperIndex)}
                              onClick={() => {
                                setSelectedSkipperForProgression(entry.skipperIndex);
                                setShowProgressionModal(true);
                              }}
                              darkMode={darkMode}
                            />
                          )}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            if (!isPreviousRace()) {
                              handleRemoveFromFinish(entry.skipperIndex);
                            }
                          }}
                          onMouseDown={(e) => e.stopPropagation()}
                          onTouchStart={(e) => e.stopPropagation()}
                          onTouchEnd={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                          }}
                          disabled={isPreviousRace()}
                          className={`p-2.5 rounded-lg transition-colors ${isPreviousRace() ? 'opacity-30 cursor-not-allowed' : 'active:scale-95'} ${darkMode ? 'text-slate-500 hover:text-red-400 hover:bg-slate-700 active:bg-slate-600' : 'text-slate-400 hover:text-red-500 hover:bg-slate-200 active:bg-slate-300'} ${isPreviousRace() ? 'pointer-events-none' : ''}`}
                          title={isPreviousRace() ? "Previous races cannot be edited" : "Remove"}
                        >
                          <X size={20} />
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            if (!isPreviousRace()) {
                              setSelectedSkipperForScore(entry.skipperIndex);
                              setShowLetterScoreModal(true);
                            }
                          }}
                          onMouseDown={(e) => e.stopPropagation()}
                          onTouchStart={(e) => e.stopPropagation()}
                          onTouchEnd={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                          }}
                          disabled={isPreviousRace()}
                          className={`p-2.5 rounded-lg transition-colors ${isPreviousRace() ? 'opacity-30 cursor-not-allowed' : 'active:scale-95'} ${darkMode ? 'text-slate-500 hover:text-slate-300 hover:bg-slate-700 active:bg-slate-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-200 active:bg-slate-300'} ${isPreviousRace() ? 'pointer-events-none' : ''}`}
                          title={isPreviousRace() ? "Previous races cannot be edited" : "Score Options"}
                        >
                          <MoreHorizontal size={20} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Confirm Button - appears when all racing skippers scored but not confirmed */}
          {finishOrder.length === skippers.length && !isConfirmed && (
            <div className={`px-4 py-3 border-t flex-shrink-0 ${darkMode ? 'bg-slate-800/40 border-slate-700/50' : 'bg-slate-50 border-slate-200'}`}>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log('🎯 Confirm button clicked - Race:', currentRace);
                  handleConfirmResults();
                }}
                className={`w-full py-3 px-4 rounded-lg font-semibold text-white ${
                  isScoringLastHeat
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-green-600 hover:bg-green-700'
                } transition-colors flex items-center justify-center gap-2 shadow-lg active:scale-98`}
              >
                <Check size={20} />
                {isScoringLastHeat ? 'Confirm Results & Complete Round' : 'Confirm & Apply Results'}
              </button>
            </div>
          )}
        </div>

        {/* Draggable Divider */}
        <div
          className={`
            w-1 flex-shrink-0 relative group cursor-col-resize transition-colors
            ${isDraggingDivider
              ? darkMode ? 'bg-cyan-500/40' : 'bg-blue-500/40'
              : darkMode ? 'bg-slate-700/30 hover:bg-cyan-500/30' : 'bg-slate-300/30 hover:bg-blue-400/30'
            }
          `}
          onMouseDown={handleDividerMouseDown}
          onTouchStart={handleDividerTouchStart}
        >
          {/* Grab Handle - Subtle */}
          <div className={`
            absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
            w-6 h-12 rounded-md flex items-center justify-center
            transition-all duration-200
            ${isDraggingDivider
              ? darkMode ? 'bg-cyan-500/50 scale-105' : 'bg-blue-500/50 scale-105'
              : darkMode ? 'bg-slate-700/40 group-hover:bg-cyan-500/40' : 'bg-slate-400/40 group-hover:bg-blue-500/40'
            }
          `}>
            <GripVertical
              size={14}
              className={`opacity-50 ${isDraggingDivider ? 'opacity-100' : 'group-hover:opacity-70'} ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}
            />
          </div>
        </div>

        {/* Right Side - Sail Number Grid */}
        <div className="flex-1 flex flex-col min-h-0"
          style={{ width: `${rightPanelWidth}%` }}
        >
          <div className={`px-4 py-3 font-semibold border-b flex-shrink-0 ${darkMode ? 'bg-slate-800/40 border-slate-700/50' : 'bg-slate-50 border-slate-200'}`}>
            Scheduled Entries ({skippers.length})
          </div>

          <div className={`flex-1 overflow-y-auto p-6 min-h-0 ${darkMode ? 'bg-slate-800/20' : 'bg-gradient-to-br from-slate-50 to-slate-100'}`}>
            <div className={`grid ${gridCols} gap-6 sm:gap-8`}>
              {skippers.map((skipper, index) => {
                const isFinished = usedSkipperIndices.has(index);
                const skipperSailNo = skipper.sailNumber || skipper.sailNo;
                // Match observers by sail number, handling both string and number types
                const isObserver = heatObservers.some(obs => {
                  const match = String(obs.skipper_sail_number) === String(skipperSailNo);
                  return match;
                });

                // Don't show observers in the racing grid
                if (isObserver) return null;

                return (
                  <button
                    key={index}
                    onClick={() => {
                      console.log('🖱️ Button clicked - Index:', index, 'Sail:', skipper.sailNumber, 'Finished:', isFinished);
                      if (!isFinished) {
                        handleSailNumberClick(index);
                      }
                    }}
                    onMouseDown={() => handleLongPressStart(index)}
                    onMouseUp={handleLongPressEnd}
                    onMouseLeave={handleLongPressEnd}
                    onTouchStart={() => handleLongPressStart(index)}
                    onTouchEnd={handleLongPressEnd}
                    disabled={isFinished}
                    className={`
                      relative w-full min-h-[100px] sm:min-h-[120px] lg:min-h-[140px] px-4 py-6
                      flex items-center justify-center
                      transition-all duration-200 font-semibold text-2xl sm:text-3xl lg:text-4xl
                      ${isFinished
                        ? 'text-white bg-gradient-to-br from-blue-600 to-blue-700 opacity-60 rounded-xl'
                        : darkMode
                          ? 'text-slate-100 bg-transparent border-2 border-slate-700/50 rounded-xl hover:border-cyan-400/60 hover:text-cyan-300 hover:shadow-lg hover:shadow-cyan-500/20 hover:scale-105 active:scale-100'
                          : 'text-slate-700 bg-transparent border-2 border-slate-300/50 rounded-xl hover:border-blue-400/60 hover:text-blue-600 hover:shadow-lg hover:shadow-blue-500/10 hover:scale-105 active:scale-100'
                      }
                    `}
                    style={{
                      fontFamily: "'Inter', 'SF Pro Display', -apple-system, system-ui, sans-serif",
                      letterSpacing: '-0.02em'
                    }}
                  >
                    <span className="relative z-10 flex flex-col items-center justify-center gap-1">
                      {currentEvent?.show_country && skipper?.country_code && (
                        <span className="text-sm sm:text-base lg:text-lg opacity-80">
                          {getIOCCode(skipper.country_code)}
                        </span>
                      )}
                      <span>
                        {skipper.sailNumber || skipper.sailNo}
                      </span>
                    </span>
                    {isFinished && (
                      <div className="absolute top-0.5 right-0.5 w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center shadow-md">
                        <Check size={14} className="text-white" strokeWidth={3} />
                      </div>
                    )}
                    {!isFinished && (
                      <div className={`absolute inset-0 rounded-xl transition-all duration-200 ${darkMode ? 'bg-gradient-to-br from-cyan-500/0 to-blue-500/0 hover:from-cyan-500/5 hover:to-blue-500/5' : 'bg-gradient-to-br from-blue-500/0 to-cyan-500/0 hover:from-blue-500/3 hover:to-cyan-500/3'}`} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Observers Section - At bottom above info bar */}
      {heatObservers.length > 0 && (
        <div className={`px-4 py-2 border-t ${darkMode ? 'bg-slate-800/20 border-slate-700/50' : 'bg-slate-50/50 border-slate-200'} flex-shrink-0`}>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Eye size={14} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
              <span className={`text-xs font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Observers ({heatObservers.length}):
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {heatObservers.map((observer, idx) => {
                console.log(`👁️ Rendering observer ${idx + 1}/${heatObservers.length}:`, observer.skipper_name, '#' + observer.skipper_sail_number);
                return (
                  <div
                    key={`${observer.skipper_index}-${observer.skipper_sail_number}-${idx}`}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs ${
                      darkMode
                        ? 'bg-slate-700/50 text-slate-300 border border-slate-600/50'
                        : 'bg-slate-100 text-slate-700 border border-slate-200'
                    }`}
                  >
                    <span className="font-medium">{observer.skipper_name}</span>
                    <span className={darkMode ? 'text-slate-400' : 'text-slate-500'}>
                      #{observer.skipper_sail_number}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Info Bar - Skipper Count and Scoring System */}
      <div className={`px-4 py-3 flex items-center justify-between border-t flex-shrink-0 ${darkMode ? 'bg-slate-800/40 border-slate-700/50' : 'bg-slate-50 border-slate-200'}`}>
        {/* Left: Skipper and Race Count */}
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ${
          darkMode ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-600'
        }`}>
          <Users size={14} />
          <span className="text-xs">{skippers.length} skippers</span>
          {heatObservers.length > 0 && (
            <>
              <span className="text-xs">•</span>
              <span className="text-xs">{heatObservers.length} {heatObservers.length === 1 ? 'observer' : 'observers'}</span>
            </>
          )}
          <span className="text-xs">•</span>
          <span className="text-xs">{getCompletedRacesCount()} of {numRaces} races completed</span>
        </div>

        {/* Right: Scoring System */}
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ${
          darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-700'
        }`}>
          <Award size={14} />
          <span className="text-xs font-medium">Scoring System:</span>
          <span className="text-xs">{getScoringSystemName()}</span>
        </div>
      </div>

      {/* Letter Score Modal */}
      {selectedSkipperForScore !== null && (() => {
        // Get previous race results for average points calculation
        const skipperPreviousResults: Array<{ position: number | null; letterScore?: string; customPoints?: number; points: number }> = [];

        for (let r = 1; r < currentRace; r++) {
          const result = raceResults.find(res => res.race === r && res.skipperIndex === selectedSkipperForScore);
          if (result) {
            const position = result.position;
            const letterScore = result.letterScore;
            const customPoints = result.customPoints;

            // Get the points for this race
            let points = 0;
            if (letterScore === 'RDG' || letterScore === 'DPI') {
              points = customPoints || 0;
            } else if (position !== null && position > 0) {
              points = position;
            } else if (letterScore) {
              // Letter scores - use number of starters + 1
              const numStarters = raceResults.filter(res => res.race === r).length;
              points = numStarters + 1;
            }

            skipperPreviousResults.push({
              position,
              letterScore,
              customPoints,
              points
            });
          }
        }

        return (
          <LetterScoreSelector
            isOpen={showLetterScoreModal && selectedSkipperForScore !== null}
            onClose={() => {
              setShowLetterScoreModal(false);
              setSelectedSkipperForScore(null);
            }}
            onSelect={handleLetterScore}
            onWithdrawFromEvent={updateSkipper ? handleWithdrawFromEvent : undefined}
            darkMode={darkMode}
            skipperName={skippers[selectedSkipperForScore]?.name || ''}
            raceNumber={currentRace}
            skipperPreviousResults={skipperPreviousResults}
          />
        );
      })()}

      {/* Floating Handicap/Rankings Viewer */}
      <FloatingHandicapViewer
        skippers={skippers}
        raceResults={raceResults}
        currentRace={currentRace}
        darkMode={darkMode}
        isOpen={isHandicapViewerOpen}
        onOpenChange={setIsHandicapViewerOpen}
        dropRules={Array.isArray(dropRules) ? dropRules : [4, 8, 16, 24, 32, 40]}
        isScratchEvent={!isHandicapEvent}
        currentEvent={currentEvent}
        allSkippers={allSkippers}
        allRaceResults={allRaceResults}
      />

      {/* Post-Race Handicap Modal */}
      {isHandicapEvent && (
        <PostRaceHandicapModal
          isOpen={showPostRaceHandicapModal}
          onClose={() => setShowPostRaceHandicapModal(false)}
          skippers={skippers}
          raceNumber={currentRace}
          raceResults={raceResults}
          darkMode={darkMode}
        />
      )}

      {/* Handicap Progression Modal */}
      {isHandicapEvent && selectedSkipperForProgression !== null && (
        <HandicapProgressionModal
          isOpen={showProgressionModal}
          onClose={() => {
            setShowProgressionModal(false);
            setSelectedSkipperForProgression(null);
          }}
          skipper={skippers[selectedSkipperForProgression]}
          skipperIndex={selectedSkipperForProgression}
          raceResults={raceResults}
          numRaces={numRaces}
          darkMode={darkMode}
        />
      )}

      {/* Digital StartBox Modal */}
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
