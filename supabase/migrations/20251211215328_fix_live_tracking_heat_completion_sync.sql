/*
  # Fix Live Tracking to Update on Heat Completion

  1. Changes
    - Update the sync trigger to fire when heat_management changes (not just race_results)
    - Specifically detect when currentRound changes or heats are marked complete
    - This ensures live tracking updates immediately when a heat is completed

  2. Details
    - The trigger now checks BOTH race_results AND heat_management for changes
    - When heat_management changes, update the live tracking session
    - This allows spectators to see next heat assignments immediately after completion
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
  v_heat_management_changed BOOLEAN;
BEGIN
  -- Check if either race_results OR heat_management changed
  v_heat_management_changed := (OLD.heat_management IS DISTINCT FROM NEW.heat_management);
  
  IF (OLD.race_results IS DISTINCT FROM NEW.race_results) OR v_heat_management_changed THEN
    -- Find active session
    SELECT id INTO v_session_id
    FROM live_tracking_sessions
    WHERE event_id = NEW.id
    AND is_expired = false
    LIMIT 1;

    IF v_session_id IS NOT NULL THEN
      -- Update session to trigger realtime update for spectators
      -- This notifies spectators that data has changed
      UPDATE live_tracking_sessions
      SET updated_at = NOW()
      WHERE id = v_session_id;

      -- Also touch the skipper tracking to ensure the changes propagate
      UPDATE session_skipper_tracking
      SET updated_at = NOW()
      WHERE session_id = v_session_id;
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