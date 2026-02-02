/*
  # Allow National Admins to Create State Associations

  1. Changes
    - Add INSERT policy for national admins to create state associations
    - National admins can create state associations linked to their national association

  2. Security
    - Policy ensures national admins can only create state associations for their own national association
    - Maintains existing super admin permissions
*/

-- Drop the existing super admin only policy
DROP POLICY IF EXISTS "Super admins can insert state associations" ON state_associations;

-- Create new policy that allows both super admins and national admins
CREATE POLICY "Super admins and national admins can insert state associations"
  ON state_associations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Super admins can create any state association
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
    OR
    -- National admins can create state associations for their national association
    EXISTS (
      SELECT 1 FROM user_national_associations una
      WHERE una.user_id = auth.uid()
      AND una.national_association_id = state_associations.national_association_id
      AND una.role = 'national_admin'
    )
  );