/*
  # Fix Camera Sources RLS for Testing Status

  1. Changes
    - Update anonymous policies to include 'testing' status
    - This allows mobile cameras to register during testing mode
    - Desktop can see mobile cameras while in testing mode

  2. Security
    - Still restricted to active/streaming/testing sessions only
    - No access to ended sessions
*/

-- Drop existing anonymous policies
DROP POLICY IF EXISTS "Anonymous can view cameras for active sessions" ON livestream_camera_sources;
DROP POLICY IF EXISTS "Anonymous can update cameras for active sessions" ON livestream_camera_sources;

-- Recreate with testing status included
CREATE POLICY "Anonymous can view cameras for active sessions"
  ON livestream_camera_sources FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM livestream_sessions ls
      WHERE ls.id = livestream_camera_sources.livestream_session_id
      AND ls.status IN ('testing', 'live', 'scheduled')
    )
  );

CREATE POLICY "Anonymous can update cameras for active sessions"
  ON livestream_camera_sources FOR UPDATE
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM livestream_sessions ls
      WHERE ls.id = livestream_camera_sources.livestream_session_id
      AND ls.status IN ('testing', 'live', 'scheduled')
    )
  );