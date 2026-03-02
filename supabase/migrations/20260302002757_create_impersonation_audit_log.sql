/*
  # Create Impersonation Audit Log System

  1. New Tables
    - `impersonation_audit_log`
      - `id` (uuid, primary key)
      - `admin_user_id` (uuid, references auth.users) - The admin performing impersonation
      - `target_user_id` (uuid, references auth.users) - The user being impersonated
      - `target_member_id` (uuid) - The member record ID
      - `admin_email` (text) - Admin's email for easy lookup
      - `target_email` (text) - Target user's email for easy lookup
      - `target_name` (text) - Target user's display name
      - `admin_role` (text) - The admin's role at time of impersonation
      - `reason` (text) - Optional reason for impersonation
      - `started_at` (timestamptz) - When impersonation started
      - `ended_at` (timestamptz) - When impersonation ended (null if active)
      - `club_id` (uuid) - Club context when impersonation started
      - `club_name` (text) - Club name for easy lookup
      - `ip_address` (text) - Optional IP tracking

  2. Security
    - Enable RLS on impersonation_audit_log table
    - Only super admins can view all logs
    - Association admins can view logs for their own impersonations
    - Create RPC for logging impersonation start/end

  3. Notes
    - This is a write-once audit trail - no updates or deletes allowed by users
    - Only the end_session function can update the ended_at field
*/

CREATE TABLE IF NOT EXISTS public.impersonation_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES auth.users(id),
  target_user_id uuid REFERENCES auth.users(id),
  target_member_id uuid,
  admin_email text NOT NULL DEFAULT '',
  target_email text NOT NULL DEFAULT '',
  target_name text NOT NULL DEFAULT '',
  admin_role text NOT NULL DEFAULT '',
  reason text DEFAULT '',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  club_id uuid,
  club_name text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.impersonation_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view all impersonation logs"
  ON public.impersonation_audit_log
  FOR SELECT
  TO authenticated
  USING (is_super_admin(auth.uid()));

CREATE POLICY "Association admins can view own impersonation logs"
  ON public.impersonation_audit_log
  FOR SELECT
  TO authenticated
  USING (admin_user_id = auth.uid());

CREATE POLICY "Admins can insert impersonation logs"
  ON public.impersonation_audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (admin_user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_impersonation_audit_admin ON public.impersonation_audit_log(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_impersonation_audit_target ON public.impersonation_audit_log(target_user_id);
CREATE INDEX IF NOT EXISTS idx_impersonation_audit_started ON public.impersonation_audit_log(started_at DESC);

-- RPC to start an impersonation session (with permission validation)
CREATE OR REPLACE FUNCTION start_impersonation_session(
  p_target_member_id uuid,
  p_reason text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
  v_admin_email text;
  v_admin_role text;
  v_target_member record;
  v_target_user_id uuid;
  v_target_email text;
  v_target_name text;
  v_target_profile record;
  v_target_clubs jsonb;
  v_log_id uuid;
  v_is_super_admin boolean;
  v_is_association_admin boolean;
BEGIN
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO v_admin_email FROM auth.users WHERE id = v_admin_id;

  v_is_super_admin := is_super_admin(v_admin_id);

  IF NOT v_is_super_admin THEN
    SELECT EXISTS (
      SELECT 1 FROM user_state_associations WHERE user_id = v_admin_id AND role = 'state_admin'
      UNION ALL
      SELECT 1 FROM user_national_associations WHERE user_id = v_admin_id AND role = 'national_admin'
    ) INTO v_is_association_admin;
  ELSE
    v_is_association_admin := true;
  END IF;

  IF NOT v_is_super_admin AND NOT v_is_association_admin THEN
    RAISE EXCEPTION 'Only super admins and association admins can impersonate users';
  END IF;

  IF v_is_super_admin THEN
    v_admin_role := 'super_admin';
  ELSE
    v_admin_role := 'association_admin';
  END IF;

  SELECT * INTO v_target_member FROM members WHERE id = p_target_member_id;
  IF v_target_member IS NULL THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  v_target_user_id := v_target_member.user_id;
  v_target_name := COALESCE(v_target_member.first_name, '') || ' ' || COALESCE(v_target_member.last_name, '');
  v_target_email := COALESCE(v_target_member.email, '');

  IF v_target_user_id IS NOT NULL THEN
    SELECT * INTO v_target_profile FROM profiles WHERE id = v_target_user_id;
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'club_id', uc.club_id,
    'role', uc.role,
    'club_name', c.name,
    'club_abbreviation', c.abbreviation,
    'club_logo', c.logo
  ))
  INTO v_target_clubs
  FROM user_clubs uc
  JOIN clubs c ON c.id = uc.club_id
  WHERE uc.user_id = COALESCE(v_target_user_id, v_admin_id);

  INSERT INTO impersonation_audit_log (
    admin_user_id, target_user_id, target_member_id,
    admin_email, target_email, target_name,
    admin_role, reason, club_id, club_name
  ) VALUES (
    v_admin_id, v_target_user_id, p_target_member_id,
    v_admin_email, v_target_email, v_target_name,
    v_admin_role, p_reason,
    v_target_member.club_id,
    (SELECT name FROM clubs WHERE id = v_target_member.club_id)
  )
  RETURNING id INTO v_log_id;

  RETURN jsonb_build_object(
    'session_id', v_log_id,
    'target_user_id', v_target_user_id,
    'target_member_id', p_target_member_id,
    'target_name', TRIM(v_target_name),
    'target_email', v_target_email,
    'target_avatar_url', COALESCE(v_target_profile.avatar_url, v_target_member.avatar_url),
    'target_clubs', COALESCE(v_target_clubs, '[]'::jsonb),
    'target_default_club_id', COALESCE(v_target_profile.default_club_id, v_target_member.club_id),
    'target_is_super_admin', COALESCE(
      (SELECT user_metadata->>'is_super_admin' = 'true' FROM auth.users WHERE id = v_target_user_id), false
    ),
    'target_onboarding_completed', COALESCE(v_target_profile.onboarding_completed, true)
  );
END;
$$;

-- RPC to end an impersonation session
CREATE OR REPLACE FUNCTION end_impersonation_session(p_session_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE impersonation_audit_log
  SET ended_at = now()
  WHERE id = p_session_id
  AND admin_user_id = auth.uid()
  AND ended_at IS NULL;

  RETURN FOUND;
END;
$$;
