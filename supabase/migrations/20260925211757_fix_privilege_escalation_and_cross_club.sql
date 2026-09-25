/*
# CRITICAL: Fix privilege escalation via user-editable metadata

## Problem
The `is_platform_super_admin()` and `is_super_admin()` functions determine admin 
status by reading user-editable `raw_user_meta_data` or JWT `user_metadata`. 
Any user can call `supabase.auth.updateUser({ data: { is_super_admin: true } })` 
and gain full admin access to the platform.

## Fix
1. Rewrite all super admin check functions to use the server-controlled 
   `profiles.is_super_admin` column instead of user-editable metadata.
2. Revoke UPDATE on privileged columns so users cannot self-promote.
3. Fix cross-club membership_applications data leak.
*/

-- 1. Rewrite is_platform_super_admin() to use profiles table
CREATE OR REPLACE FUNCTION is_platform_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND is_super_admin = true
  );
$$;

-- 2. Rewrite is_super_admin() no-arg to use profiles table
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT COALESCE(
      (SELECT is_super_admin FROM profiles WHERE id = auth.uid()),
      false
    )
  );
END;
$$;

-- 3. Harden user_is_super_admin with search_path
CREATE OR REPLACE FUNCTION user_is_super_admin(check_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = check_user_id
    AND is_super_admin = true
  );
$$;

-- 4. Prevent self-promotion via direct column UPDATE on profiles
-- Use exact columns from the profiles table, excluding privileged ones:
-- is_super_admin, is_race_officer, member_number, registration_source,
-- is_multi_club_member, account_cancelled_at, race_management_plan, email
REVOKE UPDATE ON profiles FROM authenticated;
GRANT UPDATE (
  full_name, first_name, last_name, avatar_url,
  default_club_id, primary_club_id, onboarding_completed,
  last_seen, ui_preferences, 
  alfietv_category_preferences, nationality, scoring_mode_preference,
  cover_image_url, cover_image_position_x, cover_image_position_y, cover_image_scale
) ON profiles TO authenticated;

-- 5. Restrict INSERT columns to prevent setting privileged fields during signup
REVOKE INSERT ON profiles FROM authenticated;
GRANT INSERT (
  id, full_name, first_name, last_name, avatar_url,
  default_club_id, primary_club_id, onboarding_completed,
  ui_preferences, nationality, email,
  cover_image_url, cover_image_position_x, cover_image_position_y, cover_image_scale
) ON profiles TO authenticated;

REVOKE INSERT ON profiles FROM anon;
GRANT INSERT (
  id, full_name, first_name, last_name, avatar_url,
  default_club_id, primary_club_id, onboarding_completed,
  ui_preferences, nationality, email,
  cover_image_url, cover_image_position_x, cover_image_position_y, cover_image_scale
) ON profiles TO anon;

-- 6. Fix cross-club membership_applications leak
DROP POLICY IF EXISTS "Authenticated users can view applications" ON membership_applications;
DROP POLICY IF EXISTS "Authenticated users can update applications" ON membership_applications;

CREATE POLICY "Users and club admins can view applications"
ON membership_applications FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM user_clubs uc
    WHERE uc.club_id = membership_applications.club_id
    AND uc.user_id = auth.uid()
    AND uc.role IN ('admin', 'editor')
  )
  OR is_platform_super_admin()
);

CREATE POLICY "Applicants and club admins can update applications"
ON membership_applications FOR UPDATE
TO authenticated
USING (
  (user_id = auth.uid() AND is_draft = true)
  OR EXISTS (
    SELECT 1 FROM user_clubs uc
    WHERE uc.club_id = membership_applications.club_id
    AND uc.user_id = auth.uid()
    AND uc.role IN ('admin', 'editor')
  )
  OR is_platform_super_admin()
)
WITH CHECK (
  (user_id = auth.uid() AND is_draft = true)
  OR EXISTS (
    SELECT 1 FROM user_clubs uc
    WHERE uc.club_id = membership_applications.club_id
    AND uc.user_id = auth.uid()
    AND uc.role IN ('admin', 'editor')
  )
  OR is_platform_super_admin()
);
