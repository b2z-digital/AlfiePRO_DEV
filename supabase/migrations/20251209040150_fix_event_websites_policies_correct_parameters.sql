/*
  # Fix Event Website Creation Function to Support Quick Races
  
  The user_can_create_event_website function only checks public_events,
  but event websites should also work with quick_races.
  
  Changes:
  1. Update function to check both public_events and quick_races
  2. For quick_races, check if user is admin of the club that owns the race
*/

-- Update function to support both public_events and quick_races
CREATE OR REPLACE FUNCTION public.user_can_create_event_website(p_event_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_id uuid;
  v_state_id uuid;
  v_national_id uuid;
BEGIN
  -- First try to get from public_events
  SELECT club_id, state_association_id, national_association_id 
  INTO v_club_id, v_state_id, v_national_id
  FROM public_events
  WHERE id = p_event_id;
  
  -- If not found in public_events, try quick_races
  IF NOT FOUND THEN
    SELECT club_id 
    INTO v_club_id
    FROM quick_races
    WHERE id = p_event_id;
    
    -- If event doesn't exist in either table, return false
    IF NOT FOUND THEN
      RETURN false;
    END IF;
  END IF;
  
  -- Check if user is national admin
  IF public.is_national_admin(auth.uid()) THEN
    RETURN true;
  END IF;
  
  -- Check if user is state admin
  IF public.is_state_admin(auth.uid()) THEN
    RETURN true;
  END IF;
  
  -- Check if user is club admin for this event's club
  IF v_club_id IS NOT NULL AND public.is_org_admin(v_club_id) THEN
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$;