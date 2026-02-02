/*
  # Fix Live Tracking Trigger with Debug Logging
  
  Add RAISE NOTICE statements to debug why the trigger isn't updating records.
*/

CREATE OR REPLACE FUNCTION public.sync_live_tracking_on_race_update()
RETURNS TRIGGER
SET search_path = public
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  session_rec RECORD;
  skipper_data JSONB;
  skipper_idx INTEGER;
  total_points NUMERIC;
  races_completed INTEGER;
  current_position INTEGER;
  sessions_found INTEGER := 0;
BEGIN
  -- Only process if race_results or skippers changed
  IF TG_OP = 'UPDATE' AND 
     (OLD.race_results IS NOT DISTINCT FROM NEW.race_results) AND
     (OLD.skippers IS NOT DISTINCT FROM NEW.skippers) THEN
    RAISE NOTICE 'TRIGGER: No changes detected, skipping';
    RETURN NEW;
  END IF;
  
  RAISE NOTICE 'TRIGGER FIRED: Processing quick_race id=%', NEW.id;
  
  -- Find all active tracking sessions for this event
  FOR session_rec IN 
    SELECT * FROM public.live_tracking_sessions
    WHERE event_id = NEW.id
      AND is_expired = false
      AND last_active_at > NOW() - INTERVAL '2 hours'
  LOOP
    sessions_found := sessions_found + 1;
    RAISE NOTICE 'Found session: id=% sail=%', session_rec.id, session_rec.selected_sail_number;
    
    -- Find this skipper's data in the skippers array
    skipper_idx := NULL;
    skipper_data := NULL;
    
    IF NEW.skippers IS NOT NULL THEN
      RAISE NOTICE 'Searching % skippers', jsonb_array_length(NEW.skippers);
      
      -- Search for matching sail number
      FOR skipper_idx IN 0..(jsonb_array_length(NEW.skippers) - 1) LOOP
        skipper_data := NEW.skippers->skipper_idx;
        
        RAISE NOTICE 'Checking skipper %: sailNo=% sailNumber=% sail_number=%', 
          skipper_idx,
          skipper_data->>'sailNo',
          skipper_data->>'sailNumber', 
          skipper_data->>'sail_number';
        
        IF (skipper_data->>'sailNo' = session_rec.selected_sail_number OR
            skipper_data->>'sailNumber' = session_rec.selected_sail_number OR
            skipper_data->>'sail_number' = session_rec.selected_sail_number) THEN
          RAISE NOTICE 'MATCH FOUND at index %', skipper_idx;
          EXIT;
        END IF;
        
        skipper_data := NULL;
      END LOOP;
    END IF;
    
    -- If we found the skipper, update or insert tracking record
    IF skipper_data IS NOT NULL THEN
      -- Extract data from skipper record
      current_position := skipper_idx + 1;
      
      -- Get total points
      total_points := COALESCE(
        (skipper_data->>'netPoints')::numeric,
        (skipper_data->>'totalPoints')::numeric,
        (skipper_data->>'total_points')::numeric,
        0
      );
      
      -- Count completed races
      races_completed := 0;
      IF skipper_data->'results' IS NOT NULL THEN
        races_completed := (
          SELECT COUNT(*)
          FROM jsonb_array_elements(skipper_data->'results') AS r
          WHERE r->>'position' IS NOT NULL OR r->>'letterScore' IS NOT NULL
        );
      END IF;
      
      RAISE NOTICE 'Updating tracking: pos=% points=% races=%', current_position, total_points, races_completed;
      
      -- Update or insert tracking record
      INSERT INTO public.session_skipper_tracking (
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
        
      RAISE NOTICE 'Tracking record updated successfully';
    ELSE
      RAISE NOTICE 'No matching skipper found for sail: %', session_rec.selected_sail_number;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'TRIGGER COMPLETE: Processed % sessions', sessions_found;
  
  RETURN NEW;
END;
$$;