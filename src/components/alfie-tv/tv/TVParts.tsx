import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AlfieIcon } from '../../brand/AlfieIcon';
import type { AlfieTVVideo } from '../../../utils/alfieTVStorage';

/* ─────────────────────────────────────────────────────────────────────────────
   AlfieTV building blocks. Everything here is presentational and lives at module
   scope so rows keep their scroll position and players don't reload on re-render.
   ───────────────────────────────────────────────────────────────────────────── */

export interface TVChannelLite {
  id: string;
  channel_name: string;
  channel_thumbnail: string;
  is_visible?: boolean;
  video_count?: number;
  subscriber_count?: number;
}

export type TVVideo = AlfieTVVideo & { progress?: number; thumbnail_high_url?: string | null; channel_name?: string };

/* ── Formatting ─────────────────────────────────────────────────────────── */

export const formatDuration = (seconds?: number | null): string => {
  if (!seconds || seconds <= 0) return '';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${Math.max(1, Math.round(seconds))}s`;
};

export const compactNumber = (n?: number | null) => {
  if (!n || n <= 0) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, '')}K`;
  return String(n);
};

export const timeAgo = (iso?: string | null) => {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '';
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days < 1) return 'Today';
  if (days < 2) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) { const w = Math.floor(days / 7); return `${w} week${w > 1 ? 's' : ''} ago`; }
  if (days < 365) { const m = Math.floor(days / 30); return `${m} month${m > 1 ? 's' : ''} ago`; }
  const y = Math.floor(days / 365);
  return `${y} year${y > 1 ? 's' : ''} ago`;
};

export const formatScheduledDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  const diffMs = date.getTime() - Date.now();
  const diffDays = Math.floor(diffMs / 86400000);
  const diffHours = Math.floor(diffMs / 3600000);
  if (diffHours < 1) return 'Starting soon';
  if (diffHours < 24) return `In ${diffHours} hour${diffHours === 1 ? '' : 's'}`;
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays < 7) return date.toLocaleDateString('en-AU', { weekday: 'long' });
  return date.toLocaleDateString('en-AU', { weekday: 'short', month: 'short', day: 'numeric' });
};

export const videoMeta = (v: TVVideo, channel?: TVChannelLite | null) =>
  [channel?.channel_name || v.channel_name, v.view_count ? `${compactNumber(v.view_count)} views` : '', timeAgo(v.published_at)]
    .filter(Boolean)
    .join(' · ');

/* ── Small pieces ───────────────────────────────────────────────────────── */

const Play: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.8v14.4a1.2 1.2 0 0 0 1.8 1.03l12-7.2a1.2 1.2 0 0 0 0-2.06l-12-7.2A1.2 1.2 0 0 0 7 4.8z" fill="currentColor" /></svg>
);
export const PlayIcon = Play;

export const InfoIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="8.6" /><path d="M12 11v5.2" /><circle cx="12" cy="7.9" r="1.05" fill="currentColor" stroke="none" />
  </svg>
);

