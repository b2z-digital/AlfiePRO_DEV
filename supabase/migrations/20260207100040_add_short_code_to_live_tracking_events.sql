/*
  # Add short_code to live_tracking_events

  1. Modified Tables
    - `live_tracking_events`
      - Added `short_code` (text, unique) - A short 8-character alphanumeric code for branded URLs
  2. Changes
    - Generates short codes for all existing rows
    - Adds unique index on short_code for fast lookups
  3. Notes
    - Short code format: 8 alphanumeric characters (uppercase + digits)
    - Used to create branded URLs like alfiepro.com/t/AB3KX9Z2
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'live_tracking_events' AND column_name = 'short_code'
  ) THEN
    ALTER TABLE live_tracking_events
      ADD COLUMN short_code TEXT UNIQUE DEFAULT upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
  END IF;
END $$;

UPDATE live_tracking_events
SET short_code = upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8))
WHERE short_code IS NULL;

CREATE INDEX IF NOT EXISTS idx_live_tracking_events_short_code
  ON live_tracking_events(short_code);
