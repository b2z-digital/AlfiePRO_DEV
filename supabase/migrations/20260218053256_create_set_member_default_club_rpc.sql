/*
  # Create RPC for setting a member's default club

  1. New Functions
    - `admin_set_member_default_club(p_member_id, p_club_id)` - Allows club admins to set the default club on a member's profile
    - Validates admin permissions and that the member belongs to the specified club
    - Updates `profiles.default_club_id` for the user linked to the member

  2. Security
    - SECURITY DEFINER to allow profile updates across users
    - Validates caller is an admin of the target club
    - Validates the member has a linked auth account
    - Validates the member belongs to the target club
*/

CREATE OR REPLACE FUNCTION public.admin_set_member_default_club(
  p_member_id uuid,
  p_club_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_member_user_id uuid;
  v_club_name text;
  v_membership_exists boolean;
BEGIN
  SELECT role INTO v_caller_role
  FROM public.user_clubs
  WHERE user_id = auth.uid()
    AND club_id = p_club_id;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'super_admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'You do not have admin permissions for this club');
  END IF;

  SELECT user_id INTO v_member_user_id
  FROM public.members
  WHERE id = p_member_id;

  IF v_member_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'This member is not linked to a login account');
  END IF;

  SELECT name INTO v_club_name
  FROM public.clubs
  WHERE id = p_club_id;

  SELECT EXISTS(
    SELECT 1 FROM public.user_clubs
    WHERE user_id = v_member_user_id
      AND club_id = p_club_id
  ) INTO v_membership_exists;

  IF NOT v_membership_exists THEN
    RETURN jsonb_build_object('success', false, 'error', 'Member does not belong to this club');
  END IF;

  UPDATE public.profiles
  SET default_club_id = p_club_id
  WHERE id = v_member_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Default club set to ' || COALESCE(v_club_name, 'selected club')
  );
END;
$$;
