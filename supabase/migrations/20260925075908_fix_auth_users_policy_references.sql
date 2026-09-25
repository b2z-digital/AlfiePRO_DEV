/*
# Fix policies that directly query auth.users (causes permission errors)

## Problem
Three RLS policies contain inline subqueries against auth.users.
The authenticated role does not have SELECT on auth.users, so when
PostgreSQL evaluates these policies it throws "permission denied for table users".
Previously this was masked by permissive USING(true) catch-all policies.

## Fix
- Replace auth.users subqueries with safe alternatives:
  - For the hardcoded email checks: use is_platform_super_admin() which is SECURITY DEFINER
  - For email lookup: use auth.jwt() to get the email from the JWT claims

## Also: add missing SELECT policy on profiles
When the "Public can view basic profiles" policy was dropped, profiles lost its
only SELECT path. Authenticated users need to read their own profile.
*/

-- 1. Fix clubs policy: replace auth.users subquery with super admin function
DROP POLICY IF EXISTS "State association admins can view all their clubs" ON clubs;
CREATE POLICY "State association admins can view all their clubs"
ON clubs FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_state_associations usa
    WHERE usa.state_association_id = clubs.state_association_id
    AND usa.user_id = auth.uid()
  )
  OR is_platform_super_admin()
);

-- 2. Fix club_admin_assignments policy: replace auth.users subquery with super admin function
DROP POLICY IF EXISTS "Superadmin full access to club admin assignments" ON club_admin_assignments;
CREATE POLICY "Superadmin full access to club admin assignments"
ON club_admin_assignments FOR ALL
TO authenticated
USING (is_platform_super_admin());

-- 3. Fix marketing_preferences policy: replace auth.users email lookup with JWT claim
DROP POLICY IF EXISTS "View own preferences" ON marketing_preferences;
CREATE POLICY "View own preferences"
ON marketing_preferences FOR SELECT
TO public
USING (
  email = (auth.jwt() ->> 'email')
);

-- 4. Add missing SELECT policy on profiles for authenticated users
CREATE POLICY "Users can view own profile"
ON profiles FOR SELECT
TO authenticated
USING (id = auth.uid());
