/*
# Restore SELECT grants for anon on clubs and users to fix app loading

## Problem
Revoking ALL grants from anon on clubs and users caused cascading failures:
- The connection health check queries clubs and gets 403 (grant denied, not RLS denied)
- PostgREST query planning for members/clubs references public.users internally
- This made the app think Supabase was unresponsive, causing a loading spinner loop

## Fix
Re-grant SELECT to anon on clubs and users. This is safe because:
- clubs: The "Public can view basic club info" USING(true) policy was already dropped, so anon gets 0 rows
- users: The "Public can view basic user info" USING(true) policy was already dropped, so anon gets 0 rows
- RLS is enabled on both tables, so the grant alone exposes nothing

Also re-grant SELECT on members and profiles for the same reason -- the permissive 
public policies are gone, so RLS blocks all anon reads. But the grants prevent 
PostgREST from returning 403 during policy evaluation of related tables.

## Security
- No data exposure: RLS policies still block all unauthenticated reads on these tables
- The dangerous USING(true) public policies remain dropped
- Only SELECT is re-granted, not INSERT/UPDATE/DELETE/TRUNCATE
*/

GRANT SELECT ON clubs TO anon;
GRANT SELECT ON users TO anon;
GRANT SELECT ON members TO anon;
GRANT SELECT ON profiles TO anon;
GRANT SELECT ON member_boats TO anon;
GRANT SELECT ON event_invitations TO anon;
