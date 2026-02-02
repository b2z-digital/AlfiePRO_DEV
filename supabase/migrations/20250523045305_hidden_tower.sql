/*
  # Improve race series data validation
  
  1. Changes
    - Add validation for round results structure
    - Add trigger function to validate results
    - Add trigger for insert/update validation
    
  2. Notes
    - Uses trigger-based validation instead of check constraints
    - Ensures proper JSON structure for rounds and results
    - Validates skipper indices and positions/letter scores
*/

-- Create function to validate round results structure
CREATE OR REPLACE FUNCTION validate_round_results_structure(rounds jsonb)
RETURNS boolean AS $$
DECLARE
  round_element jsonb;
  result_element jsonb;
BEGIN
  -- Check if rounds is an array
  IF jsonb_typeof(rounds) != 'array' THEN
    RETURN false;
  END IF;

  -- Check each round
  FOR round_element IN SELECT * FROM jsonb_array_elements(rounds) LOOP
    -- Validate required round fields
    IF NOT (
      round_element ? 'name' AND
      round_element ? 'date' AND
      round_element ? 'venue' AND
      round_element ? 'results'
    ) THEN
      RETURN false;
    END IF;

    -- Check if results is an array
    IF jsonb_typeof(round_element->'results') != 'array' THEN
      RETURN false;
    END IF;

    -- Check each result
    FOR result_element IN SELECT * FROM jsonb_array_elements(round_element->'results') LOOP
      -- Validate result structure
      IF NOT (
        result_element ? 'skipperIndex' AND
        jsonb_typeof(result_element->'skipperIndex') = 'number' AND
        (
          (result_element ? 'position' AND jsonb_typeof(result_element->'position') = 'number') OR
          (result_element ? 'letterScore' AND jsonb_typeof(result_element->'letterScore') = 'string')
        )
      ) THEN
        RETURN false;
      END IF;
    END LOOP;
  END LOOP;

  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Create trigger function
CREATE OR REPLACE FUNCTION validate_race_series_results()
RETURNS trigger AS $$
BEGIN
  IF NOT validate_round_results_structure(NEW.rounds) THEN
    RAISE EXCEPTION 'Invalid round results structure';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS validate_race_series_results_trigger ON race_series;

-- Create trigger
CREATE TRIGGER validate_race_series_results_trigger
  BEFORE INSERT OR UPDATE ON race_series
  FOR EACH ROW
  EXECUTE FUNCTION validate_race_series_results();