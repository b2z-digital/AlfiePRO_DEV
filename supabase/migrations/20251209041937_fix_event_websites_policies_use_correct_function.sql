/*
  # Fix Event Websites RLS Policies to Use Correct Function
  
  1. Problem
    - Policies are calling user_can_manage_event_website(event_id) but function expects website_id
    - This was causing infinite recursion and incorrect permission checks
  
  2. Solution  
    - Use user_can_create_event_website(event_id) for INSERT policy
    - Simplify SELECT/UPDATE/DELETE to check website ownership directly
  
  3. Changes
    - Fix INSERT policy to use user_can_create_event_website
    - Simplify other policies to avoid recursion
*/

-- Fix INSERT policy
DROP POLICY IF EXISTS "Admins can create event websites" ON event_websites;

CREATE POLICY "Admins can create event websites"
  ON event_websites FOR INSERT
  TO authenticated
  WITH CHECK (
    public.user_can_create_event_website(event_id)
  );

-- Fix SELECT policy - check both public_events and quick_races
DROP POLICY IF EXISTS "Admins can view event websites" ON event_websites;

CREATE POLICY "Admins can view event websites"
  ON event_websites FOR SELECT
  TO authenticated
  USING (
    public.is_national_admin(auth.uid())
    OR public.is_state_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public_events pe
      WHERE pe.id = event_websites.event_id
      AND public.is_org_admin(pe.club_id)
    )
    OR EXISTS (
      SELECT 1 FROM quick_races qr
      WHERE qr.id = event_websites.event_id
      AND public.is_org_admin(qr.club_id)
    )
  );

-- Fix UPDATE policy
DROP POLICY IF EXISTS "Admins can update event websites" ON event_websites;

CREATE POLICY "Admins can update event websites"
  ON event_websites FOR UPDATE
  TO authenticated
  USING (
    public.is_national_admin(auth.uid())
    OR public.is_state_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public_events pe
      WHERE pe.id = event_websites.event_id
      AND public.is_org_admin(pe.club_id)
    )
    OR EXISTS (
      SELECT 1 FROM quick_races qr
      WHERE qr.id = event_websites.event_id
      AND public.is_org_admin(qr.club_id)
    )
  )
  WITH CHECK (
    public.user_can_create_event_website(event_id)
  );

-- Fix DELETE policy
DROP POLICY IF EXISTS "Admins can delete event websites" ON event_websites;

CREATE POLICY "Admins can delete event websites"
  ON event_websites FOR DELETE
  TO authenticated
  USING (
    public.is_national_admin(auth.uid())
    OR public.is_state_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public_events pe
      WHERE pe.id = event_websites.event_id
      AND public.is_org_admin(pe.club_id)
    )
    OR EXISTS (
      SELECT 1 FROM quick_races qr
      WHERE qr.id = event_websites.event_id
      AND public.is_org_admin(qr.club_id)
    )
  );