/*
  # Fix validate_race_series_results Function Search Path Issue

  1. Problem
    - The function `validate_race_series_results` has `search_path TO ''`
    - It calls `validate_round_results_structure` without schema qualification
    - This causes "function does not exist" errors

  2. Solution
    - Recreate the function with schema-qualified function call
    - Use `public.validate_round_results_structure` instead of bare function name

  3. Security
    - Maintains secure search_path setting
    - Uses explicit schema qualification for security
*/

-- Recreate the trigger function with schema-qualified function call
CREATE OR REPLACE FUNCTION public.validate_race_series_results()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF NOT public.validate_round_results_structure(NEW.rounds) THEN
    RAISE EXCEPTION 'Invalid round results structure';
  END IF;
  RETURN NEW;
END;
$$;
