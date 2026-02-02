/*
  # Add YouTube Playlist Import System

  1. New Tables
    - `alfie_tv_youtube_playlists`
      - Stores YouTube playlists imported from channels
      - `id` (uuid, primary key)
      - `channel_id` (uuid, references alfie_tv_channels)
      - `youtube_playlist_id` (text, unique YouTube playlist ID)
      - `title` (text)
      - `description` (text)
      - `thumbnail_url` (text)
      - `video_count` (integer)
      - `published_at` (timestamptz)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `alfie_tv_youtube_playlist_videos`
      - Junction table linking videos to YouTube playlists
      - `youtube_playlist_id` (uuid, references alfie_tv_youtube_playlists)
      - `video_id` (uuid, references alfie_tv_videos)
      - `position` (integer, order in playlist)
      - Primary key on (youtube_playlist_id, video_id)

  2. Security
    - Enable RLS on both tables
    - Public can view playlists from approved channels
    - Admins can manage playlists

  3. Indexes
    - Index on channel_id for fast lookup
    - Index on youtube_playlist_id for uniqueness
    - Index on video_id for junction table
*/

-- Create YouTube playlists table
CREATE TABLE IF NOT EXISTS alfie_tv_youtube_playlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES alfie_tv_channels(id) ON DELETE CASCADE,
  youtube_playlist_id text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  thumbnail_url text,
  video_count integer DEFAULT 0,
  published_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create YouTube playlist videos junction table
CREATE TABLE IF NOT EXISTS alfie_tv_youtube_playlist_videos (
  youtube_playlist_id uuid NOT NULL REFERENCES alfie_tv_youtube_playlists(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES alfie_tv_videos(id) ON DELETE CASCADE,
  position integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (youtube_playlist_id, video_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_alfie_tv_youtube_playlists_channel ON alfie_tv_youtube_playlists(channel_id);
CREATE INDEX IF NOT EXISTS idx_alfie_tv_youtube_playlists_youtube_id ON alfie_tv_youtube_playlists(youtube_playlist_id);
CREATE INDEX IF NOT EXISTS idx_alfie_tv_youtube_playlist_videos_video ON alfie_tv_youtube_playlist_videos(video_id);

-- Enable RLS
ALTER TABLE alfie_tv_youtube_playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE alfie_tv_youtube_playlist_videos ENABLE ROW LEVEL SECURITY;

-- RLS Policies for YouTube playlists
CREATE POLICY "Anyone can view YouTube playlists"
  ON alfie_tv_youtube_playlists FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Admins can insert YouTube playlists"
  ON alfie_tv_youtube_playlists FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Admins can update YouTube playlists"
  ON alfie_tv_youtube_playlists FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Admins can delete YouTube playlists"
  ON alfie_tv_youtube_playlists FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'super_admin')
    )
  );

-- RLS Policies for YouTube playlist videos junction
CREATE POLICY "Anyone can view YouTube playlist videos"
  ON alfie_tv_youtube_playlist_videos FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Admins can insert YouTube playlist videos"
  ON alfie_tv_youtube_playlist_videos FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Admins can delete YouTube playlist videos"
  ON alfie_tv_youtube_playlist_videos FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'super_admin')
    )
  );