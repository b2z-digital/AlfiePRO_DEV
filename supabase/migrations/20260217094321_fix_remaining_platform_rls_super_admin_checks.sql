/*
  # Fix remaining platform table RLS policies for super admin detection

  1. Changes
    - Update `platform_resource_snapshots` SELECT/UPDATE/INSERT policies to use `is_platform_super_admin()`
    - Update `platform_settings` SELECT/UPDATE/DELETE/INSERT policies to use `is_platform_super_admin()`
    - These tables previously only checked `user_clubs.role = 'super_admin'` which doesn't match
      users whose super admin status comes from `auth.users.raw_user_meta_data`

  2. Security
    - Both `is_platform_super_admin()` (metadata check) and `user_clubs` check are supported
    - No reduction in security; just adding the missing auth path
*/

-- platform_resource_snapshots
DROP POLICY IF EXISTS "Super admins can view resource snapshots" ON platform_resource_snapshots;
CREATE POLICY "Super admins can view resource snapshots"
  ON platform_resource_snapshots FOR SELECT TO authenticated
  USING (
    is_platform_super_admin()
    OR EXISTS (SELECT 1 FROM user_clubs WHERE user_clubs.user_id = auth.uid() AND user_clubs.role = 'super_admin')
  );

DROP POLICY IF EXISTS "Super admins can update resource snapshots" ON platform_resource_snapshots;
CREATE POLICY "Super admins can update resource snapshots"
  ON platform_resource_snapshots FOR UPDATE TO authenticated
  USING (
    is_platform_super_admin()
    OR EXISTS (SELECT 1 FROM user_clubs WHERE user_clubs.user_id = auth.uid() AND user_clubs.role = 'super_admin')
  )
  WITH CHECK (
    is_platform_super_admin()
    OR EXISTS (SELECT 1 FROM user_clubs WHERE user_clubs.user_id = auth.uid() AND user_clubs.role = 'super_admin')
  );

DROP POLICY IF EXISTS "Super admins can insert resource snapshots" ON platform_resource_snapshots;
CREATE POLICY "Super admins can insert resource snapshots"
  ON platform_resource_snapshots FOR INSERT TO authenticated
  WITH CHECK (
    is_platform_super_admin()
    OR EXISTS (SELECT 1 FROM user_clubs WHERE user_clubs.user_id = auth.uid() AND user_clubs.role = 'super_admin')
  );

-- platform_settings
DROP POLICY IF EXISTS "Super admins can read platform settings" ON platform_settings;
CREATE POLICY "Super admins can read platform settings"
  ON platform_settings FOR SELECT TO authenticated
  USING (
    is_platform_super_admin()
    OR EXISTS (SELECT 1 FROM user_clubs WHERE user_clubs.user_id = auth.uid() AND user_clubs.role = 'super_admin')
  );

DROP POLICY IF EXISTS "Super admins can update platform settings" ON platform_settings;
CREATE POLICY "Super admins can update platform settings"
  ON platform_settings FOR UPDATE TO authenticated
  USING (
    is_platform_super_admin()
    OR EXISTS (SELECT 1 FROM user_clubs WHERE user_clubs.user_id = auth.uid() AND user_clubs.role = 'super_admin')
  )
  WITH CHECK (
    is_platform_super_admin()
    OR EXISTS (SELECT 1 FROM user_clubs WHERE user_clubs.user_id = auth.uid() AND user_clubs.role = 'super_admin')
  );

DROP POLICY IF EXISTS "Super admins can delete platform settings" ON platform_settings;
CREATE POLICY "Super admins can delete platform settings"
  ON platform_settings FOR DELETE TO authenticated
  USING (
    is_platform_super_admin()
    OR EXISTS (SELECT 1 FROM user_clubs WHERE user_clubs.user_id = auth.uid() AND user_clubs.role = 'super_admin')
  );

DROP POLICY IF EXISTS "Super admins can insert platform settings" ON platform_settings;
CREATE POLICY "Super admins can insert platform settings"
  ON platform_settings FOR INSERT TO authenticated
  WITH CHECK (
    is_platform_super_admin()
    OR EXISTS (SELECT 1 FROM user_clubs WHERE user_clubs.user_id = auth.uid() AND user_clubs.role = 'super_admin')
  );
