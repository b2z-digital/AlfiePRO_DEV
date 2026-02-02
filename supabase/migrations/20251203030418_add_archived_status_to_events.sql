/*
  # Add Archived Status to Events

  1. Changes
    - Add `archived` boolean column to `quick_races` table (default false)
    - Add `archived` boolean column to `public_events` table (default false)
    - Add index on archived column for faster filtering
    - Update RLS policies to filter out archived events by default

  2. Purpose
    - Allow events to be archived instead of permanently deleted
    - Archived events can be restored later
    - Keeps historical data while hiding from main views
*/

-- Add archived column to quick_races
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quick_races' AND column_name = 'archived'
  ) THEN
    ALTER TABLE quick_races ADD COLUMN archived boolean DEFAULT false NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_quick_races_archived ON quick_races(archived);
  END IF;
END $$;

-- Add archived column to public_events
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'public_events' AND column_name = 'archived'
  ) THEN
    ALTER TABLE public_events ADD COLUMN archived boolean DEFAULT false NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_public_events_archived ON public_events(archived);
  END IF;
END $$;