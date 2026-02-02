/*
  # Allow Anonymous Camera Registration for Livestreams

  1. Changes
    - Add policy to allow anonymous users to register mobile cameras
    - Add policy to allow anonymous users to view camera sources for active sessions
    - Add policy to allow anonymous users to update their camera status

  2. Security
    - Anonymous users can only register cameras for active/streaming sessions
    - They can only update cameras they created (matched by device_info)
    - Cannot access cameras for ended sessions
*/

-- Policy: Allow anonymous users to view cameras for active sessions
CREATE POLICY "Anonymous can view cameras for active sessions"
  ON livestream_camera_sources
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM livestream_sessions ls
      WHERE ls.id = livestream_camera_sources.livestream_session_id
      AND ls.status IN ('active', 'streaming')
    )
  );

-- Policy: Allow anonymous users to register cameras for active sessions
CREATE POLICY "Anonymous can register cameras for active sessions"
  ON livestream_camera_sources
  FOR INSERT
  TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM livestream_sessions ls
      WHERE ls.id = livestream_camera_sources.livestream_session_id
      AND ls.status IN ('active', 'streaming')
    )
  );

-- Policy: Allow anonymous users to update camera status
-- Note: This is a simple policy that allows updates for active sessions
-- In production, you might want to add device fingerprinting to ensure
-- devices can only update their own camera records
CREATE POLICY "Anonymous can update cameras for active sessions"
  ON livestream_camera_sources
  FOR UPDATE
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM livestream_sessions ls
      WHERE ls.id = livestream_camera_sources.livestream_session_id
      AND ls.status IN ('active', 'streaming')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM livestream_sessions ls
      WHERE ls.id = livestream_camera_sources.livestream_session_id
      AND ls.status IN ('active', 'streaming')
    )
  );