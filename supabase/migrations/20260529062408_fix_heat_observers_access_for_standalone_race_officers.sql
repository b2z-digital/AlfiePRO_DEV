/*
  # Fix heat observers access for standalone race officers

  1. Changes
    - Update `check_heat_observer_access` function to also check event ownership
      by user_id for standalone race officers (events with club_id IS NULL)

  2. Impact
    - Standalone race officers can now view, assign, update, and delete observers
      for their own events
    - Existing club-based observer access continues to work unchanged
*/

CREATE OR REPLACE FUNCTION public.check_heat_observer_access(p_event_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  -- Check if user owns this standalone event directly (race officer, no club)
  IF EXISTS (
    SELECT 1 FROM public.quick_races qr
    WHERE qr.id = p_event_id
      AND qr.user_id = auth.uid()
      AND qr.club_id IS NULL
  ) THEN
    RETURN true;
  END IF;

  -- Check if user is member of the club that owns this event (quick_races)
  IF EXISTS (
    SELECT 1 FROM public.quick_races qr
    INNER JOIN public.user_clubs uc ON uc.club_id = qr.club_id
    WHERE qr.id = p_event_id
      AND uc.user_id = auth.uid()
  ) THEN
    RETURN true;
  END IF;

  -- Check if user is member of the club that owns this event (race_series_rounds)
  IF EXISTS (
    SELECT 1 FROM public.race_series_rounds rsr
    INNER JOIN public.user_clubs uc ON uc.club_id = rsr.club_id
    WHERE rsr.id = p_event_id
      AND uc.user_id = auth.uid()
  ) THEN
    RETURN true;
  END IF;

  -- Check if user is a super admin
  IF public.is_platform_super_admin() THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;
