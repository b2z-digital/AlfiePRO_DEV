/*
  # Fix impersonation for members without user_clubs entries

  1. Bug Fix
    - Updated `start_impersonation_session` to fall back to building club data
      from the `members` table when the target user has no `user_clubs` entries
    - This fixes the issue where impersonating a member with a linked account
      but no `user_clubs` row results in an empty dashboard (no club loaded)

  2. Data Fix
    - Backfills missing `user_clubs` entries for all active members who have
      a `user_id` but no corresponding `user_clubs` record
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

  -- Block impersonating super admins (unless you are one)
  IF NOT v_is_super_admin THEN
    DECLARE
      v_target_is_super boolean;
    BEGIN
      SELECT COALESCE(
        (SELECT (raw_app_meta_data->>'is_super_admin')::boolean 
         FROM auth.users 
         WHERE id = (SELECT user_id FROM members WHERE id = p_target_member_id)),
        false
      ) INTO v_target_is_super;
      
      IF v_target_is_super THEN
        RAISE EXCEPTION 'Cannot impersonate a super admin';
      END IF;
    END;
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

  -- First try to get clubs from user_clubs table
  IF v_target_user_id IS NOT NULL THEN
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
    WHERE uc.user_id = v_target_user_id;
  END IF;

  -- If no user_clubs found, build club list from members table
  IF v_target_clubs IS NULL THEN
    SELECT jsonb_agg(jsonb_build_object(
      'club_id', m.club_id,
      'role', 'member',
      'club_name', c.name,
      'club_abbreviation', c.abbreviation,
      'club_logo', c.logo
    ))
    INTO v_target_clubs
    FROM members m
    JOIN clubs c ON c.id = m.club_id
    WHERE m.id = p_target_member_id
      OR (v_target_user_id IS NOT NULL AND m.user_id = v_target_user_id AND m.membership_status = 'active');
  END IF;

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
      (SELECT (raw_app_meta_data->>'is_super_admin')::boolean FROM auth.users WHERE id = v_target_user_id), false
    ),
    'target_onboarding_completed', COALESCE(v_target_profile.onboarding_completed, true)
  );
END;
$$;

-- Backfill missing user_clubs entries for members with linked accounts
INSERT INTO user_clubs (user_id, club_id, role)
SELECT DISTINCT m.user_id, m.club_id, 'member'::club_role
FROM members m
WHERE m.user_id IS NOT NULL
  AND m.membership_status = 'active'
  AND m.club_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM user_clubs uc
    WHERE uc.user_id = m.user_id
      AND uc.club_id = m.club_id
  )
ON CONFLICT (user_id, club_id) DO NOTHING;