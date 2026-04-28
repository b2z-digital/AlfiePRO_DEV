/*
  # Fix orphaned event website RLS access

  1. Problem
    - When all linked events are deleted from an event website, the `user_can_manage_event_website` function
      returns false for all users because it joins `event_website_events` with `public_events` and finds no rows.
    - This blocks access to pages, navigation, sponsors, and all other website content.

  2. Fix
    - Update `user_can_manage_event_website` to also check for super_admin status
    - Add fallback: if the website has no valid linked events (orphaned), allow any authenticated 
      club admin to manage it
    - Update `event_sponsors` RLS policy to use the same function instead of direct JOIN

  3. Security
    - Super admins always have access
    - National/state admins always have access (existing behavior)
    - For websites with valid linked events, club admin check is preserved (existing behavior)
    - For orphaned websites, any authenticated club admin can manage them
*/

-- Update the user_can_manage_event_website function to handle orphaned websites
CREATE OR REPLACE FUNCTION public.user_can_manage_event_website(website_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_has_valid_events boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Super admins can manage any website
  IF public.is_super_admin() THEN
    RETURN true;
  END IF;

  -- National or state admins can manage any website
  IF public.is_national_admin(v_user_id) OR public.is_state_admin(v_user_id) THEN
    RETURN true;
  END IF;

  -- Check if user is admin of any event linked to this website
  IF EXISTS (
    SELECT 1 
    FROM event_website_events ewe
    JOIN public_events pe ON ewe.event_id = pe.id
    WHERE ewe.event_website_id = website_id
    AND public.is_org_admin(pe.club_id)
  ) THEN
    RETURN true;
  END IF;

  -- Fallback for orphaned websites (no valid linked events exist)
  -- Check if this website has ANY valid linked events
  v_has_valid_events := EXISTS (
    SELECT 1 
    FROM event_website_events ewe
    JOIN public_events pe ON ewe.event_id = pe.id
    WHERE ewe.event_website_id = website_id
  );

  -- If no valid events linked, allow any authenticated club admin to manage
  IF NOT v_has_valid_events THEN
    RETURN EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_id = v_user_id
      AND role IN ('admin', 'super_admin')
    );
  END IF;

  RETURN false;
END;
$function$;

-- Fix event_sponsors RLS policy that directly JOINs public_events
-- Drop the existing policy that breaks for orphaned websites
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'event_sponsors' AND policyname = 'Admins can manage sponsors') THEN
    DROP POLICY "Admins can manage sponsors" ON event_sponsors;
  END IF;
END $$;

-- Create separate policies for SELECT, INSERT, UPDATE, DELETE using the fixed function
CREATE POLICY "Admins can view sponsors"
  ON event_sponsors
  FOR SELECT
  TO authenticated
  USING (user_can_manage_event_website(event_website_id));

CREATE POLICY "Admins can insert sponsors"
  ON event_sponsors
  FOR INSERT
  TO authenticated
  WITH CHECK (user_can_manage_event_website(event_website_id));

CREATE POLICY "Admins can update sponsors"
  ON event_sponsors
  FOR UPDATE
  TO authenticated
  USING (user_can_manage_event_website(event_website_id))
  WITH CHECK (user_can_manage_event_website(event_website_id));

CREATE POLICY "Admins can delete sponsors"
  ON event_sponsors
  FOR DELETE
  TO authenticated
  USING (user_can_manage_event_website(event_website_id));
