/*
  # Fix Clubs Policies with Security Definer Helper Functions

  1. Changes
    - Drop and recreate helper functions with SECURITY DEFINER and explicit search_path
    - Recreate all clubs policies using these helper functions
    - This ensures proper schema resolution during policy evaluation

  2. Security
    - All helper functions use SECURITY DEFINER with search_path='public'
    - Maintains all existing security requirements
*/

-- Drop existing policies on clubs table
DROP POLICY IF EXISTS "Public can view basic club info" ON clubs;
DROP POLICY IF EXISTS "Authenticated users can view clubs" ON clubs;
DROP POLICY IF EXISTS "Allow club creation" ON clubs;
DROP POLICY IF EXISTS "Admins or Super Admins can update club details" ON clubs;
DROP POLICY IF EXISTS "Admins or Super Admins can delete clubs" ON clubs;

-- Drop existing helper functions with CASCADE to handle dependencies
DROP FUNCTION IF EXISTS public.is_club_member(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.is_club_admin(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.can_create_club_in_state(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.is_national_admin() CASCADE;

-- Helper function: Check if user is member of a club
CREATE FUNCTION public.is_club_member(club_id_param uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_clubs
    WHERE club_id = club_id_param
    AND user_id = auth.uid()
  );
END;
$$;

-- Helper function: Check if user is admin of a club
CREATE FUNCTION public.is_club_admin(club_id_param uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_clubs
    WHERE club_id = club_id_param
    AND user_id = auth.uid()
    AND role = 'admin'
  );
END;
$$;

-- Helper function: Check if user can create club in state association
CREATE FUNCTION public.can_create_club_in_state(state_assoc_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF state_assoc_id IS NULL THEN
    RETURN true;
  END IF;
  
  RETURN EXISTS (
    SELECT 1 FROM public.user_state_associations
    WHERE state_association_id = state_assoc_id
    AND user_id = auth.uid()
    AND role IN ('state_admin', 'admin')
  );
END;
$$;

-- Helper function: Check if user is national admin
CREATE FUNCTION public.is_national_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_national_associations
    WHERE user_id = auth.uid()
    AND role IN ('national_admin', 'admin')
  );
END;
$$;

-- Recreate clubs table policies
CREATE POLICY "Public can view basic club info"
  ON clubs
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Authenticated users can view clubs"
  ON clubs
  FOR SELECT
  TO authenticated
  USING (
    public.is_club_member(clubs.id)
    OR public.is_platform_super_admin()
  );

CREATE POLICY "Allow club creation"
  ON clubs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by_user_id = auth.uid()
    AND (
      public.is_platform_super_admin()
      OR public.can_create_club_in_state(state_association_id)
      OR public.is_national_admin()
    )
  );

CREATE POLICY "Admins or Super Admins can update club details"
  ON clubs
  FOR UPDATE
  TO authenticated
  USING (
    public.is_club_admin(clubs.id)
    OR public.is_platform_super_admin()
  )
  WITH CHECK (
    public.is_club_admin(clubs.id)
    OR public.is_platform_super_admin()
  );

CREATE POLICY "Admins or Super Admins can delete clubs"
  ON clubs
  FOR DELETE
  TO authenticated
  USING (
    public.is_club_admin(clubs.id)
    OR public.is_platform_super_admin()
  );

-- Recreate user_clubs table policies that were dropped
CREATE POLICY "Authenticated users can view user_clubs"
  ON user_clubs
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_club_admin(club_id)
    OR public.is_platform_super_admin()
  );

CREATE POLICY "Admins or Super Admins can insert user_clubs"
  ON user_clubs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_club_admin(club_id)
    OR public.is_platform_super_admin()
  );

CREATE POLICY "Admins or Super Admins can update user_clubs"
  ON user_clubs
  FOR UPDATE
  TO authenticated
  USING (
    public.is_club_admin(club_id)
    OR public.is_platform_super_admin()
  )
  WITH CHECK (
    public.is_club_admin(club_id)
    OR public.is_platform_super_admin()
  );

CREATE POLICY "Admins or Super Admins can delete user_clubs"
  ON user_clubs
  FOR DELETE
  TO authenticated
  USING (
    public.is_club_admin(club_id)
    OR public.is_platform_super_admin()
  );
