import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../utils/supabase';

/* ─────────────────────────────────────────────────────────────────────────────
   /whats-on/answer — opened from a What's On email. No login needed: the link
   carries the member's token. Going / Maybe / Can't make it write the same answer
   as "Will you attend?" in the event modal (whats_on_answer RPC).
   ?t=<token>&e=<event key>&a=yes|no|maybe   answer straight away
   ?t=<token>&e=<event key>                  show the event and let them answer
   ?t=<token>&view=week|prefs|stop           this week / email preferences / stop emails
   ───────────────────────────────────────────────────────────────────────────── */

type Status = 'yes' | 'no' | 'maybe';

interface WOEvent {
  event_key: string;
  kind: 'event' | 'round' | 'meeting';
  title: string;
  event_date: string;
  end_date?: string;
  venue?: string;
  venue_address?: string;
  map_url?: string;
  race_class?: string;
  class_key?: string;
  race_format?: string;
  is_paid?: boolean;
  entry_fee?: number;
  nor_url?: string;
  si_url?: string;
  pro_name?: string;
  start_time?: string;
  going?: number;
  cant?: number;
  my_status?: Status | null;
  going_initials?: string[];
}

interface PageData {
  ok: boolean;
  error?: string;
  club?: { id: string; name: string; abbr: string; logo?: string; color: string; accent: string; email?: string };
  app_url?: string;
  member?: { first_name: string; last_name: string; email: string; activated: boolean; pending: boolean; classes: string[] };
  event?: WOEvent | null;
  event_missing?: boolean;
  week?: WOEvent[];
  rsvp?: boolean;
  prefs?: { enabled: boolean; scope: 'classes' | 'all' };
  schedule?: { enabled: boolean; frequency: string; send_day: number; send_time: string };
  help?: { name: string; first_name?: string; initials: string; title?: string; phone?: string; email?: string } | null;
  needs_entry?: boolean;
  saved?: boolean;
  saved_status?: Status;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const CLASS_COLORS: Record<string, string> = { iom: '#2E7BFF', df95: '#8A4DFF', df65: '#FF8A2B', '10r': '#30D158', marblehead: '#FF3E9A', aclass: '#0A84FF', rclaser: '#FFB340' };
const AV_COLORS = ['#2E7BFF', '#8A4DFF', '#FF8A2B', '#30A46C', '#FF3E9A', '#0A84FF'];

const parseDate = (s: string) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const fmtLong = (s: string) => parseDate(s).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
const ymd = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
const money = (n?: number) => (n == null ? '' : Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`);
const fmtTime = (t?: string) => { if (!t) return ''; const [h, m] = t.split(':').map(Number); return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`; };

const calendarLinks = (e: WOEvent, clubName: string) => {
  const start = parseDate(e.event_date);
  const end = new Date(parseDate(e.end_date || e.event_date).getTime() + 86400000);
  const location = [e.venue, e.venue_address].filter(Boolean).join(', ');
  const details = [`${clubName}`, e.pro_name ? `PRO: ${e.pro_name}` : '', e.start_time ? `First start ${e.start_time}` : ''].filter(Boolean).join('\n');
  const google = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(e.title)}&dates=${ymd(start)}/${ymd(end)}&location=${encodeURIComponent(location)}&details=${encodeURIComponent(details)}`;
  const esc = (s: string) => s.replace(/[\\;,]/g, m => `\\${m}`).replace(/\n/g, '\\n');
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AlfiePRO//Whats On//EN', 'BEGIN:VEVENT',
    `UID:${e.event_key.replace(/[^A-Za-z0-9]/g, '')}@alfiepro.com.au`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}`,
    `DTSTART;VALUE=DATE:${ymd(start)}`, `DTEND;VALUE=DATE:${ymd(end)}`,
    `SUMMARY:${esc(e.title)}`, location ? `LOCATION:${esc(location)}` : '', `DESCRIPTION:${esc(details)}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
  return { google, ics: `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}` };
};

const Tick: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);

const Badge: React.FC<{ date: string; rim?: boolean; small?: boolean }> = ({ date, rim, small }) => {
  const d = parseDate(date);
  return (
    <span className={`woa-dt ${rim ? 'woa-dt-rim' : ''} ${small ? 'woa-dt-sm' : ''}`}>
      <span>{d.toLocaleDateString('en-AU', { weekday: 'short' }).toUpperCase()}</span>
      <b>{d.getDate()}</b>
      {!small && <span>{d.toLocaleDateString('en-AU', { month: 'short' }).toUpperCase()}</span>}
    </span>
  );
};

const AnswerSeg: React.FC<{ value?: Status | null; onPick: (s: Status) => void; busy?: boolean; short?: boolean }> = ({ value, onPick, busy, short }) => (
  <div className="woa-seg" role="radiogroup" aria-label="Your answer">
    {([['yes', 'Going'], ['maybe', 'Maybe'], ['no', short ? "Can't" : "Can't make it"]] as [Status, string][]).map(([v, label]) => (
      <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? 'woa-on' : ''} disabled={busy} onClick={() => onPick(v)}>
        {value === v && v === 'yes' && <span style={{ color: '#136C34' }}><Tick /></span>}{label}
      </button>
    ))}
  </div>
);

const WhatsOnAnswerPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const token = params.get('t') || '';
  const eventKey = params.get('e');
  const answer = params.get('a') as Status | null;
  const view = params.get('view');
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [stopped, setStopped] = useState(false);
  const [rowNote, setRowNote] = useState<Record<string, string>>({});
  const ran = useRef(false);

  const load = useCallback(async () => {
    if (!token) { setData({ ok: false, error: 'invalid_link' }); setLoading(false); return; }
    if (eventKey && answer && ['yes', 'no', 'maybe'].includes(answer)) {
      const { data: r, error } = await supabase.rpc('whats_on_answer', { p_token: token, p_event_key: eventKey, p_status: answer });
      setData(error ? { ok: false, error: 'unavailable' } : (r as PageData));
      // Drop the answer from the address so a refresh or a link checker doesn't answer again
      const next = new URLSearchParams(params); next.delete('a'); setParams(next, { replace: true });
    } else {
      const { data: r, error } = await supabase.rpc('whats_on_page', { p_token: token, p_event_key: eventKey });
      setData(error ? { ok: false, error: 'unavailable' } : (r as PageData));
    }
    if (view === 'stop') {
      const { error } = await supabase.rpc('whats_on_set_prefs', { p_token: token, p_enabled: false, p_scope: null });
      if (!error) { setStopped(true); setData(d => (d && d.prefs ? { ...d, prefs: { ...d.prefs, enabled: false } } : d)); }
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    load();
  }, [load]);

  useEffect(() => {
    if (!loading && view === 'prefs') document.getElementById('woa-prefs')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [loading, view]);

  const answerEvent = async (key: string, s: Status, isMain: boolean) => {
    setBusy(key);
    const { data: r, error } = await supabase.rpc('whats_on_answer', { p_token: token, p_event_key: key, p_status: s });
    setBusy(null);
    if (error || !r) return;
    const res = r as PageData;
    if (isMain) {
      setData(res);
    } else {
      // Answering one of the other events: keep the main event on screen, update that row
      setData(d => d ? {
        ...d,
        week: (d.week || []).map(w => w.event_key === key ? { ...w, my_status: res.needs_entry ? w.my_status : s } : w),
      } : d);
      setRowNote(n => ({ ...n, [key]: res.needs_entry ? `Entry fee ${money(res.event?.entry_fee)}: enter in AlfiePRO to confirm` : '' }));
    }
  };

  const setPrefs = async (enabled: boolean | null, scope: 'classes' | 'all' | null) => {
    const { data: r, error } = await supabase.rpc('whats_on_set_prefs', { p_token: token, p_enabled: enabled, p_scope: scope });
    if (!error && (r as any)?.prefs) {
      setData(d => d ? { ...d, prefs: (r as any).prefs } : d);
      if (enabled === true) setStopped(false);
    }
  };

  const club = data?.club;
  const color = club?.color || '#0B2A5B';
  const accent = club?.accent || '#0A84FF';
  const app = data?.app_url || 'https://app.alfiepro.com.au';
  const m = data?.member;
  const ev = data?.event || null;
  const status = (ev?.my_status as Status | null) || null;

  const head = (() => {
    if (!ev) return null;
    if (data?.needs_entry) return { tone: 'amber', icon: '$', title: 'This one has an entry fee', text: `${money(ev.entry_fee)} entry. Enter and pay in AlfiePRO to confirm your place, just like entering from the event.` };
    if (status === 'yes') return { tone: 'green', icon: 'tick', title: `You're going, ${m?.first_name}`, text: `You're on the list for this event, so ${ev.pro_name || 'the PRO'} can plan the starts.` };
    if (status === 'no') return { tone: 'orange', icon: '✕', title: 'Thanks for letting us know', text: `You're marked as can't make it for ${ev.title} on ${fmtLong(ev.event_date)}${ev.pro_name ? `, so ${ev.pro_name} knows when planning the starts` : ''}.` };
    if (status === 'maybe') return { tone: 'blue', icon: '?', title: `You're down as maybe, ${m?.first_name}`, text: 'Change it to Going or Can\'t make it once you know.' };
    return { tone: 'none', icon: '', title: `Are you going, ${m?.first_name}?`, text: 'Let the PRO know so they can plan the starts.' };
  })();

  const loginPanel = m && (
    <section className="woa-panel">
      <p className="woa-cap" style={{ color: 'rgba(235,240,255,0.6)' }}>{m.activated ? "You're on AlfiePRO" : 'Your club runs on AlfiePRO'}</p>
      <h3 className="woa-disp">{m.activated ? 'Entries, results and your boats' : "See who's going, results and your boats in one place"}</h3>
      {m.activated ? (
        <>
          <p>See who's going, change your answers and check results any time.</p>
          <a className="woa-wbtn" href={`${app}/login`}>Log in to AlfiePRO</a>
          <a className="woa-plink" href={`${app}/forgot-password?email=${encodeURIComponent(m.email)}`}>Forgot your password?</a>
        </>
      ) : (
        <>
          <p>{m.pending ? "Your login is ready. Set a password and you're in." : 'Your login is ready. It takes two minutes, with no app to download.'}</p>
          <a className="woa-wbtn" href={m.pending ? `${app}/forgot-password?email=${encodeURIComponent(m.email)}` : `${app}/register?email=${encodeURIComponent(m.email)}`}>
            {m.pending ? 'Set my password' : 'Activate my login'}
          </a>
          <p className="woa-small">Use {m.email}</p>
        </>
      )}
      {data?.help && (
        <div className="woa-help">
          <span className="woa-av" style={{ background: '#8A4DFF', width: 36, height: 36, fontSize: 12.5 }}>{data.help.initials}</span>
          <div>
            {m.activated ? 'Trouble logging in? ' : 'Need a hand? '}<b>{data.help.name}</b>{data.help.title ? `, ${data.help.title}` : ''}
            {(data.help.phone || data.help.email) && <br />}
            {data.help.phone && <a href={`tel:${data.help.phone.replace(/[^0-9+]/g, '')}`}>{data.help.phone}</a>}
            {data.help.phone && data.help.email && ' · '}
            {data.help.email && <a href={`mailto:${data.help.email}`}>{data.help.email}</a>}
          </div>
        </div>
      )}
    </section>
  );

  const scheduleLabel = data?.schedule ? (() => {
    const day = DAY_NAMES[Number(data.schedule.send_day)] || 'Monday';
    const when = data.schedule.frequency === 'monthly' ? `First ${day} of the month` : data.schedule.frequency === 'fortnightly' ? `Every second ${day}` : `${day}s`;
    return `${when} · ${fmtTime(data.schedule.send_time)}`;
  })() : '';

  const prefsCard = data?.prefs && (
    <section className="woa-box woa-prefs" id="woa-prefs">
      <h3 className="woa-disp">Email preferences</h3>
      <div className="woa-prow">
        <div><b>What's On emails</b><small>{data.prefs.enabled ? scheduleLabel : 'Off'}</small></div>
        <button type="button" role="switch" aria-checked={data.prefs.enabled} aria-label="What's On emails" className="woa-sw" onClick={() => setPrefs(!data.prefs!.enabled, null)} />
      </div>
      {data.prefs.enabled && (
        <div className="woa-seg woa-seg-sm" role="radiogroup" aria-label="Which events">
          <button type="button" role="radio" aria-checked={data.prefs.scope === 'classes'} className={data.prefs.scope === 'classes' ? 'woa-on' : ''} onClick={() => setPrefs(null, 'classes')}>My classes</button>
          <button type="button" role="radio" aria-checked={data.prefs.scope === 'all'} className={data.prefs.scope === 'all' ? 'woa-on' : ''} onClick={() => setPrefs(null, 'all')}>All racing</button>
        </div>
      )}
      <p className="woa-small" style={{ color: '#64748B', marginTop: 10 }}>
        {data.prefs.scope === 'all' ? 'You get every race at the club.' : `You get racing for ${m?.classes?.length ? m.classes.join(', ') : 'the boats in your profile'}.`}
      </p>
    </section>
  );

  const weekList = (items: WOEvent[], title: string) => items.length > 0 && (
    <section className="woa-box woa-week">
      <p className="woa-cap">{title}</p>
      {items.map(w => (
        <div key={w.event_key} className="woa-wrow">
          <Badge date={w.event_date} small />
          <div className="woa-wrow-b">
            <b>{w.title}</b>
            <small>{[w.venue, w.pro_name ? `PRO ${w.pro_name}` : '', w.is_paid ? `Entry ${money(w.entry_fee)}` : ''].filter(Boolean).join(' · ')}</small>
            {w.kind !== 'meeting' && data?.rsvp !== false && (
              <div className="woa-wrow-a">
                <AnswerSeg short value={w.my_status} busy={busy === w.event_key} onPick={s => answerEvent(w.event_key, s, false)} />
              </div>
            )}
            {rowNote[w.event_key] && <small style={{ color: '#8A5300' }}>{rowNote[w.event_key]}</small>}
          </div>
        </div>
      ))}
    </section>
  );

  return (
    <div className="woa">
      <style>{CSS}</style>
      <header className="woa-head" style={{ background: color }}>
        <span className="woa-logo">{club?.logo ? <img src={club.logo} alt="" /> : <b style={{ color }}>{(club?.abbr || '').slice(0, 6)}</b>}</span>
        <span className="woa-club">{club?.name || 'What\'s On'}</span>
        {m && <span className="woa-as">Answering as {m.first_name} {m.last_name}</span>}
      </header>

      <main className="woa-main">
        {loading ? (
          <div className="woa-box woa-pad woa-muted">Loading…</div>
        ) : !data?.ok && !data?.club ? (
          <div className="woa-box woa-pad">
            <h1 className="woa-disp woa-h1">{data?.error === 'unavailable' ? 'Something went wrong' : 'This link has expired'}</h1>
            <p className="woa-muted">{data?.error === 'unavailable'
              ? 'We couldn\'t record your answer just now. Please try the link again in a minute, or answer in AlfiePRO.'
              : 'Open the most recent What\'s On email from your club and try again, or answer in AlfiePRO.'}</p>
            <a className="woa-btn" href="/login" style={{ marginTop: 16 }}>Log in to AlfiePRO</a>
          </div>
        ) : (
          <div className="woa-grid">
            <div className="woa-col">
              {stopped && (
                <div className="woa-box woa-pad woa-note">
                  <b>You won't get What's On emails from {club?.abbr} any more.</b>
                  <span>Other club emails, like renewals, still arrive.</span>
                  <button type="button" className="woa-btn" onClick={() => setPrefs(true, null)}>Turn them back on</button>
                </div>
              )}

              {ev && head ? (
                <section className="woa-box woa-main-card">
                  <div className="woa-res">
                    {head.icon && (
                      <span className={`woa-res-ic woa-res-${head.tone}`}>{head.icon === 'tick' ? <Tick size={22} /> : head.icon}</span>
                    )}
                    <div>
                      <h1 className="woa-disp woa-h1">{head.title}</h1>
                      <p className="woa-muted">{head.text}</p>
                    </div>
                  </div>

                  <div className="woa-ev">
                    <Badge date={ev.event_date} rim />
                    <div className="woa-ev-b">
                      <div className="woa-lbls">
                        {ev.race_class && <span className="woa-lb"><i style={{ background: CLASS_COLORS[ev.class_key || ''] || '#64748B' }} />{ev.race_class}</span>}
                        {ev.race_format && <span className="woa-fmt"><i style={{ background: /handicap/i.test(ev.race_format) ? '#FFB340' : /scratch/i.test(ev.race_format) ? '#30D158' : '#8A4DFF' }} />{ev.race_format.charAt(0).toUpperCase() + ev.race_format.slice(1)}</span>}
                        {ev.is_paid && <span className="woa-fmt woa-fee">Entry {money(ev.entry_fee)}</span>}
                      </div>
                      <h2 className="woa-disp">{ev.title}</h2>
                      {ev.venue && <div className="woa-meta">{ev.venue}{ev.venue_address && ev.venue_address !== ev.venue ? `, ${ev.venue_address}` : ''}</div>}
                      {ev.start_time && <div className="woa-meta">First start {ev.start_time}</div>}
                      {ev.pro_name && <div className="woa-meta"><span className="woa-pro">PRO</span>{ev.pro_name}</div>}
                      {(ev.nor_url || ev.si_url) && (
                        <div className="woa-meta">
                          {ev.nor_url && <a href={ev.nor_url} target="_blank" rel="noopener noreferrer">Notice of Race</a>}
                          {ev.nor_url && ev.si_url && ' · '}
                          {ev.si_url && <a href={ev.si_url} target="_blank" rel="noopener noreferrer">Sailing Instructions</a>}
                        </div>
                      )}
                    </div>
                  </div>

                  {(ev.going || 0) + (ev.cant || 0) > 0 && (
                    <div className="woa-who">
                      <span className="woa-avs">
                        {(ev.going_initials || []).slice(0, 4).map((i, n) => <span key={n} className="woa-av" style={{ background: AV_COLORS[n % AV_COLORS.length] }}>{i}</span>)}
                        {(ev.going || 0) > 4 && <span className="woa-av" style={{ background: '#0B1220' }}>+{(ev.going || 0) - 4}</span>}
                      </span>
                      <span><b>{ev.going || 0} going</b>{status === 'yes' ? ' including you' : ''}{(ev.cant || 0) > 0 ? ` · ${ev.cant} can't make it` : ''}</span>
                    </div>
                  )}

                  {data.rsvp !== false && (
                    <>
                      <p className="woa-cap" style={{ marginTop: 18 }}>{status ? 'Change your answer' : 'Your answer'}</p>
                      <AnswerSeg value={data.needs_entry ? null : status} busy={busy === ev.event_key} onPick={s => answerEvent(ev.event_key, s, true)} />
                    </>
                  )}

                  <div className="woa-acts">
                    {data.needs_entry && m && (
                      <a className="woa-btn woa-btn-p" style={{ background: accent }} href={m.activated ? `${app}/login` : m.pending ? `${app}/forgot-password?email=${encodeURIComponent(m.email)}` : `${app}/register?email=${encodeURIComponent(m.email)}`}>
                        {m.activated ? 'Log in to enter' : 'Activate my login to enter'}
                      </a>
                    )}
                    {(() => { const c = calendarLinks(ev, club?.name || ''); return (<>
                      <a className="woa-btn" href={c.google} target="_blank" rel="noopener noreferrer">Add to Google Calendar</a>
                      <a className="woa-btn" href={c.ics} download={`${ev.title.replace(/[^A-Za-z0-9 ]/g, '').trim() || 'event'}.ics`}>Apple / Outlook (.ics)</a>
                    </>); })()}
                    {ev.map_url && <a className="woa-btn" href={ev.map_url} target="_blank" rel="noopener noreferrer">Directions</a>}
                  </div>
                </section>
              ) : (
                <section className="woa-box woa-pad">
                  <h1 className="woa-disp woa-h1">{data.event_missing ? 'This event has finished or moved' : `What's on for you, ${m?.first_name}`}</h1>
                  <p className="woa-muted">{data.event_missing ? 'Here is what is coming up at the club for your boats.' : `Racing at ${club?.name} for ${m?.classes?.length && data.prefs?.scope !== 'all' ? `your ${m.classes.join(', ')}` : 'you'} in the coming week.`}</p>
                  {(data.week || []).length === 0 && <p className="woa-muted" style={{ marginTop: 12 }}>Nothing on the calendar for your boats just now.</p>}
                </section>
              )}

              {weekList(data.week || [], ev ? 'Still on this week' : 'Coming up')}
            </div>

            <aside className="woa-col">
              {loginPanel}
              {prefsCard}
            </aside>
          </div>
        )}
      </main>
      <footer className="woa-foot"><span className="woa-dot" />Sent with AlfiePRO</footer>
    </div>
  );
};

