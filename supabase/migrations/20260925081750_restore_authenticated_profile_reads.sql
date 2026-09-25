/*
# Restore authenticated cross-user profile reads

The profiles table needs authenticated users to read each other's profiles
for chat, team lists, meeting attendees, member avatars, article authors,
community features, and more. The security fix only needed to remove
unauthenticated (anon/public) access, not authenticated cross-user reads.

Drop the overly restrictive self-only policy and restore the original
authenticated-scoped policy.
*/

DROP POLICY IF EXISTS "Users can view own profile" ON profiles;

CREATE POLICY "Authenticated users can view all profiles"
ON profiles FOR SELECT
TO authenticated
USING (true);
