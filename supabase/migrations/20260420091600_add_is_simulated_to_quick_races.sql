/*
  # Add is_simulated flag to quick_races

  1. Modified Tables
    - `quick_races`
      - `is_simulated` (boolean, default false) - Flags events created via the HMS Simulation tool

  2. Notes
    - Allows filtering simulated events into their own tab in Race Management
    - Default is false so existing events are unaffected
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quick_races' AND column_name = 'is_simulated'
  ) THEN
    ALTER TABLE quick_races ADD COLUMN is_simulated boolean DEFAULT false;
  END IF;
END $$;