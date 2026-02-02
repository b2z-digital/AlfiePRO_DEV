/*
  # Add Livestream Support to Race Series
  
  1. Changes
    - Add `enable_livestream` boolean column to `race_series` table
    - Add `enable_livestream` boolean column to `race_series_rounds` table (for per-round control)
    - Set default value to false for both columns
  
  2. Purpose
    - Enable livestreaming functionality for series events
    - Allow individual rounds within a series to have independent livestream settings
    - Match the functionality already available for single events (quick_races)
*/

-- Add enable_livestream to race_series table (series-level setting)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'race_series' AND column_name = 'enable_livestream'
  ) THEN
    ALTER TABLE race_series ADD COLUMN enable_livestream boolean DEFAULT false;
  END IF;
END $$;

-- Add enable_livestream to race_series_rounds table (per-round setting)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'race_series_rounds' AND column_name = 'enable_livestream'
  ) THEN
    ALTER TABLE race_series_rounds ADD COLUMN enable_livestream boolean DEFAULT false;
  END IF;
END $$;
