/*
  # Create Livestreaming System

  1. New Tables
    - `livestream_sessions`
      - Stores active and scheduled livestream sessions
      - Links to YouTube broadcasts and race events
      - Tracks stream status, settings, and metadata
    
    - `livestream_cameras`
      - Manages multiple camera sources per stream
      - Supports primary/secondary camera switching
      - Tracks camera type (mobile, Insta360, RTMP)
    
    - `livestream_overlays`
      - Stores overlay configurations per stream
      - Controls what race data is displayed
      - Manages positioning and styling
    
    - `livestream_sponsor_rotations`
      - Manages sponsor banner rotation schedule
      - Links to existing advertising system
      - Controls display duration and timing
    
    - `livestream_archives`
      - Links completed streams to race events
      - Stores YouTube video IDs for replay
      - Tracks viewership and engagement metrics

  2. Security
    - Enable RLS on all tables
    - Only club admins/editors can manage streams
    - Public can view archived streams
*/

-- Livestream sessions table
CREATE TABLE IF NOT EXISTS public.livestream_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid REFERENCES public.clubs(id) ON DELETE CASCADE NOT NULL,
  created_by uuid REFERENCES auth.users(id) NOT NULL,
  
  -- YouTube integration
  youtube_broadcast_id text,
  youtube_stream_key text,
  youtube_stream_url text,
  youtube_rtmp_url text,
  
  -- Session metadata
  title text NOT NULL,
  description text,
  scheduled_start_time timestamptz,
  actual_start_time timestamptz,
  end_time timestamptz,
  
  -- Linked race data
  event_id uuid REFERENCES public.quick_races(id) ON DELETE SET NULL,
  heat_number integer,
  
  -- Stream status
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'testing', 'live', 'ended', 'archived')),
  
  -- Settings
  enable_overlays boolean DEFAULT true,
  enable_chat boolean DEFAULT true,
  enable_sponsor_rotation boolean DEFAULT false,
  sponsor_rotation_interval integer DEFAULT 300, -- seconds
  
  -- Privacy
  is_public boolean DEFAULT true,
  
  -- Audio settings
  audio_source text DEFAULT 'device' CHECK (audio_source IN ('device', 'external', 'mixed')),
  enable_commentary boolean DEFAULT false,
  
  -- Overlay configuration
  overlay_config jsonb DEFAULT '{
    "showHeatNumber": true,
    "showSkippers": true,
    "showStandings": true,
    "showWeather": true,
    "showHandicaps": false,
    "position": "bottom",
    "theme": "dark"
  }'::jsonb,
  
  -- Metrics
  viewer_count integer DEFAULT 0,
  peak_viewers integer DEFAULT 0,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Livestream cameras table
CREATE TABLE IF NOT EXISTS public.livestream_cameras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.livestream_sessions(id) ON DELETE CASCADE NOT NULL,
  
  -- Camera info
  name text NOT NULL,
  type text DEFAULT 'mobile' CHECK (type IN ('mobile', 'insta360', 'rtmp', 'webcam')),
  
  -- Connection details
  rtmp_url text,
  stream_key text,
  device_id text,
  
  -- Camera settings
  is_primary boolean DEFAULT false,
  position text DEFAULT 'main' CHECK (position IN ('main', 'finish_line', 'dock', 'aerial', 'onboard')),
  
  -- Auto-switch settings
  auto_switch_enabled boolean DEFAULT false,
  auto_switch_interval integer DEFAULT 30, -- seconds
  switch_on_finish boolean DEFAULT false,
  
  -- Status
  is_active boolean DEFAULT true,
  last_frame_time timestamptz,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Livestream overlays table
