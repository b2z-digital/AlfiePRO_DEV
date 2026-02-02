/*
  # Fix Clubs RLS Policy

  1. Changes
     - Fixes the RLS policy for club admins to update club details
     - Corrects the condition in the USING and WITH CHECK clauses
     - Changes `uc.club_id = uc.id` to `uc.club_id = clubs.id`

  2. Security
     - Maintains proper access control for club administrators
     - Ensures only authorized users can update club information
*/

-- Drop the existing policy if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Admins or Super Admins can update club details'
  ) THEN
    DROP POLICY "Admins or Super Admins can update club details" ON clubs;
  END IF;
END
$$;

-- Create the corrected policy
CREATE POLICY "Admins or Super Admins can update club details"
  ON clubs
  FOR UPDATE
  TO authenticated
  USING (
    (EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = clubs.id
      AND uc.user_id = auth.uid()
      AND uc.role = 'admin'
    )) OR is_platform_super_admin()
  )
  WITH CHECK (
    (EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = clubs.id
      AND uc.user_id = auth.uid()
      AND uc.role = 'admin'
    )) OR is_platform_super_admin()
  );