/*
  # Add boat creation to membership approval

  1. Changes
    - Updates `approve_membership_application` function to create `member_boats` records
    - Reads the `boats` JSONB array from the application (format: {type, sailNumber, hullName})
    - Maps to `member_boats` columns: boat_type, sail_number, hull
    - First boat is marked as `is_primary = true`

  2. Notes
    - Only creates boats if the application has a non-empty boats array
    - Handles both new member creation and existing member linking
    - Preserves all existing approval logic unchanged
*/

CREATE OR REPLACE FUNCTION approve_membership_application(
  p_application_id uuid,
  p_reviewed_by uuid,
  p_membership_type text DEFAULT 'full'
)
RETURNS jsonb AS $$
DECLARE
  v_application record;
  v_member_id uuid;
  v_existing_member_id uuid;
  v_club_name text;
  v_boat jsonb;
  v_boat_idx int;
BEGIN
  SELECT * INTO v_application
  FROM membership_applications
  WHERE id = p_application_id
    AND status = 'pending';

  IF v_application.id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Application not found or already processed'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_clubs
    WHERE user_id = p_reviewed_by
      AND club_id = v_application.club_id
      AND role = 'admin'
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: You must be a club admin'
    );
  END IF;

  SELECT name INTO v_club_name
  FROM clubs
  WHERE id = v_application.club_id;

  SELECT id INTO v_existing_member_id
  FROM members
  WHERE LOWER(email) = LOWER(v_application.email)
    AND club_id = v_application.club_id
  LIMIT 1;

  IF v_existing_member_id IS NOT NULL THEN
    UPDATE members
    SET user_id = v_application.user_id,
        club = COALESCE(club, v_club_name),
        updated_at = now()
    WHERE id = v_existing_member_id
      AND user_id IS NULL;

    v_member_id := v_existing_member_id;
  ELSE
    INSERT INTO members (
      club_id,
      user_id,
      first_name,
      last_name,
      email,
      phone,
      club,
      membership_type,
      membership_status,
      membership_start_date
    ) VALUES (
      v_application.club_id,
      v_application.user_id,
      v_application.first_name,
      v_application.last_name,
      v_application.email,
      v_application.phone,
      v_club_name,
      p_membership_type,
      'active',
      CURRENT_DATE
    )
    RETURNING id INTO v_member_id;
  END IF;

  INSERT INTO user_clubs (user_id, club_id, role)
  VALUES (v_application.user_id, v_application.club_id, 'member')
  ON CONFLICT (user_id, club_id) DO NOTHING;

  UPDATE membership_applications
  SET status = 'approved',
      reviewed_by = p_reviewed_by,
      reviewed_at = now(),
      member_id = v_member_id,
      updated_at = now()
  WHERE id = p_application_id;

  IF v_application.boats IS NOT NULL
     AND jsonb_array_length(v_application.boats) > 0 THEN
    v_boat_idx := 0;
    FOR v_boat IN SELECT * FROM jsonb_array_elements(v_application.boats)
    LOOP
      INSERT INTO member_boats (
        member_id,
        boat_type,
        sail_number,
        hull,
        is_primary
      ) VALUES (
        v_member_id,
        COALESCE(v_boat->>'type', 'Unknown'),
        NULLIF(v_boat->>'sailNumber', ''),
        NULLIF(v_boat->>'hullName', ''),
        v_boat_idx = 0
      );
      v_boat_idx := v_boat_idx + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'member_id', v_member_id,
    'existing_member', v_existing_member_id IS NOT NULL
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO '';
