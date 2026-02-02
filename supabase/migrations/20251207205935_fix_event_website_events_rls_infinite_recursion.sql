/*
  # Fix Event Website Events RLS Infinite Recursion
  
  1. Problem
    - The RLS policy for event_website_events queries itself, causing infinite recursion
    - This happens when checking if user is admin of ANY event linked to a website
  
  2. Solution
    - Create SECURITY DEFINER helper function to bypass RLS
    - Simplify the policy to avoid self-referencing queries
  
  3. Changes
    - Drop existing problematic policy
    - Create helper function with SECURITY DEFINER
    - Create new simplified policy
*/

-- Drop the problematic policy
DROP POLICY IF EXISTS "Admins of any linked event can manage groupings" ON event_website_events;

-- Create helper function to check if user can manage event website grouping
CREATE OR REPLACE FUNCTION public.user_can_manage_event_website(website_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_id uuid;
BEGIN
  user_id := auth.uid();
  
  -- Check if user is national or state admin
  IF public.is_national_admin(user_id) OR public.is_state_admin(user_id) THEN
    RETURN true;
  END IF;
  
  -- Check if user is admin of any event linked to this website
  RETURN EXISTS (
    SELECT 1 
    FROM event_website_events ewe
    JOIN public_events pe ON ewe.event_id = pe.id
    WHERE ewe.event_website_id = website_id
    AND public.is_org_admin(pe.club_id)
  );
END;
$$;

-- Create new simplified policy
CREATE POLICY "Authenticated users can manage event website groupings"
  ON event_website_events FOR ALL
  TO authenticated
  USING (
    public.user_can_manage_event_website(event_website_id)
  )
  WITH CHECK (
    public.user_can_manage_event_website(event_website_id)
  );