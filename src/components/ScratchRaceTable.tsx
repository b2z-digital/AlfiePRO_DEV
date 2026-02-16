import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Users, TrendingUp, Home, X, Settings, Flag, Timer, Award, Moon, Sun, RefreshCw, Trophy, Maximize2, Minimize2 } from 'lucide-react';
import { SettingsDropdown } from './Controls';
import { Skipper, LetterScore } from '../types';
import { calculateScratchResults, applyDropRules } from '../utils/scratchCalculations';
import { LetterScoreSelector } from './LetterScoreSelector';
import { RaceEvent } from '../types/race';
import { formatDate } from '../utils/date';
import { recalculateRacePositions } from '../utils/scratchCalculations';
import { ConfirmationModal } from './ConfirmationModal';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../contexts/NotificationContext';
import { getCountryFlag, getIOCCode } from '../utils/countryFlags';

// Helper function to get boat information from skipper data
const getBoatInfo = (skipper: Skipper) => {
  // Try different possible field structures for boat data
  const sailNumber = skipper.sailNumber ||
                    skipper.boat?.sailNumber ||
                    skipper.boat?.sail_number ||
                    skipper.boat_sail_number ||
                    null;

  const boatType = skipper.boatType ||
                  skipper.boat?.type ||
                  skipper.boat_type ||
                  null;

  return { sailNumber, boatType };
};

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

interface ScratchRaceTableProps {
  skippers: Skipper[];
  numRaces?: number;
  dropRules: number[];
  updateRaceResults: (race: number, skipperIndex: number, position: number | null, letterScore?: LetterScore, customPoints?: number) => void;
  raceResults: any[];
  enableRaceEditing: (raceNum: number | null) => void;
  lastCompletedRace: number;
  editingRace: number | null;
  deleteRaceResult: (race: number, skipperIndex: number) => void;
  clearRace: (race: number) => void;
  darkMode: boolean;
  onManageSkippers: () => void;
  onShowCharts: () => void;
  onReturnToRaceManagement: () => void;
  onCompleteScoring: () => void;
  currentEvent: RaceEvent | null;
  currentDay: number;
  onToggleDarkMode: () => void;
  onRaceSettingsChange?: (settings: { numRaces: number; dropRules: number[] }) => void;
  onOpenRaceSettings?: () => void;
  onNewSession?: () => void;
  updateSkipper?: (skipperIndex: number, updates: Partial<Skipper>) => void;
  // Heat racing specific props
  isHeatRacing?: boolean;
  currentHeatRound?: number;
}

// Default drop rules - RRS - Appendix A Scoring System
const DEFAULT_DROP_RULES = [4, 8, 16, 24, 32, 40];

