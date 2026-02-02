import React, { useState, useRef, useEffect } from 'react';
import { Flag, FileText } from 'lucide-react';
import { LetterScoreSelector } from './LetterScoreSelector';

type LetterScore = 'DNF' | 'DNS' | 'OCS' | 'DSQ' | 'BFD' | 'RET';

interface RaceInputProps {
  raceNum: number;
  skipperIndex: number;
  currentPosition: number | null;
  currentLetterScore: LetterScore | null;
  onPositionChange: (position: number | null) => void;
  onLetterScoreChange: (letterScore: LetterScore | null) => void;
  darkMode: boolean;
  disabled?: boolean;
  deleteRaceResult: () => void;
}

export const RaceInput: React.FC<RaceInputProps> = ({
  raceNum,
  skipperIndex,
  currentPosition,
  currentLetterScore,
  onPositionChange,
  onLetterScoreChange,
  darkMode,
  disabled = false,
  deleteRaceResult
}) => {
  const [showLetterModal, setShowLetterModal] = useState(false);
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);

  const handleMouseDown = () => {
    if (disabled) return;
    const timer = setTimeout(() => {
      handleLongPress();
    }, 500);
    setLongPressTimer(timer);
  };

  const handleMouseUp = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  const handleTouchStart = () => {
    if (disabled) return;
    const timer = setTimeout(() => {
      handleLongPress();
    }, 500);
    setLongPressTimer(timer);
  };

  const handleTouchEnd = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  const handleLetterScoreSelect = (letterScore: LetterScore) => {
    setShowLetterModal(false);
    onLetterScoreChange(letterScore);
    // Clear any existing position when a letter score is assigned
    if (currentPosition !== null) {
      onPositionChange(null);
    }
  };

  const handlePositionClick = () => {
      // For handicap races, show split cell format with position and handicap
      if (raceType === 'handicap' && result.handicap !== undefined) {
        return (
          <div className="relative w-full h-full flex items-center justify-center">
            {/* Diagonal line */}
            <div className="absolute inset-0">
              <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                <line 
                  x1="0" y1="0" 
                  x2="100" y2="100" 
                  stroke="currentColor" 
                  strokeWidth="1"
                  className="text-slate-600"
                />
              </svg>
            </div>
            {/* Position (top left) */}
            <div className="absolute top-1 left-1 text-xs font-bold">
              {result.position}
            </div>
            {/* Handicap (bottom right) */}
            <div className="absolute bottom-1 right-1 text-xs text-slate-400">
              {result.handicap}s
            </div>
          </div>
        );
      }
      
      // For scratch races or when no handicap, show just position
      return result.position.toString();
    if (disabled) return;
    
    // If there's a letter score, clear it
    if (currentLetterScore) {
      onLetterScoreChange(null);
      return;
    }

    // If there's a value, clear it
    if (currentPosition !== null) {
      onPositionChange(null);
      return;
    }

    if (currentLetterScore) {
      // If there's a letter score, clear it and set position to 1
      onLetterScoreChange(null);
      onPositionChange(1);
    } else if (currentPosition === null) {
      onPositionChange(1);
    } else {
      onPositionChange(currentPosition + 1);
    }
  };

  const handleRightClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (disabled) return;
    setShowLetterModal(true);
  };

  const handleLongPress = () => {
    if (disabled) return;
    setShowLetterModal(true);
  };

  return (
    <div className="relative">
      <button
        onClick={handlePositionClick}
        onContextMenu={handleRightClick}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        disabled={disabled}
        className={`
          w-12 h-12 rounded-lg font-bold text-lg transition-all duration-200 relative
          ${disabled 
            ? 'opacity-50 cursor-not-allowed' 
            : 'cursor-pointer hover:scale-110 active:scale-95'
          }
          ${currentLetterScore
            ? 'bg-red-600 text-white shadow-lg'
            : currentPosition
              ? 'bg-blue-600 text-white shadow-lg'
              : darkMode
                ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
          }
        `}
        title={
          disabled 
            ? 'Race editing disabled'
            : 'Tap to score in sequence, long press for letter scores'
        }
      >
        {currentLetterScore ? (
          <span className="text-sm">{currentLetterScore}</span>
        ) : currentPosition ? (
          currentPosition
        ) : (
          '—'
        )}
        
        {!disabled && (currentPosition || currentLetterScore) && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (currentLetterScore) {
                onLetterScoreChange(null);
              } else {
                onPositionChange(null);
              }
              deleteRaceResult();
            }}
            className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600 transition-colors"
            title="Clear result"
          >
            ×
          </button>
        )}
      </button>

      {showLetterModal && (
        <LetterScoreSelector
          onSelect={handleLetterScoreSelect}
          onClose={() => setShowLetterModal(false)}
          darkMode={darkMode}
        />
      )}
    </div>
  );
};