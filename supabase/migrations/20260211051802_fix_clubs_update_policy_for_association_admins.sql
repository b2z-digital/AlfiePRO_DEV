/*
  # Fix clubs update policy for association admins

  1. Changes
    - Update the "State association admins can edit clubs without admins" policy
    - Remove the `has_admin = false` restriction so state/national association admins 
      can always edit clubs in their association
    - Also allow national association admins to edit clubs

  2. Security
    - State association admins can update clubs belonging to their state association
    - National association admins can update clubs belonging to any state in their national association
*/

DO $$ BEGIN
  DROP POLICY IF EXISTS "State association admins can edit clubs without admins" ON public.clubs;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

CREATE POLICY "Association admins can update clubs in their association"
  ON public.clubs
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_state_associations usa
      WHERE usa.state_association_id = clubs.state_association_id
      AND usa.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.state_associations sa
      JOIN public.user_national_associations una ON una.national_association_id = sa.national_association_id
      WHERE sa.id = clubs.state_association_id
      AND una.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_state_associations usa
      WHERE usa.state_association_id = clubs.state_association_id
      AND usa.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.state_associations sa
      JOIN public.user_national_associations una ON una.national_association_id = sa.national_association_id
      WHERE sa.id = clubs.state_association_id
      AND una.user_id = auth.uid()
    )
  );