import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useImpersonation } from '../contexts/ImpersonationContext';
import { useNavigate } from 'react-router-dom';
import { LogOut, Radio, Square, Volume2, VolumeX } from 'lucide-react';
import { AlfieIcon } from '../components/brand/AlfieIcon';
import { ChannelAvatar, PlayIcon, TVCard, TVChannelCard, TVChannelLite, TVEventTile, TVInfoSheet, TVPlaylistCard, TVRow, TVSkeletonRow, TVVideo, compactNumber, formatDuration, formatScheduledDate } from '../components/alfie-tv/tv/TVParts';
import { TVHero, TVHeroSlide } from '../components/alfie-tv/tv/TVHero';

import { alfieTVStorage, AlfieTVVideo } from '../utils/alfieTVStorage';
import { useNotification } from '../contexts/NotificationContext';
import { supabase } from '../utils/supabase';
import AlfieTVAdmin from '../components/alfie-tv/AlfieTVAdmin';
import { SuggestChannelModal } from '../components/alfie-tv/SuggestChannelModal';
import { Logo } from '../components/Logo';
import { getPersonalizedVideos, trackVideoView, getUserPreferences } from '../utils/alfieTVPersonalization';
import { AdDisplay } from '../components/advertising/AdDisplay';
import type { LivestreamSession, LivestreamArchive } from '../types/livestream';

interface AlfieTVPageProps {
  darkMode?: boolean;
}

interface YouTubePlaylist {
  id: string;
  title: string;
  description: string;
  thumbnail_url: string;
  video_count: number;
  channel_id?: string;
  playlist_category?: string;
  is_featured?: boolean;
  is_visible?: boolean;
  view_count?: number;
  display_order?: number;
  published_at?: string;
  last_synced_at?: string;
}

interface Channel {
  id: string;
  channel_name: string;
  channel_thumbnail: string;
  is_visible?: boolean;
  category?: string;
  video_count?: number;
  subscriber_count?: number;
}

const LiveStreamPlayerWrapper = ({ session, onClose, venueImage, clubName }: {
  session: LivestreamSession | null;
  onClose: () => void;
  venueImage?: string;
  clubName?: string;
}) => {
  const [playerKey, setPlayerKey] = React.useState(0);
  const [isPaused, setIsPaused] = React.useState(session?.is_paused || false);
  const [isEnded, setIsEnded] = React.useState(session?.status === 'ended');
  const isPausedRef = React.useRef(session?.is_paused || false);
  const isEndedRef = React.useRef(session?.status === 'ended');

  React.useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel(`live-player-wrapper-${session.id}-${Date.now()}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'livestream_sessions',
        filter: `id=eq.${session.id}`,
      }, (payload: any) => {
        const updated = payload.new;
        const nowPaused = !!updated.is_paused;
        const nowEnded = updated.status === 'ended';
        const wasPaused = isPausedRef.current;

        if (nowEnded && !isEndedRef.current) {
          isEndedRef.current = true;
          setIsEnded(true);
        }
        if (nowPaused !== wasPaused) {
          isPausedRef.current = nowPaused;
          setIsPaused(nowPaused);
          if (!nowPaused && wasPaused) {
            setTimeout(() => setPlayerKey(k => k + 1), 2000);
          }
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.id]);

  React.useEffect(() => {
    if (!session) return;
    const pollInterval = setInterval(async () => {
      if (isEndedRef.current) return;
      try {
        const { data } = await supabase
          .from('livestream_sessions')
          .select('is_paused, status')
          .eq('id', session.id)
          .maybeSingle();
        if (data) {
          const nowPaused = !!data.is_paused;
          const nowEnded = data.status === 'ended';
          const wasPaused = isPausedRef.current;

          if (nowEnded && !isEndedRef.current) {
            isEndedRef.current = true;
            setIsEnded(true);
          }
          if (nowPaused !== wasPaused) {
            isPausedRef.current = nowPaused;
            setIsPaused(nowPaused);
            if (!nowPaused && wasPaused) {
              setTimeout(() => setPlayerKey(k => k + 1), 2000);
            }
          }
        }
      } catch (_e) {}
    }, 3000);
    return () => clearInterval(pollInterval);
  }, [session?.id]);

  if (!session) return null;

  if (isPaused || isEnded) {
    const iframeEmbedUrl = session.cloudflare_customer_code && session.cloudflare_live_input_id
      ? `https://customer-${session.cloudflare_customer_code}.cloudflarestream.com/${session.cloudflare_live_input_id}/iframe`
      : null;
    if (!session.cloudflare_whip_playback_url && !iframeEmbedUrl) return null;

    return (
      <div className="fixed inset-0 bg-black" style={{ zIndex: 9000 }}>
        {venueImage && <img src={venueImage} alt="" className="absolute inset-0 w-full h-full object-cover opacity-20" />}
        <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 2 }}>
          {venueImage && <img src={venueImage} alt="" className="absolute inset-0 w-full h-full object-cover" />}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative z-10 text-center max-w-lg px-8">
            <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center mx-auto mb-6 border border-white/20">
              {isEnded ? (
                <Square className="w-8 h-8 text-white/80" />
              ) : (
                <Radio className="w-8 h-8 text-amber-400" />
              )}
            </div>
            <h2 className="text-3xl font-bold text-white mb-3">
              {isEnded ? 'Stream Ended' : 'Event on Hold'}
            </h2>
            <p className="text-white/70 text-lg mb-2">
              {isEnded
                ? 'This livestream has ended. Thank you for watching!'
                : 'The broadcast is temporarily paused. Come back soon!'}
            </p>
            <p className="text-white font-semibold text-xl mt-6">{session.title}</p>
            {clubName && <p className="text-white/60 mt-1">Hosted by {clubName}</p>}
            {isEnded && (
              <button onClick={onClose} className="mt-8 px-8 py-3 bg-white text-black font-bold rounded-lg hover:bg-white/90 transition-all">
                Back to AlfieTV
              </button>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-3 rounded-full bg-black/60 hover:bg-black/80 text-white/80 hover:text-white transition-all backdrop-blur-sm border border-white/20 hover:border-white/40"
          style={{ position: 'fixed', top: '24px', right: '24px', zIndex: 9999, cursor: 'pointer' }}
          title="Close (ESC)"
          type="button"
        >
          <LogOut className="w-7 h-7 stroke-[2.5]" />
        </button>
      </div>
    );
  }

  return (
    <>
      <LiveStreamPlayer
        key={playerKey}
        session={session}
        onClose={onClose}
        venueImage={venueImage}
        clubName={clubName}
      />
      {session.is_public === false && (
        <div
          role="status"
          className="atv-test-badge"
          style={{
            position: 'fixed', top: 80, left: 24, zIndex: 9999,
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 999,
            background: 'rgba(255,178,36,0.16)', border: '1px solid rgba(255,178,36,0.55)',
            color: '#FFD27A', font: '600 13px/1.2 "Instrument Sans", system-ui, sans-serif',
            backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', pointerEvents: 'none',
            maxWidth: 'calc(100vw - 48px)',
          }}
        >
          <span style={{ fontWeight: 800, letterSpacing: '0.08em' }}>TEST</span>
          <span>Only people with this link can see this broadcast</span>
        </div>
      )}
    </>
  );
};

