/*
  # Add user-based delete for simulated race events

  1. New Functions
    - `delete_simulated_race_event_for_user(p_event_id uuid, p_user_id uuid)` 
      Deletes a simulated event belonging to a standalone race officer

  2. Security
    - Verifies the event belongs to the specified user
    - Verifies the event is actually simulated (is_simulated = true)
    - Verifies club_id is NULL (standalone event)
*/

CREATE OR REPLACE FUNCTION public.delete_simulated_race_event_for_user(p_event_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.quick_races
  WHERE id = p_event_id
    AND user_id = p_user_id
    AND club_id IS NULL
    AND is_simulated = true;
  
  RETURN FOUND;
END;
$$;
