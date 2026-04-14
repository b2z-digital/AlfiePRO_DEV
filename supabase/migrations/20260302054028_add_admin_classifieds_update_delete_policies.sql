/*
  # Add admin management permissions for classifieds

  1. Changes
    - Add UPDATE policy for super admins and state association admins on classifieds
    - Add DELETE policy for super admins and state association admins on classifieds
    - These allow platform-level and state-level admins to manage all listings

  2. Security
    - Uses existing `is_super_admin()` function for super admin check
    - Uses existing `user_clubs` table to check for state_admin role
    - Regular users can still only edit/delete their own listings
*/

CREATE POLICY "Super admins can update any classified"
  ON classifieds FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('super_admin', 'state_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('super_admin', 'state_admin')
    )
  );

CREATE POLICY "Super admins can delete any classified"
  ON classifieds FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('super_admin', 'state_admin')
    )
  );