/*
  # Fix alfie_tuning_guides RLS policies

  1. Changes
    - Drop existing management policy that checks wrong role field
    - Recreate using profiles.is_super_admin check
    - Allow club admins and association admins to manage guides

  2. Security
    - Super admins, club admins, and association admins can manage
    - Authenticated users can still read active guides
*/

DROP POLICY IF EXISTS "Super admins can manage tuning guides" ON alfie_tuning_guides;

CREATE POLICY "Admins can manage tuning guides"
  ON alfie_tuning_guides FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.is_super_admin = true
    )
    OR EXISTS (
      SELECT 1 FROM public.user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM public.user_state_associations usa
      WHERE usa.user_id = auth.uid()
      AND usa.role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM public.user_national_associations una
      WHERE una.user_id = auth.uid()
      AND una.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.is_super_admin = true
    )
    OR EXISTS (
      SELECT 1 FROM public.user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM public.user_state_associations usa
      WHERE usa.user_id = auth.uid()
      AND usa.role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM public.user_national_associations una
      WHERE una.user_id = auth.uid()
      AND una.role = 'admin'
    )
  );
