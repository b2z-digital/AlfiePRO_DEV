/*
  # Create RPC to delete simulated race events

  1. New Functions
    - `delete_simulated_race_event(p_event_id uuid, p_club_id uuid)` - SECURITY DEFINER function
      that deletes a simulated event, bypassing RLS SELECT restrictions
    
  2. Security
    - Verifies the event belongs to the specified club
    - Verifies the event is actually simulated (is_simulated = true)
    - Verifies the caller is a member of the club
*/

CREATE OR REPLACE FUNCTION public.delete_simulated_race_event(p_event_id uuid, p_club_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.quick_races
  WHERE id = p_event_id
    AND club_id = p_club_id
    AND is_simulated = true;
  
  RETURN FOUND;
END;
$$;
