/*
  # Fix set_session_expiry() Trigger Function
  
  ## Problem
  The trigger function fails with "relation quick_races does not exist" because:
  1. Missing schema qualification (should be public.quick_races)
  2. Uses wrong column name (date instead of race_date)  
  3. Doesn't handle events from other tables (public_events, race_series)
  
  ## Solution
  Rewrite the function to:
  1. Add proper schema qualification with SET search_path = public
  2. Use correct column name (race_date)
  3. Try multiple event sources (quick_races, public_events, race_series)
  4. Fall back to a sensible default if event not found
  
  ## Security
  - Function runs with caller's permissions (not SECURITY DEFINER)
  - Only queries event tables, doesn't modify them
*/

CREATE OR REPLACE FUNCTION public.set_session_expiry()
RETURNS TRIGGER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  event_date date;
BEGIN
  -- Only set expiry if not already set
  IF NEW.expires_at IS NULL THEN
    -- Try to find the event date from different sources
    
    -- Try quick_races first
    SELECT race_date::date INTO event_date
    FROM public.quick_races
    WHERE id = NEW.event_id;
    
    -- If not found, try public_events
    IF event_date IS NULL THEN
      SELECT date::date INTO event_date
      FROM public.public_events
      WHERE id = NEW.event_id;
    END IF;
    
    -- If not found, try race_series
    IF event_date IS NULL THEN
      SELECT (rounds->0->>'date')::date INTO event_date
      FROM public.race_series
      WHERE id = NEW.event_id
      AND jsonb_array_length(rounds) > 0;
    END IF;
    
    -- Set expiry based on event date or default to 7 days
    IF event_date IS NOT NULL THEN
      NEW.expires_at := event_date + INTERVAL '24 hours';
    ELSE
      NEW.expires_at := NOW() + INTERVAL '7 days';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS trigger_set_session_expiry ON live_tracking_sessions;
CREATE TRIGGER trigger_set_session_expiry
  BEFORE INSERT ON live_tracking_sessions
  FOR EACH ROW
  EXECUTE FUNCTION set_session_expiry();