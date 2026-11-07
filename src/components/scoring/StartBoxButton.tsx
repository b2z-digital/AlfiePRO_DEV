import React, { useId } from 'react';
/** StartBox: a round stopwatch dial. While a sequence runs, StartBox shows its live countdown
    pill in the bar instead (this button hides itself then). */
export const StartBoxButton: React.FC<{ onClick: () => void; size?: number; style?: React.CSSProperties }> = ({ onClick, size = 40, style }) => {
  const gid = `a-sbx-g${useId().replace(/:/g, '')}`;
  return (
  <button type="button" className="a-sbx" style={{ width: size, height: size, ...style }} onClick={onClick} aria-label="Open StartBox" title="StartBox · start sequence">
    <svg width={Math.round(size * 0.55)} height={Math.round(size * 0.55)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="4" y1="5" x2="20" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2E7BFF" /><stop offset="0.38" stopColor="#8A4DFF" /><stop offset="0.7" stopColor="#FF3E9A" /><stop offset="1" stopColor="#FF8A2B" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="13.5" r="7.25" stroke={`url(#${gid})`} strokeWidth="2" />
      <path d="M10 3.25h4M12 3.25v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M18.2 6.6l1.3-1.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 13.5V9.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="13.5" r="1.35" fill="currentColor" />
    </svg>
  </button>
);
};
