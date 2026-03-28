/*
  # Livestream Race Segmentation and Auto-Upload System

  1. New Tables
    - `livestream_race_segments`
      - `id` (uuid, primary key)
      - `session_id` (uuid, FK -> livestream_sessions)
      - `club_id` (uuid, FK -> clubs)
      - `event_id` (text) - linked event/race
      - `race_number` (integer) - race number within the session
      - `heat_number` (integer, nullable) - heat number if heat racing
      - `segment_title` (text) - auto-generated title like "Race 1 - Event Name"
      - `cloudflare_video_id` (text, nullable) - Cloudflare recording ID for this segment
      - `cloudflare_input_id` (text, nullable) - the live input that created this recording
      - `segment_start_time` (timestamptz) - when this race segment started
      - `segment_end_time` (timestamptz, nullable) - when this race segment ended
      - `duration` (integer, nullable) - seconds
      - `youtube_video_id` (text, nullable) - YouTube video ID after upload
      - `youtube_playlist_id` (text, nullable) - YouTube playlist ID
      - `upload_status` (text) - pending, uploading, uploaded, failed, cleanup_complete
      - `upload_error` (text, nullable) - error message if upload failed
      - `trigger_type` (text) - how this segment was triggered: race_scored, on_hold, manual, stream_end
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `livestream_youtube_playlists`
      - `id` (uuid, primary key)
      - `club_id` (uuid, FK -> clubs)
      - `event_id` (text) - linked event
      - `youtube_playlist_id` (text) - YouTube playlist ID
      - `playlist_title` (text) - event name used as playlist title
      - `created_at` (timestamptz)

  2. Modified Tables
    - `livestream_sessions`
      - Add `auto_segment_enabled` (boolean, default true)
      - Add `current_race_number` (integer, default 0)
      - Add `current_segment_start` (timestamptz, nullable)
      - Add `youtube_playlist_id` (text, nullable)

  3. Security
    - Enable RLS on new tables
    - Add policies for club admin/editor access
    - Add public read for uploaded segments
*/

-- Create livestream_race_segments table
CREATE TABLE IF NOT EXISTS livestream_race_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES livestream_sessions(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  event_id text,
  race_number integer NOT NULL DEFAULT 1,
  heat_number integer,
  segment_title text NOT NULL,
  cloudflare_video_id text,
  cloudflare_input_id text,
  segment_start_time timestamptz NOT NULL DEFAULT now(),
  segment_end_time timestamptz,
  duration integer,
  youtube_video_id text,
  youtube_playlist_id text,
  upload_status text NOT NULL DEFAULT 'pending' CHECK (upload_status IN ('pending', 'uploading', 'uploaded', 'failed', 'cleanup_complete')),
  upload_error text,
  trigger_type text NOT NULL DEFAULT 'manual' CHECK (trigger_type IN ('race_scored', 'on_hold', 'manual', 'stream_end')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE livestream_race_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club admins can manage race segments"
  ON livestream_race_segments
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = livestream_race_segments.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = livestream_race_segments.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "Public can view uploaded segments"
  ON livestream_race_segments
  FOR SELECT
  TO anon
  USING (upload_status = 'uploaded' OR upload_status = 'cleanup_complete');

-- Create livestream_youtube_playlists table
CREATE TABLE IF NOT EXISTS livestream_youtube_playlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  youtube_playlist_id text NOT NULL,
  playlist_title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE livestream_youtube_playlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club admins can manage playlists"
  ON livestream_youtube_playlists
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = livestream_youtube_playlists.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = livestream_youtube_playlists.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  );

-- Add new columns to livestream_sessions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'livestream_sessions' AND column_name = 'auto_segment_enabled'
  ) THEN
    ALTER TABLE livestream_sessions ADD COLUMN auto_segment_enabled boolean NOT NULL DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'livestream_sessions' AND column_name = 'current_race_number'
  ) THEN
    ALTER TABLE livestream_sessions ADD COLUMN current_race_number integer NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'livestream_sessions' AND column_name = 'current_segment_start'
  ) THEN
    ALTER TABLE livestream_sessions ADD COLUMN current_segment_start timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'livestream_sessions' AND column_name = 'youtube_playlist_id'
  ) THEN
    ALTER TABLE livestream_sessions ADD COLUMN youtube_playlist_id text;
  END IF;
END $$;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_livestream_race_segments_session_id ON livestream_race_segments(session_id);
CREATE INDEX IF NOT EXISTS idx_livestream_race_segments_upload_status ON livestream_race_segments(upload_status);
CREATE INDEX IF NOT EXISTS idx_livestream_race_segments_club_id ON livestream_race_segments(club_id);
CREATE INDEX IF NOT EXISTS idx_livestream_youtube_playlists_event_id ON livestream_youtube_playlists(event_id);
CREATE INDEX IF NOT EXISTS idx_livestream_youtube_playlists_club_id ON livestream_youtube_playlists(club_id);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_livestream_race_segments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS update_livestream_race_segments_updated_at ON livestream_race_segments;
CREATE TRIGGER update_livestream_race_segments_updated_at
  BEFORE UPDATE ON livestream_race_segments
  FOR EACH ROW
  EXECUTE FUNCTION update_livestream_race_segments_updated_at();
