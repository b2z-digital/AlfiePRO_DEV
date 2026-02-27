
/*
  # Enhance Bug Reports System

  1. Add missing columns to `bug_reports`
    - `steps_to_reproduce` (text)
    - `browser_info` (text) - separate from user_agent for readable display
    - `reporter_club` (text)
    - `admin_notes` (text)
    - `resolution_notes` (text)

  2. Ensure `bug_report_comments` table exists

  3. Update policies for admin access (club admins can submit)
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bug_reports' AND column_name = 'steps_to_reproduce') THEN
    ALTER TABLE bug_reports ADD COLUMN steps_to_reproduce text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bug_reports' AND column_name = 'browser_info') THEN
    ALTER TABLE bug_reports ADD COLUMN browser_info text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bug_reports' AND column_name = 'reporter_club') THEN
    ALTER TABLE bug_reports ADD COLUMN reporter_club text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bug_reports' AND column_name = 'admin_notes') THEN
    ALTER TABLE bug_reports ADD COLUMN admin_notes text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bug_reports' AND column_name = 'resolution_notes') THEN
    ALTER TABLE bug_reports ADD COLUMN resolution_notes text DEFAULT '';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS bug_report_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bug_report_id uuid NOT NULL REFERENCES bug_reports(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name text DEFAULT '',
  comment text NOT NULL DEFAULT '',
  is_admin_reply boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE bug_report_comments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_bug_report_comments_report_id ON bug_report_comments(bug_report_id);

-- Comments RLS (drop if exists pattern to avoid conflicts)
DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can view comments on own reports" ON bug_report_comments;
  DROP POLICY IF EXISTS "Super admins can view all comments" ON bug_report_comments;
  DROP POLICY IF EXISTS "Users can comment on own reports" ON bug_report_comments;
  DROP POLICY IF EXISTS "Super admins can comment on any report" ON bug_report_comments;
  DROP POLICY IF EXISTS "Super admins can delete comments" ON bug_report_comments;
END $$;

CREATE POLICY "Users can view comments on own reports"
  ON bug_report_comments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM bug_reports
      WHERE bug_reports.id = bug_report_comments.bug_report_id
      AND bug_reports.reported_by = auth.uid()
    )
  );

CREATE POLICY "Super admins can view all comments"
  ON bug_report_comments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_user_meta_data->>'is_super_admin')::boolean = true
    )
  );

CREATE POLICY "Users can comment on own reports"
  ON bug_report_comments FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM bug_reports
      WHERE bug_reports.id = bug_report_comments.bug_report_id
      AND bug_reports.reported_by = auth.uid()
    )
  );

CREATE POLICY "Super admins can comment on any report"
  ON bug_report_comments FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_user_meta_data->>'is_super_admin')::boolean = true
    )
  );

CREATE POLICY "Super admins can delete comments"
  ON bug_report_comments FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_user_meta_data->>'is_super_admin')::boolean = true
    )
  );

-- Auto-update trigger
CREATE OR REPLACE FUNCTION update_bug_report_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_bug_report_updated_at ON bug_reports;
CREATE TRIGGER trg_update_bug_report_updated_at
  BEFORE UPDATE ON bug_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_bug_report_updated_at();
