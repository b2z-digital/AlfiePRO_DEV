/*
  # Fix infinite recursion in user_clubs RLS policies

  1. Security Changes
    - Drop the problematic "Club admins can manage club memberships" policy that causes infinite recursion
    - Create a new policy that avoids the recursive subquery
    - Keep the existing "Users can view their own club memberships" policy as it's correct

  The issue was that the admin policy was querying user_clubs within a policy applied to user_clubs,
  creating infinite recursion. The new policy structure avoids this by using a different approach.
*/

-- Drop the problematic policy that causes infinite recursion
DROP POLICY IF EXISTS "Club admins can manage club memberships" ON user_clubs;

-- Create a new policy for club admins that doesn't cause recursion
-- This policy allows users to manage memberships for clubs where they are admins
-- We'll use a function to check admin status to avoid direct recursion
CREATE OR REPLACE FUNCTION is_club_admin(club_uuid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_clubs uc 
    WHERE uc.club_id = club_uuid 
    AND uc.user_id = auth.uid() 
    AND uc.role = 'admin'::club_role
  );
$$;

-- Create new policy using the function
CREATE POLICY "Club admins can manage memberships via function"
  ON user_clubs
  FOR ALL
  TO authenticated
  USING (is_club_admin(club_id))
  WITH CHECK (is_club_admin(club_id));

-- Ensure the existing policy for users viewing their own memberships is correct
DROP POLICY IF EXISTS "Users can view their own club memberships" ON user_clubs;

CREATE POLICY "Users can view their own memberships"
  ON user_clubs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());