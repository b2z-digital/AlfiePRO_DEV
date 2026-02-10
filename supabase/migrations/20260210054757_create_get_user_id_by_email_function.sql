/*
  # Create get_user_id_by_email helper function

  1. New Functions
    - `get_user_id_by_email(email_input text)` - Securely looks up a user ID from auth.users by email address
    - Uses SECURITY DEFINER to access auth.users table
    - Only returns the user ID, not other sensitive data
    - Restricted to authenticated users only

  2. Security
    - Function runs with elevated privileges but only returns a UUID
    - No sensitive data is exposed
    - Only authenticated users can call this function
*/

CREATE OR REPLACE FUNCTION public.get_user_id_by_email(email_input text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  found_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id INTO found_id
  FROM auth.users
  WHERE email = lower(email_input)
  LIMIT 1;

  RETURN found_id;
END;
$$;