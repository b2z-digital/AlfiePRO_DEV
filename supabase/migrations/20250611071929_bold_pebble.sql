/*
  # Fix infinite recursion in user_clubs RLS policies

  1. Problem
    - Current RLS policies on user_clubs table are causing infinite recursion
    - Policies are referencing the same table they're protecting, creating circular dependencies

  2. Solution
    - Drop existing problematic policies
    - Create new simplified policies that don't cause recursion
    - Use direct user ID comparison instead of subqueries on the same table

  3. Security
    - Users can view their own club memberships
    - Users can only modify memberships for clubs where they are admins
    - Service role maintains full access
*/

-- Drop existing policies that cause recursion
DROP POLICY IF EXISTS "Admins can add club memberships" ON user_clubs;
DROP POLICY IF EXISTS "Admins can delete club memberships" ON user_clubs;
DROP POLICY IF EXISTS "Admins can update club memberships" ON user_clubs;
DROP POLICY IF EXISTS "Admins can view all club memberships" ON user_clubs;
DROP POLICY IF EXISTS "Users can view own memberships" ON user_clubs;

-- Create new policies without recursion
CREATE POLICY "Users can view own memberships"
  ON user_clubs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- For admin operations, we'll use a function to check admin status
-- This avoids the recursion by using a stored function
CREATE OR REPLACE FUNCTION is_club_admin(club_uuid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_clubs 
    WHERE user_id = auth.uid() 
    AND club_id = club_uuid 
    AND role = 'admin'
  );
$$;

-- Now create admin policies using the function
CREATE POLICY "Club admins can insert memberships"
  ON user_clubs
  FOR INSERT
  TO authenticated
  WITH CHECK (is_club_admin(club_id));

CREATE POLICY "Club admins can update memberships"
  ON user_clubs
  FOR UPDATE
  TO authenticated
  USING (is_club_admin(club_id))
  WITH CHECK (is_club_admin(club_id));

CREATE POLICY "Club admins can delete memberships"
  ON user_clubs
  FOR DELETE
  TO authenticated
  USING (is_club_admin(club_id));

CREATE POLICY "Club admins can view all memberships"
  ON user_clubs
  FOR SELECT
  TO authenticated
  USING (is_club_admin(club_id));

-- Service role policy for full access
CREATE POLICY "Service role has full access"
  ON user_clubs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);