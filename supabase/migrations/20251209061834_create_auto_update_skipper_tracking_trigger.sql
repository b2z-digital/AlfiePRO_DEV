/*
  # Auto-Update Skipper Tracking When Race Results Change
  
  ## Problem
  When race officers enter results, the live tracking dashboard doesn't update because
  there's no mechanism to sync changes from quick_races.race_results to session_skipper_tracking.
  
  ## Solution
  Create a trigger that automatically updates session_skipper_tracking whenever:
  - Race results are added/updated in quick_races
  - Skippers array is modified (position changes, points updates)
  
  This will cause the live tracking dashboard to receive real-time updates via
  Supabase realtime subscriptions.
  
  ## Security
  - Function uses SECURITY DEFINER to bypass RLS (necessary for system updates)
  - Only updates tracking data, doesn't modify race results
  - Updates are based on actual race data, not user input
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
    -- Find this skipper's data in the skippers array
    skipper_idx := NULL;
    skipper_data := NULL;
    
    IF NEW.skippers IS NOT NULL THEN
      -- Search for matching sail number
      FOR skipper_idx IN 0..(jsonb_array_length(NEW.skippers) - 1) LOOP
        skipper_data := NEW.skippers->skipper_idx;
        
        IF (skipper_data->>'sailNo' = session_rec.selected_sail_number OR
            skipper_data->>'sailNumber' = session_rec.selected_sail_number OR
            skipper_data->>'sail_number' = session_rec.selected_sail_number) THEN
          EXIT;
        END IF;
        
        skipper_data := NULL;
      END LOOP;
    END IF;
    
    -- If we found the skipper, update or insert tracking record
    IF skipper_data IS NOT NULL THEN
      -- Extract data from skipper record
      current_position := skipper_idx + 1; -- Position is index + 1
      
      -- Get total points (prefer netPoints, fallback to totalPoints)
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
    END IF;
  END LOOP;
  
  RETURN NEW;
END;
$$;

-- Create trigger on quick_races table
DROP TRIGGER IF EXISTS trigger_sync_live_tracking_on_race_update ON quick_races;
CREATE TRIGGER trigger_sync_live_tracking_on_race_update
  AFTER INSERT OR UPDATE OF race_results, skippers ON quick_races
  FOR EACH ROW
  EXECUTE FUNCTION sync_live_tracking_on_race_update();

-- Add unique constraint on session_skipper_tracking if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'session_skipper_tracking_session_id_key'
  ) THEN
    ALTER TABLE session_skipper_tracking
      ADD CONSTRAINT session_skipper_tracking_session_id_key UNIQUE (session_id);
  END IF;
END $$;