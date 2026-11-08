import React from 'react';

/**
 * Small building blocks shared by the association screens (Member clubs,
 * Members, Remittances, Reports …) so they match the club screens.
 * Declared at module scope on purpose (components declared inside other
 * components remount their inputs on every render).
 */

export const orgInitials = (name?: string | null) =>
  (name || '')
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w) && !/^(of|the|and|inc\.?|club)$/i.test(w))
    .slice(0, 3)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || '?';

export const OrgLogo: React.FC<{ src?: string | null; name?: string | null; small?: boolean }> = ({ src, name, small }) =>
  src
    ? <img src={src} alt="" className={`a-orglogo ${small ? 'a-orglogo-sm' : ''}`} loading="lazy" />
    : <span className={`a-orglogo a-orglogo-ph ${small ? 'a-orglogo-sm' : ''}`} aria-hidden="true">{orgInitials(name)}</span>;

export const PageHead: React.FC<{
  icon: React.ReactNode;
  title: string;
  sub?: React.ReactNode;
  children?: React.ReactNode;
}> = ({ icon, title, sub, children }) => (
  <div className="a-apage-head">
    <span className="a-tile a-tile-rim" style={{ width: 52, height: 52 }}>{icon}</span>
    <div className="flex-1 min-w-[220px]">
      <h1 className="a-apage-title">{title}</h1>
      {sub && <p className="a-apage-sub">{sub}</p>}
    </div>
    {children}
  </div>
);

export const KpiCard: React.FC<{
  cap: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon: React.ReactNode;
  tone?: 'amber' | 'red' | 'green' | 'blue';
  onClick?: () => void;
}> = ({ cap, value, sub, icon, tone, onClick }) => {
  const toneClass = tone === 'amber' ? 'a-txt-a' : tone === 'red' ? 'a-txt-r' : tone === 'green' ? 'a-txt-g' : tone === 'blue' ? 'a-txt-b' : 'a-ink';
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="a-cap">{cap}</p>
        <span className="a-tile" style={{ width: 40, height: 40 }}>{icon}</span>
      </div>
      <div className={`a-kpi-n ${toneClass}`}>{value}</div>
      {sub && <p className="a-kpi-sub">{sub}</p>}
    </>
  );
  return onClick
    ? <button type="button" onClick={onClick} className="a-card a-hov a-kpi text-left w-full cursor-pointer">{body}</button>
    : <div className="a-card a-hov a-kpi">{body}</div>;
};

/** Grey round spinner + text, for sections loading inside a page */
export const InlineLoading: React.FC<{ label?: string }> = ({ label = 'Loading…' }) => (
  <div className="flex items-center justify-center gap-3 py-14 a-mute text-sm">
    <span className="w-5 h-5 border-2 border-white/10 border-t-[#0A84FF] rounded-full animate-spin" />
    {label}
  </div>
);
