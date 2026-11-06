import React from 'react';

/** Small presentational pieces shared by the Alfie board screens. */

const AV_COLOURS = ['#2F6FDE', '#3E8BB0', '#B7791F', '#B04A7E', '#2F9E5B', '#7A6A58', '#7A5AF8', '#C2564B'];

export const avatarColour = (seed: string) => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AV_COLOURS[h % AV_COLOURS.length];
};

export const initialsOf = (first?: string | null, last?: string | null) =>
  `${(first || '').trim().charAt(0)}${(last || '').trim().charAt(0)}`.toUpperCase() || '?';

/** Round avatar: photo when there is one, otherwise coloured initials. */
export const AAvatar: React.FC<{
  url?: string | null;
  first?: string | null;
  last?: string | null;
  size?: 'sm' | 'md' | number;
  className?: string;
}> = ({ url, first, last, size = 'md', className = '' }) => {
  const px = typeof size === 'number' ? size : size === 'sm' ? 28 : 40;
  const style: React.CSSProperties = {
    width: px, height: px, fontSize: Math.max(10, Math.round(px * 0.36)),
    background: url ? undefined : avatarColour(`${first} ${last}`),
  };
  return (
    <span className={`a-av ${className}`} style={style} aria-hidden="true">
      {url ? <img src={url} alt="" /> : initialsOf(first, last)}
    </span>
  );
};

const LEVELS: Record<string, { label: string; bars: number }> = {
  admin: { label: 'Admin', bars: 4 },
  editor: { label: 'Editor', bars: 3 },
  race_scorer: { label: 'Race Scorer', bars: 2 },
  viewer: { label: 'Viewer', bars: 1 },
};

export const accessLevelLabel = (level?: string | null) => (level && LEVELS[level]?.label) || 'Viewer';

/** Access level label with signal bars (board: committee cards). */
export const ALevel: React.FC<{ level?: string | null }> = ({ level }) => {
  const l = (level && LEVELS[level]) || LEVELS.viewer;
  return (
    <span className={`a-lvl a-lvl-${level || 'viewer'}`}>
      <span className="a-lvl-bars" aria-hidden="true">
        {[4, 6.5, 9, 11.5].map((h, i) => <i key={i} className={i < l.bars ? 'on' : ''} style={{ height: h }} />)}
      </span>
      {l.label}
    </span>
  );
};

/** Status light + text. tone: g (green) a (amber) r (red) b (blue) t (teal) n (neutral). */
export const AStatus: React.FC<{ tone?: 'g' | 'a' | 'r' | 'b' | 't' | 'n'; children: React.ReactNode; className?: string }> = ({ tone = 'n', children, className = '' }) => (
  <span className={`a-st ${tone === 'n' ? 'a-dim' : ''} ${className}`}>
    <span className={`a-light ${tone !== 'n' ? `a-light-${tone}` : ''}`} />
    {children}
  </span>
);

/** Switch rendered as a real button. */
export const ASwitch: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }> = ({ checked, onChange, label, disabled }) => (
  <button type="button" role="switch" aria-checked={checked} aria-label={label} className="a-sw" disabled={disabled} onClick={() => onChange(!checked)} />
);
