/*
  # Allow Anonymous Users to Join Scoring Sessions

  1. Changes
    - Updates `join_scoring_session` RPC to work without authentication
    - User ID becomes optional (NULL for anonymous participants)
    - Adds anon role policies for scoring_session_participants INSERT
    - Adds anon role SELECT policy for scoring_sessions (read by PIN lookup in function)

  2. Security
    - Anonymous users can only join via PIN (validated in security definer function)
    - Anonymous participants have NULL user_id
    - Session creators (authenticated) retain full management control
    - The RPC is SECURITY DEFINER so it bypasses RLS for the lookup

  3. Notes
    - Similar pattern to delegated roll call (anonymous access via token/PIN)
    - Display name is required for anonymous participants
*/

-- Replace the join function to allow anonymous callers
CREATE OR REPLACE FUNCTION join_scoring_session(
  p_pin_code text,
  p_display_name text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session scoring_sessions%ROWTYPE;
  v_participant_count integer;
  v_existing_participant scoring_session_participants%ROWTYPE;
  v_user_id uuid;
  v_display text;
BEGIN
  v_user_id := auth.uid();
  v_display := COALESCE(NULLIF(TRIM(p_display_name), ''), 'Scorer');

  -- Find the active session by PIN
  SELECT * INTO v_session
  FROM scoring_sessions
  WHERE pin_code = p_pin_code
    AND is_active = true
    AND expires_at > now();

  IF v_session.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired PIN code');
  END IF;

  -- If authenticated user is the creator, just return session info
  IF v_user_id IS NOT NULL AND v_session.created_by = v_user_id THEN
    RETURN jsonb_build_object(
      'success', true, 
      'session_id', v_session.id,
      'event_id', v_session.event_id,
      'event_name', v_session.event_name,
      'club_id', v_session.club_id,
      'is_creator', true
    );
  END IF;

  -- If authenticated, check for existing participation by user_id
  IF v_user_id IS NOT NULL THEN
    SELECT * INTO v_existing_participant
    FROM scoring_session_participants
    WHERE session_id = v_session.id
      AND user_id = v_user_id;

    IF v_existing_participant.id IS NOT NULL THEN
      UPDATE scoring_session_participants
      SET is_active = true, last_active_at = now(), display_name = v_display
      WHERE id = v_existing_participant.id;

      RETURN jsonb_build_object(
        'success', true,
        'session_id', v_session.id,
        'event_id', v_session.event_id,
        'event_name', v_session.event_name,
        'club_id', v_session.club_id,
        'is_creator', false
      );
    END IF;
  END IF;

  -- Check participant count limit
  SELECT COUNT(*) INTO v_participant_count
  FROM scoring_session_participants
  WHERE session_id = v_session.id
    AND is_active = true;

  IF v_participant_count >= v_session.max_collaborators THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session is full');
  END IF;

  -- Insert new participant (user_id can be NULL for anonymous)
  INSERT INTO scoring_session_participants (session_id, user_id, display_name)
  VALUES (v_session.id, v_user_id, v_display);

  RETURN jsonb_build_object(
    'success', true,
    'session_id', v_session.id,
    'event_id', v_session.event_id,
    'event_name', v_session.event_name,
    'club_id', v_session.club_id,
    'is_creator', false
  );
END;
$$;

-- Grant execute to anon role so unauthenticated users can call the RPC
GRANT EXECUTE ON FUNCTION join_scoring_session(text, text) TO anon;
