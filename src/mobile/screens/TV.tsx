import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { useMobile } from '../MobileContext';
import { Icon, AlfieSails } from '../icons';
import { Avatar, Skeleton } from '../ui';
import { useRaceCompanion } from '../../utils/liveRaceCompanion';
import { useRaceVideos, raceVideoState } from '../../components/livestream/LiveWatchView';
import { LiveVideo } from '../../components/livestream/LiveVideo';
import {
  AlfieTVVideo, LivestreamArchive, MChannel, MStream, TVHome, duration, loadChannelVideos, loadTVHome, recordWatch, searchTV, thumb, toggleWatchlist,
} from '../tv';

const AlfieTVPlayer = lazy(() => import('../../components/alfie-tv/tv/AlfieTVPlayer').then(m => ({ default: m.AlfieTVPlayer })));

type Chip = 'foryou' | 'live' | 'replays' | 'mylist' | 'channels';
const CHIPS: { id: Chip; label: string }[] = [
  { id: 'foryou', label: 'For you' }, { id: 'live', label: 'Live' }, { id: 'replays', label: 'Replays' }, { id: 'mylist', label: 'My List' }, { id: 'channels', label: 'Channels' },
];
const FALLBACK = 'linear-gradient(135deg,#0A3D7A 0%,#1C6FC2 45%,#8CC8F0 100%)';

/* ─────────────── Pieces ─────────────── */

const Card: React.FC<{ v: AlfieTVVideo; w?: number; h?: number; progress?: number; onPlay: (v: AlfieTVVideo) => void }> = ({ v, w = 150, h = 84, progress, onPlay }) => (
  <button className="m-it" style={{ width: w || '100%', flexShrink: 0 }} onClick={() => onPlay(v)}>
    <span className="m-tv-thumb" style={{ height: h, backgroundImage: thumb(v) ? `url("${thumb(v)}")` : FALLBACK }}>
      {progress != null && <span className="m-tv-prog" style={{ width: `${Math.min(100, Math.max(4, progress * 100))}%` }} />}
      {progress == null && v.duration ? <span className="m-tv-dur">{duration(v.duration)}</span> : null}
    </span>
    <span className="m-ell2" style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.25 }}>{v.title}</span>
  </button>
);

const Row: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <>
    <div className="m-sh"><h3>{title}</h3></div>
    <div className="m-hscroll">{children}</div>
  </>
);

/* ─────────────── AlfieTV home ─────────────── */

