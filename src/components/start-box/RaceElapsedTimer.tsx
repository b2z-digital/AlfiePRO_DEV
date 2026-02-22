import React, { useState, useEffect, useRef } from 'react';
import { Timer, Square } from 'lucide-react';

interface RaceElapsedTimerProps {
  isRunning: boolean;
  onStop: () => void;
  darkMode?: boolean;
}

export const RaceElapsedTimer: React.FC<RaceElapsedTimerProps> = ({
  isRunning,
  onStop,
  darkMode = true,
}) => {
  const [elapsedMs, setElapsedMs] = useState(0);
  const startTimeRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isRunning) {
      startTimeRef.current = performance.now() - elapsedMs;
      intervalRef.current = setInterval(() => {
        setElapsedMs(performance.now() - startTimeRef.current);
      }, 100);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning]);

  const totalSec = elapsedMs / 1000;
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = Math.floor(totalSec % 60);

  const timeString = hours > 0
    ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    : `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
      darkMode
        ? 'bg-green-500/10 border border-green-500/20'
        : 'bg-green-50 border border-green-200'
    }`}>
      <Timer size={14} className={`${isRunning ? 'animate-pulse' : ''} ${darkMode ? 'text-green-400' : 'text-green-600'}`} />
      <span className={`font-mono text-sm font-semibold tabular-nums ${darkMode ? 'text-green-400' : 'text-green-700'}`}>
        {timeString}
      </span>
      {isRunning && (
        <button
          onClick={onStop}
          className={`p-0.5 rounded transition-colors ${
            darkMode ? 'hover:bg-green-500/20 text-green-400' : 'hover:bg-green-100 text-green-600'
          }`}
          title="Stop race timer"
        >
          <Square size={12} />
        </button>
      )}
    </div>
  );
};
