/*
# Fix user_clubs recursion: remove self-referential admin check

## Problem  
In Supabase, the postgres role is NOT a true superuser and does NOT bypass RLS.
So SECURITY DEFINER functions owned by postgres still trigger RLS policy 
evaluation, causing infinite recursion when is_club_admin() queries user_clubs
from within a user_clubs policy.

## Fix
Simplify user_clubs policies:
- SELECT: users see their own club memberships + super admins see all
  (club admins see other members through the members table, not user_clubs)
- INSERT: own row insertion (for joining clubs) + super admin
- UPDATE/DELETE: own row or super admin

For the super admin check, use a direct inline query against profiles 
(which has no dependency on user_clubs) instead of calling is_platform_super_admin()
which is also SECURITY DEFINER but still triggers RLS in Supabase.
*/

DROP POLICY IF EXISTS "Authenticated users can view user_clubs" ON user_clubs;
CREATE POLICY "Authenticated users can view user_clubs"
ON user_clubs FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR (SELECT is_super_admin FROM profiles WHERE id = auth.uid()) = true
);

DROP POLICY IF EXISTS "Admins or Super Admins can delete user_clubs" ON user_clubs;
CREATE POLICY "Admins or Super Admins can delete user_clubs"
ON user_clubs FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  OR (SELECT is_super_admin FROM profiles WHERE id = auth.uid()) = true
);

DROP POLICY IF EXISTS "Admins or Super Admins can update user_clubs" ON user_clubs;
CREATE POLICY "Admins or Super Admins can update user_clubs"
ON user_clubs FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  OR (SELECT is_super_admin FROM profiles WHERE id = auth.uid()) = true
)
WITH CHECK (
  user_id = auth.uid()
  OR (SELECT is_super_admin FROM profiles WHERE id = auth.uid()) = true
);

DROP POLICY IF EXISTS "Admins or Super Admins can insert user_clubs" ON user_clubs;
CREATE POLICY "Admins or Super Admins can insert user_clubs"
ON user_clubs FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR (SELECT is_super_admin FROM profiles WHERE id = auth.uid()) = true
);

-- Also fix the "Users can insert their own club associations" policy
-- to keep existing self-insert path working
-- (leave it as-is since it only checks auth.uid() = user_id, no recursion risk)
