import React, { useState, useEffect, useRef } from 'react';
import { Edit2, Trophy, Medal, X, ChevronRight, Trash2, Users, TrendingUp, Flag, Home, ChevronDown, ChevronUp, Settings, Zap, FileText, MoreHorizontal, Edit, RotateCcw, Calendar, CalendarRange } from 'lucide-react';
import { HeatRaceInput } from './HeatRaceInput';
import { HeatDesignation, HeatManagement, HeatResult, getHeatColorClasses, calculateOverallPositions } from '../types/heat';
import { useNavigate } from 'react-router-dom';
import { ConfirmationModal } from './ConfirmationModal';
import { LetterScoreSelector } from './LetterScoreSelector';
import { RaceEvent } from '../types/race';

interface HeatRaceTableProps {
  skippers: Skipper[];
  heatManagement: HeatManagement;
  darkMode: boolean;
  onManageSkippers: () => void;
  onUpdateHeatResult: (result: HeatResult) => void;
  onCompleteHeat: (heat: HeatDesignation) => void;
  onReturnToRaceManagement: () => void;
  onShowCharts: () => void;
  onConfigureHeats: () => void;
}

export const HeatRaceTable: React.FC<HeatRaceTableProps> = ({
  skippers,
  heatManagement,
  darkMode,
  onManageSkippers,
  onUpdateHeatResult,
  onCompleteHeat,
  onReturnToRaceManagement,
  onShowCharts,
  onConfigureHeats
}) => {
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [overallExpanded, setOverallExpanded] = useState(false);
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [showLetterScoreSelector, setShowLetterScoreSelector] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [touchInputMode, setTouchInputMode] = useState(true); // Default to true
  const [visibleRaces, setVisibleRaces] = useState(8);
  
  const handleCellClick = (race: number, skipperIndex: number) => {
    if (!touchInputMode) return; // Keep this check for consistency
    
    const cellKey = `${race}-${skipperIndex}`;
    setEditingCell(cellKey);
    
    // Get current value
    const result = getSkipperResult(skipperIndex, race);
    setInputValue(result?.position?.toString() || '');
  };
  
  // Debug logging for letter score selector
  const handleOpenLetterScoreSelector = (key: string) => {
    console.log('Opening letter score selector for:', key);
    setShowLetterScoreSelector(key);
  };
  
  const handleCloseLetterScoreSelector = () => {
    console.log('Closing letter score selector');
    setShowLetterScoreSelector(null);
  };

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const { currentRound, currentHeat, rounds, configuration } = heatManagement;
  const currentRoundData = rounds.find(r => r.round === currentRound);
  
  // When a round is selected, show that round's data
  const displayRound = selectedRound || currentRound;
  const displayRoundData = rounds.find(r => r.round === displayRound) || currentRoundData;
  
  // Update visible races based on completed heats
  useEffect(() => {
    const completedRaces = heatManagement.rounds.reduce((count, round) => {
      return count + (round.completed ? 1 : 0);
    }, 0);
    
    if (completedRaces >= visibleRaces) {
      setVisibleRaces(Math.min(Math.ceil(completedRaces / 4) * 4, 12));
    }
  }, [heatManagement.rounds, visibleRaces]);
  
  if (!displayRoundData) {
    return (
      <div className={`
        text-center py-12 rounded-lg border
        ${darkMode 
          ? 'bg-slate-800/50 border-slate-700 text-slate-400' 
          : 'bg-slate-50 border-slate-200 text-slate-600'}
      `}>
        <div className="flex justify-between items-center px-4 py-6">
          <button
            onClick={() => setShowExitConfirm(true)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              darkMode 
                ? 'text-slate-300 hover:text-slate-100 bg-slate-800 hover:bg-slate-700' 
                : 'text-slate-600 hover:text-slate-800 bg-white hover:bg-slate-50 border border-slate-200'
            }`}
          >
            <Home size={18} />
            <span className="text-sm font-medium">Dashboard</span>
          </button>
        </div>
        
        <Trophy size={48} className="mx-auto mb-4 opacity-20" />
        <p className="text-lg font-medium mb-2">No Round Data Available</p>
        <p className="text-sm mb-6">There was an error loading the current round data</p>
        <button
          onClick={onConfigureHeats}
          className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
        >
          <Settings size={18} />
          Configure Heats
        </button>
      </div>
    );
  }

  // Get overall positions from heat results
  const overallPositions = calculateOverallPositions(displayRoundData.results, displayRound);
  
  // Handle dashboard click
  const handleDashboardClick = () => {
    setShowExitConfirm(true);
  };

  // Get skippers for a specific heat
  const getHeatSkippers = (heat: HeatDesignation) => {
    const heatAssignment = displayRoundData.heatAssignments.find(a => a.heatDesignation === heat);
    if (!heatAssignment) return [];
    return heatAssignment.skipperIndices;
  };

  // Get result for a specific skipper in the current heat
  const getSkipperResult = (skipperIndex: number, heat: HeatDesignation) => {
    return displayRoundData.results.find(
      r => r.skipperIndex === skipperIndex &&
           r.heatDesignation === heat &&
           r.round === displayRound
    );
  };

  // Get the next available position for scoring (excluding letter scores)
  const getNextPosition = (heat: HeatDesignation) => {
    const heatResults = displayRoundData.results.filter(
      r => r.heatDesignation === heat && r.round === displayRound
    );

    // Get only finishing positions (not letter scores)
    const finishingResults = heatResults.filter(r => !r.letterScore && r.position !== null);
    const positions = finishingResults.map(r => r.position).filter(p => p !== null).sort((a, b) => a! - b!);

    // Find the next available consecutive position
    for (let i = 1; i <= positions.length + 1; i++) {
      if (!positions.includes(i)) {
        return i;
      }
    }

    return positions.length + 1;
  };

  // Update a heat result
  const handleUpdateResult = (
    skipperIndex: number,
    heat: HeatDesignation,
    position: number | null,
    letterScore?: LetterScore,
    customPoints?: number
  ) => {
    const result: HeatResult = {
      skipperIndex,
      position,
      letterScore,
      heatDesignation: heat,
      race: 1, // For now, we only support one race per heat per round
      round: currentRound,
      customPoints
    };

    onUpdateHeatResult(result);
  };

  // Check if a heat is complete (all skippers have results)
  const isHeatComplete = (heat: HeatDesignation) => {
    const heatSkippers = getHeatSkippers(heat);
    return heatSkippers.every(skipperIndex => {
      const result = displayRoundData.results.find(
        r => r.skipperIndex === skipperIndex && 
             r.heatDesignation === heat &&
             r.round === displayRound
      );
      return result && (result.position !== null || result.letterScore);
    });
  };

  // Handle round selection
  const handleRoundChange = (round: number) => {
    if (round <= currentRound) {
      setSelectedRound(round === selectedRound ? null : round);
    }
  };

  // Render a heat table
  const renderHeatTable = (heat: HeatDesignation) => {
    const heatSkippers = getHeatSkippers(heat);
    const colorClasses = getHeatColorClasses(heat);
    
    if (heatSkippers.length === 0) return null;
    
    const isComplete = isHeatComplete(heat);
    const isCurrentHeat = currentHeat === heat && selectedRound === null;
    
    // Determine if this heat should be expanded
    // Only the current heat should be expanded, and only if we're not viewing a past round
    const isExpanded = isCurrentHeat && selectedRound === null;
    
    return (
      <div className={`
        rounded-lg border overflow-hidden
        ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}
      `}>
        <div 
          className={`
            p-4 flex items-center justify-between
            ${colorClasses.darkBg} ${colorClasses.darkText}
          `}
        >
          <div className="flex items-center gap-2">
            <div className={`
              w-8 h-8 rounded-full flex items-center justify-center font-bold
              ${colorClasses.bg} ${colorClasses.text}
            `}>
              {heat}
            </div>
            <h4 className="font-medium">Heat {heat}</h4>
            {isComplete && (
              <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-green-900/30 text-green-400">
                Completed
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm">
              {heatSkippers.length} skippers
            </span>
          </div>
        </div>
        
        {isExpanded && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className={darkMode ? 'bg-slate-700' : 'bg-slate-100'}>
                <tr>
                  <th className={`
                    text-left p-3 font-medium
                    ${darkMode ? 'text-slate-300' : 'text-slate-700'}
                  `}>
                    Skipper
                  </th>
                  <th className={`
                    text-center p-3 font-medium
                    ${darkMode ? 'text-slate-300' : 'text-slate-700'}
                  `}>
                    Sail No.
                  </th>
                  {Array.from({ length: visibleRaces }, (_, i) => i + 1).map(raceNum => (
                    <th 
                      key={raceNum} 
                      className={`
                        text-center p-3 font-medium w-16
                        ${darkMode ? 'text-slate-300' : 'text-slate-700'}
                      `}
                    >
                      R{raceNum}
                    </th>
                  ))}
                  <th className={`
                    text-center p-3 font-medium
                    ${darkMode ? 'text-slate-300' : 'text-slate-700'}
                  `}>
                    Position
                  </th>
                </tr>
              </thead>
              <tbody>
                {heatSkippers.map(skipperIndex => {
                  const skipper = skippers[skipperIndex];
                  const result = getSkipperResult(skipperIndex, heat);
                  
                  return (
                    <tr 
                      key={skipperIndex}
                      className={`
                        border-t
                        ${darkMode ? 'border-slate-700' : 'border-slate-200'}
                      `}
                    >
                      <td className={`
                        p-3 font-medium
                        ${darkMode ? 'text-slate-200' : 'text-slate-800'}
                      `}>
                        {skipper.name}
                      </td>
                      <td className={`
                        p-3 text-center
                        ${darkMode ? 'text-slate-400' : 'text-slate-600'}
                      `}>
                        {skipper.sailNo}
                      </td>
                      
                      {Array.from({ length: visibleRaces }, (_, i) => i + 1).map(raceNum => {
                        // Find the round for this race number
                        const round = heatManagement.rounds.find(r => r.round === raceNum);
                        
                        if (!round) {
                          return (
                            <td 
                              className="px-2 py-2 whitespace-nowrap text-sm text-center w-16"
                              key={raceNum}
                            >
                              <div className="w-10 h-10 border-2 border-dashed border-slate-700 rounded-lg mx-auto flex items-center justify-center"></div>
                            </td>
                          );
                        }
                        
                        // Find the result for this skipper in this round
                        const result = round.results.find(r => r.skipperIndex === skipperIndex);
                        
                        // Check if this is the current round and current heat
                        const isCurrentRound = raceNum === currentRound;
                        const isInCurrentHeat = round.heatAssignments.some(
                          assignment => assignment.heatDesignation === currentHeat && 
                                       assignment.skipperIndices.includes(skipperIndex)
                        );
                        
                        const isEditingThisHeat = isCurrentRound && isInCurrentHeat;
                        
                        // Display value
                        const displayValue = result?.letterScore || result?.position || '';
                        
                        return (
                          <td 
                            className="px-2 py-2 whitespace-nowrap text-sm text-center w-16"
                            key={raceNum}
                          >
                            {isEditingThisHeat && !round?.completed ? (
                              <HeatRaceInput
                                id={`race-${raceNum}-skipper-${skipperIndex}`}
                                value={result?.position || null}
                                letterScore={result?.letterScore}
                                onChange={(value, letterScore) =>
                                  handleUpdateResult(skipperIndex, currentHeat, value, letterScore || undefined)
                                }
                                onOpenLetterScoreSelector={() => handleOpenLetterScoreSelector(`${raceNum}-${skipperIndex}`)}
                                maxPosition={getHeatSkippers(currentHeat).length}
                                disabled={false}
                                darkMode={darkMode}
                                touchInputMode={touchInputMode}
                                nextPosition={getNextPosition(currentHeat)}
                              />
                            ) : result ? (
                              <div className="text-center font-medium text-white">{displayValue}</div>
                            ) : isCurrentRound && isInCurrentHeat ? (
                              <div className="flex items-center justify-center space-x-1 w-full">
                                <button
                                  onClick={() => onUpdateHeatResult({
                                    skipperIndex: skipperIndex,
                                    round: currentRound,
                                    heat: currentHeat,
                                    position: 1
                                  })}
                                  className={`p-2 rounded-lg transition-colors mx-auto ${
                                    darkMode 
                                      ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' 
                                      : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                                  }`}
                                >
                                  <Edit2 size={16} />
                                </button>
                              </div>
                            ) : (
                              <div className="w-10 h-10 border-2 border-dashed border-slate-700 rounded-lg mx-auto flex items-center justify-center"></div>
                            )}
                          </td>
                        );
                      })}
                      
                      <td className="p-3 text-center">
                        <div className="flex justify-center">
                          <HeatRaceInput
                            id={`heat-${heat}-skipper-${skipperIndex}`}
                            value={result?.position || null}
                            letterScore={result?.letterScore}
                            onChange={(value, letterScore) =>
                              handleUpdateResult(skipperIndex, heat, value, letterScore || undefined)
                            }
                            onOpenLetterScoreSelector={() => handleOpenLetterScoreSelector(`${heat}-${skipperIndex}`)}
                            maxPosition={heatSkippers.length}
                            disabled={!isCurrentHeat || selectedRound !== null}
                            darkMode={darkMode}
                            touchInputMode={touchInputMode}
                            nextPosition={getNextPosition(heat)}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            
            {isCurrentHeat && selectedRound === null && (
              <div className="p-4 flex justify-end">
                {!isComplete ? (
                  <button
                    onClick={() => {}}
                    disabled={true}
                    className="px-4 py-2 bg-slate-500 text-white rounded-lg font-medium transition-colors opacity-50 cursor-not-allowed"
                  >
                    Complete Heat (Enter all results)
                  </button>
                ) : (
                  <button
                    onClick={() => onCompleteHeat(heat)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
                  >
                    Complete Heat
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Render the overall standings table
  const renderOverallStandings = () => {
    // Sort skippers by their overall position
    const sortedSkippers = [...overallPositions].sort((a, b) => a.position - b.position);
    
    return (
      <div className={`
        rounded-lg border overflow-hidden
        ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}
      `}>
        <div 
          className={`
            p-4 flex items-center justify-between cursor-pointer
            ${darkMode ? 'bg-blue-900/30 text-blue-100' : 'bg-blue-50 text-blue-800'}
          `}
          onClick={() => setOverallExpanded(!overallExpanded)}
        >
          <div className="flex items-center gap-2">
            <Trophy size={20} className={darkMode ? 'text-blue-400' : 'text-blue-600'} />
            <h4 className="font-medium">Overall Standings - Round {displayRound}</h4>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm">
              {sortedSkippers.length} skippers
            </span>
            {overallExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </div>
        
        {overallExpanded && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className={darkMode ? 'bg-slate-700' : 'bg-slate-100'}>
                <tr>
                  <th className={`
                    text-center p-3 font-medium w-16
                    ${darkMode ? 'text-slate-300' : 'text-slate-700'}
                  `}>
                    Pos
                  </th>
                  <th className={`
                    text-left p-3 font-medium
                    ${darkMode ? 'text-slate-300' : 'text-slate-700'}
                  `}>
                    Skipper
                  </th>
                  <th className={`
                    text-center p-3 font-medium
                    ${darkMode ? 'text-slate-300' : 'text-slate-700'}
                  `}>
                    Sail No.
                  </th>
                  <th className={`
                    text-center p-3 font-medium
                    ${darkMode ? 'text-slate-300' : 'text-slate-700'}
                  `}>
                    Heat
                  </th>
                  <th className={`
                    text-center p-3 font-medium
                    ${darkMode ? 'text-slate-300' : 'text-slate-700'}
                  `}>
                    Heat Pos
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedSkippers.map(({ skipperIndex, position }) => {
                  const skipper = skippers[skipperIndex];
                  
                  // Find which heat this skipper is in
                  const heatAssignment = displayRoundData.heatAssignments.find(
                    a => a.skipperIndices.includes(skipperIndex)
                  );
                  
                  if (!heatAssignment) return null;
                  
                  const heat = heatAssignment.heatDesignation;
                  const colorClasses = getHeatColorClasses(heat);
                  
                  // Get the result in that heat
                  const heatResult = getSkipperResult(skipperIndex, heat);
                  
                  return (
                    <tr 
                      key={skipperIndex}
                      className={`
                        border-t
                        ${darkMode ? 'border-slate-700' : 'border-slate-200'}
                      `}
                    >
                      <td className={`
                        p-3 text-center font-medium
                        ${position <= 3 
                          ? 'text-yellow-500' 
                          : darkMode ? 'text-slate-300' : 'text-slate-700'}
                      `}>
                        {position}
                      </td>
                      <td className={`
                        p-3 font-medium
                        ${darkMode ? 'text-slate-200' : 'text-slate-800'}
                      `}>
                        {skipper.name}
                      </td>
                      <td className={`
                        p-3 text-center
                        ${darkMode ? 'text-slate-400' : 'text-slate-600'}
                      `}>
                        {skipper.sailNo}
                      </td>
                      <td className="p-3 text-center">
                        <span className={`
                          inline-flex items-center justify-center w-8 h-8 rounded-full font-bold
                          ${colorClasses.bg} ${colorClasses.text}
                        `}>
                          {heat}
                        </span>
                      </td>
                      <td className={`
                        p-3 text-center
                        ${darkMode ? 'text-slate-300' : 'text-slate-700'}
                      `}>
                        {heatResult?.letterScore || heatResult?.position || '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  // Render round selector
  const renderRoundSelector = () => {
    // Only show rounds that have been completed or are in progress
    const availableRounds = rounds
      .filter(r => r.round <= currentRound)
      .map(r => r.round);
    
    return (
      <div className="flex items-center gap-2 mb-4">
        <span className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
          View Round:
        </span>
        <div className="flex gap-2">
          {availableRounds.map(round => (
            <button
              key={round}
              onClick={() => handleRoundChange(round)}
              className={`
                px-3 py-1 rounded-lg text-sm font-medium transition-colors
                ${selectedRound === round
                  ? 'bg-blue-600 text-white'
                  : darkMode
                    ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}
              `}
            >
              {round}
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6" ref={tableContainerRef}>
      <div className="flex justify-between items-center">
        <button
          onClick={handleDashboardClick}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
            darkMode 
              ? 'text-slate-300 hover:text-slate-100 bg-slate-800 hover:bg-slate-700' 
              : 'text-slate-600 hover:text-slate-800 bg-white hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <Home size={18} />
          <span className="text-sm font-medium">Dashboard</span>
        </button>
        
        <div className="flex items-center gap-3">
          <div className={`
            px-3 py-1.5 rounded-lg text-sm font-medium
            ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-white text-slate-700 border border-slate-200'}
          `}>
            Round {displayRound}
          </div>
          
          <button
            onClick={() => setTouchInputMode(!touchInputMode)}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors
              ${touchInputMode
                ? 'bg-green-600 text-white hover:bg-green-700'
                : darkMode
                  ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}
            `}
          >
            <Zap size={18} />
            Touch Mode {touchInputMode ? 'ON' : 'OFF'}
          </button>
          
          <button
            onClick={onConfigureHeats}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
              ${darkMode
                ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'}
            `}
          >
            <Settings size={16} />
            Configure Heats
          </button>
        </div>
      </div>
      
      {/* Round selector */}
      {rounds.length > 1 && renderRoundSelector()}
      
      {/* Heat tables - display in reverse order (F, E, D, C, B, A) */}
      <div className="space-y-4">
        {displayRoundData.heatAssignments
          .slice()
          .sort((a, b) => a.heatDesignation.localeCompare(b.heatDesignation))
          .reverse()
          .map(assignment => renderHeatTable(assignment.heatDesignation))
        }
      </div>
      
      {/* Overall standings - moved below heats as requested */}
      {displayRoundData.results.length > 0 && renderOverallStandings()}
      
      <div className="flex justify-end gap-2 mt-6">
        <button
          onClick={() => setOverallExpanded(!overallExpanded)}
          className={`
            flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
            ${darkMode 
              ? 'bg-slate-800 hover:bg-slate-700 text-slate-200' 
              : 'bg-white hover:bg-slate-50 text-slate-700 shadow-sm border border-slate-200'}
          `}
        >
          <Trophy size={16} />
          Overall Standings
        </button>
        
        <button
          onClick={onShowCharts}
          className={`
            flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
            ${darkMode 
              ? 'bg-slate-800 hover:bg-slate-700 text-slate-200' 
              : 'bg-white hover:bg-slate-50 text-slate-700 shadow-sm border border-slate-200'}
          `}
        >
          <TrendingUp size={16} />
          Performance Trends
        </button>
        
        <button
          onClick={onReturnToRaceManagement}
          className={`
            flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
            bg-blue-600 hover:bg-blue-700 text-white
          `}
        >
          <Flag size={16} />
          Publish Scores
        </button>
      </div>

      {/* Letter Score Selector Modal */}
      {showLetterScoreSelector && (() => {
        const [heat, skipperIndexStr] = showLetterScoreSelector.split('-');
        const skipperIndex = parseInt(skipperIndexStr);
        const skipper = skippers[skipperIndex];

        // Get previous heat results for average points calculation
        const skipperPreviousResults: Array<{ position: number | null; letterScore?: string; customPoints?: number; points: number }> = [];

        // Collect all previous results from all previous rounds and current round (up to current heat)
        heatManagement.rounds.forEach(round => {
          // Only include previous rounds or results from earlier heats in the current round
          if (round.round < currentRound || (round.round === currentRound)) {
            round.results.forEach(result => {
              if (result.skipperIndex === skipperIndex) {
                // Skip the current heat if this is from the current round
                if (round.round === currentRound && result.heatDesignation === heat) {
                  return;
                }

                const position = result.position;
                const letterScore = result.letterScore;
                const customPoints = result.customPoints;

                // Get the points for this heat result
                let points = 0;
                if (letterScore === 'RDG' || letterScore === 'DPI') {
                  points = customPoints || 0;
                } else if (position !== null && position > 0) {
                  points = position;
                } else if (letterScore) {
                  // Letter scores - get heat size for that heat
                  const heatSkippersCount = round.results.filter(r =>
                    r.heatDesignation === result.heatDesignation && r.race === result.race
                  ).length;
                  points = heatSkippersCount + 1;
                }

                skipperPreviousResults.push({
                  position,
                  letterScore,
                  customPoints,
                  points
                });
              }
            });
          }
        });

        return (
          <LetterScoreSelector
            isOpen={!!showLetterScoreSelector}
            onClose={handleCloseLetterScoreSelector}
            onSelect={(letterScore, customPoints) => {
              handleUpdateResult(skipperIndex, heat as HeatDesignation, null, letterScore || undefined, customPoints);
              handleCloseLetterScoreSelector();
            }}
            darkMode={darkMode}
            skipperName={skipper?.name || ''}
            raceNumber={currentRound}
            skipperPreviousResults={skipperPreviousResults}
          />
        );
      })()}

      <ConfirmationModal
        isOpen={showExitConfirm}
        onClose={() => setShowExitConfirm(false)}
        onConfirm={onReturnToRaceManagement}
        title="Exit Heat Racing"
        message="Are you sure you want to exit? Your results will be saved, but the event scoring is still active until scores are published."
        confirmText="Exit"
        cancelText="Stay"
        darkMode={darkMode}
      />
    </div>
  );
};