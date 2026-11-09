import React, { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon, AlfieSails, IconName } from './icons';
import { useMobile } from './MobileContext';
import { useAuth } from '../contexts/AuthContext';
import { MCalendarItem, attendanceKey, parseDay } from './data';
import { isNative } from '../lib/native/platform';

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
  const orgName = currentOrganization && currentOrganization.type !== 'club' ? currentOrganization.name : currentClub?.club?.name || currentOrganization?.name || '';
  return (
    <>
    {brand && !isNative && <AppBanner />}
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
    <OfflineBanner />
    </>
  );
};

/** Header for pushed screens: back, title, optional actions. */
export const SubHeader: React.FC<{ title?: React.ReactNode; sub?: string; right?: React.ReactNode; onBack?: () => void }> = ({ title, sub, right, onBack }) => {
  const navigate = useNavigate();
  return (
    <>
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
    <OfflineBanner />
    </>
  );
};

const TABS: { id: string; label: string; icon: IconName; path: string; match: (p: string) => boolean }[] = [
  { id: 'home', label: 'Home', icon: 'home', path: '/', match: p => p === '/' },
  { id: 'racing', label: 'Racing', icon: 'racing', path: '/calendar', match: p => /^\/(calendar|results|my-results|find-racing|race-desk|compare)/.test(p) },
  // Club is a tab (phase 2 board, agreed 9 Nov); Me opens from the avatar in every header
  { id: 'club', label: 'Club', icon: 'club', path: '/club', match: p => /^\/(club|classifieds|shops|news|media|tasks|comms)/.test(p) },
  { id: 'tv', label: 'AlfieTV', icon: 'tv', path: '/alfie-tv', match: p => p.startsWith('/alfie-tv') },
];

export const TabBar: React.FC<{ onAlfie: (voice?: boolean) => void }> = ({ onAlfie }) => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { tap, light } = useMobile();
  const go = (path: string) => {
    tap();
    if (pathname === path) document.querySelector('.m-scroll')?.scrollTo({ top: 0, behavior: 'smooth' });
    else navigate(path);
  };
  const orb = useHoldToTalk(() => { tap('medium'); onAlfie(); }, () => { tap('success'); onAlfie(true); });
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
        <button className="m-orb" aria-label="Ask Alfie (hold to talk)" {...orb}>
          <span><AlfieSails size={26} light={light} /></span>
        </button>
      </div>
      {TABS.slice(2).map(tab)}
    </nav>
  );
};

/** Tap opens Ask Alfie; holding it opens straight into talking (board: "Hold the Alfie button and speak"). */
function useHoldToTalk(onTap: () => void, onHold: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const held = useRef(false);
  const clear = () => clearTimeout(timer.current);
  useEffect(() => clear, []);
  return {
    onPointerDown: () => { held.current = false; clear(); timer.current = setTimeout(() => { held.current = true; onHold(); }, 450); },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    onClick: () => { if (held.current) { held.current = false; return; } onTap(); },
  };
}

/* ─────────────── Shared pieces ─────────────── */

export const fmtDay = (date: string, opts: Intl.DateTimeFormatOptions) => parseDay(date).toLocaleDateString('en-AU', opts);

export const DateBadge: React.FC<{ date: string; spec?: boolean }> = ({ date, spec }) => (
  <div className={`m-date ${spec ? 'm-spec' : ''}`} style={spec ? { borderWidth: 1.5 } : undefined}>
    <span className="m-lb" style={{ fontSize: 10, color: spec ? '#FF8DC2' : 'var(--m-dim)' }}>{fmtDay(date, { weekday: 'short' })}</span>
    <span className="m-disp" style={{ fontSize: 21, fontWeight: 700, lineHeight: 1 }}>{parseDay(date).getDate()}</span>
    <span className="m-lb m-dim" style={{ fontSize: 10 }}>{fmtDay(date, { month: 'short' })}</span>
  </div>
);

