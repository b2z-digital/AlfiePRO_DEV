/*
  # Add Admin Function to Update Auth User Email

  When an admin updates a member's email in the members table, and that member
  is linked to an auth user (has user_id), the auth user's email should also be updated.

  ## Problem
  - members.email can be changed via admin panel
  - auth.users.email remains unchanged
  - User can't log in with new email
  - Emails get out of sync

  ## Solution
  Create a function that admins can call to sync the email from members to auth.users.
  This requires admin/service role privileges as regular users can't modify auth.users.

  ## Security
  - Only callable by authenticated users who are admins of the member's club
  - Uses security definer to bypass RLS
  - Updates both members.email and auth.users.email atomically
*/

-- Function to update both member email and auth user email (admin only)
CREATE OR REPLACE FUNCTION admin_update_member_email(
  p_member_id uuid,
  p_new_email text
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_member RECORD;
  v_old_email text;
  v_user_id uuid;
  v_club_id uuid;
  v_is_admin boolean;
BEGIN
  -- Validate email format
  IF p_new_email IS NULL OR p_new_email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid email format'
    );
  END IF;

  -- Get the member and check if caller is admin of the member's club
  SELECT 
    m.user_id,
    m.email,
    m.club_id,
    EXISTS (
      SELECT 1 
      FROM user_clubs uc 
      WHERE uc.club_id = m.club_id 
        AND uc.user_id = auth.uid() 
        AND uc.role = 'admin'
    ) as is_admin
  INTO v_user_id, v_old_email, v_club_id, v_is_admin
  FROM members m
  WHERE m.id = p_member_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Member not found'
    );
  END IF;

  -- Check if caller is admin
  IF NOT v_is_admin THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Only club admins can update member emails'
    );
  END IF;

  -- Check if email is already in use by another auth user
  IF EXISTS (
    SELECT 1 
    FROM auth.users 
    WHERE email = p_new_email 
      AND id != v_user_id
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Email already in use by another user'
    );
  END IF;

  -- Update member email
  UPDATE members
  SET email = p_new_email,
      updated_at = now()
  WHERE id = p_member_id;

  -- If member is linked to an auth user, update auth user email
  IF v_user_id IS NOT NULL THEN
    UPDATE auth.users
    SET 
      email = p_new_email,
      email_confirmed_at = now(), -- Auto-confirm for admin changes
      updated_at = now()
    WHERE id = v_user_id;

    RETURN jsonb_build_object(
      'success', true,
      'member_email_updated', true,
      'auth_email_updated', true,
      'old_email', v_old_email,
      'new_email', p_new_email
    );
  ELSE
    RETURN jsonb_build_object(
      'success', true,
      'member_email_updated', true,
      'auth_email_updated', false,
      'message', 'Member not linked to auth user',
      'old_email', v_old_email,
      'new_email', p_new_email
    );
  END IF;

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- Grant execute to authenticated users (function checks admin status internally)
GRANT EXECUTE ON FUNCTION admin_update_member_email(uuid, text) TO authenticated;

COMMENT ON FUNCTION admin_update_member_email IS
'Updates both member.email and auth.users.email (if linked). Only callable by club admins. Auto-confirms email to avoid confirmation flow.';
