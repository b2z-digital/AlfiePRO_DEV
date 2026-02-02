/*
  # Fix Infinite Recursion in social_posts RLS Policies

  1. Problem
    - social_posts policies directly query social_group_members
    - When creating a post, SELECT policies are checked to return the new row
    - This triggers social_group_members policies, causing recursion
    
  2. Solution
    - Update social_posts policies to use the security definer helper functions
    - This breaks the recursion chain

  3. Changes
    - Replace direct social_group_members queries with function calls
    - Update "Moderators can moderate posts" policy
    - Update "Users can view posts in their groups" policy
*/

-- Drop problematic policies that query social_group_members
DROP POLICY IF EXISTS "Moderators can moderate posts" ON social_posts;
DROP POLICY IF EXISTS "Users can view posts in their groups" ON social_posts;

-- Recreate "Users can view posts in their groups" using helper function
CREATE POLICY "Users can view posts in their groups"
  ON social_posts
  FOR SELECT
  TO authenticated
  USING (
    group_id IS NOT NULL 
    AND is_active_group_member(group_id, auth.uid())
  );

-- Recreate "Moderators can moderate posts" using helper function
CREATE POLICY "Moderators can moderate posts"
  ON social_posts
  FOR UPDATE
  TO authenticated
  USING (
    group_id IS NOT NULL 
    AND is_group_admin_or_moderator(group_id, auth.uid())
  );