export const VolumeIcon: React.FC<{ muted: boolean; size?: number }> = ({ muted, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" />
    {muted
      ? <path d="M16 9.5l5 5M21 9.5l-5 5" />
      : <path d="M15.8 9a4.2 4.2 0 0 1 0 6M18.4 6.6a7.6 7.6 0 0 1 0 10.8" />}
  </svg>
);

export const ChannelAvatar: React.FC<{ channel?: TVChannelLite | null; size?: number; className?: string }> = ({ channel, size = 28, className = '' }) => {
  const [broken, setBroken] = useState(false);
  const letter = (channel?.channel_name || '?').trim().charAt(0).toUpperCase();
  return (
    <span className={`atv-av ${className}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }} aria-hidden="true">
      {channel?.channel_thumbnail && !broken
        ? <img src={channel.channel_thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
        : letter}
    </span>
  );
};

/** YouTube thumbnail that falls back to the always-available medium size. */
export const TVThumb: React.FC<{ video: Pick<TVVideo, 'youtube_id' | 'thumbnail_url' | 'title'> & { thumbnail_high_url?: string | null }; eager?: boolean; className?: string }> = ({ video, eager, className = '' }) => {
  const primary = video.thumbnail_high_url || video.thumbnail_url || (video.youtube_id ? `https://i.ytimg.com/vi/${video.youtube_id}/hqdefault.jpg` : '');
  const backup = video.youtube_id ? `https://i.ytimg.com/vi/${video.youtube_id}/mqdefault.jpg` : '';
  const [src, setSrc] = useState(primary);
  useEffect(() => { setSrc(primary); }, [primary]);
  if (!src) return <span className={`atv-thumb-ph ${className}`}><AlfieIcon glyph="video" size={26} /></span>;
  return (
    <img
      src={src}
      alt={video.title || ''}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      className={`atv-thumb-img ${className}`}
      onLoad={e => { const i = e.currentTarget; if (i.naturalWidth === 120 && i.naturalHeight === 90 && backup && src !== backup) setSrc(backup); }}
      onError={() => { if (backup && src !== backup) setSrc(backup); else setSrc(''); }}
    />
  );
};

/* ── Muted YouTube previews ─────────────────────────────────────────────── */

/**
 * Tracks whether a muted YouTube embed is actually playing, so previews only fade in over the
 * thumbnail once there is video to show. Videos that can't be embedded report an error and stay
 * hidden. If the player never answers at all, it is shown after a short delay (the old behaviour).
 */
const useYouTubeReady = (frame: React.RefObject<HTMLIFrameElement>, active: boolean, fallbackMs = 2600) => {
  const [ready, setReady] = useState(false);
  const heard = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  useEffect(() => {
    setReady(false);
    heard.current = false;
    if (!active) return;
    const onMessage = (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      let d: any = e.data;
      if (typeof d === 'string') { try { d = JSON.parse(d); } catch { return; } }
      if (!d || typeof d !== 'object') return;
      heard.current = true;
      if (d.event === 'onError') { clear(); setReady(false); return; }
      const state = d.event === 'onStateChange' ? d.info : (d.event === 'infoDelivery' || d.event === 'initialDelivery') ? d.info?.playerState : undefined;
      if (state === 1) { clear(); setReady(true); }
    };
    window.addEventListener('message', onMessage);
    return () => { window.removeEventListener('message', onMessage); clear(); };
  }, [active, frame]);

  /** Call from the iframe's onLoad: asks the player to report its state. */
  const onLoad = useCallback(() => {
    clear();
    const listen = () => frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 'alfietv', channel: 'widget' }), '*');
    listen();
    timers.current.push(setTimeout(listen, 500), setTimeout(listen, 1500));
    timers.current.push(setTimeout(() => { if (!heard.current) setReady(true); }, fallbackMs));
  }, [frame, fallbackMs]);

  return { ready, onLoad };
};

/* ── Video card ─────────────────────────────────────────────────────────── */

const canHover = () => typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;

