/*
  # Fix Clubs DELETE RLS Policy Bug
  
  1. Problem
    - The "Admins or Super Admins can delete clubs" policy has the same bug
    - It checks `uc.club_id = uc.id` instead of `uc.club_id = clubs.id`
  
  2. Changes
    - Drop the broken policy
    - Recreate with correct column reference
  
  3. Security
    - Maintains same security model
    - Only fixes the column reference bug
    - Only admins can delete their clubs
*/

-- Drop the broken policy
DROP POLICY IF EXISTS "Admins or Super Admins can delete clubs" ON clubs;

-- Recreate with correct column reference
CREATE POLICY "Admins or Super Admins can delete clubs"
  ON clubs
  FOR DELETE
  TO authenticated
  USING (
    (EXISTS (
      SELECT 1
      FROM user_clubs uc
      WHERE uc.club_id = clubs.id 
      AND uc.user_id = auth.uid() 
      AND uc.role = 'admin'::club_role
    )) 
    OR is_platform_super_admin()
  );
