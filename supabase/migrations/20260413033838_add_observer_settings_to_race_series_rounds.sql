/*
  # Add observer settings to race_series_rounds

  1. Modified Tables
    - `race_series_rounds`
      - Added `enable_observers` (boolean, default false) - Whether observers are enabled for this round
      - Added `observers_per_heat` (integer, default 2) - Number of observers per heat

  2. Notes
    - These columns allow series rounds to have independent observer settings
    - Previously observer settings were only available on quick_races table
    - This fixes observers not working for series race events
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'race_series_rounds' AND column_name = 'enable_observers'
  ) THEN
    ALTER TABLE race_series_rounds ADD COLUMN enable_observers boolean DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'race_series_rounds' AND column_name = 'observers_per_heat'
  ) THEN
    ALTER TABLE race_series_rounds ADD COLUMN observers_per_heat integer DEFAULT 2;
  END IF;
END $$;