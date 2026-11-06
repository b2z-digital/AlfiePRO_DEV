import React, { useId } from 'react';

interface AlfieMarkProps {
  size?: number;
  className?: string;
  title?: string;
}

/**
 * The Alfie orb: blurred Spectrum wedges masked to a circle, with the pink
 * notch dot. Same geometry as the Alfie.ai AlfieMark.
 */
export const AlfieMark: React.FC<AlfieMarkProps> = ({ size = 56, className, title }) => {
  const raw = useId().replace(/:/g, '');
  const blur = `am-b-${raw}`;
  const mask = `am-m-${raw}`;
  const hi = `am-h-${raw}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="4 4 87 87"
      className={className}
      style={{ overflow: 'visible' }}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <defs>
        <filter id={blur} filterUnits="userSpaceOnUse" x="-40" y="-40" width="180" height="180">
          <feGaussianBlur stdDeviation="9" />
        </filter>
        <radialGradient id={hi} cx="30" cy="26" r="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity=".22" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
          <rect width="100" height="100" fill="#000" />
          <circle cx="46" cy="46" r="40" fill="#fff" />
          <circle cx="76" cy="76" r="22" fill="#000" />
        </mask>
      </defs>
      <g mask={`url(#${mask})`}>
        <g filter={`url(#${blur})`}>
          <path d="M50 50L-15.82 -11.38L35.92 -38.89L93.63 -28.72Z" fill="#2E7BFF" />
          <path d="M50 50L88.04 -31.57L130.19 9.14L138.35 67.17Z" fill="#8A4DFF" />
          <path d="M50 50L139.33 60.97L113.64 113.64L60.97 139.33Z" fill="#FF3E9A" />
          <path d="M50 50L67.17 138.35L9.14 130.19L-31.57 88.04Z" fill="#FF8A2B" />
          <path d="M50 50L-28.72 93.63L-38.89 35.92L-11.38 -15.82Z" fill="#2E7BFF" />
        </g>
        <circle cx="46" cy="46" r="40" fill={`url(#${hi})`} />
      </g>
      <circle cx="76" cy="76" r="13" fill="#FF3E9A" />
    </svg>
  );
};

export default AlfieMark;
