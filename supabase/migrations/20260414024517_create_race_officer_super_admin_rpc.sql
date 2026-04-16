/*
  # Create Race Officer Super Admin RPC Function

  1. New Functions
    - `get_race_officers_for_super_admin()` - Returns all users who have `is_race_officer = true` on their profile
      - Returns: user_id, email, full_name, avatar_url, is_race_officer, created_at
      - Restricted to super admins only

  2. Security
    - Function uses SECURITY DEFINER to access auth.users for email lookup
    - Checks caller is super admin before returning data
*/

CREATE OR REPLACE FUNCTION public.get_race_officers_for_super_admin()
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text,
  avatar_url text,
  is_race_officer boolean,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.super_admins
    WHERE super_admins.user_id = auth.uid()
    AND super_admins.is_active = true
  ) THEN
    RAISE EXCEPTION 'Access denied: super admin only';
  END IF;

  RETURN QUERY
  SELECT
    p.id AS user_id,
    COALESCE(au.email, '') AS email,
    COALESCE(p.full_name, '') AS full_name,
    COALESCE(p.avatar_url, '') AS avatar_url,
    p.is_race_officer,
    p.created_at
  FROM public.profiles p
  LEFT JOIN auth.users au ON au.id = p.id
  WHERE p.is_race_officer = true
  ORDER BY p.full_name ASC, au.email ASC;
END;
$$;
