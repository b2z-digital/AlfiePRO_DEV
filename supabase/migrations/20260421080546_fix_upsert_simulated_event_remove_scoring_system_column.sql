/*
  # Fix upsert_simulated_race_event RPC - remove non-existent scoring_system column

  1. Changes
    - Removed `scoring_system` from INSERT column list and VALUES
    - Removed `scoring_system` from ON CONFLICT DO UPDATE SET
    - The scoring system is already stored inside `heat_management` JSONB as
      `configuration.scoringSystem`, so no separate column is needed
    - All other columns remain unchanged

  2. Impact
    - Fixes the critical bug where ALL simulated event saves were failing
      because the RPC referenced a non-existent `scoring_system` column
    - Simulated events will now persist correctly to the database
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
  current_day, is_simulated, media, archived,
  show_flag, show_country, show_club_state, show_design,
  show_category, enable_observers, observers_per_heat, enable_roll_call,
  auto_complete_sail, enable_live_tracking, enable_livestream
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
  COALESCE((p_data->>'num_races')::int, 12),
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
  false,
  COALESCE((p_data->>'show_flag')::boolean, true),
  COALESCE((p_data->>'show_country')::boolean, true),
  COALESCE((p_data->>'show_club_state')::boolean, false),
  COALESCE((p_data->>'show_design')::boolean, false),
  COALESCE((p_data->>'show_category')::boolean, false),
  COALESCE((p_data->>'enable_observers')::boolean, false),
  COALESCE((p_data->>'observers_per_heat')::int, 2),
  COALESCE((p_data->>'enable_roll_call')::boolean, false),
  COALESCE((p_data->>'auto_complete_sail')::boolean, true),
  COALESCE((p_data->>'enable_live_tracking')::boolean, false),
  COALESCE((p_data->>'enable_livestream')::boolean, false)
)
ON CONFLICT (id) DO UPDATE SET
  event_name = EXCLUDED.event_name,
  club_name = EXCLUDED.club_name,
  race_date = EXCLUDED.race_date,
  race_venue = EXCLUDED.race_venue,
  race_class = EXCLUDED.race_class,
  race_format = EXCLUDED.race_format,
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
  media = EXCLUDED.media,
  multi_day = EXCLUDED.multi_day,
  number_of_days = EXCLUDED.number_of_days,
  end_date = EXCLUDED.end_date,
  show_flag = EXCLUDED.show_flag,
  show_country = EXCLUDED.show_country,
  show_club_state = EXCLUDED.show_club_state,
  show_design = EXCLUDED.show_design,
  show_category = EXCLUDED.show_category,
  enable_observers = EXCLUDED.enable_observers,
  observers_per_heat = EXCLUDED.observers_per_heat,
  enable_roll_call = EXCLUDED.enable_roll_call,
  auto_complete_sail = EXCLUDED.auto_complete_sail,
  enable_live_tracking = EXCLUDED.enable_live_tracking,
  enable_livestream = EXCLUDED.enable_livestream;
END;
$$;