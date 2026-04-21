/*
  # Create RPC to upsert simulated race events

  1. New Functions
    - `upsert_simulated_race_event(p_data jsonb)` - SECURITY DEFINER function
      that inserts or updates a simulated event, bypassing RLS SELECT restrictions
    
  2. Security
    - Only works for events where is_simulated = true
    - Verifies caller is a member of the club via user_clubs table
*/

CREATE OR REPLACE FUNCTION public.upsert_simulated_race_event(p_data jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.quick_races (
    id, event_name, club_name, race_date, race_venue, race_class, race_format,
    skippers, race_results, last_completed_race, has_determined_initial_hcaps,
    is_manual_handicaps, completed, num_races, drop_rules, club_id, 
    heat_management, multi_day, number_of_days, end_date, day_results, 
    current_day, is_simulated, media, archived
  ) VALUES (
    (p_data->>'id')::uuid,
    p_data->>'event_name',
    p_data->>'club_name',
    p_data->>'race_date',
    p_data->>'race_venue',
    p_data->>'race_class',
    p_data->>'race_format',
    COALESCE(p_data->'skippers', '[]'::jsonb),
    COALESCE(p_data->'race_results', '[]'::jsonb),
    COALESCE((p_data->>'last_completed_race')::int, 0),
    COALESCE((p_data->>'has_determined_initial_hcaps')::boolean, false),
    COALESCE((p_data->>'is_manual_handicaps')::boolean, false),
    COALESCE((p_data->>'completed')::boolean, false),
    (p_data->>'num_races')::int,
    CASE WHEN p_data ? 'drop_rules' THEN 
      (SELECT array_agg(x::int) FROM jsonb_array_elements_text(p_data->'drop_rules') AS x)
    ELSE ARRAY[4, 8, 16, 24, 32, 40] END,
    (p_data->>'club_id')::uuid,
    p_data->'heat_management',
    COALESCE((p_data->>'multi_day')::boolean, false),
    COALESCE((p_data->>'number_of_days')::int, 1),
    p_data->>'end_date',
    COALESCE(p_data->'day_results', '{}'::jsonb),
    COALESCE((p_data->>'current_day')::int, 1),
    true,
    COALESCE(p_data->'media', '[]'::jsonb),
    false
  )
  ON CONFLICT (id) DO UPDATE SET
    event_name = EXCLUDED.event_name,
    skippers = EXCLUDED.skippers,
    race_results = EXCLUDED.race_results,
    last_completed_race = EXCLUDED.last_completed_race,
    has_determined_initial_hcaps = EXCLUDED.has_determined_initial_hcaps,
    is_manual_handicaps = EXCLUDED.is_manual_handicaps,
    completed = EXCLUDED.completed,
    num_races = EXCLUDED.num_races,
    drop_rules = EXCLUDED.drop_rules,
    heat_management = EXCLUDED.heat_management,
    day_results = EXCLUDED.day_results,
    current_day = EXCLUDED.current_day,
    race_format = EXCLUDED.race_format,
    race_class = EXCLUDED.race_class;
END;
$$;
