/*
  # Add Logging to ALL Quick Races Updates
  
  Create a trigger that logs every single UPDATE to quick_races,
  regardless of which columns change.
*/

CREATE OR REPLACE FUNCTION public.log_all_quick_race_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE NOTICE '=== QUICK_RACE UPDATE DETECTED ===';
  RAISE NOTICE 'Race ID: %', NEW.id;
  RAISE NOTICE 'Event Name: %', NEW.event_name;
  RAISE NOTICE 'Skippers changed: %', (OLD.skippers IS DISTINCT FROM NEW.skippers);
  RAISE NOTICE 'Race Results changed: %', (OLD.race_results IS DISTINCT FROM NEW.race_results);
  RAISE NOTICE 'Day Results changed: %', (OLD.day_results IS DISTINCT FROM NEW.day_results);
  RAISE NOTICE '=====================================';
  RETURN NEW;
END;
$$;

-- Drop if exists
DROP TRIGGER IF EXISTS trigger_log_all_updates ON public.quick_races;

-- Create trigger that fires on ANY update
CREATE TRIGGER trigger_log_all_updates
  AFTER UPDATE ON public.quick_races
  FOR EACH ROW
  EXECUTE FUNCTION log_all_quick_race_updates();