/*
  # Create Collaborative Scoring Sessions

  1. New Tables
    - `scoring_sessions` - Stores active scoring sessions with PIN codes
    - `scoring_session_participants` - Tracks who joined each session

  2. Security
    - RLS enabled on both tables
    - Session creators can manage sessions
    - Authenticated users can join via PIN
    - Participants can view session details

  3. Notes
    - 6-digit numeric PIN for easy sharing
    - Sessions expire after 24 hours by default
    - Max 5 collaborators per session
*/

CREATE TABLE IF NOT EXISTS scoring_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  event_name text NOT NULL DEFAULT '',
  pin_code text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  is_active boolean NOT NULL DEFAULT true,
  max_collaborators integer NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_scoring_sessions_active_pin 
  ON scoring_sessions (pin_code) 
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_scoring_sessions_event 
  ON scoring_sessions (club_id, event_id) 
  WHERE is_active = true;

ALTER TABLE scoring_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Session creators can view own sessions"
  ON scoring_sessions FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Session creators can insert sessions"
  ON scoring_sessions FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Session creators can update own sessions"
  ON scoring_sessions FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Session creators can delete own sessions"
  ON scoring_sessions FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

CREATE TABLE IF NOT EXISTS scoring_session_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES scoring_sessions(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  display_name text NOT NULL DEFAULT '',
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_scoring_session_participants_session 
  ON scoring_session_participants (session_id) 
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_scoring_session_participants_user 
  ON scoring_session_participants (user_id) 
  WHERE is_active = true;

ALTER TABLE scoring_session_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Session creators can view participants"
  ON scoring_session_participants FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM scoring_sessions
      WHERE scoring_sessions.id = scoring_session_participants.session_id
      AND scoring_sessions.created_by = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can join sessions"
  ON scoring_session_participants FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Participants can view own participation"
  ON scoring_session_participants FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Participants can update own record"
  ON scoring_session_participants FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Session creators can remove participants"
  ON scoring_session_participants FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM scoring_sessions
      WHERE scoring_sessions.id = scoring_session_participants.session_id
      AND scoring_sessions.created_by = auth.uid()
    )
  );

-- Participants can also view the session they joined
CREATE POLICY "Participants can view joined sessions"
  ON scoring_sessions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM scoring_session_participants
      WHERE scoring_session_participants.session_id = scoring_sessions.id
      AND scoring_session_participants.user_id = auth.uid()
    )
  );

-- Function to validate and join a scoring session by PIN
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
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  SELECT * INTO v_session
  FROM scoring_sessions
  WHERE pin_code = p_pin_code
    AND is_active = true
    AND expires_at > now();

  IF v_session.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired PIN code');
  END IF;

  IF v_session.created_by = v_user_id THEN
    RETURN jsonb_build_object(
      'success', true, 
      'session_id', v_session.id,
      'event_id', v_session.event_id,
      'event_name', v_session.event_name,
      'club_id', v_session.club_id,
      'is_creator', true
    );
  END IF;

  SELECT * INTO v_existing_participant
  FROM scoring_session_participants
  WHERE session_id = v_session.id
    AND user_id = v_user_id;

  IF v_existing_participant.id IS NOT NULL THEN
    UPDATE scoring_session_participants
    SET is_active = true, last_active_at = now()
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

  SELECT COUNT(*) INTO v_participant_count
  FROM scoring_session_participants
  WHERE session_id = v_session.id
    AND is_active = true;

  IF v_participant_count >= v_session.max_collaborators THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session is full');
  END IF;

  INSERT INTO scoring_session_participants (session_id, user_id, display_name)
  VALUES (v_session.id, v_user_id, COALESCE(NULLIF(p_display_name, ''), 'Collaborator'));

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

ALTER PUBLICATION supabase_realtime ADD TABLE scoring_session_participants;
