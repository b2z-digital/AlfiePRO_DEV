/*
  # Fix All Clubs Policies with Explicit Schema Prefixes

  1. Changes
    - Replace all policy function calls with inline queries using explicit public. schema prefix
    - This avoids PostgREST query planning issues with SECURITY DEFINER functions
    - Ensures proper schema resolution

  2. Security
    - Maintains all existing security requirements
    - Uses explicit schema qualification to avoid "relation not found" errors
*/

-- Drop all existing policies on clubs
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

-- Authenticated users can view clubs they created, are members of, or if they're super admin
CREATE POLICY "Authenticated users can view clubs"
  ON clubs
  FOR SELECT
  TO authenticated
  USING (
    created_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE public.user_clubs.club_id = clubs.id
      AND public.user_clubs.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE public.profiles.id = auth.uid()
      AND public.profiles.is_super_admin = true
    )
  );

-- Allow club creation for authenticated users
CREATE POLICY "Allow club creation"
  ON clubs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by_user_id = auth.uid()
  );

-- Club admins or super admins can update club details
CREATE POLICY "Admins or Super Admins can update club details"
  ON clubs
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
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
    EXISTS (
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

-- Club admins or super admins can delete clubs
CREATE POLICY "Admins or Super Admins can delete clubs"
  ON clubs
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
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
