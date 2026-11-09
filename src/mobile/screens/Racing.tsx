import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { usePermissions } from '../../hooks/usePermissions';
import { useMobile } from '../MobileContext';
import { MCalendarItem, daysUntil, isMyClass, myResultFor, parseDay, podium, todayISO } from '../data';
import { Icon } from '../icons';
import { EntriesPill, LevelPill, MyStatusPill, RootHeader, Skeleton, fmtDay, openCalendarItem } from '../ui';
import { ordinal } from './Home';

export const RacingNav: React.FC = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { hasPermission } = usePermissions();
  const canScore = hasPermission('races.score');
  const tabs = [
    { label: 'Calendar', path: '/calendar' },
    { label: 'Results', path: '/results' },
    { label: 'Find', path: '/find-racing' },
    ...(canScore ? [{ label: 'Race desk', path: '/race-desk' }] : []),
  ];
  return (
    <nav className="m-seg" aria-label="Racing sections">
      {tabs.map(t => (
        <button key={t.path} className={pathname.startsWith(t.path) ? 'm-on' : ''} onClick={() => navigate(t.path)}>
          {t.path === '/race-desk' && <Icon name="racing" size={14} />}{t.label}
        </button>
      ))}
    </nav>
  );
};

const openItem = (navigate: ReturnType<typeof useNavigate>, i: MCalendarItem) => openCalendarItem(navigate, i);

/* ─────────────── Calendar ─────────────── */

