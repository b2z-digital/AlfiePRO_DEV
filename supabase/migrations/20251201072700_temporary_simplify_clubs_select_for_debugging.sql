/*
  # Temporarily Simplify Clubs SELECT Policy for Debugging

  1. Changes
    - Temporarily remove user_clubs checks from SELECT policy
    - Allow authenticated users to see clubs they created OR are super admin
    - This will help us identify if user_clubs is the problem

  2. Security
    - This is TEMPORARY for debugging
    - Still restricts to creators and super admins
*/

-- Drop and recreate the SELECT policy without user_clubs checks
DROP POLICY IF EXISTS "Authenticated users can view clubs" ON clubs;

CREATE POLICY "Authenticated users can view clubs"
  ON clubs
  FOR SELECT
  TO authenticated
  USING (
    created_by_user_id = auth.uid()
    OR public.user_is_super_admin(auth.uid())
  );
