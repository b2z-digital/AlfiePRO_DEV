import React, { useRef, useCallback } from 'react';

interface TransmitterSticksProps {
  rudderInput: number; // -1 (left) to +1 (right)
  sheetAngle: number; // 0 (fully eased) to 1 (fully sheeted)
  onRudderChange: (value: number) => void;
  onSheetChange: (value: number) => void;
  darkMode: boolean;
  optimalSheet: number; // 0-1 for the green indicator
  windAngleRelative?: number; // degrees, relative wind angle for sail display
}

export function TransmitterSticks({
  rudderInput,
  sheetAngle,
  onRudderChange,
  onSheetChange,
  darkMode,
  optimalSheet,
  windAngleRelative,
}: TransmitterSticksProps) {
  return (
    <div className="absolute bottom-16 right-3 flex items-end gap-6 pointer-events-auto">
      {/* Sail position indicator */}
      <SailPositionIndicator
        sheetAngle={sheetAngle}
        rudderInput={rudderInput}
        windAngleRelative={windAngleRelative ?? 0}
        darkMode={darkMode}
      />

      {/* Left stick - Sail sheeting (vertical only) */}
      <StickControl
        label="SAIL"
        value={sheetAngle}
        axis="vertical"
        inverted
        onChange={onSheetChange}
        darkMode={darkMode}
        showOptimal={optimalSheet}
        labelTop="OUT"
        labelBottom="IN"
      />

      {/* Right stick - Rudder (horizontal only) */}
      <StickControl
        label="RUDDER"
        value={rudderInput}
        axis="horizontal"
        onChange={onRudderChange}
        darkMode={darkMode}
        labelLeft="PORT"
        labelRight="STBD"
      />
    </div>
  );
}

interface StickControlProps {
  label: string;
  value: number;
  axis: 'horizontal' | 'vertical';
  inverted?: boolean;
  onChange: (value: number) => void;
  darkMode: boolean;
  showOptimal?: number;
  labelTop?: string;
  labelBottom?: string;
  labelLeft?: string;
  labelRight?: string;
}

