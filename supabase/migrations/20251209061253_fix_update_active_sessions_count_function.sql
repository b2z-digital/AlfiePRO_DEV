/*
  # Fix update_active_sessions_count() Trigger Function
  
  ## Problem
  The trigger function fails with "relation live_tracking_events does not exist"
  because it's missing schema qualification.
  
  ## Solution
  Add SET search_path = public to ensure all table references resolve correctly.
  
  ## Security
  - Function uses SECURITY DEFINER to bypass RLS (as intended for system counters)
  - Only updates statistics counters, doesn't expose sensitive data
*/

CREATE OR REPLACE FUNCTION public.update_active_sessions_count()
RETURNS TRIGGER
SET search_path = public
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE public.live_tracking_events
    SET 
      active_sessions_count = (
        SELECT COUNT(*) 
        FROM public.live_tracking_sessions 
        WHERE event_id = NEW.event_id 
        AND last_active_at > NOW() - INTERVAL '1 hour'
        AND is_expired = false
      ),
      total_sessions_created = total_sessions_created + CASE WHEN TG_OP = 'INSERT' THEN 1 ELSE 0 END
    WHERE event_id = NEW.event_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS trigger_update_active_sessions_count ON live_tracking_sessions;
CREATE TRIGGER trigger_update_active_sessions_count
  AFTER INSERT OR UPDATE ON live_tracking_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_active_sessions_count();