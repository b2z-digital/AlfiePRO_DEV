/*
  # Fix National Report Submissions RLS for National Admins

  The existing RLS policies only allow state association admins (via user_state_associations)
  to insert/select/delete national report submissions. National admins who access state
  remittance dashboards also need access.

  1. Changes
    - Add SELECT policy for national admins on national_report_submissions
    - Add INSERT policy for national admins on national_report_submissions
    - Add DELETE policy for national admins on national_report_submissions
    - Add SELECT policy for national admins on national_report_members
    - Add INSERT policy for national admins on national_report_members
    - Add DELETE policy for national admins on national_report_members

  2. Security
    - National admins can only access reports for state associations that belong to their national association
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'National admins can view state reports'
    AND tablename = 'national_report_submissions'
  ) THEN
    CREATE POLICY "National admins can view state reports"
      ON national_report_submissions FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM state_associations sa
          JOIN user_national_associations una ON una.national_association_id = sa.national_association_id
          WHERE sa.id = national_report_submissions.state_association_id
          AND una.user_id = auth.uid()
          AND una.role IN ('admin', 'owner')
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'National admins can create state reports'
    AND tablename = 'national_report_submissions'
  ) THEN
    CREATE POLICY "National admins can create state reports"
      ON national_report_submissions FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM state_associations sa
          JOIN user_national_associations una ON una.national_association_id = sa.national_association_id
          WHERE sa.id = national_report_submissions.state_association_id
          AND una.user_id = auth.uid()
          AND una.role IN ('admin', 'owner')
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'National admins can delete state reports'
    AND tablename = 'national_report_submissions'
  ) THEN
    CREATE POLICY "National admins can delete state reports"
      ON national_report_submissions FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM state_associations sa
          JOIN user_national_associations una ON una.national_association_id = sa.national_association_id
          WHERE sa.id = national_report_submissions.state_association_id
          AND una.user_id = auth.uid()
          AND una.role IN ('admin', 'owner')
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'National admins can view state report members'
    AND tablename = 'national_report_members'
  ) THEN
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
          AND una.role IN ('admin', 'owner')
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'National admins can create state report members'
    AND tablename = 'national_report_members'
  ) THEN
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
          AND una.role IN ('admin', 'owner')
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'National admins can delete state report members'
    AND tablename = 'national_report_members'
  ) THEN
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
          AND una.role IN ('admin', 'owner')
        )
      );
  END IF;
END $$;