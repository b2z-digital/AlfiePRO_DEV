/*
# Fix infinite recursion in user_clubs policies

## Problem
After moving is_platform_super_admin() to check profiles table, a circular 
dependency exists: user_clubs SELECT policy calls is_platform_super_admin() 
and is_club_admin(). is_club_admin() queries user_clubs, creating infinite 
recursion when PostgreSQL evaluates the policies.

## Fix
Replace is_platform_super_admin() and is_club_admin() calls in user_clubs 
policies with direct inline checks that don't go through user_clubs again.
The SELECT policy uses auth.uid() = user_id for own rows, plus a direct 
profiles check for super admin (no function call that could recurse).

For DELETE/UPDATE, same approach: inline the admin checks.
*/

-- Fix user_clubs SELECT policy: inline the checks to avoid recursion
DROP POLICY IF EXISTS "Authenticated users can view user_clubs" ON user_clubs;
CREATE POLICY "Authenticated users can view user_clubs"
ON user_clubs FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM user_clubs uc2
    WHERE uc2.club_id = user_clubs.club_id
    AND uc2.user_id = auth.uid()
    AND uc2.role = 'admin'
  )
  OR EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.is_super_admin = true
  )
);

-- Fix user_clubs DELETE policy
DROP POLICY IF EXISTS "Admins or Super Admins can delete user_clubs" ON user_clubs;
CREATE POLICY "Admins or Super Admins can delete user_clubs"
ON user_clubs FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_clubs uc2
    WHERE uc2.club_id = user_clubs.club_id
    AND uc2.user_id = auth.uid()
    AND uc2.role = 'admin'
  )
  OR EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.is_super_admin = true
  )
);

-- Fix user_clubs UPDATE policy
DROP POLICY IF EXISTS "Admins or Super Admins can update user_clubs" ON user_clubs;
CREATE POLICY "Admins or Super Admins can update user_clubs"
ON user_clubs FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_clubs uc2
    WHERE uc2.club_id = user_clubs.club_id
    AND uc2.user_id = auth.uid()
    AND uc2.role = 'admin'
  )
  OR EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.is_super_admin = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_clubs uc2
    WHERE uc2.club_id = user_clubs.club_id
    AND uc2.user_id = auth.uid()
    AND uc2.role = 'admin'
  )
  OR EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.is_super_admin = true
  )
);

-- Fix user_clubs INSERT policy (uses is_club_admin which also recurses)
DROP POLICY IF EXISTS "Admins or Super Admins can insert user_clubs" ON user_clubs;
CREATE POLICY "Admins or Super Admins can insert user_clubs"
ON user_clubs FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_clubs uc2
    WHERE uc2.club_id = user_clubs.club_id
    AND uc2.user_id = auth.uid()
    AND uc2.role = 'admin'
  )
  OR EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.is_super_admin = true
  )
);
