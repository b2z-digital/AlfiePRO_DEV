import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, Copy, Loader2, MoreHorizontal, Plus, Sailboat, Search, Trash2, BarChart3, PencilLine } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useNotifications } from '../../contexts/NotificationContext';
import { useStudio } from './studioData';
import { campaignStats, deleteCampaign, duplicateCampaign, fmtDate, fmtTime, listCampaigns, pct, ago, type CampaignRow, type CampaignStats } from './api';
import { Confirm, StatusPill, Thumb, partLabel } from './ui';

type Filter = 'all' | 'draft' | 'scheduled' | 'sent';

const RowMenu: React.FC<{ c: CampaignRow; onDone: () => void }> = ({ c, onDone }) => {
  const navigate = useNavigate();
  const { addNotification } = useNotifications();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div ref={box} style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
      <button className="a-ib" style={{ width: 32, height: 32 }} aria-label={`More for ${c.name}`} onClick={() => setOpen(o => !o)}><MoreHorizontal size={16} /></button>
      {open && (
        <div className="es-menu" style={{ right: 0, top: 36, minWidth: 190 }}>
          {c.status === 'sent' ? <button onClick={() => navigate(`/email-studio/campaigns/${c.id}/report`)}><BarChart3 size={15} />See the report</button>
            : <button onClick={() => navigate(`/email-studio/campaigns/${c.id}`)}><PencilLine size={15} />Open</button>}
          <button disabled={busy} onClick={async () => {
            setBusy(true);
            try { const id = await duplicateCampaign(c.id); navigate(`/email-studio/campaigns/${id}`); } catch (e) { addNotification('error', (e as Error).message); } finally { setBusy(false); }
          }}><Copy size={15} />Duplicate</button>
          {(c.status === 'draft' || c.status === 'scheduled') && <button onClick={() => { setOpen(false); setConfirm(true); }}><Trash2 size={15} />Delete</button>}
        </div>
      )}
      {confirm && (
        <Confirm title="Delete this campaign?" body={<>“{c.name}” will be deleted. This can’t be undone.</>} confirm="Delete" danger busy={busy}
          onClose={() => setConfirm(false)}
          onConfirm={async () => { setBusy(true); try { await deleteCampaign(c.id); setConfirm(false); onDone(); } catch (e) { addNotification('error', (e as Error).message); } finally { setBusy(false); } }} />
      )}
    </div>
  );
};

/* ── Send calendar ───────────────────────────────────────────────────────── */
interface CalItem { day: string; label: string; kind: 'c' | 'a' | 's'; to?: string }

