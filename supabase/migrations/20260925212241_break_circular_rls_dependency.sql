/*
# Break circular dependency between user_clubs and membership_applications

## Problem
Circular RLS evaluation chain:
  platform_settings -> user_clubs (via inline EXISTS)
  -> membership_applications (via "Applicants can view club admins" policy)
  -> user_clubs (via the new scoped SELECT policy's admin check)
  -> infinite recursion

## Fix
1. Update membership_applications SELECT policy to use an inline profiles 
   super admin check instead of querying user_clubs, breaking the cycle.
2. The "Applicants can view club admins" policy on user_clubs references 
   membership_applications, so we must ensure membership_applications policies
   never reference user_clubs to prevent any circular path.
*/

-- Replace membership_applications SELECT policy with one that doesn't query user_clubs
DROP POLICY IF EXISTS "Users and club admins can view applications" ON membership_applications;
CREATE POLICY "Users and club admins can view applications"
ON membership_applications FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR is_club_admin(club_id)
  OR (SELECT is_super_admin FROM profiles WHERE id = auth.uid()) = true
);

-- Replace membership_applications UPDATE policy similarly
DROP POLICY IF EXISTS "Applicants and club admins can update applications" ON membership_applications;
DROP POLICY IF EXISTS "Users can update own draft applications" ON membership_applications;
CREATE POLICY "Applicants and club admins can update applications"
ON membership_applications FOR UPDATE
TO authenticated
USING (
  (user_id = auth.uid() AND is_draft = true)
  OR is_club_admin(club_id)
  OR (SELECT is_super_admin FROM profiles WHERE id = auth.uid()) = true
)
WITH CHECK (
  (user_id = auth.uid() AND is_draft = true)
  OR is_club_admin(club_id)
  OR (SELECT is_super_admin FROM profiles WHERE id = auth.uid()) = true
);
