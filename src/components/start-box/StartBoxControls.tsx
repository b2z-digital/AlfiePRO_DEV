import React from 'react';
import { Play, Square, RotateCcw, Pause, Volume2, VolumeX } from 'lucide-react';
import type { StartBoxState } from '../../types/startBox';

interface StartBoxControlsProps {
  state: StartBoxState;
  volume: number;
  onStart: () => void;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
  onWhistle: () => void;
  onBell: () => void;
  onVolumeChange: (vol: number) => void;
  compact?: boolean;
}

export const StartBoxControls: React.FC<StartBoxControlsProps> = ({
  state,
  volume,
  onStart,
  onStop,
  onPause,
  onResume,
  onReset,
  onWhistle,
  onBell,
  onVolumeChange,
  compact = false,
}) => {
  const isRunning = state === 'running';
  const isPaused = state === 'paused';
  const isArmed = state === 'armed';
  const isIdle = state === 'idle';
  const isCompleted = state === 'completed';

  return (
    <div className={`flex items-center ${compact ? 'gap-2' : 'gap-3'}`}>
      <div className="flex items-center gap-1.5">
        {(isArmed || isPaused) && (
          <button
            onClick={isPaused ? onResume : onStart}
            className={`flex items-center justify-center gap-1.5 rounded-lg font-semibold text-white transition-all active:scale-95 ${
              compact ? 'px-3 py-2 text-xs' : 'px-4 py-2.5 text-sm'
            } bg-green-600 hover:bg-green-500 shadow-lg shadow-green-600/25`}
          >
            <Play size={compact ? 14 : 16} className="ml-0.5" />
            {isPaused ? 'Resume' : 'Start'}
          </button>
        )}

        {isRunning && (
          <button
            onClick={onPause}
            className={`flex items-center justify-center gap-1.5 rounded-lg font-semibold text-white transition-all active:scale-95 ${
              compact ? 'px-3 py-2 text-xs' : 'px-4 py-2.5 text-sm'
            } bg-amber-600 hover:bg-amber-500 shadow-lg shadow-amber-600/25`}
          >
            <Pause size={compact ? 14 : 16} />
            Pause
          </button>
        )}

        {(isRunning || isPaused) && (
          <button
            onClick={onStop}
            className={`flex items-center justify-center gap-1.5 rounded-lg font-semibold text-white transition-all active:scale-95 ${
              compact ? 'px-3 py-2 text-xs' : 'px-4 py-2.5 text-sm'
            } bg-red-600 hover:bg-red-500 shadow-lg shadow-red-600/25`}
          >
            <Square size={compact ? 14 : 16} />
            Stop
          </button>
        )}

        {(isCompleted || isIdle) && (
          <button
            onClick={onReset}
            className={`flex items-center justify-center gap-1.5 rounded-lg font-semibold text-white transition-all active:scale-95 ${
              compact ? 'px-3 py-2 text-xs' : 'px-4 py-2.5 text-sm'
            } bg-slate-600 hover:bg-slate-500`}
          >
            <RotateCcw size={compact ? 14 : 16} />
            Reset
          </button>
        )}
      </div>

      <div className="w-px h-6 bg-slate-700 mx-1" />

      <div className="flex items-center gap-1.5">
        <button
          onClick={onWhistle}
          className={`rounded-lg font-semibold text-white transition-all active:scale-95 ${
            compact ? 'px-3 py-2 text-xs' : 'px-3 py-2.5 text-sm'
          } bg-amber-600 hover:bg-amber-500 shadow-lg shadow-amber-600/20`}
        >
          Whistle
        </button>
        <button
          onClick={onBell}
          className={`rounded-lg font-semibold text-white transition-all active:scale-95 ${
            compact ? 'px-3 py-2 text-xs' : 'px-3 py-2.5 text-sm'
          } bg-sky-600 hover:bg-sky-500 shadow-lg shadow-sky-600/20`}
        >
          Bell
        </button>
      </div>

      <div className="w-px h-6 bg-slate-700 mx-1" />

      <div className="flex items-center gap-2 min-w-[120px]">
        {volume === 0 ? (
          <VolumeX size={14} className="text-slate-500 flex-shrink-0" />
        ) : (
          <Volume2 size={14} className="text-slate-400 flex-shrink-0" />
        )}
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(volume * 100)}
          onChange={e => onVolumeChange(parseInt(e.target.value) / 100)}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-slate-700 accent-blue-500"
          style={{ accentColor: '#3b82f6' }}
        />
        <span className="text-[10px] text-slate-500 font-mono w-8 text-right flex-shrink-0">
          {Math.round(volume * 100)}%
        </span>
      </div>
    </div>
  );
};
