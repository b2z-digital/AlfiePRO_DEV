/*
  # Add address to profile completeness check

  1. Changes
    - Updated `check_member_profile_completeness()` to also check if the member
      has a street address filled in
    - Adds 'address' to the missing_fields array when no address is present
    - Profile is now tracked across 5 items: avatar, phone, address, emergency contact, boats
    - Also fixes `needs_completion` to consider boats status (previously only checked
      avatar, phone, emergency contact but not boats)

  2. Purpose
    - Makes profile completion tracking more meaningful by including address
    - Ensures progress updates when users add their address information
    - Fixes boats not being factored into the needs_completion flag

  3. Security
    - No changes to access control
*/

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

  IF v_member.avatar_url IS NULL OR TRIM(v_member.avatar_url) = '' THEN
    v_missing_fields := v_missing_fields || '"avatar"'::jsonb;
    v_is_complete := false;
  END IF;

  IF v_member.phone IS NULL OR TRIM(v_member.phone) = '' THEN
    v_missing_fields := v_missing_fields || '"phone"'::jsonb;
    v_is_complete := false;
  END IF;

  IF v_member.street IS NULL OR TRIM(v_member.street) = '' THEN
    v_missing_fields := v_missing_fields || '"address"'::jsonb;
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
    v_is_complete := false;
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
      'emergency_contact_relationship', v_member.emergency_contact_relationship,
      'avatar_url', v_member.avatar_url
    )
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
