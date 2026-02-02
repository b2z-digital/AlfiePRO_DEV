/*
  # Fix Event Websites RLS INSERT Policy
  
  The current "FOR ALL" policy fails on INSERT because it only has a USING clause
  which checks the existing row. For INSERT operations, we need a WITH CHECK clause
  that validates the new data being inserted.
  
  Changes:
  1. Drop the existing "FOR ALL" policy
  2. Create separate INSERT policy with WITH CHECK
  3. Create UPDATE/DELETE policies with USING clause
  
  Security: Ensures authenticated users can create event websites if they have
  permission for the associated event (national/state admin or club admin)
*/

-- Drop the existing policy
DROP POLICY IF EXISTS "Admins can manage event websites" ON event_websites;

-- Create INSERT policy with WITH CHECK
CREATE POLICY "Admins can create event websites"
  ON event_websites FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public_events pe
      WHERE pe.id = event_websites.event_id
      AND (
        public.is_national_admin(auth.uid())
        OR public.is_state_admin(auth.uid())
        OR public.is_org_admin(pe.club_id)
      )
    )
  );

-- Create SELECT policy
CREATE POLICY "Admins can view event websites"
  ON event_websites FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public_events pe
      WHERE pe.id = event_websites.event_id
      AND (
        public.is_national_admin(auth.uid())
        OR public.is_state_admin(auth.uid())
        OR public.is_org_admin(pe.club_id)
      )
    )
  );

-- Create UPDATE policy
CREATE POLICY "Admins can update event websites"
  ON event_websites FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public_events pe
      WHERE pe.id = event_websites.event_id
      AND (
        public.is_national_admin(auth.uid())
        OR public.is_state_admin(auth.uid())
        OR public.is_org_admin(pe.club_id)
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public_events pe
      WHERE pe.id = event_websites.event_id
      AND (
        public.is_national_admin(auth.uid())
        OR public.is_state_admin(auth.uid())
        OR public.is_org_admin(pe.club_id)
      )
    )
  );

-- Create DELETE policy
CREATE POLICY "Admins can delete event websites"
  ON event_websites FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public_events pe
      WHERE pe.id = event_websites.event_id
      AND (
        public.is_national_admin(auth.uid())
        OR public.is_state_admin(auth.uid())
        OR public.is_org_admin(pe.club_id)
      )
    )
  );
