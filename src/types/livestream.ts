export type LivestreamStatus = 'draft' | 'scheduled' | 'testing' | 'live' | 'ended' | 'archived';
export type AudioSource = 'device' | 'external' | 'mixed';
export type CameraType = 'laptop' | 'mobile' | 'action' | 'external';
export type CameraStatus = 'connected' | 'disconnected' | 'streaming' | 'error';
export type OverlayType = 'scoreboard' | 'skipper_info' | 'weather' | 'heat_info' | 'standings' | 'sponsor' | 'club_logo' | 'custom';
export type OverlayAnimation = 'none' | 'fade' | 'slide' | 'bounce';
export type SponsorDisplayType = 'corner' | 'banner' | 'fullscreen' | 'lower_third';
export type SponsorPosition = 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right' | 'center';

export interface OverlayConfig {
  showHeatNumber: boolean;
  showSkippers: boolean;
  showStandings: boolean;
  showWeather: boolean;
  showHandicaps: boolean;
  statusText?: string;
  position: 'top' | 'bottom' | 'left' | 'right' | 'center';
  theme: 'dark' | 'light' | 'transparent';
}

export interface OverlayPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OverlayStyle {
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  fontSize: number;
}

export interface LivestreamSession {
  id: string;
  club_id: string;
  created_by: string;

  youtube_broadcast_id?: string;
  youtube_stream_key?: string;
  youtube_stream_url?: string;
  youtube_rtmp_url?: string;

  cloudflare_live_input_id?: string;
  cloudflare_whip_url?: string;
  cloudflare_whip_playback_url?: string;
  cloudflare_output_id?: string;
  cloudflare_customer_code?: string;

  streaming_mode: 'direct_youtube' | 'cloudflare_relay';

  title: string;
  description?: string;
  scheduled_start_time?: string;
  actual_start_time?: string;
  end_time?: string;

  event_id?: string;
  event_day?: number; // For multi-day events: which day this stream covers (1, 2, 3, etc.)
  heat_number?: number;

  status: LivestreamStatus;

  enable_overlays: boolean;
  enable_chat: boolean;
  enable_sponsor_rotation: boolean;
  sponsor_rotation_interval: number;

  is_public: boolean;

  audio_source: AudioSource;
  enable_commentary: boolean;

  overlay_config: OverlayConfig;

  viewer_count: number;
  peak_viewers: number;

  created_at: string;
  updated_at: string;
}

export interface LivestreamCamera {
  id: string;
  livestream_session_id: string;
  camera_name: string;
  camera_type: CameraType;
  connection_url?: string;
  device_info?: {
    userAgent?: string;
    platform?: string;
    deviceName?: string;
  };
  is_primary: boolean;
  status: CameraStatus;
  quality_settings?: {
    resolution?: string;
    fps?: number;
    bitrate?: string;
  };
  position: number;
  created_at: string;
  last_connected_at?: string;
  updated_at: string;
}

export interface LivestreamOverlay {
  id: string;
  session_id: string;

  type: OverlayType;

  is_visible: boolean;
  position: OverlayPosition;
  z_index: number;

  content: Record<string, any>;
  style: OverlayStyle;

  animation?: OverlayAnimation;
  duration?: number;

  display_order: number;

  created_at: string;
  updated_at: string;
}

export interface LivestreamSponsorRotation {
  id: string;
  session_id: string;

  advertiser_id?: string;
  sponsor_name: string;
  logo_url?: string;

  display_type: SponsorDisplayType;
  position: SponsorPosition;

  display_duration: number;
  rotation_order: number;

  show_between_races: boolean;
  show_during_race: boolean;

  is_active: boolean;
  impressions: number;

  created_at: string;
}

export interface LivestreamArchive {
  id: string;
  session_id: string;
  club_id: string;

  youtube_video_id?: string;
  youtube_url?: string;
  thumbnail_url?: string;

  cloudflare_video_id?: string;
  cloudflare_customer_code?: string;
  cloudflare_playback_url?: string;
  source?: 'youtube' | 'cloudflare';

  event_id?: string;
  heat_number?: number;

  title: string;
  description?: string;
  duration?: number;

  view_count: number;
  like_count: number;
  comment_count: number;

  recorded_at: string;
  published_at?: string;

  is_public: boolean;

  created_at: string;
  updated_at: string;
}

export interface YouTubeBroadcast {
  id: string;
  snippet: {
    title: string;
    description: string;
    scheduledStartTime: string;
    actualStartTime?: string;
    actualEndTime?: string;
  };
  status: {
    lifeCycleStatus: string;
    privacyStatus: string;
    recordingStatus: string;
  };
  contentDetails: {
    boundStreamId?: string;
    enableAutoStart: boolean;
    enableAutoStop: boolean;
  };
}

export interface YouTubeStream {
  id: string;
  snippet: {
    title: string;
    description: string;
  };
  cdn: {
    ingestionInfo: {
      streamName: string;
      ingestionAddress: string;
    };
  };
  status: {
    streamStatus: string;
  };
}
