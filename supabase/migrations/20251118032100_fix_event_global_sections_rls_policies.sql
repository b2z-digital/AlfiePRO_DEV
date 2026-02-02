/*
  # Fix Event Global Sections RLS Policies
  
  1. Changes
    - Simplify RLS policies using the same helper function from event_page_layouts
    - Fix permission issues preventing saves to event_global_sections
  
  2. Security
    - Uses existing user_can_manage_event_website() function
    - Maintains proper access control for event website management
*/

-- Drop existing policies for event_global_sections
DROP POLICY IF EXISTS "Users can view event global sections" ON event_global_sections;
DROP POLICY IF EXISTS "Users can insert event global sections" ON event_global_sections;
DROP POLICY IF EXISTS "Users can update event global sections" ON event_global_sections;
DROP POLICY IF EXISTS "Users can delete event global sections" ON event_global_sections;

-- Create simplified RLS policies using the helper function
CREATE POLICY "Authenticated users can view event global sections"
  ON event_global_sections
  FOR SELECT
  TO authenticated
  USING (public.user_can_manage_event_website(event_website_id));

CREATE POLICY "Authenticated users can insert event global sections"
  ON event_global_sections
  FOR INSERT
  TO authenticated
  WITH CHECK (public.user_can_manage_event_website(event_website_id));

CREATE POLICY "Authenticated users can update event global sections"
  ON event_global_sections
  FOR UPDATE
  TO authenticated
  USING (public.user_can_manage_event_website(event_website_id))
  WITH CHECK (public.user_can_manage_event_website(event_website_id));

CREATE POLICY "Authenticated users can delete event global sections"
  ON event_global_sections
  FOR DELETE
  TO authenticated
  USING (public.user_can_manage_event_website(event_website_id));
