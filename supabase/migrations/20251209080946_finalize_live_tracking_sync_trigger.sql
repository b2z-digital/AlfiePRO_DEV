/*
  # Finalize Live Tracking Sync Trigger
  
  1. Changes
    - Remove debug logging for production
    - Keep the fixed skipper index logic
    - Clean and efficient version
  
  2. How it works
    - Trigger fires on any UPDATE to quick_races
    - Finds active tracking sessions for the event
    - Matches skippers by sail number
    - Updates their current position and races completed
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
  -- Find all active tracking sessions for this event
  FOR session_rec IN 
    SELECT * FROM live_tracking_sessions
    WHERE event_id = NEW.id
    AND is_expired = false
    AND last_active_at > NOW() - INTERVAL '2 hours'
  LOOP
    -- Find this skipper in the skippers array by sail number
    matched_idx := NULL;
    skipper_data := NULL;
    
    IF NEW.skippers IS NOT NULL THEN
      FOR loop_idx IN 0..(jsonb_array_length(NEW.skippers) - 1) LOOP
        skipper_data := NEW.skippers->loop_idx;
        
        IF (skipper_data->>'sailNo' = session_rec.selected_sail_number) THEN
          matched_idx := loop_idx;
          EXIT;
        END IF;
        
        skipper_data := NULL;
      END LOOP;
    END IF;
    
    -- Skip if no matching skipper found
    IF matched_idx IS NULL THEN
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
      CONTINUE;
    END IF;
    
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
    
  END LOOP;
  
  RETURN NEW;
  
EXCEPTION WHEN OTHERS THEN
  -- Silently catch errors to avoid breaking race updates
  RETURN NEW;
END;
$$;

-- Drop the debug table (optional - keep if you want to debug later)
-- DROP TABLE IF EXISTS trigger_debug_log;
