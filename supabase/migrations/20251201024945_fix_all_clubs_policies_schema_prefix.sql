/*
  # Fix All Clubs Table Policies with Schema Prefix

  1. Changes
    - Drop all existing policies on clubs table
    - Recreate all policies with proper public. schema prefix
    - Fix user_clubs references that were causing "relation does not exist" errors

  2. Security
    - Maintains all existing security requirements
    - Ensures proper RLS enforcement
    - Uses explicit schema qualification to avoid lookup errors
*/

-- Drop all existing policies
DROP POLICY IF EXISTS "Public can view basic club info" ON clubs;
DROP POLICY IF EXISTS "Authenticated users can view clubs" ON clubs;
DROP POLICY IF EXISTS "Allow club creation" ON clubs;
DROP POLICY IF EXISTS "Admins or Super Admins can update club details" ON clubs;
DROP POLICY IF EXISTS "Admins or Super Admins can delete clubs" ON clubs;

-- Public can view basic club info
CREATE POLICY "Public can view basic club info"
  ON clubs
  FOR SELECT
  TO public
  USING (true);

-- Authenticated users can view clubs they're members of or if they're super admin
CREATE POLICY "Authenticated users can view clubs"
  ON clubs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_clubs uc
      WHERE uc.club_id = clubs.id
      AND uc.user_id = auth.uid()
    )
    OR public.is_platform_super_admin()
  );

-- Allow club creation for state admins, national admins, and regular users
CREATE POLICY "Allow club creation"
  ON clubs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by_user_id = auth.uid()
    AND (
      public.is_platform_super_admin()
      OR
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
      (
        EXISTS (
          SELECT 1 FROM public.user_national_associations una
          WHERE una.user_id = auth.uid()
          AND una.role IN ('national_admin', 'admin')
        )
      )
      OR
      (
        state_association_id IS NULL
      )
    )
  );

-- Club admins or super admins can update club details
CREATE POLICY "Admins or Super Admins can update club details"
  ON clubs
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_clubs uc
      WHERE uc.club_id = clubs.id
      AND uc.user_id = auth.uid()
      AND uc.role = 'admin'
    )
    OR public.is_platform_super_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_clubs uc
      WHERE uc.club_id = clubs.id
      AND uc.user_id = auth.uid()
      AND uc.role = 'admin'
    )
    OR public.is_platform_super_admin()
  );

-- Club admins or super admins can delete clubs
CREATE POLICY "Admins or Super Admins can delete clubs"
  ON clubs
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_clubs uc
      WHERE uc.club_id = clubs.id
      AND uc.user_id = auth.uid()
      AND uc.role = 'admin'
    )
    OR public.is_platform_super_admin()
  );
