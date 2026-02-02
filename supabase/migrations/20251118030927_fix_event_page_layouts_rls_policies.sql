/*
  # Fix Event Page Layouts RLS Policies
  
  1. Changes
    - Simplify RLS policies to allow any authenticated user who can access the event website
    - Fix the complex nested queries causing permission errors
    - Use security definer functions for better performance
  
  2. Security
    - Maintains security by checking user has access to the event website's club
    - Allows state/national admins to manage their events
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view event page layouts" ON event_page_layouts;
DROP POLICY IF EXISTS "Users can insert event page layouts" ON event_page_layouts;
DROP POLICY IF EXISTS "Users can update event page layouts" ON event_page_layouts;
DROP POLICY IF EXISTS "Users can delete event page layouts" ON event_page_layouts;

-- Create helper function to check event website access
CREATE OR REPLACE FUNCTION public.user_can_manage_event_website(website_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM event_websites ew
    JOIN public_events pe ON pe.id = ew.event_id
    JOIN user_clubs uc ON uc.club_id = pe.club_id
    WHERE ew.id = website_id
    AND uc.user_id = auth.uid()
    AND uc.role IN ('admin', 'member', 'pro', 'state_admin', 'national_admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Create simplified RLS policies
CREATE POLICY "Authenticated users can view event page layouts"
  ON event_page_layouts
  FOR SELECT
  TO authenticated
  USING (public.user_can_manage_event_website(event_website_id));

CREATE POLICY "Authenticated users can insert event page layouts"
  ON event_page_layouts
  FOR INSERT
  TO authenticated
  WITH CHECK (public.user_can_manage_event_website(event_website_id));

CREATE POLICY "Authenticated users can update event page layouts"
  ON event_page_layouts
  FOR UPDATE
  TO authenticated
  USING (public.user_can_manage_event_website(event_website_id))
  WITH CHECK (public.user_can_manage_event_website(event_website_id));

CREATE POLICY "Authenticated users can delete event page layouts"
  ON event_page_layouts
  FOR DELETE
  TO authenticated
  USING (public.user_can_manage_event_website(event_website_id));