const CSS = `
.woa{min-height:100vh;background:#F4F6FA;color:#0B1220;font-family:'Instrument Sans',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
.woa *{box-sizing:border-box}
.woa a{color:#0A64D8;text-decoration:none}
.woa a:hover{text-decoration:underline}
.woa-disp{font-family:'Bricolage Grotesque','Instrument Sans',system-ui,sans-serif;letter-spacing:-0.025em}
.woa-cap{margin:0;font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#64748B}
.woa-muted{color:#475569;font-size:14.5px;line-height:1.5;margin:6px 0 0}
.woa-small{font-size:12.5px;margin:10px 0 0}
.woa-head{display:flex;align-items:center;gap:12px;padding:14px 28px;color:#fff}
.woa-logo{width:36px;height:36px;border-radius:10px;background:#fff;display:inline-flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0}
.woa-logo img{width:30px;height:30px;object-fit:contain}
.woa-logo b{font-size:8px;letter-spacing:0.04em}
.woa-club{flex:1;min-width:0;font-weight:600;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.woa-as{font-size:12.5px;color:rgba(255,255,255,0.72);white-space:nowrap}
.woa-main{max-width:1040px;margin:0 auto;padding:28px 20px 40px}
.woa-grid{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:20px;align-items:start}
.woa-col{display:flex;flex-direction:column;gap:16px;min-width:0}
.woa-box{background:#fff;border:1px solid #E3E8F0;border-radius:18px}
.woa-pad{padding:24px}
.woa-main-card{padding:26px}
.woa-h1{margin:0;font-size:26px;font-weight:700;line-height:1.15}
.woa-res{display:flex;align-items:flex-start;gap:14px;margin-bottom:20px}
.woa-res-ic{width:44px;height:44px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:700;font-size:18px}
.woa-res-green{background:#EAF8EF;color:#136C34}
.woa-res-orange{background:#FFF1E6;color:#C2410C}
.woa-res-blue{background:#EAF3FF;color:#0A5CC2}
.woa-res-amber{background:#FFF4E5;color:#8A5300}
.woa-ev{display:flex;gap:16px;padding:16px;border-radius:16px;background:#F6F8FB}
.woa-ev-b{flex:1;min-width:0}
.woa-ev h2{margin:6px 0 6px;font-size:19px;font-weight:600;line-height:1.25}
.woa-dt{width:60px;height:68px;flex-shrink:0;border-radius:14px;border:1px solid #E3E8F0;background:#fff;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;font-size:10.5px;font-weight:600;letter-spacing:0.08em;color:#64748B;line-height:1.25}
.woa-dt b{font-family:'Bricolage Grotesque',system-ui,sans-serif;font-size:24px;font-weight:700;color:#0B1220;letter-spacing:-0.02em}
.woa-dt-rim{border:1.5px solid transparent;background:linear-gradient(#fff,#fff) padding-box,linear-gradient(135deg,#2E7BFF 0%,#8A4DFF 38%,#FF3E9A 70%,#FF8A2B 100%) border-box}
.woa-dt-sm{width:44px;height:48px;font-size:9.5px;border-radius:12px;background:#F6F8FB}
.woa-dt-sm b{font-size:18px}
.woa-lbls{display:flex;flex-wrap:wrap;gap:6px}
.woa-lb{display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 8px;border-radius:7px;border:1px solid #D9E0EA;background:#fff;font-size:11px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;color:#1E293B}
.woa-lb i,.woa-fmt i{display:inline-block;width:7px;height:7px;border-radius:2px}
.woa-fmt i{border-radius:999px}
.woa-fmt{display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 9px 0 8px;border-radius:999px;background:#EDF1F6;font-size:11.5px;font-weight:500;color:#334155}
.woa-fee{background:#FFF4E5;color:#8A5300;font-weight:600}
.woa-meta{display:flex;align-items:center;flex-wrap:wrap;gap:8px;font-size:13.5px;color:#475569;margin-top:4px}
.woa-pro{display:inline-flex;align-items:center;height:18px;padding:0 6px;border-radius:5px;background:#0B1220;color:#fff;font-size:10px;font-weight:700;letter-spacing:0.06em}
.woa-who{display:flex;align-items:center;gap:10px;margin-top:16px;font-size:14px;color:#475569}
.woa-who b{color:#0B1220}
.woa-avs{display:inline-flex}
.woa-av{width:28px;height:28px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;font:600 10.5px 'Bricolage Grotesque',sans-serif;color:#fff;box-shadow:0 0 0 2px #fff;flex-shrink:0}
.woa-avs .woa-av + .woa-av{margin-left:-6px}
.woa-seg{display:flex;gap:2px;padding:3px;border-radius:12px;background:#E9EDF3;margin-top:8px}
.woa-seg button{flex:1;height:38px;border:0;border-radius:9px;background:transparent;color:#475569;font:600 13.5px 'Instrument Sans',system-ui,sans-serif;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap;padding:0 8px}
.woa-seg button:disabled{opacity:.6;cursor:progress}
.woa-seg .woa-on{background:#fff;color:#0B1220;box-shadow:0 1px 2px rgba(15,23,42,0.12),0 2px 8px rgba(15,23,42,0.06)}
.woa-seg-sm button{height:32px;font-size:12.5px}
.woa-acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}
.woa-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:40px;padding:0 14px;border-radius:12px;border:1px solid #D3DAE5;background:#fff;color:#0B1220 !important;font:600 13.5px 'Instrument Sans',system-ui,sans-serif;cursor:pointer;text-decoration:none !important;white-space:nowrap}
.woa-btn:hover{background:#F6F8FB}
.woa-btn-p{border-color:transparent;color:#fff !important}
.woa-btn-p:hover{filter:brightness(1.06);background:inherit}
.woa-note{display:flex;flex-direction:column;align-items:flex-start;gap:8px;font-size:14px;color:#334155}
.woa-week{padding:16px 18px}
.woa-wrow{display:flex;gap:12px;padding:12px 0}
.woa-wrow + .woa-wrow{border-top:1px solid #EEF2F7}
.woa-cap + .woa-wrow{padding-top:12px}
.woa-wrow-b{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.woa-wrow-b b{font-size:14.5px}
.woa-wrow-b small{font-size:12.5px;color:#64748B}
.woa-wrow-a{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:6px}
.woa-wrow-a .woa-seg{margin-top:0;flex:1;min-width:220px;max-width:340px}
.woa-wrow-a .woa-seg button{height:32px;font-size:12.5px}
.woa-panel{border-radius:18px;padding:22px;border:1.5px solid transparent;background:linear-gradient(#0D1424,#0D1424) padding-box,linear-gradient(135deg,#2E7BFF 0%,#8A4DFF 38%,#FF3E9A 70%,#FF8A2B 100%) border-box;color:#fff}
.woa-panel h3{margin:6px 0 0;font-size:20px;font-weight:600;line-height:1.2}
.woa-panel p{color:rgba(235,240,255,0.78);font-size:14px;line-height:1.5;margin:10px 0 16px}
.woa-panel .woa-cap{font-size:11px;line-height:1.4;margin:0}
.woa-panel .woa-small{color:rgba(235,240,255,0.55);margin:10px 0 0}
.woa-wbtn{display:flex;align-items:center;justify-content:center;height:42px;border-radius:12px;background:#fff;color:#0B1220 !important;font-weight:600;font-size:14px;text-decoration:none !important}
.woa-plink{display:block;margin-top:12px;text-align:center;color:#A9D4FF !important;font-size:13.5px;font-weight:600}
.woa-help{display:flex;align-items:center;gap:12px;margin-top:18px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.1);font-size:13px;line-height:1.45;color:rgba(235,240,255,0.78)}
.woa-help b{color:#fff}
.woa-help a{color:#A9D4FF !important}
.woa-prefs{padding:18px}
.woa-prefs h3{margin:0 0 12px;font-size:17px;font-weight:600}
.woa-prow{display:flex;align-items:center;gap:12px}
.woa-prow > div{flex:1;display:flex;flex-direction:column}
.woa-prow b{font-size:14px}
.woa-prow small{font-size:12.5px;color:#64748B}
.woa-sw{position:relative;width:46px;height:28px;flex-shrink:0;border:0;padding:0;border-radius:999px;background:#CBD5E1;cursor:pointer;transition:background .15s}
.woa-sw::after{content:'';position:absolute;top:2px;left:2px;width:24px;height:24px;border-radius:999px;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,0.25);transition:left .15s}
.woa-sw[aria-checked="true"]{background:#30D158}
.woa-sw[aria-checked="true"]::after{left:20px}
.woa-foot{display:flex;align-items:center;justify-content:center;gap:6px;padding:0 0 28px;font-size:12px;color:#94A3B8}
.woa-dot{width:10px;height:10px;border-radius:999px;background:linear-gradient(135deg,#2E7BFF 0%,#8A4DFF 38%,#FF3E9A 70%,#FF8A2B 100%)}
@media (max-width:820px){.woa-grid{grid-template-columns:minmax(0,1fr)}.woa-head{padding:14px 18px}.woa-as{display:none}.woa-main{padding:18px 14px 32px}.woa-main-card{padding:20px}.woa-h1{font-size:23px}}
`;

export default WhatsOnAnswerPage;
