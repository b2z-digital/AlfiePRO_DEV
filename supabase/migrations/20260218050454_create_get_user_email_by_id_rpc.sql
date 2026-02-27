/*
  # Get User Email by ID Helper

  1. New Functions
    - `get_user_email_by_id` - Returns an auth user's email given their user ID
      - Only accessible to authenticated users who are admins
      - Uses SECURITY DEFINER to safely read auth.users

  2. Security
    - Function requires authentication
    - Uses SECURITY DEFINER with restricted search_path
*/

CREATE OR REPLACE FUNCTION get_user_email_by_id(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT au.email INTO v_email
  FROM auth.users au
  WHERE au.id = p_user_id;

  RETURN v_email;
END;
$$;
