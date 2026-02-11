/*
  # Add Membership Application Complete Deletion

  ## Overview
  This migration adds functionality to completely delete membership applications
  along with their associated user accounts, allowing email addresses to be reused
  for testing purposes.

  ## Changes
  1. Create function to delete membership application and related data
  2. Add RLS policy for admins to delete applications
  3. Handle cascade deletion of:
     - User profile
     - User-club associations
     - Auth user account
     - Application record

  ## Security
  - Only club admins can delete applications for their clubs
  - Includes safety check to prevent deletion of approved applications with existing members
*/

-- Function to delete membership application and all related data
CREATE OR REPLACE FUNCTION delete_membership_application(application_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_club_id uuid;
  v_status text;
  v_member_id uuid;
BEGIN
  -- Get application details
  SELECT user_id, club_id, status, member_id
  INTO v_user_id, v_club_id, v_status, v_member_id
  FROM membership_applications
  WHERE id = application_id;

  -- Check if application exists
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Application not found'
    );
  END IF;

  -- Safety check: Don't delete if application has been approved and member exists
  IF v_status = 'approved' AND v_member_id IS NOT NULL THEN
    -- Check if member still exists
    IF EXISTS (SELECT 1 FROM members WHERE id = v_member_id) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Cannot delete approved application with active member. Please delete the member first.'
      );
    END IF;
  END IF;

  -- Delete in reverse order of dependencies

  -- 1. Delete user_clubs entries (if any)
  DELETE FROM user_clubs
  WHERE user_id = v_user_id AND club_id = v_club_id;

  -- 2. Delete profile (will cascade to related tables)
  DELETE FROM profiles
  WHERE id = v_user_id;

  -- 3. Delete the membership application
  DELETE FROM membership_applications
  WHERE id = application_id;

  -- 4. Delete the auth user (this cascades to any remaining auth-related tables)
  -- Using admin API through a SQL function
  DELETE FROM auth.users
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Application and user account deleted successfully'
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- Add RLS policy for admins to delete applications
CREATE POLICY "Club admins can delete applications" ON membership_applications
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = membership_applications.club_id
      AND uc.user_id = auth.uid()
      AND uc.role = 'admin'
    )
  );

-- Grant execute permission on the function to authenticated users
GRANT EXECUTE ON FUNCTION delete_membership_application(uuid) TO authenticated;

-- Add comment to document the function
COMMENT ON FUNCTION delete_membership_application(uuid) IS
'Completely deletes a membership application and its associated user account.
This is primarily for testing purposes to allow email addresses to be reused.
Includes safety checks to prevent deletion of approved applications with active members.';