/** Opens a web page in the in-app browser on the phone app, a new tab elsewhere. */
export async function openExternalUrl(url?: string | null) {
  if (!url) return;
  if (isNative) {
    try {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url });
      return;
    } catch { /* fall back */ }
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** Calendar item → its event page; imported association events open the association's page. */
export function openCalendarItem(navigate: (to: string) => void, i: MCalendarItem) {
  if (i.external) { openExternalUrl(i.externalUrl || i.registrationUrl); return; }
  navigate(i.kind === 'meeting' ? `/calendar/meeting/${i.meetingId}` : `/calendar/event/${encodeURIComponent(i.key)}`);
}

/** Imported events can't be answered here; show whether entries are open instead. */
export const EntriesPill: React.FC<{ item: MCalendarItem }> = ({ item }) =>
  item.registrationUrl ? <span className="m-pill" style={{ background: 'rgba(10,132,255,.16)', color: '#7DBBFF' }}>Entries open</span> : null;

export const LevelPill: React.FC<{ level: string }> = ({ level }) =>
  level === 'state' ? <span className="m-pill" style={{ background: 'rgba(138,77,255,.18)', color: '#C3A2FF' }}>State</span>
  : level === 'national' ? <span className="m-pill" style={{ background: 'rgba(255,138,43,.16)', color: '#FFB27A' }}>National</span>
  : null;

export const MyStatusPill: React.FC<{ item: MCalendarItem }> = ({ item }) => {
  const { attendance, queued } = useMobile();
  const key = attendanceKey(item);
  const s = key ? attendance.mine[key] : undefined;
  if (item.kind !== 'race' || item.completed) return null;
  if (key && queued[key]) return <span className="m-pill" style={{ background: 'rgba(52,199,89,.16)', color: '#6FE08E' }}><Icon name="clock" size={12} strokeWidth={2.4} />{s === 'yes' ? 'Going' : s === 'no' ? "Can't make it" : 'Maybe'} · sends when online</span>;
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

/* ─────────────── Native board: offline and phone-browser banners ─────────────── */

/** "You're offline. Showing what was saved at 9:12 am." */
export const OfflineBanner: React.FC = () => {
  const { online, savedAt, light } = useMobile();
  if (online) return null;
  const at = savedAt ? new Date(savedAt).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }) : null;
  return (
    <div className="m-offline" role="status">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FF9F0A" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M2 8.8a15 15 0 0 1 4.2-2.6M9.6 5.2A15 15 0 0 1 22 8.8M5 12.6a10 10 0 0 1 5.3-2.4M16.4 11a10 10 0 0 1 2.6 1.6M8.5 16.4a5 5 0 0 1 7 0M12 20h.01M3 3l18 18" /></svg>
      <div style={{ flex: 1, fontSize: 13.5 }}>
        <b style={{ fontWeight: 600, color: light ? '#B26A00' : '#FFD38A' }}>You're offline.</b>{' '}
        <span className="m-mut">{at ? `Showing what was saved at ${at}.` : 'Showing what was saved on this phone.'}</span>
      </div>
    </div>
  );
};

const APP_STORE_URL = 'https://apps.apple.com/app/alfiepro/id6759854905';
const BANNER_KEY = 'alfie-m-app-banner-hidden';

/** Slim "AlfiePRO app" banner for phone browsers (iPhone only until the Android app is released). */
export const AppBanner: React.FC = () => {
  const [hidden, setHidden] = React.useState(() => { try { return !!sessionStorage.getItem(BANNER_KEY); } catch { return false; } });
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (hidden || !ios) return null;
  return (
    <div className="m-appbar">
      <span className="m-appi" style={{ width: 34, height: 34, borderRadius: 9 }}><AlfieSails size={18} light={false} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>AlfiePRO app</div>
        <div className="m-dim" style={{ fontSize: 11.5 }}>Push reminders and the Race Timer</div>
      </div>
      <a href={APP_STORE_URL} className="m-pill-btn" style={{ height: 30, fontSize: 13, padding: '0 12px' }}>Open</a>
      <button className="m-ibtn" style={{ width: 28, height: 28, background: 'none', border: 0 }} aria-label="Hide" onClick={() => { setHidden(true); try { sessionStorage.setItem(BANNER_KEY, '1'); } catch { /* ignore */ } }}><Icon name="close" size={16} /></button>
    </div>
  );
};
