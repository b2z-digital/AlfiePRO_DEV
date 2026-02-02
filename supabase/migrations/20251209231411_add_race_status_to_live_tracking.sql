/*
  # Add Race Status Tracking to Live Tracking System

  1. Changes
    - Add race_status field to live_tracking_events table
    - Add last_status_update timestamp
    - Add status_notes field for additional context

  2. Status Types
    - 'live' - Racing is actively happening
    - 'on_hold' - Racing is paused/on hold
    - 'completed_for_day' - All racing complete for the day
    - 'event_complete' - Entire event is complete

  3. Security
    - Club admins and editors can update status
    - Everyone can view status
*/

-- Add race status fields to live_tracking_events
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'live_tracking_events' AND column_name = 'race_status'
  ) THEN
    ALTER TABLE live_tracking_events
    ADD COLUMN race_status TEXT DEFAULT 'on_hold' CHECK (race_status IN ('live', 'on_hold', 'completed_for_day', 'event_complete'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'live_tracking_events' AND column_name = 'last_status_update'
  ) THEN
    ALTER TABLE live_tracking_events
    ADD COLUMN last_status_update TIMESTAMPTZ DEFAULT NOW();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'live_tracking_events' AND column_name = 'status_notes'
  ) THEN
    ALTER TABLE live_tracking_events
    ADD COLUMN status_notes TEXT;
  END IF;
END $$;

-- Create function to update race status
CREATE OR REPLACE FUNCTION update_live_tracking_status(
  p_event_id UUID,
  p_status TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE live_tracking_events
  SET
    race_status = p_status,
    last_status_update = NOW(),
    status_notes = COALESCE(p_notes, status_notes)
  WHERE event_id = p_event_id;

  RETURN FOUND;
END;
$$;

-- Create index for status queries
CREATE INDEX IF NOT EXISTS idx_live_tracking_events_status
ON live_tracking_events(race_status, last_status_update);

-- Drop existing policy if it exists
DO $$
BEGIN
  DROP POLICY IF EXISTS "Club admins can update race status" ON live_tracking_events;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Create RLS policy to allow status updates
CREATE POLICY "Club admins can update race status"
  ON live_tracking_events
  FOR UPDATE
  TO authenticated
  USING (
    club_id IN (
      SELECT club_id FROM user_clubs
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'editor')
    )
  );
