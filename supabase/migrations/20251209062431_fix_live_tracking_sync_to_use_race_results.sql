/*
  # Fix Live Tracking Sync to Use race_results Array
  
  ## Problem
  The trigger was looking for race data embedded in the skippers array, but
  the actual data structure stores:
  - Skippers in the `skippers` JSONB array
  - Race results in a separate `race_results` JSONB array with skipperIndex references
  
  ## Solution
  Rewrite the trigger to:
  1. Read from the race_results array
  2. Calculate standings from race_results by counting positions
  3. Match skippers by their array index
  4. Calculate total points based on position (lower position = fewer points)
  
  ## Security
  - Function uses SECURITY DEFINER to bypass RLS
  - Only updates tracking data, doesn't modify race data
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
  current_standings JSONB[];
  skipper_points NUMERIC[];
  result_rec JSONB;
  position INTEGER;
  i INTEGER;
BEGIN
  -- Only process if race_results or skippers changed
  IF TG_OP = 'UPDATE' AND 
     (OLD.race_results IS NOT DISTINCT FROM NEW.race_results) AND
     (OLD.skippers IS NOT DISTINCT FROM NEW.skippers) THEN
    RETURN NEW;
  END IF;
  
  -- Find all active tracking sessions for this event
  FOR session_rec IN 
    SELECT * FROM public.live_tracking_sessions
    WHERE event_id = NEW.id
      AND is_expired = false
      AND last_active_at > NOW() - INTERVAL '2 hours'
  LOOP
    -- Find this skipper's index in the skippers array by matching sail number
    skipper_idx := NULL;
    
    IF NEW.skippers IS NOT NULL THEN
      FOR i IN 0..(jsonb_array_length(NEW.skippers) - 1) LOOP
        skipper_data := NEW.skippers->i;
        
        IF (skipper_data->>'sailNo' = session_rec.selected_sail_number) THEN
          skipper_idx := i;
          EXIT;
        END IF;
      END LOOP;
    END IF;
    
    -- If we found the skipper, calculate their stats from race_results
    IF skipper_idx IS NOT NULL AND NEW.race_results IS NOT NULL THEN
      -- Initialize points array for all skippers
      skipper_points := ARRAY_FILL(0::numeric, ARRAY[jsonb_array_length(NEW.skippers)]);
      
      -- Calculate total points for each skipper from race results
      FOR i IN 0..(jsonb_array_length(NEW.race_results) - 1) LOOP
        result_rec := NEW.race_results->i;
        
        -- Get the skipper index and position from this result
        DECLARE
          result_skipper_idx INTEGER;
          result_position INTEGER;
        BEGIN
          result_skipper_idx := (result_rec->>'skipperIndex')::integer;
          result_position := (result_rec->>'position')::integer;
          
          -- Add points (position value = points, so 1st place = 1 point)
          IF result_skipper_idx IS NOT NULL AND result_position IS NOT NULL THEN
            skipper_points[result_skipper_idx + 1] := 
              skipper_points[result_skipper_idx + 1] + result_position;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          -- Skip invalid results
          NULL;
        END;
      END LOOP;
      
      -- Get this skipper's total points
      total_points := skipper_points[skipper_idx + 1];
      
      -- Count how many races this skipper completed
      SELECT COUNT(*) INTO races_completed
      FROM jsonb_array_elements(NEW.race_results) AS r
      WHERE (r->>'skipperIndex')::integer = skipper_idx
        AND r->>'position' IS NOT NULL;
      
      -- Calculate current overall position by counting skippers with fewer points
      DECLARE
        better_count INTEGER := 0;
      BEGIN
        FOR i IN 1..array_length(skipper_points, 1) LOOP
          IF skipper_points[i] < total_points THEN
            better_count := better_count + 1;
          END IF;
        END LOOP;
        
        position := better_count + 1;
      END;
      
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
        position,
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
    END IF;
  END LOOP;
  
  RETURN NEW;
END;
$$;