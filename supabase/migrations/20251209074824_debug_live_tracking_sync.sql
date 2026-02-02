/*
  # Debug Live Tracking Sync
  
  1. Changes
    - Add RAISE NOTICE statements to debug the sync function
    - Track what data is being processed
    - Identify where the logic fails
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
  v_skipper_record RECORD;
  v_race_result RECORD;
  v_max_race INTEGER;
  v_updated_count INTEGER := 0;
BEGIN
  RAISE NOTICE '=== SYNC TRIGGERED ===';
  RAISE NOTICE 'Race ID: %', NEW.id;
  
  -- Only proceed if race_results actually changed
  IF OLD.race_results IS NOT DISTINCT FROM NEW.race_results THEN
    RAISE NOTICE 'Race results unchanged, exiting';
    RETURN NEW;
  END IF;

  RAISE NOTICE 'Race results changed, proceeding...';

  -- Find active session for this race
  SELECT id INTO v_session_id
  FROM live_tracking_sessions
  WHERE event_id = NEW.id
  AND is_expired = false
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_session_id IS NULL THEN
    RAISE NOTICE 'No active session found, exiting';
    RETURN NEW;
  END IF;

  RAISE NOTICE 'Active session found: %', v_session_id;

  -- Get the maximum race number from results
  SELECT COALESCE(MAX((result->>'race')::INTEGER), 0) INTO v_max_race
  FROM jsonb_array_elements(NEW.race_results) AS result;

  RAISE NOTICE 'Max race number: %', v_max_race;

  -- Update each skipper's tracking data
  FOR v_skipper_record IN 
    SELECT 
      sst.id as tracking_id,
      sst.sail_number,
      sst.skipper_name
    FROM session_skipper_tracking sst
    WHERE sst.session_id = v_session_id
  LOOP
    RAISE NOTICE 'Processing skipper: % (sail #%)', v_skipper_record.skipper_name, v_skipper_record.sail_number;
    
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
      RAISE NOTICE 'Found result: position=%, race=%', v_race_result.position, v_race_result.race_num;
      
      UPDATE session_skipper_tracking
      SET 
        current_position = v_race_result.position,
        races_completed = v_max_race,
        updated_at = NOW()
      WHERE id = v_skipper_record.tracking_id;
      
      GET DIAGNOSTICS v_updated_count = ROW_COUNT;
      RAISE NOTICE 'Updated % rows', v_updated_count;
    ELSE
      RAISE NOTICE 'No result found for this skipper';
    END IF;
  END LOOP;

  RAISE NOTICE '=== SYNC COMPLETE ===';
  RETURN NEW;
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS sync_to_live_tracking ON quick_races;

CREATE TRIGGER sync_to_live_tracking
AFTER UPDATE ON quick_races
FOR EACH ROW
EXECUTE FUNCTION sync_quick_race_to_live_tracking();
