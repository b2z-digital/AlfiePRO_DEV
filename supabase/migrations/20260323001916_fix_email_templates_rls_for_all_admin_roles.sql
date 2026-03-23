/*
  # Fix email_templates RLS policies for all admin roles

  1. Changes
    - Update INSERT, UPDATE, DELETE policies to allow super_admin, national_admin, state_admin, and editor roles
    - Previously only 'admin' role was allowed, blocking super admins and association admins
    - Also allows the is_super_admin() function check for platform super admins

  2. Security
    - All policies still require authenticated users
    - All policies still verify club membership
    - Expanded role set matches the pattern used by other tables in the system
*/

DO $$ BEGIN
  DROP POLICY IF EXISTS "Club admins can create email templates" ON email_templates;
  DROP POLICY IF EXISTS "Club admins can update email templates" ON email_templates;
  DROP POLICY IF EXISTS "Club admins can delete email templates" ON email_templates;
  DROP POLICY IF EXISTS "Users can view email templates for their clubs" ON email_templates;
  DROP POLICY IF EXISTS "Club admins can view email templates" ON email_templates;
END $$;

CREATE POLICY "Users can view email templates for their clubs"
  ON email_templates
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = email_templates.club_id
      AND uc.user_id = auth.uid()
    )
    OR public.is_super_admin()
  );

CREATE POLICY "Admins can create email templates"
  ON email_templates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = email_templates.club_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'super_admin', 'national_admin', 'state_admin', 'editor')
    )
    OR public.is_super_admin()
  );

CREATE POLICY "Admins can update email templates"
  ON email_templates
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = email_templates.club_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'super_admin', 'national_admin', 'state_admin', 'editor')
    )
    OR public.is_super_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = email_templates.club_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'super_admin', 'national_admin', 'state_admin', 'editor')
    )
    OR public.is_super_admin()
  );

CREATE POLICY "Admins can delete email templates"
  ON email_templates
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = email_templates.club_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'super_admin', 'national_admin', 'state_admin', 'editor')
    )
    OR public.is_super_admin()
  );
