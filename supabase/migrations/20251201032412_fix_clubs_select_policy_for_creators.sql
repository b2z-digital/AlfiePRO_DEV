/*
  # Fix Clubs SELECT Policy to Allow Creators to See Their Clubs

  1. Changes
    - Update SELECT policy to allow users to see clubs they created
    - This fixes the issue where INSERT fails because the user can't see the newly created club

  2. Security
    - Users can now see clubs they created (created_by_user_id)
    - Maintains all existing security requirements
*/

-- Drop the authenticated users SELECT policy
DROP POLICY IF EXISTS "Authenticated users can view clubs" ON clubs;

-- Recreate with additional check for club creator
CREATE POLICY "Authenticated users can view clubs"
  ON clubs
  FOR SELECT
  TO authenticated
  USING (
    created_by_user_id = auth.uid()
    OR public.is_club_member(clubs.id)
    OR public.is_platform_super_admin()
  );
