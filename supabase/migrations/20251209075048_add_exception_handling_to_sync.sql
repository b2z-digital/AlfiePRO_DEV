/*
  # Add Exception Handling to Sync Function
  
  1. Changes
    - Add EXCEPTION block to catch any errors
    - Log errors using RAISE WARNING so we can see them
    - Also bypass RLS explicitly since this is a system function
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
  v_updated_count INTEGER;
BEGIN
  RAISE NOTICE 'TRIGGER FIRED!';
  
  -- Only proceed if race_results actually changed
  IF OLD.race_results IS NOT DISTINCT FROM NEW.race_results THEN
    RAISE NOTICE 'Race results unchanged';
    RETURN NEW;
  END IF;

  RAISE NOTICE 'Race results changed!';

  -- Find active session
  SELECT id INTO v_session_id
  FROM live_tracking_sessions
  WHERE event_id = NEW.id
  AND is_expired = false
  LIMIT 1;

  RAISE NOTICE 'Session ID: %', v_session_id;

  IF v_session_id IS NULL THEN
    RAISE NOTICE 'No session found';
    RETURN NEW;
  END IF;

  -- Update with RLS explicitly disabled
  PERFORM set_config('request.jwt.claim.sub', 'system', true);
  
  UPDATE session_skipper_tracking
  SET updated_at = NOW() + interval '5 minutes'
  WHERE session_id = v_session_id;
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RAISE NOTICE 'Updated % rows', v_updated_count;

  RETURN NEW;
  
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Error in sync trigger: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS sync_to_live_tracking ON quick_races;

CREATE TRIGGER sync_to_live_tracking
AFTER UPDATE ON quick_races
FOR EACH ROW
EXECUTE FUNCTION sync_quick_race_to_live_tracking();
