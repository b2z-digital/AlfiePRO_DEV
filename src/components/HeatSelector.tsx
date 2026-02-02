import React from 'react';
import { HeatDesignation, HeatManagement, getHeatColorClasses } from '../types/heat';

interface HeatSelectorProps {
  heatManagement: HeatManagement;
  onSelectHeat: (heat: HeatDesignation) => void;
  darkMode: boolean;
}

export const HeatSelector: React.FC<HeatSelectorProps> = ({
  heatManagement,
  onSelectHeat,
  darkMode
}) => {
  const { currentRound, currentHeat, rounds, configuration } = heatManagement;
  const currentRoundData = rounds.find(r => r.round === currentRound);
  
  if (!currentRoundData) return null;
  
  // Get available heats in reverse order (F, E, D, C, B, A)
  const availableHeats = currentRoundData.heatAssignments
    .map(a => a.heatDesignation)
    .sort()
    .reverse();
  
  // Find the next heat that needs to be scored, starting from the LOWEST heat
  // availableHeats is [F, E, D, C, B, A], so we search from the END to start with lowest heat
  const nextHeatToScore = [...availableHeats].reverse().find(heat => {
    const heatAssignment = currentRoundData.heatAssignments.find(a => a.heatDesignation === heat);
    if (!heatAssignment) return false;

    // Check if all skippers in this heat have results
    return !heatAssignment.skipperIndices.every(skipperIndex => {
      return currentRoundData.results.some(
        r => r.skipperIndex === skipperIndex &&
             r.heatDesignation === heat &&
             r.round === currentRound &&
             (r.position !== null || r.letterScore)
      );
    });
  });
  
  // If there's a next heat to score and no current heat is selected, auto-select it
  React.useEffect(() => {
    if (nextHeatToScore && !currentHeat) {
      onSelectHeat(nextHeatToScore);
    }
  }, [nextHeatToScore, currentHeat, onSelectHeat]);
  
  return (
    <div className={`
      p-4 rounded-lg border mb-6
      ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}
    `}>
      <h3 className={`text-base font-medium mb-3 ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
        Select Heat to Score
      </h3>
      
      <div className="flex flex-wrap gap-3">
        {availableHeats.map(heat => {
          const colorClasses = getHeatColorClasses(heat);
          const isActive = currentHeat === heat;
          const isComplete = currentRoundData.heatAssignments
            .find(a => a.heatDesignation === heat)?.skipperIndices
            .every(skipperIndex => {
              return currentRoundData.results.some(
                r => r.skipperIndex === skipperIndex && 
                     r.heatDesignation === heat &&
                     r.round === currentRound &&
                     (r.position !== null || r.letterScore)
              );
            });
          
          return (
            <button
              key={heat}
              onClick={() => onSelectHeat(heat)}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-lg transition-colors
                ${isActive
                  ? `${colorClasses.darkBg} ${colorClasses.darkText}`
                  : darkMode
                    ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }
                ${isComplete ? 'opacity-60' : ''}
              `}
            >
              <div className={`
                w-6 h-6 rounded-full flex items-center justify-center font-bold text-sm
                ${colorClasses.bg} ${colorClasses.text}
              `}>
                {heat}
              </div>
              <span>Heat {heat}</span>
              {isComplete && (
                <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full bg-green-900/30 text-green-400">
                  Complete
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};