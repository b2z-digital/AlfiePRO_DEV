import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, Clock, Loader2, Mail, Sparkles, Trophy, UserPlus, Repeat, IdCard, RotateCcw, CalendarCheck, Newspaper } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { LIBRARY } from '../../lib/emailStudio/library';
import { useStudio } from './studioData';
import { audienceCount, fmtDate, fmtTime, homeData, pct, type HomeData } from './api';
import { Thumb } from './ui';
import { useNewCampaign } from './EmailStudio';

const RECIPE_ICONS: Record<string, React.ReactNode> = {
  weekly: <Repeat size={17} />, results: <Trophy size={17} />, entries: <CalendarCheck size={17} />, welcome: <UserPlus size={17} />,
  renewal: <IdCard size={17} />, wrap: <Sparkles size={17} />, letter: <Mail size={17} />, host: <CalendarClock size={17} />, agm: <Newspaper size={17} />,
};
const RECIPE_TONES: Record<string, string> = { weekly: 'b', results: 'v', entries: 'g', welcome: 'g', renewal: 'o', wrap: 'p', letter: '', host: 'v', agm: '' };

export const toneStyle = (t: string): React.CSSProperties => ({
  b: { background: 'rgba(10,132,255,.14)', boxShadow: 'inset 0 0 0 1px rgba(77,163,255,.32)', color: '#8CC4FF' },
  v: { background: 'rgba(138,77,255,.14)', boxShadow: 'inset 0 0 0 1px rgba(160,110,255,.35)', color: '#C4A6FF' },
  o: { background: 'rgba(255,159,61,.12)', boxShadow: 'inset 0 0 0 1px rgba(255,159,61,.3)', color: '#FFB861' },
  g: { background: 'rgba(48,209,88,.12)', boxShadow: 'inset 0 0 0 1px rgba(48,209,88,.28)', color: '#6BE38C' },
  p: { background: 'rgba(255,62,154,.12)', boxShadow: 'inset 0 0 0 1px rgba(255,62,154,.3)', color: '#FF8CC2' },
}[t] || {});

interface WhatsOn { enabled: boolean; send_day: number; send_time: string; frequency: string }
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function nextWhatsOn(w: WhatsOn | null): Date | null {
  if (!w?.enabled) return null;
  const [h, m] = String(w.send_time || '08:00').split(':').map(Number);
  const d = new Date();
  for (let i = 0; i < 8; i++) {
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i, h || 0, m || 0);
    if (t.getDay() === Number(w.send_day) && t.getTime() > Date.now()) return t;
  }
  return null;
}

const delta = (now: number, prev: number) => {
  if (!prev) return null;
  const d = now - prev;
  return d === 0 ? null : d;
};

