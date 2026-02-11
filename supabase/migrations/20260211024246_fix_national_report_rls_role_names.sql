/*
  # Fix National Report RLS Policy Role Names

  The existing RLS policies on national_report_submissions and national_report_members
  check for roles 'admin' and 'owner', but the actual roles in user_state_associations
  are 'state_admin' and 'member', and in user_national_associations are 'national_admin'.

  1. Changes
    - Drop and recreate all 6 original state admin policies with correct role names
    - Drop and recreate all 6 national admin policies with correct role names

  2. Security
    - State admins (role = 'state_admin') can manage reports for their state association
    - National admins (role = 'national_admin') can manage reports for any of their state associations
*/

-- Drop existing state admin policies
DROP POLICY IF EXISTS "State admins can view own reports" ON national_report_submissions;
DROP POLICY IF EXISTS "State admins can create reports" ON national_report_submissions;
DROP POLICY IF EXISTS "State admins can delete own reports" ON national_report_submissions;
DROP POLICY IF EXISTS "State admins can view report members" ON national_report_members;
DROP POLICY IF EXISTS "State admins can create report members" ON national_report_members;
DROP POLICY IF EXISTS "State admins can delete report members" ON national_report_members;

-- Drop existing national admin policies
DROP POLICY IF EXISTS "National admins can view state reports" ON national_report_submissions;
DROP POLICY IF EXISTS "National admins can create state reports" ON national_report_submissions;
DROP POLICY IF EXISTS "National admins can delete state reports" ON national_report_submissions;
DROP POLICY IF EXISTS "National admins can view state report members" ON national_report_members;
DROP POLICY IF EXISTS "National admins can create state report members" ON national_report_members;
DROP POLICY IF EXISTS "National admins can delete state report members" ON national_report_members;

-- Recreate state admin policies with correct role name
CREATE POLICY "State admins can view own reports"
  ON national_report_submissions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.state_association_id = national_report_submissions.state_association_id
      AND usa.user_id = auth.uid()
      AND usa.role = 'state_admin'
    )
  );

CREATE POLICY "State admins can create reports"
  ON national_report_submissions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.state_association_id = national_report_submissions.state_association_id
      AND usa.user_id = auth.uid()
      AND usa.role = 'state_admin'
    )
  );

CREATE POLICY "State admins can delete own reports"
  ON national_report_submissions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.state_association_id = national_report_submissions.state_association_id
      AND usa.user_id = auth.uid()
      AND usa.role = 'state_admin'
    )
  );

CREATE POLICY "State admins can view report members"
  ON national_report_members FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM national_report_submissions nrs
      JOIN user_state_associations usa ON usa.state_association_id = nrs.state_association_id
      WHERE nrs.id = national_report_members.report_id
      AND usa.user_id = auth.uid()
      AND usa.role = 'state_admin'
    )
  );

CREATE POLICY "State admins can create report members"
  ON national_report_members FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM national_report_submissions nrs
      JOIN user_state_associations usa ON usa.state_association_id = nrs.state_association_id
      WHERE nrs.id = national_report_members.report_id
      AND usa.user_id = auth.uid()
      AND usa.role = 'state_admin'
    )
  );

CREATE POLICY "State admins can delete report members"
  ON national_report_members FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM national_report_submissions nrs
      JOIN user_state_associations usa ON usa.state_association_id = nrs.state_association_id
      WHERE nrs.id = national_report_members.report_id
      AND usa.user_id = auth.uid()
      AND usa.role = 'state_admin'
    )
  );

-- National admin policies
CREATE POLICY "National admins can view state reports"
  ON national_report_submissions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM state_associations sa
      JOIN user_national_associations una ON una.national_association_id = sa.national_association_id
      WHERE sa.id = national_report_submissions.state_association_id
      AND una.user_id = auth.uid()
      AND una.role = 'national_admin'
    )
  );

CREATE POLICY "National admins can create state reports"
  ON national_report_submissions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM state_associations sa
      JOIN user_national_associations una ON una.national_association_id = sa.national_association_id
      WHERE sa.id = national_report_submissions.state_association_id
      AND una.user_id = auth.uid()
      AND una.role = 'national_admin'
    )
  );

CREATE POLICY "National admins can delete state reports"
  ON national_report_submissions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM state_associations sa
      JOIN user_national_associations una ON una.national_association_id = sa.national_association_id
      WHERE sa.id = national_report_submissions.state_association_id
      AND una.user_id = auth.uid()
      AND una.role = 'national_admin'
    )
  );

CREATE POLICY "National admins can view state report members"
  ON national_report_members FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM national_report_submissions nrs
      JOIN state_associations sa ON sa.id = nrs.state_association_id
      JOIN user_national_associations una ON una.national_association_id = sa.national_association_id
      WHERE nrs.id = national_report_members.report_id
      AND una.user_id = auth.uid()
      AND una.role = 'national_admin'
    )
  );

CREATE POLICY "National admins can create state report members"
  ON national_report_members FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM national_report_submissions nrs
      JOIN state_associations sa ON sa.id = nrs.state_association_id
      JOIN user_national_associations una ON una.national_association_id = sa.national_association_id
      WHERE nrs.id = national_report_members.report_id
      AND una.user_id = auth.uid()
      AND una.role = 'national_admin'
    )
  );

CREATE POLICY "National admins can delete state report members"
  ON national_report_members FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM national_report_submissions nrs
      JOIN state_associations sa ON sa.id = nrs.state_association_id
      JOIN user_national_associations una ON una.national_association_id = sa.national_association_id
      WHERE nrs.id = national_report_members.report_id
      AND una.user_id = auth.uid()
      AND una.role = 'national_admin'
    )
  );
