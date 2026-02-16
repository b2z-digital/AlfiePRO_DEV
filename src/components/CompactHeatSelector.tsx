import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Check, Flame, ChevronRight, X, Info } from 'lucide-react';
import { HeatDesignation } from '../types/heat';

interface CompactHeatSelectorProps {
  availableHeats: HeatDesignation[];
  selectedHeat: HeatDesignation | null;
  currentRound: number;
  darkMode: boolean;
  onSelectHeat: (heat: HeatDesignation) => void;
  getHeatProgress: (heat: HeatDesignation) => { scored: number; total: number };
  isHeatComplete: (heat: HeatDesignation) => boolean;
  getHeatColor: (heat: HeatDesignation) => string;
  getHeatLabel: (heat: HeatDesignation) => string;
  canGoBackToPreviousRound?: boolean;
  onGoBackToPreviousRound?: () => void;
  showAdvanceButton?: boolean;
  onAdvanceToNextRound?: () => void;
  isViewingPreviousRound?: boolean;
  activeRound?: number;
  onGoToRound?: (round: number) => void;
  getRoundLabel?: (roundNum: number) => string;
}

export const CompactHeatSelector: React.FC<CompactHeatSelectorProps> = ({
  availableHeats,
  selectedHeat,
  currentRound,
  darkMode,
  onSelectHeat,
  getHeatProgress,
  isHeatComplete,
  getHeatColor,
  getHeatLabel,
  canGoBackToPreviousRound,
  onGoBackToPreviousRound,
  showAdvanceButton,
  onAdvanceToNextRound,
  isViewingPreviousRound,
  activeRound,
  onGoToRound,
  getRoundLabel: getRoundLabelProp
}) => {
  const getRoundLabel = getRoundLabelProp || ((n: number) => `Round ${n}`);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showQuickSelect, setShowQuickSelect] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const quickSelectRef = useRef<HTMLDivElement>(null);

  // Touch gesture handling for swipe
  const touchStart = useRef<number | null>(null);
  const touchEnd = useRef<number | null>(null);

  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    touchEnd.current = null;
    touchStart.current = e.targetTouches[0].clientX;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    touchEnd.current = e.targetTouches[0].clientX;
  };

  const onTouchEnd = () => {
    if (!touchStart.current || !touchEnd.current) return;

    const distance = touchStart.current - touchEnd.current;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe || isRightSwipe) {
      const currentIndex = availableHeats.findIndex(h => h === selectedHeat);
      if (isLeftSwipe && currentIndex < availableHeats.length - 1) {
        onSelectHeat(availableHeats[currentIndex + 1]);
      } else if (isRightSwipe && currentIndex > 0) {
        onSelectHeat(availableHeats[currentIndex - 1]);
      }
    }
  };

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsExpanded(false);
      }
      if (quickSelectRef.current && !quickSelectRef.current.contains(event.target as Node)) {
        setShowQuickSelect(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!selectedHeat) return null;

  const progress = getHeatProgress(selectedHeat);
  const isComplete = isHeatComplete(selectedHeat);
  const completionPercentage = progress.total > 0 ? (progress.scored / progress.total) * 100 : 0;

  return (
    <>
      {/* Compact Floating Pill - Single button that opens slide-out */}
      <div className="fixed top-20 right-4 z-40 animate-slideIn">
        {/* Main Heat Pill - Click to open slide-out panel */}
        <button
          onClick={() => setIsExpanded(true)}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          className={`
            ${getHeatColor(selectedHeat)}
            px-5 py-3 rounded-2xl shadow-2xl backdrop-blur-sm
            transform transition-all duration-300 hover:scale-105
            flex items-center gap-3 group relative overflow-hidden
          `}
        >
          {/* Animated gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 animate-shimmer"></div>

          <div className="relative z-10 flex items-center gap-3">
            {/* Heat Icon */}
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm">
              <span className="text-xl font-bold text-white">{selectedHeat}</span>
            </div>

            {/* Heat Info */}
            <div className="text-left">
              <div className="text-sm font-semibold text-white/90">{getHeatLabel(selectedHeat)}</div>
              <div className="text-xs text-white/70 flex items-center gap-1.5">
                <span className="font-medium">{progress.scored}/{progress.total}</span>
                {isComplete ? (
                  <Check size={12} className="text-white" />
                ) : (
                  <Flame size={12} className="animate-pulse" />
                )}
              </div>
            </div>

            {/* Slide-out indicator */}
            <ChevronRight
              size={16}
              className="text-white/70"
            />
          </div>

          {/* Progress bar */}
          <div className="absolute bottom-0 left-0 h-1 bg-white/20 w-full">
            <div
              className="h-full bg-white/60 transition-all duration-500"
              style={{ width: `${completionPercentage}%` }}
            />
          </div>
        </button>
      </div>

      {/* Quick Select Popover - REMOVED, no longer needed */}
      {false && showQuickSelect && (
        <div
          ref={quickSelectRef}
          className="fixed top-36 right-4 z-50 animate-slideInFast"
        >
          <div className={`
            rounded-2xl shadow-2xl backdrop-blur-xl border overflow-hidden min-w-[280px]
            ${darkMode
              ? 'bg-slate-800/95 border-slate-700'
              : 'bg-white/95 border-slate-200'}
          `}>
            <div className={`px-4 py-3 border-b ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
              <h3 className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                Switch Heat
              </h3>
              <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Tap a heat or swipe on the pill
              </p>
            </div>

            <div className="p-3 space-y-2 max-h-[300px] overflow-y-auto">
              {availableHeats.map((heat) => {
                const heatProgress = getHeatProgress(heat);
                const heatComplete = isHeatComplete(heat);
                const isSelected = heat === selectedHeat;

                return (
                  <button
                    key={heat}
                    onClick={() => {
                      onSelectHeat(heat);
                      setShowQuickSelect(false);
                    }}
                    className={`
                      w-full p-3 rounded-xl transition-all flex items-center gap-3 group
                      ${isSelected
                        ? `${getHeatColor(heat)} text-white shadow-lg scale-[1.02]`
                        : darkMode
                          ? 'bg-slate-700/50 hover:bg-slate-700 text-slate-200'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-800'}
                    `}
                  >
                    <div className={`
                      w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg
                      ${isSelected
                        ? 'bg-white/20'
                        : darkMode
                          ? 'bg-slate-600 text-slate-300'
                          : 'bg-slate-200 text-slate-700'}
                    `}>
                      {heat}
                    </div>

                    <div className="flex-1 text-left">
                      <div className="font-semibold">{getHeatLabel(heat)}</div>
                      <div className={`text-xs ${isSelected ? 'text-white/80' : darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        {heatProgress.scored}/{heatProgress.total} scored
                      </div>
                    </div>

                    {heatComplete && (
                      <Check size={18} className={isSelected ? 'text-white' : 'text-emerald-500'} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Slide-out Panel */}
      {isExpanded && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 animate-fadeIn"
            onClick={() => setIsExpanded(false)}
          />

          {/* Panel */}
          <div
            ref={panelRef}
            className={`
              fixed top-0 right-0 h-full w-full max-w-md z-50
              ${darkMode ? 'bg-slate-800' : 'bg-white'}
              shadow-2xl animate-slideInFromRight
            `}
          >
            {/* Panel Header */}
            <div className={`
              p-6 border-b
              ${darkMode ? 'bg-slate-900/50 border-slate-700' : 'bg-slate-50 border-slate-200'}
            `}>
              <div className="flex items-center justify-between mb-4">
                <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                  Heat Selection
                </h2>
                <button
                  onClick={() => setIsExpanded(false)}
                  className={`
                    p-2 rounded-xl transition-all hover:rotate-90
                    ${darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-200'}
                  `}
                >
                  <X size={24} className={darkMode ? 'text-slate-400' : 'text-slate-600'} />
                </button>
              </div>

              <div className={`
                flex items-center gap-2 px-3 py-2 rounded-lg
                ${darkMode ? 'bg-blue-600/20 border border-blue-500/30' : 'bg-blue-50 border border-blue-200'}
              `}>
                <Info size={16} className="text-blue-500" />
                <p className={`text-sm ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>
                  {getRoundLabel(currentRound)} • {availableHeats.length} Heats
                </p>
              </div>
            </div>

            {/* Panel Content */}
            <div className="p-6 overflow-y-auto h-[calc(100%-200px)]">
              <div className="space-y-4">
                {availableHeats.map((heat) => {
                  const heatProgress = getHeatProgress(heat);
                  const heatComplete = isHeatComplete(heat);
                  const isSelected = heat === selectedHeat;
                  const completionPct = heatProgress.total > 0
                    ? (heatProgress.scored / heatProgress.total) * 100
                    : 0;

                  return (
                    <button
                      key={heat}
                      onClick={() => {
                        onSelectHeat(heat);
                        setIsExpanded(false);
                      }}
                      className={`
                        w-full p-5 rounded-2xl transition-all transform hover:scale-[1.02]
                        ${isSelected
                          ? `${getHeatColor(heat)} text-white shadow-2xl ring-4 ring-offset-2 ${darkMode ? 'ring-offset-slate-800' : 'ring-offset-white'} ring-white/50`
                          : darkMode
                            ? 'bg-slate-700/50 hover:bg-slate-700 text-slate-200'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200'}
                      `}
                    >
                      <div className="flex items-center gap-4 mb-3">
                        <div className={`
                          w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-2xl
                          ${isSelected
                            ? 'bg-white/20 backdrop-blur-sm'
                            : darkMode
                              ? 'bg-slate-600'
                              : 'bg-slate-200'}
                        `}>
                          {heat}
                        </div>

                        <div className="flex-1 text-left">
                          <div className="text-lg font-bold">{getHeatLabel(heat)}</div>
                          <div className={`text-sm ${isSelected ? 'text-white/80' : darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                            {heatProgress.scored} of {heatProgress.total} skippers scored
                          </div>
                        </div>

                        {heatComplete && (
                          <div className={`
                            w-10 h-10 rounded-full flex items-center justify-center
                            ${isSelected ? 'bg-white/20' : 'bg-emerald-500'}
                          `}>
                            <Check size={20} className="text-white" />
                          </div>
                        )}
                      </div>

                      {/* Progress Bar */}
                      <div className={`
                        h-2 rounded-full overflow-hidden
                        ${isSelected ? 'bg-white/20' : darkMode ? 'bg-slate-600' : 'bg-slate-200'}
                      `}>
                        <div
                          className={`h-full transition-all duration-500 ${isSelected ? 'bg-white/60' : 'bg-emerald-500'}`}
                          style={{ width: `${completionPct}%` }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Panel Footer with Actions */}
            <div className={`
              p-6 border-t space-y-3
              ${darkMode ? 'bg-slate-900/50 border-slate-700' : 'bg-slate-50 border-slate-200'}
            `}>
              {canGoBackToPreviousRound && onGoBackToPreviousRound && (
                <button
                  onClick={() => {
                    onGoBackToPreviousRound();
                    setIsExpanded(false);
                  }}
                  className="w-full px-4 py-3 rounded-xl font-medium transition-all bg-amber-500 text-white hover:bg-amber-600 shadow-lg"
                >
                  ← Back to {getRoundLabel(currentRound - 1)}
                </button>
              )}

              {showAdvanceButton && onAdvanceToNextRound && (
                <button
                  onClick={() => {
                    onAdvanceToNextRound();
                    setIsExpanded(false);
                  }}
                  className="w-full px-4 py-3 rounded-xl font-medium transition-all bg-blue-500 text-white hover:bg-blue-600 shadow-lg"
                >
                  Continue to {getRoundLabel(currentRound + 1)} →
                </button>
              )}

              {isViewingPreviousRound && activeRound && onGoToRound && (
                <button
                  onClick={() => {
                    onGoToRound(activeRound);
                    setIsExpanded(false);
                  }}
                  className="w-full px-4 py-3 rounded-xl font-medium transition-all bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg"
                >
                  Go to {getRoundLabel(activeRound!)} →
                </button>
              )}
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes slideInFast {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slideInFromRight {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }

        .animate-slideIn {
          animation: slideIn 0.3s ease-out;
        }

        .animate-slideInFast {
          animation: slideInFast 0.2s ease-out;
        }

        .animate-slideInFromRight {
          animation: slideInFromRight 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }

        .animate-shimmer {
          animation: shimmer 3s infinite;
        }
      `}</style>
    </>
  );
};
