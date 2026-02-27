/*
  # Allow Association Admins to Manage Club Feature Overrides

  1. Changes
    - Add SELECT policy on `platform_feature_controls` for association admins (read-only)
    - Add SELECT, INSERT, UPDATE, DELETE policies on `platform_feature_overrides`
      for state/national association admins, scoped to clubs under their association
  
  2. Security
    - Association admins can only view feature controls (not modify them)
    - Association admins can only manage overrides for clubs under their association
    - Uses existing `user_is_association_admin_for_club` security definer function
*/

CREATE POLICY "Association admins can view feature controls"
  ON public.platform_feature_controls
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_state_associations
      WHERE user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.user_national_associations
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Association admins can view club overrides"
  ON public.platform_feature_overrides
  FOR SELECT
  TO authenticated
  USING (
    target_type = 'club'
    AND public.user_is_association_admin_for_club(target_id, auth.uid())
  );

CREATE POLICY "Association admins can insert club overrides"
  ON public.platform_feature_overrides
  FOR INSERT
  TO authenticated
  WITH CHECK (
    target_type = 'club'
    AND public.user_is_association_admin_for_club(target_id, auth.uid())
  );

CREATE POLICY "Association admins can update club overrides"
  ON public.platform_feature_overrides
  FOR UPDATE
  TO authenticated
  USING (
    target_type = 'club'
    AND public.user_is_association_admin_for_club(target_id, auth.uid())
  )
  WITH CHECK (
    target_type = 'club'
    AND public.user_is_association_admin_for_club(target_id, auth.uid())
  );

CREATE POLICY "Association admins can delete club overrides"
  ON public.platform_feature_overrides
  FOR DELETE
  TO authenticated
  USING (
    target_type = 'club'
    AND public.user_is_association_admin_for_club(target_id, auth.uid())
  );
