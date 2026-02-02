/*
  # Fix Live Tracking - Use Correct Column Name
  
  1. Changes
    - Update sync_quick_race_to_live_tracking to use event_name instead of name
    - Correct column reference for public_events table
  
  2. Purpose
    - Fix "column name does not exist" error
    - Enable proper event name lookup
*/

-- Drop and recreate with correct column name
DROP FUNCTION IF EXISTS sync_quick_race_to_live_tracking() CASCADE;

CREATE OR REPLACE FUNCTION sync_quick_race_to_live_tracking()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_event_name TEXT;
  v_tracking_event_id UUID;
  v_session_id UUID;
BEGIN
  -- Get event name from public_events using CORRECT column: event_name (NOT name)
  SELECT event_name INTO v_event_name
  FROM public.public_events
  WHERE id = NEW.event_id;

  -- Debug logging
  RAISE NOTICE '=== QUICK_RACE UPDATE DETECTED ===';
  RAISE NOTICE 'Race ID: %', NEW.id;
  RAISE NOTICE 'Event ID: %', NEW.event_id;
  RAISE NOTICE 'Event Name: %', COALESCE(v_event_name, 'NOT FOUND');
  RAISE NOTICE 'Skippers changed: %', (OLD.skippers IS DISTINCT FROM NEW.skippers);
  RAISE NOTICE 'Race Results changed: %', (OLD.race_results IS DISTINCT FROM NEW.race_results);
  RAISE NOTICE '=====================================';

  -- Only proceed if race_results actually changed
  IF OLD.race_results IS DISTINCT FROM NEW.race_results THEN
    RAISE NOTICE 'Processing race results update...';
    
    -- Find live tracking event
    SELECT id INTO v_tracking_event_id
    FROM public.live_tracking_events
    WHERE name = v_event_name
    AND club_id = NEW.club_id
    LIMIT 1;

    IF v_tracking_event_id IS NOT NULL THEN
      RAISE NOTICE 'Found tracking event: %', v_tracking_event_id;
      
      -- Find active session
      SELECT id INTO v_session_id
      FROM public.live_tracking_sessions
      WHERE event_id = v_tracking_event_id
      AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 1;

      IF v_session_id IS NOT NULL THEN
        RAISE NOTICE 'Found active session: %', v_session_id;
        RAISE NOTICE 'Updating skipper tracking data...';
        
        -- Update tracking data
        UPDATE public.session_skipper_tracking
        SET 
          current_position = (NEW.race_results->tracking.skipper_id->>'position')::INTEGER,
          updated_at = NOW()
        FROM (
          SELECT 
            jsonb_object_keys(NEW.race_results) AS skipper_id
        ) AS tracking
        WHERE session_skipper_tracking.session_id = v_session_id
        AND session_skipper_tracking.skipper_id = tracking.skipper_id;
        
        RAISE NOTICE 'Update complete!';
      ELSE
        RAISE NOTICE 'No active session found';
      END IF;
    ELSE
      RAISE NOTICE 'No tracking event found';
    END IF;
  ELSE
    RAISE NOTICE 'Race results unchanged, skipping sync';
  END IF;

  RETURN NEW;
END;
$$;

-- Recreate the trigger
DROP TRIGGER IF EXISTS sync_to_live_tracking ON quick_races;

CREATE TRIGGER sync_to_live_tracking
AFTER UPDATE ON quick_races
FOR EACH ROW
EXECUTE FUNCTION sync_quick_race_to_live_tracking();
