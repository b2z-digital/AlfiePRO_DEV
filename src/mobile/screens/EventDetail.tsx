import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMobile } from '../MobileContext';
import { daysUntil, eventStandings, MCalendarItem } from '../data';
import { Icon } from '../icons';
import { GoingStack, LevelPill, RsvpButtons, Skeleton, SubHeader, fmtDay } from '../ui';
import { shortName } from './Racing';
import { SkipperSheet, type SheetSkipper } from './SkipperSheet';
import { EventMediaTab, Podium, useEventBroadcast } from './EventExtras';

type Tab = 'details' | 'entries' | 'results' | 'media';

export const EventDetail: React.FC = () => {
  const { key = '' } = useParams();
  const navigate = useNavigate();
  const { calendar, calendarLoading } = useMobile();
  const item = calendar.find(i => i.key === decodeURIComponent(key));
  const hasResults = (item?.event?.raceResults?.length || 0) > 0;
  const [tab, setTab] = useState<Tab>(hasResults ? 'results' : 'details');
  // The calendar may still be loading on first render: open on Results once we know there are some
  const picked = useRef(hasResults);
  const session = useEventBroadcast(item?.event?.id);
  // A live broadcast leads: open on Media while it's on
  const sawLive = useRef(false);
  useEffect(() => { if (session?.status === 'live' && !sawLive.current) { sawLive.current = true; setTab('media'); } }, [session?.status]);
  useEffect(() => { if (hasResults && !picked.current) { picked.current = true; setTab('results'); } }, [hasResults]);

  if (!item) {
    return (
      <div className="m-stack">
        <SubHeader title="Event" />
        {calendarLoading ? <Skeleton h={240} /> : <div className="m-card m-empty">This event isn't in your calendar any more.</div>}
      </div>
    );
  }

  const e = item.event;
  const upcoming = daysUntil(item.date) >= 0 && !item.completed && !item.cancelled;
  const entries = (e?.skippers?.length ? e.skippers : e?.attendees) || [];
  const docs = [
    e?.noticeOfRaceUrl ? { name: 'Notice of Race', url: e.noticeOfRaceUrl } : null,
    e?.sailingInstructionsUrl ? { name: 'Sailing Instructions', url: e.sailingInstructionsUrl } : null,
    ...((e?.additionalDocuments || []).map(d => ({ name: d.name, url: d.url }))),
  ].filter(Boolean) as { name: string; url: string }[];

  return (
    <div className="m-stack">
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 'calc(var(--m-safe-top) + 230px)', zIndex: -1,
        background: `linear-gradient(180deg, rgba(6,11,22,.25) 0%, rgba(6,11,22,0) 35%, var(--m-bg) 100%), ${item.venueImage ? `url("${item.venueImage}") center / cover no-repeat` : 'linear-gradient(125deg,#0A3D7A 0%,#1C6FC2 50%,#9DD2FF 100%)'}` }} />
      <SubHeader right={
        <span className="m-row" style={{ gap: 8 }}>
          {item.event && <button className="m-ibtn" aria-label="Add to calendar" onClick={() => addToCalendar(item)}><Icon name="calendar" size={19} /></button>}
          <button className="m-ibtn" aria-label="Share" onClick={() => share(item)}><Icon name="share" size={19} /></button>
        </span>
      } />
      <div style={{ height: 56 }} />
      <div className="m-row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {item.raceClass && <span className="m-cls" style={{ background: 'rgba(6,11,22,.5)', color: '#fff', borderColor: 'rgba(255,255,255,.2)' }}>{item.raceClass}</span>}
        {item.raceFormat && <span className="m-cls" style={{ background: 'rgba(6,11,22,.5)', color: '#fff', borderColor: 'rgba(255,255,255,.2)', textTransform: 'capitalize' }}>{item.raceFormat}</span>}
        <LevelPill level={item.level} />
        {item.cancelled && <span className="m-pill" style={{ background: 'rgba(255,59,48,.2)', color: '#FF8C82' }}>Cancelled</span>}
      </div>
      <h2 className="m-disp" style={{ margin: 0, fontSize: 27, fontWeight: 700, lineHeight: 1.1 }}>{item.title}</h2>

      {upcoming && (
        <div className="m-card" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="m-row" style={{ justifyContent: 'space-between' }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Are you going?</span>
            <GoingStack item={item} />
          </div>
          <RsvpButtons item={item} />
        </div>
      )}

      <nav className="m-seg" aria-label="Event sections">
        <button className={tab === 'details' ? 'm-on' : ''} onClick={() => setTab('details')}>Details</button>
        <button className={tab === 'entries' ? 'm-on' : ''} onClick={() => setTab('entries')}>Entries {entries.length || ''}</button>
        <button className={tab === 'results' ? 'm-on' : ''} onClick={() => setTab('results')}>Results</button>
        <button className={tab === 'media' ? 'm-on' : ''} onClick={() => setTab('media')}>{session?.status === 'live' ? <span style={{ color: '#FF453A' }}>● </span> : null}Media</button>
      </nav>

      {tab === 'details' && (
        <>
          <div className="m-card">
            <div className="m-li">
              <span className="m-tile" style={{ background: 'rgba(10,132,255,.14)', color: 'var(--m-blue-ink)' }}><Icon name="calendar" size={19} /></span>
              <div><div style={{ fontSize: 14.5, fontWeight: 600 }}>{fmtDay(item.date, { weekday: 'long', day: 'numeric', month: 'long' })}{item.endDate && item.endDate !== item.date ? ` – ${fmtDay(item.endDate, { day: 'numeric', month: 'short' })}` : ''}{item.startTime ? ` · ${item.startTime.slice(0, 5)}` : ''}</div>
                <div className="m-mut" style={{ fontSize: 12.5 }}>{e?.numRaces ? `${e.numRaces} races` : 'Race day'}{e?.dropRules?.length ? ` · drops after ${e.dropRules.join(', ')}` : ''}</div></div>
            </div>
            {item.venue && (
              <button className="m-li" onClick={() => navigate(`/venue/${encodeURIComponent(item.venue!)}`)} style={{ color: 'inherit', width: '100%' }}>
                <span className="m-tile" style={{ background: 'rgba(255,138,43,.14)', color: '#FFA65C' }}><Icon name="pin" size={19} /></span>
                <div style={{ flex: 1, textAlign: 'left' }}><div style={{ fontSize: 14.5, fontWeight: 600 }}>{item.venue}</div><div className="m-mut" style={{ fontSize: 12.5 }}>Venue, directions and wind</div></div>
                <Icon name="chevron" size={18} className="m-dim" />
              </button>
            )}
            {e?.proMemberName && (
              <div className="m-li">
                <span className="m-tile" style={{ background: 'rgba(52,199,89,.14)', color: '#5FD47F' }}><Icon name="racing" size={19} /></span>
                <div><div style={{ fontSize: 14.5, fontWeight: 600 }}>{e.proMemberName}</div><div className="m-mut" style={{ fontSize: 12.5 }}>Race officer</div></div>
              </div>
            )}
            {item.clubName && (
              <div className="m-li">
                <span className="m-tile" style={{ background: 'var(--m-fill)' }}><Icon name="club" size={19} /></span>
                <div><div style={{ fontSize: 14.5, fontWeight: 600 }}>{item.clubName}</div><div className="m-mut" style={{ fontSize: 12.5 }}>Host</div></div>
              </div>
            )}
          </div>
          {docs.length > 0 && (
            <div className="m-card">
              {docs.map(d => (
                <a key={d.url} className="m-li" href={d.url} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>
                  <span className="m-lb" style={{ height: 28, padding: '0 7px', borderRadius: 7, background: '#FF3B30', color: '#fff', display: 'flex', alignItems: 'center' }}>PDF</span>
                  <span style={{ flex: 1, fontWeight: 600, fontSize: 14.5 }}>{d.name}</span>
                  <Icon name="chevron" size={18} className="m-dim" />
                </a>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'entries' && (
        entries.length === 0 ? <div className="m-card m-empty">No entries yet.</div> : (
          <div className="m-card">
            {entries.map((s: any, i: number) => (
              <div key={`${s.sailNo}-${i}`} className="m-li">
                <span className="m-disp m-num" style={{ minWidth: 44, height: 34, borderRadius: 10, background: 'var(--m-fill)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{String(s.sailNo || '').startsWith('ATT-') ? '–' : s.sailNo || '–'}</span>
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 14.5 }}>{s.name}</div><div className="m-dim" style={{ fontSize: 12 }}>{[s.boatModel || s.boatType, s.club].filter(Boolean).join(' · ')}</div></div>
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'results' && <ResultsTable item={item} />}
      {tab === 'media' && <EventMediaTab item={item} session={session} />}
    </div>
  );
};

const ResultsTable: React.FC<{ item: MCalendarItem }> = ({ item }) => {
  const e = item.event;
  const { memberIds } = useMobile();
  const navigate = useNavigate();
  const st = useMemo(() => eventStandings(e), [e]);
  const [open, setOpen] = useState<SheetSkipper | null>(null);
  const seriesLink = item.seriesId ? (
    <button className="m-card" onClick={() => navigate(`/results/series/${item.seriesId}`)} style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left' }}>
      <span className="m-tile" style={{ background: 'rgba(255,210,94,.14)', color: '#FFD25E' }}><Icon name="trophy" size={19} /></span>
      <span style={{ flex: 1, fontSize: 14 }}><b style={{ fontWeight: 600 }}>Series standings</b> <span className="m-mut">{e?.eventName?.split(' - ').slice(1).join(' - ') || 'all rounds'}</span></span>
      <Icon name="chevron" size={18} className="m-dim" />
    </button>
  ) : null;
  if (!st || !st.rows.length) return <>{seriesLink}<div className="m-card m-empty">No results yet.</div></>;
  const standings = st.rows;
  const openRow = (index: number, position: number) => {
    const r = standings.find(x => x.index === index);
    if (r) setOpen({ name: r.name, sailNo: r.sailNo, memberId: r.memberId, position, of: standings.length, standings: st, index, context: item.raceClass, item });
  };
  return (
    <>
      <Podium st={st} onOpen={openRow} />
      <div className="m-card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          <thead>
            <tr style={{ color: 'var(--m-dim)', fontSize: 10.5, letterSpacing: '.06em', textTransform: 'uppercase' }}>
              <th style={{ padding: '9px 8px', textAlign: 'center' }}>#</th>
              <th style={{ padding: '9px 6px', textAlign: 'left', position: 'sticky', left: 0, background: 'var(--m-sheet)' }}>Skipper</th>
              {st.races.map(r => <th key={r} style={{ padding: '9px 6px' }}>R{r}</th>)}
              <th style={{ padding: '9px 10px' }}>Pts</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s, pos) => {
              const me = s.memberId && memberIds.includes(s.memberId);
              return (
                <tr key={s.index} onClick={() => openRow(s.index, pos + 1)} style={{ borderTop: '1px solid var(--m-line)', background: me ? 'rgba(10,132,255,.12)' : undefined, cursor: 'pointer' }}>
                  <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 700 }} className="m-disp">{pos + 1}</td>
                  <td style={{ padding: '10px 6px', fontWeight: me ? 700 : 500, position: 'sticky', left: 0, background: me ? 'linear-gradient(rgba(10,132,255,.12), rgba(10,132,255,.12)), var(--m-sheet)' : 'var(--m-sheet)' }}>
                    {shortName(s.name)} <span className="m-dim" style={{ fontWeight: 400 }}>{s.sailNo}</span>
                  </td>
                  {st.races.map(r => {
                    const dropped = st.isDropped(s.index, r);
                    const v = st.cell(s.index, r);
                    return (
                      <td key={r} style={{ padding: '10px 6px', textAlign: 'center', color: dropped ? 'var(--m-dim)' : undefined }}>
                        {dropped && v ? `(${v})` : v}
                      </td>
                    );
                  })}
                  <td style={{ padding: '10px 10px', textAlign: 'center', fontWeight: 700 }}>{s.netLabel}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="m-dim" style={{ margin: 0, fontSize: 12 }}>Dropped races are in brackets. Tap a skipper for their card.</p>
      {seriesLink}
      <button className="m-card" onClick={() => navigate('/ask-alfie')} style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left' }}>
        <span className="m-av" style={{ width: 30, height: 30, padding: 2, background: 'conic-gradient(from 200deg,#2E7BFF,#8A4DFF,#FF3E9A,#FF8A2B,#2E7BFF)' }}><span style={{ width: '100%', height: '100%', borderRadius: 999, background: '#0B1222' }} /></span>
        <span style={{ flex: 1, fontSize: 14 }}><b style={{ fontWeight: 600 }}>Ask Alfie</b> <span className="m-mut">about this result</span></span>
        <Icon name="chevron" size={18} className="m-dim" />
      </button>
      {open && <SkipperSheet skipper={open} onClose={() => setOpen(null)} />}
    </>
  );
};

async function addToCalendar(item: MCalendarItem) {
  if (!item.event) return;
  const { generateICalFile, downloadICalFile } = await import('../../utils/calendarSync');
  const ics = generateICalFile([item.event], item.clubName || 'AlfiePRO');
  downloadICalFile(ics, `${item.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.ics`);
}

async function share(item: MCalendarItem) {
  const url = `${window.location.origin}/calendar`;
  const text = `${item.title} · ${fmtDay(item.date, { weekday: 'short', day: 'numeric', month: 'short' })}${item.venue ? ` · ${item.venue}` : ''}`;
  try {
    const { isNative } = await import('../../lib/native/platform');
    if (isNative) {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title: item.title, text, url: 'https://app.alfiepro.com.au/calendar' });
      return;
    }
    if (navigator.share) await navigator.share({ title: item.title, text, url });
    else await navigator.clipboard.writeText(`${text}\n${url}`);
  } catch { /* cancelled */ }
}
