/*
  # Fix infinite recursion in association user management RLS policies

  1. Problem
    - INSERT/UPDATE/DELETE policies on user_state_associations and user_national_associations
      query the same table to check admin status, causing infinite recursion
  
  2. Solution
    - Create SECURITY DEFINER helper functions that bypass RLS to check admin status
    - Replace self-referencing policy checks with calls to these functions
  
  3. Changes
    - New function: is_state_association_admin(state_association_id, user_id)
    - New function: is_national_association_admin(national_association_id, user_id)
    - Recreated INSERT/UPDATE/DELETE policies for both tables using the helper functions
*/

-- Helper function for state association admin check (bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_state_association_admin(
  p_state_association_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_state_associations
    WHERE state_association_id = p_state_association_id
    AND user_id = p_user_id
    AND role = 'state_admin'
  );
$$;

-- Helper function for national association admin check (bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_national_association_admin(
  p_national_association_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_national_associations
    WHERE national_association_id = p_national_association_id
    AND user_id = p_user_id
    AND role = 'national_admin'
  );
$$;

-- =============================================
-- Fix user_state_associations policies
-- =============================================

-- Drop existing problematic policies
DROP POLICY IF EXISTS "State admins can add users to their associations" ON user_state_associations;
DROP POLICY IF EXISTS "Super admins and state admins can update roles" ON user_state_associations;
DROP POLICY IF EXISTS "Super admins and state admins can remove users" ON user_state_associations;

-- Recreate INSERT policy using helper function
CREATE POLICY "State admins can add users to their associations"
  ON user_state_associations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_state_association_admin(state_association_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- Recreate UPDATE policy using helper function
CREATE POLICY "Super admins and state admins can update roles"
  ON user_state_associations
  FOR UPDATE
  TO authenticated
  USING (
    public.is_state_association_admin(state_association_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  )
  WITH CHECK (
    public.is_state_association_admin(state_association_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- Recreate DELETE policy using helper function
CREATE POLICY "Super admins and state admins can remove users"
  ON user_state_associations
  FOR DELETE
  TO authenticated
  USING (
    public.is_state_association_admin(state_association_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- =============================================
-- Fix user_national_associations policies
-- =============================================

-- Drop existing problematic policies
DROP POLICY IF EXISTS "National admins can add users to their associations" ON user_national_associations;
DROP POLICY IF EXISTS "Super admins and national admins can update roles" ON user_national_associations;
DROP POLICY IF EXISTS "Super admins and national admins can remove users" ON user_national_associations;

-- Also drop the separate super admin insert policy (now combined into one)
DROP POLICY IF EXISTS "Super admins can add users to national associations" ON user_national_associations;

-- Recreate INSERT policy using helper function
CREATE POLICY "National admins can add users to their associations"
  ON user_national_associations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_national_association_admin(national_association_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- Recreate UPDATE policy using helper function
CREATE POLICY "Super admins and national admins can update roles"
  ON user_national_associations
  FOR UPDATE
  TO authenticated
  USING (
    public.is_national_association_admin(national_association_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  )
  WITH CHECK (
    public.is_national_association_admin(national_association_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- Recreate DELETE policy using helper function
CREATE POLICY "Super admins and national admins can remove users"
  ON user_national_associations
  FOR DELETE
  TO authenticated
  USING (
    public.is_national_association_admin(national_association_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- Also drop the now-redundant separate super admin insert policy for state
DROP POLICY IF EXISTS "Super admins can add users to state associations" ON user_state_associations;
