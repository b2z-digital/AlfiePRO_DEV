/*
  # Fix Member Club Name on Approval

  1. Changes
    - Update `approve_membership_application` function to populate the `club` field
    - The `club` field should contain the club's name, not just the club_id
    - This fixes the "No club" display issue for members added via onboarding

  2. Notes
    - Retrieves club name from clubs table using club_id
    - Applies to both new member creation and existing member updates
*/

-- Drop and recreate the function with the club name fix
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
BEGIN
  -- Get the application
  SELECT * INTO v_application
  FROM membership_applications
  WHERE id = p_application_id
    AND status = 'pending';

  -- Check if application exists
  IF v_application.id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Application not found or already processed'
    );
  END IF;

  -- Check if reviewer has admin access to the club
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

  -- Get the club name
  SELECT name INTO v_club_name
  FROM clubs
  WHERE id = v_application.club_id;

  -- Check if member already exists with this email
  SELECT id INTO v_existing_member_id
  FROM members
  WHERE LOWER(email) = LOWER(v_application.email)
    AND club_id = v_application.club_id
  LIMIT 1;

  IF v_existing_member_id IS NOT NULL THEN
    -- Link existing member to user and update club name if missing
    UPDATE members
    SET user_id = v_application.user_id,
        club = COALESCE(club, v_club_name),
        updated_at = now()
    WHERE id = v_existing_member_id
      AND user_id IS NULL;
    
    v_member_id := v_existing_member_id;
  ELSE
    -- Create new member record with club name
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

  -- Create user_clubs entry
  INSERT INTO user_clubs (user_id, club_id, role)
  VALUES (v_application.user_id, v_application.club_id, 'member')
  ON CONFLICT (user_id, club_id) DO NOTHING;

  -- Update application status
  UPDATE membership_applications
  SET status = 'approved',
      reviewed_by = p_reviewed_by,
      reviewed_at = now(),
      member_id = v_member_id,
      updated_at = now()
  WHERE id = p_application_id;

  RETURN jsonb_build_object(
    'success', true,
    'member_id', v_member_id,
    'existing_member', v_existing_member_id IS NOT NULL
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;