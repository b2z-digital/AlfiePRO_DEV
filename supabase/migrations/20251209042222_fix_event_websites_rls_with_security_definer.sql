/*
  # Fix Event Websites RLS with SECURITY DEFINER Function
  
  1. Problem
    - Complex nested queries in RLS policies cause stack depth recursion
    - Multiple EXISTS checks triggering cascading RLS policy evaluations
  
  2. Solution
    - Create single SECURITY DEFINER function for all permission checks
    - Function bypasses RLS and does direct permission lookups
    - Simplify all policies to just call this function
  
  3. Changes
    - Create user_can_access_event_website function
    - Update all event_websites policies to use it
*/

-- Create comprehensive permission check function
CREATE OR REPLACE FUNCTION public.user_can_access_event_website(
  p_event_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_club_id uuid;
BEGIN
  -- Use provided user_id or current user
  v_user_id := COALESCE(p_user_id, auth.uid());
  
  -- If no user, no access
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Check if user is national admin
  IF EXISTS (
    SELECT 1 FROM user_clubs uc
    WHERE uc.user_id = v_user_id
    AND uc.role = 'national_admin'
  ) THEN
    RETURN true;
  END IF;
  
  -- Check if user is state admin
  IF EXISTS (
    SELECT 1 FROM user_clubs uc
    WHERE uc.user_id = v_user_id
    AND uc.role = 'state_admin'
  ) THEN
    RETURN true;
  END IF;
  
  -- Try to get club_id from public_events
  SELECT club_id INTO v_club_id
  FROM public_events
  WHERE id = p_event_id;
  
  -- If not found, try quick_races
  IF v_club_id IS NULL THEN
    SELECT club_id INTO v_club_id
    FROM quick_races
    WHERE id = p_event_id;
  END IF;
  
  -- If event doesn't exist, no access
  IF v_club_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Check if user is admin of the club
  RETURN EXISTS (
    SELECT 1 FROM user_clubs uc
    WHERE uc.user_id = v_user_id
    AND uc.club_id = v_club_id
    AND uc.role IN ('admin', 'national_admin', 'state_admin')
  );
END;
$$;

-- Drop all existing policies
DROP POLICY IF EXISTS "Public can view published event websites" ON event_websites;
DROP POLICY IF EXISTS "Admins can create event websites" ON event_websites;
DROP POLICY IF EXISTS "Admins can view event websites" ON event_websites;
DROP POLICY IF EXISTS "Admins can update event websites" ON event_websites;
DROP POLICY IF EXISTS "Admins can delete event websites" ON event_websites;

-- Create new simplified policies
CREATE POLICY "Public can view published event websites"
  ON event_websites FOR SELECT
  TO public
  USING (status = 'published' AND enabled = true);

CREATE POLICY "Admins can create event websites"
  ON event_websites FOR INSERT
  TO authenticated
  WITH CHECK (
    public.user_can_access_event_website(event_id)
  );

CREATE POLICY "Admins can view event websites"
  ON event_websites FOR SELECT
  TO authenticated
  USING (
    public.user_can_access_event_website(event_id)
  );

CREATE POLICY "Admins can update event websites"
  ON event_websites FOR UPDATE
  TO authenticated
  USING (
    public.user_can_access_event_website(event_id)
  )
  WITH CHECK (
    public.user_can_access_event_website(event_id)
  );

CREATE POLICY "Admins can delete event websites"
  ON event_websites FOR DELETE
  TO authenticated
  USING (
    public.user_can_access_event_website(event_id)
  );