const LiveStreamPlayer = React.memo(({ session, onClose, venueImage, clubName }: {
  session: LivestreamSession;
  onClose: () => void;
  venueImage?: string;
  clubName?: string;
}) => {
  const [isConnecting, setIsConnecting] = React.useState(true);
  const [connectionError, setConnectionError] = React.useState<string | null>(null);
  const [isMuted, setIsMuted] = React.useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const pcRef = React.useRef<RTCPeerConnection | null>(null);
  const retryTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const stallCheckRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = React.useRef(0);
  const isFallbackRef = React.useRef(false);
  const [usingFallback, setUsingFallback] = React.useState(false);

  const whepUrl = session.cloudflare_whip_playback_url;
  const iframeEmbedUrl = session.cloudflare_customer_code && session.cloudflare_live_input_id
    ? `https://customer-${session.cloudflare_customer_code}.cloudflarestream.com/${session.cloudflare_live_input_id}/iframe?autoplay=true&muted=false&preload=auto&letterboxColor=000000`
    : null;
  const whepUrlRef = React.useRef(whepUrl);
  const iframeEmbedUrlRef = React.useRef(iframeEmbedUrl);
  whepUrlRef.current = whepUrl;
  iframeEmbedUrlRef.current = iframeEmbedUrl;

  const cleanupConnection = React.useCallback(() => {
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    if (stallCheckRef.current) { clearTimeout(stallCheckRef.current); stallCheckRef.current = null; }
    if (pcRef.current) { pcRef.current.onconnectionstatechange = null; pcRef.current.ontrack = null; pcRef.current.close(); pcRef.current = null; }
  }, []);

  const connectWhep = React.useCallback(async () => {
    const url = whepUrlRef.current;
    if (!url) return;

    setIsConnecting(true);
    setConnectionError(null);
    if (pcRef.current) { pcRef.current.onconnectionstatechange = null; pcRef.current.ontrack = null; pcRef.current.close(); pcRef.current = null; }

    try {
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.cloudflare.com:3478' },
          { urls: 'stun:stun.l.google.com:19302' },
        ],
        bundlePolicy: 'max-bundle',
      });
      pcRef.current = pc;

      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });

      pc.ontrack = (event) => {
        if (videoRef.current && event.streams[0]) {
          videoRef.current.srcObject = event.streams[0];
          videoRef.current.play().catch(() => {});
          setIsConnecting(false);
          setConnectionError(null);
          retryCountRef.current = 0;
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc !== pcRef.current) return;
        const state = pc.connectionState;
        if (state === 'connected') {
          setIsConnecting(false);
          setConnectionError(null);
        } else if (state === 'failed' || state === 'disconnected') {
          const fallbackUrl = iframeEmbedUrlRef.current;
          if (retryCountRef.current < 10) {
            retryCountRef.current += 1;
            const delay = Math.min(retryCountRef.current * 2000, 10000);
            retryTimerRef.current = setTimeout(() => connectWhep(), delay);
          } else if (!isFallbackRef.current && fallbackUrl) {
            isFallbackRef.current = true;
            setUsingFallback(true);
            setIsConnecting(false);
          } else {
            setConnectionError('Connection lost. The stream may have ended.');
            setIsConnecting(false);
          }
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === 'complete') { resolve(); return; }
        const check = () => {
          if (pc.iceGatheringState === 'complete') {
            pc.removeEventListener('icegatheringstatechange', check);
            resolve();
          }
        };
        pc.addEventListener('icegatheringstatechange', check);
        setTimeout(() => { pc.removeEventListener('icegatheringstatechange', check); resolve(); }, 3000);
      });

      const localDesc = pc.localDescription;
      if (!localDesc) throw new Error('No local description');

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: localDesc.sdp,
      });

      if (!response.ok) {
        throw new Error(`WHEP error: ${response.status}`);
      }

      const answerSdp = await response.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
    } catch (err: any) {
      console.error('[WHEP] Connection error:', err);
      const fallbackUrl = iframeEmbedUrlRef.current;
      if (retryCountRef.current < 10) {
        retryCountRef.current += 1;
        const delay = Math.min(retryCountRef.current * 2000, 10000);
        retryTimerRef.current = setTimeout(() => connectWhep(), delay);
      } else if (!isFallbackRef.current && fallbackUrl) {
        isFallbackRef.current = true;
        setUsingFallback(true);
        setIsConnecting(false);
      } else {
        setConnectionError('Unable to connect to the live stream.');
        setIsConnecting(false);
      }
    }
  }, []);

  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  React.useEffect(() => {
    if (whepUrl) {
      connectWhep();
    } else if (iframeEmbedUrl) {
      isFallbackRef.current = true;
      setUsingFallback(true);
      setIsConnecting(false);
    }
    return () => { cleanupConnection(); };
  }, []);

  if (!whepUrl && !iframeEmbedUrl) return null;

  return (
    <div className="fixed inset-0 bg-black" style={{ zIndex: 9000 }}>
      {venueImage && (
        <img src={venueImage} alt="" className="absolute inset-0 w-full h-full object-cover opacity-20" />
      )}

      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isMuted}
        className="absolute inset-0 w-full h-full object-contain bg-black"
        style={{ zIndex: 1, display: !usingFallback ? 'block' : 'none' }}
      />

      {usingFallback && iframeEmbedUrl && (
        <iframe
          src={iframeEmbedUrl}
          className="absolute inset-0 w-full h-full"
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          title={session.title || 'Live Stream'}
          loading="eager"
          style={{ border: 'none', zIndex: 1 }}
        />
      )}

      {isConnecting && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 2 }}>
          <div className="text-center">
            <div className="w-14 h-14 border-4 border-white/20 border-t-red-500 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-white/80 text-base font-medium">Connecting to live stream...</p>
            <p className="text-white/40 text-sm mt-1">{session.title}</p>
          </div>
        </div>
      )}

      {connectionError && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 2 }}>
          <div className="text-center max-w-md px-8">
            <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-4">
              <Radio className="w-8 h-8 text-red-400" />
            </div>
            <p className="text-white/80 text-lg font-medium mb-2">{connectionError}</p>
            <button
              onClick={() => { retryCountRef.current = 0; isFallbackRef.current = false; setUsingFallback(false); connectWhep(); }}
              className="mt-4 px-6 py-2.5 bg-red-600 text-white font-bold rounded-lg hover:bg-red-500 transition-all"
            >
              Retry Connection
            </button>
          </div>
        </div>
      )}

      <button
        onClick={onClose}
        className="p-3 rounded-full bg-black/60 hover:bg-black/80 text-white/80 hover:text-white transition-all backdrop-blur-sm border border-white/20 hover:border-white/40"
        style={{ position: 'fixed', top: '24px', right: '24px', zIndex: 9999, cursor: 'pointer' }}
        title="Close (ESC)"
        type="button"
      >
        <LogOut className="w-7 h-7 stroke-[2.5]" />
      </button>

      {!usingFallback && !isConnecting && (
        <button
          onClick={() => { setIsMuted(m => !m); if (videoRef.current) videoRef.current.muted = !videoRef.current.muted; }}
          className="p-3 rounded-full bg-black/60 hover:bg-black/80 text-white/80 hover:text-white transition-all backdrop-blur-sm border border-white/20 hover:border-white/40"
          style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999, cursor: 'pointer' }}
          title={isMuted ? 'Unmute' : 'Mute'}
          type="button"
        >
          {isMuted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
        </button>
      )}

      <div
        className="bg-black/60 backdrop-blur-sm px-4 py-2 rounded-lg border border-white/10 flex items-center gap-3"
        style={{ position: 'fixed', top: '24px', left: '24px', zIndex: 9998, pointerEvents: 'none', maxWidth: '60%' }}
      >
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
        </span>
        <span className="text-white font-medium text-sm">{session.title}</span>
      </div>
    </div>
  );
});

// Fullscreen video player - lives outside the page component so the iframe never reloads on re-render.
// Uses the YouTube Player API messages to close automatically when the video ends.
const FullscreenVideoModal = React.memo(({ video, onClose }: { video: AlfieTVVideo | null; onClose: () => void }) => {
  const [currentVideo, setCurrentVideo] = React.useState<AlfieTVVideo | null>(video);
  const [chromeVisible, setChromeVisible] = React.useState(true);
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const idleRef = React.useRef<ReturnType<typeof setTimeout>>();

  React.useEffect(() => {
    if (video?.youtube_id && video.youtube_id !== currentVideo?.youtube_id) {
      setCurrentVideo(video);
    } else if (!video) {
      setCurrentVideo(null);
    }
  }, [video?.youtube_id, video]);

  // ESC closes the player
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (currentVideo) {
      window.addEventListener('keydown', handleEscape);
      return () => window.removeEventListener('keydown', handleEscape);
    }
  }, [currentVideo, onClose]);

  // Close shortly after the video ends (YouTube state 0)
  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin === 'https://www.youtube.com' || event.origin === 'https://www.youtube-nocookie.com') {
        try {
          const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          if (data.event === 'onStateChange' && data.info === 0) {
            setTimeout(() => onClose(), 1500);
          }
        } catch {
          // Ignore messages that aren't from the player
        }
      }
    };
    if (currentVideo) {
      window.addEventListener('message', handleMessage);
      return () => window.removeEventListener('message', handleMessage);
    }
  }, [currentVideo, onClose]);

  // The top bar fades away while watching and comes back when the mouse moves
  const wake = React.useCallback(() => {
    setChromeVisible(true);
    if (idleRef.current) clearTimeout(idleRef.current);
    idleRef.current = setTimeout(() => setChromeVisible(false), 3200);
  }, []);
  React.useEffect(() => {
    if (!currentVideo) return;
    wake();
    return () => { if (idleRef.current) clearTimeout(idleRef.current); };
  }, [currentVideo, wake]);

  if (!currentVideo) return null;

  const currentOrigin = window.location.origin;
  const videoUrl = `https://www.youtube-nocookie.com/embed/${currentVideo.youtube_id}?autoplay=1&controls=1&modestbranding=1&rel=0&fs=1&iv_load_policy=3&cc_load_policy=0&enablejsapi=1&playsinline=1&origin=${encodeURIComponent(currentOrigin)}`;

  return (
    <div className={`atv-player ${chromeVisible ? 'is-awake' : ''}`} style={{ zIndex: 9000 }} onMouseMove={wake}>
      <iframe
        ref={iframeRef}
        src={videoUrl}
        className="atv-player-frame"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        title={currentVideo?.title || 'Video'}
        loading="eager"
      />

      {/* Covers YouTube's logo link so viewers stay in AlfieTV */}
      <div className="atv-player-guard" />

      <div className="atv-player-top" onMouseEnter={wake}>
        <button
          type="button"
          className="atv-player-back"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          title="Back to AlfieTV (Esc)"
        >
          <AlfieIcon glyph="chevL" size={22} strokeWidth={2.2} />
          <span>Back</span>
        </button>
        <span className="atv-player-title">{currentVideo.title}</span>
      </div>
    </div>
  );
});


