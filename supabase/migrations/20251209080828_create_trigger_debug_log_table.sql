/*
  # Create Trigger Debug Log Table
  
  1. New Tables
    - `trigger_debug_log` - Logs trigger execution for debugging
  
  2. Purpose
    - Track when the trigger fires
    - Log any errors or issues
    - Verify trigger execution path
*/

-- Create debug log table
CREATE TABLE IF NOT EXISTS trigger_debug_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text,
  message text,
  details jsonb,
  created_at timestamptz DEFAULT now()
);

-- Allow trigger to write to this table
ALTER TABLE trigger_debug_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow trigger writes"
  ON trigger_debug_log
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow authenticated reads"
  ON trigger_debug_log
  FOR SELECT
  TO authenticated
  USING (true);

-- Update the sync function to log execution
CREATE OR REPLACE FUNCTION sync_live_tracking_on_race_update()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  session_rec RECORD;
  skipper_idx INTEGER;
  skipper_data JSONB;
  latest_result RECORD;
  max_race INTEGER;
  v_updated_rows INTEGER;
  v_error_message TEXT;
BEGIN
  -- Log that trigger fired
  INSERT INTO trigger_debug_log (event_id, message, details)
  VALUES (NEW.id, 'Trigger fired', jsonb_build_object('operation', TG_OP, 'event_name', NEW.event_name));
  
  -- Find all active tracking sessions for this event
  FOR session_rec IN 
    SELECT * FROM live_tracking_sessions
    WHERE event_id = NEW.id
    AND is_expired = false
    AND last_active_at > NOW() - INTERVAL '2 hours'
  LOOP
    INSERT INTO trigger_debug_log (event_id, message, details)
    VALUES (NEW.id, 'Processing session', jsonb_build_object('session_id', session_rec.id, 'sail_number', session_rec.selected_sail_number));
    
    -- Find this skipper in the skippers array by sail number
    skipper_idx := NULL;
    skipper_data := NULL;
    
    IF NEW.skippers IS NOT NULL THEN
      FOR skipper_idx IN 0..(jsonb_array_length(NEW.skippers) - 1) LOOP
        skipper_data := NEW.skippers->skipper_idx;
        
        IF (skipper_data->>'sailNo' = session_rec.selected_sail_number) THEN
          INSERT INTO trigger_debug_log (event_id, message, details)
          VALUES (NEW.id, 'Match found', jsonb_build_object('skipper_idx', skipper_idx, 'sail_number', skipper_data->>'sailNo'));
          EXIT;
        END IF;
        
        skipper_data := NULL;
      END LOOP;
    END IF;
    
    IF skipper_data IS NULL THEN
      INSERT INTO trigger_debug_log (event_id, message, details)
      VALUES (NEW.id, 'No matching skipper', jsonb_build_object('sail_number', session_rec.selected_sail_number));
      CONTINUE;
    END IF;
    
    -- Get max race number
    SELECT COALESCE(MAX((result->>'race')::INTEGER), 0) INTO max_race
    FROM jsonb_array_elements(NEW.race_results) AS result;
    
    -- Find latest result for this skipperIndex
    SELECT 
      (result->>'position')::INTEGER as position,
      (result->>'race')::INTEGER as race_num
    INTO latest_result
    FROM jsonb_array_elements(NEW.race_results) AS result
    WHERE (result->>'skipperIndex')::INTEGER = skipper_idx
    ORDER BY (result->>'race')::INTEGER DESC
    LIMIT 1;
    
    IF latest_result IS NULL THEN
      INSERT INTO trigger_debug_log (event_id, message, details)
      VALUES (NEW.id, 'No race results', jsonb_build_object('skipper_idx', skipper_idx));
      CONTINUE;
    END IF;
    
    INSERT INTO trigger_debug_log (event_id, message, details)
    VALUES (NEW.id, 'Updating tracking', jsonb_build_object('position', latest_result.position, 'races', max_race));
    
    -- Update tracking record
    INSERT INTO session_skipper_tracking (
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
      latest_result.position,
      0,
      max_race,
      NOW()
    )
    ON CONFLICT (session_id)
    DO UPDATE SET
      current_position = EXCLUDED.current_position,
      races_completed = EXCLUDED.races_completed,
      updated_at = NOW();
    
    GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
    
    INSERT INTO trigger_debug_log (event_id, message, details)
    VALUES (NEW.id, 'Update complete', jsonb_build_object('rows_affected', v_updated_rows));
    
  END LOOP;
  
  RETURN NEW;
  
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_error_message = MESSAGE_TEXT;
  INSERT INTO trigger_debug_log (event_id, message, details)
  VALUES (NEW.id, 'ERROR', jsonb_build_object('error', v_error_message));
  RETURN NEW;
END;
$$;
