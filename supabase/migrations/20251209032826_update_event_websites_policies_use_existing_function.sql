/*
  # Update Event Websites Policies to Use Existing Security Definer Function
  
  The user_can_manage_event_website function already exists and bypasses RLS.
  We just need to update the event_websites policies to use it instead of
  directly querying public_events.
  
  Changes:
  1. Update INSERT policy to use existing security definer function
  2. Update SELECT policy to use existing security definer function  
  3. Update UPDATE policy to use existing security definer function
  4. Update DELETE policy to use existing security definer function
*/

-- Drop and recreate INSERT policy with security definer function
DROP POLICY IF EXISTS "Admins can create event websites" ON event_websites;

CREATE POLICY "Admins can create event websites"
  ON event_websites FOR INSERT
  TO authenticated
  WITH CHECK (
    public.user_can_manage_event_website(event_websites.event_id)
  );

-- Update SELECT policy
DROP POLICY IF EXISTS "Admins can view event websites" ON event_websites;

CREATE POLICY "Admins can view event websites"
  ON event_websites FOR SELECT
  TO authenticated
  USING (
    public.user_can_manage_event_website(event_websites.event_id)
  );

-- Update UPDATE policy
DROP POLICY IF EXISTS "Admins can update event websites" ON event_websites;

CREATE POLICY "Admins can update event websites"
  ON event_websites FOR UPDATE
  TO authenticated
  USING (
    public.user_can_manage_event_website(event_websites.event_id)
  )
  WITH CHECK (
    public.user_can_manage_event_website(event_websites.event_id)
  );

-- Update DELETE policy
DROP POLICY IF EXISTS "Admins can delete event websites" ON event_websites;

CREATE POLICY "Admins can delete event websites"
  ON event_websites FOR DELETE
  TO authenticated
  USING (
    public.user_can_manage_event_website(event_websites.event_id)
  );
