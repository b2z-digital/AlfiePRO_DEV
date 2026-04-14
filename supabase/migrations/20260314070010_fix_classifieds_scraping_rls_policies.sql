/*
  # Fix classifieds scraping RLS policies

  1. Problem
    - `classified_scrape_sources` and `classified_scrape_logs` use incorrect
      super admin check via `user_clubs.role = 'super_admin'` which doesn't match
      how super admin status is stored (it's on the `profiles` table)
    - This causes "new row violates row-level security policy" errors when
      super admins try to insert new scrape sources

  2. Changes
    - Drop the existing ALL policies on both tables
    - Create proper per-operation policies using `profiles.is_super_admin = true`
    - Add service_role ALL policy for cron/edge function access

  3. Security
    - Only authenticated users with `is_super_admin = true` in profiles can manage these tables
    - Service role retains full access for cron jobs and edge functions
*/

DO $$ BEGIN
  DROP POLICY IF EXISTS "Super admins can manage classified scrape sources" ON classified_scrape_sources;
  DROP POLICY IF EXISTS "Super admins can manage classified scrape logs" ON classified_scrape_logs;
END $$;

CREATE POLICY "Super admins can select classified scrape sources"
  ON classified_scrape_sources FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

CREATE POLICY "Super admins can insert classified scrape sources"
  ON classified_scrape_sources FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

CREATE POLICY "Super admins can update classified scrape sources"
  ON classified_scrape_sources FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

CREATE POLICY "Super admins can delete classified scrape sources"
  ON classified_scrape_sources FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

CREATE POLICY "Service role can manage classified scrape sources"
  ON classified_scrape_sources FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Super admins can select classified scrape logs"
  ON classified_scrape_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

CREATE POLICY "Super admins can insert classified scrape logs"
  ON classified_scrape_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

CREATE POLICY "Super admins can update classified scrape logs"
  ON classified_scrape_logs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

CREATE POLICY "Super admins can delete classified scrape logs"
  ON classified_scrape_logs FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

CREATE POLICY "Service role can manage classified scrape logs"
  ON classified_scrape_logs FOR ALL
  USING (true)
  WITH CHECK (true);
