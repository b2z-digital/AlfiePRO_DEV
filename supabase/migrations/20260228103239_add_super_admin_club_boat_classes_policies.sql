/*
  # Add super admin access to club_boat_classes

  1. Problem
    - Super admins can switch to any club via the club switcher
    - But they don't have entries in the `user_clubs` table for every club
    - The existing INSERT/DELETE RLS policies only check `user_clubs` for admin role
    - This causes a 403 error when a super admin tries to toggle yacht classes for a club

  2. Changes
    - Add INSERT policy for super admins on `club_boat_classes`
    - Add DELETE policy for super admins on `club_boat_classes`
    - Uses the existing `is_super_admin(uuid)` function that checks `profiles.is_super_admin`

  3. Security
    - Only users with `is_super_admin = true` in their profile can use these policies
    - This is consistent with how super admins are granted access elsewhere in the system
*/

CREATE POLICY "Super admins can add club boat classes"
  ON public.club_boat_classes
  FOR INSERT
  TO authenticated
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can remove club boat classes"
  ON public.club_boat_classes
  FOR DELETE
  TO authenticated
  USING (is_super_admin(auth.uid()));
