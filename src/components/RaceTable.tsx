import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, MoreHorizontal, Trophy, TrendingUp, Settings, Home, Users, Sailboat, Flag, X, Award, Maximize2, Minimize2 } from 'lucide-react';
import { Skipper, LetterScore } from '../types';
import { RaceEvent } from '../types/race';
import { RaceInput } from './RaceInput';
import { SettingsDropdown } from './Controls';
import { LetterScoreSelector } from './LetterScoreSelector';
import { ConfirmationModal } from './ConfirmationModal';
import { useNotifications } from '../contexts/NotificationContext';
import { calculateSHRSDiscards } from '../utils/shrsHeatSystem';
import { getCountryFlag, getIOCCode } from '../utils/countryFlags';

// Helper function to abbreviate club names
const abbreviateClubName = (clubName: string): string => {
  if (!clubName) return '';

  // If already short (4 chars or less), return as is
  if (clubName.length <= 4) return clubName;

  // Split by common separators and take initials
  const words = clubName.split(/[\s\-_]+/).filter(word => word.length > 0);

  // Take first letter of each significant word (skip common words like "the", "of", "and")
  const skipWords = ['the', 'of', 'and', 'a', 'an', 'at', 'in', 'on'];
  const initials = words
    .filter(word => !skipWords.includes(word.toLowerCase()))
    .map(word => word[0].toUpperCase())
    .join('');

  // If we got a reasonable abbreviation (2-6 chars), use it
  if (initials.length >= 2 && initials.length <= 6) {
    return initials;
  }

  // Otherwise, take first 6 characters
  return clubName.substring(0, 6).toUpperCase();
};

interface RaceTableProps {
  skippers: Skipper[];
  numRaces: number;
  dropRules: number[] | string; // Can be array of numbers or 'shrs'/'hms'
  updateStartHcap: (skipperIndex: number, value: number) => void;
  updateRaceResults: (race: number, skipperIndex: number, position: number | null, letterScore?: LetterScore, customPoints?: number) => void;
  raceResults: any[];
  enableRaceEditing: (raceNum: number | null) => void;
  lastCompletedRace: number;
  hasDeterminedInitialHcaps: boolean;
  editingRace: number | null;
  canEnterRace2: boolean;
  deleteRaceResult: (race: number, skipperIndex: number) => void;
  clearRace: (race: number) => void;
  darkMode: boolean;
  isManualHandicaps: boolean;
  onManageSkippers: () => void;
  onReturnToRaceManagement: () => void;
  onCompleteScoring: () => void;
  onShowCharts: () => void;
  currentEvent: RaceEvent | null;
  currentDay: number;
  onToggleDarkMode: () => void;
  onRaceSettingsChange?: (settings: { numRaces: number; dropRules: number[] }) => void;
  onOpenRaceSettings?: () => void;
  updateSkipper?: (skipperIndex: number, updates: Partial<Skipper>) => void;
}

