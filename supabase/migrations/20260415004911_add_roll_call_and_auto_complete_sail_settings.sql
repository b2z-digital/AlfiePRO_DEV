/*
  # Add roll call and auto-complete sail number settings

  1. Modified Tables
    - `quick_races`
      - Added `enable_roll_call` (boolean, default true) - Whether roll call is shown before heat scoring
      - Added `auto_complete_sail` (boolean, default false) - Whether sail numbers auto-complete in spreadsheet mode
    - `race_series_rounds`
      - Added `enable_roll_call` (boolean, default true) - Whether roll call is shown before heat scoring
      - Added `auto_complete_sail` (boolean, default false) - Whether sail numbers auto-complete in spreadsheet mode

  2. Notes
    - Roll call is enabled by default for all events
    - Auto-complete sail numbers is disabled by default and can be toggled per event
    - These settings are stored alongside existing observer settings
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quick_races' AND column_name = 'enable_roll_call'
  ) THEN
    ALTER TABLE quick_races ADD COLUMN enable_roll_call boolean DEFAULT true;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quick_races' AND column_name = 'auto_complete_sail'
  ) THEN
    ALTER TABLE quick_races ADD COLUMN auto_complete_sail boolean DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'race_series_rounds' AND column_name = 'enable_roll_call'
  ) THEN
    ALTER TABLE race_series_rounds ADD COLUMN enable_roll_call boolean DEFAULT true;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'race_series_rounds' AND column_name = 'auto_complete_sail'
  ) THEN
    ALTER TABLE race_series_rounds ADD COLUMN auto_complete_sail boolean DEFAULT false;
  END IF;
END $$;