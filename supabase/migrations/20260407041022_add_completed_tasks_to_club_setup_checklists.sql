/*
  # Add Explicit Task Completion Tracking to Club Setup Checklists

  1. Modified Tables
    - `club_setup_checklists`
      - Add `completed_tasks` (jsonb) - stores an array of task IDs that the admin has explicitly marked as complete
      - Add `updated_by` (uuid) - tracks who last updated the checklist

  2. Purpose
    - Previously, task completion was auto-detected by checking if data existed (e.g., any membership type = "done")
    - This caused tasks to show as complete when association-created seed data existed, even though the club admin hadn't reviewed them
    - Now, tasks are only marked complete when the admin explicitly clicks to complete them or saves after reviewing

  3. Important Notes
    - The completed_tasks column stores task IDs as a JSON array, e.g. ["membership-types", "bank-details"]
    - Existing checklist rows will get an empty array by default
    - The frontend will use this column instead of auto-detection for completion status
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'club_setup_checklists' AND column_name = 'completed_tasks'
  ) THEN
    ALTER TABLE club_setup_checklists ADD COLUMN completed_tasks jsonb DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'club_setup_checklists' AND column_name = 'updated_by'
  ) THEN
    ALTER TABLE club_setup_checklists ADD COLUMN updated_by uuid REFERENCES auth.users(id);
  END IF;
END $$;