export const TVCard: React.FC<{
  video: TVVideo;
  channel?: TVChannelLite | null;
  inList?: boolean;
  onPlay: (v: TVVideo) => void;
  onToggleList?: (e: React.MouseEvent, v: TVVideo) => void;
  onInfo?: (v: TVVideo) => void;
  rank?: number;
  className?: string;
}> = ({ video, channel, inList, onPlay, onToggleList, onInfo, rank, className = '' }) => {
  const [preview, setPreview] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const previewFrame = useRef<HTMLIFrameElement>(null);
  const yt = useYouTubeReady(previewFrame, preview, 2200);

  const enter = () => {
    if (!canHover() || !video.youtube_id) return;
    timer.current = setTimeout(() => setPreview(true), 900);
  };
  const leave = () => {
    if (timer.current) clearTimeout(timer.current);
    setPreview(false);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const duration = formatDuration(video.duration);
  const progress = video.progress && video.progress > 0 ? Math.min(100, video.progress) : 0;

  return (
    <div className={`atv-card ${rank ? 'atv-card-ranked' : ''} ${className}`} onMouseEnter={enter} onMouseLeave={leave}>
      {rank ? <span className="atv-rank" aria-hidden="true">{rank}</span> : null}
      <div className="atv-card-inner">
        <div
          className="atv-card-media"
          role="button"
          tabIndex={0}
          aria-label={`Play ${video.title}`}
          onClick={() => onPlay(video)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPlay(video); } }}
        >
          <TVThumb video={video} />
          {preview && (
            <iframe
              ref={previewFrame}
              className={`atv-card-preview ${yt.ready ? 'is-ready' : ''}`}
              src={`https://www.youtube-nocookie.com/embed/${video.youtube_id}?autoplay=1&mute=1&controls=0&loop=1&playlist=${video.youtube_id}&playsinline=1&rel=0&modestbranding=1&iv_load_policy=3&disablekb=1&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`}
              allow="autoplay; encrypted-media"
              title={video.title}
              tabIndex={-1}
              onLoad={yt.onLoad}
            />
          )}
          <span className="atv-card-shade" aria-hidden="true" />
          <span className="atv-card-play" aria-hidden="true"><Play size={22} /></span>
          {duration && !yt.ready && <span className="atv-dur">{duration}</span>}
          {progress > 0 && <span className="atv-progress" aria-label={`${Math.round(progress)}% watched`}><i style={{ width: `${progress}%` }} /></span>}
          <div className="atv-card-acts">
            {onToggleList && (
              <button
                type="button"
                className={`atv-round ${inList ? 'is-on' : ''}`}
                onClick={e => { e.stopPropagation(); onToggleList(e, video); }}
                aria-label={inList ? 'Remove from My List' : 'Add to My List'}
                title={inList ? 'Remove from My List' : 'Add to My List'}
              >
                <AlfieIcon glyph={inList ? 'check' : 'plus'} size={16} strokeWidth={2.2} />
              </button>
            )}
            {onInfo && (
              <button
                type="button"
                className="atv-round"
                onClick={e => { e.stopPropagation(); onInfo(video); }}
                aria-label="More info"
                title="More info"
              >
                <AlfieIcon glyph="chev" size={17} strokeWidth={2.2} />
              </button>
            )}
          </div>
        </div>
        <div className="atv-card-text">
          {channel && <ChannelAvatar channel={channel} size={30} className="atv-card-av" />}
          <div className="min-w-0">
            <p className="atv-card-title" title={video.title}>{video.title}</p>
            <p className="atv-card-meta">{videoMeta(video, channel)}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export const TVCardSkeleton: React.FC = () => (
  <div className="atv-card atv-skel" aria-hidden="true">
    <div className="atv-card-inner">
      <div className="atv-card-media"><span className="atv-shim" /></div>
      <div className="atv-card-text">
        <span className="atv-shim atv-shim-av" />
        <div className="min-w-0 flex-1">
          <span className="atv-shim atv-shim-line" style={{ width: '90%' }} />
          <span className="atv-shim atv-shim-line" style={{ width: '55%', marginTop: 8 }} />
        </div>
      </div>
    </div>
  </div>
);

/* ── Rows ───────────────────────────────────────────────────────────────── */

export const TVRow: React.FC<{
  title: React.ReactNode;
  kicker?: React.ReactNode;
  count?: number;
  onSeeAll?: () => void;
  seeAllLabel?: string;
  className?: string;
  id?: string;
  children: React.ReactNode;
}> = ({ title, kicker, count, onSeeAll, seeAllLabel = 'See all', className = '', id, children }) => {
  const track = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft < el.scrollWidth - el.clientWidth - 4 });
  }, []);

  useLayoutEffect(() => {
    measure();
    const el = track.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, children]);

  const page = (dir: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.86, behavior: 'smooth' });
  };

  return (
    <section className={`atv-row ${className}`} id={id} aria-label={typeof title === 'string' ? title : undefined}>
      <header className="atv-row-head">
        <div className="atv-row-title">
          {kicker}
          <h2>{title}</h2>
          {typeof count === 'number' && count > 0 && <span className="atv-row-count">{count}</span>}
          {onSeeAll && (
            <button type="button" className="atv-row-all" onClick={onSeeAll}>
              {seeAllLabel}<AlfieIcon glyph="chevR" size={15} strokeWidth={2.2} />
            </button>
          )}
        </div>
        <div className="atv-row-nav">
          <button type="button" className="atv-row-btn" onClick={() => page(-1)} disabled={!edges.left} aria-label="Scroll left">
            <AlfieIcon glyph="chevL" size={18} strokeWidth={2.2} />
          </button>
          <button type="button" className="atv-row-btn" onClick={() => page(1)} disabled={!edges.right} aria-label="Scroll right">
            <AlfieIcon glyph="chevR" size={18} strokeWidth={2.2} />
          </button>
        </div>
      </header>
      <div className="atv-row-wrap">
        <div ref={track} className="atv-row-track" onScroll={measure}>
          {children}
        </div>
        {edges.left && <button type="button" className="atv-row-edge atv-row-edge-l" onClick={() => page(-1)} aria-label="Scroll left" tabIndex={-1}><AlfieIcon glyph="chevL" size={28} strokeWidth={2} /></button>}
        {edges.right && <button type="button" className="atv-row-edge atv-row-edge-r" onClick={() => page(1)} aria-label="Scroll right" tabIndex={-1}><AlfieIcon glyph="chevR" size={28} strokeWidth={2} /></button>}
      </div>
    </section>
  );
};

