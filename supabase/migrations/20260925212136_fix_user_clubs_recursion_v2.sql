/*
# Fix infinite recursion in user_clubs by restoring SECURITY DEFINER function calls

## Problem
The previous fix inlined a self-referential subquery (SELECT FROM user_clubs 
inside a user_clubs policy), causing infinite recursion. The original code used 
is_club_admin() and is_platform_super_admin() which are SECURITY DEFINER -- they 
bypass RLS entirely, so they don't trigger policy re-evaluation and don't recurse.

## Fix
Restore is_club_admin() calls in user_clubs policies. For the super admin check,
use is_platform_super_admin() which is also SECURITY DEFINER and now safely reads
from profiles (bypassing RLS on profiles since it runs as the function owner).
*/

DROP POLICY IF EXISTS "Authenticated users can view user_clubs" ON user_clubs;
CREATE POLICY "Authenticated users can view user_clubs"
ON user_clubs FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR is_club_admin(club_id)
  OR is_platform_super_admin()
);

DROP POLICY IF EXISTS "Admins or Super Admins can delete user_clubs" ON user_clubs;
CREATE POLICY "Admins or Super Admins can delete user_clubs"
ON user_clubs FOR DELETE
TO authenticated
USING (
  is_club_admin(club_id)
  OR is_platform_super_admin()
);

DROP POLICY IF EXISTS "Admins or Super Admins can update user_clubs" ON user_clubs;
CREATE POLICY "Admins or Super Admins can update user_clubs"
ON user_clubs FOR UPDATE
TO authenticated
USING (
  is_club_admin(club_id)
  OR is_platform_super_admin()
)
WITH CHECK (
  is_club_admin(club_id)
  OR is_platform_super_admin()
);

DROP POLICY IF EXISTS "Admins or Super Admins can insert user_clubs" ON user_clubs;
CREATE POLICY "Admins or Super Admins can insert user_clubs"
ON user_clubs FOR INSERT
TO authenticated
WITH CHECK (
  is_club_admin(club_id)
  OR is_platform_super_admin()
);
