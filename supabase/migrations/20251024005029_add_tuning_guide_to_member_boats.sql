/*
  # Add Tuning Guide to Member Boats

  1. Changes
    - Add `tuning_guide_url` column to `member_boats` table to store PDF tuning guides
    - Add `tuning_guide_file_name` column to store the original filename
  
  2. Notes
    - Allows members to upload manufacturer tuning guides for their boats
    - Accessible from the Rig Tuning tab for reference during setup
*/

-- Add tuning guide columns to member_boats table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'member_boats' AND column_name = 'tuning_guide_url'
  ) THEN
    ALTER TABLE member_boats ADD COLUMN tuning_guide_url text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'member_boats' AND column_name = 'tuning_guide_file_name'
  ) THEN
    ALTER TABLE member_boats ADD COLUMN tuning_guide_file_name text;
  END IF;
END $$;