export const ScratchRaceTable: React.FC<ScratchRaceTableProps> = ({
  skippers,
  numRaces: initialNumRaces = 12,
  dropRules = DEFAULT_DROP_RULES,
  updateRaceResults,
  raceResults,
  enableRaceEditing,
  lastCompletedRace,
  editingRace,
  deleteRaceResult,
  clearRace,
  darkMode,
  onManageSkippers,
  onShowCharts,
  onReturnToRaceManagement,
  onCompleteScoring,
  currentEvent,
  currentDay,
  onToggleDarkMode,
  onRaceSettingsChange,
  onOpenRaceSettings,
  onNewSession,
  updateSkipper,
  isHeatRacing = false,
  currentHeatRound
}) => {
  // Calculate dynamic number of races based on completion
  const getHighestCompletedRace = () => {
    if (raceResults.length === 0) return 0;
    return Math.max(...raceResults.map(r => r.race));
  };

  const calculateDisplayRaces = () => {
    const highestCompleted = getHighestCompletedRace();
    const baseRaces = initialNumRaces;
    
    // If all current races are completed, add 4 more
    if (highestCompleted >= baseRaces) {
      const additionalSets = Math.floor((highestCompleted - baseRaces) / 4) + 1;
      return baseRaces + (additionalSets * 4);
    }
    
    return Math.max(baseRaces, highestCompleted + 1);
  };

  const displayNumRaces = calculateDisplayRaces();

  const navigate = useNavigate();
  const { addNotification } = useNotifications();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [raceToDelete, setRaceToDelete] = useState<number | null>(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [editingCell, setEditingCell] = useState<{ race: number; skipperIndex: number } | null>(null);
  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [raceToConfirm, setRaceToConfirm] = useState<number | null>(null);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const fullscreenContainerRef = useRef<HTMLDivElement>(null);

  // New state for UX enhancements
  const [isCompactView, setIsCompactView] = useState(false);
  const [activeRaceColumn, setActiveRaceColumn] = useState<number | null>(null);

  const hasResults = raceResults.length > 0;
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const activeRaceRef = useRef<number | null>(null);

  // Auto-scroll to keep active race visible
  useEffect(() => {
    const activeRace = isHeatRacing ? currentHeatRound : lastCompletedRace + 1;

    // Only scroll if active race changed
    if (activeRaceRef.current !== activeRace && tableContainerRef.current) {
      activeRaceRef.current = activeRace;

      // Wait a bit for DOM to update
      setTimeout(() => {
        if (!tableContainerRef.current) return;

        // Find the active race column header
        const raceHeaders = tableContainerRef.current.querySelectorAll('th');
        // Skip first 3 columns (Pos, Skipper, Sail No), find the active race header
        const activeRaceIndex = activeRace + 2; // +2 because array is 0-indexed and we skip 3 columns

        if (raceHeaders[activeRaceIndex]) {
          const headerElement = raceHeaders[activeRaceIndex] as HTMLElement;
          const container = tableContainerRef.current;

          // Calculate scroll position to center the active race column
          const containerWidth = container.clientWidth;
          const headerLeft = headerElement.offsetLeft;
          const headerWidth = headerElement.offsetWidth;

          // Account for sticky columns (Pos, Skipper, Sail No) - approximate width
          const stickyColumnsWidth = 400; // Approximate total width of sticky columns

          // Scroll to show the active race, accounting for sticky columns
          const scrollPosition = headerLeft - stickyColumnsWidth - (containerWidth - stickyColumnsWidth - headerWidth) / 2;

          container.scrollTo({
            left: Math.max(0, scrollPosition),
            behavior: 'smooth'
          });
        }
      }, 100);
    }
  }, [lastCompletedRace, isHeatRacing, currentHeatRound, displayNumRaces]);

  const handleNewSession = () => {
    if (raceResults.length > 0) {
      setShowConfirmDialog(true);
    }
  };

  const handleDashboardClick = () => {
    if (raceResults.length > 0) {
      setShowExitConfirm(true);
    } else {
      navigate('/');
    }
  };

  const [showSettings, setShowSettings] = useState(false);

  const [showLetterScoreSelector, setShowLetterScoreSelector] = useState<{race: number, skipperIndex: number} | null>(null);

  // Check if a race has any results entered (has started)
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

    return isWithdrawn;
  };

  // Handle withdrawal from event
  const handleWithdrawFromEvent = () => {
    if (showLetterScoreSelector && updateSkipper) {
      const { race, skipperIndex } = showLetterScoreSelector;
      const skipperName = skippers[skipperIndex]?.name || 'Skipper';

      // Update the skipper to mark them as withdrawn from this race onwards
      updateSkipper(skipperIndex, { withdrawnFromRace: race });

      setShowLetterScoreSelector(null);
    }
  };

  // Handler for clear race confirmation
  const handleClearRaceClick = (race: number) => {
    setRaceToDelete(race);
  };

  const handleConfirmClearRace = () => {
    if (raceToDelete !== null) {
      clearRace(raceToDelete);
      setRaceToDelete(null);
    }
  };

  const handleCancelClearRace = () => {
    setRaceToDelete(null);
  };

  // Automatically extend races when all current races are completed (except in heat racing mode)
  React.useEffect(() => {
    // DO NOT auto-extend in heat racing mode - heat racing has fixed 12 races per round
    if (!isHeatRacing && lastCompletedRace > 0 && lastCompletedRace >= initialNumRaces) {
      const newNumRaces = initialNumRaces + 1;
      console.log(`Auto-extending races from ${initialNumRaces} to ${newNumRaces}`);
      if (onRaceSettingsChange) {
        onRaceSettingsChange({ numRaces: newNumRaces, dropRules });
      }
    }
  }, [lastCompletedRace, isHeatRacing, initialNumRaces]);

  // Get scoring system name based on drop rules
  const getScoringSystemName = () => {
    // Check if heat management has a scoring system specified (most reliable for heat racing)
    if (currentEvent?.heatManagement?.configuration?.scoringSystem) {
      const heatScoringSystem = currentEvent.heatManagement.configuration.scoringSystem;
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

    if (rulesString === '[]') {
      return 'No Discards';
    } else if (rulesString === '[4,8,16,24,32,40]') {
      return 'RRS - Appendix A Scoring System';
    } else if (rulesString === '[4,8,12,16,20,24,28,32,36,40]') {
      return 'Low Point System';
    } else {
      return `Custom - ${Array.isArray(dropRules) ? dropRules.join(', ') : dropRules}`;
    }
  };

  // Calculate number of drops based on completed races
  const getDropCount = (completedRaces: number): number => {
    // Use the drop rules from props
    if (!dropRules || dropRules.length === 0) return 0;
    
    let drops = 0;
    for (const rule of dropRules) {
      if (completedRaces >= rule) {
        drops++;
      } else {
        break;
      }
    }
    return drops;
  };

  const compareSkippersWithCountback = (a: any, b: any): number => {
    const aNetScore = calculateNetScore(a.skipperIndex);
    const bNetScore = calculateNetScore(b.skipperIndex);

    // First compare by net score (lower is better)
    if (aNetScore.netScore !== bNetScore.netScore) {
      return aNetScore.netScore - bNetScore.netScore;
    }

    // If net scores are tied, apply countback rules
    // Count the number of 1st places, 2nd places, 3rd places, etc.
    const aPositionCounts: number[] = [];
    const bPositionCounts: number[] = [];

    for (let race = 1; race <= lastCompletedRace; race++) {
      const aResult = raceResults.find(r => r.race === race && r.skipperIndex === a.skipperIndex);
      const bResult = raceResults.find(r => r.race === race && r.skipperIndex === b.skipperIndex);

      // Only count actual finishing positions (not letter scores) for countback
      if (aResult && aResult.position !== null && !aResult.letterScore) {
        aPositionCounts.push(aResult.position);
      }

      if (bResult && bResult.position !== null && !bResult.letterScore) {
        bPositionCounts.push(bResult.position);
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

    // If still tied after countback, maintain original order
    return a.skipperIndex - b.skipperIndex;
  };

  // Calculate net score with drops
  const calculateNetScore = (skipperIndex: number, completedRaces?: number): { netScore: number; droppedRaces: number[] } => {
    const racesToConsider = completedRaces || lastCompletedRace;
    const skipperResults = raceResults.filter(r => r.skipperIndex === skipperIndex);
    const scores: { race: number; score: number; isDNE: boolean }[] = [];

    // Calculate score for each race
    for (let race = 1; race <= racesToConsider; race++) {
      const result = skipperResults.find(r => r.race === race);
      let score: number;
      let isDNE = false;

      if (!result) {
        // Check if skipper is withdrawn for this race
        if (isSkipperWithdrawn(skipperIndex, race)) {
          // Skipper has withdrawn - automatically add skippers+1 as a regular score
          score = skippers.length + 1;
        } else {
          // No result = DNS = number of starters + 1
          score = skippers.length + 1;
        }
      } else if (result.letterScore) {
        // Check if this is a DNE score
        isDNE = result.letterScore === 'DNE';

        if (result.customPoints !== undefined && result.customPoints !== null) {
          // Use custom points if available (for RDG with manual points)
          score = result.customPoints;
        } else {
          // Use letter score calculation for standard letter scores
          score = getLetterScorePoints(result.letterScore, skippers.length);
        }
      } else if (result.position !== null) {
        // Use position for normal finishes
        // Finishing position
        score = result.position;
      } else {
        // No result = DNS
        score = skippers.length + 1;
      }

      scores.push({ race, score, isDNE });
    }
    
    const dropCount = getDropCount(racesToConsider);
    
    if (dropCount === 0) {
      return { 
        netScore: scores.reduce((sum, s) => sum + s.score, 0), 
        droppedRaces: [] 
      };
    }
    
    // Separate DNE scores from droppable scores
    const dneScores = scores.filter(s => s.isDNE);
    const droppableScores = scores.filter(s => !s.isDNE);
    
    // Sort droppable scores by value (highest first) and drop the worst ones
    const sortedDroppableScores = [...droppableScores].sort((a, b) => b.score - a.score);
    const droppedRaces = sortedDroppableScores.slice(0, Math.min(dropCount, droppableScores.length)).map(s => s.race);
    
    // Keep all DNE scores and non-dropped droppable scores
    const keptScores = [...dneScores, ...droppableScores.filter(s => !droppedRaces.includes(s.race))];
    
    return {
      netScore: keptScores.reduce((sum, s) => sum + s.score, 0),
      droppedRaces
    };
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

  const getLetterScorePoints = (letterScore: LetterScore, numStarters: number): number => {
    // Standard letter score points = number of starters + 1
    return numStarters + 1;
  };

  const calculateScratchPoints = (race: number, skipperIndex: number, position: number | null, letterScore?: LetterScore): number => {
    // Implementation needed
    return 0;
  };

  const calculateTotalPoints = (skipperIndex: number): number => {
    const skipperResults = raceResults.filter(r => r.skipperIndex === skipperIndex && r.race <= displayNumRaces);
    
    if (skipperResults.length === 0) return 0;
    
    return skipperResults.reduce((total, result) => {
      if (result.customPoints !== undefined && result.customPoints !== null) {
        return total + result.customPoints;
      } else if (result.letterScore) {
        return total + getLetterScorePoints(result.letterScore, skippers.length);
      }
      return total + (result.position || 0);
    }, 0);
  };

  const calculateNetPoints = (skipperIndex: number): number => {
    const skipperResults = raceResults.filter(r => r.skipperIndex === skipperIndex && r.race <= displayNumRaces);
    
    if (skipperResults.length === 0) return 0;
    
    let scores = skipperResults.map(result => {
      if (result.customPoints !== undefined && result.customPoints !== null) {
        return result.customPoints;
      } else if (result.letterScore) {
        return getLetterScorePoints(result.letterScore, skippers.length);
      }
      return result.position || 0;
    });

    // Apply drop rules
    const dropCount = getDropCount(scores.length);
    if (dropCount > 0) {
      scores = scores.sort((a, b) => a - b).slice(0, scores.length - dropCount);
    }
    
    return scores.reduce((sum, points) => sum + points, 0);
  };

  const calculateTotal = (skipperIndex: number) => {
    const skipperResults = raceResults.filter(r => r.skipperIndex === skipperIndex);
    let total = 0;

    for (let race = 1; race <= lastCompletedRace; race++) {
      const result = skipperResults.find(r => r.race === race);

      if (result) {
        // First check if custom points are available (for RDG with manual points)
        if (result.customPoints !== undefined && result.customPoints !== null) {
          total += result.customPoints;
        }
        // Then check for letter scores
        else if (result.letterScore) {
          // Calculate points based on number of starters + 1
          total += getLetterScorePoints(result.letterScore, skippers.length);
        }
        else {
          total += result.position || 0;
        }
      } else if (isSkipperWithdrawn(skipperIndex, race)) {
        // Skipper has withdrawn - automatically add skippers+1
        total += skippers.length + 1;
      }
    }

    return total;
  };

  const calculateNetTotal = (skipperIndex: number) => {
    const skipperResults = raceResults.filter(r => r.skipperIndex === skipperIndex);
    let scores = skipperResults.map(result => {
      if (result.letterScore) {
        // Calculate points based on number of starters in that race + 1
        const raceStarters = calculateStartersInRace(result.race);
        return raceStarters + 1;
      }
      return result.position || 0;
    });
  };

  const calculateStartersInRace = (race: number): number => {
    // Get all results for this specific race
    const raceResultsForThisRace = raceResults.filter(r => r.race === race);
    
    // Count only boats that actually started the race
    let starterCount = 0;
    
    raceResultsForThisRace.forEach(result => {
      // Count boats with finishing positions (they started and finished)
      if (result.position && result.position > 0) {
        starterCount++;
      }
      // Count boats with letter scores that indicate they started but didn't finish
      else if (result.letterScore) {
        // These codes mean the boat started but didn't finish properly
        const startedCodes = ['DNF', 'DSQ', 'RAF', 'RET', 'UFD'];
        if (startedCodes.includes(result.letterScore)) {
          starterCount++;
        }
        // DNS, BFD, OCS mean the boat didn't start - don't count these
      }
    });
    
    return starterCount;
  };

  // Check if a race result should be shown as dropped
  const isRaceDropped = (skipperIndex: number, race: number): boolean => {
    if (lastCompletedRace < 4) return false; // No drops until 4 races completed
    
    const { droppedRaces } = calculateNetScore(skipperIndex, lastCompletedRace);
    return droppedRaces.includes(race);
  };

  const getNextAvailablePosition = (race: number, skipperIndex: number) => {
    const currentRaceResults = raceResults.filter(r => r.race === race);
    const finishingResults = currentRaceResults.filter(r => !r.letterScore && r.position !== null);
    
    // Check if this skipper already has a result
    const existingResult = currentRaceResults.find(r => r.skipperIndex === skipperIndex);
    if (existingResult && (existingResult.position !== null || existingResult.letterScore)) {
      return existingResult.position || 0;
    }
    
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

  const getNextPosition = () => {
    const currentRace = lastCompletedRace + 1;
    const raceResults_current = raceResults.filter(r => r.race === currentRace);
    // Only count finishing positions, not letter scores
    const finishingResults = raceResults_current.filter(r => !r.letterScore && r.position !== null);
    return finishingResults.length + 1;
  };

  const handleTouchScore = (skipperIndex: number) => {
    const currentRace = lastCompletedRace + 1;
    const nextPosition = getNextPosition();
    
    // Update race results for the current race only - don't reorder skippers
    updateRaceResults(currentRace, skipperIndex, nextPosition);
  };

  const handleClearResult = (race: number, skipperIndex: number) => {
    deleteRaceResult(race, skipperIndex);
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

  const getCompletedRacesCount = () => {
    return Array.from({ length: displayNumRaces }, (_, i) => i + 1)
      .filter(race => isRaceComplete(race)).length;
  };

  const checkIfAllRacesCompleted = () => {
    for (let race = 1; race <= displayNumRaces; race++) {
      if (isRaceComplete(race)) {
        continue;
      } else {
        return false;
      }
    }
    return true;
  };

  const isRaceComplete = (race: number) => {
    return skippers.every((_, index) => {
      // Check if skipper has a result
      const result = getRaceResult(race, index);
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

  const getRaceResult = (race: number, skipperIndex: number) => {
    return raceResults.find(r => r.race === race && r.skipperIndex === skipperIndex);
  };

  // Only sort skippers after races are completed, not during active race entry
  const displaySkippers = useMemo(() => {
    // Don't sort during active race entry
    if (lastCompletedRace === 0 || editingRace !== null) {
      return skippers.map((skipper, index) => ({ skipper, index }));
    }

    // Sort by net score with countback for ties
    return skippers
      .map((skipper, index) => ({
        skipper,
        index,
        skipperIndex: index,
        netScore: calculateNetScore(index, lastCompletedRace).netScore
      }))
      .sort(compareSkippersWithCountback);
  }, [skippers, raceResults, lastCompletedRace, editingRace]);

  // Determine which race to focus on
  const focusedRace = editingRace || (lastCompletedRace + 1);

  // In focus mode, only show the current race being scored
  const racesToDisplay = isFocusMode ? [focusedRace] : Array.from({ length: displayNumRaces }, (_, i) => i + 1);

  // Fullscreen API functions
  const enterFullscreen = async () => {
    const element = fullscreenContainerRef.current;
    if (!element) return;

    try {
      if (element.requestFullscreen) {
        await element.requestFullscreen();
      } else if ((element as any).webkitRequestFullscreen) {
        await (element as any).webkitRequestFullscreen();
      } else if ((element as any).mozRequestFullScreen) {
        await (element as any).mozRequestFullScreen();
      } else if ((element as any).msRequestFullscreen) {
        await (element as any).msRequestFullscreen();
      }
    } catch (err) {
      console.error('Error entering fullscreen:', err);
    }
  };

  const exitFullscreen = async () => {
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        await (document as any).webkitExitFullscreen();
      } else if ((document as any).mozCancelFullScreen) {
        await (document as any).mozCancelFullScreen();
      } else if ((document as any).msExitFullscreen) {
        await (document as any).msExitFullscreen();
      }
    } catch (err) {
      console.error('Error exiting fullscreen:', err);
    }
  };

  const toggleFocusMode = async () => {
    if (isFocusMode) {
      // Exit focus mode and fullscreen
      await exitFullscreen();
      setIsFocusMode(false);
    } else {
      // Enter focus mode and fullscreen
      setIsFocusMode(true);
      // Small delay to ensure state updates before entering fullscreen
      setTimeout(() => {
        enterFullscreen();
      }, 100);
    }
  };

  // Listen for fullscreen changes (e.g., user presses ESC)
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!(document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement);

      // If we exit fullscreen but isFocusMode is still true, sync the state
      if (!isCurrentlyFullscreen && isFocusMode) {
        setIsFocusMode(false);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, [isFocusMode]);

  // Auto-exit focus mode when heat round is completed
  useEffect(() => {
    if (!isHeatRacing || !isFocusMode) return;

    // Check if the current heat round is complete
    const isCurrentRoundComplete = skippers.every(skipper => {
      const result = raceResults.find(r => r.race === currentHeatRound && r.skipperIndex === skippers.indexOf(skipper));
      return result && (result.position !== null || result.letterScore);
    });

    // If the round is complete, exit focus mode so race officer can advance to next round
    if (isCurrentRoundComplete && currentHeatRound <= 12) {
      // Small delay to allow final score to be visible
      setTimeout(async () => {
        await exitFullscreen();
        setIsFocusMode(false);
      }, 1500);
    }
  }, [isHeatRacing, isFocusMode, currentHeatRound, raceResults, skippers]);

  return (
    <div ref={fullscreenContainerRef} className={`pb-8 no-select ${isFocusMode ? 'bg-slate-900' : ''}`}>
      {/* Fixed Top Right Controls - Outside main flow */}
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

      {/* Settings Sidebar */}
      {isSettingsOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
            onClick={() => setIsSettingsOpen(false)}
          />
          
          {/* Sidebar */}
          <div className={`
            fixed top-0 right-0 h-full w-80 z-50 transform transition-transform duration-300 ease-in-out
            ${isSettingsOpen ? 'translate-x-0' : 'translate-x-full'}
            ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} 
            border-l shadow-xl overflow-y-auto
          `}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className={`text-xl font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                  Settings
                </h2>
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className={`
                    rounded-full p-2 transition-colors
                    ${darkMode 
                      ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-700' 
                      : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}
                  `}
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <button
                  onClick={() => {
                    onManageSkippers();
                    setIsSettingsOpen(false);
                  }}
                  className="w-full flex items-center gap-3 p-3 bg-[#22c55e] hover:bg-[#16a34a] text-white rounded-lg transition-colors"
                >
                  <Users size={18} />
                  <div className="text-left">
                    <div className="font-medium">Race Skippers</div>
                    <span className="text-xs opacity-90">Add or remove race participants</span>
                  </div>
                </button>

                <div className="space-y-4">
                  <label className="flex items-center justify-between cursor-pointer">
                    <div className={`flex items-center gap-2 text-sm font-medium ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                      {darkMode ? (
                        <Moon size={16} className="text-slate-400" />
                      ) : (
                        <Sun size={16} className="text-slate-400" />
                      )}
                      Dark Mode
                    </div>
                    <div className="relative inline-flex items-center">
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={darkMode}
                        onChange={() => {}}
                      />
                      <div className={`w-11 h-6 rounded-full transition ${
                        darkMode ? 'bg-blue-600' : 'bg-slate-200'
                      }`}>
                        <div className={`w-5 h-5 rounded-full bg-white shadow transform transition-transform ${
                          darkMode ? 'translate-x-6' : 'translate-x-1'
                        } top-0.5`} />
                      </div>
                    </div>
                  </label>
                </div>
              </div>

                {hasResults && (
                  <>
                    <div className="border-t border-slate-700 -mx-4 my-4"></div>

                    <button
                      onClick={() => {
                        handleNewSession();
                        setIsSettingsOpen(false);
                      }}
                      className="w-full flex items-center gap-3 p-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                    >
                      <RefreshCw size={18} />
                      <div className="text-left">
                        <div className="font-medium">New Race Day</div>
                        <span className="text-xs opacity-90">Clear all results and start fresh</span>
                      </div>
                    </button>
                  </>
                )}
            </div>
          </div>
        </>
      )}

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className={`
          fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4
        `}>
          <div className={`
            w-80 p-4 rounded-lg shadow-lg border
            ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}
          `}>
            <p className={`text-sm mb-4 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              This will clear all race results. Are you sure you want to start a new race day?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowConfirmDialog(false)}
                className={`
                  px-3 py-1.5 rounded text-sm font-medium
                  ${darkMode 
                    ? 'text-slate-300 hover:text-slate-100' 
                    : 'text-slate-600 hover:text-slate-800'}
                `}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  // Handle new session logic here
                  setShowConfirmDialog(false);
                  setIsSettingsOpen(false);
                }}
                className="px-3 py-1.5 bg-red-600 text-white rounded text-sm font-medium hover:bg-red-700"
              >
                Clear Results
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Right Sidebar Settings Panel */}
      <div className={`
        fixed inset-y-0 right-0 w-80 bg-slate-800 border-l border-slate-700 shadow-xl z-50
        transform transition-transform duration-300 ease-in-out
        ${showSettings ? 'translate-x-0' : 'translate-x-full'}
      `}>
        <div className="h-full flex flex-col">
          <div className="flex items-center justify-between p-6 border-b border-slate-700">
            <h3 className="text-lg font-semibold text-white">Race Settings</h3>
            <button
              onClick={() => setShowSettings(false)}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-300 hover:bg-slate-700 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6">
            <SettingsDropdown
              capLimit={150}
              setCapLimit={() => {}}
              lastPlaceBonus={false}
              setLastPlaceBonus={() => {}}
              skippers={skippers}
              raceResults={[]}
              editingRace={editingRace}
              onManageSkippers={onManageSkippers}
              onManageMembers={() => {}}
              darkMode={darkMode}
              onToggleDarkMode={() => {}}
              raceType="scratch"
              onRaceTypeChange={() => {}}
              onNewSession={onNewSession || (() => {})}
              onReturnToRaceManagement={onReturnToRaceManagement}
              determineInitialHandicaps={() => false}
              hasDeterminedInitialHcaps={false}
            />
          </div>
        </div>
      </div>
      
      {/* Backdrop */}
      {showSettings && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
          onClick={() => setShowSettings(false)}
        />
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
            : 'bg-white border-slate-200'
        }`}>
          <div ref={tableContainerRef} className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className={`border-b ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                  <th className={`sticky left-0 z-20 text-center ${isCompactView ? 'p-2' : 'p-4'} font-medium ${darkMode ? 'text-slate-300 bg-slate-800/90' : 'text-slate-700 bg-white/90'}`} style={{ minWidth: '80px' }}>Pos</th>
                  <th className={`sticky left-[80px] z-20 text-left ${isCompactView ? 'p-2' : 'p-4'} font-medium ${darkMode ? 'text-slate-300 bg-slate-800/90' : 'text-slate-700 bg-white/90'}`} style={{ minWidth: '200px' }}>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={onManageSkippers}
                        className={`p-1 rounded transition-colors ${darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-200'}`}
                        title="Manage Skippers"
                      >
                        <Users size={16} className="text-blue-400" />
                      </button>
                      <span>Skipper</span>
                    </div>
                  </th>
                  <th className={`sticky left-[280px] z-20 text-center ${isCompactView ? 'p-2' : 'p-4'} font-medium ${darkMode ? 'text-slate-300 bg-slate-800/90' : 'text-slate-700 bg-white/90'}`} style={{ minWidth: '100px', boxShadow: '2px 0 4px rgba(0,0,0,0.1)' }}>Sail No</th>
                  {/* Conditional columns based on event settings */}
                  {currentEvent?.show_club_state && (
                    <th className={`text-center ${isCompactView ? 'p-2' : 'p-4'} font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`} style={{ minWidth: '100px' }}>Club</th>
                  )}
                  {currentEvent?.show_design && (
                    <th className={`text-center ${isCompactView ? 'p-2' : 'p-4'} font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`} style={{ minWidth: '120px' }}>Design</th>
                  )}
                  {racesToDisplay.map((race) => {
                    const isActiveRace = race === (editingRace || (lastCompletedRace + 1));
                    return (
                      <th
                        key={race}
                        className={`text-center font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'} ${
                          isFocusMode ? 'p-6' : isCompactView ? 'p-2' : 'p-4'
                        } ${isActiveRace ? (darkMode ? 'bg-blue-900/30' : 'bg-blue-50') : ''}`}
                        style={isFocusMode ? { minWidth: '150px' } : undefined}
                        onMouseEnter={() => setActiveRaceColumn(race)}
                        onMouseLeave={() => setActiveRaceColumn(null)}>
                        <div className="flex flex-col items-center gap-1">
                          <span className={isFocusMode ? 'text-base font-bold' : 'text-xs'}>
                            {isFocusMode ? `Race ${race}` : `R${race}`}
                          </span>
                          {isFocusMode && (
                            <span className="text-xs text-slate-400">
                              ({getCompletedRacesCount()} of {displayNumRaces} completed)
                            </span>
                          )}
                          {race <= lastCompletedRace && (!isHeatRacing || race === currentHeatRound) && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleClearRaceClick(race);
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
                  {!isFocusMode && (
                    <>
                      <th className={`text-center p-4 font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        Total
                      </th>
                      <th className={`text-center p-4 font-medium uppercase tracking-wider ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        Net
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {displaySkippers.map(({ skipper, index: skipperIndex }, position) => {
                  const { sailNumber, boatType } = getBoatInfo(skipper);
                  const rowPadding = isCompactView ? 'py-1.5 px-2' : 'py-2 px-3';

                  return (
                    <tr key={skipperIndex} className={`border-b transition-colors ${isCompactView ? 'h-10' : 'h-14'} ${
                      darkMode
                        ? 'border-slate-700/50 hover:bg-slate-700/30'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}>
                      {/* Position */}
                      <td className={`sticky left-0 z-10 ${rowPadding} ${darkMode ? 'bg-slate-800/90' : 'bg-white/90'}`}>
                        <div className="flex items-center justify-center">
                          <div className={`
                            ${isCompactView ? 'w-6 h-6 text-xs' : 'w-8 h-8 text-base'} rounded-full flex items-center justify-center text-white font-bold
                            ${position === 0 ? 'bg-yellow-500' :
                              position === 1 ? 'bg-gray-400' :
                              position === 2 ? 'bg-amber-600' :
                              'bg-gray-500'}
                          `}>
                            {position + 1}
                          </div>
                        </div>
                      </td>

                      {/* Skipper Name */}
                      <td className={`sticky left-[80px] z-10 ${rowPadding} ${darkMode ? 'bg-slate-800/90' : 'bg-white/90'}`}>
                        <div className="flex items-center gap-3">
                          {/* Flag (if event shows flag) */}
                          {currentEvent?.show_flag && skipper.country_code && (
                            <div className="flex-shrink-0 text-3xl">
                              {getCountryFlag(skipper.country_code)}
                            </div>
                          )}
                          {/* Avatar */}
                          {!isCompactView && (
                            <div className="flex-shrink-0">
                              {skipper.avatarUrl ? (
                                <img
                                  src={skipper.avatarUrl}
                                  alt={skipper.name}
                                  className="w-10 h-10 rounded-full object-cover border-2 border-slate-600"
                                />
                              ) : (
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                                  darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-700'
                                }`}>
                                  {skipper.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                                </div>
                              )}
                            </div>
                          )}
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
                      <td className={`sticky left-[280px] z-10 ${rowPadding} ${darkMode ? 'bg-slate-800/90' : 'bg-white/90'}`} style={{ boxShadow: '2px 0 4px rgba(0,0,0,0.1)' }}>
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

                      {/* Conditional columns based on event settings */}
                      {currentEvent?.show_club_state && (
                        <td className={`${rowPadding} text-center`}>
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
                        <td className={`${rowPadding} text-center`}>
                          <div className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                            {skipper.hull || skipper.boat?.design_name || skipper.boatType || '—'}
                          </div>
                        </td>
                      )}

                      {/* Race Results */}
                      {racesToDisplay.map((race) => {
                        const result = raceResults.find(r => r.race === race && r.skipperIndex === skipperIndex);
                        // In heat racing mode, only the current round should be active for input
                        // Don't allow input in future rounds until user explicitly advances
                        const isActiveRace = isHeatRacing
                          ? (race === currentHeatRound && editingRace === null) || editingRace === race
                          : race === lastCompletedRace + 1 || editingRace === race;
                        const isDropped = isRaceDropped(skipperIndex, race);
                        const hasResult = result && (result.position !== null || result.letterScore);
                        // Check if skipper has withdrawn from the event for this race
                        const skipperWithdrawn = isSkipperWithdrawn(skipperIndex, race);
                        // Check if this race has any results yet (to determine if we should show withdrawn score)
                        const raceHasResults = raceResults.some(r => r.race === race && (r.position !== null || r.letterScore));
                        // Include withdrawn skippers in completed races even without a result
                        const isCompleted = (hasResult || (skipperWithdrawn && raceHasResults)) && race <= lastCompletedRace && editingRace !== race;
                        const isHoveredColumn = activeRaceColumn === race;
                        const cellBgClass = isActiveRace
                          ? (darkMode ? 'bg-blue-900/30' : 'bg-blue-50')
                          : isHoveredColumn
                          ? (darkMode ? 'bg-slate-700/30' : 'bg-slate-100/50')
                          : '';

                        if (isCompleted) {
                          return (
                            <td
                              key={race}
                              className={`${isFocusMode ? 'p-4' : isCompactView ? 'p-1' : 'p-2'} text-center transition-colors ${cellBgClass}`}
                              onMouseEnter={() => setActiveRaceColumn(race)}
                              onMouseLeave={() => setActiveRaceColumn(null)}>
                              <div
                                className={`${isFocusMode ? 'w-16 h-16 text-base' : 'w-10 h-10 text-xs'} flex items-center justify-center font-medium rounded mx-auto cursor-default`}
                                title="Race completed (click Clear Race to edit)"
                              >
                                {result?.letterScore && result?.letterScore !== 'WDN' ? (
                                  <span className={`font-bold ${isDropped ? 'line-through opacity-50' : ''} ${
                                    darkMode ? 'text-white' : 'text-slate-900'
                                  }`}>
                                    {result?.customPoints !== undefined && result?.customPoints !== null
                                      ? result.customPoints
                                      : getLetterScorePoints(result?.letterScore, skippers.length)}
                                  </span>
                                ) : skipperWithdrawn && raceHasResults ? (
                                  // Show withdrawn score in completed style (same as other posted scores)
                                  <span className={`${isDropped ? 'line-through opacity-50' : ''} ${
                                    darkMode ? 'text-white' : 'text-slate-900'
                                  }`}>
                                    {skippers.length + 1}
                                  </span>
                                ) : (
                                  <span className={`${isDropped ? 'line-through opacity-50' : ''} ${
                                    darkMode ? 'text-white' : 'text-slate-900'
                                  }`}>
                                    {result?.letterScore === 'WDN'
                                      ? (result?.customPoints !== undefined && result?.customPoints !== null
                                          ? result.customPoints
                                          : getLetterScorePoints(result?.letterScore, skippers.length))
                                      : (result?.position || '–')}
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        }

                        return (
                          <td
                            key={race}
                            className={`${isFocusMode ? 'py-4 px-4' : isCompactView ? 'py-1 px-1' : 'py-3 px-2'} text-center transition-colors ${cellBgClass}`}
                            onMouseEnter={() => setActiveRaceColumn(race)}
                            onMouseLeave={() => setActiveRaceColumn(null)}>
                            <div className="flex items-center justify-center mx-auto">
                              {result && result.letterScore === 'WDN' ? (
                                // Withdrawn skippers with WDN - render as non-clickable completed score
                                <div
                                  className={`${isFocusMode ? 'w-16 h-16 text-base' : 'w-10 h-10 text-xs'} flex items-center justify-center font-medium rounded mx-auto cursor-default`}
                                  title="Withdrawn from race"
                                >
                                  <span className={`${isDropped ? 'line-through opacity-50' : ''} ${
                                    darkMode ? 'text-white' : 'text-slate-900'
                                  }`}>
                                    {result.customPoints !== undefined && result.customPoints !== null
                                      ? result.customPoints
                                      : getLetterScorePoints(result.letterScore, skippers.length)}
                                  </span>
                                </div>
                              ) : result ? (
                                <button
                                  type="button"
                                  onClick={() => handleClearResult(race, skipperIndex)}
                                  className={`
                                    ${isFocusMode ? 'w-24 h-24 text-2xl' : 'w-16 h-16 text-lg'} rounded-xl font-bold transition-all relative
                                    ${result.letterScore
                                      ? getLetterScoreColor(result.letterScore)
                                      : `bg-blue-600 text-white hover:bg-blue-700 ${
                                          isDropped ? 'opacity-50' : ''
                                        }`
                                    }
                                  `}
                                >
                                  <span className={isDropped ? 'line-through' : ''}>
                                    {result.letterScore
                                      ? (result.customPoints !== undefined && result.customPoints !== null
                                          ? result.customPoints
                                          : getLetterScorePoints(result.letterScore, skippers.length))
                                      : result.position}
                                  </span>
                                  {isActiveRace && !skipperWithdrawn && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setShowLetterScoreSelector({ race, skipperIndex });
                                      }}
                                      className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors flex items-center justify-center text-xs shadow-lg border border-slate-500"
                                      title="Letter Score"
                                    >
                                      ⋯
                                    </button>
                                  )}
                                </button>
                              ) : isActiveRace && !skipperWithdrawn ? (
                                <button
                                  type="button"
                                  onClick={() => handleTouchScore(skipperIndex)}
                                  className={`${isFocusMode ? 'w-24 h-24 text-2xl' : 'w-16 h-16 text-lg'} rounded-xl border-2 border-dashed border-blue-400 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all font-bold relative group ${
                                    darkMode ? 'bg-slate-800/50' : 'bg-slate-50'
                                  }`}
                                >
                                 {/* Show next position on hover */}
                                 <span className={`opacity-0 group-hover:opacity-100 transition-opacity text-white font-bold ${isFocusMode ? 'text-2xl' : 'text-lg'}`}>
                                   {getNextAvailablePosition(race, skipperIndex)}
                                 </span>

                                 {/* Checkered flag icon - same color as border */}
                                 <Flag size={20} className="absolute inset-0 m-auto text-blue-400 opacity-30 group-hover:opacity-0 transition-opacity" />

                                  <Flag size={20} className="absolute inset-0 m-auto text-slate-500 opacity-20" />
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setShowLetterScoreSelector({ race, skipperIndex });
                                    }}
                                    className={`absolute -top-1 -right-1 w-7 h-7 rounded-full hover:bg-green-600 transition-colors flex items-center justify-center text-sm shadow-lg ${
                                      darkMode
                                        ? 'bg-slate-700 text-slate-300 border border-slate-500'
                                        : 'bg-slate-600 text-white border border-slate-400'
                                    }`}
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

                      {!isFocusMode && (
                        <>
                          {/* Total Score */}
                          <td className={`py-3 px-4 text-center font-bold text-lg ${
                            darkMode ? 'text-white' : 'text-slate-900'
                          }`}>
                            {(() => {
                              const skipperResults = raceResults.filter(r => r.skipperIndex === skipperIndex);
                              return skipperResults.reduce((total, result) => {
                                if (result.customPoints !== undefined) {
                                  return total + result.customPoints;
                                } else if (result.letterScore) {
                                  return total + getLetterScorePoints(result.letterScore, skippers.length);
                                }
                                return total + (result.position || 0);
                              }, 0);
                            })()}
                          </td>

                          {/* Net Score */}
                          <td className={`py-3 px-4 text-center text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                            {(() => {
                              const { netScore } = calculateNetScore(skipperIndex, lastCompletedRace);
                              return netScore;
                            })()}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Bottom Info Bar - Skipper Count and Scoring System */}
          <div className="mt-4 px-4 flex items-center justify-between">
            {/* Left: Skipper and Race Count */}
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ${
              darkMode ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-600'
            }`}>
              <Users size={14} />
              <span className="text-xs">{skippers.length} skippers</span>
              <span className="text-xs">•</span>
              <span className="text-xs">{getCompletedRacesCount()} of {displayNumRaces} races completed</span>
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
        </div>
      )}


      {/* Letter Score Selector */}
      {showLetterScoreSelector && (() => {
        const { race, skipperIndex } = showLetterScoreSelector;

        // Get previous race results for average points calculation
        const skipperPreviousResults: Array<{ position: number | null; letterScore?: string; customPoints?: number; points: number }> = [];

        for (let r = 1; r < race; r++) {
          const result = raceResults.find(res => res.race === r && res.skipperIndex === skipperIndex);
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
              // Letter scores in scratch scoring
              points = skippers.length + 1;
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
            darkMode={darkMode}
            skipperName={skippers[skipperIndex]?.name || ''}
            raceNumber={race}
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
        message={`Are you sure you want to delete all results from R${raceToDelete} and all subsequent races? This action cannot be undone.`}
        confirmText="Clear Races"
        cancelText="Cancel"
        darkMode={darkMode}
      />
    </div>
  );
};