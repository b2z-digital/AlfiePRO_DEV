/*
  # Fix Clubs RLS Policy Bug
  
  1. Problem
    - The "Authenticated users can view clubs" policy has a bug
    - It checks `uc.club_id = uc.id` instead of `uc.club_id = clubs.id`
    - This prevents members from viewing their club details
  
  2. Changes
    - Drop the broken policy
    - Recreate with correct column reference
  
  3. Security
    - Maintains same security model
    - Only fixes the column reference bug
    - Users can only view clubs they are members of (via user_clubs)
*/

-- Drop the broken policy
DROP POLICY IF EXISTS "Authenticated users can view clubs" ON clubs;

-- Recreate with correct column reference
CREATE POLICY "Authenticated users can view clubs"
  ON clubs
  FOR SELECT
  TO authenticated
  USING (
    (EXISTS (
      SELECT 1
      FROM user_clubs uc
      WHERE uc.club_id = clubs.id 
      AND uc.user_id = auth.uid()
    )) 
    OR is_platform_super_admin()
  );
