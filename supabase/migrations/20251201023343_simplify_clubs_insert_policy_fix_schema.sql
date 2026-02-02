/*
  # Simplify Clubs Insert Policy to Fix Schema Issues

  1. Changes
    - Drop existing INSERT policy that references user_clubs
    - Create simpler INSERT policy that works for state association context
    - Ensure created_by_user_id is set correctly
    - Allow state/national admins based on direct state_association_id check

  2. Security
    - Maintains RLS protection
    - Ensures created_by_user_id is always set to current user
    - Uses simpler checks that don't cause schema issues
*/

-- Drop existing policy
DROP POLICY IF EXISTS "Users and association admins can create clubs" ON clubs;
DROP POLICY IF EXISTS "Users can create clubs" ON clubs;

-- Create new simplified policy
-- State admins can create clubs for their association by checking user_state_associations
-- Regular users can create clubs without state association
CREATE POLICY "Allow club creation"
  ON clubs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Must set created_by_user_id to current user
    created_by_user_id = auth.uid()
    AND (
      -- Platform super admin can create any club
      public.is_platform_super_admin()
      OR
      -- State admin can create clubs for their state association
      (
        state_association_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.user_state_associations usa
          WHERE usa.state_association_id = clubs.state_association_id
          AND usa.user_id = auth.uid()
          AND usa.role IN ('state_admin', 'admin')
        )
      )
      OR
      -- National admin can create clubs
      (
        EXISTS (
          SELECT 1 FROM public.user_national_associations una
          WHERE una.user_id = auth.uid()
          AND una.role IN ('national_admin', 'admin')
        )
      )
      OR
      -- Regular user creating their own club (no association)
      (
        state_association_id IS NULL
      )
    )
  );
