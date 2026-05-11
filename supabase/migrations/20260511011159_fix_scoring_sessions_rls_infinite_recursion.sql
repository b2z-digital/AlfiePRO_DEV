/*
  # Fix Scoring Sessions RLS Infinite Recursion

  The "Participants can view joined sessions" policy on scoring_sessions 
  references scoring_session_participants, which has a policy referencing 
  scoring_sessions back, creating infinite recursion.

  Fix: Replace the cross-referencing policy with a security definer function
  that bypasses RLS for the lookup.
*/

-- Drop the problematic policy
DROP POLICY IF EXISTS "Participants can view joined sessions" ON scoring_sessions;

-- Create a helper function that checks participation without triggering RLS
CREATE OR REPLACE FUNCTION is_scoring_session_participant(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM scoring_session_participants
    WHERE session_id = p_session_id
    AND user_id = auth.uid()
    AND is_active = true
  );
$$;

-- Recreate the policy using the helper function
CREATE POLICY "Participants can view joined sessions"
  ON scoring_sessions FOR SELECT
  TO authenticated
  USING (is_scoring_session_participant(id));

-- Also fix the participants policy that references scoring_sessions
DROP POLICY IF EXISTS "Session creators can view participants" ON scoring_session_participants;

CREATE OR REPLACE FUNCTION is_scoring_session_creator(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM scoring_sessions
    WHERE id = p_session_id
    AND created_by = auth.uid()
  );
$$;

CREATE POLICY "Session creators can view participants"
  ON scoring_session_participants FOR SELECT
  TO authenticated
  USING (is_scoring_session_creator(session_id));

-- Fix the delete policy too
DROP POLICY IF EXISTS "Session creators can remove participants" ON scoring_session_participants;

CREATE POLICY "Session creators can remove participants"
  ON scoring_session_participants FOR DELETE
  TO authenticated
  USING (is_scoring_session_creator(session_id));
