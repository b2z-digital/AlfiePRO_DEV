/*
  # Fix heat_observers RLS for simulated events

  ## Problem
  The recent simulated events RLS changes on `quick_races` added
  `COALESCE(is_simulated, false) = false` to ALL SELECT policies.
  The `heat_observers` RLS policies validate access by doing an EXISTS subquery
  that joins `quick_races` -- but that subquery is ALSO subject to `quick_races` RLS.
  Since simulated events are now invisible to normal SELECT queries, the EXISTS check
  always returns false for simulated events, silently blocking all observer operations
  (select, insert, update, delete).

  ## Solution
  Create a SECURITY DEFINER helper function that checks if a user has club access
  to a given event_id (checking both quick_races and race_series_rounds) WITHOUT
  being subject to RLS on quick_races. Then update all heat_observers policies to
  use this function instead of inline EXISTS subqueries.

  ## Changes
  1. New function: `check_heat_observer_access(p_event_id uuid)` - SECURITY DEFINER
     - Checks if current user belongs to the club that owns the event
     - Works for both quick_races and race_series_rounds
     - Bypasses quick_races RLS (since it's SECURITY DEFINER)
  2. All heat_observers policies updated to use the new function
  3. Public/anon SELECT policy also updated with SECURITY DEFINER function

  ## Security
  - The function only returns true/false for access check, no data leakage
  - Still validates auth.uid() against user_clubs membership
  - Maintains same access pattern: only club members can manage observers
*/

-- Create SECURITY DEFINER function to check observer access
CREATE OR REPLACE FUNCTION public.check_heat_observer_access(p_event_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
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

-- Create SECURITY DEFINER function for public/anon access check
CREATE OR REPLACE FUNCTION public.check_heat_observer_public_access(p_event_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.quick_races qr
    WHERE qr.id = p_event_id
      AND qr.enable_live_tracking = true
      AND COALESCE(qr.is_simulated, false) = false
  );
END;
$$;

-- Drop all existing heat_observers policies
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'heat_observers' AND policyname = 'Club members can view heat observers') THEN
    DROP POLICY "Club members can view heat observers" ON heat_observers;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'heat_observers' AND policyname = 'Club members can assign heat observers') THEN
    DROP POLICY "Club members can assign heat observers" ON heat_observers;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'heat_observers' AND policyname = 'Club members can update heat observers') THEN
    DROP POLICY "Club members can update heat observers" ON heat_observers;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'heat_observers' AND policyname = 'Club members can delete heat observers') THEN
    DROP POLICY "Club members can delete heat observers" ON heat_observers;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'heat_observers' AND policyname = 'Public can view heat observers for published events') THEN
    DROP POLICY "Public can view heat observers for published events" ON heat_observers;
  END IF;
END $$;

-- Recreate SELECT policy using SECURITY DEFINER function
CREATE POLICY "Club members can view heat observers"
  ON heat_observers FOR SELECT
  TO authenticated
  USING (public.check_heat_observer_access(event_id));

-- Recreate INSERT policy using SECURITY DEFINER function
CREATE POLICY "Club members can assign heat observers"
  ON heat_observers FOR INSERT
  TO authenticated
  WITH CHECK (public.check_heat_observer_access(event_id));

-- Recreate UPDATE policy using SECURITY DEFINER function
CREATE POLICY "Club members can update heat observers"
  ON heat_observers FOR UPDATE
  TO authenticated
  USING (public.check_heat_observer_access(event_id))
  WITH CHECK (public.check_heat_observer_access(event_id));

-- Recreate DELETE policy using SECURITY DEFINER function
CREATE POLICY "Club members can delete heat observers"
  ON heat_observers FOR DELETE
  TO authenticated
  USING (public.check_heat_observer_access(event_id));

-- Recreate public/anon SELECT policy using SECURITY DEFINER function
CREATE POLICY "Public can view heat observers for published events"
  ON heat_observers FOR SELECT
  TO anon
  USING (public.check_heat_observer_public_access(event_id));