/*
  # Create archive and restore member functions

  This migration creates the archive_member and restore_member database functions
  that safely archive/restore members while preserving all historical data.

  ## Changes

  1. Creates archive_member function
  2. Creates restore_member function
  3. Grants execute permissions
*/

-- Create function to archive a member (soft delete)
CREATE OR REPLACE FUNCTION archive_member(
  p_member_id uuid,
  p_club_id uuid,
  p_archived_by uuid,
  p_archive_reason text DEFAULT NULL,
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
  v_auth_user_deleted boolean := false;
  v_boat_count integer := 0;
  v_race_results_count integer := 0;
  v_payment_count integer := 0;
  v_attendance_count integer := 0;
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

  -- Count related records (for reporting, but we keep them all!)
  SELECT COUNT(*) INTO v_boat_count
  FROM member_boats
  WHERE member_id = p_member_id;

  SELECT COUNT(*) INTO v_payment_count
  FROM membership_payments
  WHERE member_id = p_member_id;

  SELECT COUNT(*) INTO v_attendance_count
  FROM event_attendance
  WHERE member_id = p_member_id;

  -- Archive the member (soft delete)
  UPDATE members
  SET 
    membership_status = 'archived',
    archived_at = now(),
    archived_by = p_archived_by,
    archive_reason = p_archive_reason,
    updated_at = now()
  WHERE id = p_member_id AND club_id = p_club_id;

  -- If requested and user exists, check if we should delete the auth user
  IF p_delete_auth_user AND v_user_id IS NOT NULL THEN
    -- Check if this user has any other ACTIVE member records in any club
    SELECT EXISTS(
      SELECT 1 FROM members 
      WHERE user_id = v_user_id 
      AND id != p_member_id
      AND (membership_status != 'archived' OR archived_at IS NULL)
    ) INTO v_other_memberships_exist;

    -- Only delete auth user if they have no other active member records
    IF NOT v_other_memberships_exist THEN
      DELETE FROM auth.users WHERE id = v_user_id;
      v_auth_user_deleted := true;
    END IF;
  END IF;

  -- Return summary of what was preserved
  RETURN jsonb_build_object(
    'success', true,
    'member_id', p_member_id,
    'user_id', v_user_id,
    'archived', true,
    'preserved', jsonb_build_object(
      'boats', v_boat_count,
      'race_results', v_race_results_count,
      'payments', v_payment_count,
      'attendance', v_attendance_count
    ),
    'auth_user_deleted', v_auth_user_deleted,
    'other_active_memberships', v_other_memberships_exist
  );
END;
$$;

-- Create function to restore an archived member
CREATE OR REPLACE FUNCTION restore_member(
  p_member_id uuid,
  p_club_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if member exists and belongs to the specified club
  IF NOT EXISTS (
    SELECT 1 FROM members 
    WHERE id = p_member_id AND club_id = p_club_id
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Member not found or does not belong to this club'
    );
  END IF;

  -- Restore the member
  UPDATE members
  SET 
    membership_status = 'active',
    archived_at = NULL,
    archived_by = NULL,
    archive_reason = NULL,
    updated_at = now()
  WHERE id = p_member_id AND club_id = p_club_id;

  RETURN jsonb_build_object(
    'success', true,
    'member_id', p_member_id,
    'restored', true
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION archive_member(uuid, uuid, uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION restore_member(uuid, uuid) TO authenticated;

-- Add helpful comments
COMMENT ON FUNCTION archive_member IS 
'Archives a member (soft delete) while preserving all historical data including race results, payments, and boats. Optionally removes auth access.';

COMMENT ON FUNCTION restore_member IS 
'Restores an archived member back to active status.';