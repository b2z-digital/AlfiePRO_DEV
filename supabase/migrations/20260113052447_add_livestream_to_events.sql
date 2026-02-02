/*
  # Add Livestream Support to Events

  1. Changes
    - Add `enable_livestream` column to `quick_races` table
    - Add `quick_race_id` foreign key to `livestream_sessions` table
    - Allow linking livestream sessions directly to race events

  2. Purpose
    - Enable livestreaming integration with event management
    - Link livestreams to specific race events
    - Auto-populate livestream data from event details
*/

-- Add enable_livestream column to quick_races
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quick_races' AND column_name = 'enable_livestream'
  ) THEN
    ALTER TABLE quick_races ADD COLUMN enable_livestream boolean DEFAULT false;
  END IF;
END $$;

-- Add quick_race_id to livestream_sessions table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'livestream_sessions' AND column_name = 'quick_race_id'
  ) THEN
    ALTER TABLE livestream_sessions
    ADD COLUMN quick_race_id uuid REFERENCES quick_races(id) ON DELETE CASCADE;

    -- Add index for faster lookups
    CREATE INDEX IF NOT EXISTS idx_livestream_sessions_quick_race
    ON livestream_sessions(quick_race_id);
  END IF;
END $$;