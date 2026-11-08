import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon, AlfieSails, IconName } from './icons';
import { useMobile } from './MobileContext';
import { useAuth } from '../contexts/AuthContext';
import { MCalendarItem, attendanceKey, parseDay } from './data';

const AV_COLOURS = ['#2A93FF', '#8A4DFF', '#FF3E9A', '#0F7A5A', '#FF8A2B', '#40C8C0', '#5B2BB5'];
export const colourFor = (seed: string) => AV_COLOURS[Math.abs([...seed].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % AV_COLOURS.length];
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('') || '?';

export const Avatar: React.FC<{ name: string; url?: string | null; size?: number; ring?: boolean }> = ({ name, url, size = 36, ring }) => {
  const inner = (
    <span className="m-av" style={{ width: ring ? '100%' : size, height: ring ? '100%' : size, fontSize: Math.round(size * 0.36), background: url ? undefined : colourFor(name) }}>
      {url ? <img src={url} alt="" referrerPolicy="no-referrer" /> : initials(name)}
    </span>
  );
  if (!ring) return inner;
  return (
    <span className="m-av" style={{ width: size, height: size, padding: 3, background: 'conic-gradient(from 200deg,#2E7BFF,#8A4DFF,#FF3E9A,#FF8A2B,#2E7BFF)' }}>{inner}</span>
  );
};

/** The AlfiePRO lockup: sails mark + "AlfiePRO" wordmark. */
export const BrandLockup: React.FC<{ size?: number }> = ({ size = 26 }) => {
  const { light } = useMobile();
  return (
    <span className="m-row" style={{ gap: 8 }} aria-label="AlfiePRO">
      <AlfieSails size={size} light={light} />
      <span className="m-disp" style={{ fontSize: size * 0.92, lineHeight: 1, letterSpacing: '-.01em' }}>
        <span style={{ fontWeight: 300 }}>Alfie</span><span style={{ fontWeight: 700 }}>PRO</span>
      </span>
    </span>
  );
};

/**
 * Header for tab roots. Brand mark on the left (the full AlfiePRO lockup on Home),
 * then Club, Chats, Notifications and the avatar (Me + club switch) on the right.
 */
export const RootHeader: React.FC<{ title?: string; brand?: boolean; right?: React.ReactNode; hideActions?: boolean }> = ({ title, brand, right, hideActions }) => {
  const navigate = useNavigate();
  const { currentClub, currentOrganization } = useAuth();
  const { profile, unread, light } = useMobile();
  const name = `${profile.firstName} ${profile.lastName}`.trim() || 'Me';
  const orgName = currentClub?.club?.name || currentOrganization?.name || '';
  return (
    <header className="m-top">
      <div className="m-top-title">
        {brand ? (
          <>
            <BrandLockup size={26} />
            {orgName && <div className="m-sub" style={{ marginTop: 5 }}>{orgName}</div>}
          </>
        ) : (
          <div className="m-row" style={{ gap: 10 }}>
            <AlfieSails size={24} light={light} />
            <div style={{ minWidth: 0 }}>
              {orgName && <div className="m-sub">{orgName}</div>}
              <h1 className="m-disp">{title}</h1>
            </div>
          </div>
        )}
      </div>
      {right}
      {!hideActions && (
        <>
          <button className="m-ibtn" aria-label="Club" onClick={() => navigate('/club')}><Icon name="club" /></button>
          <button className="m-ibtn" aria-label="Chats" onClick={() => navigate('/comms')}><Icon name="chat" /></button>
          <button className="m-ibtn" aria-label="Notifications" onClick={() => navigate('/notifications')}>
            <Icon name="bell" />
            {unread > 0 && <span className="m-badge">{unread > 99 ? '99+' : unread}</span>}
          </button>
        </>
      )}
      <button className="m-ibtn" style={{ padding: 0, border: 0, background: 'none' }} aria-label="Me" onClick={() => navigate('/me')}>
        <Avatar name={name} url={profile.avatarUrl} size={36} />
      </button>
    </header>
  );
};

/** Header for pushed screens: back, title, optional actions. */
export const SubHeader: React.FC<{ title?: React.ReactNode; sub?: string; right?: React.ReactNode; onBack?: () => void }> = ({ title, sub, right, onBack }) => {
  const navigate = useNavigate();
  return (
    <header className="m-top">
      <button className="m-ibtn" aria-label="Back" onClick={() => (onBack ? onBack() : window.history.length > 1 ? navigate(-1) : navigate('/'))}>
        <Icon name="back" />
      </button>
      <div className="m-top-title">
        {sub && <div className="m-sub">{sub}</div>}
        {title && <div style={{ fontWeight: 700, fontSize: 17, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>}
      </div>
      {right}
    </header>
  );
};

const TABS: { id: string; label: string; icon: IconName; path: string; match: (p: string) => boolean }[] = [
  { id: 'home', label: 'Home', icon: 'home', path: '/', match: p => p === '/' },
  { id: 'racing', label: 'Racing', icon: 'racing', path: '/calendar', match: p => /^\/(calendar|results|my-results|find-racing|race-desk)/.test(p) },
  { id: 'tv', label: 'AlfieTV', icon: 'tv', path: '/alfie-tv', match: p => p.startsWith('/alfie-tv') },
  { id: 'me', label: 'Me', icon: 'me', path: '/me', match: p => /^\/(me|my-|settings|tasks|weather|race-timer)/.test(p) && !p.startsWith('/my-results') },
];

export const TabBar: React.FC<{ onAlfie: () => void }> = ({ onAlfie }) => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { tap, light } = useMobile();
  const go = (path: string) => {
    tap();
    if (pathname === path) document.querySelector('.m-scroll')?.scrollTo({ top: 0, behavior: 'smooth' });
    else navigate(path);
  };
  const tab = (t: typeof TABS[number]) => {
    const on = t.match(pathname);
    return (
      <button key={t.id} className={`m-tab ${on ? 'm-tab-on' : ''}`} onClick={() => go(t.path)} aria-current={on ? 'page' : undefined}>
        <Icon name={t.icon} size={24} strokeWidth={on ? 2.1 : 1.8} />
        {t.label}
      </button>
    );
  };
  return (
    <nav className="m-tabs" aria-label="Main">
      {TABS.slice(0, 2).map(tab)}
      <div className="m-orb-slot">
        <button className="m-orb" aria-label="Ask Alfie" onClick={() => { tap('medium'); onAlfie(); }}>
          <span><AlfieSails size={26} light={light} /></span>
        </button>
      </div>
      {TABS.slice(2).map(tab)}
    </nav>
  );
};

/* ─────────────── Shared pieces ─────────────── */

export const fmtDay = (date: string, opts: Intl.DateTimeFormatOptions) => parseDay(date).toLocaleDateString('en-AU', opts);

export const DateBadge: React.FC<{ date: string; spec?: boolean }> = ({ date, spec }) => (
  <div className={`m-date ${spec ? 'm-spec' : ''}`} style={spec ? { borderWidth: 1.5 } : undefined}>
    <span className="m-lb" style={{ fontSize: 10, color: spec ? '#FF8DC2' : 'var(--m-dim)' }}>{fmtDay(date, { weekday: 'short' })}</span>
    <span className="m-disp" style={{ fontSize: 21, fontWeight: 700, lineHeight: 1 }}>{parseDay(date).getDate()}</span>
    <span className="m-lb m-dim" style={{ fontSize: 10 }}>{fmtDay(date, { month: 'short' })}</span>
  </div>
);

export const LevelPill: React.FC<{ level: string }> = ({ level }) =>
  level === 'state' ? <span className="m-pill" style={{ background: 'rgba(138,77,255,.18)', color: '#C3A2FF' }}>State</span>
  : level === 'national' ? <span className="m-pill" style={{ background: 'rgba(255,138,43,.16)', color: '#FFB27A' }}>National</span>
  : null;

export const MyStatusPill: React.FC<{ item: MCalendarItem }> = ({ item }) => {
  const { attendance } = useMobile();
  const key = attendanceKey(item);
  const s = key ? attendance.mine[key] : undefined;
  if (item.kind !== 'race' || item.completed) return null;
  if (s === 'yes') return <span className="m-pill" style={{ background: 'rgba(52,199,89,.16)', color: '#6FE08E' }}><Icon name="check" size={12} strokeWidth={3} />Going</span>;
  if (s === 'no') return <span className="m-pill" style={{ background: 'rgba(255,59,48,.14)', color: '#FF8C82' }}>Can't make it</span>;
  if (s === 'maybe') return <span className="m-pill" style={{ background: 'rgba(255,159,10,.15)', color: '#FFC062' }}>Maybe</span>;
  return <span className="m-pill" style={{ background: 'var(--m-fill)', color: 'var(--m-mut)' }}>Not answered</span>;
};

export const GoingStack: React.FC<{ item: MCalendarItem; max?: number }> = ({ item, max = 3 }) => {
  const { attendance } = useMobile();
  const key = attendanceKey(item);
  const going = key ? attendance.going[key] || [] : [];
  if (!going.length) return <span className="m-mut" style={{ fontSize: 13 }}>No one going yet</span>;
  return (
    <span className="m-row" style={{ gap: 10 }}>
      <span className="m-stack-av">
        {going.slice(0, max).map(g => <Avatar key={g.userId} name={g.name} url={g.avatarUrl} size={24} />)}
        {going.length > max && <span className="m-av" style={{ background: '#1B2130', color: '#DCE2EE' }}>+{going.length - max}</span>}
      </span>
      <span className="m-mut" style={{ fontSize: 13 }}>{going.length} going</span>
    </span>
  );
};

export const RsvpButtons: React.FC<{ item: MCalendarItem; compact?: boolean }> = ({ item, compact }) => {
  const { attendance, answer } = useMobile();
  const key = attendanceKey(item);
  const s = key ? attendance.mine[key] : undefined;
  if (!key) return null;
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <button className={`m-btn ${s === 'yes' ? 'm-btn-on' : s ? 'm-btn-g' : 'm-btn-p'}`} style={{ flex: 1.3, height: compact ? 40 : 44 }} onClick={() => answer(item, 'yes')}>
        {s === 'yes' && <Icon name="check" size={16} strokeWidth={2.6} />}{s === 'yes' ? 'Going' : "I'm going"}
      </button>
      <button className={`m-btn ${s === 'no' ? 'm-btn-on' : 'm-btn-g'}`} style={{ flex: 1, height: compact ? 40 : 44 }} onClick={() => answer(item, 'no')}>Can't make it</button>
      <button className={`m-btn ${s === 'maybe' ? 'm-btn-on' : 'm-btn-g'}`} style={{ width: 70, padding: 0, height: compact ? 40 : 44 }} onClick={() => answer(item, 'maybe')}>Maybe</button>
    </div>
  );
};

export const Skeleton: React.FC<{ h: number }> = ({ h }) => <div className="m-skel" style={{ height: h }} />;
