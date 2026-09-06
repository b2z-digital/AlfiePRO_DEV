/*
# Drop duplicate policies that still reference user_metadata

Removes the older duplicate policies on `handicap_rulesets` that use the
insecure `auth.jwt() -> 'user_metadata'` check. The replacement policies
(using `is_super_admin_user()`) were created in the previous migration.

Affected:
- handicap_rulesets: "Club admins can insert rulesets", 
  "Club admins can update their rulesets", "Club admins can delete their rulesets"
*/

DROP POLICY IF EXISTS "Club admins can insert rulesets" ON public.handicap_rulesets;
DROP POLICY IF EXISTS "Club admins can update their rulesets" ON public.handicap_rulesets;
DROP POLICY IF EXISTS "Club admins can delete their rulesets" ON public.handicap_rulesets;
