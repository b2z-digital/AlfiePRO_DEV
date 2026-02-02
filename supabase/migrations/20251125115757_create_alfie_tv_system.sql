/*
  # Create AlfieTV System

  1. New Tables
    - `alfie_tv_channels`
      - Stores YouTube channel configurations for clubs
      - Includes auto-import settings and channel metadata
    
    - `alfie_tv_videos`
      - Stores video metadata from YouTube
      - Includes categorization (content type, skill level, boat classes)
      - Tracks view counts and featured status
    
    - `alfie_tv_watch_history`
      - Tracks user viewing progress
      - Records watch position and completion status
    
    - `alfie_tv_watchlist`
      - User's saved videos for later watching
    
    - `alfie_tv_playlists`
      - User-created or club playlists
      - Can be public or private
    
    - `alfie_tv_playlist_videos`
      - Junction table for playlist-video relationships
      - Maintains video order with position field
    
    - `alfie_tv_ratings`
      - User ratings for videos
      - Used for recommendations

  2. Security
    - Enable RLS on all tables
    - Club members can view their club's channels and videos
    - Users can manage their own watch history, watchlist, playlists, and ratings
    - Public videos accessible to authenticated users

  3. Functions
    - `increment_video_views` - Safely increment view count
    - `get_recommended_videos` - Basic recommendation engine
*/

-- Create channels table
CREATE TABLE IF NOT EXISTS alfie_tv_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  channel_url text NOT NULL,
  channel_name text NOT NULL,
  channel_id text,
  auto_import boolean DEFAULT false,
  thumbnail_url text,
  subscriber_count integer DEFAULT 0,
  video_count integer DEFAULT 0,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(club_id, channel_url)
);

-- Create videos table
CREATE TABLE IF NOT EXISTS alfie_tv_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  youtube_id text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  thumbnail_url text,
  duration integer NOT NULL DEFAULT 0,
  channel_id uuid NOT NULL REFERENCES alfie_tv_channels(id) ON DELETE CASCADE,
  boat_classes text[] DEFAULT '{}',
  content_type text NOT NULL DEFAULT 'other',
  skill_level text NOT NULL DEFAULT 'beginner',
  view_count integer DEFAULT 0,
  like_count integer DEFAULT 0,
  published_at timestamptz,
  is_featured boolean DEFAULT false,
  tags text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_content_type CHECK (content_type IN ('racing', 'tuning', 'building', 'technique', 'review', 'regatta', 'tutorial', 'news', 'other')),
  CONSTRAINT valid_skill_level CHECK (skill_level IN ('beginner', 'intermediate', 'advanced', 'pro'))
);

-- Create watch history table
CREATE TABLE IF NOT EXISTS alfie_tv_watch_history (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES alfie_tv_videos(id) ON DELETE CASCADE,
  watch_position integer NOT NULL DEFAULT 0,
  watch_duration integer NOT NULL DEFAULT 0,
  completed boolean DEFAULT false,
  last_watched timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, video_id)
);

-- Create watchlist table
CREATE TABLE IF NOT EXISTS alfie_tv_watchlist (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES alfie_tv_videos(id) ON DELETE CASCADE,
  added_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, video_id)
);

-- Create playlists table
CREATE TABLE IF NOT EXISTS alfie_tv_playlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  club_id uuid REFERENCES clubs(id) ON DELETE CASCADE,
  is_public boolean DEFAULT false,
  thumbnail_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create playlist videos junction table
CREATE TABLE IF NOT EXISTS alfie_tv_playlist_videos (
  playlist_id uuid NOT NULL REFERENCES alfie_tv_playlists(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES alfie_tv_videos(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  added_at timestamptz DEFAULT now(),
  PRIMARY KEY (playlist_id, video_id)
);

-- Create ratings table
CREATE TABLE IF NOT EXISTS alfie_tv_ratings (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES alfie_tv_videos(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, video_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_alfie_tv_channels_club ON alfie_tv_channels(club_id);
CREATE INDEX IF NOT EXISTS idx_alfie_tv_videos_channel ON alfie_tv_videos(channel_id);
CREATE INDEX IF NOT EXISTS idx_alfie_tv_videos_content_type ON alfie_tv_videos(content_type);
CREATE INDEX IF NOT EXISTS idx_alfie_tv_videos_featured ON alfie_tv_videos(is_featured);
CREATE INDEX IF NOT EXISTS idx_alfie_tv_videos_published ON alfie_tv_videos(published_at);
CREATE INDEX IF NOT EXISTS idx_alfie_tv_watch_history_user ON alfie_tv_watch_history(user_id);
CREATE INDEX IF NOT EXISTS idx_alfie_tv_watch_history_video ON alfie_tv_watch_history(video_id);
CREATE INDEX IF NOT EXISTS idx_alfie_tv_watchlist_user ON alfie_tv_watchlist(user_id);
CREATE INDEX IF NOT EXISTS idx_alfie_tv_playlists_user ON alfie_tv_playlists(user_id);
CREATE INDEX IF NOT EXISTS idx_alfie_tv_playlists_club ON alfie_tv_playlists(club_id);

-- Enable RLS
ALTER TABLE alfie_tv_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE alfie_tv_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE alfie_tv_watch_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE alfie_tv_watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE alfie_tv_playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE alfie_tv_playlist_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE alfie_tv_ratings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for channels
CREATE POLICY "Club members can view channels"
  ON alfie_tv_channels FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = alfie_tv_channels.club_id
      AND user_clubs.user_id = auth.uid()
    )
  );

CREATE POLICY "Club admins can insert channels"
  ON alfie_tv_channels FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = alfie_tv_channels.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'admin'
    )
  );