const SendCalendar: React.FC<{ campaigns: CampaignRow[] }> = ({ campaigns }) => {
  const s = useStudio();
  const navigate = useNavigate();
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [wo, setWo] = useState<{ settings?: { enabled: boolean; send_day: number; frequency: string } } | null>(null);
  const [woSends, setWoSends] = useState<string[]>([]);
  useEffect(() => { s.loadFeed(); }, [s]);
  useEffect(() => {
    supabase.rpc('whats_on_settings_get', { p_club: s.clubId }).then(({ data }) => setWo(data as never));
    supabase.from('whats_on_sends').select('sent_at').eq('club_id', s.clubId).neq('kind', 'test').order('sent_at', { ascending: false }).limit(60)
      .then(({ data }) => setWoSends((data || []).map(d => d.sent_at as string)));
  }, [s.clubId]);

  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const start = new Date(month);
  start.setDate(1 - ((start.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_v, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const today = key(new Date());

  const items = useMemo(() => {
    const out: CalItem[] = [];
    for (const c of campaigns) {
      if (c.status === 'sent' && c.sent_at) out.push({ day: key(new Date(c.sent_at)), label: c.name, kind: 'c', to: `/email-studio/campaigns/${c.id}/report` });
      else if ((c.status === 'scheduled' || c.status === 'sending') && c.send_at) out.push({ day: key(new Date(c.send_at)), label: c.name, kind: 's', to: `/email-studio/campaigns/${c.id}` });
    }
    for (const at of woSends) out.push({ day: key(new Date(at)), label: 'What’s On', kind: 'a', to: '/email-studio/flows' });
    const cfg = wo?.settings;
    if (cfg?.enabled) {
      const sent = new Set(woSends.map(a => key(new Date(a))));
      for (const d of days) {
        if (d.getDay() === Number(cfg.send_day) && key(d) >= today && !sent.has(key(d))) out.push({ day: key(d), label: 'What’s On', kind: 'a', to: '/email-studio/flows' });
      }
    }
    return out;
  }, [campaigns, woSends, wo, month]); // eslint-disable-line react-hooks/exhaustive-deps

  const races = useMemo(() => {
    const m: Record<string, string> = {};
    for (const e of s.feed.events) if (e.kind !== 'meeting' && !m[e.event_date]) m[e.event_date] = e.race_class ? `${e.race_class}` : 'Racing';
    return m;
  }, [s.feed.events]);

  return (
    <section className="a-card" aria-label="Send calendar">
      <div className="es-ch">
        <span className="a-tile"><CalendarDays size={17} /></span>
        <div><h3 className="a-display">{month.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}</h3><div className="sub">Everything going out, next to your race days</div></div>
        <div className="r">
          <button className="a-ib" aria-label="Previous month" onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}><ChevronLeft size={16} /></button>
          <button className="a-btn a-btn-sm" onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}>Today</button>
          <button className="a-ib" aria-label="Next month" onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}><ChevronRight size={16} /></button>
        </div>
      </div>
      <div className="es-cal">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <span key={d} className="es-dow">{d}</span>)}
        {days.map(d => {
          const k = key(d);
          const its = items.filter(i => i.day === k);
          return (
            <div key={k} className={`es-cd${d.getMonth() !== month.getMonth() ? ' mu' : ''}${k === today ? ' today' : ''}`}>
              <span className="dn">{d.getDate()}</span>
              {races[k] && <span className="es-race"><Sailboat size={11} />{races[k]}</span>}
              {its.slice(0, 3).map((i, n) => <button key={n} className={`es-ev es-ev-${i.kind}`} title={i.label} onClick={() => i.to && navigate(i.to)}>{i.label}</button>)}
              {its.length > 3 && <span className="es-dim" style={{ fontSize: 10.5, paddingLeft: 4 }}>+{its.length - 3} more</span>}
            </div>
          );
        })}
      </div>
      <div className="es-lg">
        <span><i style={{ background: 'rgba(57,135,229,.5)' }} />Campaign sent</span>
        <span><i style={{ boxShadow: 'inset 0 0 0 1.5px rgba(122,176,255,.8)' }} />Scheduled</span>
        <span><i style={{ background: 'rgba(138,77,255,.5)' }} />Automatic</span>
        <span className="es-race" style={{ fontSize: 12 }}><Sailboat size={12} />Race day</span>
      </div>
    </section>
  );
};

