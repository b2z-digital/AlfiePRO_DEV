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
      {url ? <img src={url} alt={`${first || ''} ${last || ''}`.trim()} referrerPolicy="no-referrer" /> : initialsOf(first, last)}
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

/** Board chart palette (Main board bars). */
export const ALFIE_CHART_COLORS = ['#2E7BFF', '#8A4DFF', '#30D158', '#FF8A2B', '#FF6B6B', '#40C8C0', '#5AB0FF'];

/** True while the Alfie light theme is on; follows theme switches. Used to pick chart tick/grid colours. */
export function useAlfieLight(): boolean {
  const read = () => typeof document !== 'undefined' && document.documentElement.classList.contains('alfie-light');
  const [light, setLight] = React.useState(read);
  React.useEffect(() => {
    const o = new MutationObserver(() => setLight(read()));
    o.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => o.disconnect();
  }, []);
  return light;
}

/** Chart.js axis styling that matches the board (quiet ticks, faint gridlines, base axis line). */
export const alfieChartScales = (light: boolean) => {
  const tick = light ? 'rgba(15,23,42,0.55)' : 'rgba(235,240,255,0.55)';
  const grid = light ? 'rgba(15,23,42,0.06)' : 'rgba(255,255,255,0.05)';
  const base = light ? 'rgba(15,23,42,0.12)' : 'rgba(255,255,255,0.1)';
  return {
    y: { beginAtZero: true, grid: { color: grid }, border: { display: false }, ticks: { color: tick, font: { size: 11 }, padding: 8 } },
    x: { grid: { display: false }, border: { color: base }, ticks: { color: tick, font: { size: 11 }, maxRotation: 0, autoSkip: false } },
  };
};

export const alfieTooltip = (light: boolean) => ({
  backgroundColor: light ? '#fff' : 'rgba(14,21,38,0.96)',
  titleColor: light ? '#0B1220' : '#F1F4FA',
  bodyColor: light ? 'rgba(15,23,42,0.7)' : 'rgba(235,240,255,0.75)',
  borderColor: light ? 'rgba(15,23,42,0.1)' : 'rgba(255,255,255,0.1)',
  borderWidth: 1, padding: 10, cornerRadius: 10, displayColors: false,
});
