/*
  # Add Event Day Support to Livestream Sessions

  1. Changes
    - Add `event_day` column to `livestream_sessions` table to support multi-day events
    - Allows tracking which day of a multi-day event a particular livestream covers

  2. Notes
    - Column is nullable and defaults to 1 (Day 1)
    - Useful for regattas and multi-day championships
*/

-- Add event_day column to livestream_sessions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'livestream_sessions' AND column_name = 'event_day'
  ) THEN
    ALTER TABLE livestream_sessions ADD COLUMN event_day INTEGER DEFAULT 1;
    COMMENT ON COLUMN livestream_sessions.event_day IS 'For multi-day events: which day this stream covers (1, 2, 3, etc.)';
  END IF;
END $$;