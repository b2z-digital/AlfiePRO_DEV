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
  const {
    totalSecondsDisplay,
    colorHex,
    colorClass,
    glowColor,
    shouldPulse,
    progressFraction,
    trackColorClass,
  } = useMemo(() => {
    const totalMs = Math.max(0, remainingMs);
    const totalSec = Math.ceil(totalMs / 1000);
    const displayMs = totalSec * 1000;

    let hex = '#22d3ee'; // cyan
    let cls = 'text-cyan-400';
    let glow = 'rgba(34,211,238,0.4)';
    let track = 'text-cyan-950';
    let pulse = false;

    if (state === 'running') {
      if (totalSec <= 5) {
        hex = '#ef4444';
        cls = 'text-red-500';
        glow = 'rgba(239,68,68,0.5)';
        track = 'text-red-950';
        pulse = true;
      } else if (totalSec <= 10) {
        hex = '#f97316';
        cls = 'text-orange-500';
        glow = 'rgba(249,115,22,0.4)';
        track = 'text-orange-950';
      } else if (totalSec <= 30) {
        hex = '#f59e0b';
        cls = 'text-amber-400';
        glow = 'rgba(245,158,11,0.35)';
        track = 'text-amber-950';
      } else {
        hex = '#22d3ee';
        cls = 'text-cyan-400';
        glow = 'rgba(34,211,238,0.35)';
        track = 'text-cyan-950';
      }
    } else if (state === 'paused') {
      hex = '#f59e0b';
      cls = 'text-amber-400';
      glow = 'rgba(245,158,11,0.4)';
      track = 'text-amber-950';
      pulse = true;
    } else if (state === 'completed') {
      hex = '#ef4444';
      cls = 'text-red-500';
      glow = 'rgba(239,68,68,0.5)';
      track = 'text-red-950';
    } else if (state === 'armed') {
      hex = '#22d3ee';
      cls = 'text-cyan-400';
      glow = 'rgba(34,211,238,0.35)';
      track = 'text-cyan-950';
    }

    const fraction = totalDurationSeconds > 0
      ? displayMs / (totalDurationSeconds * 1000)
      : 1;

    return {
      totalSecondsDisplay: totalSec,
      colorHex: hex,
      colorClass: cls,
      glowColor: glow,
      shouldPulse: pulse,
      progressFraction: Math.min(1, Math.max(0, fraction)),
      trackColorClass: track,
    };
  }, [remainingMs, totalDurationSeconds, state]);

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <span className={`font-bold text-lg tabular-nums ${colorClass} ${shouldPulse ? 'animate-pulse' : ''}`}>
          {totalSecondsDisplay}
        </span>
      </div>
    );
  }

  const stateLabel =
    state === 'idle' ? 'READY' :
    state === 'armed' ? 'ARMED' :
    state === 'running' ? 'RUNNING' :
    state === 'paused' ? 'PAUSED' :
    'GO!';

  const preCountdownSec = Math.ceil(preCountdownMs / 1000);

  // SVG ring parameters
  const size = 280;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progressFraction);

  // Tick marks for the dial
  const tickCount = 60;
  const ticks = Array.from({ length: tickCount }, (_, i) => {
    const angle = (i / tickCount) * 360 - 90;
    const rad = (angle * Math.PI) / 180;
    const isMajor = i % 5 === 0;
    const innerR = isMajor ? radius - 18 : radius - 12;
    const outerR = radius - 6;
    return {
      x1: size / 2 + innerR * Math.cos(rad),
      y1: size / 2 + innerR * Math.sin(rad),
      x2: size / 2 + outerR * Math.cos(rad),
      y2: size / 2 + outerR * Math.sin(rad),
      isMajor,
      isActive: (i / tickCount) <= progressFraction,
    };
  });

  return (
    <div className="relative">
      <div className="bg-black rounded-2xl p-6 border border-slate-700/50 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none rounded-2xl" />

        {/* Central dial */}
        <div className="relative flex items-center justify-center">
          <div
            className="relative"
            style={{ width: size, height: size }}
          >
            {/* Outer glow */}
            <div
              className="absolute inset-0 rounded-full transition-all duration-300"
              style={{
                boxShadow: state === 'running' || state === 'armed'
                  ? `0 0 40px ${glowColor}, inset 0 0 30px ${glowColor}`
                  : 'none',
                opacity: shouldPulse ? 0.8 : 0.5,
              }}
            />

            <svg
              width={size}
              height={size}
              viewBox={`0 0 ${size} ${size}`}
              className="transform -rotate-90"
            >
              {/* Background track ring */}
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                strokeWidth={strokeWidth}
                className={trackColorClass}
                stroke="currentColor"
                opacity={0.3}
              />

              {/* Animated progress ring */}
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                strokeWidth={strokeWidth}
                stroke={colorHex}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                style={{
                  transition: 'stroke-dashoffset 100ms linear, stroke 300ms ease',
                  filter: `drop-shadow(0 0 6px ${glowColor})`,
                }}
              />

              {/* Tick marks */}
              {ticks.map((tick, i) => (
                <line
                  key={i}
                  x1={tick.x1}
                  y1={tick.y1}
                  x2={tick.x2}
                  y2={tick.y2}
                  strokeWidth={tick.isMajor ? 2 : 1}
                  stroke={tick.isActive ? colorHex : 'rgba(100,116,139,0.3)'}
                  strokeLinecap="round"
                  style={{
                    transition: 'stroke 200ms ease',
                    opacity: tick.isActive ? 1 : 0.4,
                  }}
                />
              ))}

              {/* Leading dot indicator */}
              {state === 'running' && progressFraction > 0.01 && (
                <circle
                  cx={size / 2 + radius * Math.cos(progressFraction * 2 * Math.PI - Math.PI / 2)}
                  cy={size / 2 + radius * Math.sin(progressFraction * 2 * Math.PI - Math.PI / 2)}
                  r={6}
                  fill={colorHex}
                  style={{ filter: `drop-shadow(0 0 8px ${glowColor})` }}
                />
              )}
            </svg>

            {/* Center content */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              {preCountdown && state === 'running' ? (
                <>
                  <div
                    className="font-black tabular-nums tracking-tight text-cyan-400 animate-pulse"
                    style={{
                      fontSize: '4rem',
                      lineHeight: 1,
                      textShadow: '0 0 20px rgba(34,211,238,0.6)',
                    }}
                  >
                    {totalSecondsDisplay}
                  </div>
                  <div className="flex items-center gap-1.5 mt-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                    <span className="text-[10px] text-cyan-400/80 font-semibold uppercase tracking-wider">
                      Audio — {preCountdownSec}s
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div
                    className={`font-black tabular-nums tracking-tight ${colorClass} transition-all duration-300 ${shouldPulse ? 'animate-pulse' : ''}`}
                    style={{
                      fontSize: totalSecondsDisplay <= 5 ? '5rem' : '4rem',
                      lineHeight: 1,
                      textShadow: `0 0 24px ${glowColor}`,
                      transform: totalSecondsDisplay <= 5 ? 'scale(1.05)' : 'scale(1)',
                      transition: 'font-size 300ms ease, transform 300ms ease',
                    }}
                  >
                    {state === 'completed' ? 'GO' : totalSecondsDisplay}
                  </div>
                  <span
                    className="text-[11px] uppercase tracking-[0.2em] font-semibold mt-2 transition-colors duration-300"
                    style={{ color: colorHex, opacity: 0.7 }}
                  >
                    {preCountdown ? 'AUDIO INTRO' : stateLabel}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Bottom info bar */}
        <div className="flex items-center justify-between mt-4 px-2">
          <div className="flex items-center gap-1.5">
            <div
              className="w-2 h-2 rounded-full transition-colors duration-300"
              style={{
                backgroundColor: colorHex,
                boxShadow: `0 0 6px ${glowColor}`,
              }}
            />
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">
              {preCountdown ? 'AUDIO INTRO' : stateLabel}
            </span>
          </div>
          <span className="text-[10px] text-slate-600 font-mono">
            {totalDurationSeconds}s total
          </span>
        </div>
      </div>
    </div>
  );
};