export const TVScreen: React.FC = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { user, currentClub, currentOrganization } = useAuth();
  const { profile, light, toast, tap } = useMobile();
  const [home, setHome] = useState<TVHome | null>(null);
  const [chip, setChip] = useState<Chip>('foryou');
  const [playing, setPlaying] = useState<{ v: AlfieTVVideo; start?: number } | null>(null);
  const [replay, setReplay] = useState<LivestreamArchive | { youtube_video_id: string; title: string } | null>(null);
  const [channel, setChannel] = useState<{ c: MChannel; videos: AlfieTVVideo[] | null } | null>(null);
  const [searching, setSearching] = useState(false);
  const watchId = params.get('watch');

  const load = React.useCallback(() => {
    loadTVHome(currentClub?.clubId, currentOrganization?.id, currentOrganization?.type || 'club', user?.id).then(setHome).catch(() => setHome(null));
  }, [currentClub?.clubId, currentOrganization?.id, currentOrganization?.type, user?.id]);
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);

  const inList = useMemo(() => new Set((home?.watchlist || []).map(v => v.id)), [home?.watchlist]);
  const myList = async (v: AlfieTVVideo) => {
    if (!user?.id || !home) return;
    const on = inList.has(v.id);
    setHome({ ...home, watchlist: on ? home.watchlist.filter(x => x.id !== v.id) : [v, ...home.watchlist] });
    tap(on ? 'light' : 'success');
    try { await toggleWatchlist(user.id, v.id, on); toast(on ? 'Removed from My List' : 'Added to My List'); } catch { load(); }
  };

  const openChannel = (c: MChannel) => { setChannel({ c, videos: null }); loadChannelVideos(c.id).then(videos => setChannel({ c, videos })); };
  const name = `${profile.firstName} ${profile.lastName}`.trim() || 'Me';
  const live = home?.live || [];
  const heroStream = live[0];
  const heroVideo = home?.hero[0];
  const heroImg = heroStream ? (heroStream.venue_image ? `url("${heroStream.venue_image}")` : FALLBACK) : heroVideo && thumb(heroVideo) ? `url("${thumb(heroVideo)}")` : FALLBACK;

  if (watchId) return <LiveWatch sessionId={watchId} onClose={() => setParams({}, { replace: true })} />;

  return (
    <div className="m-stack m-tv">
      <div aria-hidden="true" className="m-tv-hero" style={{ backgroundImage: `linear-gradient(180deg, rgba(5,7,12,.35) 0%, rgba(5,7,12,0) 30%, rgba(5,7,12,.2) 60%, var(--m-tv-bg) 100%), ${heroImg}` }} />
      <header className="m-top" style={{ position: 'relative' }}>
        <AlfieSails size={24} light={false} />
        <div className="m-disp" style={{ flex: 1, fontSize: 22, fontWeight: 700, color: '#fff' }}><span style={{ fontWeight: 400 }}>Alfie</span>TV</div>
        <button className="m-ibtn m-ibtn-d" aria-label="Search AlfieTV" onClick={() => setSearching(true)}><Icon name="search" /></button>
        <button className="m-ibtn" style={{ padding: 0, border: 0, background: 'none' }} aria-label="Me" onClick={() => navigate('/me')}><Avatar name={name} url={profile.avatarUrl} size={36} /></button>
      </header>
      <div className="m-chips" style={{ position: 'relative' }}>
        {CHIPS.map(c => (
          <button key={c.id} className={`m-chip ${chip === c.id ? 'm-chip-on' : ''}`} style={chip === c.id ? undefined : { background: 'rgba(0,0,0,.3)', color: '#fff', borderColor: 'rgba(255,255,255,.12)' }} onClick={() => { setChip(c.id); setChannel(null); }}>
            {c.label}{c.id === 'live' && live.length ? ` ${live.length}` : ''}
          </button>
        ))}
      </div>

      {home === null ? <><div style={{ height: 150 }} /><Skeleton h={160} /><Skeleton h={120} /></> : chip === 'foryou' ? (
        <>
          <div style={{ height: 150 }} />
          {heroStream ? (
            <>
              <span className="m-live" style={{ alignSelf: 'flex-start' }}>LIVE{heroStream.club_name ? ` · ${heroStream.club_name}` : ''}</span>
              <div className="m-disp" style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.05, color: '#fff' }}>{heroStream.title}</div>
              <button className="m-btn m-btn-w" onClick={() => setParams({ watch: heroStream.id })}><Icon name="play" size={18} />Watch live</button>
            </>
          ) : heroVideo ? (
            <>
              <div className="m-disp" style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.1, color: '#fff' }}>{heroVideo.title}</div>
              <div className="m-row" style={{ gap: 8 }}>
                <button className="m-btn m-btn-w" style={{ flex: 1 }} onClick={() => setPlaying({ v: heroVideo })}><Icon name="play" size={18} />Play</button>
                <button className="m-btn m-btn-tvg" style={{ flex: 1 }} onClick={() => myList(heroVideo)}><Icon name={inList.has(heroVideo.id) ? 'check' : 'plus'} size={18} />My List</button>
              </div>
            </>
          ) : <div className="m-card m-empty">No videos yet. Channels your club follows show up here.</div>}
          {home.continueWatching.length > 0 && (
            <Row title="Continue watching">
              {home.continueWatching.map(c => <Card key={c.video.id} v={c.video} progress={c.duration ? c.position / c.duration : 0} onPlay={v => setPlaying({ v, start: c.position })} />)}
            </Row>
          )}
          {home.top.length > 0 && (
            <Row title="Top 10 this week">
              {home.top.slice(0, 10).map((v, i) => (
                <span key={v.id} className="m-row" style={{ gap: 0, alignItems: 'flex-end', flexShrink: 0 }}>
                  <span className="m-rank" aria-hidden="true">{i + 1}</span>
                  <button className="m-tv-thumb" aria-label={`${i + 1}. ${v.title}`} style={{ width: 92, height: 120, border: 0, backgroundImage: thumb(v) ? `url("${thumb(v)}")` : FALLBACK }} onClick={() => setPlaying({ v })} />
                </span>
              ))}
            </Row>
          )}
          {home.rows.map(r => <Row key={r.id} title={r.title}>{r.videos.map(v => <Card key={v.id} v={v} onPlay={x => setPlaying({ v: x })} />)}</Row>)}
          {home.latest.length > 0 && <Row title="Latest">{home.latest.map(v => <Card key={v.id} v={v} onPlay={x => setPlaying({ v: x })} />)}</Row>}
        </>
      ) : chip === 'live' ? (
        <div className="m-stack" style={{ marginTop: 8 }}>
          {live.length === 0 && (home.upcoming.length === 0) && <div className="m-card m-empty">Nothing live right now. Broadcasts show here the moment they start.</div>}
          {live.map(s => <StreamRow key={s.id} s={s} onOpen={() => setParams({ watch: s.id })} />)}
          {home.upcoming.length > 0 && <p className="m-lb" style={{ margin: '6px 0 0', color: 'rgba(235,240,255,.55)' }}>Coming up</p>}
          {home.upcoming.map(s => <StreamRow key={s.id} s={s} />)}
        </div>
      ) : chip === 'replays' ? (
        home.replays.length === 0 ? <div className="m-card m-empty" style={{ marginTop: 8 }}>Replays of broadcast races show here.</div> : (
          <div className="m-cl-grid" style={{ marginTop: 8 }}>
            {home.replays.map(r => (
              <button key={r.id} className="m-it" onClick={() => setReplay(r)}>
                <span className="m-tv-thumb" style={{ height: 96, backgroundImage: r.thumbnail_url ? `url("${r.thumbnail_url}")` : r.youtube_video_id ? `url("https://img.youtube.com/vi/${r.youtube_video_id}/hqdefault.jpg")` : FALLBACK }}>
                  {r.duration ? <span className="m-tv-dur">{duration(r.duration)}</span> : null}
                </span>
                <span className="m-ell2" style={{ fontSize: 13, fontWeight: 600 }}>{r.title}</span>
                <span style={{ fontSize: 12, color: 'rgba(235,240,255,.5)' }}>{new Date(r.recorded_at || r.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>
              </button>
            ))}
          </div>
        )
      ) : chip === 'mylist' ? (
        home.watchlist.length === 0 ? <div className="m-card m-empty" style={{ marginTop: 8 }}>Tap My List on any video to keep it here.</div> : (
          <div className="m-cl-grid" style={{ marginTop: 8 }}>{home.watchlist.map(v => <Card key={v.id} v={v} w={0} h={96} onPlay={x => setPlaying({ v: x })} />)}</div>
        )
      ) : channel ? (
        <div className="m-stack" style={{ marginTop: 8 }}>
          <button className="m-row" style={{ background: 'none', border: 0, padding: 0, color: '#fff', gap: 10 }} onClick={() => setChannel(null)}>
            <Icon name="back" /><span style={{ fontWeight: 700, fontSize: 17 }}>{channel.c.channel_name}</span>
          </button>
          {channel.videos === null ? <Skeleton h={200} /> : <div className="m-cl-grid">{channel.videos.map(v => <Card key={v.id} v={v} w={0} h={96} onPlay={x => setPlaying({ v: x })} />)}</div>}
        </div>
      ) : (
        <div className="m-card" style={{ marginTop: 8 }}>
          {home.channels.map(c => (
            <button key={c.id} className="m-li" onClick={() => openChannel(c)}>
              <Avatar name={c.channel_name} url={c.channel_thumbnail} size={40} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="m-ell" style={{ display: 'block', fontWeight: 600, fontSize: 15 }}>{c.channel_name}</span>
                {c.video_count ? <span className="m-dim" style={{ display: 'block', fontSize: 12.5 }}>{c.video_count} videos</span> : null}
              </span>
              <Icon name="chevron" className="m-dim" />
            </button>
          ))}
        </div>
      )}

      {searching && <TVSearch onClose={() => setSearching(false)} onPlay={v => { setSearching(false); setPlaying({ v }); }} />}
      {playing && <VideoPlayer v={playing.v} start={playing.start} onClose={() => { setPlaying(null); load(); }} />}
      {replay && <ReplayPlayer r={replay} onClose={() => setReplay(null)} light={light} />}
    </div>
  );
};

