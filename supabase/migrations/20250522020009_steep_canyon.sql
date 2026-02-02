/*
  # Update race series schema to store results properly

  1. Changes
    - Add `skippers` column as JSONB array to store consistent skipper data
    - Add `results` column as JSONB array to store round results
    - Add `completed` column as boolean to track round completion
    - Add `last_completed_race` column as integer
    - Add `has_determined_initial_hcaps` column as boolean
    - Add `is_manual_handicaps` column as boolean

  2. Notes
    - Using JSONB for arrays to store structured data
    - Adding appropriate default values
    - All columns are nullable to maintain compatibility
*/

DO $$ 
BEGIN
  -- Add skippers column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'race_series' AND column_name = 'skippers'
  ) THEN
    ALTER TABLE race_series ADD COLUMN skippers JSONB DEFAULT '[]'::jsonb;
  END IF;

  -- Add results column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'race_series' AND column_name = 'results'
  ) THEN
    ALTER TABLE race_series ADD COLUMN results JSONB DEFAULT '[]'::jsonb;
  END IF;

  -- Add completed column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'race_series' AND column_name = 'completed'
  ) THEN
    ALTER TABLE race_series ADD COLUMN completed BOOLEAN DEFAULT false;
  END IF;

  -- Add last_completed_race column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'race_series' AND column_name = 'last_completed_race'
  ) THEN
    ALTER TABLE race_series ADD COLUMN last_completed_race INTEGER DEFAULT 0;
  END IF;

  -- Add has_determined_initial_hcaps column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'race_series' AND column_name = 'has_determined_initial_hcaps'
  ) THEN
    ALTER TABLE race_series ADD COLUMN has_determined_initial_hcaps BOOLEAN DEFAULT false;
  END IF;

  -- Add is_manual_handicaps column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'race_series' AND column_name = 'is_manual_handicaps'
  ) THEN
    ALTER TABLE race_series ADD COLUMN is_manual_handicaps BOOLEAN DEFAULT false;
  END IF;
END $$;