export const RaceTable: React.FC<RaceTableProps> = ({
  skippers,
  numRaces,
  dropRules,
  updateStartHcap,
  updateRaceResults,
  raceResults,
  enableRaceEditing,
  lastCompletedRace,
  hasDeterminedInitialHcaps,
  editingRace,
  canEnterRace2,
  deleteRaceResult,
  clearRace,
  darkMode,
  isManualHandicaps,
  onManageSkippers,
  onReturnToRaceManagement,
  onCompleteScoring,
  onShowCharts,
  currentEvent,
  currentDay = 1,
  onToggleDarkMode,
  onRaceSettingsChange,
  onOpenRaceSettings,
  updateSkipper
}) => {
  const { addNotification } = useNotifications();
  const [selectedCell, setSelectedCell] = useState<{race: number, skipperIndex: number} | null>(null);
  const [showLetterScoreSelector, setShowLetterScoreSelector] = useState<{race: number, skipperIndex: number} | null>(null);
  const [manualHandicaps, setManualHandicaps] = useState<{[key: number]: number}>({});

  // Log withdrawn skippers
  useEffect(() => {
    const withdrawnSkippers = skippers.filter(s => s.withdrawnFromRace).map(s => ({
      name: s.name,
      withdrawnFromRace: s.withdrawnFromRace
    }));
    if (withdrawnSkippers.length > 0) {
      console.log('📋 Withdrawn skippers:', withdrawnSkippers);
    }
  }, [skippers]);
  const [hasManualHandicaps, setHasManualHandicaps] = useState(false);
  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false);
  const [raceToDelete, setRaceToDelete] = useState<number | null>(null);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isCompactView, setIsCompactView] = useState(false);
  const [contextMenu, setContextMenu] = useState<{skipperIndex: number, x: number, y: number} | null>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const fullscreenContainerRef = useRef<HTMLDivElement>(null);
  const activeRaceRef = useRef<number | null>(null);
  const lastSortedRaceRef = useRef<number>(0);
  const sortedOrderRef = useRef<number[]>([]);

  const initialNumRaces = useRef(numRaces);

  // Debug: Log dropRules changes
  useEffect(() => {
    console.log('🔍 RaceTable dropRules changed:', dropRules, 'isArray:', Array.isArray(dropRules), 'length:', Array.isArray(dropRules) ? dropRules.length : 'N/A');
  }, [dropRules]);

  // Auto-update race status to "live" when scoring starts
  useEffect(() => {
    const autoUpdateRaceStatus = async () => {
      if (!currentEvent?.id) return;

      // Import the live tracking utilities dynamically
      const { getRaceStatus, updateRaceStatus } = await import('../utils/liveTrackingStorage');

      // Check current status
      const statusData = await getRaceStatus(currentEvent.id);
      const activeRace = lastCompletedRace + 1;
      const raceNote = `Race ${activeRace}`;

      // If status is not "live", automatically set it to "live" with race number
      if (statusData && statusData.status !== 'live') {
        console.log('🟢 Auto-updating race status to "live" as scoring has begun');
        await updateRaceStatus(currentEvent.id, 'live', raceNote);
      } else if (statusData && statusData.status === 'live' && statusData.notes !== raceNote) {
        // Update race number if it has changed
        await updateRaceStatus(currentEvent.id, 'live', raceNote);
      }
    };

    autoUpdateRaceStatus();
  }, [currentEvent?.id, lastCompletedRace]);

  // Auto-scroll to keep active race visible
  useEffect(() => {
    const activeRace = lastCompletedRace + 1;

    // Only scroll if active race changed
    if (activeRaceRef.current !== activeRace && tableContainerRef.current) {
      activeRaceRef.current = activeRace;

      // Wait a bit for DOM to update
      setTimeout(() => {
        if (!tableContainerRef.current) return;

        // Find the active race column header
        const raceHeaders = tableContainerRef.current.querySelectorAll('th');
        // Skip first 4 columns (Pos, Skipper, Sail No, H'cap), find the active race header
        const activeRaceIndex = activeRace + 3; // +3 because array is 0-indexed and we skip 4 columns

        if (raceHeaders[activeRaceIndex]) {
          const headerElement = raceHeaders[activeRaceIndex] as HTMLElement;
          const container = tableContainerRef.current;

          // Calculate scroll position to center the active race column
          const containerWidth = container.clientWidth;
          const headerLeft = headerElement.offsetLeft;
          const headerWidth = headerElement.offsetWidth;

          // Account for sticky columns - approximate width
          const stickyColumnsWidth = 480; // Approximate total width of sticky columns

          // Scroll to show the active race, accounting for sticky columns
          const scrollPosition = headerLeft - stickyColumnsWidth - (containerWidth - stickyColumnsWidth - headerWidth) / 2;

          container.scrollTo({
            left: Math.max(0, scrollPosition),
            behavior: 'smooth'
          });
        }
      }, 100);
    }
  }, [lastCompletedRace, numRaces]);

  const originalOrder = [...Array(skippers.length).keys()];

  // Use a ref to store the previous skippers to detect actual changes
  const previousSkippersRef = useRef<string>('');

  useEffect(() => {
    // Create a stable string representation of skipper handicaps
    const currentSkippersKey = skippers.map((s, i) => `${i}:${s.startHcap}`).join(',');

    // Only update if skippers have actually changed
    if (previousSkippersRef.current === currentSkippersKey) {
      return;
    }

    previousSkippersRef.current = currentSkippersKey;

    // Initialize manual handicaps from existing skipper data
    const initialHandicaps: {[key: number]: number} = {};
    let hasAnyManualHandicaps = false;

    skippers.forEach((skipper, index) => {
      if (skipper.startHcap > 0) {
        initialHandicaps[index] = skipper.startHcap;
        hasAnyManualHandicaps = true;
      }
    });

    setManualHandicaps(initialHandicaps);
    setHasManualHandicaps(hasAnyManualHandicaps);
  }, [skippers]);

  // Check if R1 has been scored
  const hasR1BeenScored = raceResults.some(r => r.race === 1);

  // Handle manual handicap changes
  const handleManualHandicapChange = (skipperIndex: number, value: string) => {
    const numValue = parseInt(value) || 0;
    const newManualHandicaps = { ...manualHandicaps };
    
    if (numValue > 0) {
      newManualHandicaps[skipperIndex] = numValue;
      setHasManualHandicaps(true);
    } else {
      delete newManualHandicaps[skipperIndex];
      setHasManualHandicaps(Object.keys(newManualHandicaps).length > 0);
    }
    
    setManualHandicaps(newManualHandicaps);
    
    // Update the skipper's starting handicap
    updateStartHcap(skipperIndex, numValue);
  };

  const handleClearRace = (race: number) => {
    setRaceToDelete(race);
  };

  const handleConfirmClearRace = () => {
    if (raceToDelete !== null) {
      // If clearing R1, reset manual handicaps state
      if (raceToDelete === 1) {
        setManualHandicaps({});
        setHasManualHandicaps(false);
      }
      clearRace(raceToDelete);
      setRaceToDelete(null);
    }
  };

  const handleCancelClearRace = () => {
    setRaceToDelete(null);
  };

  // Automatically extend races when all current races are completed
  useEffect(() => {
    if (lastCompletedRace > 0 && lastCompletedRace >= numRaces) {
      const newNumRaces = numRaces + 1;
      console.log(`Auto-extending races from ${numRaces} to ${newNumRaces}`);
      if (onRaceSettingsChange) {
        onRaceSettingsChange({ numRaces: newNumRaces, dropRules });
      }
    }
  }, [lastCompletedRace, numRaces]);

  const getResult = (race: number, skipperIndex: number) => {
    return raceResults.find(r => r.race === race && r.skipperIndex === skipperIndex);
  };

  // Get the handicap that was USED for a specific race
  const getHandicapUsedForRace = (race: number, skipperIndex: number): number | null => {
    const skipper = skippers[skipperIndex];
    if (!skipper) return null;

    // For Race 1, use the starting handicap
    if (race === 1) {
      return skipper.startHcap || 0;
    }

    // For Race 2+, check if the result has the handicap stored
    const result = getResult(race, skipperIndex);
    if (result) {
      // First check if handicap is stored in the result
      if (result.handicap !== undefined && result.handicap !== null && !isNaN(result.handicap)) {
        return result.handicap;
      }
    }

    // If no handicap stored in current result, build it up from previous races
    // Start from race 1 and work forward to find what the handicap should have been
    let currentHandicap = skipper.startHcap || 0;

    for (let r = 1; r < race; r++) {
      const rResult = getResult(r, skipperIndex);
      if (rResult && rResult.adjustedHcap !== undefined && rResult.adjustedHcap !== null && !isNaN(rResult.adjustedHcap)) {
        currentHandicap = rResult.adjustedHcap;
      }
    }

    return currentHandicap;
  };

  // Get the handicap that will be used for the NEXT race
  const getCurrentHandicap = (skipperIndex: number): number => {
    const skipper = skippers[skipperIndex];
    if (!skipper) return 0;

    // If no races completed, return starting handicap (for Race 1)
    if (lastCompletedRace === 0) {
      return skipper.startHcap || 0;
    }

    // For the next race, use the adjusted handicap from the most recently completed race
    for (let race = lastCompletedRace; race >= 1; race--) {
      const result = getResult(race, skipperIndex);
      if (result) {
        // If adjustedHcap is set, use it
        if (result.adjustedHcap !== undefined && result.adjustedHcap !== null && !isNaN(result.adjustedHcap)) {
          return result.adjustedHcap;
        }
        // Otherwise use the handicap field
        if (result.handicap !== undefined && result.handicap !== null && !isNaN(result.handicap)) {
          return result.handicap;
        }
      }
    }

    // Fallback to starting handicap
    return skipper.startHcap || 0;
  };

  // Check if a race has been started (at least one result entered)
  const hasRaceStarted = (race: number): boolean => {
    return raceResults.some(r => r.race === race);
  };

  // Check if a skipper has withdrawn from the event
  const isSkipperWithdrawn = (skipperIndex: number, race: number): boolean => {
    const skipper = skippers[skipperIndex];
    if (!skipper || !skipper.withdrawnFromRace) return false;

    // Show withdrawal status if the race is >= the withdrawal race AND:
    // - The race has been started (has at least one result), OR
    // - The race is the active race (next race to be scored), OR
    // - The race is being edited
    const isActiveRace = race === lastCompletedRace + 1 || editingRace === race;
    const isWithdrawn = race >= skipper.withdrawnFromRace && (hasRaceStarted(race) || isActiveRace);

    if (isWithdrawn) {
      console.log(`✅ Skipper ${skipper.name} is withdrawn for race ${race} (withdrew from race ${skipper.withdrawnFromRace})`);
    }
    return isWithdrawn;
  };

  // Get the handicap from the race before withdrawal
  const getWithdrawalHandicap = (skipperIndex: number): number => {
    const skipper = skippers[skipperIndex];
    if (!skipper || !skipper.withdrawnFromRace) return 0;

    const withdrawalRace = skipper.withdrawnFromRace;
    // Get the handicap used in the race they withdrew from
    return getHandicapUsedForRace(withdrawalRace, skipperIndex) || skipper.startHcap || 0;
  };

  const isRaceComplete = (race: number) => {
    return skippers.every((_, index) => {
      // Check if skipper has a result
      const result = getResult(race, index);
      if (result && (result.position !== null || result.letterScore)) {
        return true;
      }

      // Check if skipper is withdrawn for this race
      if (isSkipperWithdrawn(index, race)) {
        return true;
      }

      return false;
    });
  };

  const handleCellClick = (race: number, skipperIndex: number) => {
    setSelectedCell({ race, skipperIndex });
  };

  const getNextPosition = (race: number) => {
    const raceResults_current = raceResults.filter(r => r.race === race);
    const finishingResults = raceResults_current.filter(r => !r.letterScore && r.position !== null);
    
    // Return the next consecutive position (1, 2, 3, etc.)
    const positions = finishingResults.map(r => r.position).filter(p => p !== null).sort((a, b) => a - b);
    
    // Find the next available consecutive position
    for (let i = 1; i <= positions.length + 1; i++) {
      if (!positions.includes(i)) {
        return i;
      }
    }
    
    return positions.length + 1;
  };

  const handleTouchScore = (skipperIndex: number) => {
    const currentRace = lastCompletedRace + 1;
    
    // For manual handicap races, start from R1
    if (hasManualHandicaps && currentRace === 1) {
      const nextPosition = getNextPosition(currentRace);
      updateRaceResults(currentRace, skipperIndex, nextPosition);
      return;
    }
    
    // For seeded races, need R1 to be completed first before R2
    if (currentRace === 2 && !canEnterRace2) {
      return;
    }
    
    const nextPosition = getNextPosition(currentRace);
    updateRaceResults(currentRace, skipperIndex, nextPosition);
  };

  const handleLetterScore = (letterScore: LetterScore | null, customPoints?: number) => {
    if (showLetterScoreSelector) {
      // For RDG and DPI, custom points can be provided
      // Position should always be null for letter scores
      updateRaceResults(
        showLetterScoreSelector.race,
        showLetterScoreSelector.skipperIndex,
        null, // position is always null for letter scores
        letterScore || undefined,
        customPoints
      );
      setShowLetterScoreSelector(null);
    }
  };

  const handleWithdrawFromEvent = () => {
    if (showLetterScoreSelector && updateSkipper) {
      const { race, skipperIndex } = showLetterScoreSelector;
      const skipperName = skippers[skipperIndex]?.name || 'Skipper';

      console.log('🚫 Withdrawing skipper:', { skipperName, race, skipperIndex });

      // Update the skipper to mark them as withdrawn from this race onwards
      updateSkipper(skipperIndex, { withdrawnFromRace: race });

      setShowLetterScoreSelector(null);
    } else {
      console.error('❌ Cannot withdraw - missing updateSkipper or showLetterScoreSelector', {
        hasUpdateSkipper: !!updateSkipper,
        showLetterScoreSelector
      });
    }
  };

  const getLetterScorePoints = (letterScore: LetterScore, race: number): number => {
    // Use total number of skippers as baseline (same as scratch racing)
    // RRS Appendix A scoring: letter score points = number of starters + 1
    // This ensures consistency with scratch racing
    return skippers.length + 1;
  };

  const getLetterScoreColor = (letterScore: LetterScore) => {
    switch (letterScore) {
      case 'DNS': return 'bg-red-600 text-white';
      case 'DNF': return 'bg-orange-600 text-white';
      case 'DSQ': return 'bg-purple-600 text-white';
      case 'RDG': return 'bg-yellow-600 text-black';
      case 'OCS': return 'bg-pink-600 text-white';
      case 'WDN': return 'bg-blue-600 text-white'; // Same as regular position scores
      default: return 'bg-slate-600 text-white';
    }
  };

  // Calculate number of drops based on completed races
  const getDropCount = (completedRaces: number): number => {
    console.log('🎯 getDropCount called:', { completedRaces, dropRules, dropRulesType: typeof dropRules });

    // Handle SHRS discard calculation
    if (typeof dropRules === 'string' && dropRules === 'shrs') {
      return calculateSHRSDiscards(completedRaces);
    }

    // Handle HMS or custom drop rules (array format)
    if (!dropRules || (Array.isArray(dropRules) && dropRules.length === 0)) {
      console.log('⚠️ No drop rules or empty array, returning 0');
      return 0;
    }

    // HMS uses similar rules but may have different configuration
    if (typeof dropRules === 'string' && dropRules === 'hms') {
      // HMS typically uses: 1 discard after 3 races, 2 after 6, etc.
      // This can be configured but we'll use a default pattern
      if (completedRaces < 3) return 0;
      if (completedRaces < 6) return 1;
      return 2 + Math.floor((completedRaces - 6) / 6);
    }

    // Array-based drop rules
    if (Array.isArray(dropRules)) {
      let drops = 0;
      for (const rule of dropRules) {
        if (completedRaces >= rule) {
          drops++;
        } else {
          break;
        }
      }
      console.log('✅ Drop count calculated:', { drops, completedRaces, dropRules });
      return drops;
    }

    console.log('⚠️ No matching drop rules type, returning 0');
    return 0;
  };

  // Check if a race result should be shown as dropped
  const isRaceDropped = (skipperIndex: number, race: number): boolean => {
    if (lastCompletedRace < 4) return false; // No drops until 4 races completed

    const skipperResults = raceResults.filter(r => r.skipperIndex === skipperIndex && r.race <= lastCompletedRace);
    const scores = skipperResults.map(result => {
      if (result.customPoints !== undefined && result.customPoints !== null) {
        return { race: result.race, score: result.customPoints, isDNE: result.letterScore === 'DNE', isLetterScore: !!result.letterScore };
      } else if (result.letterScore) {
        return { race: result.race, score: getLetterScorePoints(result.letterScore, result.race), isDNE: result.letterScore === 'DNE', isLetterScore: true };
      }
      // Use stored position (which is already the corrected position in handicap racing)
      return { race: result.race, score: result.position || 0, isDNE: false, isLetterScore: false };
    });

    const dropCount = getDropCount(lastCompletedRace);
    if (dropCount === 0) return false;

    // Separate DNE scores and other letter scores from droppable regular scores
    const dneScores = scores.filter(s => s.isDNE);
    const letterScores = scores.filter(s => s.isLetterScore && !s.isDNE);
    const regularScores = scores.filter(s => !s.isLetterScore);

    // Letter scores (except DNE) should be dropped first if they're worst, then worst regular scores
    const droppableScores = [...letterScores, ...regularScores];

    // Sort droppable scores by value (highest first) and drop the worst ones
    const sortedDroppableScores = [...droppableScores].sort((a, b) => b.score - a.score);
    const droppedRaces = sortedDroppableScores.slice(0, Math.min(dropCount, droppableScores.length)).map(s => s.race);

    return droppedRaces.includes(race);
  };

  // Calculate handicap-corrected position for a skipper in a specific race
  const getHandicapCorrectedPosition = (skipperIndex: number, race: number): number => {
    const raceData = raceResults.filter(r => r.race === race);
    if (raceData.length === 0) return 0;

    const result = raceData.find(r => r.skipperIndex === skipperIndex);
    if (!result || result.position === null || result.letterScore) {
      return result?.position || 0; // Return raw position for letter scores
    }

    // Get all finishers in this race (excluding letter scores)
    const finishers = raceData
      .filter(r => r.position !== null && !r.letterScore)
      .map(r => ({
        skipperIndex: r.skipperIndex,
        position: r.position,
        handicap: r.handicap || 0
      }))
      .sort((a, b) => a.position - b.position); // Sort by finishing order

    // Calculate corrected positions by sorting by handicap
    // Lower handicap = faster boat, so they get bonus points
    const correctedOrder = finishers
      .map((f, idx) => ({
        ...f,
        // Corrected score = position - (handicap / 10)
        // This gives advantage to boats with lower handicaps
        correctedScore: f.position - (f.handicap / 10)
      }))
      .sort((a, b) => a.correctedScore - b.correctedScore);

    // Find the skipper's corrected position
    const correctedPosition = correctedOrder.findIndex(f => f.skipperIndex === skipperIndex) + 1;
    return correctedPosition || result.position;
  };

  const calculateTotalPoints = (skipperIndex: number): number => {
    let total = 0;

    // Calculate points for each race (including withdrawn races)
    for (let race = 1; race <= lastCompletedRace; race++) {
      const result = getResult(race, skipperIndex);

      if (result) {
        // Skipper has a recorded result for this race
        if (result.customPoints !== undefined && result.customPoints !== null) {
          total += result.customPoints;
        } else if (result.letterScore) {
          total += getLetterScorePoints(result.letterScore, race);
        } else {
          total += result.position || 0;
        }
      } else if (isSkipperWithdrawn(skipperIndex, race)) {
        // Skipper has withdrawn - automatically add skippers+1
        total += skippers.length + 1;
      }
    }

    return total;
  };

  const calculateNetPoints = (skipperIndex: number): number => {
    let scores: Array<{ race: number; score: number; isDNE: boolean; isLetterScore: boolean }> = [];

    // Build scores array for all completed races (including withdrawn races)
    for (let race = 1; race <= lastCompletedRace; race++) {
      const result = getResult(race, skipperIndex);

      if (result) {
        // Skipper has a recorded result for this race
        if (result.customPoints !== undefined && result.customPoints !== null) {
          scores.push({ race, score: result.customPoints, isDNE: result.letterScore === 'DNE', isLetterScore: !!result.letterScore });
        } else if (result.letterScore) {
          scores.push({ race, score: getLetterScorePoints(result.letterScore, race), isDNE: result.letterScore === 'DNE', isLetterScore: true });
        } else {
          scores.push({ race, score: result.position || 0, isDNE: false, isLetterScore: false });
        }
      } else if (isSkipperWithdrawn(skipperIndex, race)) {
        // Skipper has withdrawn - automatically add skippers+1 as a regular score
        scores.push({ race, score: skippers.length + 1, isDNE: false, isLetterScore: false });
      }
    }

    if (scores.length === 0) return 0;

    const dropCount = getDropCount(scores.length);

    if (dropCount === 0) {
      return scores.reduce((sum, s) => sum + s.score, 0);
    }

    // Separate DNE scores and other letter scores from droppable regular scores
    const dneScores = scores.filter(s => s.isDNE);
    const letterScores = scores.filter(s => s.isLetterScore && !s.isDNE);
    const regularScores = scores.filter(s => !s.isLetterScore);

    // Letter scores (except DNE) should be dropped first if they're worst, then worst regular scores
    const droppableScores = [...letterScores, ...regularScores];

    // Sort droppable scores by value (highest first) and drop the worst ones
    const sortedDroppableScores = [...droppableScores].sort((a, b) => b.score - a.score);
    const keptDroppableScores = sortedDroppableScores.slice(Math.min(dropCount, droppableScores.length));

    // Keep all DNE scores and non-dropped droppable scores
    const keptScores = [...dneScores, ...keptDroppableScores];

    return keptScores.reduce((sum, s) => sum + s.score, 0);
  };

  // Countback comparison function for tied net scores
  const compareSkippersWithCountback = (a: any, b: any): number => {
    // First compare by net score (lower is better)
    if (a.netPoints !== b.netPoints) {
      return a.netPoints - b.netPoints;
    }

    // If net scores are tied, apply countback rules
    // Count the number of 1st places, 2nd places, 3rd places, etc. (excluding dropped races)
    const aPositionCounts: number[] = [];
    const bPositionCounts: number[] = [];
    let lastRaceAPosition: number | null = null;
    let lastRaceBPosition: number | null = null;

    for (let race = 1; race <= lastCompletedRace; race++) {
      const aResult = raceResults.find(r => r.race === race && r.skipperIndex === a.index);
      const bResult = raceResults.find(r => r.race === race && r.skipperIndex === b.index);

      const aIsDropped = isRaceDropped(a.index, race);
      const bIsDropped = isRaceDropped(b.index, race);

      // Use stored positions (which are already corrected in handicap racing)
      const aPos = aResult?.position || null;
      const bPos = bResult?.position || null;

      // Only count actual finishing positions (not letter scores) for countback, excluding dropped races
      if (aResult && aResult.position !== null && !aResult.letterScore && !aIsDropped && aPos) {
        aPositionCounts.push(aPos);
      }

      if (bResult && bResult.position !== null && !bResult.letterScore && !bIsDropped && bPos) {
        bPositionCounts.push(bPos);
      }

      // Track last race positions (including dropped, for final tiebreaker)
      if (aResult && aResult.position !== null && !aResult.letterScore && aPos) {
        lastRaceAPosition = aPos;
      }
      if (bResult && bResult.position !== null && !bResult.letterScore && bPos) {
        lastRaceBPosition = bPos;
      }
    }

    // Sort positions (best to worst)
    aPositionCounts.sort((x, y) => x - y);
    bPositionCounts.sort((x, y) => x - y);

    // Count how many 1sts, 2nds, 3rds, etc. each skipper has
    const maxPosition = Math.max(...aPositionCounts, ...bPositionCounts, 1);

    for (let pos = 1; pos <= maxPosition; pos++) {
      const aCount = aPositionCounts.filter(p => p === pos).length;
      const bCount = bPositionCounts.filter(p => p === pos).length;

      if (aCount !== bCount) {
        // More of this position is better (so reverse the comparison)
        return bCount - aCount;
      }
    }

    // If still tied after countback, use last race position as tiebreaker
    if (lastRaceAPosition !== null && lastRaceBPosition !== null && lastRaceAPosition !== lastRaceBPosition) {
      return lastRaceAPosition - lastRaceBPosition;
    }

    // If still tied after last race tiebreaker, compare by total points
    if (a.totalPoints !== b.totalPoints) {
      return a.totalPoints - b.totalPoints;
    }

    // If still tied, maintain original order
    return a.index - b.index;
  };

  // Only sort skippers after races are completed, not during active scoring
  // Key: Save sorted order and reuse it until lastCompletedRace changes
  const sortedSkippers = useMemo(() => {
    console.log('🔍 sortedSkippers recalculating:', {
      lastCompletedRace,
      editingRace,
      lastSortedRaceRef: lastSortedRaceRef.current,
      skippersCount: skippers.length,
      resultsCount: raceResults.length
    });

    // Calculate updated scores for all skippers
    const withScores = skippers.map((skipper, index) => ({
      skipper,
      index,
      skipperIndex: index,
      ...skipper,
      totalPoints: calculateTotalPoints(index),
      netPoints: calculateNetPoints(index)
    }));

    // Don't sort if no races completed yet, or during active race entry
    if (lastCompletedRace === 0 || editingRace !== null) {
      console.log('🔄 No sorting: lastCompletedRace =', lastCompletedRace, 'editingRace =', editingRace);
      return withScores;
    }

    // Check if we need to sort - ONLY sort when lastCompletedRace has increased
    const shouldSort = lastSortedRaceRef.current !== lastCompletedRace;

    if (!shouldSort && sortedOrderRef.current.length > 0) {
      console.log('🔄 No re-sort: lastCompletedRace unchanged at', lastCompletedRace, '(ref =', lastSortedRaceRef.current, ')');
      console.log('📌 Using saved sort order:', sortedOrderRef.current);
      // Reapply the saved sort order with updated scores
      return sortedOrderRef.current
        .map(idx => withScores.find(s => s.index === idx))
        .filter(Boolean) as any[];
    }

    // Sort by net points with countback for ties
    console.log('✅ SORTING SKIPPERS by NET points! lastCompletedRace changed:', lastSortedRaceRef.current, '->', lastCompletedRace);

    const sorted = [...withScores].sort(compareSkippersWithCountback);

    console.log('📊 Sorted order:', sorted.map(s => `${s.name} (NET: ${s.netPoints}, idx: ${s.index})`));

    // Save the sorted order
    sortedOrderRef.current = sorted.map(s => s.index);
    lastSortedRaceRef.current = lastCompletedRace;

    return sorted;
  }, [skippers, raceResults, lastCompletedRace, editingRace]);

  // Get scoring system name based on drop rules
  const getScoringSystemName = () => {
    console.log('📋 getScoringSystemName - dropRules:', dropRules, 'type:', typeof dropRules);
    console.log('📋 currentEvent.heatManagement?.configuration?.scoringSystem:', currentEvent?.heatManagement?.configuration?.scoringSystem);

    // Check if heat management has a scoring system specified (most reliable for heat racing)
    if (currentEvent?.heatManagement?.configuration?.scoringSystem) {
      const heatScoringSystem = currentEvent.heatManagement.configuration.scoringSystem;
      console.log('✅ Using heatManagement scoringSystem:', heatScoringSystem);
      if (heatScoringSystem === 'hms') {
        return 'HMS Heat System';
      } else if (heatScoringSystem === 'shrs') {
        return 'SHRS - Simple Heat Racing System';
      }
    }

    // Check if it's a string (HMS or SHRS)
    if (typeof dropRules === 'string') {
      if (dropRules === 'shrs') {
        return 'SHRS - Simple Heat Racing System';
      } else if (dropRules === 'hms') {
        return 'HMS Heat System';
      }
      return dropRules;
    }

    // Handle array of drop rules
    const rulesString = JSON.stringify(dropRules);
    console.log('📋 rulesString:', rulesString);

    if (rulesString === '[]') {
      console.warn('⚠️ Drop rules is empty array - THIS IS THE PROBLEM!');
      return 'No Discards';
    } else if (rulesString === '[4,8,16,24,32,40]') {
      return 'RRS - Appendix A Scoring System';
    } else if (rulesString === '[4,8,12,16,20,24,28,32,36,40]') {
      return 'Low Point System';
    } else {
      return `Custom - ${Array.isArray(dropRules) ? dropRules.join(', ') : dropRules}`;
    }
  };

  return (
    <div ref={fullscreenContainerRef} className={`pb-8 no-select ${isFocusMode ? 'bg-slate-900' : ''}`}>
      {/* Fixed Top Right Controls */}
      {!isFocusMode && (
        <div className="fixed top-4 right-[5.9375rem] z-30 flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onReturnToRaceManagement();
            }}
            className={`
              flex items-center justify-center p-2 rounded-lg transition-colors
              ${darkMode
                ? 'text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600'
                : 'text-slate-600 hover:text-slate-800 bg-white hover:bg-slate-50 border border-slate-200'}
            `}
            title="Return to Dashboard"
          >
            <Home size={18} />
          </button>
          <button
            type="button"
            onClick={() => setIsCompactView(!isCompactView)}
            className={`
              flex items-center justify-center p-2 rounded-lg transition-colors
              ${darkMode
                ? isCompactView
                  ? 'text-white bg-blue-600 hover:bg-blue-700'
                  : 'text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600'
                : isCompactView
                  ? 'text-white bg-blue-500 hover:bg-blue-600'
                  : 'text-slate-600 hover:text-slate-800 bg-white hover:bg-slate-50 border border-slate-200'}
            `}
            title={isCompactView ? "Switch to normal view" : "Switch to compact view - Shows more skippers on screen"}
          >
            <Minimize2 size={16} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (onOpenRaceSettings) onOpenRaceSettings();
            }}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors
              ${darkMode
                ? 'text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600'
                : 'text-slate-600 hover:text-slate-800 bg-white hover:bg-slate-50 border border-slate-200'}
            `}
          >
            <Settings size={16} />
            <span className="text-xs font-medium">Settings</span>
          </button>
          {lastCompletedRace >= 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onCompleteScoring();
              }}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold"
            >
              <Trophy size={18} />
              <span className="text-sm font-medium">
                {currentEvent?.multiDay && currentEvent?.numberOfDays && currentDay < currentEvent.numberOfDays
                  ? `Complete Day ${currentDay}`
                  : 'Complete Scoring'}
              </span>
            </button>
          )}
        </div>
      )}

      {/* Multiday indicator (if needed) */}
      {currentEvent?.multiDay && (
        <div className="px-4 pt-4">
          <p className="text-slate-500 text-sm">
            Day {currentDay} of {currentEvent.numberOfDays}
          </p>
        </div>
      )}

      {skippers.length === 0 ? (
        <div className={`text-center py-12 rounded-xl border ${
          darkMode
            ? 'bg-slate-800/50 border-slate-700/50'
            : 'bg-white border-slate-200'
        }`}>
          <Users size={48} className={`mx-auto mb-4 ${darkMode ? 'text-slate-600' : 'text-slate-400'}`} />
          <h3 className={`text-lg font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>No Skippers Added</h3>
          <p className={`mb-6 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Add skippers to start racing</p>
          <button
            onClick={onManageSkippers}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Add Skippers
          </button>
        </div>
      ) : (
        <div className={`backdrop-blur-sm rounded-xl border overflow-hidden mt-4 ${
          darkMode
            ? 'bg-slate-800/50 border-slate-700/50'
            : 'bg-white/95 border-slate-200'
        } ${isCompactView ? 'text-sm' : ''}`}>
          <div ref={tableContainerRef} className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className={`border-b ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                  <th className={`sticky left-0 z-20 text-center ${isCompactView ? 'p-2' : 'p-4'} font-medium ${darkMode ? 'text-slate-300 bg-slate-800/90' : 'text-slate-700 bg-white/90'}`} style={{ minWidth: '80px' }}>Pos</th>
                  <th className={`sticky left-[80px] z-20 text-left ${isCompactView ? 'p-2' : 'p-4'} font-medium ${darkMode ? 'text-slate-300 bg-slate-800/90' : 'text-slate-700 bg-white/90'}`} style={{ minWidth: '200px' }}>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={onManageSkippers}
                        className={`p-1 rounded transition-colors ${darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}
                        title="Manage Skippers"
                      >
                        <Users size={16} className="text-blue-400" />
                      </button>
                      <span>Skipper</span>
                    </div>
                  </th>
                  <th className={`sticky left-[280px] z-20 text-center ${isCompactView ? 'p-2' : 'p-4'} font-medium ${darkMode ? 'text-slate-300 bg-slate-800/90' : 'text-slate-700 bg-white/90'}`} style={{ minWidth: '100px' }}>Sail No</th>
                  <th className={`sticky left-[380px] z-20 text-center ${isCompactView ? 'p-2' : 'p-4'} font-medium ${darkMode ? 'text-slate-300 bg-slate-800/90' : 'text-slate-700 bg-white/90'}`} style={{ minWidth: '100px', boxShadow: '2px 0 4px rgba(0,0,0,0.1)' }}>
                    <div className="flex items-center justify-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-amber-400"></div>
                      H'cap
                    </div>
                  </th>
                  {/* Conditional columns based on event settings */}
                  {currentEvent?.show_club_state && (
                    <th className={`text-center ${isCompactView ? 'p-2' : 'p-4'} font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`} style={{ minWidth: '100px' }}>Club</th>
                  )}
                  {currentEvent?.show_design && (
                    <th className={`text-center ${isCompactView ? 'p-2' : 'p-4'} font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`} style={{ minWidth: '120px' }}>Design</th>
                  )}
                  {Array.from({ length: numRaces }, (_, i) => {
                    const race = i + 1;
                    const nextRace = race + 1;

                    // Check if the next race has started (any results entered for it)
                    const nextRaceHasStarted = raceResults.some(r => r.race === nextRace);

                    // For handicap scoring: Only allow clearing the last completed race
                    // and only if the next race hasn't started yet
                    const canClearThisRace = race === lastCompletedRace && !nextRaceHasStarted;

                    return (
                      <th key={race} className={`text-center ${isCompactView ? 'p-2' : 'p-4'} ${darkMode ? 'text-slate-300' : 'text-slate-700'} font-medium`}>
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-xs">R{race}</span>
                          {canClearThisRace && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleClearRace(race);
                              }}
                              className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      </th>
                    );
                  })}
                  <th className="text-center p-4 text-slate-300 font-medium">Total</th>
                  <th className="text-center p-4 text-slate-300 font-medium uppercase tracking-wider">
                    Net
                  </th>
                </tr>
                {/* Scratch Carry-Over Row */}
                <tr className={`border-b ${darkMode ? 'border-slate-700/30 bg-slate-800/50' : 'border-slate-200/30 bg-slate-50/50'}`}>
                  <th className="sticky left-0 z-20" colSpan={4}></th>
                  {Array.from({ length: numRaces }, (_, i) => {
                    const race = i + 1;
                    const raceData = raceResults.filter(r => r.race === race);

                    // Get current handicaps for this race
                    const currentHcaps = skippers.map((_, idx) => {
                      if (race === 1) {
                        return skippers[idx].startHcap;
                      }
                      const prevRaceResults = raceResults.filter(r => r.race === race - 1);
                      const prevResult = prevRaceResults.find(r => r.skipperIndex === idx);
                      return prevResult?.adjustedHcap ?? skippers[idx].startHcap;
                    });

                    // Find scratch boats in top 3
                    const positions = raceData
                      .filter(r => r.position !== null || r.letterScore === 'RDGfix')
                      .map(r => ({
                        position: r.position,
                        skipperIndex: r.skipperIndex,
                        skipperName: skippers[r.skipperIndex]?.name || '',
                        isOnScratch: currentHcaps[r.skipperIndex] <= 10
                      }))
                      .sort((a, b) => a.position - b.position);

                    const bestScratchInTop3 = positions
                      .filter(p => p.isOnScratch && p.position >= 1 && p.position <= 3)
                      .sort((a, b) => a.position - b.position)[0];

                    let scratchBoatBonus = 0;
                    if (bestScratchInTop3) {
                      const scratchBoatHandicap = currentHcaps[bestScratchInTop3.skipperIndex];
                      const baseBonus = 30 - scratchBoatHandicap;
                      if (bestScratchInTop3.position === 1) scratchBoatBonus = baseBonus;
                      else if (bestScratchInTop3.position === 2) scratchBoatBonus = Math.max(0, baseBonus - 10);
                      else if (bestScratchInTop3.position === 3) scratchBoatBonus = Math.max(0, baseBonus - 20);
                    }

                    return (
                      <th key={race} className={`text-center px-2 py-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        {scratchBoatBonus > 0 && bestScratchInTop3 && (
                          <div className="text-[10px] italic font-normal" title={`${bestScratchInTop3.skipperName} finished ${bestScratchInTop3.position}${bestScratchInTop3.position === 1 ? 'st' : bestScratchInTop3.position === 2 ? 'nd' : 'rd'} on scratch`}>
                            +{scratchBoatBonus}s
                          </div>
                        )}
                      </th>
                    );
                  })}
                  <th colSpan={2}></th>
                </tr>
              </thead>
              <tbody>
                {sortedSkippers.map((skipper, sortedIndex) => {
                  const index = skipper.index;
                  return (
                    <tr key={index} className={`border-b transition-colors ${isCompactView ? 'h-12' : 'h-16'} ${darkMode ? 'border-slate-700/50 hover:bg-slate-700/30' : 'border-slate-200/50 hover:bg-slate-50'}`}>
                      {/* Position */}
                      <td className={`sticky left-0 z-10 ${isCompactView ? 'py-1.5 px-2' : 'py-3 px-4'} ${darkMode ? 'bg-slate-800/90' : 'bg-white/90'}`}>
                        <div className="flex items-center justify-center">
                          <div className={`
                            ${isCompactView ? 'w-6 h-6 text-xs' : 'w-8 h-8 text-base'} rounded-full flex items-center justify-center text-white font-bold
                            ${sortedIndex === 0 ? 'bg-yellow-500' :
                              sortedIndex === 1 ? 'bg-gray-400' :
                              sortedIndex === 2 ? 'bg-amber-600' :
                              'bg-gray-500'}
                          `}>
                            {sortedIndex + 1}
                          </div>
                        </div>
                      </td>

                      {/* Skipper Info */}
                      <td className={`sticky left-[80px] z-10 ${isCompactView ? 'py-1.5 px-2' : 'py-3 px-4'} ${darkMode ? 'bg-slate-800/90' : 'bg-white/90'}`}>
                        <div className="flex items-center gap-3">
                          {/* Flag (if event shows flag) */}
                          {currentEvent?.show_flag && skipper.country_code && (
                            <div className="flex-shrink-0 text-3xl">
                              {getCountryFlag(skipper.country_code)}
                            </div>
                          )}
                          {/* Avatar */}
                          <div className="flex-shrink-0">
                            {skipper.avatarUrl ? (
                              <img
                                src={skipper.avatarUrl}
                                alt={skipper.name}
                                className="w-10 h-10 rounded-full object-cover border-2 border-slate-600"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm bg-slate-700 text-slate-300">
                                {skipper.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                              </div>
                            )}
                          </div>
                          {/* Name and Info */}
                          <div className="flex-1 min-w-0">
                            <div className={`font-medium ${isCompactView ? 'text-sm' : ''} ${darkMode ? 'text-white' : 'text-slate-900'}`}>{skipper.name}</div>
                            {!isCompactView && (
                              <>
                                <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                  {skipper.hull || 'No boat info'}
                                </div>
                                {skipper.club && (
                                  <div className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                    {abbreviateClubName(skipper.club)}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Sail Number */}
                      <td className={`sticky left-[280px] z-10 ${isCompactView ? 'py-1.5 px-2' : 'py-3 px-4'} ${darkMode ? 'bg-slate-800/90' : 'bg-white/90'}`}>
                        <div className="text-center">
                          <span className={`font-bold text-lg ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                            {currentEvent?.show_country && skipper.country_code && (
                              <span className={`font-bold text-lg mr-1 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                                {getIOCCode(skipper.country_code)}
                              </span>
                            )}
                            {skipper.sailNo || '—'}
                          </span>
                        </div>
                      </td>

                      {/* Handicap */}
                      <td className={`sticky left-[380px] z-10 ${isCompactView ? 'px-2 py-2' : 'px-4 py-4'} text-center ${darkMode ? 'bg-slate-800/90' : 'bg-white/90'}`} style={{ boxShadow: '2px 0 4px rgba(0,0,0,0.1)' }}>
                        {!hasR1BeenScored ? (
                          // Show manual handicap input before R1 is scored
                          <div className="flex items-center justify-center">
                            <input
                              type="number"
                              value={manualHandicaps[index] || ''}
                              onChange={(e) => handleManualHandicapChange(index, e.target.value)}
                              onFocus={(e) => e.target.select()}
                              placeholder="0"
                              className="w-16 px-2 py-1 text-center rounded border bg-slate-700 text-white border-slate-600 placeholder-slate-400"
                              min="0"
                              max="300"
                              step="10"
                            />
                            <span className="text-slate-400 text-xs ml-1">s</span>
                          </div>
                        ) : (
                          // Show next race handicap after R1 is scored (blue color for manual, amber for calculated)
                          <div className="flex items-center justify-center">
                            <span className={`font-bold text-lg ${hasManualHandicaps ? 'text-blue-400' : 'text-amber-400'}`}>
                              {getCurrentHandicap(index)}s
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Conditional columns based on event settings */}
                      {currentEvent?.show_club_state && (
                        <td className={`${isCompactView ? 'py-1.5 px-2' : 'py-3 px-4'} text-center`}>
                          <div className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                            {skipper.club ? abbreviateClubName(skipper.club) : '—'}
                            {skipper.state && (
                              <div className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                {skipper.state}
                              </div>
                            )}
                          </div>
                        </td>
                      )}
                      {currentEvent?.show_design && (
                        <td className={`${isCompactView ? 'py-1.5 px-2' : 'py-3 px-4'} text-center`}>
                          <div className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                            {skipper.hull || skipper.boat?.design_name || skipper.boatType || '—'}
                          </div>
                        </td>
                      )}

                      {/* Race Results */}
                      {Array.from({ length: numRaces }, (_, raceIndex) => {
                        const race = raceIndex + 1;
                        const result = getResult(race, index);
                        const isActiveRace = race === lastCompletedRace + 1 || editingRace === race;
                        const isDropped = isRaceDropped(index, race);
                        const hasResult = result && (result.position !== null || result.letterScore);
                        const isCompleted = hasResult && race <= lastCompletedRace && editingRace !== race;

                        if (isCompleted) {
                          // Get the handicap that was used for this race
                          const raceHandicap = getHandicapUsedForRace(race, index);

                          return (
                            <td key={race} className={`${isCompactView ? 'p-1' : 'p-2'} text-center`}>
                              <div
                                className={`${isCompactView ? 'w-10 h-10 text-xs' : 'w-12 h-12 text-sm'} flex items-center justify-center font-medium rounded mx-auto relative overflow-hidden cursor-default`}
                                title="Race completed (click Clear Race to edit)"
                              >
                                {result?.letterScore && result?.letterScore !== 'WDN' ? (
                                  <span className={`text-white font-bold ${isDropped ? 'line-through opacity-50' : ''}`}>
                                    {result?.customPoints !== undefined && result?.customPoints !== null
                                      ? result.customPoints
                                      : getLetterScorePoints(result?.letterScore, race)}
                                  </span>
                                ) : (
                                  <>
                                    {/* Diagonal line from bottom-left to top-right */}
                                    <div
                                      className="absolute inset-0 pointer-events-none"
                                      style={{
                                        background: `linear-gradient(to top right, transparent calc(50% - 0.5px), ${darkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.4)'} calc(50% - 0.5px), ${darkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.4)'} calc(50% + 0.5px), transparent calc(50% + 0.5px))`
                                      }}
                                    />
                                    {/* Handicap in top-right */}
                                    <span
                                      className={`absolute top-0.5 right-1 text-[10px] text-slate-400 font-semibold ${isDropped ? 'opacity-30' : 'opacity-70'}`}
                                    >
                                      {raceHandicap !== null ? `${raceHandicap}s` : ''}
                                    </span>
                                    {/* Points in bottom-left (show points for WDN too) */}
                                    <span className={`absolute bottom-0.5 left-1 text-white font-bold ${isDropped ? 'line-through opacity-50' : ''}`}>
                                      {result?.letterScore === 'WDN'
                                        ? (result?.customPoints !== undefined && result?.customPoints !== null
                                            ? result.customPoints
                                            : getLetterScorePoints(result?.letterScore, race))
                                        : (result?.position || '–')}
                                    </span>
                                  </>
                                )}
                              </div>
                            </td>
                          );
                        }

                        // Check if skipper has withdrawn from the event for this race
                        const skipperWithdrawn = isSkipperWithdrawn(index, race);

                        return (
                          <td key={race} className={`${isCompactView ? 'py-1 px-1' : 'py-3 px-2'} text-center`}>
                            <div className="flex items-center justify-center mx-auto">
                              {result && result.letterScore === 'WDN' ? (
                                // Withdrawn skippers with WDN - render as non-clickable completed score
                                (() => {
                                  const raceHandicap = getHandicapUsedForRace(race, index);
                                  return (
                                    <div
                                      className={`${isCompactView ? 'w-10 h-10 text-xs' : 'w-12 h-12 text-sm'} rounded-xl font-bold relative overflow-hidden flex items-center justify-center cursor-default`}
                                      title="Withdrawn from race"
                                    >
                                      {/* Diagonal line from bottom-left to top-right */}
                                      <div
                                        className="absolute inset-0 pointer-events-none"
                                        style={{
                                          background: `linear-gradient(to top right, transparent calc(50% - 0.5px), ${darkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.4)'} calc(50% - 0.5px), ${darkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.4)'} calc(50% + 0.5px), transparent calc(50% + 0.5px))`
                                        }}
                                      />
                                      {/* Handicap in top-right */}
                                      <span
                                        className={`absolute top-0.5 right-1 text-[10px] text-slate-400 font-semibold ${isDropped ? 'opacity-30' : 'opacity-70'}`}
                                      >
                                        {raceHandicap !== null ? `${raceHandicap}s` : ''}
                                      </span>
                                      {/* Points in bottom-left */}
                                      <span className={`absolute bottom-0.5 left-1 font-bold ${isDropped ? 'line-through opacity-50' : ''} ${
                                        darkMode ? 'text-white' : 'text-slate-900'
                                      }`}>
                                        {result.customPoints !== undefined && result.customPoints !== null
                                          ? result.customPoints
                                          : getLetterScorePoints(result.letterScore, race)}
                                      </span>
                                    </div>
                                  );
                                })()
                              ) : result ? (
                                (() => {
                                  // Get the handicap that was used for this race
                                  const raceHandicap = getHandicapUsedForRace(race, index);

                                  return (
                                    <button
                                      onClick={() => deleteRaceResult(race, index)}
                                      className={`
                                        ${isCompactView ? 'w-14 h-14 text-lg' : 'w-16 h-16 text-lg'} rounded-xl font-bold transition-all relative overflow-hidden
                                        ${result.letterScore
                                          ? getLetterScoreColor(result.letterScore)
                                          : `bg-blue-600 text-white hover:bg-blue-700 ${
                                              isDropped ? 'opacity-50' : ''
                                            }`
                                        }
                                      `}
                                    >
                                      {result.letterScore ? (
                                        <span className={isDropped ? 'line-through' : ''}>
                                          {result.customPoints !== undefined && result.customPoints !== null
                                            ? result.customPoints
                                            : getLetterScorePoints(result.letterScore, race)}
                                        </span>
                                      ) : (
                                        <>
                                          {/* Diagonal line from bottom-left to top-right */}
                                          <div
                                            className="absolute inset-0 pointer-events-none"
                                            style={{
                                              background: `linear-gradient(to top right, transparent calc(50% - 0.5px), rgba(255, 255, 255, 0.3) calc(50% - 0.5px), rgba(255, 255, 255, 0.3) calc(50% + 0.5px), transparent calc(50% + 0.5px))`
                                            }}
                                          />
                                          {/* Handicap in top-right */}
                                          <span
                                            className={`absolute top-1 right-1.5 text-[11px] text-slate-400 font-bold ${isDropped ? 'opacity-40' : 'opacity-90'}`}
                                          >
                                            {raceHandicap !== null ? `${raceHandicap}s` : ''}
                                          </span>
                                          {/* Points in bottom-left */}
                                          <span className={`absolute bottom-1 left-1.5 text-white font-bold text-xl ${isDropped ? 'line-through' : ''}`}>
                                            {result.position}
                                          </span>
                                        </>
                                      )}
                                      {isActiveRace && (
                                        <div
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setShowLetterScoreSelector({ race, skipperIndex: index });
                                          }}
                                          className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors flex items-center justify-center text-xs shadow-lg border border-slate-500 cursor-pointer"
                                          title="Letter Score"
                                          role="button"
                                          tabIndex={0}
                                        >
                                          ⋯
                                        </div>
                                      )}
                                    </button>
                                  );
                                })()
                              ) : skipperWithdrawn ? (
                                // Show withdrawn skipper result with split cell (no background, just like empty cells with data)
                                <div
                                  className={`${isCompactView ? 'w-10 h-10 text-xs' : 'w-12 h-12 text-sm'} rounded-xl font-bold relative overflow-hidden flex items-center justify-center`}
                                  title="Withdrawn from event"
                                >
                                  {/* Diagonal line from bottom-left to top-right */}
                                  <div
                                    className="absolute inset-0 pointer-events-none"
                                    style={{
                                      background: `linear-gradient(to top right, transparent calc(50% - 0.5px), ${darkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.4)'} calc(50% - 0.5px), ${darkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.4)'} calc(50% + 0.5px), transparent calc(50% + 0.5px))`
                                    }}
                                  />
                                  {/* Handicap in top-right */}
                                  <span className={`absolute top-0.5 right-1 text-[10px] font-semibold opacity-70 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                    {getWithdrawalHandicap(index)}s
                                  </span>
                                  {/* Position (skippers + 1) in bottom-left */}
                                  <span className={`absolute bottom-0.5 left-1 font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                                    {skippers.length + 1}
                                  </span>
                                </div>
                              ) : isActiveRace && !skipperWithdrawn ? (
                                <button
                                  onClick={() => handleTouchScore(index)}
                                  className="w-16 h-16 rounded-xl border-2 border-dashed border-blue-400 bg-slate-800/50 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all font-bold text-lg relative group"
                                >
                                  {/* Show next position on hover */}
                                  <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white font-bold text-lg">
                                    {getNextPosition(race)}
                                  </span>

                                  {/* Checkered flag icon - same color as border */}
                                  <Flag size={20} className="absolute inset-0 m-auto text-blue-400 opacity-30 group-hover:opacity-0 transition-opacity" />

                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setShowLetterScoreSelector({ race, skipperIndex: index });
                                    }}
                                    className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-slate-700 text-slate-300 hover:bg-green-600 transition-colors flex items-center justify-center text-sm shadow-lg border border-slate-500"
                                    title="Letter Score"
                                  >
                                    +
                                  </button>
                                </button>
                              ) : (
                                <span className="text-slate-500 text-xs">—</span>
                              )}
                            </div>
                          </td>
                        );
                      })}

                      {/* Total Points */}
                      <td className="py-3 px-4 text-center font-bold text-lg text-white">
                        {calculateTotalPoints(index)}
                      </td>

                      {/* Net Points */}
                      <td className="py-3 px-4 text-center text-xl font-bold text-white">
                        {calculateNetPoints(index)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Scoring System Display */}
          <div className="mt-4 px-4 flex justify-end">
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg ${
              darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-700'
            }`}>
              <Award size={16} />
              <span className="text-sm font-medium">Scoring System:</span>
              <span className="text-sm">{getScoringSystemName()}</span>
            </div>
          </div>
        </div>
      )}

      {/* Race Input Modal */}
      {selectedCell && (
        <RaceInput
          race={selectedCell.race}
          skipperIndex={selectedCell.skipperIndex}
          skipper={skippers[selectedCell.skipperIndex]}
          onClose={() => setSelectedCell(null)}
          onSubmit={(position, letterScore, customPoints) => {
            updateRaceResults(selectedCell.race, selectedCell.skipperIndex, position, letterScore, customPoints);
            setSelectedCell(null);
          }}
          darkMode={darkMode}
          raceNumber={selectedCell.race}
          currentPosition={getResult(selectedCell.race, selectedCell.skipperIndex)?.position}
          currentLetterScore={getResult(selectedCell.race, selectedCell.skipperIndex)?.letterScore}
          getNextPosition={() => getNextPosition(selectedCell.race)}
        />
      )}

      {/* Letter Score Selector */}
      {showLetterScoreSelector && (() => {
        const { race, skipperIndex } = showLetterScoreSelector;

        // Get previous race results for average points calculation
        const skipperPreviousResults: Array<{ position: number | null; letterScore?: string; customPoints?: number; points: number }> = [];

        for (let r = 1; r < race; r++) {
          const result = currentEvent.raceResults?.[r]?.[skipperIndex];
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
              // Calculate letter score points
              const numFinishers = currentEvent.raceResults?.[r]?.filter((res: any) => res.position).length || 0;
              const totalCompetitors = skippers.length;
              points = getLetterScorePoints(letterScore as LetterScore, r);
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
            isOpen={showLetterScoreSelector !== null}
            onClose={() => setShowLetterScoreSelector(null)}
            onSelect={handleLetterScore}
            onWithdrawFromEvent={updateSkipper ? handleWithdrawFromEvent : undefined}
            skipperName={skippers[skipperIndex]?.name || ''}
            raceNumber={race}
            darkMode={darkMode}
            skipperPreviousResults={skipperPreviousResults}
          />
        );
      })()}

      {/* Clear Race Confirmation Modal */}
      <ConfirmationModal
        isOpen={raceToDelete !== null}
        onClose={handleCancelClearRace}
        onConfirm={handleConfirmClearRace}
        title="Clear Race Results"
        message={`Are you sure you want to delete all results from R${raceToDelete}? This action cannot be undone.`}
        confirmText="Clear Race"
        cancelText="Cancel"
        darkMode={darkMode}
      />
    </div>
  );
};