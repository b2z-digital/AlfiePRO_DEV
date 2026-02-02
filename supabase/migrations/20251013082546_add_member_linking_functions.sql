/*
  # Member Linking Functions

  ## Overview
  Functions to help link auth users to existing member records and handle
  the dual-flow onboarding system.

  ## Functions

  ### `link_user_to_member`
  Attempts to link a new auth user to an existing member record by email.
  Used when someone self-registers and we want to match them to existing members.

  ### `accept_invitation`
  Handles accepting an invitation - links user to member, marks invitation as used.

  ### `approve_membership_application`
  Creates a member record from an approved application and links the user.

  ## Notes
  - Email matching is case-insensitive
  - Only links if user_id is NULL on the member record
  - Creates proper user_clubs entries for access control
*/

-- Function to attempt linking a user to existing member by email
CREATE OR REPLACE FUNCTION link_user_to_member(
  p_user_id uuid,
  p_email text,
  p_club_id uuid
)
RETURNS uuid AS $$
DECLARE
  v_member_id uuid;
BEGIN
  -- Find existing member with matching email and club who doesn't have a user_id
  SELECT id INTO v_member_id
  FROM members
  WHERE LOWER(email) = LOWER(p_email)
    AND club_id = p_club_id
    AND user_id IS NULL
  LIMIT 1;

  -- If found, link the user to the member
  IF v_member_id IS NOT NULL THEN
    UPDATE members
    SET user_id = p_user_id,
        updated_at = now()
    WHERE id = v_member_id;

    -- Create user_clubs entry if it doesn't exist
    INSERT INTO user_clubs (user_id, club_id, role)
    VALUES (p_user_id, p_club_id, 'member')
    ON CONFLICT (user_id, club_id) DO NOTHING;
  END IF;

  RETURN v_member_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to accept an invitation
CREATE OR REPLACE FUNCTION accept_invitation(
  p_token text,
  p_user_id uuid
)
RETURNS jsonb AS $$
DECLARE
  v_invitation record;
  v_result jsonb;
BEGIN
  -- Get the invitation
  SELECT * INTO v_invitation
  FROM member_invitations
  WHERE token = p_token
    AND status = 'pending'
    AND expires_at > now();

  -- Check if invitation exists and is valid
  IF v_invitation.id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid or expired invitation'
    );
  END IF;

  -- Link user to member if member_id exists
  IF v_invitation.member_id IS NOT NULL THEN
    UPDATE members
    SET user_id = p_user_id,
        updated_at = now()
    WHERE id = v_invitation.member_id
      AND user_id IS NULL;
  END IF;

  -- Create user_clubs entry
  INSERT INTO user_clubs (user_id, club_id, role)
  VALUES (p_user_id, v_invitation.club_id, 'member')
  ON CONFLICT (user_id, club_id) DO NOTHING;

  -- Mark invitation as accepted
  UPDATE member_invitations
  SET status = 'accepted',
      used_at = now(),
      updated_at = now()
  WHERE id = v_invitation.id;

  RETURN jsonb_build_object(
    'success', true,
    'club_id', v_invitation.club_id,
    'member_id', v_invitation.member_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to approve a membership application
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

  -- Check if member already exists with this email
  SELECT id INTO v_existing_member_id
  FROM members
  WHERE LOWER(email) = LOWER(v_application.email)
    AND club_id = v_application.club_id
  LIMIT 1;

  IF v_existing_member_id IS NOT NULL THEN
    -- Link existing member to user
    UPDATE members
    SET user_id = v_application.user_id,
        updated_at = now()
    WHERE id = v_existing_member_id
      AND user_id IS NULL;
    
    v_member_id := v_existing_member_id;
  ELSE
    -- Create new member record
    INSERT INTO members (
      club_id,
      user_id,
      first_name,
      last_name,
      email,
      phone,
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

-- Function to reject a membership application
CREATE OR REPLACE FUNCTION reject_membership_application(
  p_application_id uuid,
  p_reviewed_by uuid,
  p_rejection_reason text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_application record;
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

  -- Update application status
  UPDATE membership_applications
  SET status = 'rejected',
      reviewed_by = p_reviewed_by,
      reviewed_at = now(),
      rejection_reason = p_rejection_reason,
      updated_at = now()
  WHERE id = p_application_id;

  RETURN jsonb_build_object(
    'success', true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;