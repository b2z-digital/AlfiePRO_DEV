import React, { createContext, forwardRef } from 'react';
import { ALFIE_GLYPHS } from './alfieGlyphs';

/**
 * True inside the signed-in app (DashboardLayout / YachtRaceManager). Icons
 * imported from 'lucide-react' render their Alfie glyph only when this is
 * true, so public club and event websites keep the original icons.
 */
export const AlfieIconContext = createContext(false);

export interface AlfieIconProps extends React.SVGProps<SVGSVGElement> {
  glyph: string;
  size?: number | string;
  color?: string;
  strokeWidth?: number | string;
  absoluteStrokeWidth?: boolean;
}

export const AlfieIcon = forwardRef<SVGSVGElement, AlfieIconProps>(
  ({ glyph, size = 24, color = 'currentColor', strokeWidth, absoluteStrokeWidth, className, children, ...rest }, ref) => {
    const g = ALFIE_GLYPHS[glyph];
    if (!g) return null;
    const sw =
      strokeWidth === undefined
        ? 1.75
        : absoluteStrokeWidth
          ? (Number(strokeWidth) * 24) / Number(size)
          : strokeWidth;
    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={['lucide', 'alfie-icon', `alfie-icon-${glyph}`, className].filter(Boolean).join(' ')}
        {...rest}
      >
        {g.els.map(([tag, attrs], i) =>
          React.createElement(tag, {
            key: i,
            ...attrs,
            ...(attrs.fill === 'currentColor' ? { fill: color, stroke: 'none' } : null),
          })
        )}
        {g.node && <circle cx={g.node[0]} cy={g.node[1]} r={g.node[2]} fill={color} stroke="none" className="alfie-icon-node" />}
        {children}
      </svg>
    );
  }
);
AlfieIcon.displayName = 'AlfieIcon';
