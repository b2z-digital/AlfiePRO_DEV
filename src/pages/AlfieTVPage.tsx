import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useImpersonation } from '../contexts/ImpersonationContext';
import { useNavigate } from 'react-router-dom';
import { Play, Plus, Search, Info, Volume2, VolumeX, ChevronLeft, ChevronRight, Settings, X, LogOut, Youtube, ListFilter as Filter, Lightbulb, Radio, Calendar, Square } from 'lucide-react';
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
  playlist_category?: string;
  is_featured?: boolean;
  view_count?: number;
  last_synced_at?: string;
}

interface Channel {
  id: string;
  channel_name: string;
  channel_thumbnail: string;
  is_visible?: boolean;
  category?: string;
}

const LiveStreamPlayerModal = React.memo(({ session, onClose, venueImage, clubName }: {
  session: LivestreamSession | null;
  onClose: () => void;
  venueImage?: string;
  clubName?: string;
}) => {
  const [isPaused, setIsPaused] = React.useState(session?.is_paused || false);
  const [isEnded, setIsEnded] = React.useState(session?.status === 'ended');
  const [iframeKey, setIframeKey] = React.useState(0);

  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (session) {
      window.addEventListener('keydown', handleEscape);
      return () => window.removeEventListener('keydown', handleEscape);
    }
  }, [session, onClose]);

  React.useEffect(() => {
    if (!session) return;
    setIsPaused(session.is_paused || false);
    setIsEnded(session.status === 'ended');
  }, [session?.id]);

  React.useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel(`live-player-${session.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'livestream_sessions',
        filter: `id=eq.${session.id}`,
      }, (payload: any) => {
        const updated = payload.new;
        const wasPaused = isPaused;
        if (updated.is_paused) {
          setIsPaused(true);
        } else {
          setIsPaused(false);
          if (wasPaused) {
            setIframeKey(prev => prev + 1);
          }
        }
        if (updated.status === 'ended') setIsEnded(true);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.id, isPaused]);

  React.useEffect(() => {
    if (!session || isPaused || isEnded) return;
    const pollInterval = setInterval(async () => {
      const { data } = await supabase
        .from('livestream_sessions')
        .select('is_paused, status')
        .eq('id', session.id)
        .maybeSingle();
      if (data) {
        if (data.is_paused && !isPaused) setIsPaused(true);
        if (!data.is_paused && isPaused) { setIsPaused(false); setIframeKey(prev => prev + 1); }
        if (data.status === 'ended') setIsEnded(true);
      }
    }, 10000);
    return () => clearInterval(pollInterval);
  }, [session?.id, isPaused, isEnded]);

  if (!session?.cloudflare_live_input_id || !session?.cloudflare_customer_code) return null;

  const embedUrl = `https://customer-${session.cloudflare_customer_code}.cloudflarestream.com/${session.cloudflare_live_input_id}/iframe?autoplay=true&muted=false&preload=auto&letterboxColor=000000`;

  return (
    <div className="fixed inset-0 bg-black" style={{ zIndex: 9000 }}>
      {!isPaused && !isEnded && (
        <iframe
          key={`stream-${iframeKey}`}
          src={embedUrl}
          className="absolute inset-0 w-full h-full"
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          title={session.title || 'Live Stream'}
          loading="eager"
          style={{ border: 'none' }}
        />
      )}

      {(isPaused || isEnded) && (
        <div className="absolute inset-0 flex items-center justify-center">
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
      {!isPaused && !isEnded && (
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
      )}
    </div>
  );
});

// Hero video background component - MUST be outside to prevent re-creation on parent renders
// Uses internal state to track current video and prevent reloads
const HeroVideoBackground = React.memo(({ videoId, thumbnailUrl }: { videoId: string; thumbnailUrl: string }) => {
  const [currentVideoId, setCurrentVideoId] = React.useState(videoId);
  const [isTransitioning, setIsTransitioning] = React.useState(false);

  React.useEffect(() => {
    if (videoId !== currentVideoId) {
      // Fade out current video before changing
      setIsTransitioning(true);
      const timer = setTimeout(() => {
        setCurrentVideoId(videoId);
        setIsTransitioning(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [videoId, currentVideoId]);

  return (
    <div className="absolute inset-0">
      {currentVideoId ? (
        <div className={`transition-opacity duration-300 ${isTransitioning ? 'opacity-0' : 'opacity-100'} w-full h-full`}>
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${currentVideoId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${currentVideoId}&playsinline=1&rel=0&modestbranding=1&showinfo=0&enablejsapi=0&cc_load_policy=0&disablekb=1&fs=0&iv_load_policy=3`}
            className="w-full h-full object-cover scale-110"
            allow="autoplay; encrypted-media"
            style={{ pointerEvents: 'none' }}
            title="Background video"
            loading="eager"
            frameBorder="0"
          />
        </div>
      ) : (
        <img
          src={thumbnailUrl}
          alt="Background"
          className="w-full h-full object-cover object-center scale-105"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/60" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/30 to-transparent" />
    </div>
  );
});

// Fullscreen video modal - MUST be outside to prevent re-creation on parent renders
// Uses internal state to prevent iframe reloads and YouTube Player API for auto-close
const FullscreenVideoModal = React.memo(({ video, onClose }: { video: AlfieTVVideo | null; onClose: () => void }) => {
  const [currentVideo, setCurrentVideo] = React.useState<AlfieTVVideo | null>(video);
  const iframeRef = React.useRef<HTMLIFrameElement>(null);

  React.useEffect(() => {
    if (video?.youtube_id && video.youtube_id !== currentVideo?.youtube_id) {
      setCurrentVideo(video);
    } else if (!video) {
      // Clear current video when prop becomes null
      setCurrentVideo(null);
    }
  }, [video?.youtube_id, video]);

  // ESC key handler
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (currentVideo) {
      window.addEventListener('keydown', handleEscape);
      return () => window.removeEventListener('keydown', handleEscape);
    }
  }, [currentVideo, onClose]);

  // Listen for video end messages from YouTube iframe
  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // YouTube posts messages when video state changes
      if (event.origin === 'https://www.youtube.com' || event.origin === 'https://www.youtube-nocookie.com') {
        try {
          const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;

          // Log state changes for debugging
          if (data.event === 'onStateChange') {
            const stateNames: Record<number, string> = {
              '-1': 'unstarted',
              '0': 'ENDED',
              '1': 'playing',
              '2': 'paused',
              '3': 'buffering',
              '5': 'cued'
            };
            console.log('📺 YouTube state:', stateNames[data.info] || data.info);
          }

          // Check if video ended (state 0 = ended)
          // YouTube API states: -1=unstarted, 0=ended, 1=playing, 2=paused, 3=buffering, 5=cued
          if (data.event === 'onStateChange' && data.info === 0) {
            console.log('✅ VIDEO ENDED! Returning to AlfieTV in 1.5 seconds...');
            setTimeout(() => {
              console.log('🔙 Closing video player now...');
              onClose();
            }, 1500);
          }
        } catch (e) {
          // Ignore parsing errors from non-YouTube messages
        }
      }
    };

    if (currentVideo) {
      console.log('🎬 Setting up video end listener for:', currentVideo.youtube_id);
      window.addEventListener('message', handleMessage);
      return () => {
        console.log('🧹 Cleaning up video end listener');
        window.removeEventListener('message', handleMessage);
      };
    }
  }, [currentVideo, onClose]);

  if (!currentVideo) return null;

  const currentOrigin = window.location.origin;
  const videoUrl = `https://www.youtube-nocookie.com/embed/${currentVideo.youtube_id}?autoplay=1&controls=1&modestbranding=1&rel=0&fs=1&iv_load_policy=3&cc_load_policy=0&enablejsapi=1&playsinline=1&origin=${encodeURIComponent(currentOrigin)}`;

  const handleCloseClick = () => {
    console.log('✅✅✅ CLOSE BUTTON CLICKED - CLOSING VIDEO!');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black" style={{ zIndex: 9000 }}>
      <iframe
        ref={iframeRef}
        src={videoUrl}
        className="absolute inset-0 w-full h-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        title={currentVideo?.title || 'Video'}
        loading="eager"
        style={{ border: 'none' }}
      />

      <div className="absolute bottom-0 right-0 w-36 h-20" style={{ zIndex: 9001, pointerEvents: 'auto', background: 'transparent' }} />

      {/* Close button - subtle design */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleCloseClick();
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleCloseClick();
        }}
        className="p-3 rounded-full bg-black/60 hover:bg-black/80 text-white/80 hover:text-white transition-all backdrop-blur-sm border border-white/20 hover:border-white/40"
        style={{
          position: 'fixed',
          top: '24px',
          right: '24px',
          zIndex: 9999,
          cursor: 'pointer'
        }}
        title="Close (ESC)"
        type="button"
      >
        <LogOut className="w-7 h-7 stroke-[2.5]" />
      </button>

      {/* Video title */}
      <div
        className="bg-black/60 backdrop-blur-sm px-4 py-2 rounded-lg text-white font-medium text-sm border border-white/10"
        style={{
          position: 'fixed',
          top: '24px',
          left: '24px',
          zIndex: 9998,
          pointerEvents: 'none',
          maxWidth: '60%'
        }}
      >
        {currentVideo.title}
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
  const [showCategoryFilter, setShowCategoryFilter] = useState(false);
  const [selectedPlaylistCategory, setSelectedPlaylistCategory] = useState<string>('all');
  const [heroMuted, setHeroMuted] = useState(true);
  const [showHeroInfo, setShowHeroInfo] = useState(true);
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
  const heroVideoRef = useRef<HTMLVideoElement>(null);

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
      loadContent();
    }
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

      let venueMap = new Map<string, { image: string | null; name: string }>();
      if (uniqueEventIds.length > 0) {
        const { data: events } = await supabase
          .from('public_events')
          .select('id, venue_id')
          .in('id', uniqueEventIds);
        if (events && events.length > 0) {
          const venueIds = events.map(e => e.venue_id).filter((id): id is string => !!id);
          if (venueIds.length > 0) {
            const { data: venues } = await supabase
              .from('venues')
              .select('id, name, image')
              .in('id', [...new Set(venueIds)]);
            if (venues) {
              const venueById = new Map(venues.map(v => [v.id, v]));
              for (const event of events) {
                if (event.venue_id && venueById.has(event.venue_id)) {
                  venueMap.set(event.id, venueById.get(event.venue_id)!);
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
          const venue = venueMap.get(s.event_id) || venueMap.get(baseEventId);
          if (venue?.image) venueImage = venue.image;
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
        const { data } = await supabase
          .from('livestream_sessions')
          .select('*')
          .in('status', ['live', 'testing'])
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
    if (!organizationId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Load channels with visibility
      // For clubs: load club-specific and global channels
      // For associations: only load global channels
      let channelsQuery = supabase
        .from('alfie_tv_channels')
        .select('id, channel_name, channel_thumbnail, is_visible, category, is_global')
        .order('channel_name');

      if (organizationType === 'club' && currentClub?.clubId) {
        channelsQuery = channelsQuery.or(`club_id.eq.${currentClub.clubId},is_global.eq.true`);
      } else {
        // For associations, only show global channels
        channelsQuery = channelsQuery.eq('is_global', true);
      }

      const { data: channelsData, error: channelsError } = await channelsQuery;

      if (channelsError) {
        console.error('Error loading channels:', channelsError);
      }

      if (channelsData) {
        setChannels(channelsData);
      }

      // Load YouTube playlists
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
          view_count,
          last_synced_at
        `)
        .in('channel_id', channelsData?.map(c => c.id) || [])
        .order('video_count', { ascending: false })
        .limit(20);

      // Initialize playlistVideoMap
      let playlistVideoMap: { [key: string]: AlfieTVVideo[] } = {};

      if (playlistsData) {
        setPlaylists(playlistsData);

        // Load videos for each playlist (first 10 videos)
        const playlistVideoPromises = playlistsData.map(async (playlist) => {
          const { data: playlistVideoIds } = await supabase
            .from('alfie_tv_youtube_playlist_videos')
            .select('video_id')
            .eq('youtube_playlist_id', playlist.id)
            .order('position')
            .limit(10);

          if (playlistVideoIds && playlistVideoIds.length > 0) {
            const { data: videos } = await supabase
              .from('alfie_tv_videos')
              .select('*')
              .in('id', playlistVideoIds.map(pv => pv.video_id));

            return { playlistId: playlist.id, videos: videos || [] };
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
      const featured = await alfieTVStorage.getFeaturedVideos(organizationId);
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
      const trending = await alfieTVStorage.getTrendingVideos(organizationId, 10);
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
      addNotification('Failed to load content', 'error');
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
      addNotification('Search failed', 'error');
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
        addNotification('Removed from My List', 'success');
      } else {
        await alfieTVStorage.addToWatchlist(user.id, video.id);
        setWatchlist(prev => [video, ...prev]);
        addNotification('Added to My List', 'success');
      }
    } catch (error) {
      console.error('Error updating watchlist:', error);
      addNotification('Failed to update My List', 'error');
    }
  };

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const formatScheduledDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffHours < 1) return 'Starting soon';
    if (diffHours < 24) return `In ${diffHours} hour${diffHours === 1 ? '' : 's'}`;
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays < 7) {
      return date.toLocaleDateString('en-US', { weekday: 'long' });
    }
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const LiveHero = ({ stream }: { stream: LivestreamSession & { venue_image?: string; club_name?: string } }) => {
    const venueImg = stream.venue_image;
    const clubName = stream.club_name;
    const embedUrl = stream.cloudflare_customer_code && stream.cloudflare_live_input_id
      ? `https://customer-${stream.cloudflare_customer_code}.cloudflarestream.com/${stream.cloudflare_live_input_id}/iframe?autoplay=true&muted=true&controls=false&preload=auto&letterboxColor=000000`
      : null;

    return (
      <div className="relative h-[85vh] w-full overflow-hidden">
        {venueImg && (
          <img src={venueImg} alt="" className="absolute inset-0 w-full h-full object-cover" />
        )}
        {embedUrl ? (
          <div className="absolute inset-0">
            <iframe
              src={embedUrl}
              className="w-full h-full object-cover scale-110"
              allow="autoplay"
              style={{ pointerEvents: 'none', border: 'none' }}
              loading="eager"
            />
          </div>
        ) : !venueImg ? (
          <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-red-950/30 to-gray-900" />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-black/50" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-transparent to-transparent" />

        <div className="absolute bottom-[20%] left-20 right-0 px-12">
          <div className="max-w-3xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center gap-2 bg-red-600 px-3 py-1.5 rounded-md">
                <Radio className="w-4 h-4 text-white" />
                <span className="text-sm font-bold text-white uppercase tracking-wider">Live Now</span>
              </div>
              {stream.viewer_count > 0 && (
                <span className="text-white/70 text-sm">{stream.viewer_count} watching</span>
              )}
            </div>
            <h1 className="text-5xl font-bold text-white mb-3 drop-shadow-2xl leading-tight">
              {stream.title}
            </h1>
            {clubName && (
              <p className="text-lg text-white/70 mb-6 drop-shadow-lg">
                Hosted by {clubName}
              </p>
            )}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSelectedLiveStream(stream)}
                className="flex items-center gap-2 px-10 py-3.5 rounded-lg bg-red-600 text-white font-bold hover:bg-red-500 transition-all shadow-2xl shadow-red-600/30 text-lg"
              >
                <Radio className="w-5 h-5" />
                <span>Watch Live</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const UpcomingStreamHero = ({ stream }: { stream: LivestreamSession & { venue_image?: string; club_name?: string } }) => (
    <div className="relative h-[85vh] w-full overflow-hidden">
      {stream.venue_image ? (
        <img src={stream.venue_image} alt="" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-blue-950/20 to-gray-900" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/60" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/30 to-transparent" />

      <div className="absolute bottom-[20%] left-20 right-0 px-12">
        <div className="max-w-3xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center gap-2 bg-blue-600/80 backdrop-blur-sm px-3 py-1.5 rounded-md">
              <Radio className="w-4 h-4 text-white" />
              <span className="text-sm font-bold text-white uppercase tracking-wider">Coming Soon</span>
            </div>
            <span className="text-white/70 text-sm font-medium">
              {formatScheduledDate(stream.scheduled_start_time!)}
            </span>
          </div>
          <h1 className="text-5xl font-bold text-white mb-3 drop-shadow-2xl leading-tight">
            {stream.title}
          </h1>
          {stream.club_name && (
            <p className="text-lg text-white/70 mb-6 drop-shadow-lg">
              Hosted by {stream.club_name}
            </p>
          )}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-6 py-3 rounded-lg bg-white/10 backdrop-blur-md text-white font-semibold border border-white/20">
              <Calendar className="w-5 h-5" />
              <span>
                {new Date(stream.scheduled_start_time!).toLocaleDateString('en-US', {
                  weekday: 'long', month: 'long', day: 'numeric'
                })}
                {' at '}
                {new Date(stream.scheduled_start_time!).toLocaleTimeString('en-US', {
                  hour: 'numeric', minute: '2-digit'
                })}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const HeroCarousel = () => {
    const slide = heroSlides[currentHeroIndex];
    if (!slide) return null;

    const renderSlideBackground = () => {
      if (slide.type === 'live') {
        const s = slide.stream;
        const embedUrl = s.cloudflare_customer_code && s.cloudflare_live_input_id
          ? `https://customer-${s.cloudflare_customer_code}.cloudflarestream.com/${s.cloudflare_live_input_id}/iframe?autoplay=true&muted=true&controls=false&preload=auto&letterboxColor=000000`
          : null;
        return (
          <>
            {s.venue_image && <img src={s.venue_image} alt="" className="absolute inset-0 w-full h-full object-cover" />}
            {embedUrl ? (
              <div className="absolute inset-0">
                <iframe src={embedUrl} className="w-full h-full object-cover scale-110" allow="autoplay" style={{ pointerEvents: 'none', border: 'none' }} loading="eager" />
              </div>
            ) : !s.venue_image ? (
              <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-red-950/30 to-gray-900" />
            ) : null}
          </>
        );
      }
      if (slide.type === 'upcoming') {
        const s = slide.stream;
        return s.venue_image
          ? <img src={s.venue_image} alt="" className="absolute inset-0 w-full h-full object-cover" />
          : <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-blue-950/20 to-gray-900" />;
      }
      const v = slide.video;
      return <HeroVideoBackground videoId={v.youtube_id} thumbnailUrl={v.thumbnail_high_url || v.thumbnail_url} />;
    };

    const renderSlideContent = () => {
      if (slide.type === 'live') {
        const s = slide.stream;
        return (
          <>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center gap-2 bg-red-600 px-3 py-1.5 rounded-md">
                <Radio className="w-4 h-4 text-white" />
                <span className="text-sm font-bold text-white uppercase tracking-wider">Live Now</span>
              </div>
              {s.viewer_count > 0 && <span className="text-white/70 text-sm">{s.viewer_count} watching</span>}
            </div>
            <h1 className="text-5xl font-bold text-white mb-3 drop-shadow-2xl leading-tight">{s.title}</h1>
            {s.club_name && <p className="text-lg text-white/70 mb-6 drop-shadow-lg">Hosted by {s.club_name}</p>}
            <button
              onClick={() => setSelectedLiveStream(s)}
              className="flex items-center gap-2 px-10 py-3.5 rounded-lg bg-red-600 text-white font-bold hover:bg-red-500 transition-all shadow-2xl shadow-red-600/30 text-lg"
            >
              <Radio className="w-5 h-5" />
              <span>Watch Live</span>
            </button>
          </>
        );
      }
      if (slide.type === 'upcoming') {
        const s = slide.stream;
        return (
          <>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center gap-2 bg-blue-600/80 backdrop-blur-sm px-3 py-1.5 rounded-md">
                <Radio className="w-4 h-4 text-white" />
                <span className="text-sm font-bold text-white uppercase tracking-wider">Coming Soon</span>
              </div>
              <span className="text-white/70 text-sm font-medium">{formatScheduledDate(s.scheduled_start_time!)}</span>
            </div>
            <h1 className="text-5xl font-bold text-white mb-3 drop-shadow-2xl leading-tight">{s.title}</h1>
            {s.club_name && <p className="text-lg text-white/70 mb-6 drop-shadow-lg">Hosted by {s.club_name}</p>}
            <div className="flex items-center gap-2 px-6 py-3 rounded-lg bg-white/10 backdrop-blur-md text-white font-semibold border border-white/20 w-fit">
              <Calendar className="w-5 h-5" />
              <span>
                {new Date(s.scheduled_start_time!).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                {' at '}
                {new Date(s.scheduled_start_time!).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </span>
            </div>
          </>
        );
      }
      const v = slide.video;
      return (
        <>
          <h1 className="text-4xl font-bold text-white mb-3 drop-shadow-2xl">{v.title}</h1>
          <p className="text-base text-white/90 mb-6 line-clamp-2 drop-shadow-lg">{v.description}</p>
          <div className="flex items-center space-x-3">
            <button onClick={() => handleVideoClick(v)} className="flex items-center space-x-2 px-8 py-3 rounded-lg bg-white text-black font-bold hover:bg-white/90 transition-all shadow-2xl">
              <Play className="w-5 h-5 fill-current" />
              <span>Play</span>
            </button>
            <button onClick={(e) => handleAddToWatchlist(e, v)} className="flex items-center space-x-2 px-8 py-3 rounded-lg bg-white/20 backdrop-blur-md text-white font-bold hover:bg-white/30 transition-all">
              <Plus className="w-5 h-5" />
              <span>My List</span>
            </button>
            <button onClick={() => setShowHeroInfo(!showHeroInfo)} className="p-3 rounded-full bg-white/20 backdrop-blur-md text-white hover:bg-white/30 transition-all">
              <Info className="w-5 h-5" />
            </button>
          </div>
        </>
      );
    };

    return (
      <div className="relative h-[85vh] w-full overflow-hidden">
        {renderSlideBackground()}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-black/50" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-transparent to-transparent" />

        {heroSlides.length > 1 && (
          <div className="absolute bottom-[15%] left-1/2 transform -translate-x-1/2 flex space-x-2 z-20">
            {heroSlides.map((s, index) => (
              <button
                key={index}
                onClick={() => setCurrentHeroIndex(index)}
                className={`h-1.5 rounded-full transition-all ${
                  index === currentHeroIndex
                    ? `w-8 ${s.type === 'live' ? 'bg-red-500' : s.type === 'upcoming' ? 'bg-blue-400' : 'bg-white'}`
                    : 'w-1.5 bg-white/40 hover:bg-white/60'
                }`}
              />
            ))}
          </div>
        )}

        <div className="absolute bottom-[20%] left-20 right-0 px-12">
          <div className="max-w-3xl">
            {renderSlideContent()}
          </div>
        </div>

        {heroSlides.length > 1 && (
          <>
            <button
              onClick={() => setCurrentHeroIndex((prev) => (prev - 1 + heroSlides.length) % heroSlides.length)}
              className="absolute left-8 top-1/2 transform -translate-y-1/2 p-4 rounded-full bg-black/50 backdrop-blur-sm text-white hover:bg-black/70 transition-all z-20"
            >
              <ChevronLeft className="w-8 h-8" />
            </button>
            <button
              onClick={() => setCurrentHeroIndex((prev) => (prev + 1) % heroSlides.length)}
              className="absolute right-8 top-1/2 transform -translate-y-1/2 p-4 rounded-full bg-black/50 backdrop-blur-sm text-white hover:bg-black/70 transition-all z-20"
            >
              <ChevronRight className="w-8 h-8" />
            </button>
          </>
        )}
      </div>
    );
  };

  const VideoThumbnail = ({ video, showProgress }: { video: AlfieTVVideo; showProgress?: number }) => {
    const [isHovering, setIsHovering] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const hoverTimerRef = useRef<NodeJS.Timeout>();

    const handleMouseEnter = () => {
      setIsHovering(true);
      // Delay preview by 500ms to avoid flickering
      hoverTimerRef.current = setTimeout(() => {
        setShowPreview(true);
      }, 500);
    };

    const handleMouseLeave = () => {
      setIsHovering(false);
      setShowPreview(false);
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
      }
    };

    useEffect(() => {
      return () => {
        if (hoverTimerRef.current) {
          clearTimeout(hoverTimerRef.current);
        }
      };
    }, []);

    return (
      <div
        className="group relative flex-shrink-0 w-80 cursor-pointer"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div
          onClick={() => handleVideoClick(video)}
          className="relative transition-all duration-300 group-hover:scale-110"
        >
          <div className="relative aspect-video rounded-lg overflow-hidden">
            {showPreview ? (
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${video.youtube_id}?autoplay=1&mute=1&controls=0&loop=1&playlist=${video.youtube_id}&playsinline=1&rel=0&modestbranding=1&showinfo=0`}
                className="w-full h-full object-cover"
                allow="autoplay; encrypted-media"
                style={{ pointerEvents: 'none' }}
                title={video.title}
                loading="lazy"
                frameBorder="0"
              />
            ) : (
              <img
                src={video.thumbnail_high_url || video.thumbnail_url}
                alt={video.title}
                className="w-full h-full object-cover"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-white/30 backdrop-blur-sm flex items-center justify-center">
                  <Play className="w-8 h-8 text-white ml-1 fill-current" />
                </div>
              </div>
            </div>
            {showProgress !== undefined && showProgress > 0 && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50">
                <div
                  className="h-full bg-red-600"
                  style={{ width: `${showProgress}%` }}
                />
              </div>
            )}
            {!showPreview && (
              <div className="absolute bottom-2 right-2 px-2 py-1 rounded bg-black/80 text-white text-xs font-bold">
                {formatDuration(video.duration)}
              </div>
            )}
            <button
              onClick={(e) => handleAddToWatchlist(e, video)}
              className="absolute top-2 right-2 p-2 rounded-full bg-black/60 backdrop-blur-sm text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <h3 className="text-white font-medium line-clamp-2 text-xs">
              {video.title}
            </h3>
          </div>
        </div>
      </div>
    );
  };

  const SkeletonThumbnail = () => (
    <div className="flex-shrink-0 w-80">
      <div className="relative aspect-video rounded-lg overflow-hidden bg-gray-800/50 animate-pulse" />
    </div>
  );

  const SkeletonRow = ({ title }: { title: string }) => (
    <div className="mb-12">
      <div className="h-8 w-64 bg-gray-800/50 rounded mb-4 px-12 animate-pulse" />
      <div className="flex space-x-4 px-12">
        {[1, 2, 3, 4].map(i => <SkeletonThumbnail key={i} />)}
      </div>
    </div>
  );

  const VideoRow = ({ title, videos }: { title: string; videos: AlfieTVVideo[] }) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(true);

    const checkScroll = () => {
      if (scrollRef.current) {
        const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
        setCanScrollLeft(scrollLeft > 0);
        setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
      }
    };

    useEffect(() => {
      checkScroll();
    }, [videos]);

    const scroll = (direction: 'left' | 'right') => {
      if (scrollRef.current) {
        const scrollAmount = scrollRef.current.clientWidth * 0.8;
        scrollRef.current.scrollBy({
          left: direction === 'left' ? -scrollAmount : scrollAmount,
          behavior: 'smooth'
        });
        setTimeout(checkScroll, 300);
      }
    };

    if (videos.length === 0) return null;

    return (
      <div className="mb-8 group/row relative z-10">
        <h2 className="text-2xl font-bold text-white mb-2 px-12">{title}</h2>
        <div className="relative">
          {canScrollLeft && (
            <button
              onClick={() => scroll('left')}
              className="absolute left-0 top-0 bottom-0 z-[90] w-12 bg-gradient-to-r from-black/80 to-transparent flex items-center justify-start pl-2 opacity-0 group-hover/row:opacity-100 transition-opacity"
            >
              <ChevronLeft className="w-10 h-10 text-white" />
            </button>
          )}
          <div
            ref={scrollRef}
            className="flex space-x-4 overflow-x-auto scrollbar-hide px-12 pb-4"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            onScroll={checkScroll}
          >
            {videos.map(video => (
              <VideoThumbnail key={video.id} video={video} />
            ))}
          </div>
          {canScrollRight && (
            <button
              onClick={() => scroll('right')}
              className="absolute right-0 top-0 bottom-0 z-[90] w-12 bg-gradient-to-l from-black/80 to-transparent flex items-center justify-end pr-2 opacity-0 group-hover/row:opacity-100 transition-opacity"
            >
              <ChevronRight className="w-10 h-10 text-white" />
            </button>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-red-600 mx-auto mb-4"></div>
          <p className="text-white text-xl">Loading AlfieTV...</p>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="fixed inset-0 bg-black overflow-y-auto">
      {/* Top Navigation Bar */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-black border-b border-white/10">
        <div className="flex items-center justify-between px-12 py-3">
          <div className="flex items-center space-x-12">
            <div className="flex items-center gap-3">
              <Logo className="w-8 h-8" />
              <h1 className="text-2xl text-white">
                <span className="font-thin">Alfie</span><span className="font-black">TV</span>
              </h1>
            </div>
            <nav className="flex space-x-8">
              <button
                onClick={() => {
                  setCurrentView('home');
                  setSelectedChannelId(null);
                }}
                className={`${currentView === 'home' ? 'text-white font-semibold' : 'text-gray-400'} hover:text-white transition-colors`}
              >
                Home
              </button>
              <button
                onClick={() => {
                  setCurrentView('channels');
                  setSelectedChannelId(null);
                }}
                className={`${currentView === 'channels' ? 'text-white font-semibold' : 'text-gray-400'} hover:text-white transition-colors`}
              >
                Channels
              </button>
              <button
                onClick={() => {
                  setCurrentView('mylist');
                  setSelectedChannelId(null);
                }}
                className={`${currentView === 'mylist' ? 'text-white font-semibold' : 'text-gray-400'} hover:text-white transition-colors`}
              >
                My List
              </button>
            </nav>
          </div>
          <div className="flex items-center space-x-4">
            {/* Playlist Category Filter */}
            <div className="relative">
              <button
                onClick={() => setShowCategoryFilter(!showCategoryFilter)}
                className={`p-2 rounded transition-colors ${
                  selectedPlaylistCategory !== 'all' ? 'text-red-500 hover:text-red-400' : 'text-white hover:text-gray-300'
                }`}
                title="Filter playlist type"
              >
                <Filter className="w-6 h-6" />
              </button>
              {showCategoryFilter && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-black/95 border border-white/20 rounded-lg p-4 z-50">
                  <h3 className="text-white font-semibold mb-3">Filter by Playlist Type</h3>
                  <div className="space-y-2">
                    {[
                      { value: 'all', label: 'All' },
                      { value: 'live_events', label: 'Live Events' },
                      { value: 'big_boat_yachting', label: 'Big Boat' },
                      { value: 'rc_yachting', label: 'RC Yachting' },
                      { value: 'training_tips', label: 'Training' },
                      { value: 'highlights_recaps', label: 'Highlights' },
                      { value: 'event_archives', label: 'Archives' },
                      { value: 'general', label: 'General' }
                    ].map(category => (
                      <label key={category.value} className="flex items-center space-x-2 text-white cursor-pointer hover:text-gray-300">
                        <input
                          type="radio"
                          name="playlist-category"
                          checked={selectedPlaylistCategory === category.value}
                          onChange={() => setSelectedPlaylistCategory(category.value)}
                          className="w-4 h-4"
                        />
                        <span>{category.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {showSearch ? (
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  placeholder="Search videos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-80 px-4 py-2 rounded bg-black/60 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:border-white/40"
                  autoFocus
                />
                <button
                  onClick={() => {
                    setShowSearch(false);
                    setSearchTerm('');
                  }}
                  className="p-2 text-white hover:text-gray-300"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowSearch(true)}
                className="p-2 text-white hover:text-gray-300 transition-colors"
              >
                <Search className="w-6 h-6" />
              </button>
            )}
            {canManageAlfieTV && (
              <button
                onClick={() => setCurrentView('settings')}
                className="p-2 text-white hover:text-gray-300 transition-colors"
                title="Channel Management"
              >
                <Settings className="w-6 h-6" />
              </button>
            )}
            <button
              onClick={() => navigate('/dashboard')}
              className="p-2 text-white hover:text-gray-300 transition-colors"
              title="Exit AlfieTV"
            >
              <LogOut className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>

      {/* Content based on current view */}
      {currentView === 'settings' ? (
        <div className="pt-24 px-12 pb-12">
          <AlfieTVAdmin darkMode={true} />
        </div>
      ) : currentView === 'channels' ? (
        selectedChannelId ? (
          <div className="pt-24">
            <div className="px-12 mb-8">
              <button
                onClick={() => setSelectedChannelId(null)}
                className="flex items-center text-gray-400 hover:text-white transition-colors mb-4"
              >
                <ChevronLeft className="w-5 h-5 mr-2" />
                Back to all channels
              </button>
              <h1 className="text-4xl font-bold text-white mb-4">
                {channels.find(c => c.id === selectedChannelId)?.channel_name}
              </h1>
            </div>
            {/* Channel Playlists */}
            {playlists
              .filter(p => p.channel_id === selectedChannelId)
              .map(playlist => {
                const videos = playlistVideos[playlist.id] || [];
                if (videos.length === 0) return null;
                return (
                  <VideoRow
                    key={playlist.id}
                    title={playlist.title}
                    videos={videos}
                  />
                );
              })}
          </div>
        ) : (
          <div className="pt-24">
            <div className="px-12 mb-8">
              <h1 className="text-4xl font-bold text-white mb-4">Channels</h1>
              <p className="text-gray-400">Browse content by channel</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 px-12">
              {channels.map(channel => (
                <div
                  key={channel.id}
                  onClick={() => setSelectedChannelId(channel.id)}
                  className="group cursor-pointer"
                >
                  <div className="relative aspect-square rounded-full overflow-hidden bg-gray-800 mb-4 transform transition-transform group-hover:scale-110">
                    {channel.channel_thumbnail ? (
                      <img
                        src={channel.channel_thumbnail}
                        alt={channel.channel_name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <Youtube className="w-16 h-16 text-red-600" />
                      </div>
                    )}
                  </div>
                  <h3 className="text-white text-center font-semibold group-hover:text-gray-300 transition-colors">
                    {channel.channel_name}
                  </h3>
                </div>
              ))}
            </div>

            {/* Suggest a Channel Button */}
            <div className="px-12 mt-12 pb-12 flex justify-center">
              <button
                onClick={() => setShowSuggestChannel(true)}
                className="flex items-center gap-2 px-5 py-2.5 text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg transition-all text-sm"
              >
                <Lightbulb className="w-4 h-4" />
                <span>Suggest a Channel</span>
              </button>
            </div>
          </div>
        )
      ) : currentView === 'mylist' ? (
        <div className="pt-24">
          <div className="px-12 mb-8">
            <h1 className="text-4xl font-bold text-white mb-4">My List</h1>
            <p className="text-gray-400">Videos you've saved to watch later</p>
          </div>
          {watchlist.length === 0 ? (
            <div className="px-12 py-20 text-center">
              <Plus className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400 text-lg">Your watchlist is empty</p>
              <p className="text-gray-500 text-sm mt-2">Click the + button on any video to add it to your list</p>
            </div>
          ) : (
            <div className="px-12">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {watchlist.map(video => (
                  <div key={video.id} className="cursor-pointer">
                    <VideoThumbnail video={video} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Hero Section: Unified carousel with live/upcoming/video slides */}
          {loading && heroSlides.length === 0 ? (
            <div className="relative h-[85vh] w-full overflow-hidden bg-gray-900">
              <div className="absolute inset-0 bg-gray-800/50 animate-pulse" />
            </div>
          ) : heroSlides.length > 0 ? (
            <HeroCarousel />
          ) : null}

          {/* Content Rows */}
          <div className="relative -mt-32 z-10 px-12">
            {/* Main Content */}
            <div className="w-full">
              {loading ? (
                <>
                  <SkeletonRow title="Loading..." />
                  <SkeletonRow title="Loading..." />
                  <SkeletonRow title="Loading..." />
                </>
              ) : (
                <>
                {(() => {
                  // Build all rows dynamically
                  const rows: JSX.Element[] = [];
                  let rowIndex = 0;

                  // Helper to add ad placement after specific rows
                  const maybeAddAd = () => {
                    // Add ad after 2nd row, then every 4th row (2, 6, 10, 14, etc.)
                    if (rowIndex === 2 || (rowIndex > 2 && (rowIndex - 2) % 4 === 0)) {
                      rows.push(
                        <div key={`ad-${rowIndex}`} className="py-6">
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

                  // Additional live streams (shown as tiles if more than 1)
                  if (liveStreams.length > 1) {
                    rows.push(
                      <div key="more-live" className="mb-10">
                        <div className="flex items-center gap-3 mb-5">
                          <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
                          </span>
                          <h2 className="text-2xl font-bold text-white">Also Live</h2>
                        </div>
                        <div className="flex gap-5 overflow-x-auto pb-2 scrollbar-hide">
                          {liveStreams.slice(1).map(stream => (
                            <div
                              key={stream.id}
                              onClick={() => setSelectedLiveStream(stream)}
                              className="group flex-shrink-0 cursor-pointer"
                              style={{ width: '400px' }}
                            >
                              <div className="relative aspect-video rounded-lg overflow-hidden bg-gray-800 border-2 border-red-500/50 group-hover:border-red-500 transition-colors">
                                {stream.cloudflare_customer_code && stream.cloudflare_live_input_id ? (
                                  <iframe
                                    src={`https://customer-${stream.cloudflare_customer_code}.cloudflarestream.com/${stream.cloudflare_live_input_id}/iframe?autoplay=true&muted=true&controls=false&preload=auto&letterboxColor=000000`}
                                    className="absolute inset-0 w-full h-full pointer-events-none"
                                    allow="autoplay"
                                    style={{ border: 'none' }}
                                    loading="lazy"
                                  />
                                ) : (
                                  <div className="absolute inset-0 flex items-center justify-center">
                                    <Radio className="w-12 h-12 text-red-500 animate-pulse" />
                                  </div>
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                <div className="absolute top-3 left-3 flex items-center gap-2 bg-red-600 px-2.5 py-1 rounded text-[11px] font-bold text-white uppercase tracking-wider">
                                  <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                                  </span>
                                  Live
                                </div>
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                  <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30">
                                    <Play className="w-7 h-7 text-white fill-white ml-1" />
                                  </div>
                                </div>
                              </div>
                              <div className="mt-2.5">
                                <h3 className="text-white font-semibold text-sm truncate group-hover:text-gray-300 transition-colors">{stream.title}</h3>
                                {stream.description && (
                                  <p className="text-gray-500 text-xs mt-0.5 truncate">{stream.description}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                    rowIndex++;
                  }

                  // Upcoming streams row (when not already in hero)
                  if (upcomingStreams.length > (liveStreams.length === 0 ? 1 : 0)) {
                    const streamsToShow = liveStreams.length === 0 ? upcomingStreams.slice(1) : upcomingStreams;
                    if (streamsToShow.length > 0) {
                      rows.push(
                        <div key="upcoming-streams" className="mb-10">
                          <div className="flex items-center gap-3 mb-5">
                            <Calendar className="w-5 h-5 text-blue-400" />
                            <h2 className="text-2xl font-bold text-white">Coming Soon</h2>
                          </div>
                          <div className="flex gap-5 overflow-x-auto pb-2 scrollbar-hide">
                            {streamsToShow.map(stream => (
                              <div
                                key={stream.id}
                                className="flex-shrink-0 rounded-lg overflow-hidden bg-gray-800/50 border border-gray-700/50"
                                style={{ width: '400px' }}
                              >
                                <div className="relative aspect-video bg-gradient-to-br from-gray-800 via-blue-950/20 to-gray-800 flex items-center justify-center">
                                  <Radio className="w-12 h-12 text-blue-400/50" />
                                  <div className="absolute top-3 left-3 flex items-center gap-2 bg-blue-600/80 backdrop-blur-sm px-2.5 py-1 rounded text-[11px] font-bold text-white uppercase tracking-wider">
                                    <Calendar className="w-3 h-3" />
                                    {formatScheduledDate(stream.scheduled_start_time!)}
                                  </div>
                                </div>
                                <div className="p-3">
                                  <h3 className="text-white font-semibold text-sm truncate">{stream.title}</h3>
                                  <p className="text-gray-500 text-xs mt-1">
                                    {new Date(stream.scheduled_start_time!).toLocaleDateString('en-US', {
                                      weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                                    })}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                      rowIndex++;
                    }
                  }

                  if (replayArchives.length > 0) {
                    rows.push(
                      <div key="race-replays" className="mb-10">
                        <div className="flex items-center gap-3 mb-5 px-12">
                          <Play className="w-5 h-5 text-blue-400" />
                          <h2 className="text-2xl font-bold text-white">Race Replays</h2>
                        </div>
                        <div className="flex gap-5 overflow-x-auto pb-2 scrollbar-hide px-12">
                          {replayArchives.map(archive => (
                            <div
                              key={archive.id}
                              onClick={() => setSelectedReplay(archive)}
                              className="group flex-shrink-0 cursor-pointer"
                              style={{ width: '320px' }}
                            >
                              <div className="relative aspect-video rounded-lg overflow-hidden bg-gray-800 border border-gray-700/50 group-hover:border-blue-500/50 transition-colors">
                                {archive.thumbnail_url ? (
                                  <img
                                    src={archive.thumbnail_url}
                                    alt={archive.title}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                  />
                                ) : (
                                  <div className="absolute inset-0 bg-gradient-to-br from-gray-800 via-blue-950/30 to-gray-800 flex items-center justify-center">
                                    <Play className="w-10 h-10 text-gray-600" />
                                  </div>
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                  <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30">
                                    <Play className="w-6 h-6 text-white fill-white ml-0.5" />
                                  </div>
                                </div>
                                {archive.duration && archive.duration > 0 && (
                                  <div className="absolute bottom-2 right-2 bg-black/80 px-2 py-0.5 rounded text-[11px] text-white font-medium">
                                    {formatDuration(archive.duration)}
                                  </div>
                                )}
                              </div>
                              <div className="mt-2.5">
                                <h3 className="text-white font-semibold text-sm truncate group-hover:text-gray-300 transition-colors">{archive.title}</h3>
                                <div className="flex items-center gap-3 mt-1 text-gray-500 text-xs">
                                  {archive.view_count > 0 && (
                                    <span>{archive.view_count.toLocaleString()} views</span>
                                  )}
                                  <span>{new Date(archive.recorded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                    rowIndex++;
                    maybeAddAd();
                  }

                  // Continue Watching
                  if (continueWatching.length > 0) {
                    rows.push(
                      <VideoRow
                        key="continue-watching"
                        title="Continue Watching"
                        videos={continueWatching.map(item => ({
                          ...item.video,
                          progress: (item.watch_position / item.video.duration) * 100
                        }))}
                      />
                    );
                    rowIndex++;
                    maybeAddAd();
                  }

                  // For You - Personalized Recommendations
                  if (user && personalizedVideos.length > 0) {
                    rows.push(
                      <VideoRow
                        key="for-you"
                        title="✨ For You"
                        videos={personalizedVideos}
                      />
                    );
                    rowIndex++;
                    maybeAddAd();
                  }

                  // Trending Now
                  if (trendingVideos.length > 0) {
                    rows.push(
                      <VideoRow
                        key="trending"
                        title="🔥 Trending Now"
                        videos={trendingVideos}
                      />
                    );
                    rowIndex++;
                    maybeAddAd();
                  }

                  // Search Results
                  if (searchResults.length > 0) {
                    rows.push(
                      <div key="search-results" className="mb-8">
                        <h2 className="text-2xl font-bold text-white mb-4">
                          Search Results ({searchResults.length})
                        </h2>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                          {searchResults.map((result: any) => (
                            <div
                              key={result.id}
                              onClick={() => handleVideoClick(result)}
                              className="group cursor-pointer"
                            >
                              <div className="relative aspect-video rounded-lg overflow-hidden bg-slate-800 mb-2">
                                <img
                                  src={result.thumbnail_url}
                                  alt={result.title}
                                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                                />
                              </div>
                              <h3 className="text-sm font-medium text-white line-clamp-2 mb-1">
                                {result.title}
                              </h3>
                              <p className="text-xs text-slate-400">{result.channel_name}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                    rowIndex++;
                    maybeAddAd();
                  }

                  // Popular Videos Row
                  if (popularVideos.length > 0) {
                    rows.push(
                      <VideoRow
                        key="popular"
                        title="🔥 Popular"
                        videos={popularVideos}
                      />
                    );
                    rowIndex++;
                    maybeAddAd();
                  }

                  // Latest Videos Row
                  if (latestVideos.length > 0) {
                    rows.push(
                      <VideoRow
                        key="latest"
                        title="🆕 Latest"
                        videos={latestVideos}
                      />
                    );
                    rowIndex++;
                    maybeAddAd();
                  }

                  // Featured Videos Row
                  if (featuredVideos.length > 0) {
                    rows.push(
                      <VideoRow
                        key="featured"
                        title="⭐ Featured"
                        videos={featuredVideos}
                      />
                    );
                    rowIndex++;
                    maybeAddAd();
                  }

                  // Playlists as Rows
                  playlists
                    .filter(playlist => {
                      // Filter by playlist category
                      if (selectedPlaylistCategory !== 'all' && playlist.playlist_category !== selectedPlaylistCategory) {
                        return false;
                      }

                      // Filter by channel visibility
                      const channel = channels.find(c => c.id === playlist.channel_id);
                      if (!channel) return false;
                      return channel.is_visible !== false;
                    })
                    .sort((a, b) => (b.video_count || 0) - (a.video_count || 0))
                    .forEach((playlist, index) => {
                      const videos = (playlistVideos[playlist.id] || [])
                        .filter(video => {
                          // Apply search filter
                          if (!searchTerm.trim()) return true;
                          const searchLower = searchTerm.toLowerCase();
                          return (
                            video.title.toLowerCase().includes(searchLower) ||
                            video.description?.toLowerCase().includes(searchLower)
                          );
                        });
                      if (videos.length > 0) {
                        rows.push(
                          <VideoRow
                            key={playlist.id}
                            title={playlist.title}
                            videos={videos}
                          />
                        );
                        rowIndex++;
                        maybeAddAd();
                      }
                    });

                  return rows;
                })()}
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* Spacer at bottom */}
      <div className="h-32" />
    </div>
    <FullscreenVideoModal video={selectedVideo} onClose={handleCloseVideo} />
    <LiveStreamPlayerModal
      session={selectedLiveStream}
      onClose={() => setSelectedLiveStream(null)}
      venueImage={selectedLiveStream?.venue_image}
      clubName={selectedLiveStream?.club_name}
    />
    {selectedReplay && (
      <div className="fixed inset-0 bg-black" style={{ zIndex: 9000 }}>
        {selectedReplay.source === 'cloudflare' && selectedReplay.cloudflare_playback_url ? (
          <iframe
            src={`${selectedReplay.cloudflare_playback_url}?autoplay=true&muted=false&preload=auto&letterboxColor=000000`}
            className="absolute inset-0 w-full h-full"
            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            title={selectedReplay.title}
            style={{ border: 'none' }}
          />
        ) : selectedReplay.youtube_video_id ? (
          <iframe
            src={`https://www.youtube.com/embed/${selectedReplay.youtube_video_id}?autoplay=1`}
            className="absolute inset-0 w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title={selectedReplay.title}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-gray-400">Replay not available</p>
          </div>
        )}
        <div className="absolute top-0 left-0 right-0 p-6 bg-gradient-to-b from-black/80 to-transparent z-10 flex items-start justify-between">
          <div>
            <h2 className="text-white text-xl font-bold">{selectedReplay.title}</h2>
            {selectedReplay.description && (
              <p className="text-gray-400 text-sm mt-1 max-w-2xl">{selectedReplay.description}</p>
            )}
          </div>
          <button
            onClick={() => setSelectedReplay(null)}
            className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors ml-4 flex-shrink-0"
          >
            <X className="w-6 h-6 text-white" />
          </button>
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
