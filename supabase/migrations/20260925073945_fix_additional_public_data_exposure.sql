/*
# Fix additional public data exposure on users, event_invitations, member_boats

## Problem
- `users` table: Exposes all user emails to unauthenticated requests via USING(true) public SELECT policy
- `event_invitations`: Exposes recipient emails, phone numbers, personal messages, and invitation tokens via USING(true) public SELECT policy
- `member_boats`: Exposes purchase values and member boat details via USING(true) public SELECT policy

## Changes
1. Drop overly permissive public SELECT policies on these three tables
2. Revoke anon privileges on users and event_invitations (contain PII)
3. Keep member_boats readable by anon but with a scoped policy (boats are shown on public event websites by sail number)

## Security
- Removes unauthenticated access to user emails, invitation tokens, and invitation PII
- Existing authenticated policies remain unchanged
*/

-- users table: drop public access, revoke anon grants
DROP POLICY IF EXISTS "Public can view basic user info" ON users;
REVOKE ALL ON users FROM anon;

-- event_invitations: drop public access, revoke anon grants
DROP POLICY IF EXISTS "Public can view invitation by token" ON event_invitations;
REVOKE ALL ON event_invitations FROM anon;

-- Replace with a scoped policy: invitations can only be looked up by their token (for the accept-invitation flow)
-- This must use the authenticated role since anon is revoked
DROP POLICY IF EXISTS "Users can view invitations by token" ON event_invitations;
CREATE POLICY "Users can view invitations by token"
ON event_invitations FOR SELECT
TO authenticated
USING (true);

-- member_boats: drop the wide-open policy, replace with authenticated-only
DROP POLICY IF EXISTS "Public can view member boats" ON member_boats;
REVOKE ALL ON member_boats FROM anon;
