import React, { useMemo } from 'react';
import type { StartBoxState } from '../../types/startBox';

interface StartBoxCountdownProps {
  remainingMs: number;
  totalDurationSeconds: number;
  state: StartBoxState;
  compact?: boolean;
  preCountdown?: boolean;
  preCountdownMs?: number;
}

export const StartBoxCountdown: React.FC<StartBoxCountdownProps> = ({
  remainingMs,
  totalDurationSeconds,
  state,
  compact = false,
  preCountdown = false,
  preCountdownMs = 0,
}) => {
  const { minutes, seconds, tenths, displayColor, shouldPulse, progressPercent } = useMemo(() => {
    const totalMs = Math.max(0, remainingMs);
    const totalSec = totalMs / 1000;
    const m = Math.floor(totalSec / 60);
    const s = Math.floor(totalSec % 60);
    const t = Math.floor((totalMs % 1000) / 100);

    let color = 'text-green-400';
    let pulse = false;

    if (state === 'running') {
      if (totalSec <= 5) {
        color = 'text-red-500';
        pulse = true;
      } else if (totalSec <= 10) {
        color = 'text-red-400';
      } else if (totalSec <= 30) {
        color = 'text-amber-400';
      } else {
        color = 'text-green-400';
      }
    } else if (state === 'paused') {
      color = 'text-amber-400';
      pulse = true;
    } else if (state === 'completed') {
      color = 'text-red-500';
    } else if (state === 'armed') {
      color = 'text-cyan-400';
    }

    const progress = totalDurationSeconds > 0
      ? ((totalDurationSeconds * 1000 - totalMs) / (totalDurationSeconds * 1000)) * 100
      : 0;

    return {
      minutes: m,
      seconds: s,
      tenths: t,
      displayColor: color,
      shouldPulse: pulse,
      progressPercent: Math.min(100, Math.max(0, progress)),
    };
  }, [remainingMs, totalDurationSeconds, state]);

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <span className={`font-mono font-bold text-lg tabular-nums ${displayColor} ${shouldPulse ? 'animate-pulse' : ''}`}>
          {minutes}:{seconds.toString().padStart(2, '0')}.{tenths}
        </span>
      </div>
    );
  }

  const stateLabel =
    state === 'idle' ? 'READY' :
    state === 'armed' ? 'ARMED' :
    state === 'running' ? 'RUNNING' :
    state === 'paused' ? 'PAUSED' :
    'COMPLETE';

  const stateDotColor =
    state === 'running' ? 'bg-green-500' :
    state === 'paused' ? 'bg-amber-500' :
    state === 'armed' ? 'bg-cyan-500' :
    state === 'completed' ? 'bg-red-500' :
    'bg-slate-600';

  const preCountdownSec = Math.ceil(preCountdownMs / 1000);

  return (
    <div className="relative">
      <div className="bg-black rounded-2xl p-6 pb-4 border border-slate-700/50 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none rounded-2xl" />

        {preCountdown && state === 'running' ? (
          <>
            <div className="relative flex flex-col items-center justify-center py-4 gap-1">
              <div
                className="font-mono font-bold tabular-nums tracking-wider text-cyan-400 animate-pulse"
                style={{ fontSize: '5.5rem', lineHeight: 1, textShadow: '0 0 30px currentColor, 0 0 60px currentColor' }}
              >
                {minutes}:{seconds.toString().padStart(2, '0')}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                <span className="text-xs text-cyan-400/80 font-semibold uppercase tracking-wider">
                  Audio Playing — Countdown in {preCountdownSec}s
                </span>
              </div>
            </div>
          </>
        ) : (
          <div className="relative flex items-baseline justify-center py-4">
            <div
              className={`font-mono font-bold tabular-nums tracking-wider ${displayColor} ${shouldPulse ? 'animate-pulse' : ''}`}
              style={{ fontSize: '5.5rem', lineHeight: 1, textShadow: '0 0 30px currentColor, 0 0 60px currentColor' }}
            >
              {minutes}:{seconds.toString().padStart(2, '0')}
            </div>
          </div>
        )}

        <div className="mt-2 h-1 bg-slate-800/80 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-100 ${
              state === 'completed' ? 'bg-red-500' :
              preCountdown ? 'bg-cyan-500' :
              progressPercent > 80 ? 'bg-red-500' :
              progressPercent > 50 ? 'bg-amber-500' :
              'bg-green-500'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="flex items-center justify-between mt-2.5">
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${preCountdown ? 'bg-cyan-500 animate-pulse' : stateDotColor} ${!preCountdown && state === 'running' ? 'animate-pulse' : ''}`} />
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">
              {preCountdown ? 'AUDIO INTRO' : stateLabel}
            </span>
          </div>
          <span className="text-[10px] text-slate-600 font-mono">
            {Math.floor(totalDurationSeconds / 60)}:{(totalDurationSeconds % 60).toString().padStart(2, '0')} total
          </span>
        </div>
      </div>
    </div>
  );
};
