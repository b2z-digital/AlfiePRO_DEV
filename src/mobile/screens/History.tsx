/**
 * Phase 2 board, Racing › Results in depth:
 * - Race history: every event you've sailed, by season and type, newest or oldest first
 * - State and national results imported from the association websites (external_result_events),
 *   the same rows the desktop Results page lists, with your place found for you
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { useMobile } from '../MobileContext';
import { myResultFor, parseDay, MCalendarItem } from '../data';
import { Icon } from '../icons';
import { LevelPill, Skeleton, SubHeader, openCalendarItem, openExternalUrl } from '../ui';
import { ordinal } from './Home';
import { shortName } from './Racing';
import { SkipperSheet, type SheetSkipper } from './SkipperSheet';

/* ─────────────── Imported state / national results ─────────────── */

export interface ExtResultRow { name: string; sailNo?: string; club?: string; position: number; nett: number | null; total: number | null; races: string[]; isDiscard: boolean[] }
export interface ExtResultEvent {
  id: string; event_name: string; event_date: string | null; event_end_date: string | null; venue: string | null;
  boat_class_mapped: string | null; boat_class_raw: string | null; competitor_count: number | null; race_count: number | null;
  display_category: string | null; source_url: string | null; last_scraped_at: string | null; results_json: any[] | null;
}

const normName = (s?: string | null) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

export function extRows(ev: ExtResultEvent): ExtResultRow[] {
  return (Array.isArray(ev.results_json) ? ev.results_json : []).map((r: any, i: number) => ({
    name: String(r?.name || ''), sailNo: r?.sailNo ? String(r.sailNo) : undefined, club: r?.club || undefined,
    position: Number(r?.position) || i + 1,
    nett: r?.nett != null && Number.isFinite(Number(r.nett)) ? Number(r.nett) : null,
    total: r?.total != null && Number.isFinite(Number(r.total)) ? Number(r.total) : null,
    races: Array.isArray(r?.races) ? r.races.map((x: any) => String(x ?? '')) : [],
    isDiscard: Array.isArray(r?.isDiscard) ? r.isDiscard.map(Boolean) : [],
  })).filter(r => r.name).sort((a, b) => a.position - b.position);
}

export const extLevel = (ev: ExtResultEvent): 'state' | 'national' => (ev.display_category?.startsWith('state_') ? 'state' : 'national');
const fmtNum = (v: string) => { const n = Number(v); return Number.isFinite(n) && v.trim() !== '' ? String(Number(n.toFixed(1))) : v; };

/** Imported results for your club's state association plus national and world events (as the desktop dashboard picks them). */
export async function loadExternalResults(clubId: string | undefined, org: { type: string; id: string } | null): Promise<ExtResultEvent[]> {
  let myState: string | null = org?.type === 'state' ? org.id : null;
  if (!myState && clubId && org?.type !== 'national') {
    const { data } = await supabase.from('clubs').select('state_association_id').eq('id', clubId).maybeSingle();
    myState = (data as any)?.state_association_id || null;
  }
  const { data } = await supabase
    .from('external_result_events')
    .select('id,event_name,event_date,event_end_date,venue,boat_class_raw,boat_class_mapped,competitor_count,race_count,display_category,source_url,results_json,last_scraped_at')
    .eq('is_visible', true)
    .not('event_date', 'is', null)
    .order('event_date', { ascending: false })
    .limit(150);
  return ((data as ExtResultEvent[]) || []).filter(e => org?.type === 'national' || e.display_category === 'national' || e.display_category === 'world' || (!!myState && e.display_category === `state_${myState}`));
}

