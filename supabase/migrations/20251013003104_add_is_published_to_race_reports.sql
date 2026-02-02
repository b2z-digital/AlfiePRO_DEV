/*
  # Add is_published column to race_reports

  1. Changes
    - Add `is_published` boolean column to race_reports table
    - Default value is false (draft state)
    - Add index for faster filtering by published status
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'race_reports' AND column_name = 'is_published'
  ) THEN
    ALTER TABLE race_reports ADD COLUMN is_published boolean DEFAULT false;
  END IF;
END $$;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_race_reports_is_published ON race_reports(is_published);