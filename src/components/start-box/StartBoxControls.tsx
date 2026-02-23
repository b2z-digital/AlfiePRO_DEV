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

  if (compact) {
    return (
      <div className="flex items-center flex-wrap gap-2">
        <div className="flex items-center gap-1.5">
          {(isArmed || isPaused) && (
            <button
              onClick={isPaused ? onResume : onStart}
              className="flex items-center justify-center gap-1.5 rounded-lg font-semibold text-white transition-all active:scale-95 px-3 py-2 text-xs bg-green-600 hover:bg-green-500"
            >
              <Play size={14} className="ml-0.5" />
              {isPaused ? 'Resume' : 'Start'}
            </button>
          )}
          {isRunning && (
            <button
              onClick={onPause}
              className="flex items-center justify-center gap-1.5 rounded-lg font-semibold text-white transition-all active:scale-95 px-3 py-2 text-xs bg-amber-600 hover:bg-amber-500"
            >
              <Pause size={14} />
              Pause
            </button>
          )}
          {(isRunning || isPaused) && (
            <button
              onClick={onStop}
              className="flex items-center justify-center gap-1.5 rounded-lg font-semibold text-white transition-all active:scale-95 px-3 py-2 text-xs bg-red-600 hover:bg-red-500"
            >
              <Square size={14} />
              Stop
            </button>
          )}
          {(isCompleted || isIdle) && (
            <button
              onClick={onReset}
              className="flex items-center justify-center gap-1.5 rounded-lg font-semibold text-white transition-all active:scale-95 px-3 py-2 text-xs bg-slate-600 hover:bg-slate-500"
            >
              <RotateCcw size={14} />
              Reset
            </button>
          )}
        </div>
        <div className="w-px h-6 bg-slate-700 mx-1" />
        <div className="flex items-center gap-1.5">
          <button onClick={onWhistle} className="flex items-center gap-1 px-2 py-1.5 rounded text-xs text-slate-400 hover:text-white hover:bg-slate-700 transition-colors" title="Whistle">
            <Megaphone size={13} />
          </button>
          <button onClick={onBell} className="flex items-center gap-1 px-2 py-1.5 rounded text-xs text-slate-400 hover:text-white hover:bg-slate-700 transition-colors" title="Bell">
            <BellIcon size={13} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={onWhistle}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all active:scale-95 bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:border-slate-600 hover:bg-slate-750"
            title="Whistle"
          >
            <Megaphone size={15} className="text-amber-400/70" />
            Whistle
          </button>
          <button
            onClick={onBell}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all active:scale-95 bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:border-slate-600 hover:bg-slate-750"
            title="Bell"
          >
            <BellIcon size={15} />
            <span className="text-slate-300">Bell</span>
          </button>

          {botwSequences.length > 0 && onPlayBotw && (
            <div className="relative">
              <button
                onClick={() => {
                  if (botwSequences.length === 1) {
                    onPlayBotw(botwSequences[0].id);
                  } else {
                    setShowBotwMenu(!showBotwMenu);
                  }
                }}
                className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all active:scale-95 bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:border-slate-600 hover:bg-slate-750"
                title="Boats on the Water"
              >
                <Sailboat size={15} className="text-emerald-400/70" />
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
          )}
        </div>

        <div className="flex items-center gap-2">
          {volume === 0 ? (
            <VolumeX size={14} className="text-slate-500 flex-shrink-0" />
          ) : (
            <Volume2 size={14} className="text-slate-500 flex-shrink-0" />
          )}
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(volume * 100)}
            onChange={e => onVolumeChange(parseInt(e.target.value) / 100)}
            className="w-20 h-1 rounded-full appearance-none cursor-pointer bg-slate-700 accent-blue-500"
            style={{ accentColor: '#3b82f6' }}
          />
          <span className="text-[10px] text-slate-500 font-mono w-7 text-right flex-shrink-0">
            {Math.round(volume * 100)}%
          </span>
        </div>
      </div>

      <div className="flex justify-center pt-1">
        {(isArmed || isPaused) && (
          <button
            onClick={isPaused ? onResume : onStart}
            className="w-20 h-20 rounded-full flex items-center justify-center bg-green-600 hover:bg-green-500 text-white font-bold text-sm transition-all active:scale-90 shadow-lg shadow-green-600/30 ring-2 ring-green-500/20 ring-offset-2 ring-offset-slate-900"
          >
            <div className="flex flex-col items-center gap-0.5">
              <Play size={22} className="ml-0.5" />
              <span className="text-[10px] font-semibold uppercase tracking-wider">{isPaused ? 'Resume' : 'Start'}</span>
            </div>
          </button>
        )}

        {isRunning && (
          <div className="flex items-center gap-4">
            <button
              onClick={onPause}
              className="w-16 h-16 rounded-full flex items-center justify-center bg-amber-600 hover:bg-amber-500 text-white font-bold text-sm transition-all active:scale-90 shadow-lg shadow-amber-600/25 ring-2 ring-amber-500/20 ring-offset-2 ring-offset-slate-900"
            >
              <div className="flex flex-col items-center gap-0.5">
                <Pause size={18} />
                <span className="text-[9px] font-semibold uppercase tracking-wider">Pause</span>
              </div>
            </button>
            <button
              onClick={onStop}
              className="w-20 h-20 rounded-full flex items-center justify-center bg-red-600 hover:bg-red-500 text-white font-bold text-sm transition-all active:scale-90 shadow-lg shadow-red-600/30 ring-2 ring-red-500/20 ring-offset-2 ring-offset-slate-900"
            >
              <div className="flex flex-col items-center gap-0.5">
                <Square size={22} />
                <span className="text-[10px] font-semibold uppercase tracking-wider">Stop</span>
              </div>
            </button>
          </div>
        )}

        {(isCompleted || isIdle) && (
          <button
            onClick={onReset}
            className="w-16 h-16 rounded-full flex items-center justify-center bg-slate-700 hover:bg-slate-600 text-slate-300 font-bold text-sm transition-all active:scale-90 ring-2 ring-slate-600/20 ring-offset-2 ring-offset-slate-900"
          >
            <div className="flex flex-col items-center gap-0.5">
              <RotateCcw size={18} />
              <span className="text-[9px] font-semibold uppercase tracking-wider">Reset</span>
            </div>
          </button>
        )}
      </div>
    </div>
  );
};
