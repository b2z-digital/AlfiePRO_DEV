/*
  # Fix Existing Live Tracking Trigger for Updates
  
  1. Changes
    - Drop the duplicate trigger we created
    - Modify existing trigger to fire on BOTH INSERT and UPDATE
    - This will use the existing sync_live_tracking_on_race_update function
  
  2. Purpose
    - Enable live tracking sync when race results are updated
    - Reuse the existing working function
*/

-- Drop our duplicate trigger
DROP TRIGGER IF EXISTS sync_to_live_tracking ON quick_races;

-- Drop the old trigger
DROP TRIGGER IF EXISTS trigger_sync_live_tracking_on_race_update ON quick_races;

-- Recreate it to fire on INSERT or UPDATE
CREATE TRIGGER trigger_sync_live_tracking_on_race_update
AFTER INSERT OR UPDATE ON quick_races
FOR EACH ROW
EXECUTE FUNCTION sync_live_tracking_on_race_update();
