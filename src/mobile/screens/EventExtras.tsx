/**
 * Pieces of the event page and Home that come from the approved Member app board:
 * - Podium at the top of event results
 * - The event's Media tab: its broadcast (live now, or each race's replay) and the club's photos and videos of it
 * - Home in race-day mode: when you're entered in racing that is under way today
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { getEquivalentEventIds } from '../../utils/livestreamEventIds';
import { useRaceCompanion } from '../../utils/liveRaceCompanion';
import { raceVideoState, useRaceVideos } from '../../components/livestream/LiveWatchView';
import { getStoredVenues } from '../../utils/venueStorage';
import { getAllWeatherData, getWindBearing } from '../../utils/weatherAPI';
import type { EventMedia } from '../../types/media';
import type { LivestreamSession } from '../../types/livestream';
import { extractDbId, MCalendarItem, MStandings } from '../data';
import { youTubeThumb } from '../club';
import { useMobile } from '../MobileContext';
import { Icon } from '../icons';
import { Skeleton, openCalendarItem } from '../ui';
import { ordinal } from './Home';
import { shortName } from './Racing';

const initials = (name: string) => name.split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();

/* ─────────────── Podium ─────────────── */

export const Podium: React.FC<{ st: MStandings; onOpen: (index: number, position: number) => void }> = ({ st, onOpen }) => {
  const top = st.rows.slice(0, 3);
  if (top.length < 2) return null;
  // Second, first, third, as on a real podium
  const order = [top[1], top[0], top[2]].filter(Boolean);
  const place = (r: typeof top[number]) => top.indexOf(r) + 1;
  const ring = (p: number) => (p === 1 ? 'linear-gradient(135deg,#FFD25E,#E8A26B)' : p === 2 ? 'linear-gradient(135deg,#E6EBF2,#9AA6B8)' : 'linear-gradient(135deg,#E8A26B,#9C5B2E)');
  return (
    <div className="m-card" style={{ padding: '16px 12px 12px', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 10 }}>
      {order.map(r => {
        const p = place(r);
        const size = p === 1 ? 64 : 52;
        return (
          <button key={r.index} onClick={() => onOpen(r.index, p)} style={{ flex: 1, minWidth: 0, background: 'none', border: 0, padding: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: 'var(--m-ink)' }}>
            <span style={{ position: 'relative', width: size, height: size, borderRadius: 999, padding: 3, background: ring(p), boxSizing: 'border-box' }}>
              <span className="m-av" style={{ width: '100%', height: '100%', fontSize: p === 1 ? 19 : 16, background: '#1A2337', color: '#fff' }}>{initials(r.name)}</span>
              <span className="m-disp" style={{ position: 'absolute', right: -4, bottom: -4, width: 24, height: 24, borderRadius: 12, background: ring(p), color: '#1A1205', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{p}</span>
            </span>
            <span className="m-ell" style={{ maxWidth: '100%', fontWeight: 600, fontSize: 13.5 }}>{shortName(r.name)}</span>
            <span className="m-dim" style={{ fontSize: 12 }}>{r.netLabel} pts</span>
          </button>
        );
      })}
    </div>
  );
};

/* ─────────────── The event's broadcast ─────────────── */

const rank = (s: LivestreamSession) => (s.status === 'live' ? 0 : s.status === 'testing' || s.status === 'scheduled' || s.status === 'draft' ? 1 : 2);

/** The event's broadcast, found the way the desktop event page finds it (any id a round may be saved under). */
export function useEventBroadcast(eventId: string | undefined) {
  const [session, setSession] = useState<LivestreamSession | null | undefined>(undefined);
  useEffect(() => {
    setSession(undefined);
    if (!eventId) { setSession(null); return; }
    let cancelled = false;
    const load = async () => {
      const ids = await getEquivalentEventIds(eventId);
      const { data } = await supabase.from('livestream_sessions').select('*').in('event_id', ids).order('created_at', { ascending: false }).limit(10);
      const best = data?.length ? [...(data as LivestreamSession[])].sort((a, b) => rank(a) - rank(b))[0] : null;
      if (!cancelled) setSession(best && best.is_public !== false ? best : null);
    };
    load().catch(() => !cancelled && setSession(null));
    const t = setInterval(() => { load().catch(() => {}); }, 60000);
    return () => { cancelled = true; clearInterval(t); };
  }, [eventId]);
  return session;
}

/** The club's photos and videos of this event, matched as the desktop event page matches them. */
export async function loadEventMedia(item: MCalendarItem, clubId: string): Promise<EventMedia[]> {
  const e = item.event;
  if (!e) return [];
  let q = supabase.from('event_media').select('*').eq('club_id', clubId).in('media_type', ['image', 'youtube_video']).eq('is_homepage_media', false);
  if (e.id.includes('-round-') || e.isSeriesEvent) {
    const name = e.eventName || e.clubName || e.roundName;
    if (!name) return [];
    q = q.eq('event_name', name);
  } else {
    q = q.eq('event_ref_id', extractDbId(e.id));
  }
  const { data } = await q.order('created_at', { ascending: false });
  return (data || []) as EventMedia[];
}

const thumbOf = (m: EventMedia) => m.thumbnail_url || (m.media_type === 'image' ? m.url : youTubeThumb(m.url)) || '';
const embedOf = (url: string) => {
  const m = url.match(/(?:youtu\.be\/|v=|embed\/|shorts\/|live\/)([\w-]{11})/);
  return m ? `https://www.youtube.com/embed/${m[1]}?autoplay=1&playsinline=1` : url;
};

export const EventMediaTab: React.FC<{ item: MCalendarItem; session: LivestreamSession | null | undefined }> = ({ item, session }) => {
  const navigate = useNavigate();
  const { currentClub } = useAuth();
  const [media, setMedia] = useState<EventMedia[] | null>(null);
  const [viewing, setViewing] = useState<{ title: string; url: string; image: boolean } | null>(null);
  const videos = useRaceVideos(session?.id);
  const ready = videos.filter(v => raceVideoState(v) === 'ready' && v.youtube_video_id);
  const live = session?.status === 'live';
  const upcoming = session && rank(session) === 1;

  useEffect(() => {
    if (!currentClub?.clubId) { setMedia([]); return; }
    loadEventMedia(item, currentClub.clubId).then(setMedia).catch(() => setMedia([]));
  }, [item.key, currentClub?.clubId]); // eslint-disable-line react-hooks/exhaustive-deps

  const photos = (media || []).filter(m => m.media_type === 'image');
  const clips = (media || []).filter(m => m.media_type !== 'image');
  const fullReplay = session && !live && !upcoming && (session as any).youtube_video_id ? (session as any).youtube_video_id as string : null;

  return (
    <>
      {session === undefined ? <Skeleton h={90} /> : session && (live || upcoming || ready.length > 0 || fullReplay) && (
        <div className="m-card" style={{ overflow: 'hidden' }}>
          <button onClick={() => (live ? navigate(`/alfie-tv?watch=${session.id}`) : fullReplay ? setViewing({ title: session.title, url: `https://youtu.be/${fullReplay}`, image: false }) : undefined)}
            style={{ width: '100%', aspectRatio: '16 / 8', border: 0, padding: 0, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
              background: `linear-gradient(rgba(6,11,22,.35), rgba(6,11,22,.65)), ${item.venueImage ? `url("${item.venueImage}") center / cover` : 'linear-gradient(125deg,#0A3D7A,#1C6FC2 50%,#9DD2FF)'}` }}>
            {live && <span className="m-live" style={{ position: 'absolute', top: 10, left: 10 }}>LIVE</span>}
            {(live || fullReplay) && <span style={{ width: 54, height: 54, borderRadius: 27, background: 'rgba(255,255,255,.92)', color: '#0B1222', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="play" size={24} /></span>}
            {upcoming && <span className="m-pill" style={{ background: 'rgba(6,11,22,.6)', color: '#fff' }}>Livestream on race day</span>}
          </button>
          <div style={{ padding: '12px 14px' }}>
            <div style={{ fontWeight: 600 }}>{live ? 'Watch live on AlfieTV' : upcoming ? 'This event will be streamed' : fullReplay ? 'Watch the broadcast' : 'Race replays'}</div>
            <div className="m-mut" style={{ fontSize: 13 }}>{live ? 'Live scoring beside the picture.' : upcoming ? 'It appears here and on AlfieTV once it starts.' : `${ready.length} race${ready.length === 1 ? '' : 's'} on YouTube`}</div>
          </div>
          {ready.length > 0 && (
            <div className="m-chips" style={{ padding: '0 14px 14px', gap: 8 }}>
              {ready.map(v => (
                <button key={v.id} onClick={() => setViewing({ title: v.race_number ? `Race ${v.race_number}` : v.segment_title || 'Race', url: `https://youtu.be/${v.youtube_video_id}`, image: false })}
                  style={{ flex: '0 0 132px', border: 0, padding: 0, textAlign: 'left', background: 'none', color: 'var(--m-ink)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', aspectRatio: '16 / 9', borderRadius: 10, background: `#10233F url("https://i.ytimg.com/vi/${v.youtube_video_id}/mqdefault.jpg") center / cover` }}>
                    <Icon name="play" size={20} style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,.6))', color: '#fff' }} />
                  </span>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginTop: 5 }}>{v.race_number ? `Race ${v.race_number}` : v.segment_title || 'Race'}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {media === null ? <Skeleton h={200} /> : (
        <>
          {photos.length > 0 && (
            <>
              <div className="m-sh"><h3>Photos {photos.length}</h3></div>
              <div className="m-g">
                {photos.map(m => <button key={m.id} aria-label={m.title || 'Photo'} style={{ backgroundImage: `url("${thumbOf(m)}")` }} onClick={() => setViewing({ title: m.title || item.title, url: m.url, image: true })} />)}
              </div>
            </>
          )}
          {clips.length > 0 && (
            <>
              <div className="m-sh"><h3>Videos {clips.length}</h3></div>
              <div className="m-g">
                {clips.map(m => (
                  <button key={m.id} aria-label={m.title || 'Video'} style={{ backgroundImage: thumbOf(m) ? `url("${thumbOf(m)}")` : undefined }} onClick={() => setViewing({ title: m.title || item.title, url: m.url, image: false })}>
                    <Icon name="play" size={22} style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,.6))' }} />
                  </button>
                ))}
              </div>
            </>
          )}
          {!photos.length && !clips.length && !(session && (live || upcoming || ready.length || fullReplay)) && (
            <div className="m-card m-empty">No photos or videos of this event yet. The club adds them from the media page.</div>
          )}
        </>
      )}

      {viewing && (
        <div className="m-viewer" role="dialog" aria-label={viewing.title}>
          <div className="m-row" style={{ padding: 'calc(var(--m-safe-top) + 8px) 16px 8px', color: '#fff' }}>
            <button className="m-ibtn m-ibtn-d" aria-label="Close" onClick={() => setViewing(null)}><Icon name="close" /></button>
            <span className="m-ell" style={{ flex: 1, fontWeight: 600 }}>{viewing.title}</span>
            <button className="m-ibtn m-ibtn-d" aria-label="Share" onClick={async () => { try { if (navigator.share) await navigator.share({ url: viewing.url }); } catch { /* dismissed */ } }}><Icon name="share" /></button>
          </div>
          {viewing.image
            ? <img src={viewing.url} alt={viewing.title} />
            : <iframe src={embedOf(viewing.url)} title={viewing.title} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />}
        </div>
      )}
    </>
  );
};

/* ─────────────── Home: race day ─────────────── */

const norm = (s?: string | null) => String(s || '').trim().toLowerCase();

/** Today's racing you're entered in (for Home's race-day mode). */
export function todaysRaceFor(calendar: MCalendarItem[], memberIds: string[], fullName: string, today: string): MCalendarItem | null {
  return calendar.find(i => i.kind === 'race' && !i.external && !i.cancelled && !i.completed && i.date <= today && (i.endDate || i.date) >= today
    && (i.event?.skippers || []).some((s: any) => (s.memberId && memberIds.includes(s.memberId)) || (!!fullName && norm(s.name) === norm(fullName)))) || null;
}

/**
 * Race day (board: Home › Race day): once racing that you're entered in is under way, Home leads with
 * it: the race being sailed, your place so far, the wind at the venue, and the broadcast if there is one.
 * Returns null (so Home shows its normal week) until scoring has started.
 */
export const RaceDayCard: React.FC<{ item: MCalendarItem; onActive?: (on: boolean) => void }> = ({ item, onActive }) => {
  const navigate = useNavigate();
  const { memberIds, profile } = useMobile();
  const { companion } = useRaceCompanion(item.event?.id);
  const session = useEventBroadcast(item.event?.id);
  const [wind, setWind] = useState<{ speed: number; gust?: number; dir: number } | null>(null);
  const fullName = `${profile.firstName} ${profile.lastName}`.trim();

  useEffect(() => {
    let cancelled = false;
    getStoredVenues().then(async vs => {
      const v = (vs || []).find(x => norm(x.name) === norm(item.venue) && x.latitude && x.longitude);
      if (!v) return;
      const d = await getAllWeatherData(v.latitude!, v.longitude!, v.name);
      if (!cancelled && d?.current) setWind({ speed: d.current.windSpeed, gust: d.current.windGust, dir: d.current.windDirection });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [item.venue]);

  const myIndex = useMemo(() => (item.event?.skippers || []).findIndex((s: any) => (s.memberId && memberIds.includes(s.memberId)) || (!!fullName && norm(s.name) === norm(fullName))), [item, memberIds, fullName]);

  const underway = !!companion && (['live', 'in_progress', 'on_hold'].includes(companion.status) || (companion.racesDone > 0 && companion.status !== 'event_complete' && companion.status !== 'completed' && companion.status !== 'completed_for_day'));
  useEffect(() => { onActive?.(underway); }, [underway]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!companion || !underway) return null;

  const me = companion.standings?.find(s => s.index === myIndex) || null;
  const top = (companion.standings || []).slice(0, 3);
  const live = session?.status === 'live';
  const total = item.event?.numRaces;
  const racing = companion.status === 'live' || companion.status === 'in_progress';

  return (
    <div className="m-card m-spec" style={{ padding: 16, borderRadius: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <button onClick={() => openCalendarItem(navigate, item)} style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', color: 'var(--m-ink)' }}>
        <div className="m-row" style={{ gap: 8 }}>
          <span className="m-pill" style={{ background: companion.status === 'on_hold' ? '#FF9F0A' : 'rgba(52,199,89,.18)', color: companion.status === 'on_hold' ? '#fff' : '#5FD47F' }}>{companion.status === 'on_hold' ? 'On hold' : 'Race day'}</span>
          <span className="m-mut" style={{ fontSize: 13 }}>{item.venue}</span>
        </div>
        <div className="m-disp" style={{ fontSize: 21, fontWeight: 700, marginTop: 8, lineHeight: 1.15 }}>{item.title}</div>
        <div className="m-mut" style={{ fontSize: 13.5, marginTop: 3 }}>
          {racing ? `${companion.raceLabel}${total ? ` of ${total}` : ''} under way` : `${companion.racesDone} race${companion.racesDone === 1 ? '' : 's'} sailed${total ? ` of ${total}` : ''}`}
          {companion.statusNotes ? ` · ${companion.statusNotes}` : ''}
        </div>
      </button>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        <div className="m-card" style={{ padding: '10px 12px' }}>
          <div className="m-disp" style={{ fontSize: 28, fontWeight: 700, lineHeight: 1 }}>{me ? <>{me.rank}<span style={{ fontSize: 15 }}>{ordinal(me.rank)}</span></> : '–'}</div>
          <div className="m-mut" style={{ fontSize: 12, marginTop: 4 }}>{me ? `after ${companion.racesDone} race${companion.racesDone === 1 ? '' : 's'}${me.net != null ? ` · ${me.net} pts` : ''}` : companion.heatRacing ? 'Heat racing: see results' : 'No races scored yet'}</div>
        </div>
        <div className="m-card" style={{ padding: '10px 12px' }}>
          <div className="m-disp" style={{ fontSize: 28, fontWeight: 700, lineHeight: 1 }}>{wind ? Math.round(wind.speed) : '–'}<span style={{ fontSize: 15 }}> kn</span></div>
          <div className="m-mut" style={{ fontSize: 12, marginTop: 4 }}>{wind ? `${getWindBearing(wind.dir)}${wind.gust ? `, gusts ${Math.round(wind.gust)}` : ''}` : 'Wind at the venue'}</div>
        </div>
      </div>

      {live && (
        <button className="m-card" onClick={() => navigate(`/alfie-tv?watch=${session!.id}`)} style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left' }}>
          <span className="m-live">LIVE</span>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>Watch this race on AlfieTV</span>
          <Icon name="chevron" size={18} className="m-dim" />
        </button>
      )}

      {top.length > 0 && (
        <div>
          <div className="m-row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
            <span className="m-lb m-dim">Standings after {companion.racesDone}</span>
            <button onClick={() => openCalendarItem(navigate, item)} style={{ background: 'none', border: 0, padding: 0, color: 'var(--m-blue-ink)', fontSize: 13, fontWeight: 600 }}>Full results</button>
          </div>
          {top.map(s => (
            <div key={s.index} className="m-row" style={{ gap: 10, padding: '6px 0', fontWeight: s.index === myIndex ? 700 : 500 }}>
              <span className="m-disp" style={{ width: 18, textAlign: 'center', fontWeight: 700 }}>{s.rank}</span>
              <span style={{ flex: 1, minWidth: 0 }} className="m-ell">{s.index === myIndex ? 'You' : shortName(s.name)} <span className="m-dim" style={{ fontWeight: 400 }}>· {s.sail}</span></span>
              <span className="m-mut" style={{ fontSize: 13 }}>{s.net ?? '–'} pts</span>
            </div>
          ))}
        </div>
      )}

      <div className="m-row" style={{ gap: 8 }}>
        <button className="m-btn" style={{ flex: 1 }} onClick={() => navigate('/race-timer')}><Icon name="timer" size={18} />Race Timer</button>
        <button className="m-btn" style={{ flex: 1 }} onClick={() => openCalendarItem(navigate, item)}><Icon name="trophy" size={18} />Results</button>
      </div>
    </div>
  );
};
