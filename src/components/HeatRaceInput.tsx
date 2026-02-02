import React, { useState } from 'react';
import { LetterScore } from '../types/letterScores';

interface HeatRaceInputProps {
  id: string;
  value: number | null;
  letterScore?: LetterScore;
  onChange: (value: number | null, letterScore?: LetterScore) => void;
  onOpenLetterScoreSelector: () => void;
  maxPosition: number;
  disabled: boolean;
  darkMode: boolean;
  touchInputMode: boolean;
  nextPosition: number; // The next available finishing position
}

export const HeatRaceInput: React.FC<HeatRaceInputProps> = ({
  id,
  value,
  letterScore,
  onChange,
  onOpenLetterScoreSelector,
  maxPosition,
  disabled,
  darkMode,
  touchInputMode,
  nextPosition
}) => {
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

  const handlePositionClick = () => {
    if (disabled) return;

    // If there's a letter score, clear it
    if (letterScore) {
      onChange(null, undefined);
      return;
    }

    // If there's a value, clear it
    if (value !== null) {
      onChange(null, undefined);
      return;
    }

    // Assign the next available position (excluding letter scores)
    onChange(nextPosition, undefined);
  };

  const handleRightClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (disabled) return;
    onOpenLetterScoreSelector();
  };

  const handleLongPress = () => {
    if (disabled) return;
    onOpenLetterScoreSelector();
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
          ${letterScore
            ? 'bg-red-600 text-white shadow-lg'
            : value
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
        {letterScore ? (
          <span className="text-sm">{letterScore}</span>
        ) : value ? (
          value
        ) : (
          '—'
        )}

        {!disabled && (value || letterScore) && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onChange(null, undefined);
            }}
            className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600 transition-colors"
            title="Clear result"
          >
            ×
          </button>
        )}
      </button>
    </div>
  );
};
