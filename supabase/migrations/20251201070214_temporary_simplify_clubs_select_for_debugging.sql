/*
  # Temporarily Simplify Clubs SELECT Policy for Debugging

  1. Changes
    - Temporarily remove user_clubs references from SELECT policy
    - This will help us identify if user_clubs is causing the PostgREST issue
    - Keep only creator and super admin checks

  2. Security
    - TEMPORARY: This is for debugging only
    - Users can only see clubs they created or if they're super admin
*/

-- Drop and recreate with simpler logic
DROP POLICY IF EXISTS "Authenticated users can view clubs" ON clubs;

CREATE POLICY "Authenticated users can view clubs"
  ON clubs
  FOR SELECT
  TO authenticated
  USING (
    created_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE public.profiles.id = auth.uid()
      AND public.profiles.is_super_admin = true
    )
  );
