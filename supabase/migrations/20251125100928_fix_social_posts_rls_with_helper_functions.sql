/*
  # Fix social_posts RLS policies to use helper functions

  1. Problem
    - The "Users can view posts from their connections" policy queries social_connections directly
    - This can cause RLS issues when combined with foreign key joins
    
  2. Solution
    - Create a helper function to check if users are connected
    - Update the policy to use this helper function
    - Simplify the policy logic

  3. Changes
    - Create is_connected_to() helper function
    - Update social_posts SELECT policy for friends
*/

-- Create helper function to check if two users are connected
CREATE OR REPLACE FUNCTION is_connected_to(user1_id uuid, user2_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM social_connections 
    WHERE status = 'accepted'
      AND (
        (user_id = user1_id AND connected_user_id = user2_id) OR
        (user_id = user2_id AND connected_user_id = user1_id)
      )
  );
$$;

-- Drop and recreate the friends policy with helper function
DROP POLICY IF EXISTS "Users can view posts from their connections" ON social_posts;

CREATE POLICY "Users can view posts from their connections"
  ON social_posts
  FOR SELECT
  TO authenticated
  USING (
    privacy = 'friends' 
    AND is_connected_to(auth.uid(), author_id)
  );
