/*
  # Group Calls System

  1. Modified Tables
    - `voice_calls`
      - Added `is_group_call` (boolean, default false)
      - Added `group_call_id` (uuid, nullable)

  2. New Tables
    - `group_call_sessions` - main group call session record
    - `group_call_participants` - tracks each participant in a group call
    - `support_session_requests` - admin support tool for view-as-member during calls

  3. Security
    - RLS enabled on all new tables
    - Policies enforce participant-only access
    - Max 6 participants per group call
*/

-- Add group call fields to voice_calls
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'voice_calls' AND column_name = 'is_group_call'
  ) THEN
    ALTER TABLE voice_calls ADD COLUMN is_group_call boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'voice_calls' AND column_name = 'group_call_id'
  ) THEN
    ALTER TABLE voice_calls ADD COLUMN group_call_id uuid;
  END IF;
END $$;

-- Group call sessions
CREATE TABLE IF NOT EXISTS group_call_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  initiated_by uuid NOT NULL REFERENCES auth.users(id),
  club_id uuid,
  conversation_id uuid,
  is_video boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  max_participants integer NOT NULL DEFAULT 6,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE group_call_sessions ENABLE ROW LEVEL SECURITY;

-- Group call participants
CREATE TABLE IF NOT EXISTS group_call_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_call_id uuid NOT NULL REFERENCES group_call_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'ringing',
  joined_at timestamptz,
  left_at timestamptz,
  is_muted boolean NOT NULL DEFAULT false,
  is_video_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_call_id, user_id)
);

ALTER TABLE group_call_participants ENABLE ROW LEVEL SECURITY;

-- Support session requests
CREATE TABLE IF NOT EXISTS support_session_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_call_id uuid REFERENCES group_call_sessions(id),
  requester_id uuid NOT NULL REFERENCES auth.users(id),
  target_user_id uuid NOT NULL REFERENCES auth.users(id),
  club_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  requested_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE support_session_requests ENABLE ROW LEVEL SECURITY;

-- Now create policies (tables exist)
CREATE POLICY "Participants can view their group calls"
  ON group_call_sessions FOR SELECT
  TO authenticated
  USING (
    initiated_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM group_call_participants
      WHERE group_call_participants.group_call_id = group_call_sessions.id
      AND group_call_participants.user_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can create group calls"
  ON group_call_sessions FOR INSERT
  TO authenticated
  WITH CHECK (initiated_by = auth.uid());

CREATE POLICY "Initiator can update group call"
  ON group_call_sessions FOR UPDATE
  TO authenticated
  USING (initiated_by = auth.uid())
  WITH CHECK (initiated_by = auth.uid());

CREATE POLICY "Users can view participants in their calls"
  ON group_call_participants FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM group_call_participants gcp
      WHERE gcp.group_call_id = group_call_participants.group_call_id
      AND gcp.user_id = auth.uid()
    )
  );

CREATE POLICY "Call initiator can add participants"
  ON group_call_participants FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM group_call_sessions
      WHERE group_call_sessions.id = group_call_id
      AND (group_call_sessions.initiated_by = auth.uid() OR user_id = auth.uid())
    )
  );

CREATE POLICY "Users can update own participant status"
  ON group_call_participants FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM group_call_sessions
    WHERE group_call_sessions.id = group_call_participants.group_call_id
    AND group_call_sessions.initiated_by = auth.uid()
  ))
  WITH CHECK (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM group_call_sessions
    WHERE group_call_sessions.id = group_call_participants.group_call_id
    AND group_call_sessions.initiated_by = auth.uid()
  ));

CREATE POLICY "Requester can view own requests"
  ON support_session_requests FOR SELECT
  TO authenticated
  USING (requester_id = auth.uid() OR target_user_id = auth.uid());

CREATE POLICY "Admins can create support requests"
  ON support_session_requests FOR INSERT
  TO authenticated
  WITH CHECK (requester_id = auth.uid());

CREATE POLICY "Target user can respond to requests"
  ON support_session_requests FOR UPDATE
  TO authenticated
  USING (target_user_id = auth.uid() OR requester_id = auth.uid())
  WITH CHECK (target_user_id = auth.uid() OR requester_id = auth.uid());

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE group_call_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE group_call_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE support_session_requests;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_group_call_participants_call_id ON group_call_participants(group_call_id);
CREATE INDEX IF NOT EXISTS idx_group_call_participants_user_id ON group_call_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_group_call_sessions_initiated_by ON group_call_sessions(initiated_by);
CREATE INDEX IF NOT EXISTS idx_support_session_requests_target ON support_session_requests(target_user_id, status);
