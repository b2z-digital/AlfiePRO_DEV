/*
  # Fix Fee Structures RLS for National Admins

  1. Changes
    - Adds RLS policy for national association admins to manage fee structures
    - Allows national admins to create/update fee structures for their national association

  2. Security
    - National admins can only manage fee structures for their own national association
    - State admins can still manage their state fee structures
    - Super admins retain full access
*/

-- Add policy for national admins to manage their fee structures
CREATE POLICY "National admins manage national fee structures"
  ON public.membership_fee_structures FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_national_associations una
      WHERE una.national_association_id = membership_fee_structures.national_association_id
        AND una.user_id = auth.uid()
        AND una.role = 'admin'
    )
    OR public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_national_associations una
      WHERE una.national_association_id = membership_fee_structures.national_association_id
        AND una.user_id = auth.uid()
        AND una.role = 'admin'
    )
    OR public.is_super_admin(auth.uid())
  );
