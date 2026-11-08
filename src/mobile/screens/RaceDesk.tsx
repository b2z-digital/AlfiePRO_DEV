import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { getStoredVenues } from '../../utils/venueStorage';
import { useMobile } from '../MobileContext';
import { Icon, IconName } from '../icons';
import { Avatar, RootHeader, Skeleton, fmtDay } from '../ui';
import { RacingNav } from './Racing';
import { parseDay, todayISO } from '../data';
import {
  DESK_FORMAT, DeskItem, DeskSeries, addSeriesRound, createSingleEvent, dropsLabel, heatsLabel, loadDesk, signedOnCount, startScoring,
} from '../raceDesk';

const ROLE_LABEL: Record<string, string> = { admin: 'ADMIN', editor: 'EDITOR', pro: 'RACE OFFICER', race_scorer: 'RACE SCORER', super_admin: 'ADMIN', state_admin: 'ADMIN', national_admin: 'ADMIN' };

const RoleChip: React.FC = () => {
  const { userRole, isAdmin } = usePermissions();
  const label = isAdmin ? 'ADMIN' : ROLE_LABEL[userRole || ''] || 'RACE ACCESS';
  const admin = label === 'ADMIN';
  return <span className="m-role" style={admin ? { background: 'rgba(10,132,255,.16)', color: 'var(--m-blue-ink)' } : undefined}>{label}</span>;
};

const Check: React.FC<{ done: boolean; label: string; value?: string }> = ({ done, label, value }) => (
  <div className="m-row" style={{ gap: 10, fontSize: 14 }}>
    {done ? <span className="m-ok"><Icon name="check" size={13} strokeWidth={3} /></span> : <span className="m-todo" />}
    <span style={{ flex: 1 }}>{label}</span>
    {value && <span className="m-mut">{value}</span>}
  </div>
);

/** "A 8 · B 8" from the first heat round, as the board shows it. */
const heatSizes = (it: DeskItem) => {
  const r = (it.event.heatManagement as any)?.rounds?.[0];
  return r?.heatAssignments?.length ? r.heatAssignments.map((h: any) => `${h.heatDesignation} ${h.skipperIndices?.length || 0}`).join(' · ') : '';
};

const useStart = () => {
  const { currentClub } = useAuth();
  const { toast, tap } = useMobile();
  const [busy, setBusy] = useState<string | null>(null);
  const start = async (it: DeskItem) => {
    setBusy(it.key);
    tap('medium');
    const err = await startScoring(it.event, currentClub?.clubId || it.event.clubId);
    setBusy(null);
    if (err) toast(err);
  };
  return { start, busy };
};

/* ─────────────── Race desk ─────────────── */

