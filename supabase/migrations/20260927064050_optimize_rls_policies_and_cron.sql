/*
# Optimize RLS policies on association tables and reduce cron frequency

1. Performance fixes
   - Rewrite user_state_associations RLS SELECT policies to use set-based
     subqueries instead of per-row function calls. The old pattern called
     is_state_association_admin(state_association_id, auth.uid()) for every
     row, causing 654K+ sequential scans. The new pattern builds the set of
     admin associations once and filters with an index.
   - Apply the same fix to user_national_associations (199K+ seq scans).
   - Reduce check-amplify-ssl-status cron from every 5 minutes to every
     30 minutes.

2. Security
   - No RLS behavior change -- same access rules, just expressed more
     efficiently.
*/

-- ============================================================
-- 1. Rewrite user_state_associations RLS policies
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
    state_association_id IN (
      SELECT usa.state_association_id
      FROM user_state_associations usa
      WHERE usa.user_id = auth.uid()
        AND usa.role = 'state_admin'
    )
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
    state_association_id IN (
      SELECT usa.state_association_id
      FROM user_state_associations usa
      WHERE usa.user_id = auth.uid()
        AND usa.role = 'state_admin'
    )
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
    state_association_id IN (
      SELECT usa.state_association_id
      FROM user_state_associations usa
      WHERE usa.user_id = auth.uid()
        AND usa.role = 'state_admin'
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_super_admin = true
    )
  )
  WITH CHECK (
    state_association_id IN (
      SELECT usa.state_association_id
      FROM user_state_associations usa
      WHERE usa.user_id = auth.uid()
        AND usa.role = 'state_admin'
    )
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
    state_association_id IN (
      SELECT usa.state_association_id
      FROM user_state_associations usa
      WHERE usa.user_id = auth.uid()
        AND usa.role = 'state_admin'
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_super_admin = true
    )
  );

-- ============================================================
-- 2. Rewrite user_national_associations RLS policies
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
    national_association_id IN (
      SELECT una.national_association_id
      FROM user_national_associations una
      WHERE una.user_id = auth.uid()
        AND una.role = 'national_admin'
    )
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
    national_association_id IN (
      SELECT una.national_association_id
      FROM user_national_associations una
      WHERE una.user_id = auth.uid()
        AND una.role = 'national_admin'
    )
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
    national_association_id IN (
      SELECT una.national_association_id
      FROM user_national_associations una
      WHERE una.user_id = auth.uid()
        AND una.role = 'national_admin'
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_super_admin = true
    )
  )
  WITH CHECK (
    national_association_id IN (
      SELECT una.national_association_id
      FROM user_national_associations una
      WHERE una.user_id = auth.uid()
        AND una.role = 'national_admin'
    )
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
    national_association_id IN (
      SELECT una.national_association_id
      FROM user_national_associations una
      WHERE una.user_id = auth.uid()
        AND una.role = 'national_admin'
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_super_admin = true
    )
  );

-- ============================================================
-- 3. Reduce SSL check cron from 5min to 30min
-- ============================================================

SELECT cron.unschedule('check-amplify-ssl-status');
SELECT cron.schedule(
  'check-amplify-ssl-status',
  '*/30 * * * *',
  $$SELECT public.poll_amplify_ssl_with_logging();$$
);