/* ── List ────────────────────────────────────────────────────────────────── */
export const StudioCampaigns: React.FC<{ onNew: () => void }> = ({ onNew }) => {
  const s = useStudio();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'calendar' ? 'calendar' : 'list';
  const [rows, setRows] = useState<CampaignRow[] | null>(null);
  const [stats, setStats] = useState<Record<string, CampaignStats>>({});
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');

  const load = () => listCampaigns(s.clubId).then(async r => {
    setRows(r);
    setStats(await campaignStats(r.filter(c => c.status === 'sent' || c.status === 'sending').map(c => c.id)));
  }).catch(() => setRows([]));
  useEffect(() => { load(); }, [s.clubId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!rows?.some(r => r.status === 'sending')) return;
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const c = { all: 0, draft: 0, scheduled: 0, sent: 0 };
    for (const r of rows || []) {
      c.all++;
      if (r.status === 'draft') c.draft++;
      else if (r.status === 'scheduled' || r.status === 'sending') c.scheduled++;
      else if (r.status === 'sent') c.sent++;
    }
    return c;
  }, [rows]);

  const shown = (rows || []).filter(r => (filter === 'all' || (filter === 'scheduled' ? ['scheduled', 'sending'].includes(r.status) : r.status === filter))
    && (!q.trim() || `${r.name} ${r.subject}`.toLowerCase().includes(q.trim().toLowerCase())));
  const groups: { key: string; label: string; rows: CampaignRow[] }[] = [
    { key: 'draft', label: 'Drafts', rows: shown.filter(r => r.status === 'draft') },
    { key: 'scheduled', label: 'Scheduled', rows: shown.filter(r => r.status === 'scheduled' || r.status === 'sending').sort((a, b) => String(a.send_at).localeCompare(String(b.send_at))) },
    { key: 'sent', label: 'Sent', rows: shown.filter(r => r.status === 'sent').sort((a, b) => String(b.sent_at).localeCompare(String(a.sent_at))) },
  ].filter(g => g.rows.length);

  const audienceText = (c: CampaignRow) => {
    const inc = c.audience?.include || [];
    if (!inc.length) return 'All members';
    return inc.map(p => partLabel(p, s)).join(' + ');
  };

  const list = (
    <section className="a-card" aria-label="Campaigns" style={{ paddingBottom: 8 }}>
      {!rows ? <div className="es-empty"><Loader2 size={18} className="es-spin" /></div> : rows.length === 0 ? (
        <div className="es-empty" style={{ padding: 48 }}>
          <p style={{ margin: '0 0 12px', fontSize: 15 }} className="es-ink">No campaigns yet</p>
          <button className="a-btn a-btn-p" onClick={onNew}><Plus size={16} />New campaign</button>
        </div>
      ) : shown.length === 0 ? <div className="es-empty">Nothing matches.</div> : (
        <>
          <div className="es-row es-cr h"><span /><span>Campaign</span><span>Sent to</span><span>When</span><span className="es-rn">Opened</span><span className="es-rn">Clicked</span><span className="es-rn">In app</span><span /></div>
          {groups.map(g => (
            <React.Fragment key={g.key}>
              <div className="es-grp">{g.label} <span className="n">{g.rows.length}</span></div>
              {g.rows.map(c => {
                const st = stats[c.id];
                const sent = c.status === 'sent' || c.status === 'sending';
                return (
                  <div key={c.id} role="button" tabIndex={0} className="es-row es-cr" onClick={() => navigate(c.status === 'sent' ? `/email-studio/campaigns/${c.id}/report` : `/email-studio/campaigns/${c.id}`)}
                    onKeyDown={e => { if (e.key === 'Enter') navigate(c.status === 'sent' ? `/email-studio/campaigns/${c.id}/report` : `/email-studio/campaigns/${c.id}`); }}>
                    <Thumb seed={c.name} />
                    <div style={{ minWidth: 0 }}>
                      <div className="es-nm">{c.name}</div>
                      <div className="es-ed"><StatusPill status={c.status} />{c.status === 'draft' ? `Edited ${ago(c.updated_at)}` : c.subject}</div>
                    </div>
                    <span className="es-nm" style={{ fontWeight: 500, fontSize: 12.5 }}>{audienceText(c)}{sent && c.total_recipients ? <small className="es-dim" style={{ display: 'block', fontSize: 11.5 }}>{c.total_recipients} people</small> : null}</span>
                    <span style={{ fontSize: 12.5 }} className="es-ink">
                      {c.status === 'sent' && c.sent_at ? <>{fmtDate(c.sent_at)}<small className="es-dim" style={{ display: 'block', fontSize: 11.5 }}>{fmtTime(c.sent_at)}</small></>
                        : c.send_at && c.status !== 'draft' ? <>{fmtDate(c.send_at)}<small className="es-dim" style={{ display: 'block', fontSize: 11.5 }}>{fmtTime(c.send_at)}</small></>
                          : <span className="es-dim">Not scheduled</span>}
                    </span>
                    <span className="es-rn">{st && st.sent ? `${pct(st.opened, st.sent)}%` : <span className="es-dim">–</span>}</span>
                    <span className="es-rn">{st && st.sent ? `${pct(st.clicked, st.sent)}%` : <span className="es-dim">–</span>}</span>
                    <span className="es-rn">{st && st.sent ? st.app : <span className="es-dim">–</span>}</span>
                    <RowMenu c={c} onDone={load} />
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </>
      )}
    </section>
  );

  return (
    <>
      <div className="es-bar-t">
        <div className="a-seg" role="group" aria-label="Show">
          {(['all', 'draft', 'scheduled', 'sent'] as Filter[]).map(f => (
            <button key={f} className={`a-seg-i${filter === f ? ' a-seg-on' : ''}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {{ all: 'All', draft: 'Drafts', scheduled: 'Scheduled', sent: 'Sent' }[f]} <span className="es-dim">{counts[f]}</span>
            </button>
          ))}
        </div>
        <label className="es-search"><span className="es-sr">Search campaigns</span><Search size={15} /><input className="a-inp" value={q} onChange={e => setQ(e.target.value)} placeholder="Search campaigns" /></label>
        <div className="a-seg" role="group" aria-label="View" style={{ marginLeft: 'auto' }}>
          <button className={`a-seg-i${view === 'list' ? ' a-seg-on' : ''}`} aria-pressed={view === 'list'} onClick={() => setParams({})}>List</button>
          <button className={`a-seg-i${view === 'calendar' ? ' a-seg-on' : ''}`} aria-pressed={view === 'calendar'} onClick={() => setParams({ view: 'calendar' })}>Calendar</button>
        </div>
      </div>
      {view === 'calendar' ? <SendCalendar campaigns={rows || []} /> : list}
    </>
  );
};