export const StudioHome: React.FC<{ onNew: () => void }> = ({ onNew }) => {
  const s = useStudio();
  const navigate = useNavigate();
  const { start, busy } = useNewCampaign();
  const [data, setData] = useState<HomeData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [wo, setWo] = useState<WhatsOn | null>(null);
  const [notSignedIn, setNotSignedIn] = useState<number | null>(null);

  useEffect(() => {
    let off = false;
    homeData(s.clubId).then(d => !off && setData(d)).catch(e => !off && setErr(e.message));
    if (s.kind === 'club') supabase.rpc('whats_on_settings_get', { p_club: s.clubId }).then(({ data: d }) => { if (!off && d) setWo((d as { settings: WhatsOn }).settings); });
    audienceCount(s.clubId, { include: [{ kind: 'builtin', key: 'not_signed_in' }], exclude: [] }).then(r => !off && setNotSignedIn(r.count)).catch(() => null);
    return () => { off = true; };
  }, [s.clubId]);

  const n = data?.now;
  const p = data?.prev;
  const openRate = n ? pct(n.opened, n.sent) : 0;
  const clickRate = n ? pct(n.clicked, n.sent) : 0;
  const prevOpen = p ? pct(p.opened, p.sent) : 0;
  const prevClick = p ? pct(p.clicked, p.sent) : 0;
  const woNext = nextWhatsOn(wo);
  const woSent30 = (data?.whats_on || []).filter(w => Date.now() - new Date(w.at).getTime() < 30 * 86400000).reduce((a, w) => a + (w.recipients || 0), 0);

  const upcoming = useMemo(() => {
    const items: { key: string; at: Date; title: string; sub: string; pill?: React.ReactNode; to?: string }[] = (data?.upcoming || []).map(u => ({
      key: u.id, at: new Date(u.at), title: u.name, sub: `${fmtTime(u.at)} · ${u.status === 'sending' ? 'sending now' : 'scheduled'}`,
      pill: <span className="es-pill es-auto">Campaign</span>, to: `/email-studio/campaigns/${u.id}`,
    }));
    if (woNext) items.push({ key: 'wo', at: woNext, title: 'What’s On', sub: `${fmtTime(woNext.toISOString())} · ${wo?.frequency === 'weekly' ? 'every week' : wo?.frequency}`, pill: <span className="es-pill es-v">Automatic</span>, to: '/email-studio/flows' });
    return items.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, 5);
  }, [data, woNext, wo]);

  const recent = useMemo(() => {
    const rows = (data?.recent || []).map(r => ({ key: r.id, at: r.at, name: r.name, kind: 'Campaign', sent: r.sent, open: pct(r.opened, r.sent), click: pct(r.clicked, r.sent), app: r.app, to: `/email-studio/campaigns/${r.id}/report` }));
    for (const w of data?.whats_on || []) rows.push({ key: `wo-${w.at}`, at: w.at, name: `What’s On · ${fmtDate(w.at, { day: 'numeric', month: 'long' })}`, kind: 'What’s On', sent: w.recipients, open: -1, click: -1, app: -1, to: '/email-studio/flows' });
    return rows.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 6);
  }, [data]);

  return (
    <>
      <section className="es-kpis" aria-label="Last 30 days">
        <div className="a-card es-kpi"><p className="a-cap m-0">Emails delivered</p><div className="v es-num">{n ? (n.sent + woSent30).toLocaleString() : '–'}</div><div className="d">Last 30 days{woSent30 ? ` · ${woSent30} were What’s On` : ''}</div></div>
        <div className="a-card es-kpi"><p className="a-cap m-0">Opened</p><div className="v es-num">{n?.sent ? `${openRate}%` : '–'}</div><div className="d">{n?.sent ? (delta(openRate, prevOpen) != null ? <><span className={openRate >= prevOpen ? 'es-up' : 'es-down'}>{openRate >= prevOpen ? '↑' : '↓'} {Math.abs(openRate - prevOpen)}%</span> vs the month before</> : 'Of campaign emails') : 'Shows once you send a campaign'}</div></div>
        <div className="a-card es-kpi"><p className="a-cap m-0">Clicked</p><div className="v es-num">{n?.sent ? `${clickRate}%` : '–'}</div><div className="d">{n?.sent ? (delta(clickRate, prevClick) != null ? <><span className={clickRate >= prevClick ? 'es-up' : 'es-down'}>{clickRate >= prevClick ? '↑' : '↓'} {Math.abs(clickRate - prevClick)}%</span> vs the month before</> : 'Of campaign emails') : 'Shows once you send a campaign'}</div></div>
        <div className="a-card es-kpi hero"><p className="a-cap m-0">Back in AlfiePRO</p><div className="v es-num">{n ? n.app : '–'}</div><div className="d">People who followed an email into AlfiePRO</div></div>
      </section>

      {err && <div className="a-card es-empty">Couldn’t load your numbers: {err}</div>}

      <div className="es-insight">
        <span className="a-tile" style={toneStyle('v')}><Sparkles size={17} /></span>
        {data && data.counts.sent === 0 ? (
          <>
            <div className="tx"><b>Send your first campaign.</b> The Weekly club update fills itself with your latest results, upcoming events and club news, in your club’s colours.</div>
            <button className="a-btn a-btn-sm" disabled={busy} onClick={() => { const t = LIBRARY[0]; start({ name: t.name, subject: t.subject, doc: t.doc(), topic: t.topic, previewText: t.preview }); }}>{busy && <Loader2 size={14} className="es-spin" />}Start a weekly update</button>
          </>
        ) : notSignedIn ? (
          <>
            <div className="tx"><b>{notSignedIn} member{notSignedIn === 1 ? ' hasn’t' : 's haven’t'} signed in to AlfiePRO yet.</b> Send them the Welcome email: it shows their first race day and how to get set up.</div>
            <button className="a-btn a-btn-sm" disabled={busy} onClick={() => { const t = LIBRARY.find(l => l.key === 'welcome')!; start({ name: 'Get set up on AlfiePRO', subject: t.subject, doc: t.doc(), topic: t.topic, previewText: t.preview }); }}>{busy && <Loader2 size={14} className="es-spin" />}Write it</button>
          </>
        ) : (
          <div className="tx"><b>Tip:</b> club content blocks (results, events, news, classifieds) fill themselves in when the email sends, and every link brings members back into AlfiePRO.</div>
        )}
      </div>

      <div className="es-split">
        <section className="a-card" aria-label="Recent sends">
          <div className="es-ch">
            <span className="a-tile"><Mail size={17} /></span>
            <div><h3 className="a-display">Recent sends</h3><div className="sub">Campaigns and automatic emails</div></div>
            <div className="r"><button className="es-link" onClick={() => navigate('/email-studio/campaigns')}>All campaigns</button></div>
          </div>
          {!data ? <div className="es-empty"><Loader2 size={18} className="es-spin" /></div> : recent.length === 0 ? (
            <div className="es-empty">Nothing sent yet. <button className="es-link" onClick={onNew}>Start your first campaign</button></div>
          ) : (
            <div className="es-rows">
              <div className="es-row h"><span /><span>Email</span><span className="es-rn">Sent to</span><span className="es-rn">Opened</span><span className="es-rn">Clicked</span><span>In AlfiePRO</span></div>
              {recent.map(r => (
                <button key={r.key} className="es-row" onClick={() => navigate(r.to)}>
                  <Thumb seed={r.name} />
                  <div style={{ minWidth: 0 }}><div className="es-nm">{r.name}</div><div className="es-ed"><span className={`es-pill ${r.kind === 'Campaign' ? '' : 'es-v'}`}>{r.kind}</span>{fmtDate(r.at)}, {fmtTime(r.at)}</div></div>
                  <span className="es-rn">{r.sent}</span>
                  <span className="es-rn">{r.open < 0 ? '–' : `${r.open}%`}</span>
                  <span className="es-rn">{r.click < 0 ? '–' : `${r.click}%`}</span>
                  <span className="es-bar">{r.app < 0 ? <span className="es-dim">–</span> : <><i style={{ width: Math.min(80, r.app * 3 + 2) }} /><span className="es-num es-ink">{r.app}</span></>}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="a-card" aria-label="Up next">
          <div className="es-ch">
            <span className="a-tile"><Clock size={17} /></span>
            <div><h3 className="a-display">Up next</h3><div className="sub">Scheduled and automatic</div></div>
            <div className="r"><button className="es-link" onClick={() => navigate('/email-studio/campaigns?view=calendar')}>Calendar</button></div>
          </div>
          <div style={{ padding: '8px 0' }}>
            {upcoming.length === 0 ? <div className="es-empty">Nothing scheduled. Schedule a campaign or turn on What’s On.</div> : upcoming.map(u => (
              <button key={u.key} className="es-tl" style={{ width: '100%', background: 'none', border: 0, textAlign: 'left', cursor: 'pointer', color: 'inherit' }} onClick={() => u.to && navigate(u.to)}>
                <span className="es-when"><b>{u.at.getDate()}</b><small>{u.at.toLocaleDateString('en-AU', { weekday: 'short' }).toUpperCase()}</small></span>
                <div style={{ minWidth: 0 }}><div className="es-nm">{u.title}</div><div className="es-ed">{u.sub}</div><div className="es-ed">{u.pill}</div></div>
              </button>
            ))}
          </div>
        </section>
      </div>

      {s.kind === 'club' && <section aria-label="Running on their own">
        <div className="es-sh"><h3 className="a-display">Running on their own</h3><span className="es-dim" style={{ fontSize: 12.5 }}>Emails AlfiePRO sends for the club</span><button className="es-link r" onClick={() => navigate('/email-studio/flows')}>All flows</button></div>
        <div className="es-g3">
          <button className="a-card es-rc" onClick={() => navigate('/email-studio/flows')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span className="a-tile" style={toneStyle('b')}><Repeat size={17} /></span><b style={{ flex: 1 }}>What’s On</b>{wo?.enabled ? <span className="es-pill es-live"><span className="d" />On</span> : <span className="es-pill">Off</span>}</div>
            <span className="m">{wo?.enabled ? `${wo.frequency === 'weekly' ? 'Every' : wo.frequency === 'fortnightly' ? 'Every second' : 'Monthly on'} ${DAYS[wo.send_day]} at ${String(wo.send_time).slice(0, 5)}` : 'The club’s racing for the week ahead, with I’m going buttons'}</span>
          </button>
          <button className="a-card es-rc" onClick={() => navigate('/email-studio/flows')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span className="a-tile" style={toneStyle('g')}><UserPlus size={17} /></span><b style={{ flex: 1 }}>Welcome email</b><span className="es-pill es-live"><span className="d" />On</span></div>
            <span className="m">Sent when a new membership is approved</span>
          </button>
          <button className="a-card es-rc" onClick={() => navigate('/email-studio/flows')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span className="a-tile" style={toneStyle('o')}><RotateCcw size={17} /></span><b style={{ flex: 1 }}>Renewal reminders</b><span className="es-pill es-live"><span className="d" />On</span></div>
            <span className="m">Before memberships are due, using your renewal settings</span>
          </button>
        </div>
      </section>}

      <section aria-label="Start from a template">
        <div className="es-sh"><h3 className="a-display">Start from a template</h3><span className="es-dim" style={{ fontSize: 12.5 }}>Made by AlfiePRO, in your club’s colours. Change anything.</span><button className="es-link r" onClick={() => navigate('/email-studio/templates')}>All templates</button></div>
        <div className="es-recipes">
          {LIBRARY.slice(0, 6).map(t => (
            <button key={t.key} className="es-rc" disabled={busy} onClick={() => start({ name: t.name, subject: t.subject, doc: t.doc(), topic: t.topic, previewText: t.preview })}>
              <span className="a-tile" style={toneStyle(RECIPE_TONES[t.key])}>{RECIPE_ICONS[t.key]}</span>
              <b>{t.name}</b><span className="m">{t.note}</span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
};