function StickControl({
  label,
  value,
  axis,
  inverted,
  onChange,
  darkMode,
  showOptimal,
  labelTop,
  labelBottom,
  labelLeft,
  labelRight,
}: StickControlProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const getValueFromEvent = useCallback(
    (clientX: number, clientY: number) => {
      const el = containerRef.current;
      if (!el) return value;
      const rect = el.getBoundingClientRect();

      if (axis === 'horizontal') {
        const x = (clientX - rect.left) / rect.width;
        return Math.max(-1, Math.min(1, (x - 0.5) * 2));
      } else {
        const y = (clientY - rect.top) / rect.height;
        // When inverted: top of track = 0 (eased), bottom = 1 (sheeted in)
        // So dragging DOWN gives higher value
        if (inverted) {
          return Math.max(0, Math.min(1, y));
        }
        return Math.max(0, Math.min(1, 1 - y));
      }
    },
    [axis, inverted, value],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragging.current = true;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      onChange(getValueFromEvent(e.clientX, e.clientY));
    },
    [onChange, getValueFromEvent],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      onChange(getValueFromEvent(e.clientX, e.clientY));
    },
    [onChange, getValueFromEvent],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      dragging.current = false;
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      if (axis === 'horizontal') {
        onChange(0); // rudder springs back to center
      }
    },
    [axis, onChange],
  );

  // Keyboard support for rudder (handled externally via game loop)
  // This component is purely visual + touch/mouse

  const trackBg = darkMode ? 'bg-slate-800/90' : 'bg-gray-200/90';
  const knobColor = darkMode ? 'bg-slate-300' : 'bg-slate-700';

  const trackWidth = axis === 'horizontal' ? 'w-32' : 'w-10';
  const trackHeight = axis === 'horizontal' ? 'h-10' : 'h-32';

  // Knob position
  let knobStyle: React.CSSProperties;
  if (axis === 'horizontal') {
    const pct = (value + 1) / 2; // -1..1 -> 0..1
    knobStyle = { left: `${pct * 100}%`, top: '50%', transform: 'translate(-50%, -50%)' };
  } else {
    // When inverted: value 0 (eased) = top, value 1 (sheeted in) = bottom
    // When not inverted: value 0 = bottom, value 1 = top
    const pct = inverted ? value : (1 - value);
    knobStyle = { top: `${pct * 100}%`, left: '50%', transform: 'translate(-50%, -50%)' };
  }

  return (
    <div className="flex flex-col items-center gap-1">
      {/* Top/Left label */}
      {axis === 'vertical' && labelTop && (
        <span className={`text-[9px] font-bold uppercase ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>
          {labelTop}
        </span>
      )}

      <div className="flex items-center gap-1">
        {axis === 'horizontal' && labelLeft && (
          <span className={`text-[9px] font-bold uppercase ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>
            {labelLeft}
          </span>
        )}

        {/* Track */}
        <div
          ref={containerRef}
          className={`relative ${trackWidth} ${trackHeight} ${trackBg} rounded-full border ${
            darkMode ? 'border-slate-600' : 'border-gray-300'
          } backdrop-blur-sm cursor-pointer select-none touch-none`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {/* Optimal indicator for sail stick */}
          {axis === 'vertical' && showOptimal !== undefined && (
            <div
              className="absolute left-0 right-0 h-1 bg-emerald-400/60 rounded"
              style={{ top: `${(inverted ? showOptimal : (1 - showOptimal)) * 100}%`, transform: 'translateY(-50%)' }}
            />
          )}

          {/* Center line */}
          {axis === 'horizontal' && (
            <div
              className={`absolute top-1 bottom-1 w-px ${darkMode ? 'bg-slate-600' : 'bg-gray-400'}`}
              style={{ left: '50%' }}
            />
          )}

          {/* Knob */}
          <div
            className={`absolute w-6 h-6 ${knobColor} rounded-full shadow-lg border-2 ${
              darkMode ? 'border-slate-400' : 'border-slate-500'
            }`}
            style={knobStyle}
          />
        </div>

        {axis === 'horizontal' && labelRight && (
          <span className={`text-[9px] font-bold uppercase ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>
            {labelRight}
          </span>
        )}
      </div>

      {/* Bottom label */}
      {axis === 'vertical' && labelBottom && (
        <span className={`text-[9px] font-bold uppercase ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>
          {labelBottom}
        </span>
      )}

      {/* Control label */}
      <span className={`text-[10px] font-bold tracking-wider uppercase ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
        {label}
      </span>
    </div>
  );
}

function SailPositionIndicator({
  sheetAngle,
  rudderInput,
  windAngleRelative,
  darkMode,
}: {
  sheetAngle: number;
  rudderInput: number;
  windAngleRelative: number;
  darkMode: boolean;
}) {
  // Compute sail deflection similar to drawBoat logic
  const windSide = Math.sin((windAngleRelative * Math.PI) / 180);
  const absWindAngle = Math.abs(windAngleRelative > 180 ? windAngleRelative - 360 : windAngleRelative);
  const maxDeflection = (1 - sheetAngle) * 55; // degrees visual
  const sailAngleDeg = windSide > 0
    ? -Math.min(maxDeflection, absWindAngle * 0.4)
    : Math.min(maxDeflection, absWindAngle * 0.4);

  const jibAngleDeg = sailAngleDeg * 0.85;
  const rudderAngleDeg = rudderInput * 25;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg
        width="56"
        height="80"
        viewBox="-28 -40 56 80"
        className={`rounded-lg border backdrop-blur-sm ${
          darkMode
            ? 'bg-slate-800/90 border-slate-600'
            : 'bg-gray-200/90 border-gray-300'
        }`}
      >
        {/* Wind direction arrow (small, top) */}
        <g transform={`rotate(${windAngleRelative}, 0, -32)`}>
          <line x1="0" y1="-38" x2="0" y2="-26" stroke={darkMode ? '#60a5fa' : '#3b82f6'} strokeWidth="1" opacity="0.7" />
          <polygon points="0,-38 -2,-34 2,-34" fill={darkMode ? '#60a5fa' : '#3b82f6'} opacity="0.7" />
        </g>

        {/* Hull */}
        <path
          d="M 0,-22 C 3,-16 3.5,-2 3,8 C 2.5,12 1,14 0,14 C -1,14 -2.5,12 -3,8 C -3.5,-2 -3,-16 0,-22 Z"
          fill={darkMode ? '#3b82f6' : '#2563eb'}
          stroke={darkMode ? '#e2e8f0' : '#1e293b'}
          strokeWidth="0.8"
        />

        {/* Mast */}
        <circle cx="0" cy="-4" r="1" fill={darkMode ? '#94a3b8' : '#475569'} />

        {/* Mainsail */}
        <g transform={`rotate(${sailAngleDeg}, 0, -4)`}>
          <path
            d={`M 0,-18 Q ${2 + (1 - sheetAngle) * 2},-8 0,12`}
            fill="rgba(255,255,255,0.7)"
            stroke={darkMode ? '#e2e8f0' : '#64748b'}
            strokeWidth="0.7"
          />
          {/* Boom */}
          <line x1="0" y1="-4" x2="0" y2="12" stroke={darkMode ? '#64748b' : '#94a3b8'} strokeWidth="1" />
        </g>

        {/* Jib */}
        <g transform={`rotate(${jibAngleDeg}, 0, -20)`}>
          <path
            d={`M 0,-20 Q ${1.5 + (1 - sheetAngle) * 1.5},-12 0,-4`}
            fill="rgba(240,248,255,0.6)"
            stroke={darkMode ? '#93c5fd' : '#60a5fa'}
            strokeWidth="0.6"
          />
        </g>

        {/* Rudder */}
        <g transform={`rotate(${rudderAngleDeg}, 0, 14)`}>
          <line x1="0" y1="14" x2="0" y2="20" stroke={darkMode ? '#f59e0b' : '#d97706'} strokeWidth="1.2" strokeLinecap="round" />
        </g>
      </svg>
      <span className={`text-[9px] font-bold tracking-wider uppercase ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
        TRIM
      </span>
    </div>
  );
}
