/*
  # Add race settings columns to quick_races table

  1. New Columns
    - `num_races` (integer) - Number of races in the event
    - `drop_rules` (integer array) - Array of drop rules for scoring

  2. Changes
    - Add num_races column with default value of 12
    - Add drop_rules column with default empty array
    - Both columns are nullable to maintain backward compatibility
*/

-- Add num_races column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quick_races' AND column_name = 'num_races'
  ) THEN
    ALTER TABLE quick_races ADD COLUMN num_races integer DEFAULT 12;
  END IF;
END $$;

-- Add drop_rules column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quick_races' AND column_name = 'drop_rules'
  ) THEN
    ALTER TABLE quick_races ADD COLUMN drop_rules integer[] DEFAULT '{}';
  END IF;
END $$;