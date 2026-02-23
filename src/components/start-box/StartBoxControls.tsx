import React, { useState } from 'react';
import { Play, Square, RotateCcw, Pause, Volume2, VolumeX, Megaphone, Sailboat, ChevronDown } from 'lucide-react';
import type { StartBoxState, StartSequence } from '../../types/startBox';

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
  botwSequences?: StartSequence[];
  onPlayBotw?: (sequenceId: string) => void;
}

const BellIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);

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
  botwSequences = [],
  onPlayBotw,
}) => {
  const [showBotwMenu, setShowBotwMenu] = useState(false);
  const isRunning = state === 'running';
  const isPaused = state === 'paused';
  const isArmed = state === 'armed';
  const isIdle = state === 'idle';
  const isCompleted = state === 'completed';

  return (
    <div className={`flex items-center flex-wrap ${compact ? 'gap-2' : 'gap-3'}`}>
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
          className={`flex items-center justify-center gap-1.5 rounded-lg font-semibold text-white transition-all active:scale-95 ${
            compact ? 'px-3 py-2 text-xs' : 'px-3 py-2.5 text-sm'
          } bg-amber-600 hover:bg-amber-500 shadow-lg shadow-amber-600/20`}
          title="Whistle"
        >
          <Megaphone size={compact ? 13 : 15} />
          Whistle
        </button>
        <button
          onClick={onBell}
          className={`flex items-center justify-center gap-1.5 rounded-lg font-semibold text-white transition-all active:scale-95 ${
            compact ? 'px-3 py-2 text-xs' : 'px-3 py-2.5 text-sm'
          } bg-sky-600 hover:bg-sky-500 shadow-lg shadow-sky-600/20`}
          title="Bell"
        >
          <BellIcon size={compact ? 13 : 15} />
          Bell
        </button>
      </div>

      {botwSequences.length > 0 && onPlayBotw && (
        <>
          <div className="w-px h-6 bg-slate-700 mx-1" />

          <div className="relative">
            <button
              onClick={() => {
                if (botwSequences.length === 1) {
                  onPlayBotw(botwSequences[0].id);
                } else {
                  setShowBotwMenu(!showBotwMenu);
                }
              }}
              className={`flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-all active:scale-95 ${
                compact ? 'px-3 py-2 text-xs' : 'px-3 py-2.5 text-sm'
              } bg-emerald-600/15 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-600/25 hover:border-emerald-500/60 shadow-lg shadow-emerald-600/10`}
              title="Boats on the Water"
            >
              <Sailboat size={compact ? 13 : 15} />
              BOTW
              {botwSequences.length > 1 && (
                <ChevronDown size={12} className={`transition-transform ${showBotwMenu ? 'rotate-180' : ''}`} />
              )}
            </button>

            {showBotwMenu && botwSequences.length > 1 && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowBotwMenu(false)} />
                <div className="absolute bottom-full left-0 mb-1 z-50 min-w-[200px] rounded-lg border shadow-xl overflow-hidden bg-slate-800 border-slate-700">
                  <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-semibold text-slate-500 border-b border-slate-700">
                    Select BOTW Duration
                  </div>
                  {botwSequences.map(seq => (
                    <button
                      key={seq.id}
                      onClick={() => {
                        onPlayBotw(seq.id);
                        setShowBotwMenu(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors flex items-center justify-between"
                    >
                      <span className="font-medium">{seq.name}</span>
                      <span className="text-xs text-slate-500 font-mono">
                        {Math.floor(seq.total_duration_seconds / 60)}:{(seq.total_duration_seconds % 60).toString().padStart(2, '0')}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}

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
