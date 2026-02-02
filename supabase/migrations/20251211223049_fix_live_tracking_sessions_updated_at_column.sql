/*
  # Fix Live Tracking Sessions Column Error

  1. Problem
    - Trigger `sync_quick_race_to_live_tracking` tries to update `updated_at` column
    - But `live_tracking_sessions` table doesn't have `updated_at` column
    - It has `last_active_at` instead

  2. Solution
    - Update trigger to use `last_active_at` instead of `updated_at`
    - This is semantically correct - when event data changes, session is "active"
*/

DROP FUNCTION IF EXISTS sync_quick_race_to_live_tracking() CASCADE;

CREATE OR REPLACE FUNCTION sync_quick_race_to_live_tracking()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_session_id UUID;
  v_skippers_changed BOOLEAN;
  v_results_changed BOOLEAN;
  v_heat_management_changed BOOLEAN;
BEGIN
  -- Check if any critical fields changed
  v_skippers_changed := (OLD.skippers IS DISTINCT FROM NEW.skippers);
  v_results_changed := (OLD.race_results IS DISTINCT FROM NEW.race_results);
  v_heat_management_changed := (OLD.heat_management IS DISTINCT FROM NEW.heat_management);
  
  -- Only proceed if something relevant changed
  IF v_skippers_changed OR v_results_changed OR v_heat_management_changed THEN
    -- Find active session
    SELECT id INTO v_session_id
    FROM live_tracking_sessions
    WHERE event_id = NEW.id
    AND is_expired = false
    LIMIT 1;

    IF v_session_id IS NOT NULL THEN
      -- Update session to trigger realtime update for spectators
      -- USE last_active_at INSTEAD OF updated_at (which doesn't exist)
      UPDATE live_tracking_sessions
      SET last_active_at = NOW()
      WHERE id = v_session_id;

      -- Also touch the skipper tracking to ensure the changes propagate
      UPDATE session_skipper_tracking
      SET updated_at = NOW()
      WHERE session_id = v_session_id;
      
      -- Log what changed for debugging
      RAISE NOTICE 'Live tracking sync triggered - skippers:% results:% heat_mgmt:%', 
        v_skippers_changed, v_results_changed, v_heat_management_changed;
    END IF;
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
