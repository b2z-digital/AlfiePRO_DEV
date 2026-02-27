
/*
  # Enhance Bug Reports - Add Report Type & Fix Constraints

  1. Changes to `bug_reports`
    - Add `report_type` column (text) - 'bug' or 'feature_request'
    - Add `priority` column (integer) - for ordering/prioritization
    - Add `votes` column (integer) - for feature request upvoting
    - Update category constraint to include 'functionality'
    - Update status constraint to include 'resolved' and 'closed'

  2. Notes
    - Uses safe ALTER with constraint drops/recreates
    - Preserves existing data
*/

-- Add report_type column
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bug_reports' AND column_name = 'report_type') THEN
    ALTER TABLE bug_reports ADD COLUMN report_type text NOT NULL DEFAULT 'bug';
  END IF;
END $$;

-- Add priority column
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bug_reports' AND column_name = 'priority') THEN
    ALTER TABLE bug_reports ADD COLUMN priority integer NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Add votes column
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bug_reports' AND column_name = 'votes') THEN
    ALTER TABLE bug_reports ADD COLUMN votes integer NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Fix category constraint to include 'functionality'
ALTER TABLE bug_reports DROP CONSTRAINT IF EXISTS bug_reports_category_check;
ALTER TABLE bug_reports ADD CONSTRAINT bug_reports_category_check
  CHECK (category IN ('ui', 'functionality', 'performance', 'data', 'feature', 'navigation', 'other'));

-- Fix status constraint to include 'resolved' and 'closed'
ALTER TABLE bug_reports DROP CONSTRAINT IF EXISTS bug_reports_status_check;
ALTER TABLE bug_reports ADD CONSTRAINT bug_reports_status_check
  CHECK (status IN ('open', 'in_progress', 'resolved', 'closed', 'fixed', 'wont_fix', 'duplicate'));

-- Add report_type constraint
ALTER TABLE bug_reports DROP CONSTRAINT IF EXISTS bug_reports_report_type_check;
ALTER TABLE bug_reports ADD CONSTRAINT bug_reports_report_type_check
  CHECK (report_type IN ('bug', 'feature_request'));

-- Set default for description column to empty string to avoid NOT NULL failures
ALTER TABLE bug_reports ALTER COLUMN description SET DEFAULT '';

-- Add index on report_type
CREATE INDEX IF NOT EXISTS idx_bug_reports_report_type ON bug_reports(report_type);
