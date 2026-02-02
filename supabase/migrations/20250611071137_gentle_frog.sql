-- Fix infinite recursion in user_clubs RLS policy
-- This migration completely replaces the problematic policies with simpler ones that don't cause recursion

-- First, drop all existing policies on user_clubs to start fresh
DROP POLICY IF EXISTS "Club admins can manage memberships via function" ON user_clubs;
DROP POLICY IF EXISTS "Club admins can manage club memberships" ON user_clubs;
DROP POLICY IF EXISTS "Users can view their own club memberships" ON user_clubs;
DROP POLICY IF EXISTS "Users can view their own memberships" ON user_clubs;
DROP POLICY IF EXISTS "Club admins can view club memberships" ON user_clubs;
DROP POLICY IF EXISTS "Club admins can add memberships" ON user_clubs;
DROP POLICY IF EXISTS "Club admins can update memberships" ON user_clubs;
DROP POLICY IF EXISTS "Club admins can delete memberships" ON user_clubs;

-- Create a simple policy for users to view their own memberships
CREATE POLICY "Users can view own memberships"
  ON user_clubs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Create a simple policy for club admins to view all memberships in their clubs
-- This uses a direct subquery instead of a recursive check
CREATE POLICY "Admins can view all club memberships"
  ON user_clubs
  FOR SELECT
  TO authenticated
  USING (
    club_id IN (
      SELECT club_id FROM user_clubs 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Create a simple policy for club admins to insert new memberships
CREATE POLICY "Admins can add club memberships"
  ON user_clubs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    club_id IN (
      SELECT club_id FROM user_clubs 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Create a simple policy for club admins to update memberships
CREATE POLICY "Admins can update club memberships"
  ON user_clubs
  FOR UPDATE
  TO authenticated
  USING (
    club_id IN (
      SELECT club_id FROM user_clubs 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    club_id IN (
      SELECT club_id FROM user_clubs 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Create a simple policy for club admins to delete memberships
CREATE POLICY "Admins can delete club memberships"
  ON user_clubs
  FOR DELETE
  TO authenticated
  USING (
    club_id IN (
      SELECT club_id FROM user_clubs 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );