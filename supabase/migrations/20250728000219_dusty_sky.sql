/*
  # YouTube Integration and Media Management System

  1. Database Schema Updates
    - Add YouTube integration columns to club_integrations table
    - Create event_media table for centralized media management
    - Update existing tables to reference new media system

  2. New Tables
    - `event_media` - Centralized media storage with event associations
      - Supports both images and YouTube videos
      - Links to events with proper metadata for filtering

  3. Security
    - Enable RLS on event_media table
    - Add policies for club-based access control
*/

-- Add YouTube integration columns to club_integrations table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'club_integrations' AND column_name = 'youtube_channel_id'
  ) THEN
    ALTER TABLE club_integrations ADD COLUMN youtube_channel_id text;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'club_integrations' AND column_name = 'youtube_channel_name'
  ) THEN
    ALTER TABLE club_integrations ADD COLUMN youtube_channel_name text;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'club_integrations' AND column_name = 'youtube_access_token'
  ) THEN
    ALTER TABLE club_integrations ADD COLUMN youtube_access_token text;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'club_integrations' AND column_name = 'youtube_refresh_token'
  ) THEN
    ALTER TABLE club_integrations ADD COLUMN youtube_refresh_token text;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'club_integrations' AND column_name = 'youtube_token_expires_at'
  ) THEN
    ALTER TABLE club_integrations ADD COLUMN youtube_token_expires_at timestamptz;
  END IF;
END $$;

-- Create event_media table for centralized media management
CREATE TABLE IF NOT EXISTS event_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  media_type text NOT NULL CHECK (media_type IN ('image', 'youtube_video')),
  url text NOT NULL,
  thumbnail_url text,
  title text,
  description text,
  event_ref_id uuid,
  event_ref_type text CHECK (event_ref_type IN ('quick_race', 'race_series', 'public_event')),
  event_name text,
  race_class text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS on event_media table
ALTER TABLE event_media ENABLE ROW LEVEL SECURITY;

-- Add RLS policies for event_media
CREATE POLICY "Club members can view event media"
  ON event_media
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = event_media.club_id
      AND uc.user_id = auth.uid()
    )
  );

CREATE POLICY "Club admins and editors can manage event media"
  ON event_media
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = event_media.club_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = event_media.club_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "Public can view event media"
  ON event_media
  FOR SELECT
  TO public
  USING (true);

-- Add updated_at trigger for event_media
CREATE TRIGGER update_event_media_updated_at
  BEFORE UPDATE ON event_media
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_event_media_club_id ON event_media(club_id);
CREATE INDEX IF NOT EXISTS idx_event_media_event_ref ON event_media(event_ref_id, event_ref_type);
CREATE INDEX IF NOT EXISTS idx_event_media_type ON event_media(media_type);
CREATE INDEX IF NOT EXISTS idx_event_media_race_class ON event_media(race_class);
CREATE INDEX IF NOT EXISTS idx_event_media_event_name ON event_media(event_name);