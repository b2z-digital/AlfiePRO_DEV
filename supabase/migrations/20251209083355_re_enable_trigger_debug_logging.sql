/*
  # Re-enable Trigger Debug Logging
  
  1. Purpose
    - Add logging back to verify trigger fires from UI updates
    - Help diagnose why auto-updates aren't working
*/

CREATE OR REPLACE FUNCTION sync_live_tracking_on_race_update()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  session_rec RECORD;
  loop_idx INTEGER;
  matched_idx INTEGER;
  skipper_data JSONB;
  latest_result RECORD;
  max_race INTEGER;
BEGIN
  -- Log that trigger fired
  INSERT INTO trigger_debug_log (event_id, message, details)
  VALUES (NEW.id, 'Trigger fired', jsonb_build_object('operation', TG_OP, 'event_name', NEW.event_name, 'timestamp', NOW()));
  
  -- Find all active tracking sessions for this event
  FOR session_rec IN 
    SELECT * FROM live_tracking_sessions
    WHERE event_id = NEW.id
    AND is_expired = false
    AND last_active_at > NOW() - INTERVAL '2 hours'
  LOOP
    INSERT INTO trigger_debug_log (event_id, message, details)
    VALUES (NEW.id, 'Processing session', jsonb_build_object('session_id', session_rec.id, 'sail_number', session_rec.selected_sail_number));
    
    -- Find this skipper in the skippers array by sail number
    matched_idx := NULL;
    skipper_data := NULL;
    
    IF NEW.skippers IS NOT NULL THEN
      FOR loop_idx IN 0..(jsonb_array_length(NEW.skippers) - 1) LOOP
        skipper_data := NEW.skippers->loop_idx;
        
        IF (skipper_data->>'sailNo' = session_rec.selected_sail_number) THEN
          matched_idx := loop_idx;
          INSERT INTO trigger_debug_log (event_id, message, details)
          VALUES (NEW.id, 'Match found', jsonb_build_object('matched_idx', matched_idx, 'sail_number', skipper_data->>'sailNo'));
          EXIT;
        END IF;
        
        skipper_data := NULL;
      END LOOP;
    END IF;
    
    -- Skip if no matching skipper found
    IF matched_idx IS NULL THEN
      INSERT INTO trigger_debug_log (event_id, message, details)
      VALUES (NEW.id, 'No match', jsonb_build_object('sail_number', session_rec.selected_sail_number));
      CONTINUE;
    END IF;
    
    -- Get max race number
    SELECT COALESCE(MAX((result->>'race')::INTEGER), 0) INTO max_race
    FROM jsonb_array_elements(NEW.race_results) AS result;
    
    -- Find latest result for this skipperIndex
    SELECT 
      (result->>'position')::INTEGER as position,
      (result->>'race')::INTEGER as race_num
    INTO latest_result
    FROM jsonb_array_elements(NEW.race_results) AS result
    WHERE (result->>'skipperIndex')::INTEGER = matched_idx
    ORDER BY (result->>'race')::INTEGER DESC
    LIMIT 1;
    
    -- Skip if no results found
    IF latest_result IS NULL THEN
      INSERT INTO trigger_debug_log (event_id, message, details)
      VALUES (NEW.id, 'No results', jsonb_build_object('matched_idx', matched_idx));
      CONTINUE;
    END IF;
    
    INSERT INTO trigger_debug_log (event_id, message, details)
    VALUES (NEW.id, 'Updating', jsonb_build_object('position', latest_result.position, 'races', max_race));
    
    -- Update tracking record
    INSERT INTO session_skipper_tracking (
      session_id,
      event_id,
      skipper_name,
      sail_number,
      current_position,
      total_points,
      races_completed,
      updated_at
    ) VALUES (
      session_rec.id,
      NEW.id,
      session_rec.selected_skipper_name,
      session_rec.selected_sail_number,
      latest_result.position,
      0,
      max_race,
      NOW()
    )
    ON CONFLICT (session_id)
    DO UPDATE SET
      current_position = EXCLUDED.current_position,
      races_completed = EXCLUDED.races_completed,
      updated_at = NOW();
    
    INSERT INTO trigger_debug_log (event_id, message, details)
    VALUES (NEW.id, 'Updated', jsonb_build_object('session_id', session_rec.id));
    
  END LOOP;
  
  RETURN NEW;
  
EXCEPTION WHEN OTHERS THEN
  -- Log errors
  INSERT INTO trigger_debug_log (event_id, message, details)
  VALUES (NEW.id, 'ERROR', jsonb_build_object('error', SQLERRM));
  RETURN NEW;
END;
$$;
