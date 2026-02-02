/*
  # Ultra Simple Live Tracking Sync
  
  1. Changes
    - Create the absolute simplest possible sync function
    - Just update updated_at to prove the trigger can write
    - Then add position update logic step by step
*/

DROP FUNCTION IF EXISTS sync_quick_race_to_live_tracking() CASCADE;

CREATE OR REPLACE FUNCTION sync_quick_race_to_live_tracking()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_session_id UUID;
BEGIN
  -- Only proceed if race_results actually changed
  IF OLD.race_results IS NOT DISTINCT FROM NEW.race_results THEN
    RETURN NEW;
  END IF;

  -- Find active session
  SELECT id INTO v_session_id
  FROM live_tracking_sessions
  WHERE event_id = NEW.id
  AND is_expired = false
  LIMIT 1;

  IF v_session_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Super simple update - just touch updated_at to prove this works
  UPDATE session_skipper_tracking
  SET updated_at = NOW() + interval '1 minute'
  WHERE session_id = v_session_id;

  RETURN NEW;
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS sync_to_live_tracking ON quick_races;

CREATE TRIGGER sync_to_live_tracking
AFTER UPDATE ON quick_races
FOR EACH ROW
EXECUTE FUNCTION sync_quick_race_to_live_tracking();
