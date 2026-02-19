/*
  # Force PostgREST Schema Cache Reload

  1. Changes
    - Add a comment to membership_applications table to force schema cache refresh
    - Add a comment to user_clubs table to force schema cache refresh
    - Add a comment to member_boats table to force schema cache refresh
    - Add a comment to membership_transactions table to force schema cache refresh
    - Notify PostgREST to reload schema

  2. Purpose
    - Fix 404 errors when accessing these tables via the REST API
    - Fix 400 errors on member_boats and membership_transactions queries
*/

COMMENT ON TABLE public.membership_applications IS 'Stores membership application submissions from users wanting to join clubs';
COMMENT ON TABLE public.user_clubs IS 'Maps users to clubs with their roles';
COMMENT ON TABLE public.member_boats IS 'Stores boats registered to club members';
COMMENT ON TABLE public.membership_transactions IS 'Records membership payment transactions';

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';