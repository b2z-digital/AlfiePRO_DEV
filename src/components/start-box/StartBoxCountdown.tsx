import React, { useMemo } from 'react';
import type { StartBoxState } from '../../types/startBox';

interface StartBoxCountdownProps {
  remainingMs: number;
  totalDurationSeconds: number;
  state: StartBoxState;
  compact?: boolean;
}

export const StartBoxCountdown: React.FC<StartBoxCountdownProps> = ({
  remainingMs,
  totalDurationSeconds,
  state,
  compact = false,
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

  return (
    <div className="relative">
      <div className="bg-black rounded-xl p-4 border border-slate-700/50 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent pointer-events-none rounded-xl" />

        <div className="relative flex items-center justify-center">
          <div className={`font-mono font-bold tabular-nums tracking-wider ${displayColor} ${shouldPulse ? 'animate-pulse' : ''}`}
            style={{ fontSize: compact ? '2rem' : '3.5rem', lineHeight: 1, textShadow: '0 0 20px currentColor, 0 0 40px currentColor' }}
          >
            {minutes}:{seconds.toString().padStart(2, '0')}
            <span style={{ fontSize: '0.5em', opacity: 0.8 }}>.{tenths}</span>
          </div>
        </div>

        <div className="mt-3 h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-100 ${
              state === 'completed' ? 'bg-red-500' :
              progressPercent > 80 ? 'bg-red-500' :
              progressPercent > 50 ? 'bg-amber-500' :
              'bg-green-500'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="flex items-center justify-between mt-2">
          <span className="text-[10px] text-slate-600 uppercase tracking-wider font-medium">
            {state === 'idle' ? 'Ready' :
             state === 'armed' ? 'Armed' :
             state === 'running' ? 'Running' :
             state === 'paused' ? 'Paused' :
             'Complete'}
          </span>
          <span className="text-[10px] text-slate-600 font-mono">
            {Math.floor(totalDurationSeconds / 60)}:{(totalDurationSeconds % 60).toString().padStart(2, '0')} total
          </span>
        </div>
      </div>
    </div>
  );
};
