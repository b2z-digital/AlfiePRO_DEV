/*
  # Fix is_super_admin(uuid) function search path

  1. Problem
    - The `is_super_admin(uuid)` function has an empty search_path
    - This causes `relation "profiles" does not exist` errors when RLS policies
      call this function
    - Affected operations include inserting into marketing_list_members (CSV import)

  2. Fix
    - Recreate the function with `search_path = public` so it can find the profiles table
*/

CREATE OR REPLACE FUNCTION public.is_super_admin(check_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = check_user_id
    AND is_super_admin = true
  );
$$;
