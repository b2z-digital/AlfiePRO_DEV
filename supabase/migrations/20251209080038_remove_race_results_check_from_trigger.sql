/*
  # Remove Race Results Check from Trigger
  
  1. Changes
    - Remove the OLD vs NEW race_results comparison
    - Always process the sync when trigger fires
    - This ensures updates are processed even if race_results looks identical
  
  2. Reason
    - The comparison might be preventing legitimate updates
    - Better to sync every time and let the UPDATE handle idempotency
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
BEGIN
  -- Always process - no early exit
  
  -- Find all active tracking sessions for this event
  FOR session_rec IN 
    SELECT * FROM live_tracking_sessions
    WHERE event_id = NEW.id
    AND is_expired = false
    AND last_active_at > NOW() - INTERVAL '2 hours'
  LOOP
    -- Find this skipper in the skippers array by sail number
    skipper_idx := NULL;
    skipper_data := NULL;
    
    IF NEW.skippers IS NOT NULL THEN
      FOR skipper_idx IN 0..(jsonb_array_length(NEW.skippers) - 1) LOOP
        skipper_data := NEW.skippers->skipper_idx;
        
        IF (skipper_data->>'sailNo' = session_rec.selected_sail_number) THEN
          -- Found the skipper!
          EXIT;
        END IF;
        
        skipper_data := NULL;
      END LOOP;
    END IF;
    
    -- If we found the skipper, get their latest race result
    IF skipper_data IS NOT NULL THEN
      -- Get max race number
      SELECT COALESCE(MAX((result->>'race')::INTEGER), 0) INTO max_race
      FROM jsonb_array_elements(NEW.race_results) AS result;
      
      -- Find latest result for this skipperIndex
      SELECT 
        (result->>'position')::INTEGER as position,
        (result->>'race')::INTEGER as race_num
      INTO latest_result
      FROM jsonb_array_elements(NEW.race_results) AS result
      WHERE (result->>'skipperIndex')::INTEGER = skipper_idx
      ORDER BY (result->>'race')::INTEGER DESC
      LIMIT 1;
      
      -- Update tracking record
      IF latest_result IS NOT NULL THEN
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
      END IF;
    END IF;
  END LOOP;
  
  RETURN NEW;
END;
$$;
