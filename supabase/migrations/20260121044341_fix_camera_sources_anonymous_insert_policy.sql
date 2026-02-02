/*
  # Fix Camera Sources Anonymous Insert Policy

  1. Issue
    - Anonymous INSERT policy required session status 'active' or 'streaming'
    - But sessions use 'testing' status when setting up
    - This prevented mobile cameras from registering

  2. Fix
    - Update INSERT policy to allow 'testing', 'live', 'scheduled' status
    - Make consistent with UPDATE/SELECT policies
*/

-- Drop the old restrictive policy
DROP POLICY IF EXISTS "Anonymous can register cameras for active sessions" ON livestream_camera_sources;

-- Create fixed policy with correct statuses
CREATE POLICY "Anonymous can register cameras for active sessions"
  ON livestream_camera_sources
  FOR INSERT
  TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM livestream_sessions ls
      WHERE ls.id = livestream_camera_sources.livestream_session_id
      AND ls.status IN ('testing', 'live', 'scheduled')
    )
  );
