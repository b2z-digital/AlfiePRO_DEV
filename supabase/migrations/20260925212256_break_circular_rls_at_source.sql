/*
# Break the circular dependency at its source: user_clubs "Applicants" policy

## Problem
The "Applicants can view club admins" policy on user_clubs queries 
membership_applications, and membership_applications policies query user_clubs 
(via is_club_admin), creating an unbreakable circular dependency regardless 
of whether functions are SECURITY DEFINER.

## Fix
Drop the "Applicants can view club admins" policy from user_clubs entirely.
Applicants can find club admin contact info through the clubs table or 
membership workflow UI instead. This breaks the cycle completely.

Also revert membership_applications to use is_club_admin() which is cleaner.
*/

-- Break the cycle: remove the policy that queries membership_applications from user_clubs
DROP POLICY IF EXISTS "Applicants can view club admins" ON user_clubs;

-- Now membership_applications can safely use is_club_admin since user_clubs 
-- no longer references membership_applications
DROP POLICY IF EXISTS "Users and club admins can view applications" ON membership_applications;
CREATE POLICY "Users and club admins can view applications"
ON membership_applications FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR is_club_admin(club_id)
  OR is_platform_super_admin()
);

DROP POLICY IF EXISTS "Applicants and club admins can update applications" ON membership_applications;
CREATE POLICY "Applicants and club admins can update applications"
ON membership_applications FOR UPDATE
TO authenticated
USING (
  (user_id = auth.uid() AND is_draft = true)
  OR is_club_admin(club_id)
  OR is_platform_super_admin()
)
WITH CHECK (
  (user_id = auth.uid() AND is_draft = true)
  OR is_club_admin(club_id)
  OR is_platform_super_admin()
);