const AgendaRow: React.FC<{ item: MCalendarItem }> = ({ item }) => {
  const navigate = useNavigate();
  const next = daysUntil(item.date) >= 0 && item.kind === 'race';
  return (
    <button className="m-card" onClick={() => openItem(navigate, item)} style={{ padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'center', textAlign: 'left', opacity: item.cancelled ? .55 : 1 }}>
      {item.venueImage
        ? <span className="m-tile m-venue-ph" style={{ backgroundImage: `url("${item.venueImage}")` }} aria-hidden="true" />
        : (
          <span className="m-tile" style={{ background: item.kind === 'meeting' ? 'rgba(255,138,43,.15)' : 'rgba(10,132,255,.14)', color: item.kind === 'meeting' ? '#FFA65C' : 'var(--m-blue-ink)' }}>
            <Icon name={item.kind === 'meeting' ? 'club' : 'sail'} size={19} />
          </span>
        )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: item.cancelled ? 'line-through' : undefined }}>{item.title}</div>
        <div className="m-mut" style={{ fontSize: 12.5, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {[item.startTime?.slice(0, 5), item.venue, item.kind === 'race' && item.level !== 'club' ? item.clubName : null].filter(Boolean).join(' · ')}
        </div>
        <div style={{ display: 'flex', gap: 5, marginTop: 6, flexWrap: 'wrap' }}>
          {item.raceClass && <span className="m-cls">{item.raceClass}</span>}
          <LevelPill level={item.level} />
          {item.cancelled ? <span className="m-pill" style={{ background: 'rgba(255,59,48,.14)', color: '#FF8C82' }}>Cancelled</span>
            : item.completed ? <span className="m-pill" style={{ background: 'var(--m-fill)', color: 'var(--m-mut)' }}>Results</span>
            : item.external ? <EntriesPill item={item} />
            : next ? <MyStatusPill item={item} /> : null}
        </div>
      </div>
    </button>
  );
};


type CalFilter = 'mine' | 'all' | 'club' | 'state' | 'national';

export const CalendarScreen: React.FC = () => {
  const navigate = useNavigate();
  const { calendar, calendarLoading, myClasses } = useMobile();
  const [filter, setFilter] = useState<CalFilter>('all');
  const sameClass = (a?: string) => isMyClass(a, myClasses);
  const touched = useRef(false);
  const today = todayISO();
  const [weekStart, setWeekStart] = useState(() => {
    const d = parseDay(today); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return d;
  });

  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d; });
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const datesWith = useMemo(() => new Set(calendar.map(i => i.date)), [calendar]);

  const list = useMemo(() => calendar.filter(i => {
    if (i.date < iso(weekStart)) return false;
    if (filter === 'all') return true;
    if (filter === 'mine') return i.kind === 'meeting' || sameClass(i.raceClass);
    return i.kind === 'race' && i.level === filter;
  }), [calendar, filter, weekStart, myClasses]);

  const groups = useMemo(() => {
    const g: { date: string; items: MCalendarItem[] }[] = [];
    for (const i of list.slice(0, 80)) {
      const last = g[g.length - 1];
      if (last && last.date === i.date) last.items.push(i); else g.push({ date: i.date, items: [i] });
    }
    return g;
  }, [list]);

  const shiftWeek = (n: number) => setWeekStart(w => { const d = new Date(w); d.setDate(d.getDate() + 7 * n); return d; });

  return (
    <div className="m-stack">
      <RootHeader title="Racing" />
      <RacingNav />
      <div className="m-row" style={{ justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 600, fontSize: 15 }}>{weekStart.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}</span>
        <span className="m-row" style={{ gap: 6 }}>
          <button className="m-ibtn" style={{ width: 34, height: 34 }} aria-label="Previous week" onClick={() => shiftWeek(-1)}><Icon name="back" size={16} /></button>
          <button className="m-chip" style={{ height: 34 }} onClick={() => { const d = parseDay(today); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); setWeekStart(d); }}>Today</button>
          <button className="m-ibtn" style={{ width: 34, height: 34 }} aria-label="Next week" onClick={() => shiftWeek(1)}><Icon name="chevron" size={16} /></button>
        </span>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {days.map(d => {
          const key = iso(d);
          const isToday = key === today;
          return (
            <button key={key} onClick={() => document.getElementById(`m-day-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '6px 0', borderRadius: 12, border: 0, background: isToday ? 'var(--m-blue)' : 'transparent', color: isToday ? '#fff' : 'var(--m-ink)' }}>
              <span style={{ fontSize: 11, opacity: isToday ? .85 : .5 }}>{d.toLocaleDateString('en-AU', { weekday: 'short' }).toUpperCase()}</span>
              <span style={{ fontWeight: 700 }}>{d.getDate()}</span>
              <span style={{ width: 5, height: 5, borderRadius: 9, background: datesWith.has(key) ? (isToday ? '#fff' : 'var(--m-blue-ink)') : 'transparent' }} />
            </button>
          );
        })}
      </div>
      <div className="m-chips">
        {((myClasses.length ? ['mine', 'all', 'club', 'state', 'national'] : ['all', 'club', 'state', 'national']) as CalFilter[]).map(f => (
          <button key={f} className={`m-chip ${filter === f ? 'm-chip-on' : ''}`} onClick={() => { touched.current = true; setFilter(f); }}>
            {f === 'all' ? 'All' : f === 'mine' ? 'My classes' : f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {calendarLoading && !calendar.length ? (<><Skeleton h={84} /><Skeleton h={84} /><Skeleton h={84} /></>) :
        groups.length === 0 ? <div className="m-card m-empty">Nothing on from this week.</div> :
        groups.map(g => (
          <div key={g.date} id={`m-day-${g.date}`} className="m-stack" style={{ gap: 8, scrollMarginTop: 12 }}>
            <p className="m-lb m-dim" style={{ margin: '4px 0 0' }}>{fmtDay(g.date, { weekday: 'long', day: 'numeric', month: 'short' })}{g.date === today ? ' · Today' : ''}</p>
            {g.items.map(i => <AgendaRow key={i.key} item={i} />)}
          </div>
        ))}
    </div>
  );

};

/* ─────────────── Results ─────────────── */

export const ResultsScreen: React.FC<{ mineOnly?: boolean }> = ({ mineOnly }) => {
  const navigate = useNavigate();
  const { calendar, calendarLoading, memberIds, profile, myClasses } = useMobile();
  const [filter, setFilter] = useState<string>(mineOnly || memberIds.length ? 'mine' : 'all');
  const touched = useRef(false);
  useEffect(() => { if (!touched.current && memberIds.length) setFilter('mine'); }, [memberIds.length]);
  const fullName = `${profile.firstName} ${profile.lastName}`.trim();
  const today = todayISO();

  const rows = useMemo(() => {
    return calendar
      .filter(i => i.kind === 'race' && i.date <= today && (i.event?.raceResults?.length || 0) > 0)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 60)
      .map(i => ({ item: i, mine: myResultFor(i, memberIds, fullName), top: podium(i) }))
      .filter(r => filter === 'all' ? true : filter === 'mine' ? !!r.mine : filter.startsWith('class:') ? r.item.raceClass?.toLowerCase() === filter.slice(6).toLowerCase() : r.item.level === filter);
  }, [calendar, memberIds, fullName, filter, today]);

  const groups = useMemo(() => {
    const g: { month: string; rows: typeof rows }[] = [];
    rows.forEach(r => {
      const m = parseDay(r.item.date).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
      const last = g[g.length - 1];
      if (last && last.month === m) last.rows.push(r); else g.push({ month: m, rows: [r] });
    });
    return g;
  }, [rows]);

  return (
    <div className="m-stack">
      <RootHeader title="Racing" />
      <RacingNav />
      <div className="m-chips">
        {['mine', 'all', 'club', 'state', 'national', ...myClasses.map(c => `class:${c}`)].map(f => (
          <button key={f} className={`m-chip ${filter === f ? 'm-chip-on' : ''}`} onClick={() => { touched.current = true; setFilter(f); }}>
            {f === 'mine' ? 'I sailed' : f === 'all' ? 'All' : f.startsWith('class:') ? f.slice(6) : f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>
      {calendarLoading && !calendar.length ? (<><Skeleton h={110} /><Skeleton h={110} /></>) :
        groups.length === 0 ? <div className="m-card m-empty">{filter === 'mine' ? "No results with your name yet." : 'No results yet.'}</div> :
        groups.map(g => (
          <div key={g.month} className="m-stack" style={{ gap: 10 }}>
            <p className="m-lb m-dim" style={{ margin: '4px 0 0' }}>{g.month}</p>
            {g.rows.map(({ item, mine, top }) => (
              <button key={item.key} className="m-card" onClick={() => openItem(navigate, item)} style={{ padding: 14, textAlign: 'left' }}>
                <div className="m-row" style={{ gap: 8 }}>
                  {item.raceClass && <span className="m-cls">{item.raceClass}</span>}
                  <span className="m-dim" style={{ fontSize: 12.5 }}>{fmtDay(item.date, { weekday: 'short', day: 'numeric', month: 'short' })} · {item.event?.skippers?.length || 0} boats</span>
                  <span style={{ marginLeft: 'auto' }}>
                    {mine ? <span className="m-pill" style={{ background: 'rgba(10,132,255,.18)', color: '#7DBBFF', fontWeight: 700 }}>You {mine.position}{ordinal(mine.position)}</span> : <LevelPill level={item.level} />}
                  </span>
                </div>
                <div style={{ fontWeight: 600, fontSize: 15.5, marginTop: 8 }}>{item.title}</div>
                {top.length > 0 && (
                  <div style={{ display: 'flex', gap: 12, marginTop: 10, fontSize: 13, flexWrap: 'wrap' }}>
                    {top.map((n, i) => (
                      <span key={n + i} className="m-row" style={{ gap: 6 }}>
                        <span style={{ width: 22, height: 22, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#0A1020', background: ['#FFD25E', '#D5DCE8', '#E8A26B'][i] }}>{i + 1}</span>
                        {shortName(n)}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>
        ))}
    </div>
  );
};

export const shortName = (n: string) => { const p = (n || '').trim().split(/\s+/); return p.length > 1 ? `${p[0][0]}. ${p.slice(1).join(' ')}` : n; };