CREATE TABLE IF NOT EXISTS public.livestream_overlays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.livestream_sessions(id) ON DELETE CASCADE NOT NULL,
  
  -- Overlay type
  type text NOT NULL CHECK (type IN ('scoreboard', 'skipper_info', 'weather', 'heat_info', 'standings', 'sponsor', 'club_logo', 'custom')),
  
  -- Display settings
  is_visible boolean DEFAULT true,
  position jsonb DEFAULT '{"x": 0, "y": 0, "width": 300, "height": 200}'::jsonb,
  z_index integer DEFAULT 1,
  
  -- Content
  content jsonb DEFAULT '{}'::jsonb,
  
  -- Styling
  style jsonb DEFAULT '{
    "backgroundColor": "rgba(0, 0, 0, 0.7)",
    "borderColor": "#3b82f6",
    "textColor": "#ffffff",
    "fontSize": 16
  }'::jsonb,
  
  -- Animation
  animation text CHECK (animation IN ('none', 'fade', 'slide', 'bounce')),
  duration integer, -- seconds to show, null = permanent
  
  display_order integer DEFAULT 0,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Livestream sponsor rotations table
CREATE TABLE IF NOT EXISTS public.livestream_sponsor_rotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.livestream_sessions(id) ON DELETE CASCADE NOT NULL,
  
  -- Sponsor info (can link to advertising system)
  advertiser_id uuid REFERENCES public.advertisers(id) ON DELETE SET NULL,
  sponsor_name text NOT NULL,
  logo_url text,
  
  -- Display settings
  display_type text DEFAULT 'corner' CHECK (display_type IN ('corner', 'banner', 'fullscreen', 'lower_third')),
  position text DEFAULT 'bottom_right' CHECK (position IN ('top_left', 'top_right', 'bottom_left', 'bottom_right', 'center')),
  
  -- Timing
  display_duration integer DEFAULT 10, -- seconds
  rotation_order integer DEFAULT 0,
  
  -- Triggers
  show_between_races boolean DEFAULT true,
  show_during_race boolean DEFAULT false,
  
  -- Status
  is_active boolean DEFAULT true,
  impressions integer DEFAULT 0,
  
  created_at timestamptz DEFAULT now()
);

-- Livestream archives table
CREATE TABLE IF NOT EXISTS public.livestream_archives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.livestream_sessions(id) ON DELETE CASCADE NOT NULL,
  club_id uuid REFERENCES public.clubs(id) ON DELETE CASCADE NOT NULL,
  
  -- YouTube video info
  youtube_video_id text NOT NULL,
  youtube_url text NOT NULL,
  thumbnail_url text,
  
  -- Race linkage
  event_id uuid REFERENCES public.quick_races(id) ON DELETE SET NULL,
  heat_number integer,
  
  -- Metadata
  title text NOT NULL,
  description text,
  duration integer, -- seconds
  
  -- Engagement metrics
  view_count integer DEFAULT 0,
  like_count integer DEFAULT 0,
  comment_count integer DEFAULT 0,
  
  -- Timestamps
  recorded_at timestamptz NOT NULL,
  published_at timestamptz,
  
  -- Visibility
  is_public boolean DEFAULT true,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_livestream_sessions_club_id ON public.livestream_sessions(club_id);
CREATE INDEX IF NOT EXISTS idx_livestream_sessions_event_id ON public.livestream_sessions(event_id);
CREATE INDEX IF NOT EXISTS idx_livestream_sessions_status ON public.livestream_sessions(status);
CREATE INDEX IF NOT EXISTS idx_livestream_cameras_session_id ON public.livestream_cameras(session_id);
CREATE INDEX IF NOT EXISTS idx_livestream_overlays_session_id ON public.livestream_overlays(session_id);
CREATE INDEX IF NOT EXISTS idx_livestream_archives_club_id ON public.livestream_archives(club_id);
CREATE INDEX IF NOT EXISTS idx_livestream_archives_event_id ON public.livestream_archives(event_id);
CREATE INDEX IF NOT EXISTS idx_livestream_archives_youtube_video_id ON public.livestream_archives(youtube_video_id);

