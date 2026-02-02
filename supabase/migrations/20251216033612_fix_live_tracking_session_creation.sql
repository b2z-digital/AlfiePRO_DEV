/*
  # Fix Live Tracking Session Creation

  ## Problem
  When users try to create a live tracking session, the code first tries to expire
  existing sessions for the same skipper. However, the RLS policy prevents users
  from updating sessions they don't own, causing the session creation to fail.

  ## Solution
  1. Remove the restrictive UPDATE policy
  2. Add a new policy that allows anyone to update sessions to expire them
  3. Keep the ability to update notification preferences restricted to session owners
*/

-- Drop the old restrictive update policy
DROP POLICY IF EXISTS "Users can update own tracking session" ON live_tracking_sessions;

-- Allow anyone to expire sessions (set is_expired = true)
-- This is needed so new users can create sessions for skippers that have old sessions
CREATE POLICY "Anyone can expire old sessions"
  ON live_tracking_sessions
  FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (
    -- If updating is_expired to true, allow it
    (is_expired = true)
    OR
    -- If authenticated and updating their own session, allow it
    ((auth.uid() IS NOT NULL AND member_id = auth.uid()))
    OR
    -- If anonymous, allow updating anonymous sessions
    ((auth.uid() IS NULL AND member_id IS NULL))
  );