const StreamRow: React.FC<{ s: MStream; onOpen?: () => void }> = ({ s, onOpen }) => (
  <button className="m-card" style={{ overflow: 'hidden', padding: 0, textAlign: 'left', color: 'inherit' }} onClick={onOpen} disabled={!onOpen}>
    <span style={{ display: 'block', height: 150, position: 'relative', background: s.venue_image ? `center / cover no-repeat url("${s.venue_image}")` : FALLBACK }}>
      {onOpen ? <span className="m-live" style={{ position: 'absolute', top: 10, left: 10 }}>LIVE</span>
        : <span className="m-pill" style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(0,0,0,.55)', color: '#fff' }}>
          {s.scheduled_start_time ? new Date(s.scheduled_start_time).toLocaleString('en-AU', { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : 'Soon'}
        </span>}
    </span>
    <span style={{ display: 'block', padding: 14 }}>
      <span style={{ display: 'block', fontWeight: 700, fontSize: 16 }}>{s.title}</span>
      {s.club_name && <span className="m-dim" style={{ display: 'block', fontSize: 12.5 }}>{s.club_name}</span>}
    </span>
  </button>
);

/* ─────────────── Search ─────────────── */

const TVSearch: React.FC<{ onClose: () => void; onPlay: (v: AlfieTVVideo) => void }> = ({ onClose, onPlay }) => {
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const [res, setRes] = useState<AlfieTVVideo[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) { setRes(null); return; }
    timer.current = setTimeout(() => { searchTV(user?.id, q.trim()).then(setRes).catch(() => setRes([])); }, 300);
  }, [q, user?.id]);
  return (
    <>
      <div className="m-veil" onClick={onClose} />
      <div className="m-sheet" role="dialog" aria-label="Search AlfieTV" style={{ height: '88dvh' }}>
        <span className="m-grab" />
        <div className="m-row" style={{ marginBottom: 10 }}>
          <label className="m-search" style={{ flex: 1 }}>
            <Icon name="search" size={17} />
            <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>Search</span>
            <input autoFocus placeholder="Races, tuning, classes" value={q} onChange={e => setQ(e.target.value)} />
          </label>
          <button className="m-ibtn" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
        </div>
        {res === null ? <div className="m-empty">Search every AlfieTV channel.</div> : res.length === 0 ? <div className="m-empty">Nothing found for "{q}".</div> : (
          <div className="m-card">
            {res.map(v => (
              <button key={v.id} className="m-li" onClick={() => onPlay(v)}>
                <span className="m-thumb" style={{ width: 96, height: 54, backgroundImage: thumb(v) ? `url("${thumb(v)}")` : FALLBACK }} />
                <span className="m-ell2" style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{v.title}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

/* ─────────────── Players ─────────────── */

const VideoPlayer: React.FC<{ v: AlfieTVVideo; start?: number; onClose: () => void }> = ({ v, start, onClose }) => {
  const { user } = useAuth();
  const pos = useRef({ t: start || 0, d: v.duration || 0 });
  const opened = useRef(Date.now());
  useEffect(() => {
    const onBack = (e: Event) => { e.preventDefault(); close(); };
    window.addEventListener('alfie-native-back', onBack);
    return () => window.removeEventListener('alfie-native-back', onBack);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => {
    void recordWatch(user?.id, v, pos.current.t, pos.current.d, (Date.now() - opened.current) / 1000);
    onClose();
  };
  if (!v.youtube_id) return null;
  return (
    <Suspense fallback={null}>
      <AlfieTVPlayer videoId={v.youtube_id} title={v.title} start={start} onClose={close} onProgress={(t, d) => { pos.current = { t, d }; }} />
    </Suspense>
  );
};

const ReplayPlayer: React.FC<{ r: LivestreamArchive | { youtube_video_id: string; title: string }; onClose: () => void; light: boolean }> = ({ r, onClose }) => {
  const a = r as LivestreamArchive;
  const src = a.source === 'cloudflare' && a.cloudflare_playback_url
    ? `${a.cloudflare_playback_url}?autoplay=true&muted=false&preload=auto&letterboxColor=000000`
    : r.youtube_video_id ? `https://www.youtube.com/embed/${r.youtube_video_id}?autoplay=1&playsinline=1` : '';
  return (
    <div className="m-viewer" role="dialog" aria-label={r.title || 'Replay'}>
      <div className="m-row" style={{ padding: 'calc(var(--m-safe-top) + 8px) 16px 8px', color: '#fff' }}>
        <button className="m-ibtn m-ibtn-d" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
        <span className="m-ell" style={{ flex: 1, fontWeight: 600 }}>{r.title}</span>
      </div>
      {src ? <iframe src={src} title={r.title || 'Replay'} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
        : <div className="m-empty" style={{ color: '#fff' }}>This replay isn't available.</div>}
    </div>
  );
};

/* ─────────────── Watching live ─────────────── */

/** Hold and end, live: the same realtime + polling the desktop watch page uses. */
function useSessionState(session: MStream | null) {
  const [paused, setPaused] = useState(!!session?.is_paused);
  const [ended, setEnded] = useState(session?.status === 'ended');
  const [key, setKey] = useState(0);
  useEffect(() => {
    if (!session) return;
    setPaused(!!session.is_paused); setEnded(session.status === 'ended');
    let wasPaused = !!session.is_paused;
    const apply = (d: any) => {
      if (d.status === 'ended') setEnded(true);
      const p = !!d.is_paused;
      if (p !== wasPaused) {
        if (!p) setTimeout(() => setKey(k => k + 1), 2000);
        wasPaused = p;
        setPaused(p);
      }
    };
    const ch = supabase.channel(`m-live-${session.id}-${Date.now()}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'livestream_sessions', filter: `id=eq.${session.id}` }, (payload: any) => apply(payload.new))
      .subscribe();
    const poll = setInterval(async () => {
      const { data } = await supabase.from('livestream_sessions').select('is_paused, status').eq('id', session.id).maybeSingle();
      if (data) apply(data);
    }, 3000);
    return () => { void supabase.removeChannel(ch); clearInterval(poll); };
  }, [session?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return { paused, ended, key };
}

export const LiveWatch: React.FC<{ sessionId: string; onClose: () => void }> = ({ sessionId, onClose }) => {
  const { light } = useMobile();
  const [session, setSession] = useState<MStream | null | undefined>(undefined);
  const [tab, setTab] = useState<'race' | 'standings' | 'races'>('race');
  const [replay, setReplay] = useState<{ youtube_video_id: string; title: string } | null>(null);
  const [full, setFull] = useState(false);
  const picRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: s } = await supabase.from('livestream_sessions').select('*').eq('id', sessionId).maybeSingle();
      if (!s) { if (alive) setSession(null); return; }
      const { data: club } = await supabase.from('clubs').select('name, cover_image_url, featured_image_url').eq('id', s.club_id).maybeSingle();
      if (alive) setSession({ ...(s as any), club_name: club?.name, venue_image: club?.cover_image_url || club?.featured_image_url || undefined });
    })().catch(() => alive && setSession(null));
    return () => { alive = false; };
  }, [sessionId]);

  const { paused, ended, key } = useSessionState(session || null);
  const { companion } = useRaceCompanion(session?.event_id);
  const videos = useRaceVideos(session?.id);
  const done = videos.filter(v => raceVideoState(v) === 'ready');

  useEffect(() => {
    const onBack = (e: Event) => { e.preventDefault(); if (replay) setReplay(null); else onClose(); };
    window.addEventListener('alfie-native-back', onBack);
    return () => window.removeEventListener('alfie-native-back', onBack);
  }, [replay, onClose]);

  const goFull = async () => {
    const el = picRef.current as any;
    try {
      if (el?.requestFullscreen) await el.requestFullscreen();
      else if (el?.webkitEnterFullscreen) el.webkitEnterFullscreen();
      else setFull(f => !f);
      await (screen.orientation as any)?.lock?.('landscape').catch(() => {});
    } catch { setFull(f => !f); }
  };
  const share = async () => {
    const url = `https://alfiepro.com.au/alfie-tv?watch=${sessionId}`;
    try { if (navigator.share) await navigator.share({ title: session?.title, url }); else await navigator.clipboard.writeText(url); } catch { /* dismissed */ }
  };

  if (session === undefined) return <div className="m-stack"><Skeleton h={220} /><Skeleton h={260} /></div>;
  if (session === null) return <div className="m-stack"><button className="m-ibtn" aria-label="Back" onClick={onClose}><Icon name="back" /></button><div className="m-card m-empty">That broadcast could not be found.</div></div>;

  return (
    <div className="m-stack m-tv">
      <header className="m-top">
        <button className="m-ibtn" aria-label="Back to AlfieTV" onClick={onClose}><Icon name="back" /></button>
        <div className="m-disp" style={{ flex: 1, fontSize: 18, fontWeight: 700 }}><span style={{ fontWeight: 400 }}>Alfie</span>TV</div>
      </header>
      <div ref={picRef} className="m-live-pic" style={full ? { position: 'fixed', inset: 0, zIndex: 85, margin: 0, borderRadius: 0, aspectRatio: 'auto' } : undefined}>
        {ended || paused ? (
          <div className="m-live-card" style={{ backgroundImage: session.venue_image ? `linear-gradient(rgba(0,0,0,.55),rgba(0,0,0,.55)),url("${session.venue_image}")` : FALLBACK }}>
            <span className="m-pill" style={{ background: ended ? 'rgba(255,255,255,.18)' : '#FF9F0A', color: '#fff' }}>{ended ? 'ENDED' : 'ON HOLD'}</span>
            <div className="m-disp" style={{ fontSize: 20, fontWeight: 700 }}>{ended ? 'The broadcast has ended' : 'Racing will resume shortly'}</div>
            <div style={{ fontSize: 13, opacity: .8 }}>{ended ? 'Each race is on YouTube once it’s uploaded.' : 'Stay here: the picture comes back on its own.'}</div>
          </div>
        ) : (
          <LiveVideo key={key} session={session} muted={!!replay} compact />
        )}
        {!ended && !paused && <span className="m-live" style={{ position: 'absolute', top: 10, left: 10, zIndex: 2 }}>LIVE</span>}
        {companion && !ended && (
          <span style={{ position: 'absolute', left: 10, bottom: 10, zIndex: 2, padding: '6px 9px', borderRadius: 8, background: 'rgba(6,11,22,.6)', backdropFilter: 'blur(8px)', fontSize: 11.5, fontWeight: 600, color: '#fff' }}>
            {companion.raceLabel}{companion.statusLabel ? ` · ${companion.statusLabel}` : ''}
          </span>
        )}
        <button aria-label={full ? 'Exit full screen' : 'Full screen'} onClick={full ? () => setFull(false) : goFull}
          style={{ position: 'absolute', right: 10, bottom: 10, zIndex: 2, width: 34, height: 34, borderRadius: 9, border: 0, background: 'rgba(6,11,22,.6)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d={full ? 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5' : 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'} /></svg>
        </button>
      </div>
      <div className="m-row" style={{ gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>{session.title}</div>
          {session.club_name && <div className="m-dim" style={{ fontSize: 12.5 }}>{session.club_name}</div>}
        </div>
        <button className="m-ibtn" aria-label="Share" onClick={share}><Icon name="share" /></button>
      </div>
      <nav className="m-seg" aria-label="Live sections">
        <button className={tab === 'race' ? 'm-on' : ''} onClick={() => setTab('race')}>Race</button>
        <button className={tab === 'standings' ? 'm-on' : ''} onClick={() => setTab('standings')}>Standings</button>
        <button className={tab === 'races' ? 'm-on' : ''} onClick={() => setTab('races')}>Races{done.length ? ` ${done.length}` : ''}</button>
      </nav>
      {tab === 'race' && (
        !session.event_id || !companion ? <div className="m-card m-empty">{session.event_id ? 'Positions show here once the scorer records finishes.' : 'This broadcast isn’t linked to an event, so there are no positions.'}</div> : (
          <div className="m-card" style={{ overflow: 'hidden' }}>
            {companion.finishers.map(f => (
              <div key={`f${f.index}`} className="m-li" style={{ paddingTop: 9, paddingBottom: 9 }}>
                <span className="m-pos" style={f.position <= 3 ? { background: ['#FFD25E', '#D5DCE8', '#E8A06A'][f.position - 1], color: '#0A1020' } : undefined}>{f.position}</span>
                <span style={{ flex: 1, fontWeight: 600 }}>{f.name}</span>
                <span className="m-dim" style={{ fontSize: 12.5 }}>{f.sail}</span>
                <span style={{ fontSize: 12, color: '#5FD47F', fontWeight: 600 }}>Finished</span>
              </div>
            ))}
            {companion.stillRacing.map(b => (
              <div key={`r${b.index}`} className="m-li" style={{ paddingTop: 9, paddingBottom: 9 }}>
                <span className="m-pos">–</span>
                <span style={{ flex: 1 }}>{b.name}</span>
                <span className="m-dim" style={{ fontSize: 12.5 }}>{b.sail}</span>
                <span className="m-dim" style={{ fontSize: 12 }}>Racing</span>
              </div>
            ))}
          </div>
        )
      )}
      {tab === 'standings' && (
        !companion?.standings?.length ? <div className="m-card m-empty">{companion?.heatRacing ? 'Heat racing standings show on the event results.' : 'Standings show after the first race.'}</div> : (
          <div className="m-card" style={{ overflow: 'hidden' }}>
            {companion.standings.map(s => (
              <div key={s.index} className="m-li" style={{ paddingTop: 9, paddingBottom: 9 }}>
                <span className="m-pos" style={s.rank <= 3 ? { background: ['#FFD25E', '#D5DCE8', '#E8A06A'][s.rank - 1], color: '#0A1020' } : undefined}>{s.rank}</span>
                <span style={{ flex: 1, fontWeight: s.rank <= 3 ? 600 : 400 }}>{s.name}</span>
                <span className="m-dim" style={{ fontSize: 12.5 }}>{s.sail}</span>
                <b className="m-num" style={{ fontWeight: 600, width: 36, textAlign: 'right' }}>{s.net ?? '–'}</b>
              </div>
            ))}
          </div>
        )
      )}
      {tab === 'races' && (
        videos.length === 0 ? <div className="m-card m-empty">Each race appears here to replay once it’s uploaded.</div> : (
          <div className="m-cl-grid">
            {videos.map(v => {
              const st = raceVideoState(v);
              const title = v.race_number ? `Race ${v.race_number}` : v.segment_title || 'Race';
              const w = companion?.winners?.[v.race_number];
              return (
                <button key={v.id} className="m-it" disabled={st !== 'ready'} onClick={() => v.youtube_video_id && setReplay({ youtube_video_id: v.youtube_video_id, title })}>
                  <span className="m-tv-thumb" style={{ height: 84, backgroundImage: v.youtube_video_id ? `url("https://img.youtube.com/vi/${v.youtube_video_id}/hqdefault.jpg")` : FALLBACK }}>
                    {v.duration ? <span className="m-tv-dur">{duration(v.duration)}</span> : null}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{title}</span>
                  <span className="m-dim" style={{ fontSize: 12 }}>{st === 'live' ? 'Live now' : st === 'ready' ? (w?.sail ? `Won by ${w.sail}` : 'Replay') : st === 'failed' ? 'Video unavailable' : 'Uploading…'}</span>
                </button>
              );
            })}
          </div>
        )
      )}
      {replay && <ReplayPlayer r={replay} onClose={() => setReplay(null)} light={light} />}
    </div>
  );
};

export default TVScreen;