export const TVSkeletonRow: React.FC = () => (
  <section className="atv-row" aria-hidden="true">
    <header className="atv-row-head"><span className="atv-shim atv-shim-line" style={{ width: 200, height: 20 }} /></header>
    <div className="atv-row-wrap"><div className="atv-row-track">{[0, 1, 2, 3, 4, 5].map(i => <TVCardSkeleton key={i} />)}</div></div>
  </section>
);

/* ── Hero ───────────────────────────────────────────────────────────────── */

/** Still image with a slow drift; the muted YouTube clip fades in once it has started (desktop only). */
export const TVHeroBackdrop: React.FC<{ youtubeId?: string | null; image?: string | null; muted: boolean; tint?: 'live' | 'soon' }> = ({ youtubeId, image, muted, tint }) => {
  const [showVideo, setShowVideo] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const yt = useYouTubeReady(frame, showVideo);
  const videoReady = yt.ready;

  useEffect(() => {
    setShowVideo(false);
    if (!youtubeId || !canHover() || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const t = setTimeout(() => setShowVideo(true), 1800);
    return () => clearTimeout(t);
  }, [youtubeId]);

  useEffect(() => {
    const w = frame.current?.contentWindow;
    if (!w || !videoReady) return;
    w.postMessage(JSON.stringify({ event: 'command', func: muted ? 'mute' : 'unMute', args: [] }), '*');
    if (!muted) w.postMessage(JSON.stringify({ event: 'command', func: 'setVolume', args: [70] }), '*');
  }, [muted, videoReady]);

  const origin = typeof window !== 'undefined' ? encodeURIComponent(window.location.origin) : '';
  return (
    <div className={`atv-hero-bg ${tint ? `is-${tint}` : ''}`} aria-hidden="true">
      {image ? <img key={image} src={image} alt="" className="atv-hero-img" /> : <span className="atv-hero-fallback" />}
      {showVideo && youtubeId && (
        <div className={`atv-hero-video ${videoReady ? 'is-ready' : ''}`}>
          <iframe
            ref={frame}
            key={youtubeId}
            src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${youtubeId}&playsinline=1&rel=0&modestbranding=1&iv_load_policy=3&cc_load_policy=0&disablekb=1&fs=0&enablejsapi=1&origin=${origin}`}
            allow="autoplay; encrypted-media"
            title="Background video"
            tabIndex={-1}
            onLoad={yt.onLoad}
          />
        </div>
      )}
      <span className="atv-hero-shade" />
    </div>
  );
};

/* ── Channel & playlist tiles ───────────────────────────────────────────── */

export const TVChannelCard: React.FC<{ channel: TVChannelLite; playlists: number; onOpen: () => void; index?: number }> = ({ channel, playlists, onOpen, index = 0 }) => (
  <button type="button" className="atv-ch" onClick={onOpen} style={{ ['--i' as any]: Math.min(index, 20) }}>
    <span className="atv-ch-av"><ChannelAvatar channel={channel} size={104} /></span>
    <span className="atv-ch-name">{channel.channel_name}</span>
    <span className="atv-ch-meta">
      {[playlists > 0 ? `${playlists} playlist${playlists === 1 ? '' : 's'}` : '', channel.video_count ? `${compactNumber(channel.video_count)} videos` : '']
        .filter(Boolean).join(' · ') || 'Channel'}
    </span>
  </button>
);

export const TVPlaylistCard: React.FC<{
  playlist: { id: string; title: string; thumbnail_url?: string | null; video_count?: number; is_featured?: boolean };
  onOpen: () => void;
}> = ({ playlist, onOpen }) => (
  <button type="button" className={`atv-pl ${playlist.is_featured ? 'is-featured' : ''}`} onClick={onOpen}>
    <span className="atv-pl-stack" aria-hidden="true"><i /><i /></span>
    <span className="atv-pl-media">
      {playlist.thumbnail_url
        ? <img src={playlist.thumbnail_url} alt="" loading="lazy" />
        : <span className="atv-thumb-ph"><AlfieIcon glyph="list" size={26} /></span>}
      <span className="atv-pl-count"><AlfieIcon glyph="list" size={13} />{playlist.video_count || 0}</span>
      {playlist.is_featured && <span className="atv-badge atv-badge-amber">Featured</span>}
    </span>
    <span className="atv-pl-title">{playlist.title}</span>
  </button>
);

/* ── More info sheet ───────────────────────────────────────────────────── */

export const TVInfoSheet: React.FC<{
  video: TVVideo;
  channel?: TVChannelLite | null;
  related: TVVideo[];
  inList: boolean;
  onClose: () => void;
  onPlay: (v: TVVideo) => void;
  onToggleList?: (e: React.MouseEvent, v: TVVideo) => void;
  onOpenChannel?: () => void;
  isInList: (id: string) => boolean;
}> = ({ video, channel, related, inList, onClose, onPlay, onToggleList, onOpenChannel, isInList }) => {
  const [expanded, setExpanded] = useState(false);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => { setExpanded(false); body.current?.scrollTo?.({ top: 0 }); }, [video.id]);

  const desc = (video.description || '').trim();
  const long = desc.length > 320;
  return (
    <div className="atv-sheet-wrap" role="dialog" aria-modal="true" aria-label={video.title}>
      <div className="atv-veil" onClick={onClose} />
      <div className="atv-sheet" ref={body}>
        <div className="atv-sheet-hero">
          <TVThumb video={video} eager />
          <span className="atv-sheet-shade" />
          <button type="button" className="atv-round atv-sheet-x" onClick={onClose} aria-label="Close"><AlfieIcon glyph="x" size={18} strokeWidth={2.2} /></button>
          <div className="atv-sheet-hero-body">
            <h2 className="atv-sheet-title">{video.title}</h2>
            <div className="atv-btns">
              <button type="button" className="atv-btn atv-btn-play" onClick={() => onPlay(video)}><Play size={18} />Play</button>
              {onToggleList && (
                <button type="button" className="atv-btn atv-btn-glass" onClick={e => onToggleList(e, video)}>
                  <AlfieIcon glyph={inList ? 'check' : 'plus'} size={17} strokeWidth={2.2} />{inList ? 'In My List' : 'My List'}
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="atv-sheet-body">
          <div className="atv-sheet-meta">
            {video.published_at && <span>{new Date(video.published_at).getFullYear()}</span>}
            {formatDuration(video.duration) && <span>{formatDuration(video.duration)}</span>}
            {video.view_count ? <span>{compactNumber(video.view_count)} views</span> : null}
            {video.published_at && <span>{timeAgo(video.published_at)}</span>}
          </div>
          {channel && (
            <button type="button" className="atv-sheet-ch" onClick={onOpenChannel} disabled={!onOpenChannel}>
              <ChannelAvatar channel={channel} size={36} />
              <span><b>{channel.channel_name}</b>{onOpenChannel && <small>View channel</small>}</span>
            </button>
          )}
          {desc && (
            <div className="atv-sheet-desc">
              <p className={expanded || !long ? '' : 'is-clamped'}>{desc}</p>
              {long && <button type="button" onClick={() => setExpanded(x => !x)}>{expanded ? 'Show less' : 'Show more'}</button>}
            </div>
          )}
          {related.length > 0 && (
            <div className="atv-sheet-more">
              <h3>More from {channel?.channel_name || 'this channel'}</h3>
              <div className="atv-sheet-grid">
                {related.map(v => (
                  <TVCard key={v.id} video={v} channel={null} inList={isInList(v.id)} onPlay={onPlay} onToggleList={onToggleList} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ── Live, coming-soon and replay tiles ────────────────────────────────── */

export const TVEventTile: React.FC<{
  image?: string | null;
  title: string;
  sub?: string;
  kind: 'live' | 'soon' | 'replay';
  badge?: string;
  duration?: string;
  onClick?: () => void;
}> = ({ image, title, sub, kind, badge, duration, onClick }) => {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} className={`atv-card atv-ev is-${kind}`} onClick={onClick}>
      <span className="atv-card-inner">
        <span className="atv-card-media">
          {image ? <img src={image} alt="" loading="lazy" className="atv-thumb-img" /> : <span className={`atv-ev-ph is-${kind}`}><AlfieIcon glyph={kind === 'replay' ? 'video' : 'radio'} size={30} /></span>}
          <span className="atv-card-shade" aria-hidden="true" />
          {onClick && <span className="atv-card-play" aria-hidden="true"><Play size={22} /></span>}
          {kind === 'live' && <span className="atv-badge atv-badge-live atv-ev-tag"><i />Live</span>}
          {kind === 'soon' && badge && <span className="atv-badge atv-badge-soon atv-ev-tag"><AlfieIcon glyph="cal" size={12} />{badge}</span>}
          {duration && <span className="atv-dur">{duration}</span>}
        </span>
        <span className="atv-card-text">
          <span className="min-w-0">
            <span className="atv-card-title">{title}</span>
            {sub && <span className="atv-card-meta">{sub}</span>}
          </span>
        </span>
      </span>
    </Tag>
  );
};
