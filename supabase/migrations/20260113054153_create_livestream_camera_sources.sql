/*
  # Create Livestream Camera Sources System

  1. New Tables
    - `livestream_camera_sources`
      - `id` (uuid, primary key)
      - `livestream_session_id` (uuid, foreign key to livestream_sessions)
      - `camera_name` (text) - User-defined name for the camera
      - `camera_type` (text) - Type: 'laptop', 'mobile', 'action', 'external'
      - `connection_url` (text, nullable) - URL for mobile/remote cameras
      - `device_info` (jsonb, nullable) - Device details (user agent, specs)
      - `is_primary` (boolean, default false) - Active streaming camera
      - `status` (text) - Status: 'connected', 'disconnected', 'streaming', 'error'
      - `quality_settings` (jsonb, nullable) - Resolution, FPS, bitrate settings
      - `position` (integer) - Display order
      - `created_at` (timestamptz)
      - `last_connected_at` (timestamptz, nullable)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `livestream_camera_sources` table
    - Add policies for authenticated users to manage cameras for their sessions
*/

-- Create livestream camera sources table
CREATE TABLE IF NOT EXISTS livestream_camera_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  livestream_session_id uuid REFERENCES livestream_sessions(id) ON DELETE CASCADE NOT NULL,
  camera_name text NOT NULL,
  camera_type text NOT NULL CHECK (camera_type IN ('laptop', 'mobile', 'action', 'external')),
  connection_url text,
  device_info jsonb DEFAULT '{}'::jsonb,
  is_primary boolean DEFAULT false,
  status text NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'streaming', 'error')),
  quality_settings jsonb DEFAULT '{"resolution": "1920x1080", "fps": 30, "bitrate": "2500"}'::jsonb,
  position integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  last_connected_at timestamptz,
  updated_at timestamptz DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_camera_sources_session ON livestream_camera_sources(livestream_session_id);
CREATE INDEX IF NOT EXISTS idx_camera_sources_primary ON livestream_camera_sources(livestream_session_id, is_primary) WHERE is_primary = true;

-- Enable RLS
ALTER TABLE livestream_camera_sources ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view camera sources for livestream sessions they can access
CREATE POLICY "Users can view camera sources for accessible sessions"
  ON livestream_camera_sources
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM livestream_sessions ls
      WHERE ls.id = livestream_camera_sources.livestream_session_id
      AND (
        ls.club_id IN (
          SELECT club_id FROM public.user_clubs WHERE user_id = auth.uid()
        )
        OR ls.created_by = auth.uid()
      )
    )
  );

-- Policy: Users can insert camera sources for sessions they can access
CREATE POLICY "Users can add cameras to accessible sessions"
  ON livestream_camera_sources
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM livestream_sessions ls
      WHERE ls.id = livestream_camera_sources.livestream_session_id
      AND (
        ls.club_id IN (
          SELECT club_id FROM public.user_clubs WHERE user_id = auth.uid()
        )
        OR ls.created_by = auth.uid()
      )
    )
  );

-- Policy: Users can update camera sources for sessions they can access
CREATE POLICY "Users can update cameras in accessible sessions"
  ON livestream_camera_sources
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM livestream_sessions ls
      WHERE ls.id = livestream_camera_sources.livestream_session_id
      AND (
        ls.club_id IN (
          SELECT club_id FROM public.user_clubs WHERE user_id = auth.uid()
        )
        OR ls.created_by = auth.uid()
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM livestream_sessions ls
      WHERE ls.id = livestream_camera_sources.livestream_session_id
      AND (
        ls.club_id IN (
          SELECT club_id FROM public.user_clubs WHERE user_id = auth.uid()
        )
        OR ls.created_by = auth.uid()
      )
    )
  );

-- Policy: Users can delete camera sources for sessions they can access
CREATE POLICY "Users can delete cameras from accessible sessions"
  ON livestream_camera_sources
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM livestream_sessions ls
      WHERE ls.id = livestream_camera_sources.livestream_session_id
      AND (
        ls.club_id IN (
          SELECT club_id FROM public.user_clubs WHERE user_id = auth.uid()
        )
        OR ls.created_by = auth.uid()
      )
    )
  );

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_camera_source_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to automatically update the updated_at column
DROP TRIGGER IF EXISTS update_camera_source_timestamp ON livestream_camera_sources;
CREATE TRIGGER update_camera_source_timestamp
  BEFORE UPDATE ON livestream_camera_sources
  FOR EACH ROW
  EXECUTE FUNCTION update_camera_source_updated_at();

-- Function to ensure only one primary camera per session
CREATE OR REPLACE FUNCTION ensure_single_primary_camera()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_primary = true THEN
    UPDATE livestream_camera_sources
    SET is_primary = false
    WHERE livestream_session_id = NEW.livestream_session_id
    AND id != NEW.id
    AND is_primary = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to ensure only one primary camera
DROP TRIGGER IF EXISTS ensure_single_primary_camera_trigger ON livestream_camera_sources;
CREATE TRIGGER ensure_single_primary_camera_trigger
  BEFORE INSERT OR UPDATE ON livestream_camera_sources
  FOR EACH ROW
  WHEN (NEW.is_primary = true)
  EXECUTE FUNCTION ensure_single_primary_camera();