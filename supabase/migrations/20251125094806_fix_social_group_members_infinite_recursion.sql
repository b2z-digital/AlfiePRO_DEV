/*
  # Fix Infinite Recursion in social_group_members RLS Policies

  1. Problem
    - RLS policies on social_group_members reference the same table
    - This creates infinite recursion when checking permissions
    
  2. Solution
    - Create security definer functions to check group membership
    - Update RLS policies to use these functions instead of direct queries
    - This breaks the recursion cycle

  3. Changes
    - Create helper functions with SECURITY DEFINER
    - Drop and recreate problematic RLS policies
*/

-- Create helper function to check if user is group admin/moderator
CREATE OR REPLACE FUNCTION is_group_admin_or_moderator(p_group_id uuid, p_user_id uuid)
RETURNS boolean
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM social_group_members
    WHERE group_id = p_group_id
      AND user_id = p_user_id
      AND role IN ('admin', 'moderator')
      AND status = 'active'
  );
END;
$$;

-- Create helper function to check if user is active group member
CREATE OR REPLACE FUNCTION is_active_group_member(p_group_id uuid, p_user_id uuid)
RETURNS boolean
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM social_group_members
    WHERE group_id = p_group_id
      AND user_id = p_user_id
      AND status = 'active'
  );
END;
$$;

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Group admins can manage members" ON social_group_members;
DROP POLICY IF EXISTS "Users can view group members of groups they can see" ON social_group_members;

-- Recreate policies using helper functions to avoid recursion

-- Allow users to view group members if:
-- 1. The group is public, OR
-- 2. They are an active member of the group
CREATE POLICY "Users can view group members"
  ON social_group_members
  FOR SELECT
  TO authenticated
  USING (
    -- Group is public
    (group_id IN (
      SELECT id FROM social_groups WHERE visibility = 'public'
    ))
    OR
    -- User is an active member (using function to avoid recursion)
    is_active_group_member(group_id, auth.uid())
  );

-- Allow group admins/moderators to manage members
CREATE POLICY "Group admins can manage members"
  ON social_group_members
  FOR ALL
  TO authenticated
  USING (
    is_group_admin_or_moderator(group_id, auth.uid())
  );

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION is_group_admin_or_moderator(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION is_active_group_member(uuid, uuid) TO authenticated;
