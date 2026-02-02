import React, { useState, useEffect, useRef } from 'react';
import { Settings, Users, Timer, Award, Moon, Sun, Flag, RefreshCw, Home } from 'lucide-react';
import { Skipper, RaceType } from '../types';
import { useNavigate } from 'react-router-dom';
import { ConfirmationModal } from './ConfirmationModal';

interface ControlsProps {
  capLimit: number;
  setCapLimit: (value: number) => void;
  lastPlaceBonus: boolean;
  setLastPlaceBonus: (value: boolean) => void;
  determineInitialHandicaps: () => boolean;
  hasDeterminedInitialHcaps: boolean;
  skippers: Skipper[];
  raceResults: any[];
  editingRace: number | null;
  onManageSkippers: () => void;
  onManageMembers: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  raceType: RaceType;
  onRaceTypeChange: (type: RaceType) => void;
  onNewSession: () => void;
  onReturnToRaceManagement: () => void;
}

export const Controls: React.FC<ControlsProps> = ({
  capLimit,
  setCapLimit,
  lastPlaceBonus,
  setLastPlaceBonus,
  skippers,
  raceResults,
  editingRace,
  onManageSkippers,
  onManageMembers,
  darkMode,
  onToggleDarkMode,
  raceType,
  onRaceTypeChange,
  onNewSession,
  onReturnToRaceManagement,
}) => {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = React.useState(false);
  const [showExitConfirm, setShowExitConfirm] = React.useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setIsExpanded(false);
        setShowConfirmDialog(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isRace1Complete = skippers.every((_, i) => 
    raceResults.some(r => r.race === 1 && r.skipperIndex === i)
  );

  const areControlsLocked = isRace1Complete && editingRace !== 1;
  const hasResults = raceResults.length > 0;

  const handleNewSession = () => {
    if (raceResults.length > 0) {
      setShowConfirmDialog(true);
    }
  };

  // FIXED: Direct navigation to dashboard
  const handleDashboardClick = () => {
    console.log('🏠 Dashboard button clicked in Controls');
    if (raceResults.length > 0) {
      console.log('🏠 Results exist, showing confirmation modal');
      setShowExitConfirm(true);
    } else {
      console.log('🏠 No results, navigating to dashboard immediately');
      navigate('/');
    }
  };

  return (
    <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
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

      <div className="relative flex justify-end" ref={settingsRef}>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
            darkMode 
              ? 'text-slate-300 hover:text-slate-100 bg-slate-800 hover:bg-slate-700' 
              : 'text-slate-600 hover:text-slate-800 bg-white hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <Settings size={18} />
          <span className="text-sm font-medium">Settings</span>
        </button>

        <div className={`
          absolute top-full right-0 mt-2 w-80 rounded-lg shadow-lg 
          ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} 
          border overflow-hidden transition-all duration-200 origin-top-right
          ${isExpanded 
            ? 'opacity-100 scale-100 translate-y-0' 
            : 'opacity-0 scale-95 -translate-y-2 pointer-events-none'
          }
        `}>
          <div className="p-4 space-y-4">
            <button
              onClick={onManageMembers}
              className="w-full flex items-center gap-3 p-3 bg-[#2c5282] hover:bg-[#234067] text-white rounded-lg transition-colors"
            >
              <Users size={18} />
              <div className="text-left">
                <div className="font-medium">Club Members</div>
                <span className="text-xs opacity-90">Manage club membership</span>
              </div>
            </button>

            <button
              onClick={onManageSkippers}
              className="w-full flex items-center gap-3 p-3 bg-[#2c5282] hover:bg-[#234067] text-white rounded-lg transition-colors"
            >
              <Users size={18} />
              <div className="text-left">
                <div className="font-medium">Race Skippers</div>
                <span className="text-xs opacity-90">Add or remove race participants</span>
              </div>
            </button>

            {raceType === 'handicap' && (
              <>
                <div className={`p-3 rounded-lg ${darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-50'} transition-colors`}>
                  <label className={`text-sm font-medium ${
                    areControlsLocked 
                      ? 'text-slate-500' 
                      : darkMode ? 'text-slate-200' : 'text-slate-700'
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      <Timer size={16} className="text-slate-400" />
                      Handicap Cap
                    </div>
                    <div className="flex items-center">
                      <input
                        type="number"
                        className={`w-24 px-3 py-2 border rounded text-center focus:outline-none focus:ring focus:ring-blue-200
                          ${areControlsLocked
                            ? 'border-slate-600 bg-slate-700 cursor-not-allowed'
                            : darkMode
                              ? 'border-slate-600 bg-slate-700 text-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        value={capLimit}
                        onChange={(e) => setCapLimit(parseInt(e.target.value))}
                        onFocus={(e) => e.target.select()}
                        min={30}
                        max={300}
                        step={10}
                        disabled={areControlsLocked}
                      />
                      <span className={`ml-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>seconds</span>
                    </div>
                  </label>
                </div>

                <div className={`p-3 rounded-lg ${darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-50'} transition-colors`}>
                  <label className={`text-sm font-medium flex items-start gap-3 ${
                    areControlsLocked 
                      ? 'text-slate-500' 
                      : darkMode ? 'text-slate-200' : 'text-slate-700'
                  }`}>
                    <input
                      type="checkbox"
                      className={`mt-1 w-4 h-4 rounded focus:ring-blue-500
                        ${areControlsLocked 
                          ? 'text-slate-600 cursor-not-allowed' 
                          : 'text-blue-600'}`}
                      checked={lastPlaceBonus}
                      onChange={(e) => setLastPlaceBonus(e.target.checked)}
                      disabled={areControlsLocked}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <Award size={16} className="text-slate-400" />
                        Last Place Bonus
                      </div>
                      <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        Add 30 seconds to last place finisher
                      </span>
                    </div>
                  </label>
                </div>
              </>
            )}

            <div className={`p-3 rounded-lg ${darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-50'} transition-colors`}>
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
                    onChange={onToggleDarkMode}
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

            {hasResults && (
              <>
                <div className="border-t border-slate-700 -mx-4 my-4"></div>

                <button
                  onClick={handleNewSession}
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

        {/* Confirmation Dialog */}
        {showConfirmDialog && (
          <div className={`
            absolute top-full right-0 mt-2 w-80 p-4 rounded-lg shadow-lg border
            ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}
          `}>
            <p className={`text-sm mb-4 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              {raceType === 'handicap' 
                ? "This will clear all race results and reset handicaps. Are you sure you want to start a new race day?"
                : "This will clear all race results. Are you sure you want to start a new race day?"}
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
                  onNewSession();
                  setShowConfirmDialog(false);
                  setIsExpanded(false);
                }}
                className="px-3 py-1.5 bg-red-600 text-white rounded text-sm font-medium hover:bg-red-700"
              >
                Clear Results
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmationModal
        isOpen={showExitConfirm}
        onClose={() => setShowExitConfirm(false)}
        onConfirm={onReturnToRaceManagement}
        title="Return to Dashboard"
        message="Are you sure you want to exit? Your results will be saved, but any unsaved changes will be lost."
        confirmText="Exit"
        cancelText="Stay"
        darkMode={darkMode}
      />
    </div>
  );
};
// Export alias for backward compatibility
export const SettingsDropdown = Controls;