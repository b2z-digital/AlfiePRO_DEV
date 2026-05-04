import React, { useRef, useCallback } from 'react';

interface TransmitterSticksProps {
  rudderInput: number; // -1 (left) to +1 (right)
  sheetAngle: number; // 0 (fully eased) to 1 (fully sheeted)
  onRudderChange: (value: number) => void;
  onSheetChange: (value: number) => void;
  darkMode: boolean;
  optimalSheet: number; // 0-1 for the green indicator
}

export function TransmitterSticks({
  rudderInput,
  sheetAngle,
  onRudderChange,
  onSheetChange,
  darkMode,
  optimalSheet,
}: TransmitterSticksProps) {
  return (
    <div className="absolute bottom-16 left-3 flex items-end gap-6 pointer-events-auto">
      {/* Left stick - Sail sheeting (vertical only) */}
      {/* DOWN on stick = sheet in (value 1), UP on stick = ease out (value 0) */}
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
