/*
# Simplify billable_people_join_dates

1. Functions
- Replace `billable_people_join_dates(uuid[], timestamptz)` with `billable_people_join_dates(uuid[])`.
  The join-date cutoff for each billing period is applied in Sydney local time by the
  billing generator, so the cutoff argument is no longer needed.

2. Security
- SECURITY INVOKER (row level security on `members` applies).
- EXECUTE revoked from PUBLIC/anon; granted to authenticated and service_role.
*/

DROP FUNCTION IF EXISTS public.billable_people_join_dates(uuid[], timestamptz);

CREATE OR REPLACE FUNCTION public.billable_people_join_dates(p_club_ids uuid[])
RETURNS TABLE(first_joined timestamptz)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT min(m.created_at)
  FROM members m
  WHERE m.club_id = ANY(p_club_ids)
    AND m.archived_at IS NULL
    AND m.cancelled_at IS NULL
    AND COALESCE(m.membership_status, 'active') IN ('active', 'expired')
    AND m.is_financial = true
    AND (m.renewal_date IS NULL OR m.renewal_date >= CURRENT_DATE)
  GROUP BY COALESCE('uid:' || m.user_id::text, 'email:' || lower(nullif(trim(m.email), '')), 'id:' || m.id::text);
$$;

REVOKE EXECUTE ON FUNCTION public.billable_people_join_dates(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billable_people_join_dates(uuid[]) TO authenticated, service_role;