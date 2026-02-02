import React, { useState } from 'react';
import { HeatDesignation, HeatConfiguration, HeatManagement, getHeatColorClasses } from '../types/heat';
import { Flag, ChevronDown, Users, Info, Grid } from 'lucide-react';

interface HeatSelectorProps {
  heatManagement: HeatManagement;
  currentRace: number;
  darkMode: boolean;
  onSelectHeat: (heat: HeatDesignation) => void;
  onShowFleetBoard: () => void;
  onShowHeatAssignments: () => void;
}

export const HeatSelector: React.FC<HeatSelectorProps> = ({
  heatManagement,
  currentRace,
  darkMode,
  onSelectHeat,
  onShowFleetBoard,
  onShowHeatAssignments
}) => {
  const [expanded, setExpanded] = useState(true);

  const { currentRound, rounds, configuration, currentHeat } = heatManagement;
  const roundData = rounds.find(r => r.round === currentRace);

  if (!roundData) {
    return null;
  }

  const { heatAssignments, results } = roundData;

  // Calculate completion status for each heat
  const heatStatus = heatAssignments.map(assignment => {
    const { heatDesignation, skipperIndices } = assignment;
    const heatResults = results.filter(r => r.heatDesignation === heatDesignation);
    const completed = skipperIndices.every(skipperIdx => {
      const result = heatResults.find(r => r.skipperIndex === skipperIdx);
      return result && (result.position !== null || result.letterScore || result.markedAsUP);
    });

    return {
      heat: heatDesignation,
      total: skipperIndices.length,
      scored: heatResults.filter(r => r.position !== null || r.letterScore || r.markedAsUP).length,
      completed,
      isActive: heatDesignation === currentHeat
    };
  });

  const allHeatsComplete = heatStatus.every(status => status.completed);

  return (
    <div className={`mb-6 rounded-lg border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={`w-full flex items-center justify-between p-4 ${darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-50'} transition-colors`}
      >
        <div className="flex items-center gap-3">
          <Flag className="text-blue-400" size={20} />
          <div className="text-left">
            <h3 className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              Race {currentRace} - Heat Racing
            </h3>
            <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              {configuration.numberOfHeats} heats • {configuration.promotionCount} up/down
              {allHeatsComplete && ' • All heats complete'}
            </p>
          </div>
        </div>
        <ChevronDown
          size={20}
          className={`transform transition-transform ${expanded ? 'rotate-180' : ''} ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}
        />
      </button>

      {/* Heat Grid */}
      {expanded && (
        <div className="p-4 pt-0 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {heatStatus.map(status => {
              const colors = getHeatColorClasses(status.heat);
              const isSelected = status.heat === currentHeat;

              return (
                <button
                  key={status.heat}
                  type="button"
                  onClick={() => onSelectHeat(status.heat)}
                  className={`
                    relative p-4 rounded-lg border-2 transition-all
                    ${isSelected
                      ? 'border-blue-500 ring-2 ring-blue-400 ring-opacity-50'
                      : darkMode
                        ? 'border-slate-600 hover:border-slate-500'
                        : 'border-slate-200 hover:border-slate-300'
                    }
                    ${status.completed
                      ? darkMode
                        ? 'bg-green-900/20'
                        : 'bg-green-50'
                      : darkMode
                        ? 'bg-slate-700'
                        : 'bg-slate-50'
                    }
                  `}
                >
                  {/* Heat Letter Badge */}
                  <div className={`
                    inline-flex items-center justify-center w-10 h-10 rounded-full mb-2
                    ${darkMode ? colors.darkBg : colors.bg}
                    ${darkMode ? colors.darkText : colors.text}
                    font-bold text-lg
                  `}>
                    {status.heat}
                  </div>

                  {/* Heat Name */}
                  <div className={`text-sm font-medium mb-1 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    Heat {status.heat}
                    {status.heat === 'A' && ' (Top)'}
                  </div>

                  {/* Progress */}
                  <div className="flex items-center gap-2 text-xs">
                    <Users size={14} className={darkMode ? 'text-slate-400' : 'text-slate-600'} />
                    <span className={darkMode ? 'text-slate-300' : 'text-slate-700'}>
                      {status.scored}/{status.total} scored
                    </span>
                  </div>

                  {/* Completion Indicator */}
                  {status.completed && (
                    <div className="absolute top-2 right-2">
                      <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                        <span className="text-white text-xs font-bold">✓</span>
                      </div>
                    </div>
                  )}

                  {/* Active Indicator */}
                  {isSelected && (
                    <div className="absolute -top-1 -right-1">
                      <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onShowHeatAssignments}
              className={`
                flex items-center justify-center gap-2 p-3 rounded-lg border transition-colors
                ${darkMode
                  ? 'bg-blue-600 border-blue-500 text-white hover:bg-blue-700'
                  : 'bg-blue-500 border-blue-400 text-white hover:bg-blue-600'
                }
              `}
            >
              <Grid size={16} />
              <span className="text-sm font-medium">View Heat Assignments</span>
            </button>

            <button
              type="button"
              onClick={onShowFleetBoard}
              className={`
                flex items-center justify-center gap-2 p-3 rounded-lg border transition-colors
                ${darkMode
                  ? 'bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }
              `}
            >
              <Info size={16} />
              <span className="text-sm font-medium">Overall Standings</span>
            </button>
          </div>

          {/* HMS Information */}
          <div className={`text-xs p-3 rounded ${darkMode ? 'bg-slate-700 text-slate-400' : 'bg-blue-50 text-blue-800'}`}>
            <div className="flex items-start gap-2">
              <Info size={14} className="mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium mb-1">HMS Heat Racing Active</p>
                <p>
                  Score heats from lowest to highest (F → A).
                  Top {configuration.promotionCount} from each heat will be promoted,
                  bottom {configuration.promotionCount} relegated.
                  Promoted skippers are marked "UP" in lower heats.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
