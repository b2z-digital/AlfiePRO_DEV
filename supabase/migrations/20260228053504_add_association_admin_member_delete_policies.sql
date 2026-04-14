/*
  # Add delete policies for association admins on members table

  1. Security Changes
    - Add DELETE policy for state admins to delete association members (where state_association_id matches)
    - Add DELETE policy for state admins to delete club members (under their state association)
    - Add DELETE policy for national admins to delete association members (where national_association_id matches)
    - Add DELETE policy for national admins to delete club members (under their national association)

  2. Important Notes
    - These policies enable bulk delete operations from the Association Members list
    - State admins can only delete members within their state association
    - National admins can only delete members within their national association
*/

CREATE POLICY "State admins can delete association members"
  ON public.members
  FOR DELETE
  TO authenticated
  USING (
    state_association_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_state_associations usa
      WHERE usa.state_association_id = members.state_association_id
      AND usa.user_id = auth.uid()
      AND usa.role = 'state_admin'
    )
  );

CREATE POLICY "State admins can delete club members"
  ON public.members
  FOR DELETE
  TO authenticated
  USING (
    club_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.clubs c
      JOIN public.user_state_associations usa ON usa.state_association_id = c.state_association_id
      WHERE c.id = members.club_id
      AND usa.user_id = auth.uid()
      AND usa.role = 'state_admin'
    )
  );

CREATE POLICY "National admins can delete association members"
  ON public.members
  FOR DELETE
  TO authenticated
  USING (
    national_association_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_national_associations una
      WHERE una.national_association_id = members.national_association_id
      AND una.user_id = auth.uid()
      AND una.role = 'national_admin'
    )
  );

CREATE POLICY "National admins can delete club members"
  ON public.members
  FOR DELETE
  TO authenticated
  USING (
    club_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.clubs c
      JOIN public.state_associations sa ON sa.id = c.state_association_id
      JOIN public.user_national_associations una ON una.national_association_id = sa.national_association_id
      WHERE c.id = members.club_id
      AND una.user_id = auth.uid()
      AND una.role = 'national_admin'
    )
  );
