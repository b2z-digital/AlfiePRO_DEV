/*
# Fix RLS recursion on association tables

The previous migration rewrote RLS policies to use inline subqueries on
user_state_associations and user_national_associations. Those subqueries
reference the SAME table the policy protects, which triggers RLS recursion
(the subquery is itself subject to RLS, creating an infinite loop).

Fix: create SECURITY DEFINER helper functions that return the set of
association IDs the current user administers. SECURITY DEFINER bypasses
RLS, breaking the recursion. The policy then uses a simple IN check
against the pre-computed set -- evaluated once per query, not per row.

No data changes. No table changes. Only policy + function definitions.
*/

-- ============================================================
-- 1. Helper functions (SECURITY DEFINER to bypass RLS)
-- ============================================================

CREATE OR REPLACE FUNCTION get_user_state_admin_assoc_ids(p_user_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(state_association_id), '{}')
  FROM user_state_associations
  WHERE user_id = p_user_id AND role = 'state_admin';
$$;

CREATE OR REPLACE FUNCTION get_user_national_admin_assoc_ids(p_user_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(national_association_id), '{}')
  FROM user_national_associations
  WHERE user_id = p_user_id AND role = 'national_admin';
$$;

-- ============================================================
-- 2. Fix user_state_associations policies
-- ============================================================

DROP POLICY IF EXISTS "Users can view their own state associations" ON user_state_associations;
CREATE POLICY "Users can view their own state associations"
  ON user_state_associations FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "State admins can view all users in their association" ON user_state_associations;
CREATE POLICY "State admins can view all users in their association"
  ON user_state_associations FOR SELECT
  TO authenticated
  USING (
    state_association_id = ANY(get_user_state_admin_assoc_ids(auth.uid()))
  );

DROP POLICY IF EXISTS "Super admins can view all user state associations" ON user_state_associations;
CREATE POLICY "Super admins can view all user state associations"
  ON user_state_associations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_super_admin = true
    )
  );

DROP POLICY IF EXISTS "State admins can add users to their associations" ON user_state_associations;
CREATE POLICY "State admins can add users to their associations"
  ON user_state_associations FOR INSERT
  TO authenticated
  WITH CHECK (
    state_association_id = ANY(get_user_state_admin_assoc_ids(auth.uid()))
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_super_admin = true
    )
  );

DROP POLICY IF EXISTS "Super admins and state admins can update roles" ON user_state_associations;
CREATE POLICY "Super admins and state admins can update roles"
  ON user_state_associations FOR UPDATE
  TO authenticated
  USING (
    state_association_id = ANY(get_user_state_admin_assoc_ids(auth.uid()))
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_super_admin = true
    )
  )
  WITH CHECK (
    state_association_id = ANY(get_user_state_admin_assoc_ids(auth.uid()))
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_super_admin = true
    )
  );

DROP POLICY IF EXISTS "Super admins and state admins can remove users" ON user_state_associations;
CREATE POLICY "Super admins and state admins can remove users"
  ON user_state_associations FOR DELETE
  TO authenticated
  USING (
    state_association_id = ANY(get_user_state_admin_assoc_ids(auth.uid()))
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_super_admin = true
    )
  );

-- ============================================================
-- 3. Fix user_national_associations policies
-- ============================================================

DROP POLICY IF EXISTS "Users can view their own national associations" ON user_national_associations;
CREATE POLICY "Users can view their own national associations"
  ON user_national_associations FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "National admins can view all users in their association" ON user_national_associations;
CREATE POLICY "National admins can view all users in their association"
  ON user_national_associations FOR SELECT
  TO authenticated
  USING (
    national_association_id = ANY(get_user_national_admin_assoc_ids(auth.uid()))
  );

DROP POLICY IF EXISTS "Super admins can view all user national associations" ON user_national_associations;
CREATE POLICY "Super admins can view all user national associations"
  ON user_national_associations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_super_admin = true
    )
  );

DROP POLICY IF EXISTS "National admins can add users to their associations" ON user_national_associations;
CREATE POLICY "National admins can add users to their associations"
  ON user_national_associations FOR INSERT
  TO authenticated
  WITH CHECK (
    national_association_id = ANY(get_user_national_admin_assoc_ids(auth.uid()))
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_super_admin = true
    )
  );

DROP POLICY IF EXISTS "Super admins and national admins can update roles" ON user_national_associations;
CREATE POLICY "Super admins and national admins can update roles"
  ON user_national_associations FOR UPDATE
  TO authenticated
  USING (
    national_association_id = ANY(get_user_national_admin_assoc_ids(auth.uid()))
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_super_admin = true
    )
  )
  WITH CHECK (
    national_association_id = ANY(get_user_national_admin_assoc_ids(auth.uid()))
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_super_admin = true
    )
  );

DROP POLICY IF EXISTS "Super admins and national admins can remove users" ON user_national_associations;
CREATE POLICY "Super admins and national admins can remove users"
  ON user_national_associations FOR DELETE
  TO authenticated
  USING (
    national_association_id = ANY(get_user_national_admin_assoc_ids(auth.uid()))
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_super_admin = true
    )
  );