CREATE POLICY "Club admins can update channels"
  ON alfie_tv_channels FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = alfie_tv_channels.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'admin'
    )
  );

CREATE POLICY "Club admins can delete channels"
  ON alfie_tv_channels FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = alfie_tv_channels.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'admin'
    )
  );

-- RLS Policies for videos
CREATE POLICY "Users can view videos from their club channels"
  ON alfie_tv_videos FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM alfie_tv_channels
      JOIN user_clubs ON user_clubs.club_id = alfie_tv_channels.club_id
      WHERE alfie_tv_channels.id = alfie_tv_videos.channel_id
      AND user_clubs.user_id = auth.uid()
    )
  );

CREATE POLICY "Club admins can insert videos"
  ON alfie_tv_videos FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM alfie_tv_channels
      JOIN user_clubs ON user_clubs.club_id = alfie_tv_channels.club_id
      WHERE alfie_tv_channels.id = alfie_tv_videos.channel_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'admin'
    )
  );

CREATE POLICY "Club admins can update videos"
  ON alfie_tv_videos FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM alfie_tv_channels
      JOIN user_clubs ON user_clubs.club_id = alfie_tv_channels.club_id
      WHERE alfie_tv_channels.id = alfie_tv_videos.channel_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'admin'
    )
  );

CREATE POLICY "Club admins can delete videos"
  ON alfie_tv_videos FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM alfie_tv_channels
      JOIN user_clubs ON user_clubs.club_id = alfie_tv_channels.club_id
      WHERE alfie_tv_channels.id = alfie_tv_videos.channel_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'admin'
    )
  );

-- RLS Policies for watch history
CREATE POLICY "Users can view own watch history"
  ON alfie_tv_watch_history FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own watch history"
  ON alfie_tv_watch_history FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own watch history"
  ON alfie_tv_watch_history FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own watch history"
  ON alfie_tv_watch_history FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for watchlist
CREATE POLICY "Users can view own watchlist"
  ON alfie_tv_watchlist FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert to own watchlist"
  ON alfie_tv_watchlist FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete from own watchlist"
  ON alfie_tv_watchlist FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for playlists
CREATE POLICY "Users can view own playlists"
  ON alfie_tv_playlists FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR is_public = true);

CREATE POLICY "Users can insert own playlists"
  ON alfie_tv_playlists FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own playlists"
  ON alfie_tv_playlists FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own playlists"
  ON alfie_tv_playlists FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for playlist videos
CREATE POLICY "Users can view playlist videos"
  ON alfie_tv_playlist_videos FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM alfie_tv_playlists
      WHERE alfie_tv_playlists.id = alfie_tv_playlist_videos.playlist_id
      AND (alfie_tv_playlists.user_id = auth.uid() OR alfie_tv_playlists.is_public = true)
    )
  );

CREATE POLICY "Users can insert to own playlists"
  ON alfie_tv_playlist_videos FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM alfie_tv_playlists
      WHERE alfie_tv_playlists.id = alfie_tv_playlist_videos.playlist_id
      AND alfie_tv_playlists.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete from own playlists"
  ON alfie_tv_playlist_videos FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM alfie_tv_playlists
      WHERE alfie_tv_playlists.id = alfie_tv_playlist_videos.playlist_id
      AND alfie_tv_playlists.user_id = auth.uid()
    )
  );

-- RLS Policies for ratings
CREATE POLICY "Users can view all ratings"
  ON alfie_tv_ratings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own ratings"
  ON alfie_tv_ratings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own ratings"
  ON alfie_tv_ratings FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own ratings"
  ON alfie_tv_ratings FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create function to increment view count
CREATE OR REPLACE FUNCTION increment_video_views(video_uuid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE alfie_tv_videos
  SET view_count = view_count + 1
  WHERE id = video_uuid;
END;
$$;

-- Create function for basic recommendations
CREATE OR REPLACE FUNCTION get_recommended_videos(user_uuid uuid, limit_count integer DEFAULT 20)
RETURNS TABLE (
  id uuid,
  youtube_id text,
  title text,
  description text,
  thumbnail_url text,
  duration integer,
  channel_id uuid,
  boat_classes text[],
  content_type text,
  skill_level text,
  view_count integer,
  like_count integer,
  published_at timestamptz,
  is_featured boolean,
  tags text[],
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT v.*
  FROM alfie_tv_videos v
  JOIN alfie_tv_channels c ON c.id = v.channel_id
  JOIN user_clubs uc ON uc.club_id = c.club_id
  WHERE uc.user_id = user_uuid
  AND v.id NOT IN (
    SELECT video_id FROM alfie_tv_watch_history
    WHERE user_id = user_uuid AND completed = true
  )
  ORDER BY v.view_count DESC, v.published_at DESC
  LIMIT limit_count;
END;
$$;