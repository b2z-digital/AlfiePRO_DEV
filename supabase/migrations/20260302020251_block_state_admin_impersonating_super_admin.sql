/*
  # Block state/national admins from impersonating super admin accounts

  1. Changes
    - Updated `start_impersonation_session` function to check if the target user is a super admin
    - If the caller is NOT a super admin and the target IS a super admin, the function raises an exception
    - Super admins can still impersonate anyone

  2. Security
    - Prevents association admins from gaining super admin level access through impersonation
    - Only super admins can impersonate other super admins
*/

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
  v_target_is_super_admin boolean;
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

  -- Check if target is a super admin - block non-super-admins from impersonating them
  IF v_target_user_id IS NOT NULL THEN
    SELECT COALESCE((raw_app_meta_data->>'is_super_admin')::boolean, false)
    INTO v_target_is_super_admin
    FROM auth.users WHERE id = v_target_user_id;
  ELSE
    v_target_is_super_admin := false;
  END IF;

  IF v_target_is_super_admin AND NOT v_is_super_admin THEN
    RAISE EXCEPTION 'Only super admins can impersonate super admin accounts';
  END IF;

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
    'target_is_super_admin', v_target_is_super_admin,
    'target_onboarding_completed', COALESCE(v_target_profile.onboarding_completed, true)
  );
END;
$$;
