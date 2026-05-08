/*
  # Add display_name column to group_call_participants

  1. Modified Tables
    - `group_call_participants`
      - Added `display_name` (text, nullable) - stores the participant's display name

  2. Notes
    - This column was referenced in the application code but missing from the table schema
    - Without this column, group call participant inserts were failing silently
    - This caused group call notifications to never reach the callee
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'group_call_participants' AND column_name = 'display_name'
  ) THEN
    ALTER TABLE group_call_participants ADD COLUMN display_name text;
  END IF;
END $$;