export function useExternalResults() {
  const { currentClub, currentOrganization } = useAuth();
  const [list, setList] = useState<ExtResultEvent[] | null>(null);
  useEffect(() => {
    const org = currentOrganization ? { type: currentOrganization.type, id: currentOrganization.id } : null;
    loadExternalResults(currentClub?.clubId, org).then(setList).catch(() => setList([]));
  }, [currentClub?.clubId, currentOrganization?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return list;
}

export function myExtPlace(ev: ExtResultEvent, fullName: string): ExtResultRow | null {
  if (!fullName) return null;
  return extRows(ev).find(r => normName(r.name) === normName(fullName)) || null;
}

const sourceHost = (url?: string | null) => { try { return url ? new URL(url).hostname.replace(/^www\./, '') : ''; } catch { return ''; } };

export const ExternalResultScreen: React.FC = () => {
  const { id = '' } = useParams();
  const { profile } = useMobile();
  const [ev, setEv] = useState<ExtResultEvent | null | undefined>(undefined);
  const [open, setOpen] = useState<SheetSkipper | null>(null);
  const fullName = `${profile.firstName} ${profile.lastName}`.trim();

  useEffect(() => {
    supabase.from('external_result_events').select('*').eq('id', id).eq('is_visible', true).maybeSingle()
      .then(({ data }) => setEv((data as ExtResultEvent) || null), () => setEv(null));
  }, [id]);

  if (ev === undefined) return <div className="m-stack"><SubHeader title="Results" /><Skeleton h={140} /><Skeleton h={320} /></div>;
  if (!ev) return <div className="m-stack"><SubHeader title="Results" /><div className="m-card m-empty">These results aren't available.</div></div>;

  const rows = extRows(ev);
  const mine = myExtPlace(ev, fullName);
  const host = sourceHost(ev.source_url);
  const level = extLevel(ev);
  const dates = ev.event_date ? `${parseDay(ev.event_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}${ev.event_end_date && ev.event_end_date !== ev.event_date ? `–${parseDay(ev.event_end_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}` : ''}` : '';

  const openRow = (r: ExtResultRow) => setOpen({
    name: r.name, sailNo: r.sailNo, position: r.position, of: rows.length, context: r.club,
    points: r.races.map((v, i) => { const n = Number(v); const isNum = Number.isFinite(n) && v.trim() !== ''; return { label: `R${i + 1}`, value: fmtNum(v), place: isNum ? n : null, dropped: !!r.isDiscard[i] }; }),
    dropSaved: r.total != null && r.nett != null ? Math.round((r.total - r.nett) * 10) / 10 : 0,
  });

  return (
    <div className="m-stack">
      <SubHeader title={level === 'state' ? 'State results' : 'National results'} right={ev.source_url ? (
        <button className="m-ibtn" aria-label="Share" onClick={async () => { try { if (navigator.share) await navigator.share({ title: ev.event_name, url: ev.source_url! }); else await navigator.clipboard.writeText(ev.source_url!); } catch { /* dismissed */ } }}><Icon name="share" size={19} /></button>
      ) : undefined} />
      <div className="m-card" style={{ padding: 14 }}>
        <div className="m-row" style={{ gap: 6 }}>
          {(ev.boat_class_mapped || ev.boat_class_raw) && <span className="m-cls">{ev.boat_class_mapped || ev.boat_class_raw}</span>}
          <LevelPill level={level} />
        </div>
        <div className="m-disp" style={{ fontSize: 20, fontWeight: 700, marginTop: 8, lineHeight: 1.2 }}>{ev.event_name}</div>
        <div className="m-mut" style={{ fontSize: 13, marginTop: 2 }}>{[ev.venue, dates, `${ev.competitor_count || rows.length} skippers`, ev.race_count ? `${ev.race_count} races` : ''].filter(Boolean).join(' · ')}</div>
        {host && <div className="m-dim" style={{ fontSize: 12, marginTop: 8 }}>From {host}{ev.last_scraped_at ? ` · updated ${new Date(ev.last_scraped_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}` : ''}</div>}
      </div>
      {mine && (
        <button className="m-card" onClick={() => openRow(mine)} style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left' }}>
          <span className="m-pill" style={{ background: 'rgba(10,132,255,.14)', color: 'var(--m-blue-ink)', fontWeight: 700 }}>You {mine.position}{ordinal(mine.position)}</span>
          <span className="m-mut" style={{ fontSize: 13, flex: 1 }}>of {rows.length}{mine.nett != null ? ` · ${mine.nett} net` : ''}</span>
          <Icon name="chevron" size={18} className="m-dim" />
        </button>
      )}
      {rows.length === 0 ? <div className="m-card m-empty">No placings were published with this event.</div> : (
        <div className="m-card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
            <thead>
              <tr style={{ color: 'var(--m-dim)', fontSize: 10.5, letterSpacing: '.06em', textTransform: 'uppercase' }}>
                <th style={{ padding: '9px 8px' }}>#</th><th style={{ padding: '9px 6px', textAlign: 'left' }}>Skipper</th><th style={{ padding: '9px 6px', textAlign: 'left' }}>Club</th><th style={{ padding: '9px 10px' }}>Net</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const me = mine === r;
                return (
                  <tr key={`${r.position}-${r.name}`} onClick={() => openRow(r)} style={{ borderTop: '1px solid var(--m-line)', background: me ? 'rgba(10,132,255,.12)' : undefined, cursor: 'pointer' }}>
                    <td className="m-disp" style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 700 }}>{r.position}</td>
                    <td style={{ padding: '10px 6px', fontWeight: me ? 700 : 500 }}>{me ? 'You' : r.name} {r.sailNo && <span className="m-dim" style={{ fontWeight: 400 }}>{r.sailNo}</span>}</td>
                    <td className="m-mut" style={{ padding: '10px 6px', fontSize: 12, maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.club || ''}</td>
                    <td style={{ padding: '10px 10px', textAlign: 'center', fontWeight: 700 }}>{r.nett ?? '–'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {ev.source_url && <button className="m-btn m-btn-g" onClick={() => openExternalUrl(ev.source_url!)}><Icon name="external" size={18} />Full results on {host || 'the association site'}</button>}
      {open && <SkipperSheet skipper={open} onClose={() => setOpen(null)} />}
    </div>
  );
};

/* ─────────────── Race history ─────────────── */

type Kind = 'all' | 'series' | 'single' | 'champs';

export const RaceHistoryScreen: React.FC = () => {
  const navigate = useNavigate();
  const { calendar, calendarLoading, memberIds, profile } = useMobile();
  const ext = useExternalResults();
  const fullName = `${profile.firstName} ${profile.lastName}`.trim();
  const [season, setSeason] = useState<string>(String(new Date().getFullYear()));
  const [kind, setKind] = useState<Kind>('all');
  const [newest, setNewest] = useState(true);

  type Row = { key: string; date: string; title: string; sub: string; cls?: string; pos: number; of: number; races: number; kind: Kind; open: () => void };
  const all = useMemo<Row[]>(() => {
    const out: Row[] = [];
    calendar.filter(i => i.kind === 'race' && (i.event?.raceResults?.length || 0) > 0).forEach((i: MCalendarItem) => {
      const r = myResultFor(i, memberIds, fullName);
      if (!r) return;
      const races = new Set((i.event?.raceResults || []).map((x: any) => x.race)).size;
      out.push({ key: i.key, date: i.date, title: i.title, sub: [i.venue, `${r.of} boats`].filter(Boolean).join(' · '), cls: i.raceClass, pos: r.position, of: r.of, races,
        kind: i.seriesId ? 'series' : i.level !== 'club' ? 'champs' : 'single', open: () => openCalendarItem(navigate, i) });
    });
    (ext || []).forEach(ev => {
      const r = myExtPlace(ev, fullName);
      if (!r || !ev.event_date) return;
      const rows = extRows(ev);
      out.push({ key: `x-${ev.id}`, date: ev.event_date, title: ev.event_name, sub: [ev.venue, `${rows.length} boats`].filter(Boolean).join(' · '), cls: ev.boat_class_mapped || undefined, pos: r.position, of: rows.length,
        races: r.races.length, kind: 'champs', open: () => navigate(`/results/external/${ev.id}`) });
    });
    return out;
  }, [calendar, ext, memberIds, fullName, navigate]);

  const seasons = useMemo(() => [...new Set([String(new Date().getFullYear()), ...all.map(r => r.date.slice(0, 4))])].sort((a, b) => b.localeCompare(a)).slice(0, 3), [all]);
  const rows = all.filter(r => (season === 'all' || r.date.startsWith(season)) && (kind === 'all' || r.kind === kind))
    .sort((a, b) => (newest ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)));
  const raceCount = rows.reduce((t, r) => t + r.races, 0);

  return (
    <div className="m-stack">
      <SubHeader title="Race history" />
      <nav className="m-seg" aria-label="Season">
        {seasons.map(s => <button key={s} className={season === s ? 'm-on' : ''} onClick={() => setSeason(s)}>{s}</button>)}
        <button className={season === 'all' ? 'm-on' : ''} onClick={() => setSeason('all')}>All seasons</button>
      </nav>
      <div className="m-chips">
        {([['all', 'All'], ['series', 'Series'], ['single', 'Single events'], ['champs', 'State & national']] as [Kind, string][]).map(([k, l]) => (
          <button key={k} className={`m-chip ${kind === k ? 'm-chip-on' : ''}`} onClick={() => setKind(k)}>{l}</button>
        ))}
      </div>
      <div className="m-row" style={{ justifyContent: 'space-between' }}>
        <span className="m-lb m-dim">{rows.length} event{rows.length === 1 ? '' : 's'} · {raceCount} races</span>
        <button onClick={() => setNewest(n => !n)} className="m-mut" style={{ background: 'none', border: 0, padding: 0, fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 3 }}>{newest ? 'Newest first' : 'Oldest first'}<Icon name="down" size={14} /></button>
      </div>
      {(calendarLoading && !calendar.length) || ext === null ? <Skeleton h={300} /> : rows.length === 0 ? (
        <div className="m-card m-empty">No results with your name {season === 'all' ? 'yet' : `in ${season}`}.</div>
      ) : (
        <div className="m-card">
          {rows.map(r => {
            const d = parseDay(r.date);
            return (
              <button key={r.key} className="m-li" onClick={r.open}>
                <div style={{ width: 38, textAlign: 'center', flexShrink: 0 }}>
                  <div className="m-dim" style={{ fontSize: 10.5, fontWeight: 700 }}>{d.toLocaleDateString('en-AU', { month: 'short' }).toUpperCase()}</div>
                  <div className="m-disp" style={{ fontSize: 19, fontWeight: 700 }}>{d.getDate()}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</div>
                  <div className="m-mut" style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.sub}</div>
                </div>
                {r.cls && <span className="m-cls">{r.cls}</span>}
                <span className="m-pill" style={{ background: r.pos <= 3 ? 'rgba(255,210,94,.2)' : 'rgba(10,132,255,.14)', color: r.pos <= 3 ? 'var(--m-gold-ink)' : 'var(--m-blue-ink)', fontWeight: 700 }}>{r.pos}{ordinal(r.pos)}</span>
              </button>
            );
          })}
        </div>
      )}
      <button className="m-btn m-btn-g" onClick={() => navigate('/my-stats')}><Icon name="trophy" size={18} />My stats</button>
    </div>
  );
};

/** Imported championship results for the Results list (cards like the club's own). */
export const ExternalResultCard: React.FC<{ ev: ExtResultEvent; fullName: string }> = ({ ev, fullName }) => {
  const navigate = useNavigate();
  const rows = extRows(ev);
  const mine = myExtPlace(ev, fullName);
  return (
    <button className="m-card" onClick={() => navigate(`/results/external/${ev.id}`)} style={{ padding: 14, textAlign: 'left' }}>
      <div className="m-row" style={{ gap: 8 }}>
        {(ev.boat_class_mapped || ev.boat_class_raw) && <span className="m-cls">{ev.boat_class_mapped || ev.boat_class_raw}</span>}
        <span className="m-dim" style={{ fontSize: 12.5 }}>{ev.event_date ? parseDay(ev.event_date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }) : ''} · {rows.length || ev.competitor_count || 0} boats</span>
        <span style={{ marginLeft: 'auto' }}>
          {mine ? <span className="m-pill" style={{ background: 'rgba(10,132,255,.14)', color: 'var(--m-blue-ink)', fontWeight: 700 }}>You {mine.position}{ordinal(mine.position)}</span> : <LevelPill level={extLevel(ev)} />}
        </span>
      </div>
      <div style={{ fontWeight: 600, fontSize: 15.5, marginTop: 8 }}>{ev.event_name}</div>
      {rows.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginTop: 10, fontSize: 13, flexWrap: 'wrap' }}>
          {rows.slice(0, 3).map((r, i) => (
            <span key={r.name + i} className="m-row" style={{ gap: 6 }}>
              <span style={{ width: 22, height: 22, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#0A1020', background: ['#FFD25E', '#D5DCE8', '#E8A26B'][i] }}>{i + 1}</span>
              {shortName(r.name)}
            </span>
          ))}
        </div>
      )}
    </button>
  );
};
