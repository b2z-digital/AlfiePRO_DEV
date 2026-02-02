/*
  # Fix Clubs Policies with Security Definer Functions V3

  1. Changes
    - Create helper functions with SECURITY DEFINER and explicit search_path
    - These functions will always see the public schema tables
    - Update all clubs policies to use these helper functions
    - This bypasses PostgREST's schema resolution issues

  2. Security
    - Functions are SECURITY DEFINER but only do read checks
    - All policies still enforce proper authorization
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Public can view basic club info" ON clubs;
DROP POLICY IF EXISTS "Authenticated users can view clubs" ON clubs;
DROP POLICY IF EXISTS "Allow club creation" ON clubs;
DROP POLICY IF EXISTS "Admins or Super Admins can update club details" ON clubs;
DROP POLICY IF EXISTS "Admins or Super Admins can delete clubs" ON clubs;

-- Create helper function to check if user is in user_clubs for a given club
CREATE OR REPLACE FUNCTION public.user_is_club_member(check_club_id uuid, check_user_id uuid)
RETURNS boolean
SECURITY DEFINER
SET search_path = public, extensions
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_clubs
    WHERE user_clubs.club_id = check_club_id
    AND user_clubs.user_id = check_user_id
  );
END;
$$;

-- Create helper function to check if user is club admin
CREATE OR REPLACE FUNCTION public.user_is_club_admin(check_club_id uuid, check_user_id uuid)
RETURNS boolean
SECURITY DEFINER
SET search_path = public, extensions
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_clubs
    WHERE user_clubs.club_id = check_club_id
    AND user_clubs.user_id = check_user_id
    AND user_clubs.role = 'admin'
  );
END;
$$;

-- Create helper function to check if user is super admin
CREATE OR REPLACE FUNCTION public.user_is_super_admin(check_user_id uuid)
RETURNS boolean
SECURITY DEFINER
SET search_path = public, extensions
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = check_user_id
    AND profiles.is_super_admin = true
  );
END;
$$;

-- Public can view basic club info
CREATE POLICY "Public can view basic club info"
  ON clubs
  FOR SELECT
  TO public
  USING (true);

-- Authenticated users can view clubs they created, are members of, or if super admin
CREATE POLICY "Authenticated users can view clubs"
  ON clubs
  FOR SELECT
  TO authenticated
  USING (
    created_by_user_id = auth.uid()
    OR public.user_is_club_member(id, auth.uid())
    OR public.user_is_super_admin(auth.uid())
  );

-- Allow club creation
CREATE POLICY "Allow club creation"
  ON clubs
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by_user_id = auth.uid());

-- Club admins, creators, or super admins can update
CREATE POLICY "Admins or Super Admins can update club details"
  ON clubs
  FOR UPDATE
  TO authenticated
  USING (
    created_by_user_id = auth.uid()
    OR public.user_is_club_admin(id, auth.uid())
    OR public.user_is_super_admin(auth.uid())
  )
  WITH CHECK (
    created_by_user_id = auth.uid()
    OR public.user_is_club_admin(id, auth.uid())
    OR public.user_is_super_admin(auth.uid())
  );

-- Club admins, creators, or super admins can delete
CREATE POLICY "Admins or Super Admins can delete clubs"
  ON clubs
  FOR DELETE
  TO authenticated
  USING (
    created_by_user_id = auth.uid()
    OR public.user_is_club_admin(id, auth.uid())
    OR public.user_is_super_admin(auth.uid())
  );