export default function AlfieTVPage({ darkMode = false }: AlfieTVPageProps) {
  const { user, currentClub, currentOrganization, isSuperAdmin } = useAuth();
  const { isImpersonating, session: impersonationSession } = useImpersonation();
  const effectiveUserId = isImpersonating ? impersonationSession?.targetUserId : user?.id;
  const navigate = useNavigate();
  const { addNotification } = useNotification();

  // Check if user can manage AlfieTV (admin, super admin, or association admin)
  const canManageAlfieTV = isSuperAdmin ||
    currentClub?.role === 'admin' ||
    currentOrganization?.role === 'admin' ||
    currentOrganization?.type === 'state' ||
    currentOrganization?.type === 'national';

  const [heroVideos, setHeroVideos] = useState<AlfieTVVideo[]>([]);
  const [currentHeroIndex, setCurrentHeroIndex] = useState(0);
  const [continueWatching, setContinueWatching] = useState<any[]>([]);
  const [trendingVideos, setTrendingVideos] = useState<AlfieTVVideo[]>([]);
  const [playlists, setPlaylists] = useState<YouTubePlaylist[]>([]);
  const [playlistVideos, setPlaylistVideos] = useState<{ [key: string]: AlfieTVVideo[] }>({});
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [popularVideos, setPopularVideos] = useState<AlfieTVVideo[]>([]);
  const [latestVideos, setLatestVideos] = useState<AlfieTVVideo[]>([]);
  const [featuredVideos, setFeaturedVideos] = useState<AlfieTVVideo[]>([]);
  const [personalizedVideos, setPersonalizedVideos] = useState<AlfieTVVideo[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['rc_yachting', 'full_size_yachting', 'sailing_education', 'racing', 'general']);
  const [selectedPlaylistCategory, setSelectedPlaylistCategory] = useState<string>('all');
  const [heroMuted, setHeroMuted] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState<AlfieTVVideo | null>(null);
  const [videoStartTime, setVideoStartTime] = useState<number>(0);
  const [currentView, setCurrentView] = useState<'home' | 'channels' | 'mylist' | 'settings'>('home');
  const [watchlist, setWatchlist] = useState<AlfieTVVideo[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [showSuggestChannel, setShowSuggestChannel] = useState(false);
  const [liveStreams, setLiveStreams] = useState<(LivestreamSession & { venue_image?: string; club_name?: string })[]>([]);
  const [upcomingStreams, setUpcomingStreams] = useState<(LivestreamSession & { venue_image?: string; club_name?: string })[]>([]);
  const [replayArchives, setReplayArchives] = useState<LivestreamArchive[]>([]);
  const [selectedLiveStream, setSelectedLiveStream] = useState<(LivestreamSession & { venue_image?: string; club_name?: string }) | null>(null);
  const [selectedReplay, setSelectedReplay] = useState<LivestreamArchive | null>(null);
  // Esc closes the replay player, like the video player
  useEffect(() => {
    if (!selectedReplay) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedReplay(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedReplay]);
  const heroVideoRef = useRef<HTMLVideoElement>(null);
  const [infoVideo, setInfoVideo] = useState<TVVideo | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [channelQuery, setChannelQuery] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Get organization ID for both clubs and associations
  const organizationId = currentClub?.clubId || currentOrganization?.id;
  const organizationType = currentOrganization?.type || 'club';

  // Stabilize the close handler to prevent unnecessary re-renders
  const handleCloseVideo = useCallback(async () => {
    // Track viewing duration before closing
    if (selectedVideo && user && videoStartTime > 0) {
      const watchDuration = Math.floor((Date.now() - videoStartTime) / 1000); // Convert to seconds
      if (watchDuration > 5) { // Only track if watched for more than 5 seconds
        await trackVideoView(
          selectedVideo.id,
          selectedVideo.channel_id,
          watchDuration
        );
      }
    }
    setSelectedVideo(null);
    setVideoStartTime(0);
  }, [selectedVideo, user, videoStartTime]);

  // Load cached data immediately, then refresh in background
  useEffect(() => {
    if (organizationId) {
      loadCachedData();
    }
    loadContent();
  }, [organizationId]);

  useEffect(() => {
    const enrichStreamsWithClubData = async (streams: LivestreamSession[]) => {
      const clubIds = [...new Set(streams.map(s => s.club_id))];
      if (clubIds.length === 0) return streams;
      const { data: clubs } = await supabase
        .from('clubs')
        .select('id, name, cover_image_url, featured_image_url')
        .in('id', clubIds);
      const clubMap = new Map((clubs || []).map(c => [c.id, c]));

      const eventIds = streams
        .map(s => s.event_id)
        .filter((id): id is string => !!id);
      const rawEventIds = eventIds.map(id => id.replace(/-round-\d+$/, '').replace(/-day-\d+$/, ''));
      const uniqueEventIds = [...new Set(rawEventIds)];

      const venueImageMap = new Map<string, string>();

      if (uniqueEventIds.length > 0) {
        const { data: publicEvents } = await supabase
          .from('public_events')
          .select('id, venue_id')
          .in('id', uniqueEventIds);

        const matchedPublicEventIds = new Set((publicEvents || []).map(e => e.id));
        const venueIds = (publicEvents || []).map(e => e.venue_id).filter((id): id is string => !!id);

        if (venueIds.length > 0) {
          const { data: venues } = await supabase
            .from('venues')
            .select('id, name, image')
            .in('id', [...new Set(venueIds)]);
          if (venues) {
            const venueById = new Map(venues.map(v => [v.id, v]));
            for (const event of (publicEvents || [])) {
              if (event.venue_id && venueById.has(event.venue_id)) {
                const v = venueById.get(event.venue_id)!;
                if (v.image) venueImageMap.set(event.id, v.image);
              }
            }
          }
        }

        const unmatchedIds = uniqueEventIds.filter(id => !matchedPublicEventIds.has(id));
        if (unmatchedIds.length > 0) {
          const { data: quickRaces } = await supabase
            .from('quick_races')
            .select('id, race_venue, club_id')
            .in('id', unmatchedIds);

          if (quickRaces && quickRaces.length > 0) {
            const venueNames = quickRaces
              .map(r => r.race_venue)
              .filter((name): name is string => !!name && name.trim() !== '');
            const raceClubIds = quickRaces.map(r => r.club_id).filter((id): id is string => !!id);
            const allClubIds = [...new Set([...clubIds, ...raceClubIds])];

            if (venueNames.length > 0) {
              const { data: clubVenueRows } = await supabase
                .from('club_venues')
                .select('venue_id, club_id')
                .in('club_id', allClubIds);

              if (clubVenueRows && clubVenueRows.length > 0) {
                const cvVenueIds = [...new Set(clubVenueRows.map(cv => cv.venue_id))];
                const { data: allVenues } = await supabase
                  .from('venues')
                  .select('id, name, image')
                  .in('id', cvVenueIds);

                if (allVenues) {
                  const venueByName = new Map<string, typeof allVenues[0]>();
                  for (const v of allVenues) {
                    if (v.name) venueByName.set(v.name.toLowerCase().trim(), v);
                  }
                  for (const race of quickRaces) {
                    if (race.race_venue) {
                      const venue = venueByName.get(race.race_venue.toLowerCase().trim());
                      if (venue?.image) venueImageMap.set(race.id, venue.image);
                    }
                  }
                }
              }
            }
          }
        }
      }

      return streams.map(s => {
        const club = clubMap.get(s.club_id);
        let venueImage: string | undefined;
        if (s.event_id) {
          const baseEventId = s.event_id.replace(/-round-\d+$/, '').replace(/-day-\d+$/, '');
          venueImage = venueImageMap.get(s.event_id) || venueImageMap.get(baseEventId);
        }
        if (!venueImage) {
          venueImage = club?.cover_image_url || club?.featured_image_url || undefined;
        }
        return {
          ...s,
          venue_image: venueImage,
          club_name: club?.name || undefined,
        };
      });
    };

    const loadLiveStreams = async () => {
      try {
        // Only broadcasts that are actually live. A studio in Preview ('testing') isn't
        // sending video yet, and test broadcasts (is_public false) open from their link only.
        const { data } = await supabase
          .from('livestream_sessions')
          .select('*')
          .eq('status', 'live')
          .eq('is_public', true)
          .not('cloudflare_live_input_id', 'is', null)
          .not('cloudflare_customer_code', 'is', null)
          .order('actual_start_time', { ascending: false });
        const liveWithVenues = await enrichStreamsWithClubData(data || []);
        setLiveStreams(liveWithVenues);

        const oneWeekFromNow = new Date();
        oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);
        const { data: upcoming } = await supabase
          .from('livestream_sessions')
          .select('*')
          .eq('status', 'scheduled')
          .eq('is_public', true)
          .not('scheduled_start_time', 'is', null)
          .gte('scheduled_start_time', new Date().toISOString())
          .lte('scheduled_start_time', oneWeekFromNow.toISOString())
          .order('scheduled_start_time', { ascending: true })
          .limit(3);
        const upcomingWithVenues = await enrichStreamsWithClubData(upcoming || []);
        setUpcomingStreams(upcomingWithVenues);

        const { data: archives } = await supabase
          .from('livestream_archives')
          .select('*')
          .eq('is_public', true)
          .or('youtube_url.not.is.null,cloudflare_playback_url.not.is.null')
          .not('duration', 'is', null)
          .gt('duration', 0)
          .order('recorded_at', { ascending: false })
          .limit(20);
        setReplayArchives(archives || []);
      } catch (err) {
        console.error('Error loading live streams:', err);
      }
    };
    loadLiveStreams();
    const interval = setInterval(loadLiveStreams, 30000);
    return () => clearInterval(interval);
  }, []);

  // Open a broadcast straight from its link: /alfie-tv?watch=<sessionId>.
  // The studio's "Watch test" uses this so a test broadcast can be checked on any
  // device before it's public. If it isn't live yet, it opens as soon as it is.
  useEffect(() => {
    const watchId = new URLSearchParams(window.location.search).get('watch');
    if (!watchId) return;
    let cancelled = false;
    let waitTimer: ReturnType<typeof setInterval> | null = null;
    let toldWaiting = false;

    const tryOpen = async (): Promise<boolean> => {
      const { data: s } = await supabase
        .from('livestream_sessions')
        .select('*')
        .eq('id', watchId)
        .maybeSingle();
      if (cancelled) return true;
      if (!s) {
        addNotification('error', 'That broadcast could not be found.');
        return true;
      }
      if (s.status !== 'live') {
        if (s.status === 'ended' || s.status === 'archived') {
          addNotification('info', 'That broadcast has ended.');
          return true;
        }
        if (!toldWaiting) {
          toldWaiting = true;
          addNotification('info', 'This broadcast isn\'t live yet. It will open here as soon as it starts.');
        }
        return false;
      }
      const { data: club } = await supabase
        .from('clubs')
        .select('name, cover_image_url, featured_image_url')
        .eq('id', s.club_id)
        .maybeSingle();
      if (cancelled) return true;
      setSelectedLiveStream({
        ...(s as LivestreamSession),
        club_name: club?.name || undefined,
        venue_image: club?.cover_image_url || club?.featured_image_url || undefined,
      });
      return true;
    };

    tryOpen().then(done => {
      if (done || cancelled) return;
      waitTimer = setInterval(async () => {
        if (await tryOpen()) {
          if (waitTimer) clearInterval(waitTimer);
          waitTimer = null;
        }
      }, 5000);
    }).catch(err => console.error('Error opening broadcast link:', err));

    return () => {
      cancelled = true;
      if (waitTimer) clearInterval(waitTimer);
    };
  }, []);

  const loadCachedData = () => {
    try {
      const cacheKey = `alfietv_cache_${organizationId}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const data = JSON.parse(cached);
        const cacheAge = Date.now() - data.timestamp;
        // Use cache if less than 5 minutes old
        if (cacheAge < 5 * 60 * 1000) {
          setHeroVideos(data.heroVideos || []);
          setPlaylists(data.playlists || []);
          setPlaylistVideos(data.playlistVideos || {});
          setChannels(data.channels || []);
          setContinueWatching(data.continueWatching || []);
          setLoading(false);
        }
      }
      // Load saved category preferences
      const savedCategories = localStorage.getItem(`alfietv_categories_${organizationId}`);
      if (savedCategories) {
        setSelectedCategories(JSON.parse(savedCategories));
      }
    } catch (error) {
      console.error('Error loading cached data:', error);
    }
  };

  const saveCachedData = (data: any) => {
    try {
      const cacheKey = `alfietv_cache_${organizationId}`;
      localStorage.setItem(cacheKey, JSON.stringify({
        ...data,
        timestamp: Date.now()
      }));
    } catch (error) {
      console.error('Error saving cached data:', error);
    }
  };

  const loadPlaylistVideosForChannel = async (channelId: string) => {
    const channelPlaylists = playlists.filter(p => p.channel_id === channelId);
    const unloadedPlaylists = channelPlaylists.filter(p => !playlistVideos[p.id]);
    if (unloadedPlaylists.length === 0) return;

    const newVideoMap: { [key: string]: AlfieTVVideo[] } = {};
    const promises = unloadedPlaylists.map(async (playlist) => {
      const { data: playlistVideoIds } = await supabase
        .from('alfie_tv_youtube_playlist_videos')
        .select('video_id')
        .eq('youtube_playlist_id', playlist.id)
        .order('position')
        .limit(10);

      if (playlistVideoIds && playlistVideoIds.length > 0) {
        const orderedIds = playlistVideoIds.map(pv => pv.video_id);
        const { data: videos } = await supabase
          .from('alfie_tv_videos')
          .select('*')
          .in('id', orderedIds);
        const idToIndex = new Map(orderedIds.map((id, i) => [id, i]));
        const sorted = (videos || []).sort((a, b) => (idToIndex.get(a.id) ?? 99) - (idToIndex.get(b.id) ?? 99));
        return { playlistId: playlist.id, videos: sorted };
      }
      return { playlistId: playlist.id, videos: [] };
    });

    const results = await Promise.all(promises);
    results.forEach(r => { newVideoMap[r.playlistId] = r.videos; });
    setPlaylistVideos(prev => ({ ...prev, ...newVideoMap }));
  };

  const handleSelectChannel = (channelId: string | null) => {
    setSelectedChannelId(channelId);
    if (channelId) {
      loadPlaylistVideosForChannel(channelId);
    }
  };

  type HeroSlide =
    | { type: 'live'; stream: LivestreamSession & { venue_image?: string; club_name?: string } }
    | { type: 'upcoming'; stream: LivestreamSession & { venue_image?: string; club_name?: string } }
    | { type: 'video'; video: AlfieTVVideo };

  const heroSlides = useMemo<HeroSlide[]>(() => {
    const slides: HeroSlide[] = [];
    liveStreams.forEach(s => slides.push({ type: 'live', stream: s }));
    upcomingStreams.forEach(s => slides.push({ type: 'upcoming', stream: s }));
    heroVideos.forEach(v => slides.push({ type: 'video', video: v }));
    return slides;
  }, [liveStreams, upcomingStreams, heroVideos]);

  useEffect(() => {
    if (heroSlides.length === 0) return;
    if (currentHeroIndex >= heroSlides.length) setCurrentHeroIndex(0);

    const interval = setInterval(() => {
      setCurrentHeroIndex((prev) => (prev + 1) % heroSlides.length);
    }, 30000);

    return () => clearInterval(interval);
  }, [heroSlides.length]);

  const loadContent = async () => {
    setLoading(true);
    try {
      // Load channels with visibility
      // For clubs: load club-specific and global channels
      // For associations or standalone: only load global channels
      let channelsQuery = supabase
        .from('alfie_tv_channels')
        .select('id, channel_name, channel_thumbnail, is_visible, category, is_global, video_count, subscriber_count')
        .order('channel_name');

      if (organizationType === 'club' && currentClub?.clubId) {
        channelsQuery = channelsQuery.or(`club_id.eq.${currentClub.clubId},is_global.eq.true`);
      } else {
        // For associations or standalone race officers, only show global channels
        channelsQuery = channelsQuery.eq('is_global', true);
      }

      const { data: channelsData, error: channelsError } = await channelsQuery;

      if (channelsError) {
        console.error('Error loading channels:', channelsError);
      }

      if (channelsData) {
        setChannels(channelsData);
      }

      // Load YouTube playlists (all visible playlists, no limit)
      const { data: playlistsData } = await supabase
        .from('alfie_tv_youtube_playlists')
        .select(`
          id,
          title,
          description,
          thumbnail_url,
          video_count,
          channel_id,
          playlist_category,
          is_featured,
          is_visible,
          view_count,
          display_order,
          published_at,
          last_synced_at
        `)
        .in('channel_id', channelsData?.map(c => c.id) || [])
        .eq('is_visible', true)
        .order('is_featured', { ascending: false })
        .order('published_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });

      // Initialize playlistVideoMap
      let playlistVideoMap: { [key: string]: AlfieTVVideo[] } = {};

      if (playlistsData) {
        setPlaylists(playlistsData);

        // Load videos for top playlists (featured first, then by video count)
        const sortedForVideoLoad = [...playlistsData]
          .sort((a, b) => {
            if (a.is_featured && !b.is_featured) return -1;
            if (!a.is_featured && b.is_featured) return 1;
            return (b.video_count || 0) - (a.video_count || 0);
          })
          .slice(0, 40);

        const playlistVideoPromises = sortedForVideoLoad.map(async (playlist) => {
          const { data: playlistVideoIds } = await supabase
            .from('alfie_tv_youtube_playlist_videos')
            .select('video_id')
            .eq('youtube_playlist_id', playlist.id)
            .order('position')
            .limit(10);

          if (playlistVideoIds && playlistVideoIds.length > 0) {
            const orderedIds = playlistVideoIds.map(pv => pv.video_id);
            const { data: videos } = await supabase
              .from('alfie_tv_videos')
              .select('*')
              .in('id', orderedIds);
            const idToIndex = new Map(orderedIds.map((id, i) => [id, i]));
            const sorted = (videos || []).sort((a, b) => (idToIndex.get(a.id) ?? 99) - (idToIndex.get(b.id) ?? 99));
            return { playlistId: playlist.id, videos: sorted };
          }
          return { playlistId: playlist.id, videos: [] };
        });

        const playlistVideoResults = await Promise.all(playlistVideoPromises);
        playlistVideoResults.forEach(result => {
          playlistVideoMap[result.playlistId] = result.videos;
        });
        setPlaylistVideos(playlistVideoMap);
      }

      // Get visible channel IDs
      const visibleChannelIds = channelsData?.filter(c => c.is_visible !== false).map(c => c.id) || [];

      // If no visible channels, set empty arrays and return early
      if (visibleChannelIds.length === 0) {
        setHeroVideos([]);
        setPopularVideos([]);
        setLatestVideos([]);
        setFeaturedVideos([]);
        setTrendingVideos([]);
        setPersonalizedVideos([]);
        return;
      }

      // Load hero videos (featured videos for hero carousel)
      let featured: AlfieTVVideo[] = [];
      if (organizationId) {
        featured = await alfieTVStorage.getFeaturedVideos(organizationId);
      }
      if (featured.length === 0) {
        // If no featured, get latest videos from visible channels
        const { data: latestHero } = await supabase
          .from('alfie_tv_videos')
          .select('*')
          .in('channel_id', visibleChannelIds)
          .order('published_at', { ascending: false })
          .limit(5);
        setHeroVideos(latestHero || []);
      } else {
        setHeroVideos(featured.filter(v => visibleChannelIds.includes(v.channel_id)));
      }

      // Load Popular Videos (most viewed from visible channels)
      const { data: popular } = await supabase
        .from('alfie_tv_videos')
        .select('*')
        .in('channel_id', visibleChannelIds)
        .order('view_count', { ascending: false })
        .limit(20);
      setPopularVideos(popular || []);

      // Load Latest Videos (by publish date from visible channels)
      const { data: latest } = await supabase
        .from('alfie_tv_videos')
        .select('*')
        .in('channel_id', visibleChannelIds)
        .order('published_at', { ascending: false })
        .limit(20);
      setLatestVideos(latest || []);

      // Load Featured Videos (marked as featured from visible channels)
      const { data: featuredVids } = await supabase
        .from('alfie_tv_videos')
        .select('*')
        .in('channel_id', visibleChannelIds)
        .eq('is_featured', true)
        .order('published_at', { ascending: false })
        .limit(20);
      setFeaturedVideos(featuredVids || []);

      // Load trending videos from visible channels
      const trending = organizationId ? await alfieTVStorage.getTrendingVideos(organizationId, 10) : [];
      setTrendingVideos(trending.filter(v => visibleChannelIds.includes(v.channel_id)));

      // Load personalized videos for authenticated users
      if (user) {
        const { data: personalizedVids } = await getPersonalizedVideos(20);
        if (personalizedVids && personalizedVids.length > 0) {
          setPersonalizedVideos(personalizedVids.filter(v => visibleChannelIds.includes(v.channel_id)));
        }
      }

      // Load continue watching and watchlist
      let continueData: any[] = [];
      if (user) {
        continueData = await alfieTVStorage.getContinueWatching(user.id);
        setContinueWatching(continueData);

        // Load watchlist
        const { data: watchlistData } = await supabase
          .from('alfie_tv_watchlist')
          .select(`
            alfie_tv_videos (
              id,
              youtube_id,
              title,
              description,
              thumbnail_url,
              thumbnail_high_url,
              duration,
              view_count
            )
          `)
          .eq('user_id', effectiveUserId!)
          .order('added_at', { ascending: false });

        if (watchlistData) {
          setWatchlist(watchlistData
            .filter(item => item.alfie_tv_videos)
            .map(item => item.alfie_tv_videos as unknown as AlfieTVVideo));
        }
      }

      // Save to cache
      saveCachedData({
        heroVideos: featured.length > 0 ? featured : (await supabase.from('alfie_tv_videos').select('*').order('published_at', { ascending: false }).limit(5)).data || [],
        playlists: playlistsData || [],
        playlistVideos: playlistVideoMap,
        channels: channelsData || [],
        continueWatching: continueData
      });
    } catch (error) {
      console.error('Error loading content:', error);
      addNotification('error', 'Failed to load content');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (query: string) => {
    if (!user || !query.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      const results = await alfieTVStorage.searchVideos(user.id, query);
      setSearchResults(results);

      // Save search history
      await alfieTVStorage.saveSearchHistory(user.id, query, results.length);
    } catch (error) {
      console.error('Error searching:', error);
      addNotification('error', 'Search failed');
    }
  };

  // Debounce search
  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(() => {
      handleSearch(searchTerm);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  const handleVideoClick = (video: AlfieTVVideo) => {
    setSelectedVideo(video);
    setVideoStartTime(Date.now()); // Record when video starts
  };

  const handleAddToWatchlist = async (e: React.MouseEvent, video: AlfieTVVideo) => {
    e.stopPropagation();
    if (!user) return;

    try {
      // Check if already in watchlist
      const inWatchlist = await alfieTVStorage.isInWatchlist(user.id, video.id);

      if (inWatchlist) {
        await alfieTVStorage.removeFromWatchlist(user.id, video.id);
        setWatchlist(prev => prev.filter(v => v.id !== video.id));
        addNotification('success', 'Removed from My List');
      } else {
        await alfieTVStorage.addToWatchlist(user.id, video.id);
        setWatchlist(prev => [video, ...prev]);
        addNotification('success', 'Added to My List');
      }
    } catch (error) {
      console.error('Error updating watchlist:', error);
      addNotification('error', 'Failed to update My List');
    }
  };

  /* ── Derived data for the new layout ─────────────────────────────────── */

  const listIds = useMemo(() => new Set(watchlist.map(v => v.id)), [watchlist]);
  const isInList = useCallback((id: string) => listIds.has(id), [listIds]);
  const channelById = useMemo(() => new Map(channels.map(c => [c.id, c])), [channels]);
  const channelOf = useCallback((id?: string | null) => (id ? (channelById.get(id) as TVChannelLite | undefined) || null : null), [channelById]);
  const playlistCountByChannel = useMemo(() => {
    const m = new Map<string, number>();
    playlists.forEach(p => { if (p.channel_id) m.set(p.channel_id, (m.get(p.channel_id) || 0) + 1); });
    return m;
  }, [playlists]);

  const allLoadedVideos = useMemo(() => {
    const seen = new Map<string, TVVideo>();
    [heroVideos, popularVideos, latestVideos, featuredVideos, trendingVideos, personalizedVideos, ...Object.values(playlistVideos)]
      .forEach(list => (list || []).forEach(v => { if (v?.id && !seen.has(v.id)) seen.set(v.id, v as TVVideo); }));
    return [...seen.values()];
  }, [heroVideos, popularVideos, latestVideos, featuredVideos, trendingVideos, personalizedVideos, playlistVideos]);

  const relatedFor = useCallback((v: TVVideo) =>
    allLoadedVideos.filter(x => x.channel_id && x.channel_id === v.channel_id && x.id !== v.id).slice(0, 9),
  [allLoadedVideos]);

  const categoryCounts = useMemo(() => {
    const m = new Map<string, number>();
    playlists.forEach(p => {
      const ch = channelById.get(p.channel_id || '');
      if (!ch || ch.is_visible === false) return;
      const key = p.playlist_category || 'general';
      m.set(key, (m.get(key) || 0) + 1);
    });
    return m;
  }, [playlists, channelById]);

  const searching = searchTerm.trim().length > 0;
  const searchMatches = useMemo(() => {
    if (!searching) return [] as TVVideo[];
    const q = searchTerm.trim().toLowerCase();
    const out = new Map<string, TVVideo>();
    (searchResults as TVVideo[]).forEach(r => { if (r?.id) out.set(r.id, r); });
    allLoadedVideos.forEach(v => {
      if (out.has(v.id)) return;
      if (v.title?.toLowerCase().includes(q) || v.description?.toLowerCase().includes(q)) out.set(v.id, v);
    });
    return [...out.values()];
  }, [searching, searchTerm, searchResults, allLoadedVideos]);

  const goView = (view: 'home' | 'channels' | 'mylist' | 'settings') => {
    setCurrentView(view);
    setSelectedChannelId(null);
    setInfoVideo(null);
    scrollRef.current?.scrollTo({ top: 0 });
  };

  const openChannel = (channelId?: string | null, playlistId?: string) => {
    if (!channelId) return;
    setInfoVideo(null);
    setSearchTerm('');
    setCurrentView('channels');
    handleSelectChannel(channelId);
    scrollRef.current?.scrollTo({ top: 0 });
    if (playlistId) {
      setTimeout(() => document.getElementById(`playlist-row-${playlistId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 450);
    }
  };

  const playFromInfo = (v: TVVideo) => {
    setInfoVideo(null);
    handleVideoClick(v);
  };

  const cardProps = (v: TVVideo) => ({
    video: v,
    channel: channelOf(v.channel_id),
    inList: isInList(v.id),
    onPlay: handleVideoClick,
    onToggleList: user ? handleAddToWatchlist : undefined,
    onInfo: (x: TVVideo) => setInfoVideo(x),
  });

  const CATEGORY_LABELS: [string, string][] = [
    ['live_events', 'Live Events'],
    ['rc_yachting', 'RC Yachting'],
    ['big_boat_yachting', 'Big Boat'],
    ['training_tips', 'Training'],
    ['highlights_recaps', 'Highlights'],
    ['event_archives', 'Archives'],
    ['general', 'General'],
  ];
  const categoryLabel = (key: string) => CATEGORY_LABELS.find(([k]) => k === key)?.[1] || 'General';

  const showSkeleton = loading && heroSlides.length === 0 && popularVideos.length === 0 && playlists.length === 0;

  /* ── Home rows ───────────────────────────────────────────────────────── */

  const renderHomeRows = () => {
    const rows: JSX.Element[] = [];
    let rowIndex = 0;

    // Ad after the 2nd row, then every 4th row (2, 6, 10, 14, ...)
    const maybeAddAd = () => {
      if (rowIndex === 2 || (rowIndex > 2 && (rowIndex - 2) % 4 === 0)) {
        rows.push(
          <div key={`ad-${rowIndex}`} className="atv-ad">
            <AdDisplay
              position="hero"
              pageType="alfie_tv"
              className="mx-auto"
              state={currentClub?.state}
              clubId={currentClub?.clubId}
              instanceId={`alfie-tv-${rowIndex}`}
            />
          </div>
        );
      }
    };
    const push = (el: JSX.Element, ad = true) => { rows.push(el); rowIndex++; if (ad) maybeAddAd(); };

    const playlistRow = (playlist: YouTubePlaylist, videos: AlfieTVVideo[], keyPrefix = '') => {
      const channel = channelOf(playlist.channel_id);
      return (
        <TVRow
          key={`${keyPrefix}${playlist.id}`}
          title={playlist.title}
          kicker={channel ? <ChannelAvatar channel={channel} size={26} /> : undefined}
          onSeeAll={channel ? () => openChannel(playlist.channel_id, playlist.id) : undefined}
          seeAllLabel={channel ? channel.channel_name : 'See all'}
        >
          {videos.map(v => <TVCard key={v.id} {...cardProps(v as TVVideo)} />)}
        </TVRow>
      );
    };

    if (selectedPlaylistCategory !== 'all') {
      // Browsing one kind of playlist: just those playlists, biggest first
      playlists
        .filter(p => p.playlist_category === selectedPlaylistCategory || (selectedPlaylistCategory === 'general' && !p.playlist_category))
        .filter(p => { const ch = channelById.get(p.channel_id || ''); return !!ch && ch.is_visible !== false; })
        .sort((a, b) => {
          if (a.is_featured && !b.is_featured) return -1;
          if (!a.is_featured && b.is_featured) return 1;
          return (b.video_count || 0) - (a.video_count || 0);
        })
        .forEach(p => {
          const videos = playlistVideos[p.id] || [];
          if (videos.length > 0) push(playlistRow(p, videos, 'cat-'));
        });
      if (rows.length === 0) {
        rows.push(
          <div key="cat-empty" className="atv-empty">
            <span className="atv-empty-ic"><AlfieIcon glyph="list" size={28} /></span>
            <h3>No {categoryLabel(selectedPlaylistCategory)} playlists yet</h3>
            <p>Try another category, or browse everything.</p>
            <button type="button" className="atv-btn atv-btn-glass" onClick={() => setSelectedPlaylistCategory('all')}>Show everything</button>
          </div>
        );
      }
      return rows;
    }

    if (liveStreams.length > 1) {
      push(
        <TVRow key="more-live" title="Also live" kicker={<span className="atv-live-dot" aria-hidden="true" />}>
          {liveStreams.slice(1).map(stream => (
            <TVEventTile
              key={stream.id}
              kind="live"
              image={stream.venue_image}
              title={stream.title}
              sub={stream.club_name ? `Hosted by ${stream.club_name}` : stream.description || undefined}
              onClick={() => setSelectedLiveStream(stream)}
            />
          ))}
        </TVRow>,
        false
      );
    }

    const streamsToShow = liveStreams.length === 0 ? upcomingStreams.slice(1) : upcomingStreams;
    if (streamsToShow.length > 0) {
      push(
        <TVRow key="upcoming-streams" title="Coming soon" kicker={<span className="atv-row-ic is-soon"><AlfieIcon glyph="cal" size={15} /></span>}>
          {streamsToShow.map(stream => (
            <TVEventTile
              key={stream.id}
              kind="soon"
              image={stream.venue_image}
              title={stream.title}
              badge={formatScheduledDate(stream.scheduled_start_time!)}
              sub={new Date(stream.scheduled_start_time!).toLocaleDateString('en-AU', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            />
          ))}
        </TVRow>,
        false
      );
    }

    if (continueWatching.length > 0) {
      push(
        <TVRow key="continue-watching" title="Continue watching">
          {continueWatching.filter(item => item.video).map(item => {
            const v = { ...item.video, progress: item.video.duration ? (item.watch_position / item.video.duration) * 100 : 0 } as TVVideo;
            return <TVCard key={v.id} {...cardProps(v)} />;
          })}
        </TVRow>
      );
    }

    if (user && personalizedVideos.length > 0) {
      push(
        <TVRow key="for-you" title="For you" kicker={<span className="atv-row-ic is-spark"><AlfieIcon glyph="spark" size={15} /></span>}>
          {personalizedVideos.map(v => <TVCard key={v.id} {...cardProps(v as TVVideo)} />)}
        </TVRow>
      );
    }

    if (popularVideos.length > 0) {
      push(
        <TVRow key="popular" title="Top 10 on AlfieTV" className="atv-row-ranked">
          {popularVideos.slice(0, 10).map((v, i) => <TVCard key={v.id} rank={i + 1} {...cardProps(v as TVVideo)} />)}
        </TVRow>
      );
    }

    if (trendingVideos.length > 0) {
      push(
        <TVRow key="trending" title="Trending now" kicker={<span className="atv-row-ic is-trend"><AlfieIcon glyph="trend" size={15} /></span>}>
          {trendingVideos.map(v => <TVCard key={v.id} {...cardProps(v as TVVideo)} />)}
        </TVRow>
      );
    }

    if (replayArchives.length > 0) {
      push(
        <TVRow key="race-replays" title="Race replays" kicker={<span className="atv-row-ic is-replay"><AlfieIcon glyph="video" size={15} /></span>}>
          {replayArchives.map(archive => (
            <TVEventTile
              key={archive.id}
              kind="replay"
              image={archive.thumbnail_url}
              title={archive.title}
              duration={archive.duration ? formatDuration(archive.duration) : undefined}
              sub={[archive.view_count > 0 ? `${compactNumber(archive.view_count)} views` : '', new Date(archive.recorded_at).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })].filter(Boolean).join(' · ')}
              onClick={() => setSelectedReplay(archive)}
            />
          ))}
        </TVRow>
      );
    }

    if (latestVideos.length > 0) {
      push(
        <TVRow key="latest" title="New on AlfieTV" kicker={<span className="atv-badge atv-badge-spectrum atv-badge-sm">New</span>}>
          {latestVideos.map(v => <TVCard key={v.id} {...cardProps(v as TVVideo)} />)}
        </TVRow>
      );
    }

    if (featuredVideos.length > 0) {
      push(
        <TVRow key="featured" title="Featured" kicker={<span className="atv-row-ic is-star"><AlfieIcon glyph="star" size={15} /></span>}>
          {featuredVideos.map(v => <TVCard key={v.id} {...cardProps(v as TVVideo)} />)}
        </TVRow>
      );
    }

    // Featured playlists first, then every other playlist by size
    const featuredPlaylists = playlists.filter(p => p.is_featured);
    featuredPlaylists.forEach(playlist => {
      const videos = playlistVideos[playlist.id] || [];
      if (videos.length > 0) push(playlistRow(playlist, videos, 'featured-playlist-'));
    });

    const featuredPlaylistIds = new Set(featuredPlaylists.map(p => p.id));
    playlists
      .filter(playlist => {
        if (featuredPlaylistIds.has(playlist.id)) return false;
        const channel = channelById.get(playlist.channel_id || '');
        if (!channel) return false;
        return channel.is_visible !== false;
      })
      .sort((a, b) => (b.video_count || 0) - (a.video_count || 0))
      .forEach(playlist => {
        const videos = playlistVideos[playlist.id] || [];
        if (videos.length > 0) push(playlistRow(playlist, videos));
      });

    return rows;
  };

  /* ── Views ───────────────────────────────────────────────────────────── */

  const selectedChannel = selectedChannelId ? channelById.get(selectedChannelId) : null;
  const channelPlaylists = selectedChannelId
    ? playlists
        .filter(p => p.channel_id === selectedChannelId && p.is_visible !== false)
        .sort((a, b) => {
          if (a.is_featured && !b.is_featured) return -1;
          if (!a.is_featured && b.is_featured) return 1;
          const dateA = a.published_at || a.last_synced_at || '';
          const dateB = b.published_at || b.last_synced_at || '';
          return dateB.localeCompare(dateA);
        })
    : [];
  const filteredChannels = channelQuery.trim()
    ? channels.filter(c => c.channel_name.toLowerCase().includes(channelQuery.trim().toLowerCase()))
    : channels;
  const navSolid = scrolled || currentView !== 'home' || searching || selectedPlaylistCategory !== 'all';

  return (
    <>
    <div
      ref={scrollRef}
      className={`atv ${currentView === 'home' && !searching && heroSlides.length > 0 ? 'has-hero' : ''}`}
      onScroll={(e) => {
        const top = (e.currentTarget as HTMLDivElement).scrollTop > 24;
        if (top !== scrolled) setScrolled(top);
      }}
    >
      {/* Top bar */}
      <header className={`atv-nav ${navSolid ? 'is-solid' : ''}`}>
        <button type="button" className="atv-brand" onClick={() => { setSearchTerm(''); setSelectedPlaylistCategory('all'); goView('home'); }} aria-label="AlfieTV home">
          <Logo className="atv-logo" />
          <span className="atv-wordmark"><span>Alfie</span><b>TV</b></span>
        </button>
        <nav className="atv-tabs" aria-label="AlfieTV">
          <button type="button" className={currentView === 'home' && !searching ? 'is-on' : ''} onClick={() => { setSearchTerm(''); goView('home'); }}>Home</button>
          <button type="button" className={currentView === 'channels' ? 'is-on' : ''} onClick={() => goView('channels')}>Channels</button>
          <button type="button" className={currentView === 'mylist' ? 'is-on' : ''} onClick={() => goView('mylist')}>
            My List{watchlist.length > 0 && <span className="atv-tab-n">{watchlist.length}</span>}
          </button>
        </nav>
        <div className="atv-nav-r">
          <label className={`atv-search ${showSearch || searching ? 'is-open' : ''}`}>
            <button type="button" className="atv-search-btn" onClick={() => { setShowSearch(true); setTimeout(() => searchInputRef.current?.focus(), 30); }} aria-label="Search">
              <AlfieIcon glyph="search" size={19} />
            </button>
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Titles, channels, classes…"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                if (currentView !== 'home') { setCurrentView('home'); setSelectedChannelId(null); }
              }}
              onFocus={() => setShowSearch(true)}
              onBlur={() => { if (!searchTerm) setShowSearch(false); }}
              onKeyDown={(e) => { if (e.key === 'Escape') { setSearchTerm(''); setShowSearch(false); (e.target as HTMLInputElement).blur(); } }}
              aria-label="Search videos"
            />
            {searchTerm && (
              <button type="button" className="atv-search-x" onClick={() => { setSearchTerm(''); searchInputRef.current?.focus(); }} aria-label="Clear search">
                <AlfieIcon glyph="x" size={14} strokeWidth={2.2} />
              </button>
            )}
          </label>
          {canManageAlfieTV && (
            <button type="button" className={`atv-icon ${currentView === 'settings' ? 'is-on' : ''}`} onClick={() => goView('settings')} title="Manage AlfieTV" aria-label="Manage AlfieTV">
              <AlfieIcon glyph="gear" size={20} />
            </button>
          )}
          <button type="button" className="atv-exit" onClick={() => navigate('/dashboard')} title="Exit AlfieTV">
            <AlfieIcon glyph="out" size={18} />
            <span>Exit</span>
          </button>
        </div>
      </header>

      {/* ── Settings ── */}
      {currentView === 'settings' ? (
        <main className="atv-page atv-admin">
          <div className="atv-page-head">
            <div>
              <p className="atv-eyebrow">AlfieTV</p>
              <h1>Manage channels</h1>
              <p className="atv-sub">Add YouTube channels and videos, sync, and choose what shows on AlfieTV.</p>
            </div>
          </div>
          <AlfieTVAdmin darkMode={true} embedded />
        </main>
      ) : currentView === 'channels' ? (
        selectedChannelId ? (
          /* ── One channel ── */
          <main className="atv-chpage">
            <section className="atv-chhero">
              <div className="atv-chhero-bg" aria-hidden="true">
                {(selectedChannel?.channel_thumbnail || channelPlaylists[0]?.thumbnail_url) && (
                  <img src={selectedChannel?.channel_thumbnail || channelPlaylists[0]?.thumbnail_url} alt="" />
                )}
              </div>
              <div className="atv-chhero-in">
                <button type="button" className="atv-back" onClick={() => setSelectedChannelId(null)}>
                  <AlfieIcon glyph="chevL" size={18} strokeWidth={2.2} />All channels
                </button>
                <div className="atv-chhero-id">
                  <ChannelAvatar channel={selectedChannel as TVChannelLite} size={112} className="atv-chhero-av" />
                  <div className="min-w-0">
                    <p className="atv-eyebrow">Channel</p>
                    <h1>{selectedChannel?.channel_name}</h1>
                    <p className="atv-sub">
                      {[
                        `${channelPlaylists.length} playlist${channelPlaylists.length !== 1 ? 's' : ''}`,
                        selectedChannel?.video_count ? `${compactNumber(selectedChannel.video_count)} videos` : '',
                        selectedChannel?.subscriber_count ? `${compactNumber(selectedChannel.subscriber_count)} subscribers` : '',
                      ].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <div className="atv-page atv-page-tight">
              {channelPlaylists.length > 0 ? (
                <section className="atv-block">
                  <div className="atv-block-head"><h2>Playlists</h2><span className="atv-row-count">{channelPlaylists.length}</span></div>
                  <div className="atv-pl-grid">
                    {channelPlaylists.map(playlist => (
                      <TVPlaylistCard
                        key={playlist.id}
                        playlist={playlist}
                        onOpen={() => document.getElementById(`playlist-row-${playlist.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                      />
                    ))}
                  </div>
                </section>
              ) : (
                <div className="atv-empty">
                  <span className="atv-empty-ic"><AlfieIcon glyph="list" size={28} /></span>
                  <h3>No playlists yet</h3>
                  <p>Videos from this channel show up here once it has been synced.</p>
                </div>
              )}
            </div>

            <div className="atv-rows atv-rows-flat">
              {channelPlaylists.map(playlist => {
                const videos = playlistVideos[playlist.id] || [];
                if (videos.length === 0) return null;
                return (
                  <div key={playlist.id} id={`playlist-row-${playlist.id}`} className="atv-anchor">
                    <TVRow title={playlist.title} count={playlist.video_count}>
                      {videos.map(v => <TVCard key={v.id} {...cardProps(v as TVVideo)} />)}
                    </TVRow>
                  </div>
                );
              })}
            </div>
          </main>
        ) : (
          /* ── All channels ── */
          <main className="atv-page">
            <div className="atv-page-head">
              <div>
                <h1>Channels</h1>
                <p className="atv-sub">{channels.length} channel{channels.length === 1 ? '' : 's'} · browse content by channel</p>
              </div>
              <label className="atv-field">
                <AlfieIcon glyph="search" size={16} />
                <input type="text" value={channelQuery} onChange={(e) => setChannelQuery(e.target.value)} placeholder="Find a channel" aria-label="Find a channel" />
              </label>
            </div>
            <div className="atv-ch-grid">
              {filteredChannels.map((channel, i) => (
                <TVChannelCard
                  key={channel.id}
                  index={i}
                  channel={channel as TVChannelLite}
                  playlists={playlistCountByChannel.get(channel.id) || 0}
                  onOpen={() => openChannel(channel.id)}
                />
              ))}
              <button type="button" className="atv-ch atv-ch-suggest" onClick={() => setShowSuggestChannel(true)}>
                <span className="atv-ch-av"><span className="atv-suggest-ic"><AlfieIcon glyph="plus" size={30} /></span></span>
                <span className="atv-ch-name">Suggest a channel</span>
                <span className="atv-ch-meta">Know a great sailing channel?</span>
              </button>
            </div>
            {filteredChannels.length === 0 && channelQuery && (
              <p className="atv-sub atv-center">No channels match “{channelQuery}”.</p>
            )}
          </main>
        )
      ) : currentView === 'mylist' ? (
        /* ── My List ── */
        <main className="atv-page">
          <div className="atv-page-head">
            <div>
              <h1>My List</h1>
              <p className="atv-sub">{watchlist.length > 0 ? `${watchlist.length} video${watchlist.length === 1 ? '' : 's'} saved to watch later` : "Videos you've saved to watch later"}</p>
            </div>
          </div>
          {watchlist.length === 0 ? (
            <div className="atv-empty atv-empty-lg">
              <span className="atv-empty-ic"><AlfieIcon glyph="plus" size={30} /></span>
              <h3>Your list is empty</h3>
              <p>Tap <b>+</b> on any video to save it here for later.</p>
              <button type="button" className="atv-btn atv-btn-play" onClick={() => goView('home')}><PlayIcon size={18} />Browse AlfieTV</button>
            </div>
          ) : (
            <div className="atv-grid">
              {watchlist.map(video => <TVCard key={video.id} {...cardProps(video as TVVideo)} />)}
            </div>
          )}
        </main>
      ) : searching ? (
        /* ── Search ── */
        <main className="atv-page">
          <div className="atv-page-head">
            <div>
              <p className="atv-eyebrow">Search</p>
              <h1>“{searchTerm.trim()}”</h1>
              <p className="atv-sub">{searchMatches.length} result{searchMatches.length === 1 ? '' : 's'}</p>
            </div>
          </div>
          {searchMatches.length === 0 ? (
            <div className="atv-empty atv-empty-lg">
              <span className="atv-empty-ic"><AlfieIcon glyph="search" size={28} /></span>
              <h3>Nothing found</h3>
              <p>Try a boat class, a club, an event or a skipper's name.</p>
            </div>
          ) : (
            <div className="atv-grid">
              {searchMatches.map(v => <TVCard key={v.id} {...cardProps(v)} />)}
            </div>
          )}
        </main>
      ) : (
        /* ── Home ── */
        <main>
          {heroSlides.length > 0 ? (
            <TVHero
              slides={heroSlides as TVHeroSlide[]}
              index={Math.min(currentHeroIndex, heroSlides.length - 1)}
              onIndex={setCurrentHeroIndex}
              muted={heroMuted}
              onToggleMute={() => setHeroMuted(m => !m)}
              channelOf={channelOf}
              inList={isInList}
              onPlay={handleVideoClick}
              onToggleList={handleAddToWatchlist}
              onInfo={(v) => setInfoVideo(v)}
              onWatchLive={(s) => setSelectedLiveStream(s)}
            />
          ) : showSkeleton ? (
            <section className="atv-hero atv-hero-skel"><span className="atv-shim" /></section>
          ) : (
            <div className="atv-hero-spacer" />
          )}

          <div className={`atv-rows ${heroSlides.length > 0 ? 'atv-rows-over' : ''}`}>
            {categoryCounts.size > 0 && (
              <div className="atv-cats" role="tablist" aria-label="Browse by type">
                <button type="button" role="tab" aria-selected={selectedPlaylistCategory === 'all'} className={`atv-cat ${selectedPlaylistCategory === 'all' ? 'is-on' : ''}`} onClick={() => setSelectedPlaylistCategory('all')}>
                  All
                </button>
                {CATEGORY_LABELS.filter(([k]) => (categoryCounts.get(k) || 0) > 0).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={selectedPlaylistCategory === value}
                    className={`atv-cat ${selectedPlaylistCategory === value ? 'is-on' : ''}`}
                    onClick={() => setSelectedPlaylistCategory(selectedPlaylistCategory === value ? 'all' : value)}
                  >
                    {label}<span>{categoryCounts.get(value)}</span>
                  </button>
                ))}
              </div>
            )}

            {showSkeleton ? (
              <>
                <TVSkeletonRow />
                <TVSkeletonRow />
                <TVSkeletonRow />
              </>
            ) : (
              renderHomeRows()
            )}
          </div>
        </main>
      )}

      {/* Phone tab bar */}
      <nav className="atv-tabbar" aria-label="AlfieTV">
        <button type="button" className={currentView === 'home' && !searching ? 'is-on' : ''} onClick={() => { setSearchTerm(''); goView('home'); }}>
          <AlfieIcon glyph="home" size={21} /><span>Home</span>
        </button>
        <button type="button" className={searching || showSearch ? 'is-on' : ''} onClick={() => { goView('home'); setShowSearch(true); setTimeout(() => searchInputRef.current?.focus(), 60); }}>
          <AlfieIcon glyph="search" size={21} /><span>Search</span>
        </button>
        <button type="button" className={currentView === 'channels' ? 'is-on' : ''} onClick={() => goView('channels')}>
          <AlfieIcon glyph="video" size={21} /><span>Channels</span>
        </button>
        <button type="button" className={currentView === 'mylist' ? 'is-on' : ''} onClick={() => goView('mylist')}>
          <AlfieIcon glyph="plus" size={21} /><span>My List</span>
        </button>
      </nav>
    </div>

    {infoVideo && (
      <TVInfoSheet
        video={infoVideo}
        channel={channelOf(infoVideo.channel_id)}
        related={relatedFor(infoVideo)}
        inList={isInList(infoVideo.id)}
        isInList={isInList}
        onClose={() => setInfoVideo(null)}
        onPlay={playFromInfo}
        onToggleList={user ? handleAddToWatchlist : undefined}
        onOpenChannel={infoVideo.channel_id && channelById.has(infoVideo.channel_id) ? () => openChannel(infoVideo.channel_id) : undefined}
      />
    )}

    <FullscreenVideoModal video={selectedVideo} onClose={handleCloseVideo} />
    <LiveStreamPlayerWrapper
      session={selectedLiveStream}
      onClose={() => setSelectedLiveStream(null)}
      venueImage={selectedLiveStream?.venue_image}
      clubName={selectedLiveStream?.club_name}
    />
    {selectedReplay && (
      <div className="atv-player is-awake" style={{ zIndex: 9000 }}>
        {selectedReplay.source === 'cloudflare' && selectedReplay.cloudflare_playback_url ? (
          <iframe
            src={`${selectedReplay.cloudflare_playback_url}?autoplay=true&muted=false&preload=auto&letterboxColor=000000`}
            className="atv-player-frame"
            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            title={selectedReplay.title}
          />
        ) : selectedReplay.youtube_video_id ? (
          <iframe
            src={`https://www.youtube.com/embed/${selectedReplay.youtube_video_id}?autoplay=1`}
            className="atv-player-frame"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title={selectedReplay.title}
          />
        ) : (
          <div className="atv-player-none">Replay not available</div>
        )}
        <div className="atv-player-top">
          <button type="button" className="atv-player-back" onClick={() => setSelectedReplay(null)} title="Back to AlfieTV">
            <AlfieIcon glyph="chevL" size={22} strokeWidth={2.2} />
            <span>Back</span>
          </button>
          <span className="atv-player-title">
            {selectedReplay.title}
            {selectedReplay.description && <small>{selectedReplay.description}</small>}
          </span>
        </div>
      </div>
    )}
    <SuggestChannelModal
      isOpen={showSuggestChannel}
      onClose={() => setShowSuggestChannel(false)}
      onSuccess={() => {
        setShowSuggestChannel(false);
        setCurrentView('channels');
        setSelectedChannelId(null);
      }}
      darkMode={true}
    />
    </>
  );
}
