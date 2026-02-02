/*
  # Add show_club Column to Results Display Settings

  1. New Column
    - `show_club` (boolean) - Controls visibility of Club column in results display
    - Defaults to true (show column by default)

  2. Tables Updated
    - quick_races
    - race_series
    - public_events

  3. Notes
    - Uses safe migration with existence checks
    - Default is true to maintain backward compatibility
*/

-- Add show_club column to quick_races
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quick_races' AND column_name = 'show_club'
  ) THEN
    ALTER TABLE quick_races ADD COLUMN show_club BOOLEAN DEFAULT true;
  END IF;
END $$;

-- Add show_club column to race_series
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'race_series' AND column_name = 'show_club'
  ) THEN
    ALTER TABLE race_series ADD COLUMN show_club BOOLEAN DEFAULT true;
  END IF;
END $$;

-- Add show_club column to public_events
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'public_events' AND column_name = 'show_club'
  ) THEN
    ALTER TABLE public_events ADD COLUMN show_club BOOLEAN DEFAULT true;
  END IF;
END $$;
