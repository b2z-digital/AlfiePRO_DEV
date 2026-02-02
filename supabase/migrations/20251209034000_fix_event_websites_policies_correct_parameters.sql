/*
  # Fix Event Websites RLS Policies - Correct Function Parameters
  
  The user_can_manage_event_website function expects a website_id parameter,
  but policies were incorrectly calling it with event_id.
  
  Changes:
  1. Fix SELECT policy to use event_websites.id instead of event_websites.event_id
  2. Fix UPDATE policy to use event_websites.id instead of event_websites.event_id  
  3. Fix DELETE policy to use event_websites.id instead of event_websites.event_id
*/

-- Fix SELECT policy
DROP POLICY IF EXISTS "Admins can view event websites" ON event_websites;

CREATE POLICY "Admins can view event websites"
  ON event_websites FOR SELECT
  TO authenticated
  USING (
    public.user_can_manage_event_website(event_websites.id)
  );

-- Fix UPDATE policy
DROP POLICY IF EXISTS "Admins can update event websites" ON event_websites;

CREATE POLICY "Admins can update event websites"
  ON event_websites FOR UPDATE
  TO authenticated
  USING (
    public.user_can_manage_event_website(event_websites.id)
  )
  WITH CHECK (
    public.user_can_manage_event_website(event_websites.id)
  );

-- Fix DELETE policy
DROP POLICY IF EXISTS "Admins can delete event websites" ON event_websites;

CREATE POLICY "Admins can delete event websites"
  ON event_websites FOR DELETE
  TO authenticated
  USING (
    public.user_can_manage_event_website(event_websites.id)
  );