export const RaceDeskScreen: React.FC = () => {
  const navigate = useNavigate();
  const { memberIds } = useMobile();
  const { hasPermission } = usePermissions();
  const [data, setData] = useState<{ items: DeskItem[]; series: DeskSeries[] } | null>(null);
  const [signedOn, setSignedOn] = useState<number | null>(null);
  const { start, busy } = useStart();
  useEffect(() => { loadDesk().then(setData).catch(() => setData({ items: [], series: [] })); }, []);

  const today = todayISO();
  const lead = useMemo(() => data?.items.find(i => i.state === 'today' || (i.state === 'in_progress' && i.date === today)) || data?.items.find(i => i.state === 'in_progress'), [data, today]);
  useEffect(() => { if (lead) signedOnCount(lead.event).then(setSignedOn); }, [lead?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const needs = (data?.items || []).filter(i => i.key !== lead?.key && (i.state === 'in_progress' || i.state === 'not_scored')).sort((a, b) => (a.state === 'in_progress' ? -1 : 1) - (b.state === 'in_progress' ? -1 : 1) || b.date.localeCompare(a.date)).slice(0, 6);
  const upcoming = (data?.items || []).filter(i => i.key !== lead?.key && (i.state === 'upcoming' || i.state === 'today')).slice(0, 6);

  if (!hasPermission('races.score')) {
    return (
      <div className="m-stack">
        <RootHeader title="Racing" right={<RoleChip />} hideActions />
        <RacingNav />
        <div className="m-card m-empty">The race desk is for admins, editors, race officers and scorers.</div>
      </div>
    );
  }

  return (
    <div className="m-stack">
      <RootHeader title="Racing" right={<RoleChip />} hideActions />
      <RacingNav />
      {data === null ? <><Skeleton h={240} /><Skeleton h={140} /></> : (
        <>
          {lead ? (
            <div className="m-card m-spec" style={{ padding: 16, borderRadius: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="m-row" style={{ gap: 8 }}>
                <span className="m-lb" style={{ color: 'var(--m-pink-ink)' }}>{lead.date === today ? 'Today' : fmtDay(lead.date, { weekday: 'short', day: 'numeric', month: 'short' })}{lead.event.startTime ? ` · ${lead.event.startTime}` : ''}</span>
                <span className="m-cls" style={{ marginLeft: 'auto' }}>{DESK_FORMAT(lead.event)}</span>
              </div>
              <button className="m-disp" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', fontSize: 21, fontWeight: 700, lineHeight: 1.1, color: 'var(--m-ink)' }} onClick={() => navigate(`/race-desk/event/${lead.key}`)}>{lead.title}</button>
              <div className="m-mut" style={{ fontSize: 13 }}>{[lead.venue, `${lead.entered} entered`, lead.racesPlanned ? `${lead.racesPlanned} races` : '', lead.heats ? (lead.heats === 'shrs' ? 'SHRS heats' : 'HMS heats') : ''].filter(Boolean).join(' · ')}</div>
              <div className="m-stack" style={{ gap: 9, padding: '4px 0' }}>
                <Check done={signedOn != null && signedOn > 0} label="Signed on" value={signedOn != null ? `${signedOn} of ${lead.entered}` : undefined} />
                {lead.heats && <Check done={!!(lead.event.heatManagement as any)?.rounds?.length} label="Heats seeded" value={heatSizes(lead) || 'Not yet'} />}
                <Check done={lead.racesDone > 0} label={lead.racesDone > 0 ? `Race ${lead.racesDone} scored` : 'Start Race 1'} value={lead.racesPlanned ? `${lead.racesDone} of ${lead.racesPlanned}` : undefined} />
              </div>
              <button className="m-btn m-btn-p" style={{ height: 50, fontSize: 16 }} onClick={() => start(lead)} disabled={busy === lead.key}>
                <Icon name="racing" />{busy === lead.key ? 'Loading the latest results…' : lead.racesDone > 0 ? 'Continue scoring' : 'Start scoring'}
              </button>
            </div>
          ) : (
            <div className="m-card m-empty">No racing today. Events that need scoring and what's coming up are below.</div>
          )}
          {needs.length > 0 && (
            <>
              <p className="m-lb m-dim" style={{ margin: '2px 0 0' }}>Needs you</p>
              <div className="m-card">
                {needs.map(i => (
                  <button key={i.key} className="m-li" onClick={() => navigate(`/race-desk/event/${i.key}`)}>
                    <span className="m-tile" style={i.state === 'in_progress' ? { background: 'rgba(255,159,10,.15)', color: 'var(--m-amber-ink)' } : { background: 'var(--m-fill)' }}><Icon name={i.state === 'in_progress' ? 'timer' : 'tasks'} size={19} /></span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="m-ell" style={{ display: 'block', fontWeight: 600, fontSize: 14.5 }}>{i.title}</span>
                      <span className="m-mut m-ell" style={{ display: 'block', fontSize: 12.5 }}>
                        {i.state === 'in_progress' ? `Scoring paused after race ${i.racesDone}${i.racesPlanned ? ` of ${i.racesPlanned}` : ''}` : `${fmtDay(i.date, { weekday: 'short', day: 'numeric', month: 'short' })} · not scored`}
                      </span>
                    </span>
                    <span className="m-pill" style={i.state === 'in_progress' ? { background: 'rgba(255,159,10,.15)', color: 'var(--m-amber-ink)' } : undefined}>{i.state === 'in_progress' ? 'Resume' : 'Score'}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {upcoming.length > 0 && (
            <>
              <p className="m-lb m-dim" style={{ margin: '2px 0 0' }}>Coming up</p>
              <div className="m-card">
                {upcoming.map(i => (
                  <button key={i.key} className="m-li" onClick={() => navigate(`/race-desk/event/${i.key}`)}>
                    <span className="m-date" style={{ width: 46, height: 50 }}>
                      <span className="m-lb m-dim" style={{ fontSize: 9.5 }}>{fmtDay(i.date, { weekday: 'short' })}</span>
                      <span className="m-disp" style={{ fontWeight: 700, fontSize: 19, lineHeight: 1 }}>{parseDay(i.date).getDate()}</span>
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="m-ell" style={{ display: 'block', fontWeight: 600, fontSize: 14.5 }}>{i.title}</span>
                      <span className="m-mut" style={{ display: 'block', fontSize: 12.5 }}>{i.event.startTime ? `${i.event.startTime} · ` : ''}{i.entered} entered{i.proMemberId && memberIds.includes(i.proMemberId) ? " · you're PRO" : ''}</span>
                    </span>
                    <Icon name="chevron" size={17} className="m-dim" />
                  </button>
                ))}
              </div>
            </>
          )}
          {hasPermission('races.manage') && (
            <button className="m-btn m-btn-g" onClick={() => navigate('/race-desk/season')}><Icon name="calendar" size={18} />Season</button>
          )}
        </>
      )}
    </div>
  );
};

/* ─────────────── Event or round ─────────────── */

const Action: React.FC<{ icon: IconName; label: string; onClick: () => void; primary?: boolean; disabled?: boolean }> = ({ icon, label, onClick, primary, disabled }) => (
  <button className={`m-btn ${primary ? 'm-btn-p' : 'm-btn-g'}`} onClick={onClick} disabled={disabled}><Icon name={icon} size={18} />{label}</button>
);

export const DeskEventScreen: React.FC = () => {
  const { key = '' } = useParams();
  const navigate = useNavigate();
  const { memberIds, toast } = useMobile();
  const [item, setItem] = useState<DeskItem | null | undefined>(undefined);
  const [signedOn, setSignedOn] = useState<number | null>(null);
  const { start, busy } = useStart();
  useEffect(() => { loadDesk().then(d => setItem(d.items.find(i => i.key === key) || null)).catch(() => setItem(null)); }, [key]);
  useEffect(() => { if (item) signedOnCount(item.event).then(setSignedOn); }, [item?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (item === undefined) return <div className="m-stack"><Skeleton h={160} /><Skeleton h={260} /></div>;
  if (item === null) return <div className="m-stack"><header className="m-top"><button className="m-ibtn" aria-label="Back" onClick={() => navigate(-1)}><Icon name="back" /></button></header><div className="m-card m-empty">This event isn't available.</div></div>;

  const e = item.event;
  const today = todayISO();
  const isToday = item.date === today;
  const statePill = item.state === 'done' ? { t: 'Scored', c: 'var(--m-green-ink)', b: 'rgba(52,199,89,.15)' }
    : item.state === 'in_progress' ? { t: `Race ${item.racesDone} done`, c: 'var(--m-amber-ink)', b: 'rgba(255,159,10,.15)' }
      : isToday ? { t: 'Today', c: 'var(--m-blue-ink)', b: 'rgba(10,132,255,.16)' }
        : item.state === 'not_scored' ? { t: 'Not scored', c: 'var(--m-mut)', b: 'var(--m-fill)' }
          : item.state === 'cancelled' ? { t: 'Cancelled', c: 'var(--m-red-ink)', b: 'rgba(255,59,48,.14)' } : null;

  return (
    <div className="m-stack">
      <header className="m-top">
        <button className="m-ibtn" aria-label="Back" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/race-desk'))}><Icon name="back" /></button>
        <div style={{ flex: 1 }} />
        <button className="m-ibtn" aria-label="Event page" onClick={() => navigate(`/calendar/event/${encodeURIComponent(item.key.replace(/^q-/, 'e-'))}`)}><Icon name="doc" /></button>
      </header>
      <div>
        <div className="m-row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <span className="m-cls">{e.raceClass}</span>
          {item.seriesName && <span className="m-cls">{item.seriesName}</span>}
          {statePill && <span className="m-pill" style={{ background: statePill.b, color: statePill.c }}>{statePill.t}</span>}
        </div>
        <h2 className="m-disp" style={{ margin: '8px 0 0', fontSize: 26, fontWeight: 700, lineHeight: 1.1 }}>{item.roundName || item.title}</h2>
        <div className="m-mut" style={{ fontSize: 13.5, marginTop: 4 }}>{[fmtDay(item.date, { weekday: 'short', day: 'numeric', month: 'short' }), e.startTime, item.venue].filter(Boolean).join(' · ')}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        <div className="m-card" style={{ padding: 12, textAlign: 'center' }}><div className="m-disp" style={{ fontSize: 24, fontWeight: 700 }}>{item.entered}</div><div className="m-dim" style={{ fontSize: 12 }}>entered</div></div>
        <div className="m-card" style={{ padding: 12, textAlign: 'center' }}><div className="m-disp" style={{ fontSize: 24, fontWeight: 700 }}>{signedOn ?? '–'}</div><div className="m-dim" style={{ fontSize: 12 }}>signed on</div></div>
        <div className="m-card" style={{ padding: 12, textAlign: 'center' }}><div className="m-disp" style={{ fontSize: 24, fontWeight: 700 }}>{item.racesDone}{item.racesPlanned ? `/${item.racesPlanned}` : ''}</div><div className="m-dim" style={{ fontSize: 12 }}>races</div></div>
      </div>
      {item.state !== 'cancelled' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          <Action icon="check" label="Sign on" onClick={() => navigate(`/race-desk/event/${item.key}/sign-on`)} />
          <Action icon="club" label="Skippers" onClick={() => navigate(`/race-desk/event/${item.key}/skippers`)} />
          <Action icon="tasks" label="Heats" onClick={() => navigate(`/race-desk/event/${item.key}/heats`)} />
          <Action icon="racing" label={busy === item.key ? 'Loading…' : item.state === 'done' ? 'Re-open scoring' : item.racesDone > 0 ? 'Continue scoring' : 'Start scoring'} primary onClick={() => start(item)} disabled={busy === item.key} />
        </div>
      )}
      <p className="m-lb m-dim" style={{ margin: '4px 0 0' }}>How it's scored</p>
      <div className="m-card">
        <div className="m-li"><span className="m-mut" style={{ flex: 1, fontSize: 14 }}>System</span><span style={{ fontSize: 14, fontWeight: 600 }}>{e.raceFormat === 'handicap' ? 'Handicap · low point' : 'Scratch · low point (RRS A)'}</span></div>
        <div className="m-li"><span className="m-mut" style={{ flex: 1, fontSize: 14 }}>Drops</span><span style={{ fontSize: 14, fontWeight: 600 }}>{dropsLabel(e)}</span></div>
        <div className="m-li"><span className="m-mut" style={{ flex: 1, fontSize: 14 }}>Heats</span><span style={{ fontSize: 14, fontWeight: 600 }}>{heatsLabel(e)}</span></div>
        {item.state !== 'cancelled' && <button className="m-li" style={{ color: 'var(--m-blue-ink)' }} onClick={() => navigate(`/race-desk/event/${item.key}/settings`)}><span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>Race settings</span><Icon name="chevron" size={16} /></button>}
      </div>
      {(item.proName || item.proMemberId) && (
        <>
          <p className="m-lb m-dim" style={{ margin: '4px 0 0' }}>Officials</p>
          <div className="m-card">
            <div className="m-li">
              <Avatar name={item.proName || 'Race officer'} size={34} />
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600 }}>{item.proMemberId && memberIds.includes(item.proMemberId) ? 'You' : item.proName}</span>
                <span className="m-dim" style={{ display: 'block', fontSize: 12 }}>Race officer</span>
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

/* ─────────────── Season ─────────────── */

export const SeasonScreen: React.FC = () => {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const [data, setData] = useState<{ items: DeskItem[]; series: DeskSeries[] } | null>(null);
  const [view, setView] = useState<'series' | 'single' | 'needs'>('series');
  const [creating, setCreating] = useState(false);
  const year = new Date().getFullYear();
  const load = React.useCallback(() => { loadDesk().then(setData).catch(() => setData({ items: [], series: [] })); }, []);
  useEffect(() => { load(); }, [load]);

  const yearSeries = (data?.series || []).filter(s => s.rounds.some(r => r.date.startsWith(String(year)) || r.date >= todayISO()));
  const singles = (data?.items || []).filter(i => i.key.startsWith('q-') && (i.date.startsWith(String(year)) || i.date >= todayISO()));
  const needs = (data?.items || []).filter(i => i.state === 'in_progress' || i.state === 'not_scored');

  return (
    <div className="m-stack">
      <header className="m-top">
        <button className="m-ibtn" aria-label="Back" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/race-desk'))}><Icon name="back" /></button>
        <h1 className="m-ptitle m-disp" style={{ fontSize: 24 }}>Season {year}</h1>
        <RoleChip />
      </header>
      <div className="m-chips">
        <button className={`m-chip ${view === 'series' ? 'm-chip-on' : ''}`} onClick={() => setView('series')}>Series {yearSeries.length || ''}</button>
        <button className={`m-chip ${view === 'single' ? 'm-chip-on' : ''}`} onClick={() => setView('single')}>Single events {singles.length || ''}</button>
        <button className={`m-chip ${view === 'needs' ? 'm-chip-on' : ''}`} onClick={() => setView('needs')}>Needs scoring {needs.length || ''}</button>
      </div>
      {data === null ? <><Skeleton h={130} /><Skeleton h={130} /></> : view === 'series' ? (
        yearSeries.length === 0 ? <div className="m-card m-empty">No series this season yet.</div> : yearSeries.map(s => {
          const active = s.rounds.filter(r => r.state !== 'cancelled');
          const pct = active.length ? Math.round((s.done / active.length) * 100) : 0;
          const heat = s.rounds.find(r => r.heats)?.heats;
          return (
            <button key={s.series.id} className="m-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left', color: 'inherit' }} onClick={() => (s.inProgress || s.next) && navigate(`/race-desk/event/${(s.inProgress || s.next)!.key}`)}>
              <span className="m-row" style={{ gap: 8, width: '100%' }}>
                <span className="m-cls">{s.series.raceClass}</span>
                <span className="m-cls">{s.series.raceFormat === 'handicap' ? 'Handicap' : 'Scratch'}</span>
                {heat && <span className="m-cls">{heat === 'shrs' ? 'SHRS' : 'HMS'}</span>}
                <span className="m-dim" style={{ marginLeft: 'auto', fontSize: 12.5 }}>{s.registered} registered</span>
              </span>
              <span style={{ fontWeight: 700, fontSize: 16 }}>{s.series.seriesName}</span>
              <span className="m-prog" style={{ width: '100%' }}><i style={{ width: `${pct}%` }} /></span>
              <span className="m-row m-mut" style={{ fontSize: 12.5, width: '100%' }}>
                <span>{s.done} of {active.length} rounds</span>
                <span style={{ marginLeft: 'auto', color: s.inProgress ? 'var(--m-amber-ink)' : undefined }}>
                  {s.inProgress ? `${s.inProgress.roundName} in progress` : s.next ? `Next: ${s.next.roundName} ${s.next.date === todayISO() ? 'today' : fmtDay(s.next.date, { weekday: 'short', day: 'numeric' })}` : 'All rounds done'}
                </span>
              </span>
            </button>
          );
        })
      ) : (
        (view === 'single' ? singles : needs).length === 0 ? <div className="m-card m-empty">{view === 'single' ? 'No single events this season.' : 'Everything is scored.'}</div> : (
          <div className="m-card">
            {(view === 'single' ? singles : needs).map(i => (
              <button key={i.key} className="m-li" onClick={() => navigate(`/race-desk/event/${i.key}`)}>
                <span className="m-date" style={{ width: 46, height: 50 }}>
                  <span className="m-lb m-dim" style={{ fontSize: 9.5 }}>{fmtDay(i.date, { month: 'short' })}</span>
                  <span className="m-disp" style={{ fontWeight: 700, fontSize: 19, lineHeight: 1 }}>{parseDay(i.date).getDate()}</span>
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="m-ell" style={{ display: 'block', fontWeight: 600, fontSize: 14.5 }}>{i.title}</span>
                  <span className="m-mut" style={{ display: 'block', fontSize: 12.5 }}>{i.state === 'done' ? 'Scored' : i.state === 'in_progress' ? `Race ${i.racesDone} done` : i.state === 'not_scored' ? 'Not scored' : `${i.entered} entered`}</span>
                </span>
                <Icon name="chevron" size={17} className="m-dim" />
              </button>
            ))}
          </div>
        )
      )}
      {hasPermission('races.manage') && (
        <button className="m-fab m-fab-x" onClick={() => setCreating(true)}><Icon name="plus" />New event</button>
      )}
      {creating && data && <NewEventSheet series={data.series.map(s => s.series)} onClose={() => setCreating(false)} onDone={key => { setCreating(false); navigate(`/race-desk/event/${key}`); }} />}
    </div>
  );
};

/* ─────────────── New event ─────────────── */

const NewEventSheet: React.FC<{ series: DeskSeries['series'][]; onClose: () => void; onDone: (key: string) => void }> = ({ series, onClose, onDone }) => {
  const { currentClub } = useAuth();
  const { myClasses, toast, tap } = useMobile();
  const [kind, setKind] = useState<'single' | 'round'>(series.length ? 'round' : 'single');
  const open = series.filter(s => !s.completed);
  const [seriesId, setSeriesId] = useState(open[0]?.id || '');
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [venue, setVenue] = useState('');
  const [venues, setVenues] = useState<string[]>([]);
  const [raceClass, setRaceClass] = useState(myClasses[0] || '');
  const [format, setFormat] = useState<'scratch' | 'handicap'>('scratch');
  const [busy, setBusy] = useState(false);
  const chosen = series.find(s => s.id === seriesId);
  const last = chosen?.rounds[chosen.rounds.length - 1];
  useEffect(() => { getStoredVenues().then(v => { const names = v.map(x => x.name); setVenues(names); setVenue(x => x || names[0] || ''); }).catch(() => {}); }, []);
  useEffect(() => {
    if (kind === 'round' && last?.venue) setVenue(last.venue);
    if (kind === 'round' && last?.startTime) setStartTime(last.startTime);
  }, [seriesId, kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const create = async () => {
    if (!date || !venue) return;
    setBusy(true);
    try {
      if (kind === 'round' && chosen) {
        const idx = await addSeriesRound(chosen, { date, venue, startTime });
        tap('success'); toast('Round created');
        onDone(`s-${chosen.id}-${idx}`);
      } else {
        if (!name.trim() || !raceClass) { setBusy(false); return; }
        const e = await createSingleEvent({ name: name.trim(), date, startTime, venue, raceClass, raceFormat: format, clubId: currentClub?.clubId, clubName: currentClub?.club?.abbreviation || currentClub?.club?.name || '' });
        tap('success'); toast('Event created');
        onDone(`q-${e.id}`);
      }
    } catch {
      toast("Couldn't create that. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="m-veil" onClick={onClose} />
      <div className="m-sheet" role="dialog" aria-label="New event" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <span className="m-grab" />
        <div className="m-row">
          <div className="m-disp" style={{ flex: 1, fontSize: 22, fontWeight: 700 }}>New event</div>
          <button style={{ background: 'none', border: 0, color: 'var(--m-blue-ink)', fontWeight: 600, fontSize: 15 }} onClick={onClose}>Cancel</button>
        </div>
        <div className="m-seg">
          <button className={kind === 'single' ? 'm-on' : ''} onClick={() => setKind('single')}>Single event</button>
          <button className={kind === 'round' ? 'm-on' : ''} onClick={() => setKind('round')} disabled={!open.length}>Series round</button>
        </div>
        {kind === 'round' ? (
          <label className="m-fld"><span>Series</span>
            <select className="m-field" value={seriesId} onChange={ev => setSeriesId(ev.target.value)}>{open.map(s => <option key={s.id} value={s.id}>{s.seriesName}</option>)}</select>
          </label>
        ) : (
          <>
            <label className="m-fld"><span>Event name</span><input className="m-field" value={name} onChange={ev => setName(ev.target.value)} placeholder="DF65 Spring Regatta" /></label>
            <div className="m-row" style={{ gap: 10 }}>
              <label className="m-fld" style={{ flex: 1 }}><span>Class</span><input className="m-field" value={raceClass} onChange={ev => setRaceClass(ev.target.value)} placeholder="DF65" list="m-classes" /></label>
              <datalist id="m-classes">{myClasses.map(c => <option key={c} value={c} />)}</datalist>
            </div>
            <label className="m-fld"><span>Scoring</span>
              <div className="m-seg">
                <button className={format === 'scratch' ? 'm-on' : ''} onClick={() => setFormat('scratch')}>Scratch</button>
                <button className={format === 'handicap' ? 'm-on' : ''} onClick={() => setFormat('handicap')}>Handicap</button>
              </div>
            </label>
          </>
        )}
        <div className="m-row" style={{ gap: 10 }}>
          <label className="m-fld" style={{ flex: 1.4 }}><span>Date</span><input type="date" className="m-field" value={date} onChange={ev => setDate(ev.target.value)} /></label>
          <label className="m-fld" style={{ flex: 1 }}><span>Start <span className="m-dim" style={{ fontWeight: 400 }}>optional</span></span><input type="time" className="m-field" value={startTime} onChange={ev => setStartTime(ev.target.value)} /></label>
        </div>
        <label className="m-fld"><span>Venue</span>
          {venues.length ? (
            <select className="m-field" value={venue} onChange={ev => setVenue(ev.target.value)}>{venues.map(v => <option key={v} value={v}>{v}</option>)}</select>
          ) : <input className="m-field" value={venue} onChange={ev => setVenue(ev.target.value)} placeholder="Venue" />}
        </label>
        {kind === 'round' && chosen && (
          <div className="m-card m-row" style={{ padding: '12px 14px', gap: 10, background: 'rgba(10,132,255,.08)', borderColor: 'rgba(10,132,255,.25)' }}>
            <Icon name="doc" size={18} style={{ color: 'var(--m-blue-ink)', flexShrink: 0 }} />
            <span className="m-mut" style={{ fontSize: 13 }}>{last ? `Uses the series' notice of race and instructions, and copies the race count and drops from ${last.name}.` : "Uses the series' notice of race and instructions."} Heats are set up from the event page.</span>
          </div>
        )}
        <button className="m-btn m-btn-p" style={{ height: 52, fontSize: 16 }} onClick={create} disabled={busy || !date || !venue || (kind === 'single' && (!name.trim() || !raceClass))}>
          {busy ? 'Creating…' : kind === 'round' ? 'Create round' : 'Create event'}
        </button>
      </div>
    </>
  );
};
