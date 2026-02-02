/*
  # Create Working Live Tracking Sync v2
  
  1. Changes
    - Drop existing broken sync function
    - Create new function that properly syncs race results to live tracking
    - Matches skippers by sail number between race_results and tracking table
    - Updates current_position, races_completed, and timestamp
  
  2. Logic
    - Iterate through race_results array
    - For each result, find skipper in skippers array by skipperIndex
    - Match that skipper's sail number to session_skipper_tracking
    - Update their latest position and race count
*/

-- Drop existing function
DROP FUNCTION IF EXISTS sync_quick_race_to_live_tracking() CASCADE;

CREATE OR REPLACE FUNCTION sync_quick_race_to_live_tracking()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_session_id UUID;
  v_skipper_record RECORD;
  v_race_result RECORD;
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

  -- Update each skipper's tracking data
  FOR v_skipper_record IN 
    SELECT 
      sst.id as tracking_id,
      sst.sail_number,
      sst.skipper_name
    FROM session_skipper_tracking sst
    WHERE sst.session_id = v_session_id
  LOOP
    -- Find this skipper's latest race result by matching sail number
    WITH skipper_indices AS (
      SELECT 
        (skipper_idx - 1) as skipper_index,
        skipper_data->>'sailNo' as sail_no
      FROM jsonb_array_elements(NEW.skippers) WITH ORDINALITY AS skipper_arr(skipper_data, skipper_idx)
    )
    SELECT 
      (result->>'position')::INTEGER as position,
      (result->>'race')::INTEGER as race_num
    INTO v_race_result
    FROM jsonb_array_elements(NEW.race_results) AS result
    JOIN skipper_indices si ON (result->>'skipperIndex')::INTEGER = si.skipper_index
    WHERE si.sail_no = v_skipper_record.sail_number
    ORDER BY (result->>'race')::INTEGER DESC
    LIMIT 1;

    -- Update tracking data if we found a result
    IF v_race_result IS NOT NULL THEN
      UPDATE session_skipper_tracking
      SET 
        current_position = v_race_result.position,
        races_completed = v_max_race,
        updated_at = NOW()
      WHERE id = v_skipper_record.tracking_id;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS sync_to_live_tracking ON quick_races;

CREATE TRIGGER sync_to_live_tracking
AFTER UPDATE ON quick_races
FOR EACH ROW
EXECUTE FUNCTION sync_quick_race_to_live_tracking();
