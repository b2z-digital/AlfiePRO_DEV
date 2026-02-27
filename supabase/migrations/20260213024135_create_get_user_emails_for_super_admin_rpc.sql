/*
  # Create get_user_emails_for_super_admin RPC function

  1. New Functions
    - `get_user_emails_for_super_admin` - Returns user IDs and emails from auth.users
      - Only accessible by platform super admins
      - Returns id (uuid) and email (text) for all auth users

  2. Security
    - Uses SECURITY DEFINER to access auth.users table
    - Checks caller is a platform super admin via is_platform_super_admin()
    - Set search_path to public for security
*/

CREATE OR REPLACE FUNCTION public.get_user_emails_for_super_admin()
RETURNS TABLE(id uuid, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_super_admin() THEN
    RAISE EXCEPTION 'Access denied: not a platform super admin';
  END IF;

  RETURN QUERY
  SELECT au.id, au.email::text
  FROM auth.users au
  ORDER BY au.email;
END;
$$;
