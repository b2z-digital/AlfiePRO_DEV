/*
  # Simplify Live Tracking Sync
  
  1. Changes
    - Rewrite sync function using simpler SQL without nested WITH clauses
    - Use direct UPDATE with JOIN instead of variable assignment
    - This should be more reliable inside trigger context
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
  v_max_race INTEGER;
BEGIN
  -- Only proceed if race_results actually changed
  IF OLD.race_results IS NOT DISTINCT FROM NEW.race_results THEN
    RETURN NEW;
  END IF;

  -- Find active session for this race
  SELECT id INTO v_session_id
  FROM live_tracking_sessions
  WHERE event_id = NEW.id
  AND is_expired = false
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_session_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get the maximum race number from results
  SELECT COALESCE(MAX((result->>'race')::INTEGER), 0) INTO v_max_race
  FROM jsonb_array_elements(NEW.race_results) AS result;

  -- Update tracking data using a direct UPDATE with subquery
  UPDATE session_skipper_tracking sst
  SET 
    current_position = latest_result.position,
    races_completed = v_max_race,
    updated_at = NOW()
  FROM (
    -- For each skipper in the tracking table, find their latest race result
    SELECT DISTINCT ON (si.sail_no)
      si.sail_no,
      (result->>'position')::INTEGER as position,
      (result->>'race')::INTEGER as race_num
    FROM jsonb_array_elements(NEW.race_results) AS result,
         jsonb_array_elements(NEW.skippers) WITH ORDINALITY AS skipper_arr(skipper_data, skipper_idx),
         LATERAL (
           SELECT skipper_data->>'sailNo' as sail_no, (skipper_idx - 1) as skipper_index
         ) si
    WHERE (result->>'skipperIndex')::INTEGER = si.skipper_index
    ORDER BY si.sail_no, (result->>'race')::INTEGER DESC
  ) latest_result
  WHERE sst.session_id = v_session_id
  AND sst.sail_number = latest_result.sail_no;

  RETURN NEW;
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS sync_to_live_tracking ON quick_races;

CREATE TRIGGER sync_to_live_tracking
AFTER UPDATE ON quick_races
FOR EACH ROW
EXECUTE FUNCTION sync_quick_race_to_live_tracking();
