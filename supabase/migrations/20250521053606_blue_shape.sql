/*
  # Add missing columns to quick_races table

  1. Changes
    - Add `skippers` column as JSONB array
    - Add `race_results` column as JSONB array
    - Add `last_completed_race` column as integer with default 0
    - Add `has_determined_initial_hcaps` column as boolean with default false
    - Add `is_manual_handicaps` column as boolean with default false

  2. Notes
    - Using JSONB for arrays to store structured data
    - Adding appropriate default values for numeric and boolean columns
    - All columns are nullable to maintain compatibility with existing data
*/

DO $$ 
BEGIN
  -- Add skippers column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quick_races' AND column_name = 'skippers'
  ) THEN
    ALTER TABLE quick_races ADD COLUMN skippers JSONB DEFAULT '[]'::jsonb;
  END IF;

  -- Add race_results column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quick_races' AND column_name = 'race_results'
  ) THEN
    ALTER TABLE quick_races ADD COLUMN race_results JSONB DEFAULT '[]'::jsonb;
  END IF;

  -- Add last_completed_race column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quick_races' AND column_name = 'last_completed_race'
  ) THEN
    ALTER TABLE quick_races ADD COLUMN last_completed_race INTEGER DEFAULT 0;
  END IF;

  -- Add has_determined_initial_hcaps column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quick_races' AND column_name = 'has_determined_initial_hcaps'
  ) THEN
    ALTER TABLE quick_races ADD COLUMN has_determined_initial_hcaps BOOLEAN DEFAULT false;
  END IF;

  -- Add is_manual_handicaps column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quick_races' AND column_name = 'is_manual_handicaps'
  ) THEN
    ALTER TABLE quick_races ADD COLUMN is_manual_handicaps BOOLEAN DEFAULT false;
  END IF;
END $$;