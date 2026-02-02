/*
  # Fix Clubs SELECT Policy for Creators

  1. Changes
    - Ensure creators can immediately see clubs they create
    - Use explicit public. schema prefix for all table references
    - Simplify UPDATE and DELETE policies to also use explicit schema

  2. Security
    - Creators can see their own clubs immediately after creation
    - Super admins can see all clubs
    - Club admins can update/delete their clubs
*/

-- Drop all policies and recreate with proper schema qualification
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

-- Authenticated users can view clubs they created or if they're super admin
-- Don't check user_clubs yet since the trigger hasn't run
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
    OR EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE public.user_clubs.club_id = clubs.id
      AND public.user_clubs.user_id = auth.uid()
    )
  );

-- Allow club creation
CREATE POLICY "Allow club creation"
  ON clubs
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by_user_id = auth.uid());

-- Club admins or super admins can update
CREATE POLICY "Admins or Super Admins can update club details"
  ON clubs
  FOR UPDATE
  TO authenticated
  USING (
    created_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE public.user_clubs.club_id = clubs.id
      AND public.user_clubs.user_id = auth.uid()
      AND public.user_clubs.role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE public.profiles.id = auth.uid()
      AND public.profiles.is_super_admin = true
    )
  )
  WITH CHECK (
    created_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE public.user_clubs.club_id = clubs.id
      AND public.user_clubs.user_id = auth.uid()
      AND public.user_clubs.role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE public.profiles.id = auth.uid()
      AND public.profiles.is_super_admin = true
    )
  );

-- Club admins or super admins can delete
CREATE POLICY "Admins or Super Admins can delete clubs"
  ON clubs
  FOR DELETE
  TO authenticated
  USING (
    created_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE public.user_clubs.club_id = clubs.id
      AND public.user_clubs.user_id = auth.uid()
      AND public.user_clubs.role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE public.profiles.id = auth.uid()
      AND public.profiles.is_super_admin = true
    )
  );
