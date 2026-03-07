/*
  # Enhanced Race Status Automation

  1. Changes
    - Update `update_live_tracking_status` function to upsert (create record if missing)
    - Accepts optional club_id parameter for creating new records
    - Adds `status_day` column to track which day the status applies to
    - This enables smart day-over-day transitions for multi-day events

  2. New Column
    - `status_day` (integer) - tracks which event day the current status applies to
      Used to detect when a new day starts and auto-reset from 'completed_for_day' to 'on_hold'
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'live_tracking_events' AND column_name = 'status_day'
  ) THEN
    ALTER TABLE live_tracking_events
    ADD COLUMN status_day INTEGER DEFAULT 1;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION update_live_tracking_status(
  p_event_id UUID,
  p_status TEXT,
  p_notes TEXT DEFAULT NULL,
  p_club_id UUID DEFAULT NULL,
  p_day INTEGER DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM live_tracking_events WHERE event_id = p_event_id
  ) INTO v_exists;

  IF v_exists THEN
    UPDATE live_tracking_events
    SET
      race_status = p_status,
      last_status_update = NOW(),
      status_notes = COALESCE(p_notes, status_notes),
      status_day = COALESCE(p_day, status_day)
    WHERE event_id = p_event_id;
  ELSE
    INSERT INTO live_tracking_events (event_id, club_id, race_status, last_status_update, status_notes, enabled, status_day)
    VALUES (p_event_id, p_club_id, p_status, NOW(), p_notes, true, COALESCE(p_day, 1));
  END IF;

  RETURN TRUE;
END;
$$;
