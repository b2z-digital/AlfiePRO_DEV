/*
  # Add super admin SELECT access to club_boat_classes

  1. Problem
    - Super admins viewing a club's yacht classes settings need to read from club_boat_classes
    - The existing SELECT policy only allows users with a `user_clubs` entry for that club
    - Super admins may not have a `user_clubs` entry for every club they manage

  2. Changes
    - Add SELECT policy for super admins on `club_boat_classes`
*/

CREATE POLICY "Super admins can view all club boat classes"
  ON public.club_boat_classes
  FOR SELECT
  TO authenticated
  USING (is_super_admin(auth.uid()));
