/*
  # Fix can_manage_member_boats to allow editor role

  1. Problem
    - The can_manage_member_boats function only allows users with role = 'admin'
    - Editors who manage members cannot save boat changes for their club members
    - This is part of the same issue as the members RLS fix

  2. Fix
    - Update the function to also allow 'editor' role
    - Maintains existing checks for member ownership and super admin

  3. Impact
    - Editors can now manage boats for members in their club
*/

CREATE OR REPLACE FUNCTION can_manage_member_boats(p_member_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_club_id uuid;
BEGIN
  SELECT user_id, club_id INTO v_user_id, v_club_id
  FROM members
  WHERE id = p_member_id;

  IF v_user_id IS NULL AND v_club_id IS NULL THEN
    RETURN false;
  END IF;

  IF v_user_id = auth.uid() THEN
    RETURN true;
  END IF;

  IF v_club_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = v_club_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin'::club_role, 'editor'::club_role)
    ) THEN
      RETURN true;
    END IF;
  END IF;

  IF is_platform_super_admin() THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;
