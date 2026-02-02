/*
  # Add Comprehensive Logging to Sync Trigger
  
  1. Changes
    - Add RAISE NOTICE at every step
    - Log all variable values
    - Catch and log any errors
    - This will help us debug why the trigger isn't updating the position
*/

CREATE OR REPLACE FUNCTION sync_live_tracking_on_race_update()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  session_rec RECORD;
  skipper_idx INTEGER;
  skipper_data JSONB;
  latest_result RECORD;
  max_race INTEGER;
  v_updated_rows INTEGER;
BEGIN
  RAISE NOTICE '========== LIVE TRACKING SYNC TRIGGER FIRED ==========';
  RAISE NOTICE 'Event ID: %', NEW.id;
  RAISE NOTICE 'Event Name: %', NEW.event_name;
  RAISE NOTICE 'Operation: %', TG_OP;
  
  -- Find all active tracking sessions for this event
  FOR session_rec IN 
    SELECT * FROM live_tracking_sessions
    WHERE event_id = NEW.id
    AND is_expired = false
    AND last_active_at > NOW() - INTERVAL '2 hours'
  LOOP
    RAISE NOTICE '--- Processing Session: % ---', session_rec.id;
    RAISE NOTICE 'Looking for sail number: %', session_rec.selected_sail_number;
    RAISE NOTICE 'Skipper name: %', session_rec.selected_skipper_name;
    
    -- Find this skipper in the skippers array by sail number
    skipper_idx := NULL;
    skipper_data := NULL;
    
    IF NEW.skippers IS NOT NULL THEN
      RAISE NOTICE 'Searching through % skippers', jsonb_array_length(NEW.skippers);
      
      FOR skipper_idx IN 0..(jsonb_array_length(NEW.skippers) - 1) LOOP
        skipper_data := NEW.skippers->skipper_idx;
        
        RAISE NOTICE 'Checking skipper %: sailNo=%', skipper_idx, skipper_data->>'sailNo';
        
        IF (skipper_data->>'sailNo' = session_rec.selected_sail_number) THEN
          RAISE NOTICE 'MATCH FOUND at skipperIndex %!', skipper_idx;
          EXIT;
        END IF;
        
        skipper_data := NULL;
      END LOOP;
    ELSE
      RAISE NOTICE 'No skippers array found';
    END IF;
    
    IF skipper_data IS NULL THEN
      RAISE NOTICE 'No matching skipper found for sail number %', session_rec.selected_sail_number;
      CONTINUE;
    END IF;
    
    -- Get max race number
    SELECT COALESCE(MAX((result->>'race')::INTEGER), 0) INTO max_race
    FROM jsonb_array_elements(NEW.race_results) AS result;
    
    RAISE NOTICE 'Max race number: %', max_race;
    
    -- Find latest result for this skipperIndex
    SELECT 
      (result->>'position')::INTEGER as position,
      (result->>'race')::INTEGER as race_num
    INTO latest_result
    FROM jsonb_array_elements(NEW.race_results) AS result
    WHERE (result->>'skipperIndex')::INTEGER = skipper_idx
    ORDER BY (result->>'race')::INTEGER DESC
    LIMIT 1;
    
    IF latest_result IS NULL THEN
      RAISE NOTICE 'No race results found for skipperIndex %', skipper_idx;
      CONTINUE;
    END IF;
    
    RAISE NOTICE 'Latest result - Position: %, Race: %', latest_result.position, latest_result.race_num;
    
    -- Update tracking record
    RAISE NOTICE 'Attempting to INSERT/UPDATE session_skipper_tracking...';
    
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
    
    GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
    RAISE NOTICE 'INSERT/UPDATE affected % rows', v_updated_rows;
    RAISE NOTICE 'Updated: position=%, races=%', latest_result.position, max_race;
    
  END LOOP;
  
  RAISE NOTICE '========== SYNC TRIGGER COMPLETE ==========';
  RETURN NEW;
  
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'ERROR in sync_live_tracking_on_race_update: %', SQLERRM;
  RETURN NEW;
END;
$$;
