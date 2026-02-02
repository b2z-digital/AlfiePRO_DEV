/*
  # Fix Live Tracking Session Expiry Trigger
  
  ## Problem
  The `set_session_expiry()` trigger function was referencing a non-existent `date` column
  in the `quick_races` table, causing session creation to fail with error:
  "column 'date' does not exist"
  
  ## Solution
  Update the trigger function to use the correct column name `race_date` instead of `date`.
  The function sets the session expiry to 24 hours after the race date.
  
  ## Changes
  1. Replace the trigger function to use `race_date` column
  2. Handle potential NULL race_date values
  3. Set a default expiry of 7 days if race_date is not set
*/

-- Replace the trigger function with corrected column name
CREATE OR REPLACE FUNCTION set_session_expiry()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.expires_at IS NULL THEN
    -- Get race_date from quick_races and add 24 hours
    -- race_date is stored as TEXT, so we need to cast it to date
    NEW.expires_at := (
      SELECT 
        CASE 
          WHEN race_date IS NOT NULL AND race_date != '' THEN
            (race_date::date + INTERVAL '24 hours')
          ELSE
            NOW() + INTERVAL '7 days'
        END
      FROM quick_races
      WHERE id = NEW.event_id
    );
    
    -- Fallback if event not found or no date set
    IF NEW.expires_at IS NULL THEN
      NEW.expires_at := NOW() + INTERVAL '7 days';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