-- Enable RLS
ALTER TABLE public.livestream_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.livestream_cameras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.livestream_overlays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.livestream_sponsor_rotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.livestream_archives ENABLE ROW LEVEL SECURITY;

-- RLS Policies for livestream_sessions
CREATE POLICY "Club admins can view their sessions"
  ON public.livestream_sessions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.club_id = livestream_sessions.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "Club admins can create sessions"
  ON public.livestream_sessions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.club_id = livestream_sessions.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "Club admins can update their sessions"
  ON public.livestream_sessions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.club_id = livestream_sessions.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.club_id = livestream_sessions.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "Club admins can delete their sessions"
  ON public.livestream_sessions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.club_id = livestream_sessions.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  );

-- RLS Policies for livestream_cameras
CREATE POLICY "Users can view cameras for their sessions"
  ON public.livestream_cameras FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.livestream_sessions
      JOIN public.user_clubs ON user_clubs.club_id = livestream_sessions.club_id
      WHERE livestream_sessions.id = livestream_cameras.session_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "Users can manage cameras for their sessions"
  ON public.livestream_cameras FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.livestream_sessions
      JOIN public.user_clubs ON user_clubs.club_id = livestream_sessions.club_id
      WHERE livestream_sessions.id = livestream_cameras.session_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.livestream_sessions
      JOIN public.user_clubs ON user_clubs.club_id = livestream_sessions.club_id
      WHERE livestream_sessions.id = livestream_cameras.session_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  );

-- RLS Policies for livestream_overlays
CREATE POLICY "Users can manage overlays for their sessions"
  ON public.livestream_overlays FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.livestream_sessions
      JOIN public.user_clubs ON user_clubs.club_id = livestream_sessions.club_id
      WHERE livestream_sessions.id = livestream_overlays.session_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.livestream_sessions
      JOIN public.user_clubs ON user_clubs.club_id = livestream_sessions.club_id
      WHERE livestream_sessions.id = livestream_overlays.session_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  );

-- RLS Policies for livestream_sponsor_rotations
CREATE POLICY "Users can manage sponsor rotations for their sessions"
  ON public.livestream_sponsor_rotations FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.livestream_sessions
      JOIN public.user_clubs ON user_clubs.club_id = livestream_sessions.club_id
      WHERE livestream_sessions.id = livestream_sponsor_rotations.session_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.livestream_sessions
      JOIN public.user_clubs ON user_clubs.club_id = livestream_sessions.club_id
      WHERE livestream_sessions.id = livestream_sponsor_rotations.session_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  );

-- RLS Policies for livestream_archives
CREATE POLICY "Club members can view public archives"
  ON public.livestream_archives FOR SELECT
  TO authenticated
  USING (
    is_public = true
    OR EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.club_id = livestream_archives.club_id
      AND user_clubs.user_id = auth.uid()
    )
  );

CREATE POLICY "Public can view public archives"
  ON public.livestream_archives FOR SELECT
  TO anon
  USING (is_public = true);

CREATE POLICY "Club admins can manage archives"
  ON public.livestream_archives FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.club_id = livestream_archives.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.club_id = livestream_archives.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_livestream_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Triggers for updated_at
CREATE TRIGGER update_livestream_sessions_updated_at
  BEFORE UPDATE ON public.livestream_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_livestream_updated_at();

CREATE TRIGGER update_livestream_cameras_updated_at
  BEFORE UPDATE ON public.livestream_cameras
  FOR EACH ROW
  EXECUTE FUNCTION public.update_livestream_updated_at();

CREATE TRIGGER update_livestream_overlays_updated_at
  BEFORE UPDATE ON public.livestream_overlays
  FOR EACH ROW
  EXECUTE FUNCTION public.update_livestream_updated_at();

CREATE TRIGGER update_livestream_archives_updated_at
  BEFORE UPDATE ON public.livestream_archives
  FOR EACH ROW
  EXECUTE FUNCTION public.update_livestream_updated_at();
