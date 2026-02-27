/*
  # Add association admin access to club-related tables

  1. Changes
    - Add INSERT/DELETE policies for `club_boat_classes` for state and national association admins
    - Add INSERT/UPDATE/DELETE policies for `venues` for association admins
    - Add INSERT/UPDATE/DELETE policies for `club_venues` for association admins
    - Add ALL policies for `membership_types` for association admins
    - Add ALL policies for `tax_rates` for association admins

  2. Security
    - State association admins can manage records for clubs in their state
    - National association admins can manage records for clubs in any state under their national association
    - Uses existing `user_state_associations` and `user_national_associations` tables for authorization checks
*/

-- Helper function to check if user is association admin for a given club
CREATE OR REPLACE FUNCTION public.user_is_association_admin_for_club(p_club_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM clubs c
    JOIN user_state_associations usa ON usa.state_association_id = c.state_association_id
    WHERE c.id = p_club_id AND usa.user_id = p_user_id
  )
  OR EXISTS (
    SELECT 1 FROM clubs c
    JOIN state_associations sa ON sa.id = c.state_association_id
    JOIN user_national_associations una ON una.national_association_id = sa.national_association_id
    WHERE c.id = p_club_id AND una.user_id = p_user_id
  );
$$;

-- club_boat_classes: allow association admins to insert
CREATE POLICY "Association admins can add club boat classes"
  ON public.club_boat_classes
  FOR INSERT
  TO authenticated
  WITH CHECK (user_is_association_admin_for_club(club_id, auth.uid()));

-- club_boat_classes: allow association admins to delete
CREATE POLICY "Association admins can remove club boat classes"
  ON public.club_boat_classes
  FOR DELETE
  TO authenticated
  USING (user_is_association_admin_for_club(club_id, auth.uid()));

-- venues: allow association admins to manage
CREATE POLICY "Association admins can manage club venues"
  ON public.venues
  FOR ALL
  TO authenticated
  USING (user_is_association_admin_for_club(club_id, auth.uid()))
  WITH CHECK (user_is_association_admin_for_club(club_id, auth.uid()));

-- club_venues: allow association admins to insert
CREATE POLICY "Association admins can add club venue associations"
  ON public.club_venues
  FOR INSERT
  TO authenticated
  WITH CHECK (user_is_association_admin_for_club(club_id, auth.uid()));

-- club_venues: allow association admins to delete
CREATE POLICY "Association admins can remove club venue associations"
  ON public.club_venues
  FOR DELETE
  TO authenticated
  USING (user_is_association_admin_for_club(club_id, auth.uid()));

-- membership_types: allow association admins to manage
CREATE POLICY "Association admins can manage membership types"
  ON public.membership_types
  FOR ALL
  TO authenticated
  USING (user_is_association_admin_for_club(club_id, auth.uid()))
  WITH CHECK (user_is_association_admin_for_club(club_id, auth.uid()));

-- tax_rates: allow association admins to manage
CREATE POLICY "Association admins can manage tax rates"
  ON public.tax_rates
  FOR ALL
  TO authenticated
  USING (user_is_association_admin_for_club(club_id, auth.uid()))
  WITH CHECK (user_is_association_admin_for_club(club_id, auth.uid()));