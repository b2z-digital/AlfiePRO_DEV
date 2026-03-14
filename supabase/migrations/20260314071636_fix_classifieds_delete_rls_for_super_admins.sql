/*
  # Fix classifieds delete RLS policy for super admins

  1. Problem
    - Delete policy checks `user_clubs.role = 'super_admin'` but no users have that role
    - Super admin status is stored in `profiles.is_super_admin`
    - This prevents super admins from deleting classifieds (e.g. the Redant F6 Marblehead)

  2. Changes
    - Drop the broken super admin delete policy
    - Create new delete policy using `profiles.is_super_admin = true`
    - Also allow state/national association admins to delete

  3. Security
    - Users can still delete their own classifieds
    - Super admins and association admins can delete any classified
*/

DROP POLICY IF EXISTS "Super admins can delete any classified" ON classifieds;

CREATE POLICY "Super admins can delete any classified"
  ON classifieds FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
    OR EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin')
    )
  );
