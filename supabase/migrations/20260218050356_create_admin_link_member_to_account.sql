/*
  # Admin Link Member to Auth Account

  1. New Functions
    - `admin_link_member_to_account` - Allows club admins to link a member record to an auth user by email
      - Looks up auth user by email
      - Links member.user_id to the found auth user
      - Creates user_clubs entry if missing
      - Returns success/error status
    - `admin_unlink_member_from_account` - Allows club admins to unlink a member from their auth account
      - Clears member.user_id
      - Returns success/error status

  2. Security
    - Both functions use SECURITY DEFINER to safely access auth.users
    - Both verify the caller is an admin of the member's club before proceeding
    - search_path is set to prevent injection
*/

CREATE OR REPLACE FUNCTION admin_link_member_to_account(
  p_member_id uuid,
  p_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_member RECORD;
  v_target_user_id uuid;
  v_caller_role text;
BEGIN
  SELECT m.id, m.club_id, m.user_id, m.first_name, m.last_name, m.email
  INTO v_member
  FROM members m
  WHERE m.id = p_member_id;

  IF v_member IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Member not found');
  END IF;

  SELECT uc.role INTO v_caller_role
  FROM user_clubs uc
  WHERE uc.user_id = auth.uid()
    AND uc.club_id = v_member.club_id
    AND uc.role IN ('admin', 'super_admin');

  IF v_caller_role IS NULL THEN
    SELECT uc.role INTO v_caller_role
    FROM user_clubs uc
    WHERE uc.user_id = auth.uid()
      AND uc.role = 'super_admin'
    LIMIT 1;
  END IF;

  IF v_caller_role IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient permissions');
  END IF;

  SELECT au.id INTO v_target_user_id
  FROM auth.users au
  WHERE LOWER(au.email) = LOWER(p_email);

  IF v_target_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No account found with that email. The member needs to register first.');
  END IF;

  IF v_member.user_id = v_target_user_id THEN
    RETURN jsonb_build_object('success', true, 'message', 'Already linked to this account');
  END IF;

  UPDATE members
  SET user_id = v_target_user_id, updated_at = now()
  WHERE id = p_member_id;

  INSERT INTO user_clubs (user_id, club_id, role)
  VALUES (v_target_user_id, v_member.club_id, 'member')
  ON CONFLICT (user_id, club_id) DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Member linked to account successfully',
    'user_id', v_target_user_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION admin_unlink_member_from_account(
  p_member_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_member RECORD;
  v_caller_role text;
BEGIN
  SELECT m.id, m.club_id, m.user_id
  INTO v_member
  FROM members m
  WHERE m.id = p_member_id;

  IF v_member IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Member not found');
  END IF;

  SELECT uc.role INTO v_caller_role
  FROM user_clubs uc
  WHERE uc.user_id = auth.uid()
    AND uc.club_id = v_member.club_id
    AND uc.role IN ('admin', 'super_admin');

  IF v_caller_role IS NULL THEN
    SELECT uc.role INTO v_caller_role
    FROM user_clubs uc
    WHERE uc.user_id = auth.uid()
      AND uc.role = 'super_admin'
    LIMIT 1;
  END IF;

  IF v_caller_role IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient permissions');
  END IF;

  IF v_member.user_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'message', 'Member has no linked account');
  END IF;

  UPDATE members
  SET user_id = NULL, updated_at = now()
  WHERE id = p_member_id;

  RETURN jsonb_build_object('success', true, 'message', 'Member unlinked from account');
END;
$$;
