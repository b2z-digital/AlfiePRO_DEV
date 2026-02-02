/*
  # Create Function for Checking Event Website Creation Permission
  
  The existing user_can_manage_event_website() function takes website_id,
  but INSERT operations need to check based on event_id before the website exists.
  
  Changes:
  1. Create new function that checks if user can create website for an event
  2. Update INSERT policy to use this new function
  
  Security: SECURITY DEFINER bypasses RLS to properly check permissions
*/

-- Create function to check if user can create a website for an event
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
  -- Get the event details (bypasses RLS)
  SELECT club_id, state_association_id, national_association_id 
  INTO v_club_id, v_state_id, v_national_id
  FROM public_events
  WHERE id = p_event_id;
  
  -- If event doesn't exist, return false
  IF NOT FOUND THEN
    RETURN false;
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

-- Update INSERT policy to use the new function
DROP POLICY IF EXISTS "Admins can create event websites" ON event_websites;

CREATE POLICY "Admins can create event websites"
  ON event_websites FOR INSERT
  TO authenticated
  WITH CHECK (
    public.user_can_create_event_website(event_websites.event_id)
  );
