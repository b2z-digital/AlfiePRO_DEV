/*
  # Fix Live Tracking Sync - Use Quick Race ID
  
  1. Changes
    - Update sync function to use NEW.id (quick_race id) directly
    - Match live_tracking_events by event_id = quick_race.id
    - Remove incorrect reference to event_id column that doesn't exist
  
  2. Purpose
    - Fix "record new has no field event_id" error
    - Enable proper matching between quick_races and live tracking
*/

-- Drop and recreate with correct logic
DROP FUNCTION IF EXISTS sync_quick_race_to_live_tracking() CASCADE;

CREATE OR REPLACE FUNCTION sync_quick_race_to_live_tracking()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_tracking_event_id UUID;
  v_session_id UUID;
BEGIN
  -- Debug logging
  RAISE NOTICE '=== QUICK_RACE UPDATE DETECTED ===';
  RAISE NOTICE 'Race ID: %', NEW.id;
  RAISE NOTICE 'Event Name: %', NEW.event_name;
  RAISE NOTICE 'Club ID: %', NEW.club_id;
  RAISE NOTICE 'Skippers changed: %', (OLD.skippers IS DISTINCT FROM NEW.skippers);
  RAISE NOTICE 'Race Results changed: %', (OLD.race_results IS DISTINCT FROM NEW.race_results);
  RAISE NOTICE '=====================================';

  -- Only proceed if race_results actually changed
  IF OLD.race_results IS DISTINCT FROM NEW.race_results THEN
    RAISE NOTICE 'Processing race results update...';
    
    -- Find live tracking event by matching event_id to this quick_race id
    SELECT id INTO v_tracking_event_id
    FROM public.live_tracking_events
    WHERE event_id = NEW.id
    AND club_id = NEW.club_id
    LIMIT 1;

    IF v_tracking_event_id IS NOT NULL THEN
      RAISE NOTICE 'Found tracking event: %', v_tracking_event_id;
      
      -- Find active sessions for this tracking event
      SELECT id INTO v_session_id
      FROM public.live_tracking_sessions
      WHERE event_id = NEW.id
      AND is_expired = false
      ORDER BY created_at DESC
      LIMIT 1;

      IF v_session_id IS NOT NULL THEN
        RAISE NOTICE 'Found active session: %', v_session_id;
        RAISE NOTICE 'Live tracking sync triggered successfully!';
        
        -- The actual update logic is handled by sync_live_tracking_on_race_update trigger
        
      ELSE
        RAISE NOTICE 'No active session found for this tracking event';
      END IF;
    ELSE
      RAISE NOTICE 'No tracking event found for quick_race: %', NEW.id;
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
