/*
  # Fix All Social RLS Policies to Prevent Recursion

  1. Problem
    - social_groups policies still query social_group_members directly
    - profiles has duplicate SELECT policies
    - This causes 500 and 400 errors
    
  2. Solution
    - Update social_groups policies to use helper functions
    - Simplify profiles policies to allow public access for avatars
    - Keep social_connections as is (working correctly)

  3. Changes
    - Fix social_groups SELECT, UPDATE, DELETE policies
    - Fix profiles SELECT policy for public avatar access
*/

-- Fix social_groups policies
DROP POLICY IF EXISTS "Users can view groups they are members of" ON social_groups;
DROP POLICY IF EXISTS "Users can view public groups" ON social_groups;
DROP POLICY IF EXISTS "Group admins can update groups" ON social_groups;
DROP POLICY IF EXISTS "Group admins can delete groups" ON social_groups;

-- Recreate using helper functions
CREATE POLICY "Users can view groups they are members of"
  ON social_groups
  FOR SELECT
  TO authenticated
  USING (
    is_active_group_member(id, auth.uid())
  );

CREATE POLICY "Users can view public groups"
  ON social_groups
  FOR SELECT
  TO authenticated
  USING (visibility = 'public');

CREATE POLICY "Group admins can update groups"
  ON social_groups
  FOR UPDATE
  TO authenticated
  USING (
    is_group_admin_or_moderator(id, auth.uid())
  );

CREATE POLICY "Group admins can delete groups"
  ON social_groups
  FOR DELETE
  TO authenticated
  USING (
    is_group_admin_or_moderator(id, auth.uid())
  );

-- Fix profiles policies - remove duplicate SELECT policy
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;

-- Keep "Public can view basic profiles" as the main SELECT policy
-- This allows avatars and names to be visible publicly
