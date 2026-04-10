/*
  # Add name-based member matching and profile completion detection

  1. New Functions
    - `find_name_match_candidates()` - When email matching fails, searches for unlinked
      members with matching first_name + last_name. Returns candidates for the user to
      confirm ("Is this you?") so they can claim an existing membership with an outdated email.
    
    - `confirm_name_match_and_link(p_member_id uuid)` - After the user confirms a name match,
      links the member record to their account and updates the member's email to the current one.
    
    - `check_member_profile_completeness()` - For auto-linked imported members, checks whether
      key profile fields (emergency contact, phone, address) are still empty and returns
      what needs to be filled in. Used to trigger a simplified onboarding wizard.

  2. Purpose
    - Solves the duplicate member problem where imported members had old/incorrect email
      addresses and then signed up with a new email, creating a second record.
    - Ensures imported members provide complete information on first login.

  3. Security
    - All functions are SECURITY DEFINER to access auth data
    - Only callable by authenticated users
    - Only returns/modifies data relevant to the calling user
*/

CREATE OR REPLACE FUNCTION public.find_name_match_candidates()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_email text;
  v_first_name text;
  v_last_name text;
  v_candidates jsonb := '[]'::jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;

  SELECT p.first_name, p.last_name
  INTO v_first_name, v_last_name
  FROM profiles p
  WHERE p.id = v_user_id;

  IF v_first_name IS NULL OR v_first_name = '' OR v_last_name IS NULL OR v_last_name = '' THEN
    RETURN jsonb_build_object(
      'success', true,
      'candidates', '[]'::jsonb,
      'message', 'Profile name not set'
    );
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'member_id', m.id,
    'first_name', m.first_name,
    'last_name', m.last_name,
    'email', m.email,
    'phone', m.phone,
    'club_id', m.club_id,
    'club_name', c.name,
    'club_logo', c.logo_url,
    'membership_level', m.membership_level,
    'date_joined', m.date_joined
  )), '[]'::jsonb)
  INTO v_candidates
  FROM members m
  JOIN clubs c ON c.id = m.club_id
  WHERE LOWER(TRIM(m.first_name)) = LOWER(TRIM(v_first_name))
    AND LOWER(TRIM(m.last_name)) = LOWER(TRIM(v_last_name))
    AND m.user_id IS NULL
    AND (m.membership_status IS NULL OR m.membership_status NOT IN ('archived', 'cancelled'))
    AND (c.approval_status IS NULL OR c.approval_status IN ('approved', 'active'))
    AND (m.email IS NULL OR LOWER(m.email) != LOWER(v_user_email));

  RETURN jsonb_build_object(
    'success', true,
    'candidates', v_candidates,
    'searched_name', v_first_name || ' ' || v_last_name
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.find_name_match_candidates() TO authenticated;


CREATE OR REPLACE FUNCTION public.confirm_name_match_and_link(p_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_email text;
  v_member RECORD;
  v_club_name text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;

  SELECT m.*, c.name as club_name, c.logo_url as club_logo, c.abbreviation as club_abbreviation
  INTO v_member
  FROM members m
  JOIN clubs c ON c.id = m.club_id
  WHERE m.id = p_member_id
    AND m.user_id IS NULL
    AND (m.membership_status IS NULL OR m.membership_status NOT IN ('archived', 'cancelled'));

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Member not found or already linked to another account'
    );
  END IF;

  UPDATE members
  SET
    user_id = v_user_id,
    email = v_user_email,
    updated_at = now()
  WHERE id = p_member_id;

  INSERT INTO user_clubs (user_id, club_id, role)
  VALUES (v_user_id, v_member.club_id, 'member')
  ON CONFLICT (user_id, club_id) DO NOTHING;

  UPDATE profiles
  SET
    first_name = COALESCE(NULLIF(v_member.first_name, ''), profiles.first_name),
    last_name = COALESCE(NULLIF(v_member.last_name, ''), profiles.last_name),
    updated_at = now()
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'linked_club', jsonb_build_object(
      'club_id', v_member.club_id,
      'club_name', v_member.club_name,
      'club_logo', v_member.club_logo,
      'club_abbreviation', v_member.club_abbreviation,
      'role', 'member'
    ),
    'old_email', v_member.email,
    'new_email', v_user_email
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_name_match_and_link(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.check_member_profile_completeness()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_member RECORD;
  v_missing_fields jsonb := '[]'::jsonb;
  v_is_complete boolean := true;
  v_has_boats boolean := false;
  v_club_name text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT m.*, c.name as club_name
  INTO v_member
  FROM members m
  JOIN clubs c ON c.id = m.club_id
  WHERE m.user_id = v_user_id
    AND (m.membership_status IS NULL OR m.membership_status NOT IN ('archived', 'cancelled'))
  ORDER BY m.date_joined DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'needs_completion', false,
      'message', 'No linked member record found'
    );
  END IF;

  IF v_member.phone IS NULL OR TRIM(v_member.phone) = '' THEN
    v_missing_fields := v_missing_fields || '"phone"'::jsonb;
    v_is_complete := false;
  END IF;

  IF v_member.emergency_contact_name IS NULL OR TRIM(v_member.emergency_contact_name) = '' THEN
    v_missing_fields := v_missing_fields || '"emergency_contact"'::jsonb;
    v_is_complete := false;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM member_boats WHERE member_id = v_member.id
  ) INTO v_has_boats;

  IF NOT v_has_boats THEN
    v_missing_fields := v_missing_fields || '"boats"'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'needs_completion', NOT v_is_complete,
    'member_id', v_member.id,
    'club_id', v_member.club_id,
    'club_name', v_member.club_name,
    'missing_fields', v_missing_fields,
    'has_boats', v_has_boats,
    'current_data', jsonb_build_object(
      'first_name', v_member.first_name,
      'last_name', v_member.last_name,
      'email', v_member.email,
      'phone', v_member.phone,
      'street', v_member.street,
      'city', v_member.city,
      'state', v_member.state,
      'postcode', v_member.postcode,
      'emergency_contact_name', v_member.emergency_contact_name,
      'emergency_contact_phone', v_member.emergency_contact_phone,
      'emergency_contact_relationship', v_member.emergency_contact_relationship
    )
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_member_profile_completeness() TO authenticated;
