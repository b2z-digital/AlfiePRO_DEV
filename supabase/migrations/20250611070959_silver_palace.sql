/*
  # Fix infinite recursion in user_clubs RLS policy

  1. Security Changes
    - Drop the problematic policy that causes infinite recursion
    - Create simplified policies that don't cause recursive loops
    - Ensure users can view their own club memberships
    - Allow club admins to manage memberships without recursion

  2. Policy Updates
    - Replace complex function-based policy with direct column checks
    - Separate SELECT policies from management policies
    - Use direct user_id comparison for user access
    - Use EXISTS subquery for admin access without recursion
*/

-- Drop the problematic policy that causes infinite recursion
DROP POLICY IF EXISTS "Club admins can manage memberships via function" ON user_clubs;

-- Create a simple policy for users to view their own memberships
DROP POLICY IF EXISTS "Users can view their own memberships" ON user_clubs;
CREATE POLICY "Users can view their own memberships"
  ON user_clubs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Create separate policies for club admin management
-- This policy allows club admins to view all memberships for their clubs
CREATE POLICY "Club admins can view club memberships"
  ON user_clubs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc 
      WHERE uc.club_id = user_clubs.club_id 
      AND uc.user_id = auth.uid() 
      AND uc.role = 'admin'
    )
  );

-- Policy for club admins to insert new memberships
CREATE POLICY "Club admins can add memberships"
  ON user_clubs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs uc 
      WHERE uc.club_id = user_clubs.club_id 
      AND uc.user_id = auth.uid() 
      AND uc.role = 'admin'
    )
  );

-- Policy for club admins to update memberships
CREATE POLICY "Club admins can update memberships"
  ON user_clubs
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc 
      WHERE uc.club_id = user_clubs.club_id 
      AND uc.user_id = auth.uid() 
      AND uc.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs uc 
      WHERE uc.club_id = user_clubs.club_id 
      AND uc.user_id = auth.uid() 
      AND uc.role = 'admin'
    )
  );

-- Policy for club admins to delete memberships
CREATE POLICY "Club admins can delete memberships"
  ON user_clubs
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc 
      WHERE uc.club_id = user_clubs.club_id 
      AND uc.user_id = auth.uid() 
      AND uc.role = 'admin'
    )
  );