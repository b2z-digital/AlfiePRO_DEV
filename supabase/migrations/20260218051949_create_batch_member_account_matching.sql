/*
  # Batch Member Account Matching System

  1. New Functions
    - `check_member_email_matches` - For a given club, returns which member emails
      have matching auth accounts that could be linked
    - `auto_link_all_matching_members` - Auto-links all unlinked members in a club
      whose emails match existing auth accounts. Creates user_clubs entries too.
      Returns count of newly linked members.

  2. Security
    - Both functions use SECURITY DEFINER to safely query auth.users
    - Both verify the caller is an admin of the club
    - search_path restricted for safety
*/

CREATE OR REPLACE FUNCTION check_member_email_matches(p_club_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_role text;
  v_result jsonb;
BEGIN
  SELECT uc.role INTO v_caller_role
  FROM user_clubs uc
  WHERE uc.user_id = auth.uid()
    AND uc.club_id = p_club_id
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

  SELECT jsonb_agg(jsonb_build_object(
    'member_id', m.id,
    'member_email', m.email,
    'auth_user_id', au.id
  ))
  INTO v_result
  FROM members m
  JOIN auth.users au ON LOWER(au.email) = LOWER(m.email)
  WHERE m.club_id = p_club_id
    AND m.user_id IS NULL
    AND m.email IS NOT NULL
    AND m.email != ''
    AND (m.membership_status = 'active' OR m.membership_status IS NULL);

  RETURN jsonb_build_object(
    'success', true,
    'matches', COALESCE(v_result, '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION auto_link_all_matching_members(p_club_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_role text;
  v_match RECORD;
  v_linked_count integer := 0;
BEGIN
  SELECT uc.role INTO v_caller_role
  FROM user_clubs uc
  WHERE uc.user_id = auth.uid()
    AND uc.club_id = p_club_id
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

  FOR v_match IN
    SELECT m.id as member_id, au.id as auth_user_id
    FROM members m
    JOIN auth.users au ON LOWER(au.email) = LOWER(m.email)
    WHERE m.club_id = p_club_id
      AND m.user_id IS NULL
      AND m.email IS NOT NULL
      AND m.email != ''
      AND (m.membership_status = 'active' OR m.membership_status IS NULL)
  LOOP
    UPDATE members
    SET user_id = v_match.auth_user_id, updated_at = now()
    WHERE id = v_match.member_id
      AND user_id IS NULL;

    INSERT INTO user_clubs (user_id, club_id, role)
    VALUES (v_match.auth_user_id, p_club_id, 'member')
    ON CONFLICT (user_id, club_id) DO NOTHING;

    v_linked_count := v_linked_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'linked_count', v_linked_count
  );
END;
$$;
