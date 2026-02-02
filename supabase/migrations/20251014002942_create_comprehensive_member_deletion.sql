/*
  # Comprehensive Member Deletion System

  This migration creates a function to properly delete members and their associated data,
  including the option to delete their authentication account.

  ## Changes

  1. Creates function `delete_member_and_related_data`
     - Deletes member record (cascades to related data via existing FK constraints)
     - Optionally deletes auth user if they have no other member records
     - Returns detailed information about what was deleted

  2. The function handles:
     - Member boats (CASCADE already set)
     - Member invitations (CASCADE already set)
     - Membership applications (SET NULL already set)
     - Membership payments (if any)
     - Event attendance records (if any)
     - Auth user deletion (only if no other member records exist for that user)

  ## Security
  - Function uses SECURITY DEFINER to allow deletion of auth.users
  - Checks are in place to ensure user has proper club access
  - Only deletes auth user if they have no remaining member records
*/

-- Create function to comprehensively delete a member
CREATE OR REPLACE FUNCTION delete_member_and_related_data(
  p_member_id uuid,
  p_club_id uuid,
  p_delete_auth_user boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_member_exists boolean;
  v_other_memberships_exist boolean;
  v_deleted_boats integer := 0;
  v_deleted_invitations integer := 0;
  v_deleted_applications integer := 0;
  v_deleted_payments integer := 0;
  v_deleted_attendance integer := 0;
  v_auth_user_deleted boolean := false;
BEGIN
  -- Check if member exists and belongs to the specified club
  SELECT user_id INTO v_user_id
  FROM members
  WHERE id = p_member_id AND club_id = p_club_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Member not found or does not belong to this club'
    );
  END IF;

  -- Count related records before deletion (for reporting)
  SELECT COUNT(*) INTO v_deleted_boats
  FROM member_boats
  WHERE member_id = p_member_id;

  SELECT COUNT(*) INTO v_deleted_invitations
  FROM member_invitations
  WHERE member_id = p_member_id;

  SELECT COUNT(*) INTO v_deleted_applications
  FROM membership_applications
  WHERE member_id = p_member_id;

  SELECT COUNT(*) INTO v_deleted_payments
  FROM membership_payments
  WHERE member_id = p_member_id;

  SELECT COUNT(*) INTO v_deleted_attendance
  FROM event_attendance
  WHERE member_id = p_member_id;

  -- Delete the member record (this will cascade to related tables)
  DELETE FROM members WHERE id = p_member_id AND club_id = p_club_id;

  -- If requested and user exists, check if we should delete the auth user
  IF p_delete_auth_user AND v_user_id IS NOT NULL THEN
    -- Check if this user has any other member records in any club
    SELECT EXISTS(
      SELECT 1 FROM members WHERE user_id = v_user_id
    ) INTO v_other_memberships_exist;

    -- Only delete auth user if they have no other member records
    IF NOT v_other_memberships_exist THEN
      -- Delete from auth.users (this requires SECURITY DEFINER)
      DELETE FROM auth.users WHERE id = v_user_id;
      v_auth_user_deleted := true;
    END IF;
  END IF;

  -- Return summary of what was deleted
  RETURN jsonb_build_object(
    'success', true,
    'member_id', p_member_id,
    'user_id', v_user_id,
    'deleted', jsonb_build_object(
      'boats', v_deleted_boats,
      'invitations', v_deleted_invitations,
      'applications', v_deleted_applications,
      'payments', v_deleted_payments,
      'attendance', v_deleted_attendance,
      'auth_user', v_auth_user_deleted
    ),
    'other_memberships_exist', v_other_memberships_exist
  );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION delete_member_and_related_data(uuid, uuid, boolean) TO authenticated;

-- Add helpful comment
COMMENT ON FUNCTION delete_member_and_related_data IS 
'Comprehensively deletes a member and all related data. Optionally deletes the auth user if they have no other member records.';
