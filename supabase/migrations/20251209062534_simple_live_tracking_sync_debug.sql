/*
  # Simplified Live Tracking Sync for Debugging
  
  Create a much simpler version that logs what it's doing and handles errors gracefully.
*/

CREATE OR REPLACE FUNCTION public.sync_live_tracking_on_race_update()
RETURNS TRIGGER
SET search_path = public
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  session_rec RECORD;
  skipper_idx INTEGER;
  i INTEGER;
  total_points NUMERIC := 0;
  races_completed INTEGER := 0;
  current_position INTEGER := 1;
BEGIN
  -- Log that trigger fired
  RAISE NOTICE 'Trigger fired for event %', NEW.id;
  
  -- Find all active tracking sessions for this event
  FOR session_rec IN 
    SELECT * FROM live_tracking_sessions
    WHERE event_id = NEW.id
      AND is_expired = false
      AND last_active_at > NOW() - INTERVAL '2 hours'
  LOOP
    RAISE NOTICE 'Found session % for skipper %', session_rec.id, session_rec.selected_sail_number;
    
    -- Find skipper index by matching sail number
    skipper_idx := NULL;
    
    IF NEW.skippers IS NOT NULL THEN
      FOR i IN 0..(jsonb_array_length(NEW.skippers) - 1) LOOP
        IF (NEW.skippers->i->>'sailNo' = session_rec.selected_sail_number) THEN
          skipper_idx := i;
          RAISE NOTICE 'Found skipper at index %', i;
          EXIT;
        END IF;
      END LOOP;
    END IF;
    
    IF skipper_idx IS NULL THEN
      RAISE NOTICE 'Skipper % not found in skippers array', session_rec.selected_sail_number;
      CONTINUE;
    END IF;
    
    -- Calculate stats from race_results
    IF NEW.race_results IS NOT NULL THEN
      -- Count races and sum points
      FOR i IN 0..(jsonb_array_length(NEW.race_results) - 1) LOOP
        IF (NEW.race_results->i->>'skipperIndex')::integer = skipper_idx THEN
          races_completed := races_completed + 1;
          total_points := total_points + (NEW.race_results->i->>'position')::numeric;
        END IF;
      END LOOP;
      
      RAISE NOTICE 'Calculated: % races, % points', races_completed, total_points;
    END IF;
    
    -- Insert or update tracking record
    BEGIN
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
        current_position,
        total_points,
        races_completed,
        NOW()
      )
      ON CONFLICT (session_id)
      DO UPDATE SET
        current_position = EXCLUDED.current_position,
        total_points = EXCLUDED.total_points,
        races_completed = EXCLUDED.races_completed,
        updated_at = NOW();
        
      RAISE NOTICE 'Successfully updated tracking for session %', session_rec.id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Error updating tracking: %', SQLERRM;
    END;
  END LOOP;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Trigger function error: %', SQLERRM;
  RETURN NEW;
END;
$$;