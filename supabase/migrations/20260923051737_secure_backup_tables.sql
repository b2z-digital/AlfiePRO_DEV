/*
# Secure backup tables and revoke unnecessary anon access

## Security Changes
1. Revoke all privileges from anon and authenticated on backup tables
   - _backup_club_memberships_20260703 
   - _backup_members_20260703
   These are internal backup tables that should not be accessible through the API.

2. Revoke anon INSERT/UPDATE/DELETE on member_activation_tokens table
   (RLS is enabled with no policies, but grants still allow anon full CRUD)

## Important Notes
- RLS is already enabled on these tables (locks them down with no policies)
- Revoking grants provides defense-in-depth
*/

REVOKE ALL ON public._backup_club_memberships_20260703 FROM anon, authenticated;
REVOKE ALL ON public._backup_members_20260703 FROM anon, authenticated;

REVOKE INSERT, UPDATE, DELETE ON public.member_activation_tokens FROM anon;
